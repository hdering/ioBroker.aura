// Map widget lines in the browser: a computed route between two markers (#790)
// and recorded tracks from a JSON datapoint and from a position history (#410).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/map-lines.mjs
//
// The routing service is stubbed through page.route on Aura's /proxy, so the test
// never hits routing.openstreetmap.de. Lines carry `data-aura-map-line` (the line
// id) on their SVG path; the info box rows carry `data-aura-map-line-info`.
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

// Tiles are irrelevant here — answer them empty so nothing waits on the network.
await page.route(/tile\.openstreetmap\.org|arcgisonline|opentopomap/, (r) => r.fulfill({ status: 204, body: '' }));

const routeRequests = [];
await page.route(/\/proxy\?url=/, (r) => {
    const target = decodeURIComponent(new URL(r.request().url()).searchParams.get('url') ?? '');
    if (!target.includes('routing.openstreetmap.de')) return r.continue();
    routeRequests.push(target);
    // A three-point "road" with a kink, 12.4 km / 14 min.
    return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            code: 'Ok',
            routes: [
                {
                    distance: 12400,
                    duration: 840,
                    geometry: {
                        coordinates: [
                            [13.4, 52.5],
                            [13.45, 52.56],
                            [13.5, 52.6],
                        ],
                    },
                },
            ],
        }),
    });
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

