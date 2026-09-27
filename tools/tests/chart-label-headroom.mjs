// Verifies that value labels above the highest mark stay clear of the legend and the canvas edge
// (issue #713).
//
//   node tools/tests/chart-label-headroom.mjs
//
// A bar of 115.97 GB on an axis that echarts rounds up to 120 ends almost at the top of the grid (the
// test takes the worst case, a bar right at the maximum).
// Its value label sits another 5 px + one text line above it, and the grid only reserved room for
// the legend — the label ran into it. `valueLabelGridTop` adds that room while labels are shown.
//
// No dev server and no DOM: `chartLegend.ts` is pure, echarts lays the chart out headlessly (SSR
// renderer). Grid, legend and label settings mirror EChartWidget.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import * as echarts from 'echarts';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-label-headroom-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { legendGridTop, valueLabelGridTop, LEGEND_TOP } from './src-vis/utils/chartLegend.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { legendGridTop, valueLabelGridTop, LEGEND_TOP } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

// One measurer for echarts and the legend reserve. zrender takes a text line to be as tall as '国'
// is wide, so wide glyphs get the full font size — as they do in a browser.
const measure = (text, fontSize) =>
    [...(text || '')].reduce((w, c) => w + (c.charCodeAt(0) > 0x2000 ? fontSize : fontSize * 0.6), 0);
echarts.setPlatformAPI({
    measureText: (text, font) => ({ width: measure(text, Number(/([\d.]+)px/.exec(font || '')?.[1]) || 12) }),
});

const AXIS_GAP = 6;
const AXIS_GAP_V = 14;
const W = 1000;
const H = 260;
const NAMES = ['Empfangene GB', 'Gesendete GB'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// Lays the reported chart out; returns the boxes of the legend and of the value labels.
function layout({ top, legend = true, max = 120 }) {
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H });
    chart.setOption({
        animation: false,
        legend: legend ? { show: true, textStyle: { fontSize: 11 }, top: LEGEND_TOP } : { show: false },
        grid: { left: AXIS_GAP, right: AXIS_GAP, top, bottom: AXIS_GAP_V, containLabel: true },
        xAxis: { type: 'category', data: ['Mo', 'Di', 'Mi', 'Do', 'Fr'] },
        yAxis: { type: 'value' },
        series: NAMES.map((name, i) => ({
            name,
            type: 'bar',
            data: i === 0 ? [40, 62, max, 80, 55] : [8, 12, 20, 9, 11],
            label: { show: true, position: 'top', fontSize: 10, formatter: (p) => `${p.value} GB` },
            labelLayout: { hideOverlap: true },
        })),
    });
    chart.renderToSVGString();
    const labels = [];
    let legendBottom = 0;
    chart
        .getZr()
        .storage.getDisplayList(true)
        .forEach((el) => {
            const r = el.getBoundingRect().clone();
            r.applyTransform(el.getComputedTransform());
            const text = el.style?.text;
            if (text && text.endsWith(' GB') && !NAMES.includes(text)) {
                labels.push({ text, y0: r.y });
            } else if (
                // Legend items: the names and their icons, all within the first rows of the canvas.
                (text && NAMES.includes(text)) ||
                (!text && r.y < LEGEND_TOP + 30 && r.width <= 25)
            ) {
                legendBottom = Math.max(legendBottom, r.y + r.height);
            }
        });
    chart.dispose();
    const highest = labels.reduce((a, b) => (b.y0 < a.y0 ? b : a), labels[0]);
    return { highest, legendBottom };
}

// -- 1. the reported chart ---------------------------------------------------------------------
{
    console.log('\nBars with a legend, the tallest reaching the axis maximum (worst case of the reported chart)');
    const plain = legendGridTop(NAMES, W, AXIS_GAP_V, 11, measure);
    const before = layout({ top: plain });
    check(
        'with the legend reserve alone the label runs into the legend',
        before.highest.y0 < before.legendBottom,
        `"${before.highest.text}" at y=${before.highest.y0.toFixed(1)}, legend ends at ${before.legendBottom.toFixed(1)}`,
    );
    const top = valueLabelGridTop(plain, true);
    const after = layout({ top });
    check(
        'with the label headroom it stays below the legend',
        after.highest.y0 >= after.legendBottom,
        `"${after.highest.text}" at y=${after.highest.y0.toFixed(1)}, legend ends at ${after.legendBottom.toFixed(1)}`,
    );
    check(
        'without wasting room',
        after.highest.y0 - after.legendBottom < 6,
        `${(after.highest.y0 - after.legendBottom).toFixed(1)} px of air, grid.top ${plain} -> ${top}`,
    );
}

// -- 2. no legend: the canvas edge is the limit -----------------------------------------------
{
    console.log('\nThe same chart without a legend');
    const before = layout({ top: AXIS_GAP_V, legend: false });
    check('the bare axis gap cuts the label off', before.highest.y0 < 0, `y=${before.highest.y0.toFixed(1)}`);
    const top = valueLabelGridTop(AXIS_GAP_V, false);
    const after = layout({ top, legend: false });
    check('with the headroom it stays on the canvas', after.highest.y0 >= 0, `y=${after.highest.y0.toFixed(1)}`);
    check(
        'a larger reserve (comparison mode) is kept as is',
        valueLabelGridTop(40, false) === 40,
        `${valueLabelGridTop(40, false)}`,
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) {
        console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    }
    process.exit(1);
}
process.exit(0);
