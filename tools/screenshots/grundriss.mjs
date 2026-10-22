// Documentation example "Grundriss mit Bedienelementen" (docs/anleitungen/grundriss.md).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/grundriss.mjs
//
// Image widget, layout "custom", 20x20 grid: cell 0 holds the floor plan
// (docs/anleitungen/assets/grundriss-eg.svg) spanning the whole grid, every other
// cell lies on top of it. The plan is drawn on the same raster — one cell is
// 40 x 50 units of the SVG — so x/40 and y/50 give the column and row.
// Values are mocked, clicks never reach an instance (captureWrites).
//
// Output: docs/anleitungen/assets/grundriss-*.png + grundriss-widget.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/anleitungen/assets';
const ID = 'w-grundriss';
const SEL = `.aura-widget-${ID}`;

const COLS = 20;
const ROWS = 20;
const R = 'demo.0.eg.';
const ON = '#f59e0b';
const OFF = '#64748b';
const INK = '#1e293b';
const LABEL = '#ffffffd9';
const lamp = (dp, title, action = 'popup-switch', extra = {}) => ({
    type: 'state-icon',
    fontSize: 24,
    dpId: R + dp,
    trueIcon: 'Lightbulb',
    falseIcon: 'Lightbulb',
    trueColor: ON,
    falseColor: OFF,
    colSpan: 2,
    clickAction: { kind: action },
    popup: { title },
    ...extra,
});
const door = (dp) => ({
    type: 'state-icon',
    fontSize: 24,
    dpId: R + dp,
    trueIcon: 'DoorOpen',
    falseIcon: 'DoorClosed',
    trueColor: '#dc2626',
    falseColor: '#16a34a',
    colSpan: 2,
});
const label = (dp, prefix, suffix, decimals, extra = {}) => ({
    type: 'dp',
    dpId: R + dp,
    prefix,
    suffix,
    decimals,
    color: INK,
    bg: LABEL,
    bgMode: 'content',
    ...extra,
});

// [row, col, cell]
const PLACE = [
    // Wohnen / Essen
    [1, 4, door('wohnen.tuer_links')],
    [1, 13, door('wohnen.tuer_rechts')],
    [
        1,
        16,
        label('wohnen.rollladen', '▼ ', ' %', 0, {
            align: 'right',
            colSpan: 3,
            clickAction: { kind: 'popup-shutter' },
            popup: { title: 'Rollladen Wohnen' },
        }),
    ],
    [
        4,
        6,
        lamp('essen.licht', 'Licht Essen', 'popup-dimmer', {
            stateMode: 'condition',
            stateOperator: '>',
            stateValue: '0',
        }),
    ],
    [4, 13, lamp('wohnen.stehlampe', 'Stehlampe', 'popup-switch', { trueIcon: 'Lamp', falseIcon: 'Lamp' })],
    [
        7,
        9,
        label('wohnen.temperatur', '🌡 ', ' °C', 1, {
            bold: true,
            colSpan: 3,
            clickAction: { kind: 'popup-thermostat', setpointDp: R + 'wohnen.solltemperatur' },
            popup: { title: 'Heizung Wohnen' },
        }),
    ],
    [7, 12, label('wohnen.feuchte', '💧 ', ' %', 0, { colSpan: 3 })],
    // Küche
    [11, 7, lamp('kueche.licht', 'Licht Küche')],
    [
        12,
        5,
        {
            type: 'state-text',
            dpId: R + 'kueche.spuelmaschine',
            trueText: 'Spülmaschine läuft',
            falseText: 'Spülmaschine fertig',
            trueColor: '#2563eb',
            falseColor: '#16a34a',
            bg: LABEL,
            bgMode: 'content',
            colSpan: 5,
        },
    ],
    // Diele / Treppe / Haustür
    [12, 10, lamp('diele.licht', 'Licht Diele', 'popup-switch', { colSpan: 3 })],
    [
        11,
        14,
        {
            type: 'text',
            text: '▲ Obergeschoss',
            color: '#ffffff',
            bg: '#2563eb',
            bgMode: 'content',
            bold: true,
            fontSize: 11,
            colSpan: 5,
            clickAction: { kind: 'link-tab', layoutId: '', tabId: '' },
        },
    ],
    [
        18,
        10,
        {
            type: 'switch',
            dpId: R + 'haustuer.verriegelt',
            controlMode: 'icon',
            fontSize: 24,
            trueIcon: 'Lock',
            falseIcon: 'LockOpen',
            trueColor: '#16a34a',
            falseColor: '#dc2626',
            confirmAction: true,
            confirmText: 'Haustür umschalten?',
            colSpan: 3,
        },
    ],
    // WC
    [14, 15, lamp('wc.licht', 'Licht WC')],
    // HWR / Technik
    [14, 1, label('hwr.warmwasser', '🔥 Warmwasser ', ' °C', 0, { align: 'left', colSpan: 5 })],
    [
        17,
        1,
        {
            type: 'progress',
            dpId: R + 'hwr.waschmaschine',
            min: 0,
            max: 100,
            showValue: true,
            valueFilledColor: '#ffffff',
            valueEmptyColor: INK,
            decimals: 0,
            prefix: 'Wäsche ',
            suffix: ' %',
            color: '#2563eb',
            colSpan: 4,
        },
    ],
];

