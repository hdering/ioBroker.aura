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
// Four things are tested, all against a layout the real Dashboard renders:
//   1. every grid item carries its id, type and row count in the DOM, so the
//      walk finds the widgets at all;
//   2. a list that is too short for its rows reports scrolls:true and a content
//      height above the rendered one, and one with room to spare does not;
//   3. `autoBox` separates the cards that size themselves from the ones the grid
//      gives a height — it decides whether contentPx is a requirement or just
//      the box, and without it the server called every card with reserve wrong;
//   4. a card that draws nothing is still reported (px 0). It used to be dropped
//      here, and a group whose children hang on a stopped adapter then went
//      missing from the answer without a word.
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

// A group whose definition does not exist has no children to stack: the card
// sizes itself to content and that content is nothing. This is the shape the
// answer used to lose — the tab had it, the table did not.
const emptyGroup = {
    id: 'leer',
    type: 'group',
    title: '',
    datapoint: '',
    gridPos: { x: 0, y: 60, w: 20, h: 6 },
    options: { defId: 'gibtsnicht', showTitle: false },
};

await page.evaluate(
    ({ widgets, grid }) => {
        window.__auraShot.mock({ [widgets[0].options.entries[0].id]: 21.5 });
        window.__auraShot.showWidgets(widgets, { editMode: false, ...grid });
    },
    // „kurz“ has room for its four rows; „lang“ has twenty in the same box.
    { widgets: [list('kurz', 4, 12), list('lang', 20, 12), emptyGroup], grid: GRID },
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

check('a card the grid gives a height is not mistaken for one that sizes itself', () => {
    // contentPx of a fixed box with nothing scrolled away is the box, not a
    // requirement. autoBox is what tells the two apart, and on the desktop grid
    // every card gets its height from the grid.
    for (const id of ['kurz', 'lang', 'leer']) {
        const m = byId[id];
        if (!m) throw new Error(`${id} is missing from the measurement: ${JSON.stringify(measured)}`);
        if (m.autoBox) throw new Error(`${id}: grid box reported as content-sized`);
    }
});

// The rule that changed: the walk used to skip anything measuring 0 px, so a
// group whose children hang on a stopped adapter left no trace in the answer.
const zeroHeight = await page.evaluate(() => {
    const el = document.createElement('div');
    el.dataset.auraWidget = 'nullhoehe';
    el.dataset.auraWidgetType = 'group';
    el.dataset.auraWidgetRows = '6';
    document.body.appendChild(el);
    const found = window.__auraShot.rendered().find((m) => m.id === 'nullhoehe') ?? null;
    el.remove();
    return found;
});
check('a card with no height at all still gets an entry', () => {
    if (!zeroHeight) throw new Error('a 0 px card was dropped from the measurement');
    if (zeroHeight.px !== 0 || zeroHeight.contentPx !== 0)
        throw new Error(`expected 0 px, got ${JSON.stringify(zeroHeight)}`);
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

// Below the mobile breakpoint the stacking branch gives the content-sized types
// (group, mediaplayer, …) no height at all — there contentPx IS the requirement,
// and the server may compare it with the estimate in both directions.
await page.setViewportSize({ width: 420, height: 900 });
await page.waitForTimeout(600);
const mobile = Object.fromEntries((await page.evaluate(() => window.__auraShot.rendered())).map((m) => [m.id, m]));

check('a card that sizes itself to its content is marked as such', () => {
    if (!mobile.leer) throw new Error(`the group is missing on mobile: ${JSON.stringify(mobile)}`);
    if (!mobile.leer.autoBox) throw new Error('the stacked group should size itself to its content');
    if (mobile.kurz.autoBox) throw new Error('a list keeps its configured box in the stack');
});

await page.setViewportSize({ width: 1600, height: 1200 });
// Reported from use: a framed header with a subtitle at h=2 (font scale 1.3, padding
// 8) came back "nichts abgeschnitten" — its block is centred and spills into the
// padding on both sides without scrolling anything.
const header = (id, h, y) => ({
    id,
    type: 'header',
    title: 'Heizung',
    datapoint: '',
    layout: 'framed',
    gridPos: { x: 0, y, w: 20, h },
    options: { subtitle: 'Erdgeschoss, alle Räume' },
});
await page.evaluate(({ widgets, grid }) => window.__auraShot.showWidgets(widgets, { editMode: false, ...grid }), {
    widgets: [header('eng', 2, 0), header('weit', 4, 10)],
    grid: { ...GRID, fontScale: 1.3, widgetPadding: 8 },
});
await page.waitForTimeout(400);
const heads = Object.fromEntries((await page.evaluate(() => window.__auraShot.rendered())).map((m) => [m.id, m]));
check('content that spills into the padding is reported, though nothing scrolls', () => {
    const m = heads.eng;
    if (!m) throw new Error('not measured');
    if (m.scrolls) throw new Error(`a header does not scroll: ${JSON.stringify(m)}`);
    if (!(m.edgePx > 3 || m.cutPx > 3)) throw new Error(`overhang not detected: ${JSON.stringify(m)}`);
});
check('the same header with room has no overhang', () => {
    const m = heads.weit;
    if (!m) throw new Error('not measured');
    if (m.edgePx || m.cutPx) throw new Error(`false overhang: ${JSON.stringify(m)}`);
});

await browser.close();
console.log(failures ? `render-report: ${failures} check(s) failed` : 'render-report: all checks passed');
process.exit(failures ? 1 : 0);
