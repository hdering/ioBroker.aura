// Verifies that a rolling chart window opens on the calendar bucket edge its delta bars sit on
// (issue #598).
//
//   node tools/tests/chart-window-align.mjs
//
// The regression: a 7-day window over bar series with `aggregate: 'delta'` and an `auto` bucket.
// The bars are stamped at the START of their day bucket, so the first bar landed at midnight of
// the first day - half a day left of `now - 7d`, where every other series began. A rolling chart
// derives its x axis from the data, so the axis stretched out to that bar and the temperature line
// appeared to start in the middle of the first day.
//
// No dev server needed: `rollingWindowStart` and `bucketDeltas` are pure, so the module is bundled
// with esbuild and exercised directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

// The socket layer the hook imports would run browser-only setup on load, and none of it is
// reachable from the pure exports - so it is replaced by a stub at bundle time.
const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-window-align-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { rollingWindowStart, bucketDeltas, bucketStart, resolveDeltaBucket, rangeToMs } from './src-vis/hooks/useMultiSeriesData.ts';",
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
const { rollingWindowStart, bucketDeltas, bucketStart, resolveDeltaBucket, rangeToMs } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const iso = (ts) => new Date(ts).toLocaleString('de-DE');

const DAY = 86_400_000;
const HOUR = 3_600_000;

// The reporter's widget: two stacked delta bars plus a plain temperature area on the right axis.
const barSeries = (id) => ({
    id,
    name: id,
    datapointId: `alias.0.${id}`,
    chartType: 'bar',
    source: 'history',
    historyInstance: 'influxdb.0',
    aggregate: 'delta',
    deltaBucket: 'auto',
    stack: true,
});
const lineSeries = {
    id: 'temp',
    name: 'SSD Temperatur',
    datapointId: 'alias.0.ssdTemperatur',
    chartType: 'area',
    source: 'history',
    historyInstance: 'influxdb.0',
    // The reporter's export carries a deltaBucket on the non-delta series too - it must not count.
    deltaBucket: 'day',
    yAxisIndex: 1,
};
const withRange = (s, range) => ({ ...s, historyRange: range });

// 29 Aug 2026, 14:37 local - the window then opens "in the middle of" 22 Aug, as in the screenshot.
const now = new Date(2026, 7, 29, 14, 37, 12, 345).getTime();

{
    console.log('\n7d window, delta bars + plain line (the reported chart)');
    const range = '7d';
    const rangeMs = rangeToMs(range);
    const series = [barSeries('tbw'), barSeries('tbr'), lineSeries].map((s) => withRange(s, range));

    check('7d resolves to a day bucket', resolveDeltaBucket('auto', rangeMs) === 'day');

    const start = rollingWindowStart(series, rangeMs, now);
    check('window opens at local midnight', start === bucketStart(now - rangeMs, 'day'), iso(start));
    check('window is not moved forward', start <= now - rangeMs, `${iso(start)} <= ${iso(now - rangeMs)}`);
    check('window grows by less than one bucket', now - rangeMs - start < DAY, `${(now - rangeMs - start) / HOUR} h`);

    // The point of the fix: the leading bar no longer sits left of the window.
    const readings = [];
    for (let ts = start - DAY; ts <= now; ts += HOUR) {
        readings.push([ts, (ts - (start - DAY)) / HOUR]);
    }
    const { points } = bucketDeltas(readings, 'day', bucketStart(start, 'day'));
    const firstBar = points[0][0];
    check('first delta bar sits inside the window', firstBar >= start, `${iso(firstBar)} >= ${iso(start)}`);
    check('first delta bar is the window start itself', firstBar === start, iso(firstBar));

    // The old behaviour, kept as the regression: an unsnapped window left that bar outside.
    check('regression: an unsnapped window left the bar outside', firstBar < now - rangeMs);
}

{
    console.log('\nno delta series - the window must stay exactly as long as it says');
    for (const range of ['1h', '6h', '24h', '7d', '30d', '1y']) {
        const rangeMs = rangeToMs(range);
        const start = rollingWindowStart([withRange(lineSeries, range)], rangeMs, now);
        check(`${range} unchanged without a delta series`, start === now - rangeMs, iso(start));
    }
}

{
    console.log('\nbucket kinds');
    const cases = [
        ['24h', 'hour'],
        ['7d', 'day'],
        ['30d', 'day'],
        ['1y', 'month'],
    ];
    for (const [range, bucket] of cases) {
        const rangeMs = rangeToMs(range);
        const series = [withRange(barSeries('m'), range), withRange(lineSeries, range)];
        const start = rollingWindowStart(series, rangeMs, now);
        check(
            `${range} snaps onto the ${bucket} bucket`,
            start === bucketStart(now - rangeMs, bucket),
            `${iso(start)} (expected ${iso(bucketStart(now - rangeMs, bucket))})`,
        );
    }
}

{
    console.log('\nan explicit bucket wins over auto');
    const range = '7d';
    const rangeMs = rangeToMs(range);
    const series = [withRange({ ...barSeries('m'), deltaBucket: 'hour' }, range), withRange(lineSeries, range)];
    const start = rollingWindowStart(series, rangeMs, now);
    check('hour bucket snaps to the full hour only', start === bucketStart(now - rangeMs, 'hour'), iso(start));
    check('hour bucket does not reach back to midnight', start > bucketStart(now - rangeMs, 'day'), iso(start));
}