const VALUES = {
    [R + 'wohnen.tuer_links']: false,
    [R + 'wohnen.tuer_rechts']: true,
    [R + 'wohnen.rollladen']: 40,
    [R + 'essen.licht']: 80,
    [R + 'wohnen.stehlampe']: false,
    [R + 'wohnen.temperatur']: 21.4,
    [R + 'wohnen.solltemperatur']: 21.5,
    [R + 'wohnen.feuchte']: 48,
    [R + 'kueche.licht']: true,
    [R + 'kueche.spuelmaschine']: true,
    [R + 'diele.licht']: false,
    [R + 'haustuer.verriegelt']: true,
    [R + 'wc.licht']: false,
    [R + 'hwr.warmwasser']: 52,
    [R + 'hwr.waschmaschine']: 65,
};

const svg = readFileSync(`${OUT}/grundriss-eg.svg`);
const cells = Array.from({ length: COLS * ROWS }, () => ({ type: 'empty' }));
cells[0] = {
    type: 'image',
    imageUrl: `data:image/svg+xml;base64,${svg.toString('base64')}`,
    objectFit: 'fill',
    colSpan: COLS,
    rowSpan: ROWS,
};
for (const [r, c, cell] of PLACE) cells[r * COLS + c] = { fontSize: 12, align: 'center', valign: 'middle', ...cell };

const widget = {
    id: ID,
    type: 'image',
    layout: 'custom',
    title: 'Erdgeschoss',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 19, h: 23 },
    options: { showTitle: false, showIcon: false, customGrid: { cols: COLS, rows: ROWS, cells } },
};
writeFileSync(`${OUT}/grundriss-widget.json`, JSON.stringify(widget, null, 2) + '\n');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate((v) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.popupBuiltins();
    window.__auraShot.mockServerState(v);
    window.__auraShot.mock(v);
}, VALUES);
// Centred in the 900 px viewport, so the popup opens over the plan.
await page.evaluate((w) => window.__auraShot.showWidgets([w]), { ...widget, gridPos: { ...widget.gridPos, x: 4 } });
await page.waitForSelector(SEL, { timeout: 15000 });
await page.waitForTimeout(1500);

const el = page.locator(SEL).first();
await el.screenshot({ path: `${OUT}/grundriss-ergebnis.png` });

const cellAt = (r, c) => page.locator(`${SEL} .aura-custom-cell-${r * COLS + c}`).first();
const box = await el.boundingBox();
await cellAt(7, 9).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/grundriss-popup.png`, clip: box });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('writes', JSON.stringify(await page.evaluate(() => window.__auraShot.writes())));
await browser.close();
