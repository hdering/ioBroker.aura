// Verifies that a JSON chart keeps the series hidden via its legend when new JSON arrives (#1014).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-json-legend-keep.mjs
//
// The JSON mode redraws with `notMerge`, which used to drop `legend.selected` — every new payload
// brought all hidden series back. What is checked here:
//
//   • hiding a series via the legend survives a data update
//   • the other series stays visible
//   • showing it again also survives the next update
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const payload = (k) =>
    JSON.stringify([
        { label: 'Mo', a: 1 * k, b: 2 * k },
        { label: 'Di', a: 3 * k, b: 4 * k },
    ]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const setPayload = (k) =>
    page.evaluate((v) => {
        window.__auraShot.mock({ 'demo.json': v });
        window.__auraShot.mockServerState({ 'demo.json': v });
    }, payload(k));

await setPayload(1);

const series = (name, valueKey) => ({
    id: `s-${name}`,
    name,
    datapointId: 'demo.json',
    chartType: 'line',
    source: 'json',
    jsonLabelKey: 'label',
    jsonValueKey: valueKey,
    yAxisIndex: 0,
});

await page.evaluate(
    (list) =>
        window.__auraShot.showWidgets([
            {
                id: 'w-json-legend',
                type: 'echart',
                title: 'JSON',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 30, h: 14 },
                options: { echartMode: 'json', echartShowLegend: true, echartShowCurrent: false, echartSeries: list },
            },
        ]),
    [series('A', 'a'), series('B', 'b')],
);
await page.locator('.react-grid-item [_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });

/** Waits until the chart plots the payload with factor k, then returns its legend selection. */
const selectedAfter = async (k) => {
    const got = await page.waitForFunction(
        (want) => {
            const s = window.__auraShot.chartSeries();
            const a = s?.find((e) => e.name === 'A');
            if (!a || a.ys?.[1] !== want) return null;
            return window.__auraShot.chartAxes()?.legend?.selected ?? {};
        },
        3 * k,
        { timeout: 15000 },
    );
    return got.jsonValue();
};

await selectedAfter(1);
// legendToggleSelect is what a click on the legend dispatches.
await page.evaluate(() => window.__auraShot.chartAction({ type: 'legendToggleSelect', name: 'B' }));
{
    const sel = await selectedAfter(1);
    check('the legend click hides B', sel.B === false, JSON.stringify(sel));
}

await setPayload(2);
{
    const sel = await selectedAfter(2);
    check('B stays hidden after new JSON', sel.B === false, JSON.stringify(sel));
    check('A stays visible', sel.A !== false, JSON.stringify(sel));
}

await page.evaluate(() => window.__auraShot.chartAction({ type: 'legendSelect', name: 'B' }));
await setPayload(3);
{
    const sel = await selectedAfter(3);
    check('B shown again stays shown after new JSON', sel.B !== false, JSON.stringify(sel));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length === 0 ? 0 : 1);
