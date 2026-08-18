// Verifies the `delta` ("Verbrauch") aggregation of the advanced chart (issue #545).
//
//   node tools/tests/chart-delta-reset.mjs
//
// No dev server needed: `bucketDeltas` and friends are pure, so the module is bundled with
// esbuild and exercised directly. The regression is a counter that RESETS instead of rising
// forever — a PV inverter's day yield (`solaredge.*.lastDayData`) falls back to 0 at midnight,
// and differencing the daily maxima then produced a negative number on every day that yielded
// less than its predecessor, which was clamped to 0 and left the bar missing.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { rmSync } from 'node:fs';

// The socket layer the hook imports would run browser-only setup on load, and none of it is
// reachable from the pure exports — so it is replaced by a stub at bundle time.
const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

// Inside the project: the bundle keeps `react` external, so it has to resolve from node_modules.
const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-delta-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { bucketDeltas, bucketStart, resolveDeltaBucket, deltaFetchStep } from './src-vis/hooks/useMultiSeriesData.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /^\.\/use(IoBroker|ChartHistory)$/ }, (a) => ({
                    path: a.path,
                    namespace: 'stub',
                }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
            },
        },
    ],
});
const { bucketDeltas, bucketStart, resolveDeltaBucket, deltaFetchStep } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const round = (n) => Math.round(n * 1000) / 1000;
const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;

// Fixed local dates to build the samples from — local, because the buckets are local.
const day = (n) => new Date(2026, 7, 14 + n, 0, 0, 0, 0).getTime();
const at = (n, hour) => new Date(2026, 7, 14 + n, hour, 0, 0, 0).getTime();

/** Hourly samples of a day counter: 0 until sunrise, ramping to `peak` at 20:00, then flat. */
const pvDay = (n, peak) =>
    Array.from({ length: 24 }, (_, h) => [at(n, h), h <= 7 ? 0 : peak * Math.min(1, (h - 7) / 13)]);

// -- 1. the reported case: daily reset, hourly samples, day buckets --------------------------
const PEAKS = [41.3, 41.0, 45.0, 18.8];
const pv = PEAKS.flatMap((p, n) => pvDay(n, p));
{
    // Day 0 is the run-up bucket the window drops.
    const { points } = bucketDeltas(pv, 'day', day(1));
    const got = points.map(([ts, v]) => [new Date(ts).getDate(), round(v)]);
    const want = PEAKS.slice(1).map((p, i) => [15 + i, round(p)]);
    check(
        'resetting day counter - every day shows its own yield',
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`,
    );
    // The old max(D) - max(D-1) gave 0 for the 15th (41.0 < 41.3) and 4.0 for the 16th.
    check(
        'resetting day counter - no bar collapses to 0',
        points.every(([, v]) => v > 0),
        JSON.stringify(points.map(([, v]) => round(v))),
    );
}

// -- 2. a plain rising meter must come out exactly as before ----------------------------------
const meter = [];
for (let n = 0; n < 4; n++) for (let h = 0; h < 24; h++) meter.push([at(n, h), 12000 + n * 24 + h]);
{
    const { points } = bucketDeltas(meter, 'day', day(1));
    // Old behaviour: max(D) - max(D-1) = 24 per day.
    check(
        'monotonic meter - unchanged, one day of consumption per bar',
        points.length === 3 && points.every(([, v]) => near(v, 24)),
        JSON.stringify(points.map(([, v]) => round(v))),
    );
}

// -- 3. a stray low reading must not be booked as a full meter reading ------------------------
{
    const glitched = meter.map(([ts, v]) => {
        const d = new Date(ts);
        const hit = d.getDate() === 15 && (d.getHours() === 10 || d.getHours() === 11);
        return hit ? [ts, 0] : [ts, v];
    });
    const { points } = bucketDeltas(glitched, 'day', day(1));
    const bar = points.find(([ts]) => ts === day(1))?.[1];
    // 24 h of consumption minus the three increments the glitch swallowed (10:00, 11:00, 12:00).
    check('glitch - stray 0 costs three hours, not a 12000-unit spike', near(bar ?? -1, 21), `bar ${round(bar)}`);
}

// -- 4. lastBase lets a live reading grow the open bar ----------------------------------------
{
    const partial = [...PEAKS.slice(0, 3).flatMap((p, n) => pvDay(n, p)), ...pvDay(3, 18.8).slice(0, 13)];
    const { points, lastBucket, lastBase } = bucketDeltas(partial, 'day', day(1));
    const open = points[points.length - 1];
    check('live update - trailing bar sits in the open bucket', lastBucket === day(3) && open[0] === day(3));
    const lastVal = partial[partial.length - 1][1];
    check(
        'live update - live minus lastBase reproduces the bar',
        near(lastVal - lastBase, open[1]),
        `${round(lastVal - lastBase)} vs ${round(open[1])}`,
    );
    // A reading 2 kWh further along must move the bar by exactly that much.
    check('live update - a rise of 2 grows the bar by 2', near(lastVal + 2 - lastBase, open[1] + 2));
}

// -- 5. coarse windows: a daily `minmax` fetch keeps the reset visible ------------------------
{
    // What a step of a whole day returns: the low and the high of each day, at their real times.
    const rows = PEAKS.flatMap((p, n) => [
        [at(n, 0) + 5 * 60_000, 0],
        [at(n, 20) + 15 * 60_000, p],
    ]);
    // What the hook passes: the start of the bucket the window opens in.
    const { points } = bucketDeltas(rows, 'month', bucketStart(day(0), 'month'));
    const total = points.reduce((s, [, v]) => s + v, 0);
    const want = PEAKS.reduce((s, p) => s + p, 0);
    check(
        'monthly bucket - month total is the sum of the daily yields',
        near(total, want),
        `${round(total)} vs ${round(want)}`,
    );
}

// -- 6. the fetch resolution the above relies on ----------------------------------------------
{
    const month = 30 * 86_400_000;
    check(
        '30 day window - auto bucket is day, fetched hourly',
        resolveDeltaBucket('auto', month) === 'day' && deltaFetchStep('day', month) === 3_600_000,
    );
    const year = 365 * 86_400_000;
    check(
        '1 year window - auto bucket is month, fetched daily',
        resolveDeltaBucket('auto', year) === 'month' && deltaFetchStep('month', year) === 86_400_000,
    );
    // Two rows per step for `minmax` - the fetch asks for at most 3000.
    const rowsFor = (ms) => (ms / deltaFetchStep('month', ms)) * 2;
    check(
        'long windows stay under the 3000 row cap',
        rowsFor(year) < 3000 && rowsFor(5 * year) < 3000 && rowsFor(15 * year) < 3000,
        `1y ${Math.round(rowsFor(year))}, 5y ${Math.round(rowsFor(5 * year))}, 15y ${Math.round(rowsFor(15 * year))}`,
    );
}

// -- 7. buckets without a record fold into the next one that has one --------------------------
{
    const gappy = meter.filter(([ts]) => new Date(ts).getDate() !== 16);
    const { points } = bucketDeltas(gappy, 'day', day(1));
    check(
        'gap day - its consumption folds into the next bar instead of a false zero',
        points.length === 2 && near(points[0][1], 24) && near(points[1][1], 48),
        JSON.stringify(points.map(([, v]) => round(v))),
    );
}

// -- 8. bucketStart stays on local calendar boundaries ----------------------------------------
check('bucketStart - a day bucket starts at local midnight', bucketStart(at(1, 13) + 1234, 'day') === day(1));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
