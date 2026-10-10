// Verifies the period value of the "Diagramm (erweitert)" widget (issue #749).
//
//   node tools/tests/chart-period-value.mjs
//
// No dev server needed: `periodFetch`, `reducePeriod` and `periodFromBars` are pure, so the module
// is bundled with esbuild and exercised directly. The counter kinds must match the "Diagramm
// (Verteilung)" widget, which the issue was first answered with — same fetch, same number.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

// The socket layer the hook imports would run browser-only setup on load — stubbed at bundle time.
const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateDirect = () => Promise.resolve(null);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => [];`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-chart-period-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `export { periodFetch, reducePeriod, periodFromBars, counterIncrease } from './src-vis/hooks/useMultiSeriesData.ts';
            export { counterFetchStep } from './src-vis/hooks/useEnergyBalanceValues.ts';`,
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
const { periodFetch, reducePeriod, periodFromBars, counterIncrease, counterFetchStep } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const near = (a, b, eps = 0.001) => a !== null && Math.abs(a - b) <= eps;

const H = 3_600_000;
const D = 24 * H;
const at = (n, hour) => new Date(2026, 9, 1 + n, hour, 0, 0, 0).getTime();

// -- 1. fetch parameters ----------------------------------------------------------------------
{
    // The counter kinds take the Verteilung widget's fetch, so both widgets agree.
    for (const ms of [H, D, 7 * D, 30 * D, 365 * D]) {
        const f = periodFetch('consumption', ms);
        check(`consumption ${ms / H}h - counter step`, f.step === counterFetchStep(ms), String(f.step));
    }
    check('consumption 30d - hourly max', periodFetch('consumption', 30 * D).aggregate === 'max');
    check('consumption 1y - daily minmax', periodFetch('consumption', 365 * D).aggregate === 'minmax');
    check('consumption 1h - raw', periodFetch('consumption', H).aggregate === 'none');
    check('change - same fetch as consumption', periodFetch('change', 30 * D).aggregate === 'max');
    // A bucket's own extreme, not the bucket average — the average flattens every peak.
    check('max 30d - bucket max', periodFetch('max', 30 * D).aggregate === 'max');
    check('min 30d - bucket min', periodFetch('min', 30 * D).aggregate === 'min');
    check('average 30d - bucket average', periodFetch('average', 30 * D).aggregate === 'average');
    check('max 1h - raw readings', periodFetch('max', H).aggregate === 'none');
}

// -- 2. consumption: a meter and a day counter ------------------------------------------------
{
    // Monotonic meter, 3 days: +1 kWh per hour.
    const start = at(0, 0);
    const meter = Array.from({ length: 72 }, (_, h) => [start + h * H, 1000 + h]);
    const end = start + 72 * H;
    const c = reducePeriod('consumption', meter, start, end);
    check('meter - consumption = end − start', near(c, 71), String(c));
    check('meter - change = end − start', near(reducePeriod('change', meter, start, end), 71));

    // Day counter: 0 → 10 each day, reset at midnight. End − start would be ~0.
    const dayCounter = [];
    for (let n = 0; n < 3; n++) for (let h = 0; h < 24; h++) dayCounter.push([at(n, h), (10 * h) / 23]);
    const dc = reducePeriod('consumption', dayCounter, at(0, 0), at(3, 0));
    check('day counter - consumption sums the days', near(dc, 30), String(dc));
    check(
        'day counter - matches the Verteilung widget',
        near(dc, counterIncrease(dayCounter, at(0, 0))),
        String(counterIncrease(dayCounter, at(0, 0))),
    );

    // A border row past the window end must not book a later rise.
    const withTail = [...meter, [end + 5 * H, 2000]];
    check('border row after the end is ignored', near(reducePeriod('consumption', withTail, start, end), 71));
}

// -- 3. readings: min / max / average ---------------------------------------------------------
{
    const start = at(0, 0);
    const end = at(1, 0);
    const rows = [
        [start - H, 99], // the adapter's border row — a reading from before the window
        [start + H, 4],
        [start + 2 * H, 10],
        [start + 3 * H, 1],
    ];
    check('max - border row outside the window is no extreme', reducePeriod('max', rows, start, end) === 10);
    check('min', reducePeriod('min', rows, start, end) === 1);
    check('average', near(reducePeriod('average', rows, start, end), 5));
    // Only a border row: the datapoint was constant all window long — it still has a value.
    check('only the border row - its value', reducePeriod('max', [[start - H, 7]], start, end) === 7);
    check('empty - null, not 0', reducePeriod('max', [], start, end) === null);
    check('empty consumption - null', reducePeriod('consumption', [], start, end) === null);
}

// -- 4. delta bars ----------------------------------------------------------------------------
{
    const bars = [
        [at(0, 0), 3],
        [at(1, 0), 7],
        [at(2, 0), 5],
    ];
    check('bars - consumption = sum', periodFromBars('consumption', bars) === 15);
    check('bars - change = sum', periodFromBars('change', bars) === 15);
    check('bars - max = highest bar', periodFromBars('max', bars) === 7);
    check('bars - min = lowest bar', periodFromBars('min', bars) === 3);
    check('bars - average = mean bar', near(periodFromBars('average', bars), 5));
    check('no bars - null', periodFromBars('consumption', []) === null);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