let n = 0;
/** Renders a map widget (fresh id per call — the harness keeps known ids mounted). */
async function render(options, values = {}) {
    const w = {
        id: `w-map-${++n}`,
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
    await page.waitForTimeout(400);
}

const linePath = (id) => page.locator(`path[data-aura-map-line="${id}"]`);
const infoRows = () => page.locator('[data-aura-map-line-info]').allTextContents();
/** Number of vertices in a line's SVG path ("M x y L x y L …"). */
const vertexCount = (id) => linePath(id).evaluate((el) => (el.getAttribute('d') ?? '').match(/[ML]/g)?.length ?? 0);

const markers = [
    { id: 'home', mode: 'static', label: 'Zuhause', lat: 52.5, lon: 13.4 },
    { id: 'fuel', mode: 'static', label: 'Tankstelle', lat: 52.6, lon: 13.5 },
];

// ── 1. No lines: nothing changes for existing maps ──────────────────────────
{
    await render({ markers });
    check('no line paths without lines', (await page.locator('path[data-aura-map-line]').count()) === 0);
    check('no info box without lines', (await infoRows()).length === 0);
}

// ── 2. Route between two markers (#790) ─────────────────────────────────────
{
    routeRequests.length = 0;
    await render({
        markers,
        lines: [{ id: 'r1', source: 'route', fromMarkerId: 'home', toMarkerId: 'fuel', profile: 'bike' }],
    });
    await linePath('r1').waitFor({ timeout: 8000 });
    check('route requested once', routeRequests.length === 1, String(routeRequests.length));
    check('route uses the bike profile', routeRequests[0]?.includes('/routed-bike/') ?? false, routeRequests[0]);
    check('route drawn along the road geometry', (await vertexCount('r1')) === 3, String(await vertexCount('r1')));
    const rows = await infoRows();
    check(
        'info box: label from markers, km and travel time',
        rows.length === 1 &&
            rows[0].includes('Zuhause → Tankstelle') &&
            rows[0].includes('12') &&
            rows[0].includes('14 min'),
        rows.join(' | '),
    );
    const stroke = await linePath('r1').getAttribute('stroke');
    check('route default colour', stroke === '#2563eb', String(stroke));
}

// ── 3. Route with a missing end: no line, no request ────────────────────────
{
    routeRequests.length = 0;
    await render({ markers, lines: [{ id: 'r2', source: 'route', fromMarkerId: 'home' }] });
    await page.waitForTimeout(900);
    check('no request without an end marker', routeRequests.length === 0);
    check('no route drawn without an end marker', (await linePath('r2').count()) === 0);
}

// ── 4. JSON track (the example from #410) ───────────────────────────────────
{
    const track = {
        name: 'Fahrt vom 04.07.2026',
        lineColor: '#1976d2',
        points: [
            { lat: 51.05041, lon: 13.73731, timestamp: '2026-07-04T12:00:00+02:00', speed: 0, accuracy: 8 },
            { lat: 51.05082, lon: 13.7381, timestamp: '2026-07-04T12:00:10+02:00', speed: 18, accuracy: 7 },
            { lat: 51.05135, lon: 13.7392, timestamp: '2026-07-04T12:00:20+02:00', speed: 31, accuracy: 6 },
            { lat: 51.0521, lon: 13.7409, timestamp: '2026-07-04T12:00:30+02:00', speed: 43, accuracy: 6 },
        ],
    };
    await render(
        { lines: [{ id: 't1', source: 'json', dp: 'test.0.track', showPoints: true }] },
        { 'test.0.track': JSON.stringify(track) },
    );
    await linePath('t1').waitFor({ timeout: 8000 });
    check('JSON track: all points on the line', (await vertexCount('t1')) === 4, String(await vertexCount('t1')));
    check('JSON track: lineColor from the value', (await linePath('t1').getAttribute('stroke')) === '#1976d2');
    const rows = await infoRows();
    check('JSON track: name in the info box', rows[0]?.includes('Fahrt vom 04.07.2026') ?? false, rows.join(' | '));
    const dots = page.locator('path.leaflet-interactive:not([data-aura-map-line])');
    check('JSON track: one dot per point', (await dots.count()) === 4, String(await dots.count()));

    // The map fits to the whole track: every dot lies inside the map box.
    const box = await page.locator('.leaflet-container').boundingBox();
    const inside = await dots.evaluateAll(
        (els, b) =>
            els.every((el) => {
                const r = el.getBoundingClientRect();
                return r.left >= b.x && r.right <= b.x + b.width && r.top >= b.y && r.bottom <= b.y + b.height;
            }),
        box,
    );
    check('JSON track: view fitted to the track', inside);

    await dots.nth(2).click({ force: true });
    const popup = await page
        .locator('.leaflet-popup-content')
        .textContent({ timeout: 3000 })
        .catch(() => '');
    check('dot popup shows speed + accuracy', popup.includes('31 km/h') && popup.includes('± 6 m'), popup);
}

// ── 5. Track from the history of a position DP ──────────────────────────────
{
    const now = Date.now();
    const series = [
        [now - 50 * 60_000, JSON.stringify({ lat: 48.1, lon: 11.5 })],
        [now - 40 * 60_000, JSON.stringify({ lat: 48.13, lon: 11.52 })],
        [now - 30 * 60_000, JSON.stringify({ lat: 48.13, lon: 11.52 })], // parked
        [now - 20 * 60_000, '48.1,11.54'],
        [now - 10 * 60_000, JSON.stringify({ lat: 48.13, lon: 11.56, speed: 30 })],
    ];
    await page.evaluate((s) => {
        window.__auraShot.mockObject({
            'test.0.position': { common: { custom: { 'history.0': { enabled: true } } } },
        });
        window.__auraShot.mockHistory({ 'test.0.position': s });
    }, series);
    await render(
        { lines: [{ id: 'h1', source: 'history', dp: 'test.0.position', historyHours: 2 }] },
        { 'test.0.position': JSON.stringify({ lat: 48.1, lon: 11.58 }) },
    );
    await linePath('h1').waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    // 4 distinct history positions + the live value.
    check(
        'history track: distinct points + live value',
        (await vertexCount('h1')) === 5,
        String(await vertexCount('h1')),
    );
    check('history track: default colour', (await linePath('h1').getAttribute('stroke')) === '#e11d48');
    await page.evaluate(() => window.__auraShot.mockHistory(false));
}

// ── 6. Info box can be moved or hidden ──────────────────────────────────────
{
    await render(
        { lines: [{ id: 't2', source: 'json', dp: 'test.0.t2' }], lineInfo: 'off' },
        {
            'test.0.t2': JSON.stringify([
                [50, 10],
                [50.1, 10.1],
            ]),
        },
    );
    await linePath('t2').waitFor({ timeout: 8000 });
    check('lineInfo off hides the box', (await infoRows()).length === 0);

    await render(
        { lines: [{ id: 't3', source: 'json', dp: 'test.0.t3' }], lineInfo: 'top-right' },
        {
            'test.0.t3': JSON.stringify([
                [50, 10],
                [50.1, 10.1],
            ]),
        },
    );
    await page.locator('[data-aura-map-line-info]').first().waitFor({ timeout: 8000 });
    const map = await page.locator('.leaflet-container').boundingBox();
    const row = await page.locator('[data-aura-map-line-info]').first().boundingBox();
    check(
        'lineInfo top-right places the box there',
        row.y < map.y + map.height / 2 && row.x > map.x + map.width / 2,
        JSON.stringify({ row, map }),
    );
}

// ── 7. Editor: "+ Linie" adds a route preset to the first two markers ───────
{
    await render({ markers });
    const id = `w-map-${n}`;
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').first().click();
    // The widget editor is a CenteredModal without a class of its own; the hooks below are unique.
    const modal = page;
    await modal.locator('[data-aura-map-add-line]').click();
    const opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    const line = opts?.lines?.[0];
    check(
        'editor adds a route between the first two markers',
        line?.source === 'route' && line.fromMarkerId === 'home' && line.toMarkerId === 'fuel',
        JSON.stringify(line),
    );
    await modal.locator('select').filter({ hasText: 'Strecke aus Verlauf' }).selectOption('history');
    const after = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('editor switches the line source', after?.lines?.[0]?.source === 'history');
    check(
        'history fields appear',
        (await modal.locator('input[placeholder="Positions-DP mit Verlauf"]').count()) === 1 &&
            (await modal.locator('input[placeholder="24"]').count()) === 1,
    );
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
