// Custom grid editor: insert / delete a row or column at the right-clicked cell (issue #717).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-edit-ui.mjs
//
// The shifting itself is covered by tools/tests/custom-grid-edit.mjs; this checks the
// wiring: the context menu entries, the stored grid, the moved selection and the
// confirmation before a row with content is deleted.
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
                    id: 'cge1',
                    type: 'universal',
                    title: 'Raster',
                    layout: 'custom',
                    gridPos: { x: 0, y: 0, w: 20, h: 10 },
                    options: { customGrid: { cols: 2, rows: 2, cells } },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [[t('a'), t('b'), t('c'), t('d')]],
);
await page.waitForSelector('.aura-widget-cge1', { timeout: 15000 });
await page.waitForTimeout(300);
await page.locator('.aura-widget-cge1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });

const grid = () => page.evaluate(() => window.__auraShot.widgetOptions('cge1')?.customGrid);
const labels = (g) => g.cells.map((c) => (c.type === 'empty' ? '.' : c.text));
const cell = (rc) => dlg.locator(`button:has(> span:text-is("${rc}"))`);
const menuItem = (label) => page.locator(`button:has(> span:text-is("${label}"))`);

// Select cell 1/1 first, so the selection has to follow it down.
await cell('1/1').click();
await cell('1/1').click({ button: 'right' });
check('menu offers "Zeile darüber einfügen"', (await menuItem('Zeile darüber einfügen').count()) === 1);
await menuItem('Zeile darüber einfügen').click();
await page.waitForTimeout(200);
let g = await grid();
check('row inserted on top', g?.rows === 3 && labels(g).join('') === '..abcd', JSON.stringify(g && labels(g)));
check(
    'selection followed its cell to 2/1',
    (await cell('2/1').evaluate((b) => getComputedStyle(b).backgroundColor)) !==
        (await cell('1/1').evaluate((b) => getComputedStyle(b).backgroundColor)),
);

await cell('2/2').click({ button: 'right' });
await menuItem('Spalte links einfügen').click();
await page.waitForTimeout(200);
g = await grid();
check(
    'column inserted left of column 2',
    g?.cols === 3 && labels(g).join('') === '...a.bc.d',
    JSON.stringify(labels(g)),
);

// Empty row: deleted without asking.
await cell('1/1').click({ button: 'right' });
await menuItem('Zeile 1 löschen').click();
await page.waitForTimeout(200);
g = await grid();
check('empty row deleted directly', g?.rows === 2 && labels(g).join('') === 'a.bc.d', JSON.stringify(labels(g)));

// Row with content: asks first, cancel keeps it, confirm deletes.
await cell('1/1').click({ button: 'right' });
await menuItem('Zeile 1 löschen').click();
const confirm = page.locator('button:text-is("Löschen")');
check('a row with content asks first', (await confirm.count()) === 1);
await page.locator('button:text-is("Abbrechen")').click();
check('cancel keeps the row', (await grid())?.rows === 2);
await cell('1/1').click({ button: 'right' });
await menuItem('Zeile 1 löschen').click();
await confirm.click();
await page.waitForTimeout(200);
g = await grid();
check('confirm deletes the row', g?.rows === 1 && labels(g).join('') === 'c.d', JSON.stringify(labels(g)));
await cell('1/1').click({ button: 'right' });
check(
    'last row cannot be deleted',
    (await menuItem('Zeile 1 löschen').evaluate((b) => getComputedStyle(b).cursor)) === 'not-allowed',
);
check('the edit dialog stayed open throughout', (await dlg.count()) === 1);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-edit-ui: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
