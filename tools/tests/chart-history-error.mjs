// Verifies that a failing history query shows up on the chart instead of an empty or flat curve.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-history-error.mjs
//
// Case from the forum: InfluxDB serves the raw rows of a datapoint but refuses to average it
// (a field that also holds strings). Raw windows keep drawing; a bucketed window used to come back
// as "no rows" — a flat line at the current value — with nothing in the console. Checked for the
// advanced chart (echart) and the simple chart: the bucketed window names the error, the raw one
// draws without it, and the error reaches the console.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ERROR = 'unsupported mean iterator type: *query.stringInterruptIterator';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
const warnings = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const now = Date.now();
const rows = Array.from({ length: 200 }, (_, i) => [now - (199 - i) * 5 * 60 * 1000, 20 + 3 * Math.sin(i / 8)]);

let n = 0;
/** Renders one widget (own id and datapoint each time — the harness remembers widgets). */
async function render(widget) {
    n++;
    const dp = `demo.err${n}`;
    await page.evaluate(
        ([dp, rows, n, widget, error]) => {
            const a = window.__auraShot;
            a.enableHistory(true);
            a.mockHistory({ [dp]: rows }, { failAggregated: error });
            a.mockObject({
                [dp]: { type: 'state', common: { type: 'number', custom: { 'influxdb.0': { enabled: true } } } },
            });
            a.mock({ [dp]: 21.5 });
            a.mockServerState({ [dp]: 21.5 });
            const json = JSON.stringify(widget).replaceAll('__DP__', dp);
            a.showWidgets([{ ...JSON.parse(json), id: `w-hist-err-${n}`, gridPos: { x: 0, y: 0, w: 30, h: 14 } }]);
        },
        [dp, rows, n, widget, ERROR],
    );
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
        const item = document.querySelector('.react-grid-item');
        const note = item?.querySelector('.aura-history-error');
        return {
            note: note ? { text: note.textContent ?? '', title: note.getAttribute('title') ?? '' } : null,
            canvas: !!item?.querySelector('canvas'),
            svgPath: !!item?.querySelector('.recharts-area-curve, .recharts-line-curve'),
            series: window.__auraShot.chartSeries?.() ?? null,
        };
    });
}

const echart = (series) => ({
    type: 'echart',
    title: 'Temperatur',
    datapoint: '',
    layout: 'default',
    options: {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartJsonExtra: '{"animation":false}',
        echartSeries: [
            {
                id: 's1',
                name: 'Temp',
                datapointId: '__DP__',
                chartType: 'line',
                historyInstance: 'influxdb.0',
                ...series,
            },
        ],
    },
});
const simple = (historyRange) => ({
    type: 'chart',
    title: 'Temperatur',
    datapoint: '__DP__',
    layout: 'default',
    options: { historyInstance: 'influxdb.0', historyRange },
});

// ── 1. Advanced chart, averaged 24 h window: the error replaces the flat line ───
{
    const r = await render(echart({}));
    check('echart: error note shown', !!r.note, JSON.stringify(r.note));
    check('echart: note names the adapter error', !!r.note?.text.includes(ERROR), r.note?.text);
    check('echart: note names the instance', !!r.note?.title.includes('influxdb.0'), r.note?.title);
    check('echart: no chart drawn over the error', !r.canvas);
}

// ── 2. Advanced chart, raw rows: draws, no note ─────────────────────────────────
{
    const r = await render(echart({ aggregate: 'none' }));
    check('echart raw: no error note', !r.note, JSON.stringify(r.note));
    check('echart raw: curve drawn', r.canvas && (r.series?.[0]?.points ?? 0) > 10, String(r.series?.[0]?.points));
}

// ── 3. Simple chart: 24 h (bucketed) shows the error, 1 h (raw) draws ───────────
{
    const r = await render(simple('24h'));
    check('chart 24h: error note shown', !!r.note?.text.includes(ERROR), JSON.stringify(r.note));
    const raw = await render(simple('1h'));
    check('chart 1h: no error note', !raw.note, JSON.stringify(raw.note));
    check('chart 1h: curve drawn', raw.svgPath);
}

check(
    'error reaches the console',
    warnings.some((w) => w.includes('getHistory') && w.includes(ERROR)),
    String(warnings.length),
);
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
