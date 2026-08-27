// Verifies the dynamic list's list-wide row icon against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/autolist-icon.mjs
//
// The rows of a dynamic list come from a filter, so the icon is configured once for
// the whole list (options.entryIcon / entryIconSize, editor tab "Icon"). Checked here
// in every layout that draws a row icon: the default applies to each row, an entry's
// own icon still wins, and a condition rule beats both. The colour (entryIconColor)
// has no per-entry step, so there the rule beats the list-wide value directly.
//
// Datapoint values are injected into the in-memory cache via the screenshot harness
// (__auraShot.mock) — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const clause = (datapoint, operator, value = '') => ({ datapoint, operator, value });
const rule = (id, target, clauses, effects) => ({ id, logic: 'AND', target, clauses, ...effects });

// Distinct sizes so a rendered width names its source: 19 = list-wide default,
// 24 = the third entry's own icon, 28 = the condition rule.
const GLOBAL_SIZE = 19;
const OWN_SIZE = 24;
const RULE_SIZE = 28;
const GLOBAL_COLOR = '#0000ff';
const RULE_COLOR = '#ff0000';

const listFor = (layout, y) => ({
    id: `ai-${layout}`,
    type: 'autolist',
    layout: layout === 'default' ? undefined : layout,
    title: layout,
    datapoint: '',
    gridPos: { x: 0, y, w: 14, h: 7 },
    options: {
        entries: [
            { id: 'demo.dev1.STATE', label: 'Eins' },
            { id: 'demo.dev2.STATE', label: 'Zwei' },
            // Its own icon — the list-wide default must not touch this row.
            { id: 'demo.dev3.STATE', label: 'Drei', icon: 'CloudOff', iconSize: OWN_SIZE },
        ],
        entryIcon: 'Lightbulb',
        entryIconSize: GLOBAL_SIZE,
        entryIconColor: GLOBAL_COLOR,
        rowConditions: [
            rule('unreach', 'icon', [clause('{{parent}}.UNREACH', 'true')], {
                icon: 'CloudOff',
                iconColor: RULE_COLOR,
                iconSize: RULE_SIZE,
            }),
        ],
        syncIntervalMin: 999,
        showTitle: false,
        hideFilterButton: true,
        showDividers: false,
    },
});

const LAYOUTS = ['default', 'card', 'compact', 'minimal'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(600);
// The list reads its entries through getState/subscribe, so the server-state mock has
// to answer as well — the cache alone only serves the widgets that read it.
const mock = (map) =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, map);

/** Rendered box width of every icon in the widget. */
const iconWidths = (widget) =>
    page.evaluate(
        (w) =>
            [...document.querySelectorAll(`.aura-widget-${w} svg`)].map((s) =>
                Math.round(s.getBoundingClientRect().width),
            ),
        widget,
    );

const iconColors = (widget) =>
    page.evaluate(
        (w) => [...document.querySelectorAll(`.aura-widget-${w} svg`)].map((s) => getComputedStyle(s).color),
        widget,
    );

/** Iconify fetches its icon sets, so a row icon appears a moment after the row. */
const iconsReady = (widget, min) =>
    page
        .waitForFunction(([w, n]) => document.querySelectorAll(`.aura-widget-${w} svg`).length >= n, [widget, min], {
            timeout: 10000,
        })
        .catch(() => {});

await mock({
    'demo.dev1.STATE': true,
    'demo.dev2.STATE': false,
    'demo.dev3.STATE': true,
    'demo.dev1.UNREACH': false,
    'demo.dev2.UNREACH': false,
    'demo.dev3.UNREACH': false,
});

await page.evaluate(
    (ws) => window.__auraShot.showWidgets(ws),
    LAYOUTS.map((l, i) => listFor(l, i * 8)),
);
await settle();
await settle();

// ── the list-wide icon reaches every row ─────────────────────────────────────
for (const layout of LAYOUTS) {
    const w = `ai-${layout}`;
    await iconsReady(w, 3);
    const widths = await iconWidths(w);
    check(
        `${layout}: the list-wide icon is on both rows without one of their own`,
        widths.filter((x) => x === GLOBAL_SIZE).length === 2,
        widths.join(' '),
    );
    check(
        `${layout}: the entry's own icon keeps its size`,
        widths.filter((x) => x === OWN_SIZE).length === 1,
        widths.join(' '),
    );
    const colors = await iconColors(w);
    // Every row icon — the entry's own one included, the colour has no per-entry step.
    check(
        `${layout}: the list-wide colour paints every row icon`,
        colors.filter((c) => c === 'rgb(0, 0, 255)').length === 3,
        colors.join(' '),
    );
}

// ── a rule beats the list-wide icon ──────────────────────────────────────────
await mock({ 'demo.dev1.UNREACH': true });
await settle();
for (const layout of LAYOUTS) {
    const w = `ai-${layout}`;
    const widths = await iconWidths(w);
    check(
        `${layout}: a condition rule beats the list-wide icon on the matching row`,
        widths.filter((x) => x === RULE_SIZE).length === 1 && widths.filter((x) => x === GLOBAL_SIZE).length === 1,
        widths.join(' '),
    );
    const colors = await iconColors(w);
    check(
        `${layout}: and recolours exactly that icon`,
        colors.filter((c) => c === 'rgb(255, 0, 0)').length === 1 &&
            colors.filter((c) => c === 'rgb(0, 0, 255)').length === 2,
        colors.join(' '),
    );
}

// ── a rule also beats an entry's own icon ────────────────────────────────────
await mock({ 'demo.dev1.UNREACH': false, 'demo.dev3.UNREACH': true });
await settle();
for (const layout of LAYOUTS) {
    const w = `ai-${layout}`;
    const widths = await iconWidths(w);
    check(
        `${layout}: a rule beats the entry's own icon too`,
        widths.filter((x) => x === RULE_SIZE).length === 1 && !widths.includes(OWN_SIZE),
        widths.join(' '),
    );
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
