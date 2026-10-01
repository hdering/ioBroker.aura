// Per-cell background of the custom grid (issue #732).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/cell-background.mjs
//
// 'cell' paints the whole grid cell, 'content' only a label behind the text, a
// matched condition's bg replaces the static one in the same place, and a control
// cell ignores 'content' (it has no text label to hug) and fills the cell.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT = process.env.AURA_SHOT_OUT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const BG = 'rgba(0, 0, 0, 0.5)';
const RED = 'rgb(255, 0, 0)';
const always = [{ id: 'r1', clauses: [{ datapoint: '', operator: '!=', value: '__never__' }], bg: RED }];
const cells = [
    { type: 'text', text: 'Ganze Zelle', bg: '#00000080' },
    { type: 'text', text: 'Pool 25.5°C', bg: '#00000080', bgMode: 'content' },
    { type: 'text', text: 'Bedingung', bg: '#00000080', bgMode: 'content', conditions: always },
    { type: 'button', text: 'Knopf', dpId: '0_userdata.0.aura_test_732', bg: '#00000080', bgMode: 'content' },
    { type: 'text', text: 'Ohne' },
    { type: 'empty' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));
await page.evaluate(
    (c) =>
        window.__auraShot.showWidgets([
            {
                id: 'cbg1',
                type: 'universal',
                title: 'Hintergrund',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 24, h: 10 },
                options: { customGrid: { cols: 3, rows: 2, cells: c } },
            },
        ]),
    cells,
);
await page.waitForSelector('.aura-widget-cbg1', { timeout: 15000 });
await page.waitForTimeout(400);

const probe = (i) =>
    page.evaluate((i) => {
        const cell = document.querySelector(`.aura-widget-cbg1 .aura-custom-cell-${i}`);
        if (!cell) return null;
        const inner = cell.querySelector('span');
        const cs = (e) => (e ? getComputedStyle(e).backgroundColor : null);
        const w = (e) => (e ? e.getBoundingClientRect().width : 0);
        return { cell: cs(cell), inner: cs(inner), cellW: w(cell), innerW: w(inner) };
    }, i);

const none = 'rgba(0, 0, 0, 0)';
const c0 = await probe(0);
check("'cell' paints the grid cell", c0?.cell === BG && c0?.inner === none, JSON.stringify(c0));
const c1 = await probe(1);
check(
    "'content' paints only the label",
    c1?.cell === none && c1?.inner === BG && c1.innerW < c1.cellW - 10,
    JSON.stringify(c1),
);
const c2 = await probe(2);
check('condition bg replaces the static bg on the label', c2?.cell === none && c2?.inner === RED, JSON.stringify(c2));
const c3 = await probe(3);
check("control cell ignores 'content' and fills the cell", c3?.cell === BG, JSON.stringify(c3));
const c4 = await probe(4);
check('cell without bg stays transparent', c4?.cell === none && c4?.inner === none, JSON.stringify(c4));

if (SHOT) await page.locator('.aura-widget-cbg1').screenshot({ path: SHOT });
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
