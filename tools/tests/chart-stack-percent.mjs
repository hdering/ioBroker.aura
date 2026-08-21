// Verifies the percentage share of the stack total in the advanced chart (issue #569).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-stack-percent.mjs
//
// Two parts:
//   1. The shares themselves (`__auraShot.stackShares`) — pure logic, and the part that can be
//      silently wrong (missing values, a zero total, a member that went negative).
//   2. A rendered stacked bar chart: the labels are canvas text, read back through
//      `__auraShot.chartTexts` — percentage only, value + percentage, and neither when off.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.enableHistory(true));

// ── 1. The shares, as pure logic ──────────────────────────────────────────────
const shares = (series, data) => page.evaluate(([s, d]) => window.__auraShot.stackShares(s, d), [series, data]);
const stacked = { stack: true, chartType: 'bar', yAxisIndex: 0 };

// index 0: 100 of 300, index 1: 300 of 400 — each index has its own total.
const plain = await shares(
    [stacked, stacked],
    [
        [100, 300],
        [200, 100],
    ],
);
check(
    'two stacked series split each index',
    eq(plain, [
        [1 / 3, 0.75],
        [2 / 3, 0.25],
    ]),
    JSON.stringify(plain),
);

const mixed = await shares(
    [stacked, { chartType: 'bar' }],
    [
        [100, 100],
        [100, 100],
    ],
);
check(
    'an unstacked series gets no share',
    eq(mixed, [
        [null, null],
        [null, null],
    ]),
    JSON.stringify(mixed),
);

const lone = await shares([stacked], [[100, 50]]);
check('a stack of one gets no share', eq(lone, [[null, null]]), JSON.stringify(lone));

const gaps = await shares(
    [stacked, stacked],
    [
        [null, 300],
        [200, null],
    ],
);
check(
    'a missing value drops out and leaves the other at 100 %',
    eq(gaps, [
        [null, 1],
        [1, null],
    ]),
    JSON.stringify(gaps),
);

const zeros = await shares(
    [stacked, stacked],
    [
        [0, 25],
        [0, 75],
    ],
);
check(
    'a stack summing to 0 gets no share',
    eq(zeros, [
        [null, 0.25],
        [null, 0.75],
    ]),
    JSON.stringify(zeros),
);

const signed = await shares([stacked, stacked], [[-50], [150]]);
check(
    'magnitudes are used, so a negative member still adds up to 100 %',
    eq(signed, [[0.25], [0.75]]),
    JSON.stringify(signed),
);

// Time-axis points arrive as [timestamp, value] pairs — same shares, other shape.
const points = await shares(
    [stacked, stacked],
    [
        [
            [1, 20],
            [2, 60],
        ],
        [
            [1, 80],
            [2, 40],
        ],
    ],
);
check(
    'time-axis points are read the same way',
    eq(points, [
        [0.2, 0.6],
        [0.8, 0.4],
    ]),
    JSON.stringify(points),
);

// ── 2. A rendered stacked bar chart ───────────────────────────────────────────
const labels = ['Mo', 'Di'];
const seriesA = labels.map((label, i) => ({ label, value: i === 0 ? 25 : 40 }));
const seriesB = labels.map((label, i) => ({ label, value: i === 0 ? 75 : 60 }));

const widget = (id, title, y, extra) => ({
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
        decimals: 0,
        echartShowLegend: false,
        echartShowCurrent: false,
        echartSeries: [
            {
                id: 'a',
                name: 'Netz',
                datapointId: 'demo.stack.a',
                chartType: 'bar',
                color: '#3b82f6',
                source: 'json',
                yAxisIndex: 0,
                stack: true,
            },
            {
                id: 'b',
                name: 'PV',
                datapointId: 'demo.stack.b',
                chartType: 'bar',
                color: '#10b981',
                source: 'json',
                yAxisIndex: 0,
                stack: true,
            },
        ],
        ...extra,
    },
});

const widgets = [
    widget('w-values', 'values only', 0, { echartShowValues: true }),
    widget('w-percent', 'percent only', 13, { echartShowValues: false, echartShowStackPercent: true }),
    widget('w-both', 'values + percent', 26, { echartShowValues: true, echartShowStackPercent: true }),
];

const mocks = {
    'demo.stack.a': JSON.stringify(seriesA),
    'demo.stack.b': JSON.stringify(seriesB),
};

await page.evaluate(
    ([ws, vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState?.(vals);
        window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
    },
    [widgets, mocks],
);

try {
    await page.waitForFunction(() => document.querySelectorAll('.react-grid-item canvas').length >= 3, {
        timeout: 20000,
    });
} catch {
    /* fall through — the checks below report the missing render */
}
await page.waitForTimeout(1500);

const texts = async (i) => (await page.evaluate((n) => window.__auraShot.chartTexts(n), i)) ?? [];
const [valueTexts, percentTexts, bothTexts] = await Promise.all([0, 1, 2].map(texts));
console.log(`  values: ${JSON.stringify(valueTexts)}`);
console.log(`  percent: ${JSON.stringify(percentTexts)}`);
console.log(`  both: ${JSON.stringify(bothTexts)}`);

const has = (list, s) => list.some((x) => x.includes(s));

check(
    'all three charts painted text',
    [valueTexts, percentTexts, bothTexts].every((l) => l.length > 0),
);
check('values alone stay free of percentages', !has(valueTexts, '%'), valueTexts.join(' | '));
check('values alone label the value', has(valueTexts, '25') && has(valueTexts, '75'));
check(
    'percent alone labels the share instead of the value',
    has(percentTexts, '25 %') && has(percentTexts, '75 %') && has(percentTexts, '40 %') && has(percentTexts, '60 %'),
    percentTexts.join(' | '),
);
check(
    'percent alone drops the value',
    // 25 and 75 are no axis ticks here, so a "25 GB" could only be a data-point label.
    !has(percentTexts, '25 GB') && !has(percentTexts, '75 GB'),
    percentTexts.join(' | '),
);
check(
    'both puts the share in brackets behind the value',
    has(bothTexts, '(25 %)') && has(bothTexts, '(75 %)'),
    bothTexts.join(' | '),
);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
