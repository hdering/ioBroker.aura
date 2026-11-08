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
const reverseRequests = [];
await page.route(/\/proxy\?url=/, (r) => {
    const target = decodeURIComponent(new URL(r.request().url()).searchParams.get('url') ?? '');
    if (target.includes('photon.komoot.io/reverse')) {
        reverseRequests.push(target);
        return r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                features: [
                    {
                        properties: {
                            street: 'Am Schnocksgraben',
                            housenumber: '4',
                            city: 'Vettweiß',
                            country: 'Deutschland',
                        },
                    },
                ],
            }),
        });
    }
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

// ── 6b. Recorded tracks: start dot + direction arrow ───────────────────────
{
    await render(
        { lines: [{ id: 't4', source: 'json', dp: 'test.0.t4' }] },
        {
            'test.0.t4': JSON.stringify([
                [50, 10],
                [50.1, 10.2],
            ]),
        },
    );
    await linePath('t4').waitFor({ timeout: 8000 });
    check('track ends in a direction arrow', (await page.locator('.aura-map-arrow').count()) === 1);
}

// ── 6c. Line chips: one line at a time, or each on its own ─────────────────
{
    const two = {
        'test.0.c1': JSON.stringify({
            name: 'Ich',
            points: [
                [50, 10],
                [50.1, 10.1],
                [50.1, 10.3],
            ],
        }),
        'test.0.c2': JSON.stringify({
            name: 'Heike',
            points: [
                [50, 10.5],
                [50.1, 10.6],
                [50.2, 10.5],
            ],
        }),
    };
    const lines2 = [
        { id: 'c1', source: 'json', dp: 'test.0.c1' },
        { id: 'c2', source: 'json', dp: 'test.0.c2' },
    ];
    await render({ lines: lines2, lineChips: true }, two);
    await linePath('c1').waitFor({ timeout: 8000 });
    const chipText = await page.locator('[data-aura-map-line-chip]').allTextContents();
    check('one chip per line, named from the data', chipText.join(',') === 'Ich,Heike', chipText.join(','));
    check('single mode: only the first line drawn', (await linePath('c2').count()) === 0);
    await page.locator('[data-aura-map-line-chip="c2"]').click();
    await linePath('c2').waitFor({ timeout: 8000 });
    check('tapping a chip switches the line', (await linePath('c1').count()) === 0);
    check(
        'active chip is pressed',
        (await page.locator('[data-aura-map-line-chip="c2"]').getAttribute('aria-pressed')) === 'true',
    );

    await render({ lines: lines2, lineChips: true, lineChipsMulti: true }, two);
    await linePath('c2').waitFor({ timeout: 8000 });
    check('multi mode: all lines drawn', (await linePath('c1').count()) === 1);
    await page.locator('[data-aura-map-line-chip="c1"]').click();
    await page.waitForTimeout(300);
    check(
        'multi mode: a chip hides its line',
        (await linePath('c1').count()) === 0 && (await linePath('c2').count()) === 1,
    );
}

