// Custom grid editor: per-row height as a ratio or 'auto' (issue #737).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-row-sizes.mjs
//
// Sets row 2 of a 1×3 grid to 0.25 in the editor, checks the stored rowSizes and that the
// rendered rows really keep the 1 : 0.25 : 1 ratio — also when the thin row holds text.
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
await page.evaluate(() => window.__auraShot.captureWrites(true));

const t = (text) => ({ type: 'text', text });
await page.evaluate(
    ([cells]) => {
        window.__auraShot.showWidgets(
            [
                {
                    id: 'grs1',
                    type: 'universal',
                    title: 'Raster',
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 20, h: 12 },
                    options: { customGrid: { cols: 1, rows: 3, cells } },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [[t('oben'), t('Trenner'), t('unten')]],
);
await page.waitForSelector('.aura-widget-grs1', { timeout: 15000 });
await page.waitForTimeout(300);

const rowHeights = () =>
    page.evaluate(() => {
        const g = document.querySelector('.aura-widget-grs1 .aura-custom-grid');
        return getComputedStyle(g)
            .gridTemplateRows.split(' ')
            .map((s) => parseFloat(s));
    });

let h = await rowHeights();
check('default rows are equal', Math.abs(h[0] - h[1]) < 1 && Math.abs(h[1] - h[2]) < 1, h.join(' / '));

await page.locator('.aura-widget-grs1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });

const grid = () => page.evaluate(() => window.__auraShot.widgetOptions('grs1')?.customGrid);
check(
    'editor offers one height field per row, left of the row',
    (await dlg.locator('input[title$=": Höhe (Verhältnis)"]').count()) === 3,
);

{
    const inp = await dlg.locator('input[title="Zeile 2: Höhe (Verhältnis)"]').boundingBox();
    const c21 = await dlg.locator('button:has(> span:text-is("2/1"))').boundingBox();
    const midIn = inp.y + inp.height / 2;
    check(
        'row 2 field sits left of cell 2/1, within its height',
        inp.x + inp.width <= c21.x && midIn >= c21.y - 4 && midIn <= c21.y + c21.height + 4,
        JSON.stringify({ inp, c21 }),
    );
}
await dlg.locator('input[title="Zeile 2: Höhe (Verhältnis)"]').fill('0.25');
await page.waitForTimeout(300);
let g = await grid();
check('rowSizes stored', JSON.stringify(g?.rowSizes) === '["1fr","0.25fr","1fr"]', JSON.stringify(g?.rowSizes));

h = await rowHeights();
const ratio = h[1] / h[0];
check(
    'thin row keeps the 0.25 ratio despite its text',
    Math.abs(ratio - 0.25) < 0.03,
    `${h.join(' / ')} → ${ratio.toFixed(3)}`,
);
check('outer rows stay equal', Math.abs(h[0] - h[2]) < 1, h.join(' / '));

await dlg.locator('button[title="Zeile 3: Höhe = Inhalt"]').click();
await page.waitForTimeout(300);
g = await grid();
check('auto toggles the row to auto', g?.rowSizes?.[2] === 'auto', JSON.stringify(g?.rowSizes));
h = await rowHeights();
check('auto row is smaller than the ratio row', h[2] < h[0], h.join(' / '));

await dlg.locator('button[title="Zeile 3: Höhe = Inhalt"]').click();
await dlg.locator('input[title="Zeile 2: Höhe (Verhältnis)"]').fill('1');
await page.waitForTimeout(300);
g = await grid();
check('all-equal ratios drop rowSizes again', g?.rowSizes === undefined, JSON.stringify(g?.rowSizes));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-row-sizes: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
