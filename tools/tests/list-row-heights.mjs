// Ties the measured row heights in public/ai/aura-widget-metrics.json back to the
// live DOM — and keeps two rows on the same datapoint from turning into ghosts.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-row-heights.mjs
//
// Why: aura_measure sized every list row the same, and a list of window contacts
// was reported as fitting with "44 px Luft" while it scrolled — a contact chip is
// taller than the value row the default was measured on. The metrics file now
// carries a surcharge per row display (counted.list.rowTypes, per layout), and
// this test checks those numbers against what the browser actually lays out. A
// stale number here is worse than none: it is a height a model will trust.
//
// Measured as a slope, exactly as the metrics harness does it: the content height
// of the row area for two and for eight rows, the difference divided by six. That
// is one render per point instead of a walk down the whole height.
//
// The last block is the regression for the ghost rows: rows used to be keyed by
// their datapoint id alone, so two rows on the same datapoint (or two separators,
// which carry no id) collided. React then kept nodes from the previous
// configuration — in the editor, every change to such a list left rows behind.
//
// Datapoint values are injected through the screenshot harness (__auraShot.mock)
// — no socket write, no real datapoint is touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const METRICS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-metrics.json'), 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));

/** The same probe grid the metrics harness uses, so the width matches atWidthPx. */
const GRID = { gridRowHeight: 2, gridSnapX: 20, gridGap: 0 };
const COLS = SCHEMA.widgets.list.defaultSize.w;
/** 2 px probe rows: the metrics resolution, and the tolerance here. */
const TOL = 2;

const DP = 'demo.value';
const DP_BOOL = 'demo.switch';
const DP_DIM = 'demo.dim';
const DP_TIME = 'demo.time';
const DP_STATE = 'demo.state';
const MOCK = {
    [DP]: { val: 21.5, unit: '°C' },
    [DP_BOOL]: true,
    [DP_DIM]: { val: 60, unit: '%' },
    [DP_TIME]: 1767225600000,
    [DP_STATE]: 1,
};
const PRESETS = [
    { value: 0, label: 'Aus' },
    { value: 50, label: 'Halb' },
    { value: 100, label: 'Voll' },
];
const STATES = [
    { value: 0, label: 'Zu' },
    { value: 1, label: 'Gekippt' },
    { value: 2, label: 'Offen' },
];

/** Must stay in step with ROW_TYPES in tools/schema/measure-widget-metrics.mjs. */
const ROW_TYPES = {
    switch: { dp: DP_BOOL },
    slider: { dp: DP_DIM },
    value: { dp: DP },
    time: { dp: DP_TIME },
    datepicker: { dp: DP_TIME },
    shutter: { dp: DP_DIM },
    stepper: { dp: DP_DIM },
    buttons: { dp: DP_DIM, entry: { presets: PRESETS } },
    momentary: { dp: DP_BOOL },
    states: { dp: DP_STATE, entry: { states: STATES } },
    contact: { dp: DP_BOOL },
    input: { dp: DP },
    select: { dp: DP_DIM, entry: { presets: PRESETS } },
};

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (name, got, want) => check(name, Math.abs(got - want) <= TOL, `gemessen ${got} px, erwartet ${want} px`);
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const entries = (n, dt) => {
    const rt = dt ? ROW_TYPES[dt] : null;
    return Array.from({ length: n }, (_, i) => ({
        id: rt?.dp ?? DP,
        label: `Gerät ${i + 1}`,
        ...(dt ? { displayType: dt, ...(rt.entry ?? {}) } : {}),
    }));
};

/** 800 px, so nothing scrolls and the row area shows its natural height. */
const widget = (opts, layout) => ({
    id: 'rh',
    type: 'list',
    title: 'Messung',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: COLS, h: 400 },
    options: opts,
    ...(layout && layout !== 'default' ? { layout } : {}),
});

async function show(cfg) {
    await page.evaluate(
        ({ cfg, grid, mock }) => {
            window.__auraShot.mock(mock);
            window.__auraShot.showWidgets([cfg], { editMode: false, ...grid });
        },
        { cfg, grid: GRID, mock: MOCK },
    );
    await page.waitForTimeout(200);
}

/**
 * Height the rows occupy — top of the first to the bottom of the last.
 *
 * Not `scrollHeight`: at 800 px nothing overflows, so the scroller reports its
 * own height and every slope came out zero. Measured on the row area at a height
 * where nothing is clipped, this is the row pitch the metrics call perItemPx.
 */
