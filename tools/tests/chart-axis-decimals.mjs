// Verifies that the advanced chart rounds its y-axis labels (issue #548).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-axis-decimals.mjs
//
// With min/max on "Auto" the axis ends exactly on the smallest/largest sample, so echarts'
// `{value}` template printed the raw float — 16.759028325055955 °C. The labels are painted
// into the canvas, so they are read back through `__auraShot.chartTexts()`, which returns
// what zrender actually drew.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** Longest run of decimals in any of the texts — the bug shows up as 15 of them. */
const maxDecimals = (texts) =>
    texts.reduce((n, t) => Math.max(n, ...[...t.matchAll(/\d[.,](\d+)/g)].map((m) => m[1].length), 0), 0);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

// Deliberately jagged samples: every bucket average stays an unrounded float, so an
// unformatted tick cannot accidentally look clean.
const now = Date.now();
const jagged = (base, spread) =>
    Array.from({ length: 96 }, (_, i) => [
        now - (95 - i) * 15 * 60 * 1000,
        base + spread * Math.sin(i / 3.7) + spread * 0.31 * Math.cos(i / 1.9),
    ]);
await page.evaluate(
    ([left, right]) => {
        window.__auraShot.enableHistory(true);
        window.__auraShot.mockHistory({ 'demo.temp': left, 'demo.hum': right });
    },
    [jagged(19.5, 3.4), jagged(74.2, 14.8)],
);

const widget = (options) => ({
    id: 'w-echart-decimals',
    type: 'echart',
    title: 'Achsen-Nachkommastellen',
    datapoint: '',
    layout: options.layout ?? 'default',
    gridPos: { x: 0, y: 0, w: 30, h: 14 },
    options: {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartShowCurrent: false,
        echartLeftUnit: '°C',
        echartRightUnit: '%',
        // "Auto" in the editor — the case from the issue.
        echartLeftMin: 'dataMin',
        echartLeftMax: 'dataMax',
        echartRightMin: 'dataMin',
        echartRightMax: 'dataMax',
        echartSeries: [
            {
                id: 's1',
                name: 'Temperatur',
                datapointId: 'demo.temp',
                chartType: 'line',
                historyInstance: 'history.0',
                yAxisIndex: 0,
            },
            {
                id: 's2',
                name: 'Feuchte',
                datapointId: 'demo.hum',
                chartType: 'line',
                historyInstance: 'history.0',
                yAxisIndex: 1,
            },
        ],
        ...options,
    },
});

const textsFor = async (options) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(options));
    // The first render only has the frame; the axes appear once the mocked history arrives.
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(300);
        const texts = (await page.evaluate(() => window.__auraShot.chartTexts())) ?? [];
        if (texts.some((t) => /\d/.test(t))) return texts;
    }
    return [];
};

// ── One decimal place, both axes on Auto ─────────────────────────────────────
{
    const texts = await textsFor({ decimals: 1 });
    const left = texts.filter((t) => t.includes('°C'));
    const right = texts.filter((t) => t.endsWith('%'));
    console.log(`  left: ${left.join(' | ')}`);
    console.log(`  right: ${right.join(' | ')}`);

    check('both axes are labelled', left.length > 1 && right.length > 1);
    check(
        'no label carries more decimals than configured',
        maxDecimals([...left, ...right]) <= 1,
        [...left, ...right].find((t) => /\d[.,]\d\d/.test(t)) ?? '',
    );
    check(
        'the decimal place itself is kept',
        left.some((t) => /\d[.,]\d(\D|$)/.test(t)),
        left.join(' | '),
    );
}

// ── Zero decimals leaves whole numbers ───────────────────────────────────────
{
    const texts = await textsFor({ decimals: 0 });
    const axis = texts.filter((t) => t.includes('°C') || t.endsWith('%'));
    console.log(`  decimals=0: ${axis.join(' | ')}`);
    check('decimals=0 rounds the axis to whole numbers', maxDecimals(axis) === 0, axis.join(' | '));
}

// ── The gauge readout uses the same setting ──────────────────────────────────
{
    const texts = await textsFor({ layout: 'gauge', decimals: 1, echartShowCurrent: true });
    const value = texts.filter((t) => t.includes('°C'));
    console.log(`  gauge: ${value.join(' | ')}`);
    check('the gauge readout is rounded too', value.length > 0 && maxDecimals(value) <= 1, value.join(' | '));
}

// ── A series may format its own numbers (issue #600) ─────────────────────────
// The chart-wide setting is the default for every series; a single series can override decimals
// and thousands separator for itself. The axis keeps the chart-wide format — it carries more than
// one series, so it cannot follow any single one.
{
    const perSeries = {
        decimals: 0,
        echartShowCurrent: true,
        echartSeries: [
            {
                id: 's1',
                name: 'Temperatur',
                datapointId: 'demo.temp',
                chartType: 'line',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                decimals: 2,
            },
            {
                id: 's2',
                name: 'Feuchte',
                datapointId: 'demo.hum',
                chartType: 'line',
                historyInstance: 'history.0',
                yAxisIndex: 1,
            },
        ],
    };
    const texts = await textsFor(perSeries);
    const current = await page.evaluate(() =>
        [...document.querySelectorAll('span.text-sm.font-bold.leading-none')].map((e) => e.textContent.trim()),
    );
    console.log(`  current: ${current.join(' | ')}`);
    const temp = current.find((t) => t.includes('°C')) ?? '';
    const hum = current.find((t) => t.endsWith('%')) ?? '';
    check('the overriding series shows its own decimals', /\d[.,]\d\d(\D|$)/.test(temp), temp);
    check('while the other one follows the chart', hum !== '' && maxDecimals([hum]) === 0, hum);
    check(
        'and the axis keeps the chart-wide format',
        maxDecimals(texts.filter((t) => t.includes('°C') && !current.includes(t))) === 0,
        texts.filter((t) => t.includes('°C')).join(' | '),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
