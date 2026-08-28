// Verifies that a timeseries chart draws history and JSON series on one shared time axis (#595).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-mixed-sources.mjs
//
// The case from the issue: measured values come from InfluxDB, the solar forecast comes as a JSON
// array in a datapoint. Before, the widget mode decided the source for ALL series, so the two
// could not be shown together. Now the source is per series, and a JSON payload whose labels are
// timestamps plots straight onto the time axis — which then also extends into the future, since
// the forecast reaches beyond "now". What is checked here:
//
//   • both series render, each with its own point count
//   • the JSON series sits at its payload's timestamps, in chronological order
//   • the axis frames the forecast's future window, not just the history window
//   • non-timestamp labels are dropped instead of landing at an arbitrary x
//   • the pure JSON mode still works unchanged (category axis, no history)
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const HOUR = 3600000;
// Anchored on a whole hour so the expected timestamps stay exact across the round trip.
const T0 = Math.floor(Date.now() / HOUR) * HOUR;
// Forecast: four hourly points, the first one an hour into the future.
const FORECAST = [1, 2, 3, 4].map((i) => ({ ts: T0 + i * HOUR, val: i * 500 }));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate((forecast) => {
    const vals = {
        'demo.power': 1500,
        // Timestamped payload — the shape the issue reports (epoch ms as a string).
        'demo.forecast': JSON.stringify(forecast.map((p) => ({ ts: String(p.ts), val: p.val }))),
        // Same values, but keyed by a weekday name: no place on a time axis.
        'demo.forecastCat': JSON.stringify([
            { label: 'Mo', val: 500 },
            { label: 'Di', val: 1000 },
        ]),
    };
    window.__auraShot.mock(vals);
    // mock() alone is overwritten on remount, when the widget re-reads the datapoint through
    // getState — the server-side copy has to carry the same values.
    window.__auraShot.mockServerState(vals);
    window.__auraShot.enableHistory(true);
}, FORECAST);

let caseNo = 0;
/** Widget with one history series and one JSON series, both on the shared time axis. */
const mixedWidget = (jsonSeries) => ({
    // A fresh id per case: a reused one lets echarts keep the previous canvas around long enough
    // for a read to land on the old option.
    id: `w-mixed-${++caseNo}`,
    type: 'echart',
    title: 'Leistung + Prognose',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 30, h: 14 },
    options: {
        echartMode: 'timeseries',
        echartShowCurrent: false,
        echartRange: '24h',
        echartSeries: [
            {
                id: 's1',
                name: 'Ist',
                datapointId: 'demo.power',
                chartType: 'line',
                source: 'history',
                historyInstance: 'history.0',
                yAxisIndex: 0,
            },
            { id: 's2', name: 'Prognose', chartType: 'bar', source: 'json', yAxisIndex: 0, ...jsonSeries },
        ],
    },
});

const show = async (widget) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    await page.locator('.react-grid-item [_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
};

/** What the chart plots per series, once both series have arrived. */
const plotted = async (wantSeries) => {
    const got = await page.waitForFunction(
        (n) => {
            const s = window.__auraShot.chartSeries();
            return s && s.length === n && s.every((e) => e.points > 0) ? s : null;
        },
        wantSeries,
        { timeout: 15000 },
    );
    return got.jsonValue();
};

const xExtent = async () => {
    const got = await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return a && Array.isArray(a.xExtent) ? a.xExtent : null;
        },
        { timeout: 15000 },
    );
    return got.jsonValue();
};

