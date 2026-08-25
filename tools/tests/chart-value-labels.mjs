// Verifies the value labels of the advanced chart (issues #543 and #584).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-value-labels.mjs
//
// The labels are painted into the canvas, so they cannot be read from the DOM. Instead each
// chart's canvas is sampled for label-grey pixels (#888): switching the option on has to add
// a clear amount of them, switching it off has to take them away again.
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

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.enableHistory(true));

// Twelve monthly values in one JSON datapoint — the setup from the issue.
const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const jsonPoints = months.map((label, i) => ({ label, value: 900 + i * 77 }));
// A second, clearly higher curve — its labels sit above the bars' labels instead of colliding
// with them, so `hideOverlap` cannot swallow the difference the checks below measure.
const jsonPoints2 = months.map((label, i) => ({ label, value: 2600 + i * 13 }));

const jsonWidget = (id, title, y, extra) => ({
    id,
    title,
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y, w: 60, h: 12 },
    options: {
        icon: 'BarChart2',
        echartMode: 'json',
        echartLeftUnit: 'GB',
        decimals: 1,
        echartShowLegend: true,
        echartShowCurrent: true,
        echartSeries: [
            {
                id: 'j1',
                name: 'Empfangen',
                datapointId: 'demo.traffic.json',
                chartType: 'bar',
                color: '#3b82f6',
                source: 'json',
                yAxisIndex: 0,
            },
        ],
        ...extra,
    },
});

const comparisonWidget = (id, title, y, extra) => ({
    id,
    title,
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y, w: 60, h: 12 },
    options: {
        icon: 'BarChart2',
        echartMode: 'comparison',
        echartLeftUnit: 'GB',
        decimals: 1,
        echartShowCurrent: true,
        echartSeries: months.slice(0, 6).map((m, i) => ({
            id: `c${i}`,
            name: m,
            datapointId: `demo.traffic.${m}`,
            chartType: 'bar',
            source: 'history',
            historyInstance: 'history.0',
            color: '#3b82f6',
            yAxisIndex: 0,
        })),
        ...extra,
    },
});

/** Bar series plus a line series over it — the two-series setup of issue #584. */
const twoSeriesWidget = (id, title, y, extra, barPatch = {}, linePatch = {}) => {
    const w = jsonWidget(id, title, y, extra);
    w.options.echartSeries = [
        { ...w.options.echartSeries[0], ...barPatch },
        {
            id: 'j2',
            name: 'Temperatur',
            datapointId: 'demo.traffic.json2',
            chartType: 'line',
            color: '#f59e0b',
            source: 'json',
            yAxisIndex: 0,
            ...linePatch,
        },
    ];
    return w;
};

const mocks = {
    'demo.traffic.json': JSON.stringify(jsonPoints),
    'demo.traffic.json2': JSON.stringify(jsonPoints2),
};
months.slice(0, 6).forEach((m, i) => (mocks[`demo.traffic.${m}`] = 900 + i * 77));

/** Label-grey pixels (#888 with antialiasing) in the canvas of the widget with that title. */
const greyPixels = (title) =>
    page.evaluate((wanted) => {
        const item = [...document.querySelectorAll('.react-grid-item')].find(
            (el) => el.querySelector('.aura-widget-title')?.textContent === wanted,
        );
        const canvas = item?.querySelector('canvas');
        if (!canvas) return -1;
        const c = canvas.getContext('2d');
        const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
        let n = 0;
        for (let p = 0; p < data.length; p += 4) {
            const [r, g, b, a] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
            if (a > 200 && Math.abs(r - 136) < 45 && Math.abs(g - 136) < 45 && Math.abs(b - 136) < 45) n++;
        }
        return n;
    }, title);

