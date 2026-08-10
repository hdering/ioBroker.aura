// Capture the config panel and the "Datenpunkte verwalten" dialog of both list widgets.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/list-config.mjs
//
// Same approach as config-dialog.mjs: fake an admin session, seed a demo widget
// through the screenshot harness, then open the edit modal and clip it.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const WIDGETS = [
    {
        slug: 'liste',
        type: 'list',
        title: 'Wohnzimmer',
        entries: [
            { id: 'demo.light', label: 'Deckenlicht', role: 'switch.light', icon: 'Lightbulb' },
            { id: 'demo.dim', label: 'Stehlampe', role: 'level.dimmer', displayType: 'slider' },
            { id: 'demo.temp', label: 'Temperatur', role: 'value.temperature', unit: '°C' },
            { id: 'demo.win', label: 'Fenster', role: 'sensor.window' },
        ],
    },
    {
        slug: 'dynamische-liste',
        type: 'autolist',
        title: 'Alle Lichter',
        entries: [
            { id: 'demo.light', label: 'Deckenlicht', role: 'switch.light' },
            { id: 'demo.dim', label: 'Stehlampe', role: 'level.dimmer' },
            { id: 'demo.temp', label: 'Temperatur', role: 'value.temperature', unit: '°C' },
        ],
    },
];

const MOCK = { 'demo.light': true, 'demo.dim': 42, 'demo.temp': 21.5, 'demo.win': false };

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1700, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

async function clipPanel(selector, path) {
    const box = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
    if (!box) throw new Error(`not found: ${selector}`);
    const pad = 4;
    await page.screenshot({
        path,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', path);
}

for (const w of WIDGETS) {
    const out = `docs/widgets/assets/${w.slug}`;
    mkdirSync(out, { recursive: true });

    await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
    await page.evaluate(
        ([widget, mock]) => {
            window.__auraShot.mock(mock);
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'w-shot',
                        type: widget.type,
                        title: widget.title,
                        datapoint: '',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 12, h: 7 },
                        options: { entries: widget.entries },
                    },
                ],
                { editMode: true },
            );
        },
        [w, MOCK],
    );
    await page.waitForTimeout(900);

    await page.locator('.aura-widget-w-shot button[title="Widget-Optionen"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
    await page.waitForTimeout(1000);
    await clipPanel('div.pointer-events-auto.rounded-xl.shadow-2xl', `${out}/config.png`);

    // force: the modal body scrolls independently, so the element can sit under the
    // sticky header even after scrollIntoView.
    await page.getByRole('button', { name: /Datenpunkte verwalten/ }).click({ force: true });
    await page.waitForTimeout(1200);
    await clipPanel('div[style*="z-index: 10000"] > div.fixed.rounded-xl', `${out}/datenpunkte-dialog.png`);

    // Close dialog + edit modal before seeding the next widget, otherwise the
    // still-open overlay swallows the clicks of the following round.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
}

await browser.close();
