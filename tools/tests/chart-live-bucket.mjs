// Verifies that a series bucketed as `max`, `min` or `total` takes no live points, while a plain
// (average) series still closes its curve with the live value (issue #510).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-live-bucket.mjs
//
// The reported picture: outdoor temperature over a year, three series on the same datapoint —
// daily maximum, mean and minimum. At the right edge all three lines jumped to one point: the
// fetch appended the current reading (18 °C in the afternoon) to every series, so a year of daily
// minima ended at this afternoon's temperature. A bucket of `max`/`min` is the extreme of a whole
// step and a bucket of `total` its sum; a single reading is a different quantity.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.temp.outdoor';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
const NOW = midnight.getTime() + 13 * HOUR + 40 * MIN;

// Thirty days, a reading every 15 minutes: cold nights (~5), warm afternoons (~15).
const raw = [];
for (let ts = NOW - 32 * DAY; ts < NOW - 15 * MIN; ts += 15 * MIN) {
    const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    raw.push([ts, Math.round((10 + 5 * Math.cos((2 * Math.PI * (h - 15)) / 24)) * 10) / 10]);
}
// Far above every daily maximum, so appending it anywhere is unmistakable.
const LIVE = 42;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
await ctx.clock.setFixedTime(new Date(NOW));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const AGGREGATES = ['max', 'min', 'total', 'average'];

/** Mounts one chart with the four aggregations on `range` and returns the settled series. */
async function mount(range) {
    await page.evaluate(
        ({ dp, raw, live, aggregates, range }) => {
            window.__auraShot.mock({ [dp]: live });
            window.__auraShot.mockServerState({ [dp]: live });
            window.__auraShot.mockHistory({ [dp]: raw });
            window.__auraShot.showWidgets(
                [
                    {
                        // Own id per mount, so the harness remounts instead of updating in place.
                        id: `w-live-bucket-${range}`,
                        type: 'echart',
                        title: 'Außentemperatur',
                        datapoint: '',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 30, h: 12 },
                        options: {
                            echartMode: 'timeseries',
                            echartRange: range,
                            lockRange: true,
                            echartAnimation: false,
                            echartSeries: aggregates.map((aggregate, i) => ({
                                id: `s-${aggregate}`,
                                name: aggregate,
                                datapointId: dp,
                                chartType: 'line',
                                color: ['#ef4444', '#3b82f6', '#22c55e', '#6b7280'][i],
                                historyInstance: 'history.0',
                                yAxisIndex: 0,
                                aggregate,
                            })),
                        },
                    },
                ],
                { editMode: false },
            );
        },
        { dp: DP, raw, live: LIVE, aggregates: AGGREGATES, range },
    );
    return settled();
}

// Settle on two identical readings rather than a guessed timeout - the fetch resolves in an effect.
async function settled() {
    let prev = '';
    let last = null;
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        const read = await page.evaluate(() => window.__auraShot.chartSeries());
        const snap = JSON.stringify(read);
        if (read && read.length === 4 && read.every((s) => s.points > 0) && snap === prev) return read;
        prev = snap;
        last = read;
    }
    return last ?? [];
}

const byName = (list, name) => list.find((s) => s.name === name) ?? { ys: [], xs: [], points: 0 };
const tail = (s) => Number(s.ys[s.ys.length - 1]);
const cardText = async () =>
    (await page.locator('[data-aura-widget-type="echart"]').last().innerText()).replace(/\s+/g, ' ');

console.log('30 days (6 h buckets)');
let list = await mount('30d');
for (const name of AGGREGATES) {
    const s = byName(list, name);
    check(`${name}: the live reading is not appended`, s.points > 0 && tail(s) !== LIVE, `last value ${tail(s)}`);
}
check('the value block still shows the live reading', (await cardText()).includes(String(LIVE)), await cardText());

// A state update after the fetch takes the subscription path — same rule. A minute later: with the
// clock frozen, a reading stamped like the fetch's own live point would count as already plotted.
const before = Object.fromEntries(list.map((s) => [s.name, s.points]));
await page.evaluate(({ dp, ts }) => window.__auraShot.mock({ [dp]: { val: 43, ts, lc: ts } }), {
    dp: DP,
    ts: NOW + MIN,
});
await page.waitForTimeout(600);
list = await settled();
for (const name of AGGREGATES) {
    const s = byName(list, name);
    check(
        `${name}: a later update adds no point either`,
        s.points === before[name] && tail(s) !== 43,
        `${before[name]} → ${s.points} points, last ${tail(s)}`,
    );
}
check('the value block follows the update', (await cardText()).includes('43'), await cardText());

console.log('7 days (1 h buckets)');
list = await mount('7d');
for (const name of ['max', 'min', 'total']) {
    const s = byName(list, name);
    check(`${name}: still no live point`, s.points > 0 && tail(s) !== LIVE, `last value ${tail(s)}`);
}
check(
    'average: the live reading closes the curve (#510)',
    tail(byName(list, 'average')) === LIVE,
    `last value ${tail(byName(list, 'average'))}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
