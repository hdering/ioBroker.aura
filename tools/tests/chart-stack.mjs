// Verifies stacking in the advanced chart (issue #541).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-stack.mjs
//
// Three parts:
//   1. The timeline alignment (`__auraShot.stackAlign`). ECharts stacks by data index, so two
//      history series with their own timestamps would be added up across unrelated moments —
//      this is the part that can silently produce a wrong sum, and it is pure logic.
//   2. A rendered stacked chart: it comes up without page errors and the current-value block
//      keeps showing each series on its own rather than the stacked total.
//   3. The axis layout (`__auraShot.chartAxes`) — the right axis switching off on its own and
//      the label reserve fitting the labels instead of a fixed strip.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** Digits as rendered, regardless of the active thousands/decimal separator. */
const shows = (text, n) => new RegExp(`(^|[^\\d])${n.replace('.', '[.,]')}([^\\d]|$)`).test(text);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.enableHistory(true));

const align = (series, data) => page.evaluate(([s, d]) => window.__auraShot.stackAlign(s, d), [series, data]);

// ── 1. Two stacked series with their own timestamps share one timeline ───────
{
    const out = await align(
        [
            { stack: true, yAxisIndex: 0 },
            { stack: true, yAxisIndex: 0 },
        ],
        [
            [
                [10, 100],
                [30, 300],
            ],
            [
                [10, 1],
                [20, 2],
            ],
        ],
    );
    check(
        'both series land on the union of timestamps',
        eq(
            out[0].map((p) => p[0]),
            [10, 20, 30],
        ),
        JSON.stringify(out),
    );
    check(
        'a series without a record at that moment carries its last value forward',
        eq(out[0], [
            [10, 100],
            [20, 100],
            [30, 300],
        ]),
        JSON.stringify(out[0]),
    );
    check(
        'the same holds past a series last record',
        eq(out[1], [
            [10, 1],
            [20, 2],
            [30, 2],
        ]),
        JSON.stringify(out[1]),
    );
}

// ── 2. Before a series starts there is null, not a phantom zero ──────────────
{
    const out = await align(
        [
            { stack: true, yAxisIndex: 0 },
            { stack: true, yAxisIndex: 0 },
        ],
        [
            [
                [10, 100],
                [20, 200],
            ],
            [[20, 5]],
        ],
    );
    check(
        'the late series is null before its first record',
        eq(out[1], [
            [10, null],
            [20, 5],
        ]),
        JSON.stringify(out[1]),
    );
}

// ── 3. Each y axis stacks for itself, unstacked series are left alone ────────
{
    const left = [
        [10, 1],
        [30, 3],
    ];
    const right = [[20, 9]];
    const plain = [[25, 7]];
    const out = await align(
        [{ stack: true, yAxisIndex: 0 }, { stack: true, yAxisIndex: 1 }, { yAxisIndex: 0 }],
        [left, right, plain],
    );
    check('a lone stack member keeps its own timestamps', eq(out[0], left), JSON.stringify(out[0]));
    check('the other axis is a separate stack', eq(out[1], right), JSON.stringify(out[1]));
    check('an unstacked series is untouched', eq(out[2], plain), JSON.stringify(out[2]));
}

// ── 4. Three members, unsorted union, duplicate timestamps ───────────────────
{
    const out = await align(
        [
            { stack: true, yAxisIndex: 0 },
            { stack: true, yAxisIndex: 0 },
            { stack: true, yAxisIndex: 0 },
        ],
        [
            [[30, 3]],
            [[10, 1]],
            [
                [10, 5],
                [20, 6],
            ],
        ],
    );
    const ts = out[2].map((p) => p[0]);
    check('the timeline is sorted and deduplicated', eq(ts, [10, 20, 30]), JSON.stringify(ts));
    check(
        'every member has the same length',
        out.every((s) => s.length === 3),
        JSON.stringify(out.map((s) => s.length)),
    );
    check(
        'sums per moment are built from real values only',
        eq(
            ts.map((_, i) => out.reduce((acc, s) => acc + (s[i][1] ?? 0), 0)),
            [6, 7, 10],
        ),
        JSON.stringify(out),
    );
}

