#!/usr/bin/env node
/**
 * Measures how much height a widget's content actually needs.
 *
 *   node tools/schema/measure-widget-metrics.mjs            (dev server on 5174)
 *   AURA_BASE=http://localhost:5174 node tools/schema/measure-widget-metrics.mjs
 *   … --only list,value    measure a few types while working on the table
 *   … --check              fail when the committed JSON is stale
 *
 * Output: public/ai/aura-widget-metrics.json, served to a model by aura_measure.
 *
 * Why measure rather than estimate: sizing a widget is the one thing a model
 * cannot check for itself. It writes gridPos.h in rows, the browser renders px,
 * and the result — a list cut off after nine of sixteen rows, a gauge squeezed
 * into an ellipse — is invisible in the JSON. Doing the arithmetic by hand
 * ("h*20 + (h-1)*8 — do sixteen rows fit in h=14?") is exactly what goes wrong.
 *
 * How: the real app renders the widget through the __auraShot harness on a grid
 * with 2 px rows (and normal 20 px columns, so the width stays realistic), and
 * the height is walked down until the content no longer fits. "Fits" means two
 * things at once — nothing scrolls inside the widget, and nothing is drawn
 * outside its card. The second is what catches the tiles: they do not scroll,
 * they simply spill over the edge.
 *
 * The walk goes DOWNWARD from a height that fits, never as a binary search: a
 * chart at 30 px renders no axis at all and would report "fits", and a search
 * would happily return that.
 *
 * Everything runs against injected demo state with screenshotMode on, so no
 * ioBroker state is ever written.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_FILE = path.join(ROOT, 'public/ai/aura-widget-metrics.json');
const SCHEMA_FILE = path.join(ROOT, 'public/ai/aura-widget-schema.json');

/** 2 px rows for resolution, 20 px columns so the width is a real widget width. */
const PROBE_GRID = { gridRowHeight: 2, gridSnapX: 20, gridGap: 0 };
const PX_PER_ROW = PROBE_GRID.gridRowHeight;
/** 800 px: taller than any widget on a dashboard, the starting point that fits. */
const TOP_ROWS = 400;
const COARSE = 10; // 20 px steps on the way down
const WID = 'm';
const TOL = 2; // px — sub-pixel layout noise and 1px borders

const DP = 'demo.value';
const DP_BOOL = 'demo.switch';
const DP_DIM = 'demo.dim';
const DP_JSON = 'demo.json';

const MOCK = {
    [DP]: { val: 21.5, unit: '°C' },
    [DP_BOOL]: true,
    [DP_DIM]: { val: 60, unit: '%' },
};

const listEntries = (n) => Array.from({ length: n }, (_, i) => ({ id: DP, name: `Gerät ${i + 1}`, display: 'value' }));
const chipItems = (n) => Array.from({ length: n }, (_, i) => ({ id: DP_BOOL, label: `Chip ${i + 1}` }));
const jsonRows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ Name: `Zeile ${i + 1}`, Wert: i })));

/**
 * Types whose content is countable from the configuration, so the height can be
 * given as base + per item. Everything else gets a minimum height only — a
 * status overview or a calendar discovers its content at runtime and cannot be
 * sized from here.
 */
const COUNTED = [
    { type: 'list', item: 'Zeile', counts: [2, 4, 8, 16], build: (n) => ({ options: { entries: listEntries(n) } }) },
    {
        type: 'jsontable',
        item: 'Tabellenzeile',
        counts: [2, 4, 8],
        datapoint: DP_JSON,
        mock: (n) => ({ [DP_JSON]: jsonRows(n) }),
        build: () => ({ options: {} }),
    },
];

/** Datapoint per type where the default demo value would not do. */
const DP_FOR = {
    switch: DP_BOOL,
    dimmer: DP_DIM,
    slider: DP_DIM,
    knob: DP_DIM,
    thermostat: DP_DIM,
    shutter: DP_DIM,
    light: DP_DIM,
    binarysensor: DP_BOOL,
    windowcontact: DP_BOOL,
    stateimage: DP_BOOL,
    jsontable: DP_JSON,
};

/** Options a type needs before it renders anything at all. */
const OPTIONS_FOR = {
    enum: { entries: [{ value: 1, label: 'Eins' }] },
    list: { entries: listEntries(4) },
    chips: { items: chipItems(4) },
};

/**
 * Types that cannot be sized this way, with the reason kept in the output so the
 * next person does not go looking for the number again.
 */
