// Verifies the value labels of the advanced chart (issue #543).
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

const widgets = [
    jsonWidget('w-json-off', 'JSON default', 0),
    jsonWidget('w-json-on', 'JSON labels on', 13, { echartShowValues: true }),
    comparisonWidget('w-cmp-default', 'Comparison default', 26),
    comparisonWidget('w-cmp-off', 'Comparison labels off', 39, { echartShowValues: false }),
];

const mocks = { 'demo.traffic.json': JSON.stringify(jsonPoints) };
months.slice(0, 6).forEach((m, i) => (mocks[`demo.traffic.${m}`] = 900 + i * 77));

await page.evaluate(
    ([ws, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState?.(vals);
        window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
    },
    [widgets, mocks],
);

try {
    await page.waitForFunction(() => document.querySelectorAll('.react-grid-item canvas').length >= 4, {
        timeout: 20000,
    });
} catch {
    /* fall through — the checks below report the missing render */
}
await page.waitForTimeout(1200);

/** Label-grey pixels (#888 with antialiasing) in the widget's chart canvas. */
const greyPixels = (index) =>
    page.evaluate((i) => {
        const canvas = document.querySelectorAll('.react-grid-item')[i]?.querySelector('canvas');
        if (!canvas) return -1;
        const c = canvas.getContext('2d');
        const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
        let n = 0;
        for (let p = 0; p < data.length; p += 4) {
            const [r, g, b, a] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
            if (a > 200 && Math.abs(r - 136) < 45 && Math.abs(g - 136) < 45 && Math.abs(b - 136) < 45) n++;
        }
        return n;
    }, index);

const [jsonOff, jsonOn, cmpDefault, cmpOff] = await Promise.all([0, 1, 2, 3].map(greyPixels));
console.log(`  grey pixels: json off=${jsonOff} on=${jsonOn} | comparison default=${cmpDefault} off=${cmpOff}`);

check('all four charts rendered a canvas', [jsonOff, jsonOn, cmpDefault, cmpOff].every((n) => n > 0));
check(
    'JSON mode draws the values once the option is on',
    jsonOn > jsonOff * 1.3,
    `off=${jsonOff} on=${jsonOn} (axis labels are in both)`,
);
check(
    'JSON mode stays unlabelled by default',
    jsonOff < jsonOn,
    'an existing JSON chart must not change on upgrade',
);
check(
    'comparison mode keeps its labels without the option',
    cmpDefault > cmpOff * 1.3,
    `default=${cmpDefault} off=${cmpOff}`,
);
check('comparison labels can be switched off', cmpOff < cmpDefault);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
