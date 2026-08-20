// Verifies the `consumption` aggregation of the "Diagramm (Verteilung)" widget (issue #561).
//
//   node tools/tests/energy-counter-increase.mjs
//
// No dev server needed: `counterIncrease` is pure, so the module is bundled with esbuild and
// exercised directly. The regression: the entries are day counters that fall back to 0 at
// midnight (`sourceanalytix.*.01_currentDay`, a PV inverter's day yield), and the only ranged
// aggregation for a counter was `delta` = end − start. On a rolling window that compares
// today's part-day against yesterday's finished day and comes out negative, so the shares the
// pie/bar draws are meaningless.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

// The socket layer the hook imports would run browser-only setup on load, and none of it is
// reachable from the pure exports — so it is replaced by a stub at bundle time.
const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateDirect = () => Promise.resolve(null);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => [];`,
};

// Inside the project: the bundle keeps `react` external, so it has to resolve from node_modules.
const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-energy-counter-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `export { counterIncrease, counterFetchStep } from './src-vis/hooks/useEnergyBalanceValues.ts';
            export { bucketStart, deltaFetchCount } from './src-vis/hooks/useMultiSeriesData.ts';`,
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
const { counterIncrease, counterFetchStep, bucketStart, deltaFetchCount } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const round = (n) => Math.round(n * 1000) / 1000;
const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;
/** What `delta` (end − start) would have produced, for the comparisons below. */
const endMinusStart = (data) => data[data.length - 1][1] - data[0][1];

// Fixed local dates to build the samples from — local, because the buckets are local.
const day = (n) => new Date(2026, 7, 14 + n, 0, 0, 0, 0).getTime();
const at = (n, hour) => new Date(2026, 7, 14 + n, hour, 0, 0, 0).getTime();

/** Hourly readings of a day counter: 0 until sunrise, ramping to `peak` at 20:00, then flat. */
const pvDay = (n, peak) =>
    Array.from({ length: 24 }, (_, h) => [at(n, h), h <= 7 ? 0 : peak * Math.min(1, (h - 7) / 13)]);

// -- 1. the reported case: a rolling 24 h window over a day counter ---------------------------
{
    // Yesterday 14:00 → today 14:00 of a counter that resets at midnight.
    const data = [...pvDay(0, 41.3).slice(14), ...pvDay(1, 18.8).slice(0, 15)];
    const start = at(0, 14);
    const got = counterIncrease(data, start);
    // Yesterday's remaining ramp (14:00 → 20:00) plus today's yield up to 14:00.
    const want = 41.3 - (41.3 * 7) / 13 + (18.8 * 7) / 13;
    check('24h window over a day counter - the window total', near(got, want), `${round(got)} vs ${round(want)}`);
    check(
        'the same window under delta (end - start) went negative',
        endMinusStart(data) < 0 && got > 0,
        `delta ${round(endMinusStart(data))}, consumption ${round(got)}`,
    );
}

// -- 2. a window on day boundaries is the sum of the daily values -----------------------------
{
    const PEAKS = [41.3, 41.0, 45.0, 18.8];
    const data = PEAKS.flatMap((p, n) => pvDay(n, p));
    const got = counterIncrease(data, day(0));
    const want = PEAKS.reduce((s, p) => s + p, 0);
    check('day-aligned window - sum of the daily values', near(got, want), `${round(got)} vs ${round(want)}`);
    // Differencing the ends only ever saw the last day, and only because it started at 0.
    check(
        'delta would have shown the last day alone',
        near(endMinusStart(data), PEAKS[PEAKS.length - 1]),
        `delta ${round(endMinusStart(data))}`,
    );
}

// -- 3. a plain rising meter must match delta exactly -----------------------------------------
{
    const data = [];
    for (let n = 0; n < 3; n++) for (let h = 0; h < 24; h++) data.push([at(n, h), 12000 + n * 24 + h]);
    const got = counterIncrease(data, day(0));
    check(
        'monotonic meter - identical to delta (end - start)',
        near(got, endMinusStart(data)),
        `${round(got)} vs ${round(endMinusStart(data))}`,
    );
}

// -- 4. a stray low reading must not be booked as a full meter reading ------------------------
{
    const data = [];
    for (let n = 0; n < 3; n++) for (let h = 0; h < 24; h++) data.push([at(n, h), 12000 + n * 24 + h]);
    const glitched = data.map(([ts, v]) => {
        const d = new Date(ts);
        const hit = d.getDate() === 15 && (d.getHours() === 10 || d.getHours() === 11);
        return hit ? [ts, 0] : [ts, v];
    });
    const got = counterIncrease(glitched, day(0));
    // 3 days minus the three increments the glitch swallowed (10:00, 11:00, 12:00).
    check('glitch - stray 0 costs three hours, not a 12000-unit spike', near(got, 71 - 3), `${round(got)}`);
}

// -- 5. nothing inside the window is trimmed away ---------------------------------------------
{
    // A window that opens mid-hour: the readings in that same hour still have to count.
    const data = [
        [at(0, 12) + 15 * 60_000, 1],
        [at(0, 12) + 45 * 60_000, 3],
        [at(0, 13), 7],
    ];
    const got = counterIncrease(data, at(0, 12) + 20 * 60_000);
    check('mid-hour window start - the opening hour still counts', near(got, 6), `${round(got)}`);
}

// -- 6. empty history yields null (the widget then draws nothing, not a 0 slice) ---------------
check('empty series - null, not 0', counterIncrease([], day(0)) === null);

// -- 7. the fetch resolution the reset detection relies on ------------------------------------
{
    // Every preset must come back with enough rows to have a rise to book at all - a single
    // row per window (what the plain step ladder gives a 1 h window) sums to nothing.
    const PRESETS = [
        ['1h', 3_600_000],
        ['6h', 21_600_000],
        ['24h', 86_400_000],
        ['7d', 604_800_000],
        ['30d', 2_592_000_000],
    ];
    for (const [label, ms] of PRESETS) {
        const step = counterFetchStep(ms);
        const rows = step ? ms / step : Infinity;
        check(`${label} window - resolution leaves rises to book`, rows >= 4, `step ${step ?? 'raw'}, rows ${rows}`);
    }
    check('1h window - raw readings, no bucketing', counterFetchStep(3_600_000) === undefined);
    check('24h window - 15 min steps (max)', counterFetchStep(86_400_000) === 900_000);
    check('30d window - hourly steps (max)', counterFetchStep(2_592_000_000) === 3_600_000);
    const year = 365 * 86_400_000;
    check('1 year custom window - daily minmax', counterFetchStep(year) === 86_400_000);
    // A step coarser than a day holds several reset cycles and hides all but one of them (#562),
    // so long windows keep the daily step and buy the rows they need instead.
    check(
        'no window is ever fetched coarser than a day',
        [year, 5 * year, 15 * year].every((ms) => counterFetchStep(ms) === 86_400_000),
        [year, 5 * year, 15 * year].map((ms) => counterFetchStep(ms) / 3_600_000 + 'h').join(', '),
    );
    check(
        'row budget covers the window',
        [year, 3 * year, 13 * year].every((ms) => deltaFetchCount(86_400_000, ms) >= (ms / 86_400_000) * 4),
        `1y ${deltaFetchCount(86_400_000, year)}, 13y ${deltaFetchCount(86_400_000, 13 * year)}`,
    );
}

// -- 8. a coarse `minmax` fetch still adds the days up ----------------------------------------
{
    const PEAKS = [41.3, 41.0, 45.0, 18.8];
    // What a daily `minmax` step returns: the low and the high of each day, at their real times.
    const rows = PEAKS.flatMap((p, n) => [
        [at(n, 0) + 5 * 60_000, 0],
        [at(n, 20) + 15 * 60_000, p],
    ]);
    const got = counterIncrease(rows, day(0));
    const want = PEAKS.reduce((s, p) => s + p, 0);
    check('daily minmax rows - still the sum of the daily yields', near(got, want), `${round(got)} vs ${round(want)}`);
}

// -- 8b. issue #562: the reset lands INSIDE the new day ---------------------------------------
{
    // The row a history adapter flushes at midnight still holds yesterday's total, so the reset
    // sits a few records into the new day - where it used to be taken for a glitch, which then
    // discarded the whole day's climb whenever it reached the day before's level.
    const PEAKS = [1.9, 2.4, 2.8, 3.1]; // rising: every day reaches the previous one
    const rows = PEAKS.flatMap((p, n) => [
        ...(n > 0 ? [[at(n, 0), PEAKS[n - 1]]] : []),
        [at(n, 0) + 5_000, 0],
        [at(n, 20) + 15 * 60_000, p],
        [at(n, 23), p],
    ]);
    const got = counterIncrease(rows, day(0));
    const want = PEAKS.reduce((s, p) => s + p, 0);
    check(
        'reset inside the day - still the sum of the daily yields',
        near(got, want),
        `${round(got)} vs ${round(want)}`,
    );
}

// -- 9. the hour anchor the hook passes -------------------------------------------------------
check('bucketStart - an hour bucket starts on the local hour', bucketStart(at(1, 13) + 1234, 'hour') === at(1, 13));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