const SKIP = {
    iframe: 'zeigt eine fremde Seite — die Höhe bestimmt der Inhalt, nicht das Widget',
    camera: 'Videostream, Seitenverhältnis der Kamera',
    image: 'Höhe folgt dem Bild',
    map: 'Karte füllt jede Höhe',
    group: 'Höhe ergibt sich aus den Kindern (groupRows)',
    panels: 'Höhe ergibt sich aus den Kindern',
    universal: 'Höhe ergibt sich aus den Kindern',
    mirror: 'spiegelt ein anderes Widget',
    autolist: 'Zeilen entstehen erst zur Laufzeit aus Raum und Gewerk — wie list rechnen',
    statusoverview: 'Zeilen entstehen erst zur Laufzeit',
    calendar: 'Zeilen entstehen erst zur Laufzeit aus den Terminen',
    messages: 'Zeilen entstehen erst zur Laufzeit',
    adapterlogs: 'Zeilen entstehen erst zur Laufzeit',
    scriptstatus: 'Zeilen entstehen erst zur Laufzeit',
    trash: 'Zeilen entstehen erst zur Laufzeit',
    trashSchedule: 'Zeilen entstehen erst zur Laufzeit',
    evcc: 'Inhalt kommt aus einer evcc-Instanz',
    weather: 'Inhalt kommt aus einer Wetter-Instanz',
    echartsPreset: 'rendert ein gespeichertes eCharts-Preset',
    timer: 'Zeilen entstehen erst zur Laufzeit',
    alarm: 'Zeilen entstehen erst zur Laufzeit',
    aircontrol: 'Inhalt folgt den Datenpunkten der Klimaanlage',
    mediaplayer: 'Inhalt folgt den Datenpunkten des Players',
    loadtimes: 'Zeilen entstehen erst zur Laufzeit',
    carousel: 'Inhalt sind andere Widgets',
    menu: 'Höhe folgt den Menüeinträgen des Dashboards',
    html: 'freies HTML',
    energiebilanz: 'Höhe folgt der Konfiguration — Balken oder Ringe, Einträge, Legende',
    adapterstatus: 'Zeilen entstehen erst zur Laufzeit',
};

/**
 * Does the content fit in the card?
 *
 * Two questions in one: does anything scroll (a list with a scrollbar), and does
 * anything reach past the card's own box (a tile whose number spills over the
 * edge — it does not scroll, it just sticks out, which is why an overflow check
 * alone reported that a gauge fits in 20 px).
 */
const FITS = (id) => {
    const root = document.querySelector(`.aura-widget-${id}`);
    if (!root) {
        return { error: 'not rendered' };
    }
    const rb = root.getBoundingClientRect();
    let out = 0;
    let scroll = 0;
    for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.height) {
            out = Math.max(out, b.bottom - rb.bottom, rb.top - b.top);
        }
        if (getComputedStyle(el).overflowY !== 'visible') {
            scroll = Math.max(scroll, el.scrollHeight - el.clientHeight);
        }
    }
    return { over: Math.round(Math.max(out, scroll)), height: Math.round(rb.height) };
};

const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg
    ? new Set((onlyArg.split('=')[1] || process.argv[process.argv.indexOf(onlyArg) + 1] || '').split(','))
    : null;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

async function render(type, { rows, cols, datapoint, options, mock }) {
    const cfg = {
        id: WID,
        type,
        title: 'Messung',
        datapoint: datapoint ?? DP_FOR[type] ?? (schema.widgets[type].addMode === 'free' ? '' : DP),
        gridPos: { x: 0, y: 0, w: cols, h: rows },
        options: options ?? OPTIONS_FOR[type] ?? {},
    };
    await page.evaluate(
        ({ cfg, grid, mock }) => {
            window.__auraShot.mock(mock);
            window.__auraShot.showWidgets([cfg], { editMode: false, ...grid });
        },
        { cfg, grid: PROBE_GRID, mock: { ...MOCK, ...(mock || {}) } },
    );
    // Two identical readings instead of a guessed timeout: fonts, charts and the
    // grid settle over a frame or two.
    let last = null;
    let prev = '';
    for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(60);
        last = await page.evaluate(FITS, WID);
        const key = JSON.stringify(last);
        if (key === prev) {
            break;
        }
        prev = key;
    }
    return last;
}

