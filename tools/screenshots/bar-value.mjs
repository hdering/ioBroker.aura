// Doc screenshots for the value inside the bar and the split bar colours (#719, #720):
// four ink cartridges as fill widgets (bar layout) and as progress cells.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/bar-value.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const INKS = [
    ['Black', '#111111', 62, '#ffffff'],
    ['Cyan', '#00b7eb', 49, '#0b1b2b'],
    ['Magenta', '#e6007e', 51, '#ffffff'],
    ['Yellow', '#ffd400', 28, '#1a1a1a'],
];
const TRACK = '#2a3444';
const ON_TRACK = '#cbd5e1';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.writes(true));

const vals = Object.fromEntries(INKS.map(([n, , v]) => [`demo.ink.${n.toLowerCase()}`, v]));
const fills = INKS.map(([name, color, , onFill], i) => ({
    id: `w-ink-${i}`,
    type: 'fill',
    title: name,
    datapoint: `demo.ink.${name.toLowerCase()}`,
    layout: 'bar',
    gridPos: { x: i * 4, y: 0, w: 4, h: 8 },
    options: {
        unit: '%',
        decimals: 0,
        showTicks: false,
        valuePlacement: 'inside',
        fillColor: color,
        trackColor: TRACK,
        valueFilledColor: onFill,
        valueEmptyColor: ON_TRACK,
    },
}));
const universal = {
    id: 'w-ink-cells',
    type: 'universal',
    title: 'Tinte',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 9 },
    options: {
        showTitle: false,
        showIcon: false,
        customGrid: {
            cols: 4,
            rows: 2,
            rowSizes: ['auto', '1fr'],
            cells: [
                ...INKS.map(([name, color]) => ({ type: 'text', text: name, align: 'center', color })),
                ...INKS.map(([name, color, , onFill]) => ({
                    type: 'progress',
                    dpId: `demo.ink.${name.toLowerCase()}`,
                    orientation: 'vertical',
                    showValue: true,
                    decimals: 0,
                    suffix: ' %',
                    color,
                    trackColor: TRACK,
                    valueFilledColor: onFill,
                    valueEmptyColor: ON_TRACK,
                })),
            ],
        },
    },
};

async function shot(widgets, file) {
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mockServerState(v);
            window.__auraShot.mock(v);
            window.__auraShot.showWidgets(w);
        },
        [widgets, vals],
    );
    await page.waitForTimeout(800);
    const box = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.react-grid-item')].map((e) => e.getBoundingClientRect());
        const x = Math.min(...r.map((b) => b.left)),
            y = Math.min(...r.map((b) => b.top));
        return {
            x: x - 6,
            y: y - 6,
            width: Math.max(...r.map((b) => b.right)) - x + 12,
            height: Math.max(...r.map((b) => b.bottom)) - y + 12,
        };
    });
    await page.screenshot({ path: file, clip: box });
    console.log('wrote', file);
}

await shot(fills, 'docs/widgets/assets/fuellstandsanzeige/bar-inside.png');
await shot([universal], 'docs/widgets/assets/custom-layout/progress-colors.png');
await browser.close();
