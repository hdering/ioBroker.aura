// Verifies that the still-open trailing bucket of an aggregated chart never lands in the FUTURE,
// and that the curve therefore stays ordered once the live value is appended.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-open-bucket.mjs
//
// The reported chart: "Heute", two power series. After the browser had been open for a while the
// line bent BACKWARDS at its end - the newest value sat to the left of the last vertex, and the
// kink stayed for the rest of the session.
//
// Where it comes from: an aggregated answer carries one row per bucket, stamped in the MIDDLE of
// it. The last bucket of a pinned day is only partly elapsed, so its row is stamped up to half a
// step (7:30 min at the 15-minute step of a day window) AFTER the window end. Everything appended
// afterwards - the live value the fetch adds, and every state update after that - is older than
// that vertex, and nothing re-sorts the array.
//
// The page clock is pinned into the first half of a bucket, which is exactly when the effect
// shows; the mock aggregates with the adapter's own middle-of-the-bucket formula.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.pv.power';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const MIN = 60_000;
const STEP = 15 * MIN; // what a 24 h window aggregates with
const de = (ts) => new Date(ts).toLocaleTimeString('de-DE');

// 13:02 - two minutes into the 13:00…13:15 bucket, whose row is stamped 13:07:30.
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
const NOW = midnight.getTime() + 13 * 3_600_000 + 2 * MIN;
const OPEN_BUCKET = midnight.getTime() + 52 * STEP + STEP / 2; // 13:07:30

// A reading every five minutes since midnight, wobbling so no two buckets share a value.
const raw = [];
for (let ts = midnight.getTime(); ts <= NOW; ts += 5 * MIN) {
    raw.push([ts, 1000 + Math.round(500 * Math.sin(ts / 3_600_000))]);
}
// The value the datapoint holds right now - different from every bucket average, so the fetch
// appends it as the curve's final vertex (issue #510).
const LIVE = 4242;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
await ctx.clock.setFixedTime(new Date(NOW));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(
    ({ dp, raw, live }) => {
        window.__auraShot.mock({ [dp]: live });
        window.__auraShot.mockServerState({ [dp]: live });
        window.__auraShot.mockHistory({ [dp]: raw });
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-open-bucket',
                    type: 'echart',
                    title: 'Erzeugung',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 30, h: 12 },
                    options: {
                        echartMode: 'timeseries',
                        echartDayNav: true,
                        echartDayNavDefault: true,
                        echartAnimation: false,
                        echartSeries: [
                            {
                                id: 's1',
                                name: 'PV',
                                datapointId: dp,
                                chartType: 'line',
                                color: '#22c55e',
                                historyInstance: 'sql.0',
                                historyRange: '24h',
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            ],
            { editMode: false },
        );
    },
    { dp: DP, raw, live: LIVE },
);

// Settle on two identical readings rather than a guessed timeout - the fetch resolves in an effect.
let series = { points: 0, xs: [] };
let prev = '';
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    const read = await page.evaluate(() => {
        const s = window.__auraShot.chartSeries();
        return s && s.length > 0 ? { points: s[0].points, xs: s[0].xs } : null;
    });
    const snap = JSON.stringify(read);
    if (snap === prev && read && read.points > 0) {
        series = read;
        break;
    }
    prev = snap;
    if (read) series = read;
}

const xs = series.xs.map(Number);
const ahead = xs.filter((x) => x > NOW);
check(
    'no vertex is stamped after the current time',
    ahead.length === 0,
    `${ahead.length} of ${xs.length} ahead, e.g. ${ahead.slice(0, 2).map(de).join(' | ')} - now is ${de(NOW)}`,
);

const kinks = xs.slice(1).filter((x, i) => x <= xs[i]).length;
check(
    'the curve runs forward from first vertex to last',
    kinks === 0,
    `${kinks} backward steps, last three ${xs.slice(-3).map(de).join(' | ')}`,
);

check(
    'the live value closes the curve',
    xs.length > 0 && xs[xs.length - 1] === NOW,
    `last vertex ${xs.length ? de(xs[xs.length - 1]) : 'none'}, want ${de(NOW)}`,
);

// Only the one open bucket may go: 52 elapsed buckets (00:07:30 … 12:52:30) plus the live value.
check(
    'only the open bucket is dropped, not the elapsed ones',
    xs.length === 53,
    `${xs.length} vertices, want 53 (52 buckets + live value); open bucket would be ${de(OPEN_BUCKET)}`,
);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
