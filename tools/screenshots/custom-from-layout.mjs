// Docs screenshots for "Aus Layout übernehmen" (#768): the start prompt in the edit
// dialog and a thermostat dial rebuilt as custom grid with one more row.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/custom-from-layout.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/custom-layout';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const VALS = { 'demo.soll': 22, 'demo.ist': 20.5, 'demo.rh': 48 };
const dialGrid = await page.evaluate(async () => {
    const m = await import('/src-vis/utils/customGridPresets/index.ts');
    return m.buildCustomGridFromLayout({ type: 'thermostat', options: {} }, 'dial');
});
// One more row under the presets: the humidity of the room.
const extended = {
    ...dialGrid,
    rows: dialGrid.rows + 1,
    cells: [
        ...dialGrid.cells,
        {
            type: 'dp',
            dpId: 'demo.rh',
            prefix: 'Luftfeuchte ',
            suffix: ' %',
            decimals: 0,
            fontSize: 12,
            color: 'var(--text-secondary)',
            align: 'center',
            valign: 'middle',
        },
    ],
    rowSizes: [...dialGrid.rowSizes, 'auto'],
};

// ── 1. Original "Rundskala" next to the custom grid with the extra row ──────────
await page.evaluate(
    ([vals, grid]) => {
        window.__auraShot.mockServerState(vals);
        window.__auraShot.mock(vals);
        const base = {
            type: 'thermostat',
            title: 'Bad',
            datapoint: 'demo.soll',
            options: { actualDatapoint: 'demo.ist' },
        };
        window.__auraShot.showWidgets([
            { ...base, id: 'cfl-a', layout: 'dial', gridPos: { x: 0, y: 0, w: 10, h: 9 } },
            {
                ...base,
                id: 'cfl-b',
                layout: 'custom',
                gridPos: { x: 11, y: 0, w: 10, h: 9 },
                options: { ...base.options, customGrid: grid },
            },
        ]);
    },
    [VALS, extended],
);
await page.waitForSelector('.aura-widget-cfl-b [data-aura-thermo-dial]', { timeout: 15000 });
await page.waitForTimeout(600);
{
    const a = await page.locator('.aura-widget-cfl-a').boundingBox();
    const b = await page.locator('.aura-widget-cfl-b').boundingBox();
    const x = a.x - 8;
    const y = Math.min(a.y, b.y) - 8;
    await page.screenshot({
        path: `${OUT}/from-layout-dial.png`,
        clip: { x, y, width: b.x + b.width - x + 8, height: Math.max(a.height, b.height) + 16 },
    });
}

// ── 2. The prompt in the edit dialog ───────────────────────────────────────────
await page.evaluate((vals) => {
    window.__auraShot.mockServerState(vals);
    window.__auraShot.mock(vals);
    window.__auraShot.showWidgets(
        [
            {
                id: 'cfl-ed',
                type: 'thermostat',
                title: 'Bad',
                datapoint: 'demo.soll',
                layout: 'dial',
                gridPos: { x: 0, y: 0, w: 10, h: 9 },
                options: { actualDatapoint: 'demo.ist' },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, VALS);
await page.waitForSelector('.aura-widget-cfl-ed', { timeout: 15000 });
await page.locator('.aura-widget-cfl-ed').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('button:text-is("Custom")').click();
const prompt = dlg.locator('.aura-custom-start');
await prompt.waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
{
    // The layout row with the prompt below it.
    const pills = await dlg.locator('button:text-is("Rundskala")').boundingBox();
    const p = await prompt.boundingBox();
    const x = p.x - 10;
    const y = pills.y - 10;
    await page.screenshot({
        path: `${OUT}/from-layout-prompt.png`,
        clip: { x, y, width: p.width + 20, height: p.y + p.height - y + 10 },
    });
}

await browser.close();
console.log(`wrote ${OUT}/from-layout-dial.png, ${OUT}/from-layout-prompt.png`);