/** Walk down from a height that fits and return the last one that still does. */
async function requiredPx(type, setup) {
    const top = await render(type, { ...setup, rows: TOP_ROWS });
    if (top.error) {
        return { error: top.error };
    }
    if (top.over > TOL) {
        return { error: `passt selbst in ${TOP_ROWS * PX_PER_ROW} px nicht (${top.over} px darüber)` };
    }
    let good = TOP_ROWS;
    let rows = TOP_ROWS - COARSE;
    while (rows >= 1) {
        const m = await render(type, { ...setup, rows });
        if (m.error || m.over > TOL) {
            break;
        }
        good = rows;
        rows -= COARSE;
    }
    // Refine the last coarse step one row at a time.
    for (let r = good - 1; r >= 1 && r > good - COARSE; r--) {
        const m = await render(type, { ...setup, rows: r });
        if (m.error || m.over > TOL) {
            break;
        }
        good = r;
    }
    return { px: good * PX_PER_ROW };
}

const wanted = (type) => !only || only.has(type);
const results = {};
const counted = {};

for (const spec of COUNTED) {
    if (!wanted(spec.type)) {
        continue;
    }
    const cols = schema.widgets[spec.type].defaultSize.w;
    const points = [];
    let failed = null;
    for (const n of spec.counts) {
        const r = await requiredPx(spec.type, {
            cols,
            datapoint: spec.datapoint,
            ...spec.build(n),
            mock: spec.mock ? spec.mock(n) : undefined,
        });
        if (r.error) {
            failed = r.error;
            break;
        }
        points.push({ n, px: r.px });
    }
    if (failed) {
        console.warn(`skip ${spec.type} (gezählt): ${failed}`);
        continue;
    }
    const first = points[0];
    const last = points[points.length - 1];
    const perItem = (last.px - first.px) / (last.n - first.n);
    counted[spec.type] = {
        item: spec.item,
        basePx: Math.round(first.px - perItem * first.n),
        perItemPx: Math.round(perItem * 10) / 10,
        atWidthPx: cols * PROBE_GRID.gridSnapX,
        measured: points,
    };
    console.log(
        `${spec.type.padEnd(16)} ${points.map((p) => `${p.n}→${p.px}px`).join('  ')}   → ` +
            `${counted[spec.type].basePx} px + ${counted[spec.type].perItemPx} px/${spec.item}`,
    );
}

for (const type of Object.keys(schema.widgets)) {
    if (!wanted(type) || SKIP[type]) {
        continue;
    }
    const cols = schema.widgets[type].defaultSize.w;
    const r = await requiredPx(type, { cols });
    if (r.error) {
        console.warn(`skip ${type}: ${r.error}`);
        continue;
    }
    const rowsAt20 = Math.ceil((r.px + 10) / 30); // rows at the default grid (20 px + 10 px gap)
    results[type] = { minPx: r.px, minRowsDefaultGrid: rowsAt20, atWidthPx: cols * PROBE_GRID.gridSnapX };
    console.log(`${type.padEnd(16)} min ${String(r.px).padStart(4)} px  (${rowsAt20} Zeilen im Standardraster)`);
}

await browser.close();

if (pageErrors.length) {
    console.warn(`Seitenfehler: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
}

const metrics = {
    $meta: {
        name: 'AURA widget height metrics',
        generator: 'tools/schema/measure-widget-metrics.mjs',
        measured: new Date().toISOString().slice(0, 10),
        method:
            `Measured in the real frontend: the height is walked down until the content either scrolls or ` +
            `reaches past the card. ${PX_PER_ROW} px resolution, each type at its default width.`,
        caveats: [
            'Height only. A too-narrow widget truncates its labels instead of spilling and is not covered.',
            'Default options, one line of title. A filter row, a statistics line or a second title line add to it.',
            'A minimum is the point where content starts to be lost, not a recommended size — defaultSize is that.',
        ],
    },
    grid: { note: 'rows × rowHeight + (rows − 1) × gap = px. Row height and gap come from aura_dashboard.' },
    counted,
    minimum: results,
    notMeasurable: Object.fromEntries(Object.entries(SKIP).filter(([type]) => wanted(type))),
};

const json = `${JSON.stringify(metrics, null, 2)}\n`;
if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    const strip = (s) => s.replace(/"measured": "\d{4}-\d\d-\d\d",?/g, '');
    if (strip(current) !== strip(json)) {
        console.error('aura-widget-metrics.json is stale — run: npm run metrics');
        process.exit(1);
    }
    console.log('aura-widget-metrics.json is up to date.');
} else if (only) {
    console.log('--only: nothing written, this is a working run.');
} else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, json);
    console.log(
        `${path.relative(ROOT, OUT_FILE).replace(/\\/g, '/')}: ${Object.keys(results).length} Mindesthöhen, ` +
            `${Object.keys(counted).length} gezählte Typen`,
    );
}
