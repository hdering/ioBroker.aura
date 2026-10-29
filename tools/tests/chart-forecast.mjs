// Forecasts in the advanced chart: windows reaching into the future.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-forecast.mjs
//
// A forecast datapoint holds hourly points from three days back to 16 days ahead (written by a
// script with their own timestamps). Checked in the real widget: a chip with a lead (`2d+36h`)
// frames now − 12 h … now + 36 h and plots the future points; ▶ pages forward up to the last
// forecast point with `echartNavFuture: data`, then greys out; a fixed `16d` limit does the same;
// `echartNavCurrent: starts-today` makes ⇥ today + 6 days on a week; and a chart without the new
// options keeps ▶ off on the rolling range, as before.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const HOUR = 3_600_000;
const DAY = 86_400_000;
const midnight = (daysAgo = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
};
const fmt = (ms) => new Date(ms).toLocaleString();
const fmtWin = (w) => (w ? `${fmt(w[0])} → ${fmt(w[1])}` : 'none');

const FC = 'test.fc.temp';
const now0 = Date.now();
const firstHour = Math.floor(now0 / HOUR) * HOUR - 3 * DAY;
const lastPoint = Math.floor(now0 / HOUR) * HOUR + 16 * DAY;
const forecast = [];
for (let ts = firstHour; ts <= lastPoint; ts += HOUR) forecast.push([ts, 10 + 5 * Math.sin(ts / (6 * HOUR))]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const chart = (id, opts = {}) => ({
    id,
    type: 'echart',
    title: id,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        echartMode: 'timeseries',
        echartShowCurrent: false,
        ...opts,
        echartSeries: [
            {
                id: 's1',
                name: 'Prognose',
                datapointId: FC,
                chartType: 'line',
                color: '#3b82f6',
                historyInstance: 'influxdb.0',
                aggregate: 'none',
                yAxisIndex: 0,
            },
        ],
    },
});

const mount = async (widget) => {
    await page.evaluate(
        ({ widget, FC, forecast }) => {
            const states = { [FC]: 12 };
            window.__auraShot.mock(states);
            window.__auraShot.mockServerState(states);
            window.__auraShot.enableHistory(true);
            window.__auraShot.mockHistory({ [FC]: forecast });
            window.__auraShot.captureWrites(true);
            window.__auraShot.showWidgets([widget]);
        },
        { widget, FC, forecast },
    );
    await page.waitForFunction(() => document.querySelectorAll('[_echarts_instance_]').length >= 1, null, {
        timeout: 20000,
    });
    await page.waitForTimeout(1000);
};

const item = () => page.locator('.react-grid-item').first();
const xWindow = () =>
    page.evaluate(() => {
        const a = window.__auraShot.chartAxes(0);
        const x = Array.isArray(a?.xAxis) ? a.xAxis[0] : a?.xAxis;
        return x && typeof x.min === 'number' && typeof x.max === 'number' ? [x.min, x.max] : null;
    });
const series = () => page.evaluate(() => window.__auraShot.chartSeries()?.[0] ?? null);
const click = async (sel) => {
    await item().locator(sel).first().click();
    await page.waitForTimeout(450);
};
const next = '[data-testid="echart-nav-next"]';
const near = (a, b, tol = 5 * 60_000) => Math.abs(a - b) <= tol;

// ── Rolling with lead: 2d+36h = now − 12 h … now + 36 h ─────────────────────────────────────
await mount(
    chart('fc-lead', {
        rangeChips: ['2d+36h=2 Tage', '7d'],
        echartRange: 'custom',
        echartRangeCustomValue: 2,
        echartRangeCustomUnit: 'd',
        echartNowLine: true,
    }),
);
{
    const t = Date.now();
    const w = await xWindow();
    check(
        'lead chip frames now − 12 h … now + 36 h',
        !!w && near(w[0], t - 12 * HOUR) && near(w[1], t + 36 * HOUR),
        fmtWin(w),
    );
    const s = await series();
    const future = (s?.xs ?? []).filter((x) => x > t + HOUR).length;
    check(
        'the forecast points after now are plotted',
        future >= 30,
        `${future} future points, last ${s && fmt(s.last)}`,
    );
    const marks = await page.evaluate(() => window.__auraShot.chartMarkLines());
    const nowX = Number(marks?.[0]?.x);
    check(
        'the now line stands at about a quarter',
        !!w && Number.isFinite(nowX) && Math.abs((nowX - w[0]) / (w[1] - w[0]) - 0.25) < 0.02,
        String(marks?.[0]?.x),
    );
    await click('button:text-is("7 Tage")');
    const w7 = await xWindow();
    check('a chip without lead rolls up to now again', w7 === null || near(w7[1], Date.now()), fmtWin(w7));
}