{
    console.log('\nmixed buckets - the coarsest one sets the edge');
    const rangeMs = 7 * DAY;

    // Nesting units: the coarse edge is an edge of the finer bucket too, so both land on it exactly.
    for (const [fine, coarse] of [
        ['hour', 'day'],
        ['day', 'week'],
        ['day', 'month'],
        ['month', 'year'],
    ]) {
        const series = [
            withRange({ ...barSeries('f'), deltaBucket: fine }, '7d'),
            withRange({ ...barSeries('c'), deltaBucket: coarse }, '7d'),
            withRange(lineSeries, '7d'),
        ];
        const start = rollingWindowStart(series, rangeMs, now);
        check(
            `${fine} + ${coarse} opens on the ${coarse} edge`,
            start === bucketStart(now - rangeMs, coarse),
            iso(start),
        );
        check(
            `${fine} + ${coarse} is an edge of both buckets`,
            start === bucketStart(start, fine) && start === bucketStart(start, coarse),
            iso(start),
        );
    }

    // The week is the one unit that does not nest: pick a `now` whose window start falls on the 1st
    // of a month, so the week reaches back into the previous month. 1 Sep 2026 is a Tuesday, so its
    // week starts on 31 Aug - before the month. No edge satisfies both; the coarser one wins and the
    // weekly bars may hang off the left by less than a week.
    const mixedNow = new Date(2026, 8, 8, 9, 0, 0).getTime();
    const winStart = mixedNow - rangeMs; // 1 Sep 2026, 09:00
    check(
        'setup: the week edge lies before the month edge',
        bucketStart(winStart, 'week') < bucketStart(winStart, 'month'),
        `${iso(bucketStart(winStart, 'week'))} < ${iso(bucketStart(winStart, 'month'))}`,
    );

    const series = [
        withRange({ ...barSeries('w'), deltaBucket: 'week' }, '7d'),
        withRange({ ...barSeries('mo'), deltaBucket: 'month' }, '7d'),
        withRange(lineSeries, '7d'),
    ];
    const start = rollingWindowStart(series, rangeMs, mixedNow);
    check('week + month opens on the month edge', start === bucketStart(winStart, 'month'), iso(start));
    check('month bars start exactly on the window edge', bucketStart(start, 'month') === start, iso(start));
    check(
        'the non-nesting week bar hangs off by less than a week',
        start - bucketStart(start, 'week') < 7 * DAY,
        `${(start - bucketStart(start, 'week')) / DAY} d`,
    );
    // Snapping to the EARLIEST edge instead is what would blow the window up by most of a month.
    check(
        'regression: the earliest edge would have been far worse',
        start - Math.min(bucketStart(winStart, 'week'), bucketStart(winStart, 'month')) < 7 * DAY,
    );
}

{
    console.log('\nseries that do not share the window get no say in it');
    const range = '7d';
    const rangeMs = rangeToMs(range);
    const dayStart = new Date(2026, 7, 20).getTime();
    const pinned = { ...barSeries('pinned'), historyStart: dayStart, historyEnd: dayStart + DAY };

    check(
        'a pinned absolute window does not snap the rolling one',
        rollingWindowStart([pinned, withRange(lineSeries, range)], rangeMs, now) === now - rangeMs,
    );
    check(
        'a total series does not snap the rolling one',
        rollingWindowStart([withRange(barSeries('t'), 'total'), withRange(lineSeries, range)], rangeMs, now) ===
            now - rangeMs,
    );
    check(
        'a delta series on a different range does not snap this one',
        rollingWindowStart([withRange(barSeries('other'), '1y'), withRange(lineSeries, range)], rangeMs, now) ===
            now - rangeMs,
    );
    check(
        'a JSON-sourced series does not snap the window',
        rollingWindowStart(
            [withRange({ ...barSeries('j'), source: 'json' }, range), withRange(lineSeries, range)],
            rangeMs,
            now,
        ) ===
            now - rangeMs,
    );
    check(
        'a series without a datapoint does not snap the window',
        rollingWindowStart(
            [withRange({ ...barSeries('empty'), datapointId: '' }, range), withRange(lineSeries, range)],
            rangeMs,
            now,
        ) ===
            now - rangeMs,
    );
    check('an empty series list is a no-op', rollingWindowStart([], rangeMs, now) === now - rangeMs);
}

{
    console.log('\nthe snapped start survives the day it was computed on');
    // The live-update path re-derives the cutoff against the current time. It must never cut into
    // the leading bucket the fetch delivered.
    const rangeMs = rangeToMs('7d');
    const series = [withRange(barSeries('m'), '7d'), withRange(lineSeries, '7d')];
    const fetched = rollingWindowStart(series, rangeMs, now);
    for (const later of [now + 60_000, now + HOUR, now + 6 * HOUR]) {
        const cutoff = rollingWindowStart(series, rangeMs, later);
        check(
            `cutoff ${(later - now) / 60_000} min later stays on a bucket edge`,
            cutoff === bucketStart(later - rangeMs, 'day'),
            iso(cutoff),
        );
        check(`cutoff ${(later - now) / 60_000} min later never runs ahead of now`, cutoff <= later - rangeMs);
    }
    // Same calendar day => the cutoff has not moved at all, so no live update trims the leading bar.
    check('cutoff is unchanged within the same day', rollingWindowStart(series, rangeMs, now + HOUR) === fetched);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
