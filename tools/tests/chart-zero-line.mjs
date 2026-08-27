// Verifies the two y-axis rules of the advanced chart reported in issue #594.
//
//   node tools/tests/chart-zero-line.mjs
//
// No dev server needed: the rules are pure (utils/chartAxis, bundled with esbuild) and echarts
// renders the axis headlessly (SSR renderer, no DOM), so what is asserted is the extent echarts
// actually settles on — not a guess about it.
//
// Two reports:
//   1. A series drawn below the zero line had no zero line. The axis was free to fit the data
//      (`scale: true`), so with every value negative it ran -2.7 … -0.9 and zero fell outside the
//      plot — the x axis line, which echarts puts at y=0 whenever zero is in range, dropped to the
//      bottom edge. Same root cause as bars of 20…25 kWh drawing their 21 as a fifth of their 25.
//   2. With every series on the RIGHT axis, no horizontal grid lines at all: they were drawn by
//      the left axis only, and an axis without series has no extent to space them over.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import * as echarts from 'echarts';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-zeroline-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/chartAxis.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { axisIsZeroBased, axisHasSeries, gridLineAxis } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const t = (h) => new Date(2026, 7, 27, h).getTime();
const pts = (vals) => vals.map((v, i) => [t(i), v]);
const GRID = '#333';

/**
 * The chart exactly as EChartWidget assembles it, rendered headlessly.
 * Returns the y extent echarts settled on per axis and how many grid lines it painted.
 */
function render(series) {
    const axis = (index) => ({
        type: 'value',
        scale: !axisIsZeroBased(series, index),
        axisLabel: { show: true, color: '#888', fontSize: 10 },
        axisTick: { show: true },
        axisLine: { show: true, lineStyle: { color: '#444' } },
        splitLine: { show: gridLineAxis(series) === index, lineStyle: { color: GRID } },
    });
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 620, height: 300 });
    chart.setOption({
        grid: { left: 6, right: 6, top: 30, bottom: 14, containLabel: true },
        xAxis: { type: 'time', axisLine: { show: true, lineStyle: { color: '#444' } }, splitLine: { show: false } },
        yAxis: [axis(0), axis(1)],
        series: series.map((s) => ({
            type: s.chartType === 'area' ? 'line' : (s.chartType ?? 'line'),
            data: s.data,
            yAxisIndex: s.yAxisIndex ?? 0,
            ...(s.stack ? { stack: 'aura-stack' } : {}),
        })),
    });
    const svg = chart.renderToSVGString();
    const model = chart.getModel();
    const extents = [0, 1].map((i) => model.getComponent('yAxis', i).axis.scale.getExtent());
    chart.dispose();
    return { extents, gridLines: (svg.match(new RegExp(`stroke="${GRID}"`, 'g')) ?? []).length };
}

const holdsZero = ([lo, hi]) => lo <= 0 && hi >= 0;

// -- 1. the reported case: a bar series drawn below the zero line ------------------------------
{
    const r = render([{ chartType: 'bar', data: pts([-2.1, -1.4, -2.6, -0.9, -1.8]) }]);
    check('a negative bar series keeps its zero line', holdsZero(r.extents[0]), JSON.stringify(r.extents[0]));
}

// -- 2. the same distortion, upwards: bars must not start at the smallest bar ------------------
{
    const r = render([{ chartType: 'bar', data: pts([220, 235, 228, 241]) }]);
    check('bars far from zero still start at zero', r.extents[0][0] === 0, JSON.stringify(r.extents[0]));
}

// -- 3. a line is the other way round and keeps its free scale ---------------------------------
{
    const r = render([{ chartType: 'line', data: pts([220, 235, 228, 241]) }]);
    check('a line still fits its own range', r.extents[0][0] > 100, JSON.stringify(r.extents[0]));
    const neg = render([{ chartType: 'line', data: pts([-2.1, -1.4, -2.6]) }]);
    check('and does so below zero too', neg.extents[0][1] < 0, JSON.stringify(neg.extents[0]));
}

// -- 4. a delta series is bars whatever its stored chart type says ------------------------------
{
    check('delta counts as bars', axisIsZeroBased([{ chartType: 'line', aggregate: 'delta' }], 0));
    const r = render([{ chartType: 'bar', aggregate: 'delta', data: pts([-2.1, -1.4, -2.6]) }]);
    check('so a negative consumption chart keeps zero', holdsZero(r.extents[0]), JSON.stringify(r.extents[0]));
}

// -- 5. a stack was already zero-based and stays so ---------------------------------------------
{
    check('a stacked area is zero-based', axisIsZeroBased([{ chartType: 'area', stack: true }], 0));
    const r = render([
        { chartType: 'area', stack: true, data: pts([2, 3, 1]) },
        { chartType: 'area', stack: true, data: pts([1, 1, 2]) },
    ]);
    check('and renders from zero', r.extents[0][0] === 0, JSON.stringify(r.extents[0]));
}

// -- 6. per axis, not per chart -----------------------------------------------------------------
{
    const series = [
        { chartType: 'bar', yAxisIndex: 0, data: pts([220, 235, 228]) },
        { chartType: 'line', yAxisIndex: 1, data: pts([21.4, 21.9, 22.3]) },
    ];
    check('the bar axis is zero-based', axisIsZeroBased(series, 0));
    check('the line axis next to it is not', !axisIsZeroBased(series, 1));
    const r = render(series);
    check('bars start at zero', r.extents[0][0] === 0, JSON.stringify(r.extents[0]));
    check('the temperature line keeps its range', r.extents[1][0] > 15, JSON.stringify(r.extents[1]));
}

// -- 7. the second report: grid lines when everything sits on the right axis --------------------
{
    check('left axis owns the grid by default', gridLineAxis([{ yAxisIndex: 0 }]) === 0);
    check('an empty chart still names the left axis', gridLineAxis([]) === 0);
    check('a right-only chart hands the grid over', gridLineAxis([{ yAxisIndex: 1 }, { yAxisIndex: 1 }]) === 1);
    check('one series on the left is enough to keep it', gridLineAxis([{ yAxisIndex: 0 }, { yAxisIndex: 1 }]) === 0);

    const left = render([{ chartType: 'line', yAxisIndex: 0, data: pts([2.1, 1.4, 2.6]) }]);
    const right = render([
        { chartType: 'line', yAxisIndex: 1, data: pts([2.1, 1.4, 2.6]) },
        { chartType: 'line', yAxisIndex: 1, data: pts([4.2, 3.9, 5.1]) },
    ]);
    check('a left-axis chart draws grid lines', left.gridLines > 0, `${left.gridLines}`);
    check('a right-only chart draws them too now', right.gridLines > 0, `${right.gridLines}`);
    // Not both at once — two scales' worth of lines cross-hatch the plot.
    const both = render([
        { chartType: 'line', yAxisIndex: 0, data: pts([2.1, 1.4, 2.6]) },
        { chartType: 'line', yAxisIndex: 1, data: pts([420, 390, 510]) },
    ]);
    check(
        'a two-axis chart draws one set, not two',
        both.gridLines > 0 && both.gridLines <= left.gridLines,
        `${both.gridLines} vs ${left.gridLines} on one axis`,
    );
}

// -- 8. `axisHasSeries` is what that rule rests on ----------------------------------------------
{
    check('an unset yAxisIndex counts as left', axisHasSeries([{}], 0) && !axisHasSeries([{}], 1));
    check('an explicit right does not', !axisHasSeries([{ yAxisIndex: 1 }], 0));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