// ── 5. Stacked bands are drawn without an outline ────────────────────────────
// The outline of a band runs along the top edge of the band below it, so a series sitting at 0
// would show up as a full-width line with no area under it.
{
    const width = (s) => page.evaluate((cfg) => window.__auraShot.seriesLineWidth(cfg), s);
    check('a stacked area has no outline', (await width({ stack: true, chartType: 'area', lineWidth: 2 })) === 0);
    check(
        'the outline comes back when the series asks for it',
        (await width({ stack: true, chartType: 'area', lineWidth: 3, stackOutline: true })) === 3,
    );
    check('an unstacked area keeps its line', (await width({ chartType: 'area', lineWidth: 2 })) === 2);
    check(
        'a stacked line keeps its line — it has no fill to be seen by',
        (await width({ stack: true, chartType: 'line', lineWidth: 2 })) === 2,
    );
    check('line width 0 is honoured', (await width({ chartType: 'line', lineWidth: 0 })) === 0);
    check('the default is still 2px', (await width({ chartType: 'line' })) === 2);
}

// ── 6. A stacked chart renders and still reports per-series values ───────────
{
    const widget = {
        id: 'w-echart-stack',
        type: 'echart',
        title: 'Hausverbrauch',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            echartMode: 'timeseries',
            echartRange: '24h',
            echartShowCurrent: true,
            echartLeftUnit: 'W',
            decimals: 0,
            echartSeries: [
                {
                    id: 's1',
                    name: 'Speicher',
                    datapointId: 'demo.battery',
                    chartType: 'area',
                    color: '#10b981',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                    stack: true,
                },
                {
                    id: 's2',
                    name: 'Netzbezug',
                    datapointId: 'demo.grid',
                    chartType: 'area',
                    color: '#f59e0b',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                    stack: true,
                },
            ],
        },
    };
    const values = { 'demo.battery': 150, 'demo.grid': 50 };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    try {
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.react-grid-item');
                const txt = el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
                return txt.length > 0 && /\d/.test(txt);
            },
            { timeout: 15000 },
        );
    } catch {
        /* fall through — the checks below report the empty render */
    }
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    check('the stacked chart renders', /\d/.test(text), text);
    check('each series reports its own current value', shows(text, '150') && shows(text, '50'), text);
    check('the current-value block is not the stacked total', !shows(text, '200'), text);
    check('a canvas was drawn', (await page.locator('.react-grid-item canvas').count()) > 0);
}

// ── 7. Axis labels: the right axis switches off on its own, the reserve auto-fits ───
// Follow-ups on issue #541: a second axis often only needs its scale, not a second column of
// numbers, and the fixed 60px reserve either wasted width on short labels or clipped long ones.
{
    const axisWidget = (options) => ({
        id: 'w-echart-axes',
        type: 'echart',
        title: 'Achsen',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 20, h: 12 },
        options: {
            echartMode: 'timeseries',
            echartRange: '24h',
            echartShowCurrent: false,
            echartLeftUnit: 'W',
            echartRightUnit: '%',
            // Fixed ranges make echarts lay the axes out even where no history is reachable.
            echartLeftMin: 0,
            echartLeftMax: 10,
            echartRightMin: 0,
            echartRightMax: 100,
            echartSeries: [
                {
                    id: 'a1',
                    name: 'Links',
                    datapointId: 'demo.left',
                    chartType: 'line',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                },
                {
                    id: 'a2',
                    name: 'Rechts',
                    datapointId: 'demo.right',
                    chartType: 'line',
                    historyInstance: 'history.0',
                    yAxisIndex: 1,
                },
            ],
            ...options,
        },
    });
    const axesFor = async (options) => {
        await page.evaluate((w) => window.__auraShot.showWidgets([w]), axisWidget(options));
        await page.waitForTimeout(700);
        return page.evaluate(() => window.__auraShot.chartAxes());
    };

    const dflt = await axesFor({});
    check('the grid measures its own labels', dflt?.grid?.containLabel === true, JSON.stringify(dflt?.grid));
    check(
        'no fixed reserve is left next to the axis',
        dflt?.grid?.left <= 10 && dflt?.grid?.right <= 10,
        JSON.stringify(dflt?.grid),
    );
    check(
        'both axes are labelled by default',
        dflt?.yAxis?.[0]?.axisLabel?.show === true && dflt?.yAxis?.[1]?.axisLabel?.show === true,
    );

    const rightOff = await axesFor({ echartShowYAxisRight: false });
    check('the right axis can be silenced on its own', rightOff?.yAxis?.[1]?.axisLabel?.show === false);
    check('the left axis is untouched by that', rightOff?.yAxis?.[0]?.axisLabel?.show === true);
    check(
        'the right axis still scales its series',
        rightOff?.yAxis?.[1]?.max === 100,
        JSON.stringify(rightOff?.yAxis?.[1]?.max),
    );

    const allOff = await axesFor({ echartShowYAxis: false });
    check(
        'the master switch still hides both',
        allOff?.yAxis?.[0]?.axisLabel?.show === false && allOff?.yAxis?.[1]?.axisLabel?.show === false,
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