const contentPx = () =>
    page.evaluate(() => {
        const root = document.querySelector('.aura-widget-rh');
        const scroller = root?.querySelector('.aura-scroll');
        if (!scroller) return -1;
        const rows = [...scroller.children].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
        return rows.length ? rows[rows.length - 1].bottom - rows[0].top : -1;
    });

/** px per row, the slope between two and eight rows. */
async function slope(dt, layout) {
    await show(widget({ entries: entries(2, dt) }, layout));
    const two = await contentPx();
    await show(widget({ entries: entries(8, dt) }, layout));
    const eight = await contentPx();
    return Math.round(((eight - two) / 6) * 10) / 10;
}

// ── the measured row height is the one the browser lays out ──────────────────
for (const layout of ['default', 'card', 'compact']) {
    const shape = layout === 'default' ? METRICS.counted.list : METRICS.counted.list.variants[layout];
    const rowTypes = shape.rowTypes ?? {};
    check(`${layout}: the layout carries a row-display measurement`, Object.keys(rowTypes).length > 0);
    const plain = await slope(null, layout);
    // The default row of this layout: the number aura_measure starts from.
    near(`${layout}: the default row`, plain, shape.perItemPx);
    for (const dt of Object.keys(ROW_TYPES)) {
        const want = rowTypes[dt];
        if (!want) {
            check(`${layout}: ${dt} is measured`, false, 'kein Eintrag in rowTypes');
            continue;
        }
        near(`${layout}: ${dt} row`, await slope(dt, layout), shape.perItemPx + want.perItemPx);
    }
}

// ── the separator row ────────────────────────────────────────────────────────
// Reported from use: a separator was charged as a full content row while the
// footnote claimed separators were not counted at all. It is a row — a 17 px one.
// The first measurement of it was wrong too (a leading separator is dropped as an
// empty section, so the delta came out at −20.5 px instead of −16), which is why
// this checks the difference against the live DOM.
for (const layout of ['default', 'card', 'compact', 'minimal']) {
    const shape = layout === 'default' ? METRICS.counted.list : METRICS.counted.list.variants[layout];
    const want = shape.rowTypes?.divider;
    check(`${layout}: the layout carries a measured separator`, !!want);
    if (!want) continue;
    // Eight entries either way — one of them a separator, sitting between content
    // rows so it is not dropped.
    const plain = entries(8, null);
    const mixed = [...entries(3, null), { id: 'demo.sep', divider: true, label: 'Abschnitt' }, ...entries(4, null)];
    await show(widget({ entries: plain }, layout));
    const a = await contentPx();
    await show(widget({ entries: mixed }, layout));
    const b = await contentPx();
    near(`${layout}: the separator against the row it replaces`, Math.round((b - a) * 10) / 10, want.perItemPx);
}

// A contact row being taller than a value row is the whole finding — if these
// ever come out equal, the surcharge is measuring nothing.
check(
    'the contact chip really is the taller row',
    METRICS.counted.list.rowTypes.contact.perItemPx > 0,
    `+${METRICS.counted.list.rowTypes.contact.perItemPx} px`,
);

// ── two rows on the same datapoint stay two rows ─────────────────────────────
const rowsDrawn = () =>
    page.evaluate(() => {
        const root = document.querySelector('.aura-widget-rh');
        return (root?.textContent?.match(/Gerät \d+/g) ?? []).length;
    });

const same = (dt) => [
    { id: DP_BOOL, label: 'Gerät 1', displayType: dt },
    { id: DP_BOOL, label: 'Gerät 2', displayType: dt },
];
await show(widget({ entries: same('switch') }, 'default'));
eq('two rows on one datapoint are drawn once each', await rowsDrawn(), 2);
// The edit that produced the ghosts: same ids, a different display.
await show(widget({ entries: same('contact') }, 'default'));
eq('and stay two rows when the display changes', await rowsDrawn(), 2);
await show(
    widget({ entries: [...same('contact'), { id: DP_BOOL, label: 'Gerät 3', displayType: 'value' }] }, 'default'),
);
eq('and follow the configuration when one is added', await rowsDrawn(), 3);
// Separators carry no id of their own, so two of them used to collide as well.
await show(
    widget(
        {
            entries: [
                { id: 'demo.a', label: 'Gerät 1' },
                { divider: true, id: '' },
                { id: 'demo.b', label: 'Gerät 2' },
                { divider: true, id: '' },
                { id: 'demo.c', label: 'Gerät 3' },
            ],
        },
        'default',
    ),
);
eq('two separators do not swallow a row', await rowsDrawn(), 3);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