// ── 6d. Day bar + timeline from a position history ─────────────────────────
{
    const now = Date.now();
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const today = d.getTime();
    const span = now - today; // whatever time of day the test runs at
    const at = (frac) => today + Math.floor(span * frac);
    const home = { lat: 50.7286, lon: 6.6006 };
    const away = (k) => ({ lat: 50.7286 + 0.01 * k, lon: 6.6006 + 0.01 * k });
    const yesterday = today - 12 * 3_600_000;
    const series = [
        [yesterday, JSON.stringify(away(5))],
        [yesterday + 60_000, JSON.stringify(away(6))],
        [at(0.001), JSON.stringify(home)],
        [at(0.3), JSON.stringify(home)],
        [at(0.35), JSON.stringify(away(1))],
        [at(0.4), JSON.stringify(away(2))],
        [at(0.45), JSON.stringify(away(1))],
        [at(0.5), JSON.stringify(home)],
        [at(0.9), JSON.stringify(home)],
    ];
    await page.evaluate((s) => {
        window.__auraShot.mockObject({ 'test.0.pos': { common: { custom: { 'history.0': { enabled: true } } } } });
        window.__auraShot.mockHistory({ 'test.0.pos': s });
    }, series);
    reverseRequests.length = 0;
    // A tiny stay threshold so the test works at any time of day (the "day" may be minutes old).
    const stayMinutes = Math.max(0.01, (span * 0.2) / 60_000);
    await render(
        {
            markers: [{ id: 'home', mode: 'static', label: 'Home', lat: home.lat, lon: home.lon }],
            lines: [{ id: 'd1', source: 'history', dp: 'test.0.pos' }],
            dayNav: true,
            timeline: true,
            stayMinutes,
        },
        { 'test.0.pos': JSON.stringify(home) },
    );
    await linePath('d1').waitFor({ timeout: 8000 });
    check('paging bar shown (the charts’ bar, #929)', (await page.locator('[data-testid="echart-nav"]').count()) === 1);
    check('next day disabled on today', await page.locator('[data-testid="echart-nav-next"]').isDisabled());
    await page.locator('[data-aura-map-timeline-row]').first().waitFor({ timeout: 8000 });
    const kinds = await page
        .locator('[data-aura-map-timeline-row]')
        .evaluateAll((els) => els.map((e) => e.dataset.auraMapTimelineRow).join(','));
    check('timeline: stay, trip, stay', kinds === 'stay,move,stay', kinds);
    const tl = await page.locator('[data-aura-map-timeline]').textContent();
    check('stay at a marker is named after it, with ★', tl.includes('Home') && tl.includes('★'), tl);
    await page
        .waitForFunction(
            () => document.querySelector('[data-aura-map-timeline]')?.textContent?.includes('Vettweiß'),
            null,
            { timeout: 8000 },
        )
        .catch(() => {});
    const tl2 = await page.locator('[data-aura-map-timeline]').textContent();
    check('stay shows its reverse-geocoded address', tl2.includes('Am Schnocksgraben 4, Vettweiß, Deutschland'), tl2);
    check('trip row says on the way', tl2.includes('Unterwegs') || tl2.includes('On the way'));
    check('reverse geocoding cached per place', reverseRequests.length === 1, String(reverseRequests.length));
    await page.locator('[data-aura-map-timeline-row="move"]').click();
    await page.waitForTimeout(800);

    // Yesterday: the other track, and the timeline follows the day.
    await page.locator('[data-testid="echart-nav-prev"]').click();
    await page.waitForTimeout(800);
    check('next day enabled on yesterday', !(await page.locator('[data-testid="echart-nav-next"]').isDisabled()));
    const vy = await vertexCount('d1').catch(() => 0);
    check('yesterday shows its own points only', vy === 2, String(vy));
    await page.locator('[data-testid="echart-nav-today"]').click();
    await page.waitForTimeout(800);
    check('⇥ returns to today', await page.locator('[data-testid="echart-nav-next"]').isDisabled());

    // Range chips (#929): a week holds yesterday's points too; paging steps by the week.
    await render(
        {
            lines: [{ id: 'd1', source: 'history', dp: 'test.0.pos' }],
            rangeChips: ['24h', '7d'],
            dayNav: true,
        },
        { 'test.0.pos': JSON.stringify(home) },
    );
    await linePath('d1').waitFor({ timeout: 8000 });
    check(
        'first chip is lit on open',
        (await page.locator('[data-aura-map-range="24h"]').getAttribute('aria-pressed')) === 'true',
    );
    // Leaflet thins the drawn path itself — the length in the info box counts every point.
    const km = async () => parseFloat(((await infoRows())[0] ?? '').replace(',', '.').match(/[\d.]+/)?.[0] ?? '0');
    const k24 = await km();
    await page.locator('[data-aura-map-range="7d"]').click();
    await page.waitForTimeout(800);
    const k7 = await km();
    check('7 days add yesterday’s points', k24 > 0 && k7 > k24 + 1, `${k24} km → ${k7} km`);
    const label = (await page.locator('[data-testid="echart-nav-date"]').textContent()) ?? '';
    check('the date button shows a week', /–/.test(label), label);

    // The range datapoint picks the chip (the same DP a chart writes).
    await render(
        {
            lines: [{ id: 'd1', source: 'history', dp: 'test.0.pos' }],
            rangeChips: ['24h', '7d'],
            navRangeDp: 'test.0.range',
        },
        { 'test.0.pos': JSON.stringify(home), 'test.0.range': '7d' },
    );
    await linePath('d1').waitFor({ timeout: 8000 });
    await page.waitForTimeout(600);
    check(
        'range datapoint selects the chip',
        (await page.locator('[data-aura-map-range="7d"]').getAttribute('aria-pressed')) === 'true',
    );

    // A link group: a chip picked on one map moves the other (charts share the same store, see
    // chart-nav.mjs for the chart side).
    await page.evaluate(() => {
        const map = (id, x) => ({
            id,
            type: 'map',
            title: 'Karte',
            datapoint: '',
            layout: 'default',
            gridPos: { x, y: 0, w: 12, h: 12 },
            options: { rangeChips: ['24h', '7d'], navGroup: 'reise' },
        });
        window.__auraShot.showWidgets([map('w-map-ga', 0), map('w-map-gb', 12)]);
    });
    const chipsOf = (id) => page.locator(`.react-grid-item:has([data-aura-map-range]) >> nth=${id}`);
    await chipsOf(1).locator('[data-aura-map-range="7d"]').waitFor({ timeout: 15000 });
    await chipsOf(0).locator('[data-aura-map-range="7d"]').click();
    await page.waitForTimeout(500);
    check(
        'the linked map follows the chip',
        (await chipsOf(1).locator('[data-aura-map-range="7d"]').getAttribute('aria-pressed')) === 'true',
    );

    // maxPoints simplifies over the whole window instead of keeping the newest points.
    await render(
        {
            lines: [{ id: 'd1', source: 'history', dp: 'test.0.pos', maxPoints: 3 }],
            rangeChips: ['7d'],
        },
        { 'test.0.pos': JSON.stringify(home) },
    );
    await linePath('d1').waitFor({ timeout: 8000 });
    const vs = await vertexCount('d1').catch(() => 0);
    check('maxPoints 3 draws three points', vs === 3, String(vs));
    await page.evaluate(() => window.__auraShot.mockHistory(false));
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
    // Every section starts folded; marker cards start folded too. Markers, lines and chips are
    // topics in "Datenpunkte", map type and view topics in "Einstellungen".
    const dpSection = modal.locator('details[data-aura-config-section="datapoints"]');
    const markerSection = dpSection
        .locator('[data-aura-subgroup]')
        .filter({ has: page.locator('span:text-is("Marker")') });
    const sectionState = await page.evaluate(() => ({
        open: [...document.querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')]
            .filter((d) => d.open)
            .map((d) => d.getAttribute('data-aura-config-section')),
        topics: [
            ...document.querySelectorAll(
                '.aura-widget-edit-modal [data-aura-subgroup] > div > span > span:first-child',
            ),
        ].map((s) => s.textContent),
    }));
    check(
        'all map sections folded on open',
        sectionState.open.length === 0 &&
            ['Marker', 'Linien', 'Schnellzugriff-Chips', 'Kartentyp', 'Ansicht'].every((t) =>
                sectionState.topics.includes(t),
            ),
        JSON.stringify(sectionState),
    );
    check(
        'marker count in the topic heading',
        (await markerSection.locator(':scope > div').first().textContent()).includes('2'),
    );
    await dpSection.locator(':scope > summary').click();
    check(
        'marker cards start folded',
        (await markerSection.locator('[data-aura-map-item-toggle][aria-expanded="false"]').count()) === 2 &&
            (await markerSection.locator('select').count()) === 0,
    );
    await markerSection.locator('[data-aura-map-item-toggle]').first().click();
    check('a marker card unfolds', (await markerSection.locator('select').count()) === 1);
    await markerSection.locator('[data-aura-map-item-toggle]').first().click();
    check('and folds again', (await markerSection.locator('select').count()) === 0);
    await modal.locator('[data-aura-map-add-line]').click();
    check('"+ Linie" keeps the datapoints section open', (await dpSection.getAttribute('open')) !== null);
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
    check('no tile-server fields for preset maps', (await modal.locator('[data-aura-map-custom-tiles]').count()) === 0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

// ── 8. Own tile server: older maps keep it, and it stays editable (#934) ────
{
    const tileUrl = 'https://tiles.example.invalid/{z}/{x}/{y}.png';
    await render({ markers, followMarkers: false, zoom: 8, tileUrl, mapStyle: 'satellite' });
    const id = `w-map-${n}`;
    const srcs = await page.evaluate(() => [...document.querySelectorAll('img.leaflet-tile')].map((i) => i.src));
    check(
        'configured tile server is still used',
        srcs.length > 0 && srcs.every((s) => s.startsWith('https://tiles.example.invalid/')),
        srcs[0],
    );
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').first().click();
    const custom = page.locator('[data-aura-map-custom-tiles]');
    const modal = page.locator('.aura-widget-edit-modal');
    await modal.locator('details[data-aura-config-section="settings"] > summary').click();
    const styleSelect = modal.locator('select').filter({ hasText: 'Eigener Kachel-Server' });
    check('older map shows the own server as type', (await styleSelect.inputValue()) === 'custom');
    const urlInput = custom.locator('input').first();
    check(
        'tile url is editable',
        (await urlInput.inputValue()) === tileUrl && !(await urlInput.evaluate((el) => el.readOnly)),
    );
    await urlInput.fill('https://tiles.example.invalid/{z}/{x}.png');
    check('missing placeholder is pointed out', (await custom.textContent()).includes('Es fehlt: {y}'));
    await urlInput.fill(tileUrl);
    await custom.locator('input[placeholder="22"]').fill('16');
    let opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('max zoom is stored', opts?.tileMaxZoom === 16 && opts?.mapStyle === 'custom', JSON.stringify(opts));
    await styleSelect.selectOption('standard');
    opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('a preset drops the tile url', opts?.tileUrl === undefined && opts?.mapStyle === 'standard');
    check('fields gone for a preset', (await custom.count()) === 0);
    await styleSelect.selectOption('custom');
    opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('switching back restores the url', opts?.tileUrl === tileUrl, String(opts?.tileUrl));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
