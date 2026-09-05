// Checks the measurement the frontend reports to the MCP server against the
// real DOM.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/render-report.mjs
//
// Why: aura_measure computes heights from a table measured once, and a session
// that laid out 28 lists found every number that mattered by reading the browser
// instead. The frontend now reports what it actually drew (rendered height,
// content height, "does it scroll") and aura_rendered hands that back — but a
// wrong measurement here would be worse than none, because it is the number that
// is supposed to settle the argument.
//
// Two things are tested, both against a layout the real Dashboard renders:
//   1. every grid item carries its id, type and row count in the DOM, so the
//      walk finds the widgets at all;
//   2. a list that is too short for its rows reports scrolls:true and a content
//      height above the rendered one, and one with room to spare does not.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const DP = 'demo.0.wert';

let failures = 0;
const check = (label, fn) => {
    try {
        fn();
        console.log(`  ✓ ${label}`);
    } catch (e) {
        failures++;
        console.log(`  ✗ ${label}\n    ${e.message}`);
    }
};

const list = (id, rows, h) => ({
    id,
    type: 'list',
    title: 'Messung',
    datapoint: '',
    gridPos: { x: 0, y: id === 'kurz' ? 0 : 30, w: 20, h },
    options: {
        entries: Array.from({ length: rows }, (_, i) => ({ id: DP, label: `Zeile ${i + 1}` })),
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(
    ({ widgets, grid }) => {
        window.__auraShot.mock({ [widgets[0].options.entries[0].id]: 21.5 });
        window.__auraShot.showWidgets(widgets, { editMode: false, ...grid });
    },
    // „kurz“ has room for its four rows; „lang“ has twenty in the same box.
    { widgets: [list('kurz', 4, 12), list('lang', 20, 12)], grid: GRID },
);
await page.waitForTimeout(400);

const markers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-aura-widget]')).map((el) => ({
        id: el.dataset.auraWidget,
        type: el.dataset.auraWidgetType,
        rows: el.dataset.auraWidgetRows,
    })),
);
check('every grid item carries id, type and row count in the DOM', () => {
    const byId = Object.fromEntries(markers.map((m) => [m.id, m]));
    if (!byId.kurz || !byId.lang) throw new Error(`markers missing: ${JSON.stringify(markers)}`);
    if (byId.lang.type !== 'list') throw new Error(`type not marked: ${byId.lang.type}`);
    if (byId.lang.rows !== '12') throw new Error(`rows not marked: ${byId.lang.rows}`);
});

const measured = await page.evaluate(() => window.__auraShot.rendered());
const byId = Object.fromEntries(measured.map((m) => [m.id, m]));

check('a list with room to spare reports no overflow', () => {
    const m = byId.kurz;
    if (!m) throw new Error('not measured');
    if (m.scrolls) throw new Error(`reported as scrolling: ${JSON.stringify(m)}`);
    if (m.contentPx !== m.px) throw new Error(`content height should equal rendered: ${JSON.stringify(m)}`);
});

check('a list that is too short reports the overflow and how much is missing', () => {
    const m = byId.lang;
    if (!m) throw new Error('not measured');
    if (!m.scrolls) throw new Error(`overflow not detected: ${JSON.stringify(m)}`);
    if (m.contentPx <= m.px) throw new Error(`content height not above rendered: ${JSON.stringify(m)}`);
});

check('the rendered height matches the grid arithmetic for the stored rows', () => {
    // h rows = h * rowHeight + (h - 1) * gap. This is the one number the server
    // computes without any measurement at all, so a mismatch here means the
    // report and aura_measure are talking about different boxes.
    const expected = 12 * GRID.gridRowHeight + 11 * GRID.gridGap;
    for (const id of ['kurz', 'lang']) {
        const px = byId[id].px;
        if (Math.abs(px - expected) > 2) throw new Error(`${id}: ${px} px, expected ${expected} px`);
    }
});

await browser.close();
console.log(failures ? `render-report: ${failures} check(s) failed` : 'render-report: all checks passed');
process.exit(failures ? 1 : 0);
