// Map markers on the same spot (#895): pulled apart so each stays visible, and a
// line chip with `markerId` shows/hides the person's marker together with the track.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/map-marker-spread.mjs
//
// Pins carry `data-aura-map-marker` (the marker id); the box of the surrounding
// `.aura-map-pin` is the pin on screen.
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
await page.route(/tile\.openstreetmap\.org|arcgisonline|opentopomap/, (r) => r.fulfill({ status: 204, body: '' }));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

let n = 0;
/** Renders a map widget (fresh id per call — the harness keeps known ids mounted). */
async function render(options, values = {}) {
    const w = {
        id: `w-map-spread-${++n}`,
        type: 'map',
        title: 'Karte',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 16, h: 12 },
        options,
    };
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mockServerState(v);
            window.__auraShot.mock(v);
            window.__auraShot.showWidgets([w]);
        },
        [w, values],
    );
    await page.waitForFunction(() => !!document.querySelector('.leaflet-container'), { timeout: 15000 });
    await page.waitForTimeout(600);
}

/** Centre of each visible pin, by marker id. */
const pins = () =>
    page.evaluate(() =>
        Object.fromEntries(
            [...document.querySelectorAll('[data-aura-map-marker]')].map((el) => {
                const r = el.closest('.aura-map-pin').getBoundingClientRect();
                return [el.getAttribute('data-aura-map-marker'), [r.left + r.width / 2, r.top + r.height / 2]];
            }),
        ),
    );
const gap = (p, a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);

// The config from the issue: two people, positions via lat/lon DPs.
const markers = [
    { id: 'david', label: 'David', mode: 'latlon', latDp: 'test.0.d.lat', lonDp: 'test.0.d.lon', emoji: '👨' },
    { id: 'tin', label: 'Tin', mode: 'latlon', latDp: 'test.0.t.lat', lonDp: 'test.0.t.lon', emoji: '👩' },
];
const together = { 'test.0.d.lat': 52.5, 'test.0.d.lon': 13.4, 'test.0.t.lat': 52.5, 'test.0.t.lon': 13.4 };

// ── 1. Same spot: both pins visible side by side ────────────────────────────
{
    await render({ markers }, together);
    const p = await pins();
    check('both pins rendered', !!p.david && !!p.tin, JSON.stringify(p));
    if (p.david && p.tin) {
        check('pins pulled apart', gap(p, 'david', 'tin') >= 30, gap(p, 'david', 'tin').toFixed(1));
        check('first marker left, second right', p.david[0] < p.tin[0]);
    }
}

// ── 2. markerSpread: false keeps the old stacking ───────────────────────────
{
    await render({ markers, markerSpread: false }, together);
    const p = await pins();
    check('markerSpread off: pins stacked', p.david && p.tin && gap(p, 'david', 'tin') < 1);
}

// ── 3. Apart: real positions, no offset ─────────────────────────────────────
{
    await render(
        { markers },
        { 'test.0.d.lat': 52.5, 'test.0.d.lon': 13.4, 'test.0.t.lat': 52.6, 'test.0.t.lon': 13.6 },
    );
    const p = await pins();
    const box = await page.locator('.leaflet-container').boundingBox();
    // followMarkers fits both into the view with 30 px padding, so they sit far apart.
    check('markers apart are not moved', p.david && p.tin && gap(p, 'david', 'tin') > box.height / 3);
}

// ── 4. Line chip switches the marker too (markerId) ─────────────────────────
{
    const lines = [
        { id: 'david-track', label: 'David', source: 'json', dp: 'test.0.d.track', markerId: 'david' },
        { id: 'tin-track', label: 'Tin', source: 'json', dp: 'test.0.t.track', markerId: 'tin' },
    ];
    const track = (lat) =>
        JSON.stringify([
            { lat, lon: 13.38 },
            { lat: 52.5, lon: 13.4 },
        ]);
    await render(
        { markers, lines, lineChips: true, lineChipsMulti: true },
        { ...together, 'test.0.d.track': track(52.48), 'test.0.t.track': track(52.52) },
    );
    let p = await pins();
    check('chips on: both markers shown', !!p.david && !!p.tin);

    await page.locator('[data-aura-map-line-chip="tin-track"]').click();
    await page.waitForTimeout(300);
    p = await pins();
    check('chip off hides its marker', !p.tin && !!p.david, Object.keys(p).join());
    check('hidden marker no longer spreads the other', !!p.david);

    await page.locator('[data-aura-map-line-chip="tin-track"]').click();
    await page.waitForTimeout(300);
    p = await pins();
    check('chip on shows the marker again', !!p.tin && !!p.david);

    // Single mode: only the picked person is on the map.
    await render({ markers, lines, lineChips: true }, { ...together, 'test.0.d.track': track(52.48) });
    p = await pins();
    check('single mode: only the first line’s marker', !!p.david && !p.tin, Object.keys(p).join());

    // Without lineChips the link has no effect.
    await render({ markers, lines }, together);
    p = await pins();
    check('without chips: markerId ignored', !!p.david && !!p.tin);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
