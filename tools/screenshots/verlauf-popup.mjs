// Screenshots for the "Verlauf per Klick auf eine Listenzeile" guide (#835).
// Writes docs/anleitungen/assets/verlauf-popup-*.png.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/verlauf-popup.mjs
//
// One popup view holds a chart on {{dp}}; the list opens it for every row.
// History is fabricated by the harness, clicks never reach an instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/anleitungen/assets';
mkdirSync(OUT, { recursive: true });

const ROWS = [
    { id: 'demo.0.wohnen.temperatur', label: 'Temperatur Wohnen', role: 'value.temperature', unit: '°C' },
    { id: 'demo.0.wohnen.feuchte', label: 'Luftfeuchte Wohnen', role: 'value.humidity', unit: '%' },
    { id: 'demo.0.bad.temperatur', label: 'Temperatur Bad', role: 'value.temperature', unit: '°C' },
    { id: 'demo.0.aussen.temperatur', label: 'Außentemperatur', role: 'value.temperature', unit: '°C' },
];
const MOCK = {
    'demo.0.wohnen.temperatur': 21.4,
    'demo.0.wohnen.feuchte': 48,
    'demo.0.bad.temperatur': 23.1,
    'demo.0.aussen.temperatur': 12.6,
};
const OBJECTS = Object.fromEntries(
    ROWS.map((r) => [
        r.id,
        {
            type: 'state',
            common: {
                name: r.label,
                type: 'number',
                role: r.role,
                unit: r.unit,
                custom: { 'history.0': { enabled: true } },
            },
        },
    ]),
);

const VIEW = {
    id: 'pv-verlauf',
    name: 'Verlauf',
    widgets: [
        {
            id: 'v-chart',
            type: 'chart',
            title: '',
            datapoint: '{{dp}}',
            gridPos: { x: 0, y: 0, w: 24, h: 9 },
            options: { showTitle: false },
        },
    ],
};

const LIST = {
    id: 'w-list',
    type: 'list',
    title: 'Klima',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 7 },
    options: {
        icon: 'Thermometer',
        rowClickAction: { kind: 'popup-view', viewId: VIEW.id },
        entries: ROWS.map((r) => ({ ...r })),
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function go(hash, setup = true) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/${hash}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    if (setup)
        await page.evaluate(
            ([mock, objects, view]) => {
                const a = window.__auraShot;
                a.captureWrites(true);
                a.enableHistory(true);
                a.mockObject(objects);
                a.mockServerState(mock);
                a.mock(mock);
                a.popupViews([view]);
            },
            [MOCK, OBJECTS, VIEW],
        );
    await page.waitForTimeout(800);
}

async function clip(locator, path, pad = 4) {
    const b = await locator.boundingBox();
    await page.screenshot({
        path,
        clip: {
            x: Math.max(0, b.x - pad),
            y: Math.max(0, b.y - pad),
            width: b.width + pad * 2,
            height: b.height + pad * 2,
        },
    });
    console.log('✓', path);
}

await go('', false);
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

// ── 1. Popup view editor with the chart on {{dp}} ────────────────────────────
// Wide enough for the whole toolbar (widget type + "+ Widget"); the admin sidebar is cut off.
await page.setViewportSize({ width: 1900, height: 700 });
await go(`admin/popups/${VIEW.id}`);
await page.waitForTimeout(800);
const sidebar = await page.locator('aside').first().boundingBox();
const chartBox = await page.locator('.aura-widget-v-chart').first().boundingBox();
await page.screenshot({
    path: `${OUT}/verlauf-popup-view.png`,
    clip: { x: sidebar.width, y: 0, width: 1900 - sidebar.width, height: chartBox.y + chartBox.height + 16 },
});
console.log('✓', `${OUT}/verlauf-popup-view.png`);

// ── 2. List: Datenpunkte verwalten → Klick auf Zeile ─────────────────────────
await page.setViewportSize({ width: 1700, height: 1200 });
await go('admin/editor');
await page.evaluate((w) => {
    window.__auraShot.unfoldSections();
    window.__auraShot.showWidgets([w], { editMode: true });
}, LIST);
await page.waitForTimeout(900);
await page.locator('.aura-widget-w-list button[title="Widget-Optionen"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /Datenpunkte verwalten/ }).click({ force: true });
await page.waitForTimeout(1000);
const dialog = page.locator('div[style*="z-index: 10000"] > div.fixed.rounded-xl').last();
await dialog.getByText('Klick auf Zeile', { exact: true }).first().click();
await page.waitForTimeout(700);
// Only the part the guide talks about: tabs down to the popup title.
const dlg = await dialog.boundingBox();
const end = await dialog.getByText('Vollbild', { exact: true }).first().boundingBox();
await page.screenshot({
    path: `${OUT}/verlauf-popup-klick.png`,
    clip: { x: dlg.x, y: dlg.y, width: dlg.width, height: end.y - dlg.y - 8 },
});
console.log('✓', `${OUT}/verlauf-popup-klick.png`);

// ── 3. Result: row click opens the chart of that row ─────────────────────────
await page.setViewportSize({ width: 900, height: 700 });
await go('');
await page.evaluate((w) => window.__auraShot.showWidgets([w]), { ...LIST, gridPos: { ...LIST.gridPos, w: 10 } });
await page.waitForSelector('.aura-widget-w-list', { timeout: 15000 });
await page.waitForTimeout(800);
// The live socket answers the demo ids with nothing — mock again once subscribed.
await page.evaluate((m) => window.__auraShot.mock(m), MOCK);
await page.waitForTimeout(400);
await page.locator('.aura-widget-w-list').getByText('Temperatur Wohnen').first().click();
await page.waitForSelector('text=Lade Verlauf', { state: 'detached', timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
// Down to the popup's lower edge — the resolution hint and badge sit below it.
const pop = await page
    .locator('div[class*="z-[300]"] .rounded-2xl, div[class*="z-[300]"] [role="dialog"]')
    .first()
    .boundingBox();
await page.screenshot({
    path: `${OUT}/verlauf-popup-ergebnis.png`,
    clip: { x: 0, y: 0, width: 900, height: pop ? Math.min(700, pop.y + pop.height + 16) : 530 },
});
console.log('✓', `${OUT}/verlauf-popup-ergebnis.png`);

console.log('writes', JSON.stringify(await page.evaluate(() => window.__auraShot.writes())));
await browser.close();
