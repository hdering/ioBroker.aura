// Verifies that the extra bar at the left edge of a rolling advanced chart is gone (issue #685).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-border-value.mjs
//
// The reported chart: 7 days, one bar per day over a PV day yield. At the very start it always
// showed TWO bars 30 minutes apart, both carrying the same value.
//
// Where they come from: an aggregated history query is answered with a BORDER row on top of the
// buckets — the last reading before the window, stamped exactly on the window start — and that
// same reading is folded into the first bucket as well. On a line the border row is an invisible
// extra vertex at the left edge; on bars it is a second bar half a step in front of the first one.
//
// `mockHistory(…, { borderValues: true })` serves exactly that shape, so the checks below run
// against what sql.0/history.0/influxdb really answer.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.pv.yield';
const DP_OLD = 'demo.0.pv.idle';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const de = (ts) => new Date(ts).toLocaleString('de-DE');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

// The reporter's widget: 7 days, one bar series over a day-yield datapoint, `max` per bucket.
const widget = (datapointId, key) => ({
    id: `bv-${key}`,
    type: 'echart',
    title: 'PV Tagesertrag',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 60, h: 14 },
    options: {
        echartMode: 'timeseries',
        echartRange: '7d',
        echartAnimation: false,
        echartLeftUnit: 'kWh',
        decimals: 2,
        echartSeries: [
            {
                id: `s-${key}`,
                name: 'Tagesertrag',
                datapointId,
                chartType: 'bar',
                color: '#eab308',
                aggregate: 'max',
                historyInstance: 'sql.0',
                yAxisIndex: 0,
            },
        ],
    },
});

/** Plots one series and reports the x values that reached the canvas. */
async function plot(key, datapointId, mock, borderValues) {
    await page.evaluate(
        ({ cfg, mock, borderValues }) => {
            window.__auraShot.mockHistory(mock, { borderValues });
            window.__auraShot.showWidgets([cfg], { editMode: false });
        },
        { cfg: widget(datapointId, key), mock, borderValues },
    );
    // Two identical readings rather than a guessed timeout — the fetch resolves in an effect.
    let last = null;
    let prev = '';
    for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(80);
        last = await page.evaluate(() => {
            const s = window.__auraShot.chartSeries();
            return s && s.length > 0 ? { points: s[0].points, xs: s[0].xs } : null;
        });
        const snap = JSON.stringify(last);
        if (snap === prev && last && last.points > 0) break;
        prev = snap;
    }
    return last ?? { points: 0, xs: [] };
}

/** Smallest distance between two neighbouring bars. */
const minGap = (xs) =>
    xs.length < 2 ? Infinity : xs.slice(1).reduce((acc, x, i) => Math.min(acc, x - xs[i]), Infinity);

// A day yield logged once a day, for the last 12 days — so the 7-day window has a reading before
// its own start, which is what the adapter answers with as a border row. Six hours off the window
// edge, so the seconds between this clock and the browser's cannot move a reading across it.
const now = Date.now();
const windowStart = now - 7 * DAY;
const daily = Array.from({ length: 12 }, (_, i) => [now - (11 - i) * DAY - 6 * HOUR, 20 + i * 2]);
const inWindow = daily.filter(([ts]) => ts >= windowStart).length;

const withBorder = await plot('border', DP, { [DP]: daily }, true);
check(
    'one bar per day, none doubled at the window start',
    minGap(withBorder.xs) > 12 * HOUR,
    `smallest gap ${(minGap(withBorder.xs) / MIN).toFixed(0)} min between ${withBorder.points} bars, starting ${withBorder.xs
        .slice(0, 3)
        .map(de)
        .join(' | ')}`,
);
check(
    'the first bar sits in its own bucket, not on the window edge',
    withBorder.xs[0] > windowStart + 5 * MIN,
    `first bar ${de(withBorder.xs[0])}, window opens ${de(windowStart)}`,
);
check(
    'one bar per reading plus the bucket the window opens in',
    withBorder.points === inWindow + 1,
    `${withBorder.points} bars, want ${inWindow + 1} for ${inWindow} readings inside the window`,
);

// Without the adapter's border rows only the readings themselves are left — the fix must not eat
// a genuine bucket on top of the row it is after.
const plain = await plot('plain', DP, { [DP]: daily }, false);
check(
    'without border rows every reading still has its bar',
    plain.points === inWindow && minGap(plain.xs) > 12 * HOUR,
    `${plain.points} bars, want ${inWindow}, smallest gap ${(minGap(plain.xs) / MIN).toFixed(0)} min`,
);

// A datapoint that has not been written inside the window at all: the border row is the ONLY
// thing the adapter answers, and dropping it would leave an empty chart instead of the flat
// value the datapoint really holds.
const onlyBorder = await plot('old', DP_OLD, { [DP_OLD]: [[now - 10 * DAY, 42]] }, true);
check(
    'a datapoint with no reading inside the window keeps its border value',
    onlyBorder.points >= 1,
    `${onlyBorder.points} points`,
);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
