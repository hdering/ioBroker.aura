// Paging the advanced chart by its active range (issue #871).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-nav.mjs
//
// Checked in the real widget: a chip switch keeps the browsed date, ◀ steps by the chip's span,
// the lit "Heute" goes back to the rolling range, `Gesamt` greys the controls out, two charts in
// one link group page together, and the navigation datapoints are read on mount and written on
// use. The harness only delivers datapoint values on mount (useDatapoint needs a connection), so
// datapoint-driven changes are mounted fresh; the command parsing is covered by chart-nav-logic.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const DAY = 86_400_000;
const midnight = (daysAgo = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
};
const iso = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const chart = (id, y, opts = {}) => ({
    id,
    type: 'echart',
    title: id,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y, w: 12, h: 8 },
    options: {
        echartMode: 'timeseries',
        echartDayNav: true,
        echartShowCurrent: false,
        echartVisibleRanges: ['6h', '24h', '7d', '30d', 'total'],
        ...opts,
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
});

const mount = async (widgets, states = {}) => {
    await page.evaluate(
        ({ widgets, states }) => {
            const all = { 'demo.power': 1500, ...states };
            window.__auraShot.mock(all);
            window.__auraShot.mockServerState(all);
            window.__auraShot.enableHistory(true);
            window.__auraShot.captureWrites(true);
            window.__auraShot.showWidgets(widgets);
        },
        { widgets, states },
    );
    const echarts = widgets.filter((w) => w.type === 'echart').length;
    await page.waitForFunction((n) => document.querySelectorAll('[_echarts_instance_]').length >= n, echarts, {
        timeout: 20000,
    });
    await page.waitForTimeout(900);
};

const item = (n) => page.locator('.react-grid-item').nth(n);
/** The x window the n-th chart pins — [min, max], or null while it rolls up to now. */
const windowOf = (n) =>
    page.evaluate((i) => {
        const a = window.__auraShot.chartAxes(i);
        const x = Array.isArray(a?.xAxis) ? a.xAxis[0] : a?.xAxis;
        return x && typeof x.min === 'number' && typeof x.max === 'number' ? [x.min, x.max] : null;
    }, n);
const windowVia = windowOf;
const click = async (n, sel) => {
    await item(n).locator(sel).first().click();
    await page.waitForTimeout(500);
};
const chip = (label) => `button:text-is("${label}")`;
const fmtWin = (w) => (w ? `${new Date(w[0]).toLocaleString()} → ${new Date(w[1]).toLocaleString()}` : 'rolling');

// ── One chart: chip switch keeps the date, ◀ steps by the chip ─────────────────────────────
await mount([chart('nav-a', 0)]);
{
    await click(0, '[data-testid="echart-nav-prev"]');
    let w = await windowVia(0);
    check('◀ from rolling on 24 Std lands on yesterday', w?.[0] === midnight(1) && w?.[1] === midnight(0), fmtWin(w));

    await click(0, chip('7 Tage'));
    w = await windowVia(0);
    check('7 Tage keeps yesterday as the end day', w?.[0] === midnight(7) && w?.[1] === midnight(0), fmtWin(w));
    check(
        'and the 7-Tage chip is lit',
        (
            await item(0)
                .locator(chip('7 Tage'))
                .evaluate((el) => el.style.background)
        ).includes('accent'),
    );

    await click(0, '[data-testid="echart-nav-prev"]');
    w = await windowVia(0);
    check('◀ on 7 Tage steps a whole week', w?.[0] === midnight(14) && w?.[1] === midnight(7), fmtWin(w));

    await click(0, chip('24 Std'));
    w = await windowVia(0);
    check('back to 24 Std shows the end day of that week', w?.[0] === midnight(8) && w?.[1] === midnight(7), fmtWin(w));

    await click(0, '[data-testid="echart-nav-today"]');
    w = await windowVia(0);
    check('Heute shows today', w?.[0] === midnight(0) && w?.[1] === midnight(0) + DAY, fmtWin(w));
    check('▶ is off on today', await item(0).locator('[data-testid="echart-nav-next"]').isDisabled());

    await click(0, '[data-testid="echart-nav-today"]');
    w = await windowVia(0);
    check('the lit Heute goes back to the rolling range', w === null, fmtWin(w));

    await click(0, chip('Gesamt'));
    check(
        'Gesamt greys ◀ and the date out',
        (await item(0).locator('[data-testid="echart-nav-prev"]').isDisabled()) &&
            (await item(0).locator('[data-testid="echart-nav-date"]').isDisabled()),
    );
}

// ── Anchor "start": a picked day starts the window ─────────────────────────────────────────
await mount([chart('nav-start', 0, { echartNavAnchor: 'start', echartRange: '7d' })]);
{
    const field = item(0).locator('input[type="date"]');
    await field.evaluate(
        (el, v) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, v);
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        iso(midnight(20)),
    );
    await page.waitForTimeout(600);
    const w = await windowVia(0);
    check(
        'anchor start: 7 Tage start on the picked day',
        w?.[0] === midnight(20) && w?.[1] === midnight(13),
        fmtWin(w),
    );
}

