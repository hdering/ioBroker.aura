// Verifies the display-only value conversion of both chart widgets (issue #540).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-value-transform.mjs
//
// Uses the screenshot harness (__auraShot): datapoint values live in the in-memory
// cache only and the history is fabricated around them (`enableHistory`), so no
// socket write happens and no history adapter is needed.
// Checked: factor/offset reach the current value, the average and the y axis of the
// simple chart, each series of the advanced chart converts on its own, and a series
// without a conversion stays raw next to a converted one.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** Digits as rendered, regardless of the active thousands/decimal separator. */
const shows = (text, n) => new RegExp(`(^|[^\\d])${n.replace('.', '[.,]')}([^\\d]|$)`).test(text);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.enableHistory(true));

/**
 * Renders one chart widget and returns its rendered text.
 *
 * Waits for a non-empty render: the chart chunks load lazily, ECharts noticeably slower than
 * recharts, so a fixed delay would read an empty frame. Every case uses its own datapoint id —
 * the fabricated history is generated per id at fetch time, and reusing one would keep serving
 * the series generated for the previous case's value.
 */
async function show(widget, values) {
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    const read = () => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    };
    try {
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.react-grid-item');
                const txt = el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
                return txt.length > 0 && /\d/.test(txt);
            },
            { timeout: 15000 },
        );
    } catch {
        /* fall through — the check below reports the empty render */
    }
    // Let the history round-trip settle on top of the first paint.
    await page.waitForTimeout(600);
    return page.evaluate(read);
}

// A flat datapoint: the fabricated history wobbles around its value, so every point, the
// average and the current value all land near it (1500 raw → 1.5 converted).
const simpleChart = (dp, options) => ({
    id: `w-chart-${dp}`,
    type: 'chart',
    title: 'Leistung',
    datapoint: dp,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        historyInstance: 'history.0',
        historyRange: '24h',
        decimals: 1,
        showYAxis: true,
        yAxisCompact: false,
        showAverageAsValue: true,
        ...options,
    },
});

// ── 1. Simple chart: raw baseline ────────────────────────────────────────────
{
    const text = await show(simpleChart('demo.power1', { unit: 'W' }), { 'demo.power1': 1500 });
    check('simple chart shows the raw value', shows(text, '1500'), text);
}

// ── 2. Simple chart: W → kW converts value, average and y axis ───────────────
{
    const text = await show(
        simpleChart('demo.power2', { unit: 'kW', valueTransform: 'w-kw', valueFactor: 0.001, decimals: 2 }),
        { 'demo.power2': 1500 },
    );
    check('simple chart converts the current value', /1[.,]5\d?\s*kW/.test(text), text);
    check('simple chart converts the average', /Ø\s*1[.,]5/.test(text), text);
    check('simple chart drops the raw value', !shows(text, '1500'), text);
    // The y ticks are part of the widget's text — converted units keep them well under 1000.
    check('y axis is labelled in converted units', !/\d{4,}/.test(text), text);
}

// ── 3. Simple chart: custom factor + offset (°C → °F) ────────────────────────
{
    const text = await show(
        simpleChart('demo.temp', {
            unit: '°F',
            valueTransform: 'c-f',
            valueFactor: 1.8,
            valueOffset: 32,
            decimals: 1,
        }),
        { 'demo.temp': 20 },
    );
    check('offset is applied (20 °C = 68 °F)', /68[.,]\d\s*°F/.test(text), text);
    check('average carries the offset too', /Ø\s*6[78][.,]\d/.test(text), text);
}

const echart = (key, series, options = {}) => ({
    id: `w-echart-${key}`,
    type: 'echart',
    title: 'Leistung',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        echartSeries: series,
        echartMode: 'timeseries',
        echartRange: '24h',
        echartShowCurrent: true,
        decimals: 2,
        ...options,
    },
});

const powerSeries = (dp, patch = {}) => ({
    id: 's1',
    name: 'Leistung',
    datapointId: dp,
    chartType: 'line',
    color: '#3b82f6',
    historyInstance: 'history.0',
    historyRange: '24h',
    yAxisIndex: 0,
    ...patch,
});

// ── 4. Advanced chart: raw baseline ──────────────────────────────────────────
{
    const text = await show(echart('raw', [powerSeries('demo.epower1')]), { 'demo.epower1': 1500 });
    check('advanced chart shows the raw value', shows(text, '1500'), text);
}

// ── 5. Advanced chart: per-series conversion ─────────────────────────────────
{
    const text = await show(
        echart('conv', [powerSeries('demo.epower2', { valueTransform: 'w-kw', valueFactor: 0.001 })], {
            echartLeftUnit: 'kW',
        }),
        { 'demo.epower2': 1500 },
    );
    check('advanced chart converts the series', /1[.,]5\d?/.test(text), text);
    check('advanced chart drops the raw value', !shows(text, '1500'), text);
}

// ── 6. Two series, only one converted — they stay independent ────────────────
{
    const text = await show(
        echart('mixed', [
            powerSeries('demo.epower3', { valueTransform: 'w-kw', valueFactor: 0.001 }),
            powerSeries('demo.eraw', {
                id: 's2',
                name: 'Roh',
                yAxisIndex: 1,
                color: '#ef4444',
            }),
        ]),
        { 'demo.epower3': 1500, 'demo.eraw': 2400 },
    );
    check('converted series shows 1.5', /1[.,]5\d?/.test(text), text);
    check('untouched series stays at 2400', shows(text, '2400'), text);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