/** Render one batch of widgets and wait until every one of them has painted its canvas. */
const render = async (widgets) => {
    // Clear first: a batch that replaces an equally long one would otherwise reuse the mounted
    // chart components, and the canvases sampled below could still hold the previous drawing.
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForFunction(() => document.querySelectorAll('.react-grid-item').length === 0, { timeout: 10000 });
    await page.evaluate(
        ([ws, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState?.(vals);
            window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
        },
        [widgets, mocks],
    );
    try {
        await page.waitForFunction(
            (n) => document.querySelectorAll('.react-grid-item canvas').length >= n,
            widgets.length,
            { timeout: 20000 },
        );
    } catch {
        /* fall through — the checks below report the missing render */
    }
    await page.waitForTimeout(1200);
};

// ── Widget-wide switch (issue #543) ──
await render([
    jsonWidget('w-json-off', 'JSON default', 0),
    jsonWidget('w-json-on', 'JSON labels on', 13, { echartShowValues: true }),
    comparisonWidget('w-cmp-default', 'Comparison default', 26),
    comparisonWidget('w-cmp-off', 'Comparison labels off', 39, { echartShowValues: false }),
    // One bar per series here, so the per-series switch has to reach the single data item.
    comparisonWidget('w-cmp-half', 'Comparison half off', 52, {
        echartSeries: comparisonWidget('x', 'x', 0).options.echartSeries.map((s, i) =>
            i % 2 ? { ...s, showValues: false } : s,
        ),
    }),
]);

const [jsonOff, jsonOn, cmpDefault, cmpOff, cmpHalf] = await Promise.all(
    ['JSON default', 'JSON labels on', 'Comparison default', 'Comparison labels off', 'Comparison half off'].map(
        greyPixels,
    ),
);
console.log(
    `  grey pixels: json off=${jsonOff} on=${jsonOn} | comparison default=${cmpDefault} off=${cmpOff} half=${cmpHalf}`,
);

check(
    'all five charts rendered a canvas',
    [jsonOff, jsonOn, cmpDefault, cmpOff, cmpHalf].every((n) => n > 0),
);
check(
    'JSON mode draws the values once the option is on',
    jsonOn > jsonOff * 1.3,
    `off=${jsonOff} on=${jsonOn} (axis labels are in both)`,
);
check('JSON mode stays unlabelled by default', jsonOff < jsonOn, 'an existing JSON chart must not change on upgrade');
check(
    'comparison mode keeps its labels without the option',
    cmpDefault > cmpOff * 1.3,
    `default=${cmpDefault} off=${cmpOff}`,
);
check('comparison labels can be switched off', cmpOff < cmpDefault);
check(
    'a single comparison bar can drop its label',
    cmpHalf < cmpDefault && cmpHalf > cmpOff,
    `default=${cmpDefault} half=${cmpHalf} off=${cmpOff}`,
);

// ── Per-series switch and label interval (issue #584) ──
// Everything is measured against the same chart without any labels, so the axis and legend
// pixels both charts share cancel out and only the labels themselves are compared.
await render([
    twoSeriesWidget('w2-none', 'Two series plain', 0, { echartShowValues: false }),
    twoSeriesWidget('w2-both', 'Two series labelled', 13, { echartShowValues: true }),
    twoSeriesWidget('w2-bar', 'Two series bar only', 26, { echartShowValues: true }, {}, { showValues: false }),
    twoSeriesWidget(
        'w2-every3',
        'Two series every third',
        39,
        { echartShowValues: true },
        { labelInterval: 3 },
        {
            labelInterval: 3,
        },
    ),
    twoSeriesWidget('w2-optin', 'Two series opt in', 52, { echartShowValues: false }, { showValues: true }),
]);

const [plain, both, barOnly, every3, optIn] = await Promise.all(
    [
        'Two series plain',
        'Two series labelled',
        'Two series bar only',
        'Two series every third',
        'Two series opt in',
    ].map(greyPixels),
);
const labelPx = (n) => n - plain;
console.log(
    `  label pixels: both=${labelPx(both)} barOnly=${labelPx(barOnly)} every3=${labelPx(every3)} optIn=${labelPx(optIn)} (plain=${plain})`,
);

check(
    'all five two-series charts rendered a canvas',
    [plain, both, barOnly, every3, optIn].every((n) => n > 0),
);
check('both series labelled adds a clear amount of grey', labelPx(both) > 200, `+${labelPx(both)} px`);
check(
    'a series can drop its labels while the other keeps them',
    labelPx(barOnly) > 50 && labelPx(barOnly) < labelPx(both) * 0.75,
    `bar only=${labelPx(barOnly)} vs both=${labelPx(both)}`,
);
check(
    'every third point labels far fewer points',
    labelPx(every3) > 20 && labelPx(every3) < labelPx(both) * 0.6,
    `every 3rd=${labelPx(every3)} vs every=${labelPx(both)}`,
);
check(
    'a series can label itself while the widget switch is off',
    labelPx(optIn) > 50 && labelPx(optIn) < labelPx(both),
    `opt in=${labelPx(optIn)} vs both=${labelPx(both)}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
