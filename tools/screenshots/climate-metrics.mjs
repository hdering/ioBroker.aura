// Screenshot der weiteren Werte im Raumklima-Widget (#698).
// Ausgabe: docs/widgets/assets/raumklima/weitere-werte.png und werte-editor.png
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/screenshots/climate-metrics.mjs
//
// Ein eigenes Skript statt einer `shots`-Liste in widgets-meta.mjs: die Liste
// ersetzt das runtime.png der Seite, dieses Bild kommt daneben.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/raumklima';
const ID = 'w-doc-klima';
mkdirSync(OUT, { recursive: true });

const TEMP = 'demo.klima.temp';
const HUM = 'demo.klima.hum';
const CO2 = 'demo.klima.co2';
const VOC = 'demo.klima.voc';
const LUX = 'demo.klima.lux';
const MOTION = 'demo.klima.motion';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

const VALUES = {
    [TEMP]: 21.4,
    [HUM]: 52,
    [CO2]: 493.12,
    [VOC]: 51.04,
    [LUX]: 318,
    [MOTION]: true,
};

await page.evaluate(
    ([id, dps, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState(vals);
        window.__auraShot.showWidgets([
            {
                id,
                type: 'climate',
                title: 'Wohnzimmer',
                datapoint: dps.TEMP,
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 14, h: 9 },
                options: {
                    humidityDatapoint: dps.HUM,
                    unit: '°C',
                    decimals: 1,
                    showChart: false,
                    metricColumns: 2,
                    metrics: [
                        {
                            id: 'co2',
                            datapoint: dps.CO2,
                            label: 'CO₂',
                            icon: 'Wind',
                            unit: 'ppm',
                            decimals: 0,
                            thresholds: [
                                [800, 'var(--accent-green)'],
                                [1400, 'var(--accent-yellow)'],
                                [2000, 'var(--accent-red)'],
                            ],
                        },
                        { id: 'voc', datapoint: dps.VOC, label: 'VOC', icon: 'Waves', unit: 'ppb', decimals: 0 },
                        { id: 'dew', source: 'dewpoint', label: 'Taupunkt', icon: 'Droplet', unit: '°C', decimals: 1 },
                        { id: 'lux', datapoint: dps.LUX, label: 'Helligkeit', icon: 'Sun', unit: 'lx', decimals: 0 },
                        {
                            id: 'comfort',
                            source: 'comfort',
                            label: 'Behaglichkeit',
                            icon: 'Smile',
                            display: 'badge',
                            valueMap: [
                                { v: 0, label: 'unbehaglich', color: 'var(--accent-red)' },
                                { v: 1, label: 'geht noch', color: 'var(--accent-yellow)' },
                                { v: 2, label: 'behaglich', color: 'var(--accent-green)' },
                            ],
                        },
                        {
                            id: 'motion',
                            datapoint: dps.MOTION,
                            label: 'Bewegung',
                            display: 'dot',
                            valueMap: [
                                { v: true, label: 'Bewegung', color: 'var(--accent-green)' },
                                { v: false, label: 'ruhig' },
                            ],
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.mock(vals);
    },
    [ID, { TEMP, HUM, CO2, VOC, LUX, MOTION }, VALUES],
);

await page.waitForTimeout(1200);
await page
    .locator(`.aura-widget-${ID}`)
    .first()
    .screenshot({ path: `${OUT}/weitere-werte.png` });
console.log('✓', `${OUT}/weitere-werte.png`);

// ── Der Editor dahinter ──────────────────────────────────────────────────────
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
await page.evaluate(
    ([id, dp, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.showWidgets(
            [
                {
                    id,
                    type: 'climate',
                    title: 'Wohnzimmer',
                    datapoint: dp,
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 14, h: 9 },
                    options: {
                        metrics: [
                            {
                                id: 'co2',
                                datapoint: 'demo.klima.co2',
                                label: 'CO₂',
                                icon: 'Wind',
                                unit: 'ppm',
                                decimals: 0,
                                thresholds: [
                                    [800, 'var(--accent-green)'],
                                    [1400, 'var(--accent-yellow)'],
                                    [2000, 'var(--accent-red)'],
                                ],
                                inChart: true,
                                chartAxis: 'right',
                            },
                            { id: 'dew', source: 'dewpoint', label: 'Taupunkt', icon: 'Droplet', unit: '°C', decimals: 1 },
                        ],
                    },
                },
            ],
            { editMode: true },
        );
    },
    [ID, TEMP, VALUES],
);
await page.waitForTimeout(800);
await page.locator(`.aura-widget-${ID} button[title="Widget-Optionen"]`).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(900);
await page.getByRole('button', { name: /Werte bearbeiten/ }).first().click();
await page.waitForSelector('.aura-config-modal', { timeout: 10000 });
await page.waitForTimeout(600);
// Die erste Karte aufklappen, damit das Bild zeigt, was in einem Wert steckt.
await page
    .locator('.aura-config-modal [data-aura-rule-grip] + button')
    .first()
    .click()
    .catch(() => {});
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
    const el = document.querySelector('.aura-config-modal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (box) {
    const pad = 6;
    await page.screenshot({
        path: `${OUT}/werte-editor.png`,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', `${OUT}/werte-editor.png`);
} else {
    console.log('✗ werte-editor.png — kein Popup gefunden');
}

await browser.close();
