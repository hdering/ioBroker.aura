// Verifies that the grid of a chart widget clears its own legend (issue #673).
//
//   node tools/tests/chart-legend-rows.mjs
//
// Echarts wraps a horizontal legend onto as many rows as the chart is wide, but it never tells the
// grid about it: the widget reserved a flat 30 px, so the second legend row of a six-series chart
// was drawn straight over the plot. `legendGridTop` counts the rows up front — this test checks the
// count against the rows echarts really produces, and that the plot starts below the last of them.
//
// No dev server and no DOM: `chartLegend.ts` is pure, echarts lays the legend out headlessly (SSR
// renderer). Both sides are given the SAME text measurer, so what is under test is the wrapping and
// the reserve, not two different guesses at how wide "Wohnzimmer" is. In the browser both sides
// measure with the same canvas 2d context, so they agree there by construction.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import * as echarts from 'echarts';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-legend-rows-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { legendRowCount, legendGridTop, LEGEND_TOP, LEGEND_ROW_STEP } from './src-vis/utils/chartLegend.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { legendRowCount, legendGridTop, LEGEND_TOP, LEGEND_ROW_STEP } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

// One measurer for both sides. Node has no canvas, so echarts would otherwise fall back to its own
// estimate and the two would wrap in different places for reasons that have nothing to do with the
// code under test.
const CHAR_W = 0.6;
const measure = (text, fontSize) => (text || '').length * fontSize * CHAR_W;
echarts.setPlatformAPI({
    measureText: (text, font) => {
        const size = Number(/([\d.]+)px/.exec(font || '')?.[1]) || 12;
        return { width: measure(text, size) };
    },
});

const AXIS_GAP = 6;
const AXIS_GAP_V = 14;
const FONT = 11;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// Legend labels come out as <text x="30" y="7" transform="translate(left top)">Name</text> — the
// row is the translate, the 7 is the label's own middle inside the item.
const LABEL = /<text[^>]*\sy="([-\d.]+)"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"[^>]*>([^<]*)<\/text>/g;

/**
 * Lays the widget's chart out exactly as `EChartWidget` does and reports where the legend rows and
 * the plot area really ended up. `top` is the `grid.top` under test.
 */
function layout(names, width, top, type = 'line') {
    const height = top + 160;
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height });
    chart.setOption({
        legend: { show: true, textStyle: { fontSize: FONT }, top: LEGEND_TOP },
        grid: { left: AXIS_GAP, right: AXIS_GAP, top, bottom: AXIS_GAP_V, containLabel: true },
        xAxis: { type: 'category', data: ['a', 'b', 'c'] },
        yAxis: [{ type: 'value' }, { type: 'value' }],
        series: names.map((name) => ({ name, type, data: [1, 2, 3] })),
    });
    const svg = chart.renderToSVGString();
    const grid = chart.getModel().getComponent('grid').coordinateSystem.getRect();
    chart.dispose();

    const ys = [];
    LABEL.lastIndex = 0;
    let m;
    while ((m = LABEL.exec(svg))) {
        if (names.includes(m[4])) ys.push(Math.round(Number(m[3]) + Number(m[1])));
    }
    const rows = [...new Set(ys)].sort((a, b) => a - b);
    return { rows: rows.length, lastRow: rows[rows.length - 1] ?? 0, gridTop: grid.y, gridHeight: grid.height };
}

const SERIES_6 = ['Wohnzimmer', 'Schlafzimmer', 'Kinderzimmer', 'Badezimmer', 'Arbeitszimmer', 'Aussen'];

// -- 1. the reported chart: six series in a narrow card --------------------------------------
{
    console.log('\nSix series at 380 px (the reported chart)');
    const W = 380;
    const before = layout(SERIES_6, W, 30); // the old hard-coded reserve
    check(
        'echarts wraps this legend onto more than one row',
        before.rows > 1,
        `${before.rows} rows, last one at y=${before.lastRow}`,
    );
    check(
        'with the old flat 30 px the legend sits inside the plot',
        before.lastRow > before.gridTop,
        `last legend row at y=${before.lastRow}, plot started at y=${before.gridTop}`,
    );

    const counted = legendRowCount(SERIES_6, W, FONT, measure);
    const top = legendGridTop(SERIES_6, W, AXIS_GAP_V, FONT, measure);
    const after = layout(SERIES_6, W, top);
    check(
        'the reserve counts the rows echarts draws',
        counted === after.rows,
        `${counted} counted, ${after.rows} drawn`,
    );
    check(
        'the plot now starts below the last legend row',
        after.gridTop > after.lastRow,
        `plot at y=${after.gridTop}, last legend row at y=${after.lastRow}`,
    );
    check(
        'and does not waste room doing it',
        after.gridTop - after.lastRow < 22,
        `${after.gridTop - after.lastRow} px of air`,
    );
    check(
        'bars, whose legend icon is the tall one, clear it too',
        (() => {
            const bars = layout(SERIES_6, W, top, 'bar');
            return bars.gridTop > bars.lastRow;
        })(),
        `grid.top ${top}`,
    );
}

// -- 2. a wide card fits the same legend on one row ------------------------------------------
{
    console.log('\nThe same six series at 1200 px');
    const W = 1200;
    const top = legendGridTop(SERIES_6, W, AXIS_GAP_V, FONT, measure);
    const wide = layout(SERIES_6, W, top);
    check('the legend needs a single row', wide.rows === 1, `${wide.rows} row(s)`);
    check('so the widget keeps the 30 px it always reserved', top === 30, `grid.top ${top}`);
    check('nothing overlaps', wide.gridTop > wide.lastRow, `plot at y=${wide.gridTop}`);
}

// -- 3. the reserve grows by exactly one row step ---------------------------------------------
{
    console.log('\nRow accounting');
    const one = legendGridTop(['A'], 1200, AXIS_GAP_V, FONT, measure);
    const many = Array.from({ length: 12 }, (_, i) => `Sehr langer Kanalname ${i}`);
    for (const w of [420, 640, 900, 1400]) {
        const rows = legendRowCount(many, w, FONT, measure);
        const top = legendGridTop(many, w, AXIS_GAP_V, FONT, measure);
        check(
            `${w} px: the reserve matches the counted rows`,
            top === one + (rows - 1) * LEGEND_ROW_STEP,
            `${rows} rows, grid.top ${top}`,
        );
        const drawn = layout(many, w, top);
        check(`${w} px: echarts draws the counted rows`, drawn.rows === rows, `${drawn.rows} drawn`);
        check(`${w} px: the plot clears them`, drawn.gridTop > drawn.lastRow, `plot at y=${drawn.gridTop}`);
    }
}

// -- 4. degenerate input ----------------------------------------------------------------------
{
    console.log('\nEdge cases');
    check('no series means no legend reserve', legendGridTop([], 400, AXIS_GAP_V, FONT, measure) === AXIS_GAP_V);
    check('unnamed series do not count', legendGridTop(['', ''], 400, AXIS_GAP_V, FONT, measure) === AXIS_GAP_V);
    check(
        'a width of zero (first paint, before the card is measured) stays on one row',
        legendGridTop(SERIES_6, 0, AXIS_GAP_V, FONT, measure) === 30,
    );
    check(
        'one label wider than the card still costs one row',
        legendRowCount(['Ein ausgesprochen langer Kanalname ohne Ende'], 120, FONT, measure) === 1,
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
process.exit(0);
