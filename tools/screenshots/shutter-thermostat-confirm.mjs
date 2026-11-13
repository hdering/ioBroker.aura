// Shutter and thermostat — screenshots of the security prompt (#977).
// Writes docs/widgets/assets/{rollladen,thermostat}/sicherheitsabfrage.png.
// Side-effect-free: writes are captured and the prompt is never confirmed.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

const SHOTS = [
    {
        dir: 'docs/widgets/assets/rollladen',
        values: { 'demo.blind': 70 },
        widget: {
            id: 'w-shot-sh',
            type: 'shutter',
            title: 'Wohnzimmer',
            datapoint: 'demo.blind',
            gridPos: { x: 0, y: 0, w: 9, h: 9 },
            layout: 'default',
            options: { confirmAction: true },
        },
        trigger: 'button:has(svg.lucide-chevron-down)',
    },
    {
        dir: 'docs/widgets/assets/thermostat',
        values: { 'demo.setpoint': 21, 'demo.actual': 20.4 },
        widget: {
            id: 'w-shot-th',
            type: 'thermostat',
            title: 'Bad',
            datapoint: 'demo.setpoint',
            gridPos: { x: 0, y: 0, w: 9, h: 7 },
            layout: 'default',
            options: { confirmAction: true, actualDatapoint: 'demo.actual', decimals: 1 },
        },
        trigger: '.aura-widget-action button:has-text("+")',
    },
];

for (const s of SHOTS) {
    mkdirSync(s.dir, { recursive: true });
    await page.evaluate(
        ({ values, widget }) => {
            window.__auraShot.captureWrites(true);
            window.__auraShot.mock(values);
            window.__auraShot.mockServerState(values);
            window.__auraShot.showWidgets([widget]);
            window.__auraShot.mock(values);
        },
        { values: s.values, widget: s.widget },
    );
    await page.waitForTimeout(700);
    const sel = `.aura-widget-${s.widget.id}`;
    await page.locator(`${sel} ${s.trigger}`).first().click();
    await page.waitForTimeout(400);
    await page
        .locator(sel)
        .first()
        .screenshot({ path: `${s.dir}/sicherheitsabfrage.png` });
    console.log(`✓ ${s.dir}/sicherheitsabfrage.png`);
}

await browser.close();
console.log('done');