// ── 1. History and JSON side by side ────────────────────────────────────────────
await show(mixedWidget({ datapointId: 'demo.forecast', jsonLabelKey: 'ts', jsonValueKey: 'val' }));
{
    const series = await plotted(2);
    const hist = series.find((s) => s.name === 'Ist');
    const fc = series.find((s) => s.name === 'Prognose');
    check('both series are drawn', !!hist && !!fc, series.map((s) => `${s.name}:${s.points}`).join(' '));
    check('the history series has data', (hist?.points ?? 0) > 1, `${hist?.points} points`);
    check('the JSON series carries all four forecast points', fc?.points === 4, `${fc?.points} points`);
    check(
        'the JSON series sits at its payload timestamps',
        fc?.first === T0 + HOUR && fc?.last === T0 + 4 * HOUR,
        `first=${fc?.first} last=${fc?.last} (want ${T0 + HOUR} … ${T0 + 4 * HOUR})`,
    );
    check(
        'the history series stays in the past',
        typeof hist?.last === 'number' && hist.last <= T0 + HOUR,
        `last=${hist?.last}`,
    );

    // The whole point of the issue: the window has to grow past "now" for the forecast to be
    // visible at all. A chart still pinned to the history range would cut it off.
    const [min, max] = await xExtent();
    check('the axis frames the forecast window', max >= T0 + 3.5 * HOUR, `max=${max} (want ≥ ${T0 + 3.5 * HOUR})`);
    check('the axis still frames the history window', min <= T0 - 20 * HOUR, `min=${min} (want ≤ ${T0 - 20 * HOUR})`);
}

// ── 2. Category labels have no place on the time axis ───────────────────────────
await show(mixedWidget({ datapointId: 'demo.forecastCat', jsonLabelKey: 'label', jsonValueKey: 'val' }));
{
    const series = await page.waitForFunction(
        () => {
            const s = window.__auraShot.chartSeries();
            return s && s.length === 2 && s.some((e) => e.points > 0) ? s : null;
        },
        { timeout: 15000 },
    );
    const list = await series.jsonValue();
    const hist = list.find((s) => s.name === 'Ist');
    const fc = list.find((s) => s.name === 'Prognose');
    check('non-timestamp labels are dropped', fc?.points === 0, `${fc?.points} points`);
    check('the history series is unaffected by them', (hist?.points ?? 0) > 1, `${hist?.points} points`);
}

// ── 3. The JSON mode reads every series out of its value, whatever `source` says ─
// The mode used to rewrite every series to `source: json`, which flattened a configured chart on
// the way through (a look into another mode and back left a JSON series reading history). It now
// overrides the source only where the data is read, so a series carrying `history` — or nothing at
// all — still plots its payload while the widget is in the JSON mode.
await page.evaluate(() =>
    window.__auraShot.showWidgets([
        {
            id: 'w-mixed-jsonmode-src',
            type: 'echart',
            title: 'Prognose',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 30, h: 14 },
            options: {
                echartMode: 'json',
                echartShowCurrent: false,
                echartSeries: [
                    {
                        id: 's1',
                        name: 'Prognose',
                        datapointId: 'demo.forecastCat',
                        chartType: 'bar',
                        // Deliberately NOT 'json' — the mode decides.
                        source: 'history',
                        historyInstance: 'history.0',
                        jsonLabelKey: 'label',
                        jsonValueKey: 'val',
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    ]),
);
await page.locator('.react-grid-item [_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
{
    const got = await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return a?.xAxis?.type ? a.xAxis : null;
        },
        { timeout: 15000 },
    );
    const axis = await got.jsonValue();
    check('the JSON mode overrides a stored history source', axis.type === 'category', `type=${axis.type}`);
    check(
        'and plots the payload, not the history',
        JSON.stringify(axis.data) === JSON.stringify(['Mo', 'Di']),
        JSON.stringify(axis.data),
    );
}

// ── 4. The pure JSON mode is unchanged ─────────────────────────────────────────
await page.evaluate(() =>
    window.__auraShot.showWidgets([
        {
            id: 'w-mixed-jsonmode',
            type: 'echart',
            title: 'Prognose',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 30, h: 14 },
            options: {
                echartMode: 'json',
                echartShowCurrent: false,
                echartSeries: [
                    {
                        id: 's1',
                        name: 'Prognose',
                        datapointId: 'demo.forecastCat',
                        chartType: 'bar',
                        source: 'json',
                        jsonLabelKey: 'label',
                        jsonValueKey: 'val',
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    ]),
);
await page.locator('.react-grid-item [_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });
{
    const got = await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return a?.xAxis?.type ? a.xAxis : null;
        },
        { timeout: 15000 },
    );
    const axis = await got.jsonValue();
    check('the JSON mode keeps its category axis', axis.type === 'category', `type=${axis.type}`);
    check('and its labels', JSON.stringify(axis.data) === JSON.stringify(['Mo', 'Di']), JSON.stringify(axis.data));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length === 0 ? 0 : 1);
