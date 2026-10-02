// Verifies the comparison-series time shift of the advanced chart (issue #730).
//
//   node tools/tests/chart-time-shift.mjs
//
// No dev server needed: the shift helpers are pure, so the module is bundled with esbuild and
// exercised directly. Runs in Europe/Berlin so the calendar steps cross a real DST switch.
import { build } from 'esbuild';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

process.env.TZ = 'Europe/Berlin';

const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-time-shift-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { shiftTime, seriesTimeShift, nextBucketStart, bucketStart, bucketDeltas } from './src-vis/hooks/useMultiSeriesData.ts';",
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
const { shiftTime, seriesTimeShift, nextBucketStart, bucketStart, bucketDeltas } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
    if (!ok) failed++;
};
const local = (y, m, d, h = 0) => new Date(y, m - 1, d, h).getTime();
const iso = (ts) => new Date(ts).toLocaleString('sv-SE');

// ── shiftTime: calendar steps ─────────────────────────────────────────────────
check('1 year back lands on the same date', shiftTime(local(2026, 3, 1), -1, 'year') === local(2025, 3, 1));
check('1 month back lands on the same day', shiftTime(local(2026, 10, 15, 8), -1, 'month') === local(2026, 9, 15, 8));
// 29 March 2026 is the spring-forward day in Berlin: a day back keeps the wall-clock hour.
check(
    'a day back across DST keeps the wall-clock time',
    shiftTime(local(2026, 3, 30, 12), -1, 'day') === local(2026, 3, 29, 12),
    iso(shiftTime(local(2026, 3, 30, 12), -1, 'day')),
);
check('a week back is seven calendar days', shiftTime(local(2026, 4, 2, 6), -1, 'week') === local(2026, 3, 26, 6));
check('hours are plain milliseconds', shiftTime(1_000_000_000_000, -2, 'hour') === 1_000_000_000_000 - 7_200_000);
check(
    'back and forward round-trip',
    shiftTime(shiftTime(local(2026, 7, 4), -1, 'year'), 1, 'year') === local(2026, 7, 4),
);

// ── seriesTimeShift ───────────────────────────────────────────────────────────
check('unset shift = none', seriesTimeShift({}) === null);
check('zero shift = none', seriesTimeShift({ timeShift: 0, timeShiftUnit: 'day' }) === null);
check('JSON series are never shifted', seriesTimeShift({ timeShift: 1, source: 'json' }) === null);
const def = seriesTimeShift({ timeShift: 1 });
check('unit defaults to year', def?.amount === 1 && def?.unit === 'year', JSON.stringify(def));

// ── nextBucketStart ───────────────────────────────────────────────────────────
check('next month bucket', nextBucketStart(local(2025, 10, 17, 9), 'month') === local(2025, 11, 1));
check('next year bucket', nextBucketStart(local(2025, 10, 17), 'year') === local(2026, 1, 1));
check('next day across DST', nextBucketStart(local(2026, 3, 29, 1), 'day') === local(2026, 3, 30));

// ── Monthly bars of last year land on this year's month buckets ───────────────
// A meter rising 100 per day; differenced per month a year back, then moved forward and snapped.
const rows = [];
for (let ts = local(2024, 12, 1); ts <= local(2025, 12, 1); ts = shiftTime(ts, 1, 'day')) {
    rows.push([ts, rows.length * 100]);
}
const { points } = bucketDeltas(rows, 'month', local(2025, 1, 1));
const moved = points.map(([b, v]) => [bucketStart(shiftTime(b, 1, 'year'), 'month'), v]);
check(
    'shifted month bars start on this year’s month starts',
    moved.every(([b], i) => b === local(2026, i + 1, 1)),
    moved.map(([b]) => iso(b)).join(', '),
);
check('January keeps its 31 days of consumption', moved[0][1] === 3100, String(moved[0][1]));
check('February 2025 keeps its 28 days', moved[1][1] === 2800, String(moved[1][1]));

// Week buckets don't line up a year later (365 days = 52 weeks + 1 day) — snapping fixes that.
const wk = bucketStart(local(2025, 10, 6), 'week'); // a Monday
const wkMoved = bucketStart(shiftTime(wk, 1, 'year'), 'week');
check('shifted week bucket snaps back to a Monday', new Date(wkMoved).getDay() === 1, iso(wkMoved));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
