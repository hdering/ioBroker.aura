// Verifies bindings in chart texts (issue #919): the advanced chart's series names and the
// distribution chart's group titles, entry labels and remainder label.
//
//   npm run dev            (or set AURA_BASE; runs offline — the bars draw the editor's sample data)
//   node tools/tests/chart-series-name-bindings.mjs
//
// A series name like `{dp;date(DD.MM.)}` is resolved before it reaches echarts — in comparison
// mode it is the bar's label on the x axis, in the timeseries the legend entry. Both are painted
// into the canvas, so the names are read back from the resolved option via `__auraShot.chartAxes()`.
// A name whose datapoint has no value yet reads `Serie n`; a name without a brace stays as typed.
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

const NAMES = [
    '{demo.fc.d1.date;date(DD.MM.)}',
    'Di {demo.fc.d2.date;date(DD.MM.)}',
    '{demo.fc.d3.missing;date(DD.MM.)}',
    'Fest',
];

const widget = (id, mode) => ({
    id,
    title: id,
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 60, h: 14 },
    options: {
        icon: 'BarChart2',
        echartMode: mode,
        echartShowLegend: true,
        echartLeftUnit: 'kWh',
        echartSeries: NAMES.map((name, i) => ({
            id: `c${i}`,
            name,
            // A {{placeholder}} in edit mode draws the sample curves — offline there is no other data.
            datapointId: `{{parent}}.d${i + 1}`,
            chartType: 'bar',
            source: 'history',
            historyInstance: 'history.0',
            yAxisIndex: 0,
        })),
    },
});

const mocks = (d1) => ({
    'demo.fc.d1.date': d1,
    // Milliseconds — `date()` reads epoch seconds, milliseconds and ISO text alike.
    'demo.fc.d2.date': new Date(2026, 10, 6, 0, 0).getTime(),
});

/** Show one widget and read its resolved option back once echarts holds category/legend names. */
async function render(w, vals) {
    await page.evaluate(
        ([ws, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState?.(v);
            window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
        },
        [[w], vals],
    );
    // Edit mode only after the widgets are shown — showWidgets leaves the view mode behind.
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return !!a && ((a.xAxis?.data?.length ?? 0) > 0 || (a.legend?.data?.length ?? 0) > 0);
        },
        null,
        { timeout: 60000 },
    );
    await page.waitForTimeout(800);
    return page.evaluate(() => window.__auraShot.chartAxes());
}

const legendNames = (axes) => (axes?.legend?.data ?? []).map((e) => (typeof e === 'string' ? e : e?.name));
const EXPECTED = ['05.11.', 'Di 06.11.', 'Serie 3', 'Fest'];

const cmp = await render(widget('w-cmp', 'comparison'), mocks('2026-11-05T00:00:00'));
console.log(`  comparison x=${JSON.stringify(cmp?.xAxis?.data)}`);
check(
    'comparison: bar labels resolve the bindings',
    JSON.stringify(cmp?.xAxis?.data) === JSON.stringify(EXPECTED),
    JSON.stringify(cmp?.xAxis?.data),
);

const ts = await render(widget('w-ts', 'timeseries'), mocks('2026-11-05T00:00:00'));
console.log(`  timeseries legend=${JSON.stringify(legendNames(ts))}`);
check(
    'timeseries: legend resolves the bindings',
    JSON.stringify(legendNames(ts)) === JSON.stringify(EXPECTED),
    JSON.stringify(legendNames(ts)),
);

// A new forecast day: the date datapoint moved on. Mounted fresh — offline the harness only
// hands the name datapoints over on mount.
const next = await render(widget('w-cmp-next', 'comparison'), mocks('2026-11-07T00:00:00'));
check('a new date value relabels the bar', next?.xAxis?.data?.[0] === '07.11.', JSON.stringify(next?.xAxis?.data));

// Distribution chart: group title, entry labels and the remainder's label take the same bindings.
// Plain HTML there, so the texts are read straight from the DOM.
await page.evaluate(
    ([ws, v]) => {
        window.__auraShot.setEditMode(false);
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState?.(v);
        window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
    },
    [
        [
            {
                id: 'w-dist',
                title: 'w-dist',
                type: 'energiebilanz',
                layout: 'default',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 60, h: 14 },
                options: {
                    legendFormat: 'label-value',
                    bars: [
                        {
                            id: 'b1',
                            title: 'Gruppe {demo.fc.d1.date;date(DD.MM.)}',
                            totalValue: 100,
                            restLabel: 'Frei bis {demo.fc.d2.date;date(DD.MM.)}',
                            entries: [
                                { id: 'e1', datapointId: 'demo.fc.e1', label: '{demo.fc.d1.date;date(DD.MM.)}' },
                                { id: 'e2', datapointId: 'demo.fc.e2', label: 'Fest' },
                                { id: 'e3', datapointId: 'demo.fc.e3', label: '{demo.fc.d3.missing}' },
                            ],
                        },
                    ],
                },
            },
        ],
        { ...mocks('2026-11-05T00:00:00'), 'demo.fc.e1': 20, 'demo.fc.e2': 30, 'demo.fc.e3': 10 },
    ],
);
await page.waitForFunction(() => !!document.querySelector('.react-grid-item'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
const distText = await page.evaluate(() => document.querySelector('.react-grid-item')?.innerText ?? '');
console.log(`  distribution=${JSON.stringify(distText)}`);
check('distribution: group title resolves', distText.includes('Gruppe 05.11.'));
check('distribution: entry label resolves', /(^|\n)05\.11\./.test(distText));
check('distribution: plain label stays', distText.includes('Fest'));
check('distribution: remainder label resolves', distText.includes('Frei bis 06.11.'));
check('distribution: no raw binding is shown', !distText.includes('{'));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
