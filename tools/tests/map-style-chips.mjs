// Verifies the runtime map-type switcher of the map widget (issue #564).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/map-style-chips.mjs
//
// The chips carry `data-aura-map-style` (the preset key) and `aria-pressed` (the
// active type), so the switcher can be driven from the DOM without loading tiles:
// what a click actually changes is read off the Leaflet attribution control and
// the tile `img` urls, both of which are set synchronously by Leaflet.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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

// Generous timeout: a cold dev server transforms the whole app on this first load.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// A static marker keeps the widget free of datapoints, so nothing has to be mocked.
const mapWidget = (options) => ({
    id: 'w-map',
    type: 'map',
    title: 'Karte',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 16, h: 12 },
    options: {
        markers: [{ id: 'm1', mode: 'static', label: 'Haus', lat: 51.1657, lon: 10.4515, emoji: '🏠' }],
        followMarkers: false,
        zoom: 8,
        ...options,
    },
});

/** Renders the map widget and waits until Leaflet has painted its container. */
async function render(options) {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), mapWidget(options));
    await page.waitForFunction(() => !!document.querySelector('.leaflet-container'), { timeout: 15000 });
    // Leaflet lays out its panes and the attribution control one frame later.
    await page.waitForTimeout(350);
}

const chips = () => page.locator('[data-aura-map-style]');
const activeStyle = () =>
    page.evaluate(
        () => document.querySelector('[data-aura-map-style][aria-pressed="true"]')?.dataset.auraMapStyle ?? null,
    );
const attribution = () =>
    page.evaluate(() => document.querySelector('.leaflet-control-attribution')?.textContent ?? '');
const tileHosts = () =>
    page.evaluate(() => [
        ...new Set([...document.querySelectorAll('img.leaflet-tile')].map((i) => new URL(i.src).hostname)),
    ]);

// ── 1. Off by default — existing maps keep their look ────────────────────────
{
    await render({});
    check('no switcher without showStyleChips', (await chips().count()) === 0);
}

// ── 2. Enabled: one chip per preset, the configured type is the active one ───
{
    await render({ showStyleChips: true, mapStyle: 'satellite' });
    check('switcher offers all three presets', (await chips().count()) === 3, `${await chips().count()} chips`);
    check('chips are labelled', (await chips().first().textContent())?.trim() === 'Karte');
    check('configured type is active', (await activeStyle()) === 'satellite', String(await activeStyle()));
    check('satellite tiles are loaded', (await attribution()).includes('Esri'), await attribution());
}

// ── 3. Clicking a chip switches the tile source at runtime ──────────────────
{
    await page.locator('[data-aura-map-style="terrain"]').click();
    await page.waitForTimeout(400);
    check('clicked type becomes active', (await activeStyle()) === 'terrain', String(await activeStyle()));
    check('attribution follows the type', (await attribution()).includes('OpenTopoMap'), await attribution());
    const hosts = await tileHosts();
    check(
        'tiles are requested from the new source',
        hosts.some((h) => h.includes('opentopomap')),
        hosts.join(', '),
    );

    await page.locator('[data-aura-map-style="standard"]').click();
    await page.waitForTimeout(400);
    check('switching back works', (await activeStyle()) === 'standard', String(await activeStyle()));
    check('attribution back to OSM', !(await attribution()).includes('OpenTopoMap'), await attribution());
}

// ── 4. The offered types are configurable ───────────────────────────────────
{
    await render({ showStyleChips: true, styleChoices: ['standard', 'satellite'] });
    const keys = await chips().evaluateAll((els) => els.map((e) => e.dataset.auraMapStyle));
    check('only the picked types are offered', keys.join(',') === 'standard,satellite', keys.join(','));

    await render({ showStyleChips: true, styleChoices: [] });
    check('an empty pick falls back to all types', (await chips().count()) === 3);
}

// ── 5. Corner placement ─────────────────────────────────────────────────────
{
    /** Where the switcher sits inside the widget, as a fraction of its box. */
    const placement = async () => {
        const map = await page.locator('.leaflet-container').boundingBox();
        const chip = await page.locator('[data-aura-map-style]').first().boundingBox();
        return {
            vertical: chip.y + chip.height / 2 < map.y + map.height / 2 ? 'top' : 'bottom',
            horizontal: chip.x + chip.width / 2 < map.x + map.width / 2 ? 'left' : 'right',
        };
    };

    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        await render({ showStyleChips: true, styleChipsCorner: corner });
        const p = await placement();
        check(`corner ${corner}`, `${p.vertical}-${p.horizontal}` === corner, `${p.vertical}-${p.horizontal}`);
    }
}

// ── 6. Sharing a corner with the quick-access chips must not overlap ─────────
{
    await render({
        showStyleChips: true,
        styleChipsCorner: 'top-right',
        chipsPosition: 'overlay',
        chipsCorner: 'top-right',
        quickViews: [{ id: 'q1', mode: 'static', label: 'Zuhause', lat: 51.1, lon: 10.4, color: '#2563eb' }],
    });
    const quick = await page.getByTitle('Zuhause').boundingBox();
    const style = await page.locator('[data-aura-map-style]').first().boundingBox();
    const overlap = quick.y + quick.height > style.y && style.y + style.height > quick.y;
    check('both chip groups stack instead of overlapping', !overlap, JSON.stringify({ quick, style }));
    check('quick chip stays clickable', await page.getByTitle('Zuhause').isVisible());
}

// ── 7. A custom tile url stays in charge until a type is picked ─────────────
{
    await render({
        showStyleChips: true,
        tileUrl: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
        tileAttribution: 'Custom',
    });
    check('custom tiles win over the presets', (await activeStyle()) === null, String(await activeStyle()));
    check('custom attribution is shown', (await attribution()).includes('Custom'), await attribution());

    await page.locator('[data-aura-map-style="satellite"]').click();
    await page.waitForTimeout(400);
    check(
        'picking a type overrides the custom url',
        (await activeStyle()) === 'satellite',
        String(await activeStyle()),
    );
    check('preset attribution takes over', (await attribution()).includes('Esri'), await attribution());
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