// ── Two charts in one link group page together ─────────────────────────────────────────────
await mount([chart('nav-g1', 0, { echartNavGroup: 'energie' }), chart('nav-g2', 9, { echartNavGroup: 'energie' })]);
{
    await click(0, chip('7 Tage'));
    await click(0, '[data-testid="echart-nav-prev"]');
    const a = await windowOf(0);
    const b = await windowOf(1);
    check('chart 2 follows chart 1', !!a && JSON.stringify(a) === JSON.stringify(b), `${fmtWin(a)} | ${fmtWin(b)}`);
    check(
        'and lights the same chip',
        (
            await item(1)
                .locator(chip('7 Tage'))
                .evaluate((el) => el.style.background)
        ).includes('accent'),
    );
}

// ── Datapoints: read on mount, written on use ──────────────────────────────────────────────
await mount(
    [
        chart('nav-dp', 0, {
            echartNavDateDp: 'test.nav.date',
            echartNavRangeDp: 'test.nav.range',
        }),
    ],
    { 'test.nav.date': iso(midnight(3)), 'test.nav.range': '7d' },
);
{
    const w = await windowVia(0);
    check('the datapoints set range and end day', w?.[0] === midnight(9) && w?.[1] === midnight(2), fmtWin(w));
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.evaluate(() => window.__auraShot.captureWrites(true));
    await click(0, '[data-testid="echart-nav-prev"]');
    await click(0, chip('30 Tage'));
    const writes = await page.evaluate(() => window.__auraShot.writes());
    const dateW = writes.filter((x) => x.id === 'test.nav.date').map((x) => x.val);
    const rangeW = writes.filter((x) => x.id === 'test.nav.range').map((x) => x.val);
    check('◀ writes the new end day', dateW[0] === iso(midnight(10)), JSON.stringify(dateW));
    check('the chip writes its token', rangeW.at(-1) === '30d', JSON.stringify(rangeW));
}

// ── Across widget types: advanced, simple and distribution chart in one group ──────────────
const simple = (id, y, opts = {}) => ({
    id,
    type: 'chart',
    title: id,
    datapoint: 'demo.power',
    layout: 'default',
    gridPos: { x: 0, y, w: 12, h: 8 },
    options: { historyInstance: 'history.0', historyRange: '24h', ...opts },
});
const distribution = (id, y, opts = {}) => ({
    id,
    type: 'energiebilanz',
    title: id,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y, w: 12, h: 10 },
    options: {
        range: '24h',
        visibleRanges: ['24h', '7d', '30d'],
        bars: [
            {
                id: 'b1',
                title: 'Verbrauch',
                entries: [{ id: 'e1', datapointId: 'demo.power', aggregate: 'average', historyInstance: 'history.0' }],
            },
        ],
        ...opts,
    },
});
await mount([
    chart('mix-e', 0, { echartNavGroup: 'mix' }),
    simple('mix-c', 9, { dayNav: true, navGroup: 'mix' }),
    distribution('mix-d', 18, { dayNav: true, navGroup: 'mix' }),
]);
{
    const label = (n) => item(n).locator('[data-testid="echart-nav-date"]').innerText();
    check(
        'the simple chart offers the paging bar',
        (await item(1).locator('[data-testid="echart-nav"]').count()) === 1,
    );
    check(
        'the distribution offers the paging bar',
        (await item(2).locator('[data-testid="echart-nav"]').count()) === 1,
    );
    await click(0, chip('7 Tage'));
    await click(0, '[data-testid="echart-nav-prev"]');
    const want = await label(0);
    check('simple chart shows the same window', (await label(1)) === want, `${await label(1)} vs ${want}`);
    check('distribution shows the same window', (await label(2)) === want, `${await label(2)} vs ${want}`);
    check(
        'and both light the 7-Tage chip',
        (
            await item(1)
                .locator(chip('7 Tage'))
                .evaluate((el) => el.style.background)
        ).includes('accent') &&
            (
                await item(2)
                    .locator(chip('7 Tage'))
                    .evaluate((el) => el.style.background)
            ).includes('accent'),
    );
    // Paging from the distribution moves the others too.
    await click(2, '[data-testid="echart-nav-prev"]');
    const w = await windowOf(0);
    check(
        '◀ in the distribution steps the advanced chart',
        w?.[0] === midnight(20) && w?.[1] === midnight(13),
        fmtWin(w),
    );
    await click(1, '[data-testid="echart-nav-today"]');
    check('⇥ in the simple chart brings all to the current week', (await label(0)) === (await label(2)));
}

// ── Distribution: own chips with calendar months ───────────────────────────────────────────
await mount([distribution('dist-m', 0, { dayNav: true, dayNavDefault: true, rangeChips: ['1M', '3M=Quartal'] })]);
{
    const text = await item(0).locator('[data-testid="echart-nav-date"]').innerText();
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate() + 1);
    const p = (x) => String(x).padStart(2, '0');
    const want = `${p(from.getDate())}.${p(from.getMonth() + 1)}.`;
    check('1M chip: the window is a calendar month up to today', text.startsWith(want), `${text} (want ${want}…)`);
    check('the own chips replace the presets', (await item(0).locator(chip('Quartal')).count()) === 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
