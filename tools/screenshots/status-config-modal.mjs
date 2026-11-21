// Docs screenshot: the Statusübersicht config dialog (tab "Kategorien", battery selected).
//
//   AURA_BASE=http://localhost:5174 node tools/screenshots/status-config-modal.mjs
//
// Writes docs/widgets/assets/statusuebersicht/konfiguration.png
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/statusuebersicht/konfiguration.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate(() => {
    const s = window.__auraShot;
    s.captureWrites(true);
    s.mockObjectView({ state: [], device: [], enum: [] });
    s.showWidgets([
        {
            id: 'w-shot',
            type: 'statusoverview',
            title: 'Status',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 8 },
            options: { catLight: false, latchBattery: true },
        },
    ]);
});
await page.waitForTimeout(800);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('.aura-widget-edit-modal').waitFor({ timeout: 10000 });
await page.evaluate(() => window.__auraShot.unfoldSections?.());
await page.locator('[data-status-config-open]').click();
const dlg = page.locator('.aura-config-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('[data-status-cat="battery"] button').first().click();
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
await dlg.screenshot({ path: OUT });
console.log(`wrote ${OUT}`);
await browser.close();
