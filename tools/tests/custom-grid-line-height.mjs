// Universal widget: per-cell lineHeight (issue #933).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-line-height.mjs
//
// A 30 px value needs 39 px (+ descender reserve) at the default line height 1.3 and
// gets cut in a flat cell. With lineHeight 1 the text box is exactly the font size.
// Also checks the cell editor stores the new field.
import * as pw from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await pw[process.env.AURA_BROWSER ?? 'chromium'].launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(() => window.__auraShot.captureWrites(true));

const cells = [
    { type: 'text', text: '23,4', fontSize: 30, align: 'left', valign: 'middle' },
    { type: 'text', text: '23,4', fontSize: 30, align: 'left', valign: 'middle', lineHeight: 1 },
];
await page.evaluate(
    ([cells]) => {
        window.__auraShot.showWidgets([
            {
                id: 'lh1',
                type: 'universal',
                title: 'Titel',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 14, h: 10 },
                options: { customGrid: { cols: 2, rows: 1, cells } },
            },
        ]);
    },
    [cells],
);
await page.waitForSelector('.aura-widget-lh1 .aura-custom-cell-1 span', { timeout: 15000 });
await page.waitForTimeout(300);

const spanBox = (i) =>
    page.evaluate((i) => {
        const s = document.querySelector(`.aura-widget-lh1 .aura-custom-cell-${i} span`);
        const cs = getComputedStyle(s);
        return { h: s.getBoundingClientRect().height, lh: cs.lineHeight, pb: cs.paddingBottom };
    }, i);
const def = await spanBox(0);
const one = await spanBox(1);
check('default keeps 1.3 plus descender reserve', def.h >= 41, JSON.stringify(def));
check('lineHeight 1 makes the text box the font size', Math.abs(one.h - 30) < 1, JSON.stringify(one));

// Editor: the cell editor offers 'Zeilenhöhe' and stores it.
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(300);
await page.locator('.aura-widget-lh1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('button:has(> span:text-is("1/1"))').click();
const input = dlg.locator('label:text-is("Zeilenhöhe") + input');
check('cell editor offers the line height field', (await input.count()) === 1);
await input.fill('0.9');
await page.waitForTimeout(300);
const stored = await page.evaluate(() => window.__auraShot.widgetOptions('lh1')?.customGrid?.cells?.[0]?.lineHeight);
check('line height is stored', stored === 0.9, String(stored));
await input.fill('');
await page.waitForTimeout(300);
const cleared = await page.evaluate(() =>
    window.__auraShot.widgetOptions('lh1')?.customGrid?.cells?.[0]
        ? 'lineHeight' in window.__auraShot.widgetOptions('lh1').customGrid.cells[0] &&
          window.__auraShot.widgetOptions('lh1').customGrid.cells[0].lineHeight !== undefined
        : null,
);
check('empty field clears it', cleared === false, String(cleared));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-line-height: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
