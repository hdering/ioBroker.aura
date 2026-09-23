// Verifies that the labels of the outermost points of a JSON category chart stay on the canvas
// (issue #703).
//
//   node tools/tests/chart-edge-labels.mjs
//
// No dev server needed: echarts lays the chart out headlessly (SSR renderer, no DOM). The axis and
// label settings mirror the JSON mode of EChartWidget.
//
// A heating curve drawn as a line/area runs without boundaryGap, so its first and last category
// sit on the plot edge. Both the axis label ("-20 °C") and the value label ("40 °C") are centred on
// that point and half of each hung over the canvas: the legacy containLabel that the full echarts
// build installs does not count the overhang of the outer category labels, and value labels are
// never part of the grid's reserve.
import * as echarts from 'echarts';

const W = 330;
const H = 150;
const LABEL_INSET = 2;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// Lays the reported chart out and returns every text element with its box on the canvas.
function layout({ fixed, showXAxis = true, suffix = ' °C' }) {
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: W, height: H });
    chart.setOption({
        animation: false,
        grid: { left: 6, right: 6, top: 14, bottom: 14, containLabel: true },
        xAxis: {
            type: 'category',
            show: showXAxis,
            data: ['20 °C', '10 °C', '0 °C', '-10 °C', '-20 °C'],
            boundaryGap: false,
            axisLabel: {
                show: showXAxis,
                fontSize: 10,
                ...(fixed ? { alignMinLabel: 'left', alignMaxLabel: 'right' } : {}),
            },
        },
        yAxis: [{ type: 'value', show: false, min: 20, max: 50 }],
        series: [
            {
                type: 'line',
                areaStyle: {},
                showSymbol: true,
                data: [24, 28, 32, 36, 40],
                label: { show: true, position: 'top', formatter: (p) => `${p.value}${suffix}` },
                labelLayout: fixed
                    ? (p) => {
                          const width = chart.getWidth();
                          const r = p.labelRect;
                          let dx = 0;
                          if (r.x < LABEL_INSET) {
                              dx = LABEL_INSET - r.x;
                          } else if (r.x + r.width > width - LABEL_INSET) {
                              dx = width - LABEL_INSET - r.x - r.width;
                          }
                          return { hideOverlap: true, dx };
                      }
                    : { hideOverlap: true },
            },
        ],
    });
    chart.renderToSVGString();
    const texts = [];
    chart
        .getZr()
        .storage.getDisplayList(true)
        .forEach((el) => {
            if (!el.style?.text) {
                return;
            }
            const r = el.getBoundingRect().clone();
            r.applyTransform(el.getComputedTransform());
            texts.push({ text: el.style.text, x0: r.x, x1: r.x + r.width });
        });
    chart.dispose();
    return texts;
}

const outside = (texts) => texts.filter((t) => t.x0 < 0 || t.x1 > W);
const fmt = (texts) => texts.map((t) => `"${t.text}" ${t.x0.toFixed(1)}..${t.x1.toFixed(1)}`).join(', ');

console.log('\nHeating curve, 330 px wide (the reported chart)');
{
    const before = outside(layout({ fixed: false }));
    check('without the fix labels hang over the canvas', before.length > 0, fmt(before));
    const after = layout({ fixed: true });
    check('with the fix every label stays on the canvas', outside(after).length === 0, fmt(outside(after)));
    check(
        'no label was dropped by hideOverlap',
        after.length === 10,
        `${after.length} labels: ${after.map((t) => t.text).join(' ')}`,
    );
}

console.log('\nValue labels wider than the axis labels, x axis hidden');
{
    const before = outside(layout({ fixed: false, showXAxis: false, suffix: '.5 °C' }));
    check('without the fix the outer value labels are cut', before.length > 0, fmt(before));
    const after = layout({ fixed: true, showXAxis: false, suffix: '.5 °C' });
    check('with the fix they are pushed back inside', outside(after).length === 0, fmt(outside(after)));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