// ── Global lead (echartRangeLead) on built-in chips ─────────────────────────────────────────
await mount(chart('fc-global', { echartRange: '24h', echartRangeLead: '12h' }));
{
    const t = Date.now();
    const w = await xWindow();
    check(
        'global lead: 24 Std = now − 12 h … now + 12 h',
        !!w && near(w[0], t - 12 * HOUR) && near(w[1], t + 12 * HOUR),
        fmtWin(w),
    );
}

// ── Paging forward up to the newest forecast point ──────────────────────────────────────────
await mount(
    chart('fc-data', { echartDayNav: true, echartRange: '24h', echartNavAnchor: 'start', echartNavFuture: 'data' }),
);
{
    await page.waitForTimeout(500);
    check('▶ is on from the rolling range', !(await item().locator(next).isDisabled()));
    await click(next);
    let w = await xWindow();
    check('▶ from rolling lands on tomorrow', w?.[0] === midnight(-1) && w?.[1] === midnight(-2), fmtWin(w));
    let steps = 1;
    while (!(await item().locator(next).isDisabled()) && steps < 40) {
        await click(next);
        steps++;
    }
    w = await xWindow();
    check(
        '▶ stops on the day of the last forecast point',
        !!w && w[0] <= lastPoint && lastPoint < w[1],
        `${steps} steps, ${fmtWin(w)}, last point ${fmt(lastPoint)}`,
    );
    const s = await series();
    check('that day shows its forecast', (s?.points ?? 0) >= 1, `${s?.points} points`);
    await click('[data-testid="echart-nav-prev"]');
    w = await xWindow();
    check('◀ still steps back', !!w && w[1] - w[0] >= 23 * HOUR && w[1] <= lastPoint + DAY, fmtWin(w));
}

// ── Fixed limit 3d ──────────────────────────────────────────────────────────────────────────
await mount(
    chart('fc-fixed', { echartDayNav: true, echartRange: '24h', echartNavAnchor: 'start', echartNavFuture: '3d' }),
);
{
    let steps = 0;
    while (!(await item().locator(next).isDisabled()) && steps < 10) {
        await click(next);
        steps++;
    }
    const w = await xWindow();
    // now + 3 d lies inside the day 3 days ahead, which still starts before it.
    check('a fixed 3d limit stops 3 days ahead', w?.[0] === midnight(-3), `${steps} steps, ${fmtWin(w)}`);
}

// ── Current window starts today ─────────────────────────────────────────────────────────────
await mount(
    chart('fc-today', {
        echartDayNav: true,
        echartRange: '7d',
        echartNavAnchor: 'start',
        echartNavCurrent: 'starts-today',
    }),
);
{
    await click('[data-testid="echart-nav-today"]');
    const w = await xWindow();
    check('⇥ on 7 Tage = today + 6 days', w?.[0] === midnight(0) && w?.[1] === midnight(-7), fmtWin(w));
    const s = await series();
    check(
        'and plots the week ahead',
        (s?.xs ?? []).some((x) => x > Date.now() + 3 * DAY),
        `last ${s && fmt(s.last)}`,
    );
}

// ── Without the new options: as before ──────────────────────────────────────────────────────
await mount(chart('fc-plain', { echartDayNav: true, echartRange: '24h' }));
{
    check('▶ is off on the rolling range', await item().locator(next).isDisabled());
    const s = await series();
    const t = Date.now();
    check(
        'no point after now is fetched',
        (s?.xs ?? []).every((x) => x <= t + 60_000),
        `last ${s && fmt(s.last)}`,
    );
    await click('[data-testid="echart-nav-today"]');
    const w = await xWindow();
    check('⇥ still means the window ending today', w?.[0] === midnight(0) && w?.[1] === midnight(-1), fmtWin(w));
    check('and ▶ stays off there', await item().locator(next).isDisabled());
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nchart-forecast: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
