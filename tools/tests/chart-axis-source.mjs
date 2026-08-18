// Verifies where the advanced chart takes its y-axis bounds from (issue #550).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-axis-source.mjs
//
// Three sources, in the order they win: a datapoint per bound (works in every mode), a min/max
// block inside the JSON payload (JSON mode), the fixed number from the config. The bounds only
// exist in the resolved echarts option — on the canvas they are pixels — so they are read back
// through `__auraShot.chartAxes()`.
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

const DATA = [
    { label: '10:00', value: 12 },
    { label: '11:00', value: 31 },
    { label: '12:00', value: 24 },
];

// Payload variants, all carrying the same data: the bounds block sits in a different place in each.
await page.evaluate((data) => {
    window.__auraShot.mock({
        'demo.jsonPlain': JSON.stringify(data),
        'demo.jsonRoot': JSON.stringify({ min: -20, max: 120, data }),
        'demo.jsonBlock': JSON.stringify({ axis: { min: 0, max: 100 }, data }),
        'demo.jsonNested': JSON.stringify({ data: { scale: { yMin: 5, yMax: 60 }, hours: data } }),
        'demo.jsonMaxOnly': JSON.stringify({ max: 80, data }),
        // The bound datapoints themselves.
        'demo.axisMax': 250,
        'demo.axisMax2': 175,
        'demo.axisMin': -50,
    });
}, DATA);

let caseNo = 0;
const jsonWidget = (options, jsonPath = 'data') => ({
    // A fresh id per case: a reused one lets echarts keep the old canvas around long enough for a
    // read to land on the previous case's axis.
    id: `w-axis-source-${++caseNo}`,
    type: 'echart',
    title: 'Achsengrenzen',
    datapoint: '',
    layout: options.layout ?? 'default',
    gridPos: { x: 0, y: 0, w: 30, h: 14 },
    options: {
        echartMode: 'json',
        echartShowCurrent: false,
        echartLeftUnit: 'W',
        echartSeries: [
            {
                id: 's1',
                name: 'Leistung',
                datapointId: options.dp ?? 'demo.jsonBlock',
                chartType: 'bar',
                source: 'json',
                jsonPath,
                yAxisIndex: 0,
            },
        ],
        ...options,
    },
});

/** Render a widget and read the y axes back once echarts has resolved them and settled. */
const axesFor = async (widget) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    let last = null;
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(250);
        const axes = await page.evaluate(() => {
            try {
                return window.__auraShot.chartAxes();
            } catch {
                return null; // chart between two mounts
            }
        });
        if (!axes?.yAxis?.length) continue;
        const seen = JSON.stringify(axes.yAxis);
        // Two identical reads in a row: the payload arrives after the first frame, so an early
        // read would still show the axis of the frame before it.
        if (seen === last) return axes.yAxis;
        last = seen;
    }
    return last ? JSON.parse(last) : null;
};
const bounds = (axis) => `min=${axis?.min} max=${axis?.max}`;

// ── JSON payload delivers the bounds ─────────────────────────────────────────
{
    const y = await axesFor(jsonWidget({ dp: 'demo.jsonBlock', echartJsonAxisBounds: true }));
    check('block "axis" in the payload scales the left axis', y?.[0]?.min === 0 && y?.[0]?.max === 100, bounds(y?.[0]));
}
{
    const y = await axesFor(jsonWidget({ dp: 'demo.jsonRoot', echartJsonAxisBounds: true }));
    check('min/max at the payload root', y?.[0]?.min === -20 && y?.[0]?.max === 120, bounds(y?.[0]));
}
{
    const y = await axesFor(jsonWidget({ dp: 'demo.jsonNested', echartJsonAxisBounds: true }, 'data.hours'));
    check('block beside the array further down the path', y?.[0]?.min === 5 && y?.[0]?.max === 60, bounds(y?.[0]));
}
{
    // Only max given: min stays free, so echarts is allowed to pick it from the data.
    const y = await axesFor(jsonWidget({ dp: 'demo.jsonMaxOnly', echartJsonAxisBounds: true, echartLeftMin: 0 }));
    check('max from the payload, min from the config', y?.[0]?.min === 0 && y?.[0]?.max === 80, bounds(y?.[0]));
}
{
    // Opt-in only: the same payload must not move the axis while the switch is off.
    const y = await axesFor(jsonWidget({ dp: 'demo.jsonBlock', echartLeftMin: 3, echartLeftMax: 7 }));
    check('switch off leaves the configured bounds alone', y?.[0]?.min === 3 && y?.[0]?.max === 7, bounds(y?.[0]));
}
{
    // The payload wins over a fixed value once the switch is on.
    const y = await axesFor(
        jsonWidget({ dp: 'demo.jsonBlock', echartJsonAxisBounds: true, echartLeftMin: 3, echartLeftMax: 7 }),
    );
    check('payload overrules the fixed value', y?.[0]?.min === 0 && y?.[0]?.max === 100, bounds(y?.[0]));
}
{
    // A payload without a block: nothing to take over, the config stays in charge.
    const y = await axesFor(
        jsonWidget({ dp: 'demo.jsonPlain', echartJsonAxisBounds: true, echartLeftMin: 3, echartLeftMax: 7 }, ''),
    );
    check('payload without a block keeps the config', y?.[0]?.min === 3 && y?.[0]?.max === 7, bounds(y?.[0]));
}

// ── Bound datapoints ─────────────────────────────────────────────────────────
{
    const y = await axesFor(
        jsonWidget({
            dp: 'demo.jsonBlock',
            echartJsonAxisBounds: true,
            echartLeftMaxDp: 'demo.axisMax',
            echartLeftMinDp: 'demo.axisMin',
        }),
    );
    check('bound datapoints beat the payload', y?.[0]?.min === -50 && y?.[0]?.max === 250, bounds(y?.[0]));
}
{
    // Same datapoints, no JSON in sight — this is the mode-independent half of the feature.
    const y = await axesFor({
        id: `w-axis-source-${++caseNo}`,
        type: 'echart',
        title: 'Achsengrenzen',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 30, h: 14 },
        options: {
            echartMode: 'comparison',
            echartShowCurrent: false,
            echartLeftMaxDp: 'demo.axisMax2',
            echartSeries: [{ id: 's1', name: 'A', datapointId: 'demo.axisMin', chartType: 'bar', yAxisIndex: 0 }],
        },
    });
    check('bound datapoint works outside JSON mode too', y?.[0]?.max === 175, bounds(y?.[0]));
}
{
    // An empty bound datapoint must not blank the axis — the config takes over again.
    const y = await axesFor(
        jsonWidget({ dp: 'demo.jsonPlain', echartLeftMax: 7, echartLeftMaxDp: 'demo.doesNotExist' }, ''),
    );
    check('unreadable bound datapoint falls back to the config', y?.[0]?.max === 7, bounds(y?.[0]));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
