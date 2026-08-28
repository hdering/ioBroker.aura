// Verifies that leaving the advanced chart's day navigation releases the x-axis window (issue #594).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-day-mode-exit.mjs
//
// The regression: day mode frames exactly the selected calendar day by writing xAxis.min/max.
// Those keys were written CONDITIONALLY, and `setOption` merges — so switching back to a rolling
// range only stopped SENDING min/max, it did not clear them. The chart stayed pinned to that one
// day, and "7 Tage" and "30 Tage" both drew the same two bars. A fresh widget looked fine, because
// it had never been in day mode.
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
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.power': 1500 });
    window.__auraShot.mockServerState({ 'demo.power': 1500 });
    window.__auraShot.enableHistory(true);
    window.__auraShot.showWidgets([
        {
            id: 'w-echart-dayexit',
            type: 'echart',
            title: 'Leistung',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            options: {
                echartMode: 'timeseries',
                echartDayNav: true,
                echartShowCurrent: false,
                echartVisibleRanges: ['24h', '7d', '30d'],
                echartSeries: [
                    {
                        id: 's1',
                        name: 'Leistung',
                        datapointId: 'demo.power',
                        chartType: 'line',
                        color: '#3b82f6',
                        historyInstance: 'history.0',
                        historyRange: '24h',
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    ]);
});

const widget = page.locator('.react-grid-item');
await widget.locator('[_echarts_instance_]').waitFor({ state: 'attached', timeout: 20000 });

/** Time window the x axis really frames, in days. */
const spanDays = async () => {
    const got = await page.waitForFunction(
        () => {
            const a = window.__auraShot.chartAxes();
            return a && Array.isArray(a.xExtent) ? a.xExtent : null;
        },
        { timeout: 15000 },
    );
    const [min, max] = await got.jsonValue();
    return (max - min) / 86400000;
};
const clickRange = async (label) => {
    await widget.locator(`button:text-is("${label}")`).click();
    await page.waitForTimeout(900);
};
const near = (v, want, tol) => Math.abs(v - want) <= tol;

// ── Baseline: a fresh widget on 7 days frames a week ─────────────────────────
await clickRange('7 Tage');
const fresh7 = await spanDays();
check('a fresh 7-day view frames about a week', near(fresh7, 7, 2), `${fresh7.toFixed(2)} d`);

// ── Day mode pins one calendar day ───────────────────────────────────────────
await clickRange('Heute');
const today = await spanDays();
check('"Heute" pins the axis to a single day', near(today, 1, 0.1), `${today.toFixed(2)} d`);

// ── …and leaving it must release the pin again ───────────────────────────────
await clickRange('7 Tage');
const back7 = await spanDays();
check(
    '7 Tage after "Heute" frames a week again',
    near(back7, fresh7, 1.5),
    `${back7.toFixed(2)} d (was ${fresh7.toFixed(2)})`,
);

await clickRange('30 Tage');
const back30 = await spanDays();
check('30 Tage is wider than 7 Tage, not identical to it', back30 > back7 + 5, `${back30.toFixed(2)} d`);
check('and frames about a month', near(back30, 30, 6), `${back30.toFixed(2)} d`);

// ── The same for a picked date, which is the other way into day mode ─────────
{
    const field = widget.locator('input[type="date"]');
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() - 3);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    await field.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
    await page.waitForTimeout(900);
    const picked = await spanDays();
    check('a picked date pins its own single day', near(picked, 1, 0.1), `${picked.toFixed(2)} d`);

    await clickRange('7 Tage');
    const afterPick = await spanDays();
    check('7 Tage after "Datum wählen" frames a week again', near(afterPick, fresh7, 1.5), `${afterPick.toFixed(2)} d`);
}

// The option itself must say so — an omitted key is what left the stale pin behind.
const cleared = await page.evaluate(() => {
    const a = window.__auraShot.chartAxes();
    return a && a.xAxis ? { min: a.xAxis.min ?? null, max: a.xAxis.max ?? null } : null;
});
check(
    'the rolling-range option clears min/max instead of omitting them',
    cleared !== null && cleared.min === null && cleared.max === null,
    JSON.stringify(cleared),
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
