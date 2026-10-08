// Documentation screenshots for the history table (issue #760).
// Output: docs/widgets/assets/verlaufstabelle/runtime.png      (Schaltvorgänge, getrennte Spalten)
//         docs/widgets/assets/verlaufstabelle/runtime-werte.png (Messwerte, Datum + Uhrzeit)
//         docs/widgets/assets/verlaufstabelle/config.png       (Einstellungen)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/verlaufstabelle.mjs
//
// The history comes from the harness (`mockHistory`), so no history adapter is needed.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/verlaufstabelle';
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const MIN = 60_000;
// Window contact: opened and closed a few times, the adapter logs the same state repeatedly.
const door = [
    [now - 26 * 60 * MIN, false],
    [now - 25 * 60 * MIN, true],
    [now - 24 * 60 * MIN, true],
    [now - 23.5 * 60 * MIN, false],
    [now - 9 * 60 * MIN, true],
    [now - 8.6 * 60 * MIN, false],
    [now - 8 * 60 * MIN, false],
    [now - 3 * 60 * MIN, true],
    [now - 2.2 * 60 * MIN, false],
    [now - 14 * MIN, true],
];
const temp = Array.from({ length: 30 }, (_, i) => [
    now - (29 - i) * 20 * MIN,
    Math.round((21 + Math.sin(i / 4) * 1.4) * 10) / 10,
]);

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

const DOOR = {
    id: 'w-ht-door',
    type: 'historytable',
    title: 'Terrassentür',
    datapoint: 'demo.doc.door',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 11, h: 13 },
    options: {
        icon: 'DoorOpen',
        historyInstance: 'history.0',
        historyCount: 6,
        hideDuplicates: true,
        timeColumns: 'split',
        dateFormat: 'EE dd.MM.',
        timeFormat: 'HH:mm',
        valueLabels: '0=geschlossen; 1=offen',
        colValueLabel: 'Zustand',
    },
};
const TEMP = {
    id: 'w-ht-temp',
    type: 'historytable',
    title: 'Wohnzimmer',
    datapoint: 'demo.doc.temp',
    layout: 'default',
    gridPos: { x: 12, y: 0, w: 11, h: 13 },
    options: { icon: 'Thermometer', historyInstance: 'history.0', historyCount: 8, decimals: 1, unit: '°C' },
};

async function seed(editMode = false) {
    await page.evaluate(
        ([door, temp, widgets, editMode]) => {
            const a = window.__auraShot;
            a.mockHistory({ 'demo.doc.door': door, 'demo.doc.temp': temp });
            const logged = { type: 'state', common: { type: 'mixed', custom: { 'history.0': { enabled: true } } } };
            a.mockObject({ 'demo.doc.door': logged, 'demo.doc.temp': logged });
            const vals = { 'demo.doc.door': true, 'demo.doc.temp': 21.4 };
            a.mock(vals);
            a.mockServerState(vals);
            a.showWidgets(widgets, editMode ? { editMode: true } : {});
        },
        [door, temp, [DOOR, TEMP], editMode],
    );
}

await seed();
await page.waitForFunction(() => document.querySelectorAll('.aura-widget-w-ht-temp tbody tr').length > 1, null, {
    timeout: 20000,
});
await page.waitForTimeout(500);
await page
    .locator('.aura-widget-w-ht-door')
    .first()
    .screenshot({ path: `${OUT}/runtime.png` });
await page
    .locator('.aura-widget-w-ht-temp')
    .first()
    .screenshot({ path: `${OUT}/runtime-werte.png` });
console.log('✓ runtime.png, runtime-werte.png');

// ── Einstellungen ──────────────────────────────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await seed(true);
await page.waitForTimeout(1200);
await page.locator('.aura-widget-w-ht-door button[title="Widget-Optionen"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(1500);
const box = await page.evaluate(() => {
    const el = document.querySelector('div.pointer-events-auto.rounded-xl.shadow-2xl');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (!box) throw new Error('config dialog not found');
const pad = 4;
await page.screenshot({
    path: `${OUT}/config.png`,
    clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
    },
});
console.log('✓ config.png', box);

await browser.close();
