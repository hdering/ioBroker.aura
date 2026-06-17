// Capture the switch widget's configuration dialog ("Widget bearbeiten").
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/schalter';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
await page.evaluate(() => localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })));
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.switch': true });
    window.__auraShot.showWidgets(
        [{ id: 'w-shot', type: 'switch', title: 'Stehlampe', datapoint: 'demo.switch', gridPos: { x: 0, y: 0, w: 12, h: 6 }, layout: 'default', options: {} }],
        { editMode: true },
    );
});
await page.waitForTimeout(1000);

await page.locator('.aura-widget-w-shot button[title="Widget-Optionen"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(900);

await page.waitForTimeout(600); // let the entrance transition finish
const box = await page.evaluate(() => {
    const el = document.querySelector('div.pointer-events-auto.rounded-xl.shadow-2xl');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (!box) throw new Error('modal not found');
const pad = 4;
await page.screenshot({
    path: `${OUT}/config-dialog.png`,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 },
});
console.log('✓ config-dialog.png', box);

await browser.close();
