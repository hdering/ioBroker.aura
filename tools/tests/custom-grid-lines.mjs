// Custom grid: optional vertical/horizontal separator lines between the cells (issue #793).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-lines.mjs
//
// Toggles both line kinds in the editor, checks the stored flags, that the lines sit in the
// gaps between the cells and that no line runs through a cell spanning two columns.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
// The edit dialog folds every section; this test fills in settings, so open them all.
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(() => window.__auraShot.captureWrites(true));

const t = (text, extra = {}) => ({ type: 'text', text, ...extra });
// 3×2: top row is one cell spanning all three columns, bottom row three cells.
await page.evaluate(
    ([cells]) => {
        window.__auraShot.showWidgets(
            [
                {
                    id: 'gl1',
                    type: 'universal',
                    title: 'Raster',
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 20, h: 10 },
                    options: { customGrid: { cols: 3, rows: 2, cells } },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [[t('oben', { colSpan: 3 }), { type: 'empty' }, { type: 'empty' }, t('a'), t('b'), t('c')]],
);
await page.waitForSelector('.aura-widget-gl1', { timeout: 15000 });
await page.waitForTimeout(300);

const lineCount = () => page.locator('.aura-widget-gl1 .aura-custom-grid-line').count();
check('no lines by default', (await lineCount()) === 0);

await page.locator('.aura-widget-gl1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
const box = dlg.locator('[data-aura-grid-lines]');
const grid = () => page.evaluate(() => window.__auraShot.widgetOptions('gl1')?.customGrid);

await box.locator('label:has-text("Senkrechte Linien") input').check();
await page.waitForTimeout(300);
let g = await grid();
check('vLines stored', g?.vLines === true && g?.hLines === undefined, JSON.stringify({ v: g?.vLines, h: g?.hLines }));

const segs = () =>
    page.evaluate(() => {
        const root = document.querySelector('.aura-widget-gl1 .aura-custom-grid');
        const r0 = root.getBoundingClientRect();
        return [...root.querySelectorAll('.aura-custom-grid-line > span')].map((s) => {
            const r = s.getBoundingClientRect();
            return { x: r.x - r0.x, y: r.y - r0.y, w: r.width, h: r.height };
        });
    });
const cellBoxes = () =>
    page.evaluate(() => {
        const root = document.querySelector('.aura-widget-gl1 .aura-custom-grid');
        const r0 = root.getBoundingClientRect();
        return [...root.children]
            .filter((el) => !el.classList.contains('aura-custom-grid-line'))
            .map((el) => {
                const r = el.getBoundingClientRect();
                return { x: r.x - r0.x, y: r.y - r0.y, w: r.width, h: r.height, text: el.textContent };
            });
    });

let s = await segs();
const cb = await cellBoxes();
const a = cb.find((c) => c.text === 'a');
const b = cb.find((c) => c.text === 'b');
const top = cb.find((c) => c.text === 'oben');
check('two vertical segments (bottom row only)', s.length === 2 && s.every((x) => x.w === 1), JSON.stringify(s));
const v1 = s.sort((p, q) => p.x - q.x)[0];
check(
    'vertical line sits in the gap between a and b',
    v1 && v1.x >= a.x + a.w - 0.5 && v1.x + v1.w <= b.x + 0.5,
    JSON.stringify({ v1, aRight: a.x + a.w, bLeft: b.x }),
);
check(
    'no vertical line through the spanning top cell',
    s.every((x) => x.y >= top.y + top.h - 0.5),
    JSON.stringify(s),
);

await box.locator('label:has-text("Waagerechte Linien") input').check();
await page.waitForTimeout(300);
g = await grid();
check('hLines stored', g?.hLines === true, JSON.stringify(g?.hLines));
s = await segs();
const hs = s.filter((x) => x.h === 1 && x.w > 1);
check('three horizontal segments between the rows', hs.length === 3, JSON.stringify(hs));
const span = hs.length ? Math.max(...hs.map((x) => x.x + x.w)) - Math.min(...hs.map((x) => x.x)) : 0;
check('horizontal line runs the full width', Math.abs(span - (top.x + top.w - top.x)) < 1.5, `${span} vs ${top.w}`);

// Thickness: 4 px lines widen the gaps to 4 px and never overlap a cell.
await box.locator('input[aria-label="Linienstärke in px"]').fill('4');
await page.waitForTimeout(300);
g = await grid();
check('lineWidth stored', g?.lineWidth === 4, JSON.stringify(g?.lineWidth));
{
    const gaps = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.aura-widget-gl1 .aura-custom-grid'));
        return [cs.columnGap, cs.rowGap];
    });
    check('gaps widen to the line width', gaps[0] === '4px' && gaps[1] === '4px', gaps.join(' / '));
    const s4 = await segs();
    const cb4 = await cellBoxes();
    const a4 = cb4.find((c) => c.text === 'a');
    const b4 = cb4.find((c) => c.text === 'b');
    const vs = s4.filter((x) => x.w === 4 && x.h > 4).sort((p, q) => p.x - q.x);
    const hs4 = s4.filter((x) => x.h === 4 && x.w > 4);
    check('segments are 4 px thick', vs.length === 2 && hs4.length === 3, JSON.stringify(s4));
    check(
        'thick vertical line fills the gap without covering a or b',
        vs[0] && vs[0].x >= a4.x + a4.w - 0.5 && vs[0].x + vs[0].w <= b4.x + 0.5,
        JSON.stringify({ v: vs[0], aRight: a4.x + a4.w, bLeft: b4.x }),
    );
}
await box.locator('input[aria-label="Linienstärke in px"]').fill('1');
await page.waitForTimeout(300);
g = await grid();
check('width 1 drops lineWidth again', g?.lineWidth === undefined, JSON.stringify(g?.lineWidth));

await box.locator('label:has-text("Senkrechte Linien") input').uncheck();
await box.locator('label:has-text("Waagerechte Linien") input').uncheck();
await page.waitForTimeout(300);
g = await grid();
check('unchecking drops the flags', g?.vLines === undefined && g?.hLines === undefined, JSON.stringify(g));
check('lines gone again', (await lineCount()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-lines: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
