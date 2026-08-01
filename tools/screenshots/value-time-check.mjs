// Ad-hoc check: time formatting of a datapoint value (valueTimeFormat).
// Covers the value widget and a custom-layout `dp` cell against the dev server;
// PNGs land in tools/screenshots/out/value-time/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'tools/screenshots/out/value-time';
const ID = 'w-doc';
const SEL = `.aura-widget-${ID}`;
const DP = 'demo.value.time';

const SECS = Math.floor(new Date(2026, 7, 1, 14, 32, 7).getTime() / 1000);

const CASES = [
    { file: 'off', val: SECS, options: {} },
    { file: 'time', val: SECS, options: { valueTimeFormat: 'time' } },
    { file: 'time-sec', val: SECS, options: { valueTimeFormat: 'time-sec' } },
    { file: 'date', val: SECS, options: { valueTimeFormat: 'date' } },
    { file: 'date-long', val: SECS, options: { valueTimeFormat: 'date-long' } },
    { file: 'datetime', val: SECS * 1000, options: { valueTimeFormat: 'datetime' } },
    { file: 'iso', val: '2026-08-01T14:32:07+02:00', options: { valueTimeFormat: 'datetime-sec' } },
    { file: 'hhmm', val: '06:45', options: { valueTimeFormat: 'time' } },
    {
        file: 'custom',
        val: SECS,
        options: { valueTimeFormat: 'custom', valueTimePattern: 'EEEE, dd.MM. HH:mm', valueFontSize: 20 },
    },
    { file: 'not-a-time', val: 'kaputt', options: { valueTimeFormat: 'datetime' } },
    // JSON datapoint + JSON path: the path is resolved first, then formatted.
    // (Adapters usually store JSON as a string; the mock treats plain objects as state patches.)
    {
        file: 'json-path',
        dp: `${DP}?meta.updated`,
        val: JSON.stringify({ meta: { updated: SECS } }),
        options: { valueTimeFormat: 'datetime' },
    },
];

// Universal widget: a `dp` cell with prefix/suffix around the formatted time.
const CELL_CASE = {
    file: 'cell-dp',
    val: SECS,
    grid: {
        cols: 1,
        rows: 2,
        cells: [
            { type: 'text', text: 'Letzter Lauf', fontSize: 12, align: 'center' },
            {
                type: 'dp',
                dpId: DP,
                prefix: 'um ',
                suffix: ' Uhr',
                valueTimeFormat: 'time',
                fontSize: 22,
                align: 'center',
            },
        ],
    },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 900, height: 600 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function shot(cfg, dp, val, file) {
    await page.evaluate(
        ({ cfg, dp, val }) => {
            window.__auraShot.mock({ [dp]: val });
            window.__auraShot.showWidgets([cfg]);
            window.__auraShot.mock({ [dp]: val });
        },
        { cfg, dp, val },
    );
    await page.waitForTimeout(700);
    const text = await page.locator(SEL).first().innerText();
    await page.locator(SEL).first().screenshot({ path: `${OUT}/${file}.png` });
    console.log(`✓ ${file.padEnd(12)} ${JSON.stringify(text)}`);
}

for (const c of CASES) {
    const cfg = {
        id: ID,
        type: 'value',
        title: 'Letzte Aktualisierung',
        datapoint: c.dp ?? DP,
        layout: 'default',
        options: c.options,
        gridPos: { x: 0, y: 0, w: 12, h: 5 },
    };
    await shot(cfg, DP, c.val, c.file);
}

await shot(
    {
        id: ID,
        type: 'universal',
        title: 'Universal',
        datapoint: '',
        layout: 'custom',
        options: { customGrid: CELL_CASE.grid },
        gridPos: { x: 0, y: 0, w: 12, h: 5 },
    },
    DP,
    CELL_CASE.val,
    CELL_CASE.file,
);

await browser.close();
console.log(`\nPNGs: ${OUT}`);
