// Verifies the map widget zooms past the tile servers' last level (issue #837).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/map-zoom.mjs
//
// Leaflet requests a tile's level in its url and scales the level's container
// with a CSS transform, so both are read straight off the DOM: at zoom 22 an OSM
// tile must come from level 19 and its level be drawn 2^3 = 8 times larger.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT = process.env.AURA_SHOT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const mapWidget = (options) => ({
    id: `w-map-${Math.random().toString(36).slice(2, 8)}`,
    type: 'map',
    title: 'Karte',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 16, h: 12 },
    options: {
        markers: [{ id: 'm1', mode: 'static', label: 'Garten', lat: 51.1657, lon: 10.4515, emoji: '🌱' }],
        followMarkers: false,
        center: [51.1657, 10.4515],
        ...options,
    },
});

async function render(options) {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), mapWidget(options));
    await page.waitForFunction(() => !!document.querySelector('img.leaflet-tile'), null, { timeout: 15000 });
    await page.waitForTimeout(500);
}

/** Levels in the tile urls and the drawn tile width of the base layer. */
const tiles = () =>
    page.evaluate(() => {
        const imgs = [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')];
        const levels = [...new Set(imgs.map((i) => (i.src.match(/\/(\d+)\/\d+\/\d+(\.png)?$/) ?? [])[1]))];
        const level = imgs[0]?.closest('.leaflet-tile-container');
        const scale = level ? new DOMMatrix(getComputedStyle(level).transform).a : 0;
        return { levels, scale: Math.round(scale * 100) / 100 };
    });
const zoomInDisabled = () => page.evaluate(() => !!document.querySelector('.leaflet-control-zoom-in.leaflet-disabled'));

// ── 1. Zoom 22 on the standard map: level-19 tiles, scaled up ×8 ─────────────
{
    await render({ zoom: 22, showStyleChips: true });
    const t = await tiles();
    check('standard map requests level-19 tiles at zoom 22', t.levels.join(',') === '19', t.levels.join(','));
    check('tiles drawn 8× larger', t.scale === 8, `scale ${t.scale}`);
    check('zoom-in button is disabled at 22', await zoomInDisabled());
    if (SHOT) await page.locator('.leaflet-container').screenshot({ path: `${SHOT}/zoom22-standard.png` });
}

// ── 2. Style switch: terrain stops at level 17 (×32), back to 19 ────────────
{
    await page.locator('[data-aura-map-style="terrain"]').click();
    await page.waitForTimeout(600);
    let t = await tiles();
    check('terrain requests level-17 tiles', t.levels.join(',') === '17', t.levels.join(','));
    check('terrain tiles drawn 32× larger', t.scale === 32, `scale ${t.scale}`);

    await page.locator('[data-aura-map-style="satellite"]').click();
    await page.waitForTimeout(600);
    t = await tiles();
    check('satellite back to level 19', t.levels.join(',') === '19', t.levels.join(','));
    if (SHOT) await page.locator('.leaflet-container').screenshot({ path: `${SHOT}/zoom22-satellite.png` });
}

// ── 3. Below the native level nothing is scaled ─────────────────────────────
{
    await render({ zoom: 16 });
    const t = await tiles();
    check('zoom 16 uses its own level', t.levels.join(',') === '16', t.levels.join(','));
    check('zoom 16 tiles unscaled', t.scale === 1, `scale ${t.scale}`);
    check('zoom-in still possible at 16', !(await zoomInDisabled()));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
