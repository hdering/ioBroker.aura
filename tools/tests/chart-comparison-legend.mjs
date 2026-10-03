// Verifies the legend of the advanced chart's comparison mode (issue #742).
//
//   npm run dev            (or set AURA_BASE; needs a reachable ioBroker — offline the bars stay empty)
//   node tools/tests/chart-comparison-legend.mjs
//
// Comparison mode draws one bar per series. Without the option it stays without legend (the bars
// are named on the x axis); with it, each series gets a legend entry and a click on that entry
// hides its bar. Everything is painted into the canvas, so the checks count pixels of each
// series' colour: the legend icon adds some at the top, a hidden bar takes its pixels away.
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

const SERIES = [
    { name: 'Einspeisung', color: '#00d000', value: 27.1 },
    { name: 'Bezug', color: '#ff3030', value: 3.4 },
    { name: 'Haus', color: '#0066dd', value: 7.0 },
];
const RGB = SERIES.map((s) => [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16)));

const widget = (id, title, y, extra) => ({
    id,
    title,
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y, w: 60, h: 14 },
    options: {
        icon: 'BarChart2',
        echartMode: 'comparison',
        echartLeftUnit: 'kWh',
        echartShowValues: false,
        echartSeries: SERIES.map((s, i) => ({
            id: `c${i}`,
            name: s.name,
            datapointId: `demo.cmp.s${i}`,
            chartType: 'bar',
            source: 'history',
            historyInstance: 'history.0',
            color: s.color,
            yAxisIndex: 0,
        })),
        ...extra,
    },
});

const mocks = Object.fromEntries(SERIES.map((s, i) => [`demo.cmp.s${i}`, s.value]));

/** Pixels per series colour in the chart canvas, split into the top band (legend) and the rest. */
const colourPixels = (title) =>
    page.evaluate(
        ([wanted, rgb]) => {
            const item = [...document.querySelectorAll('.react-grid-item')].find(
                (el) => el.querySelector('.aura-widget-title')?.textContent === wanted,
            );
            const canvas = item?.querySelector('canvas');
            if (!canvas) return null;
            const dpr = canvas.width / canvas.getBoundingClientRect().width;
            const band = Math.round(28 * dpr);
            const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const out = rgb.map(() => ({ top: 0, rest: 0, topX: 0, topY: 0 }));
            for (let p = 0; p < data.length; p += 4) {
                if (data[p + 3] < 200) continue;
                const k = rgb.findIndex(
                    ([r, g, b]) =>
                        Math.abs(data[p] - r) < 12 && Math.abs(data[p + 1] - g) < 12 && Math.abs(data[p + 2] - b) < 12,
                );
                if (k < 0) continue;
                const y = Math.floor(p / 4 / canvas.width);
                if (y < band) {
                    out[k].top++;
                    out[k].topX += (p / 4) % canvas.width;
                    out[k].topY += y;
                } else out[k].rest++;
            }
            const box = canvas.getBoundingClientRect();
            return out.map((o) => ({
                top: o.top,
                rest: o.rest,
                // Page coordinates of the legend icon's centre, for the click below.
                x: o.top ? box.left + o.topX / o.top / dpr : null,
                y: o.top ? box.top + o.topY / o.top / dpr : null,
            }));
        },
        [title, RGB],
    );

await page.evaluate(
    ([ws, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState?.(vals);
        window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
    },
    [
        [
            widget('w-plain', 'Comparison plain', 0),
            widget('w-legend', 'Comparison legend', 15, { echartShowLegend: true }),
        ],
        mocks,
    ],
);
await page.waitForFunction(() => document.querySelectorAll('.react-grid-item canvas').length >= 2, null, {
    timeout: 60000,
});
await page.waitForTimeout(1200);

const plain = await colourPixels('Comparison plain');
const legend = await colourPixels('Comparison legend');
console.log(`  plain=${JSON.stringify(plain?.map((p) => [p.top, p.rest]))}`);
console.log(`  legend=${JSON.stringify(legend?.map((p) => [p.top, p.rest]))}`);

check('both charts rendered', !!plain && !!legend);
check(
    'without the option comparison mode draws no legend',
    !!plain && plain.every((p) => p.top === 0),
    JSON.stringify(plain?.map((p) => p.top)),
);
check(
    'with the option every series has a legend icon in its colour',
    !!legend && legend.every((p) => p.top > 20),
    JSON.stringify(legend?.map((p) => p.top)),
);
check('every bar is drawn', !!legend && legend.every((p) => p.rest > 200), JSON.stringify(legend?.map((p) => p.rest)));

// Hide the second series through its legend entry.
if (legend?.[1]?.x != null) {
    await page.mouse.click(legend[1].x, legend[1].y);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1200);
}
const after = await colourPixels('Comparison legend');
console.log(`  after click=${JSON.stringify(after?.map((p) => [p.top, p.rest]))}`);
check('a click on the legend entry hides that bar', !!after && after[1].rest < 20, `rest=${after?.[1]?.rest}`);
check(
    'the other bars stay',
    !!after && !!legend && [0, 2].every((k) => after[k].rest > legend[k].rest * 0.8),
    JSON.stringify(after?.map((p) => p.rest)),
);
check(
    'the other bars keep their width',
    !!after && !!legend && [0, 2].every((k) => after[k].rest < legend[k].rest * 1.2),
    JSON.stringify(after?.map((p) => p.rest)),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
