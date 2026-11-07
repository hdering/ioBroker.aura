// Verifies the step a short chart window falls back to once its raw fetch fills the row cap.
//
//   node tools/tests/chart-raw-cap.mjs
//
// Windows up to 3 h are fetched raw with a 1000-row cap. A datapoint written every few seconds
// logs more than that, the adapter returns only part of the window and the curve breaks off —
// 180 minutes looked broken while 181 (the first stepped span) was fine. The hook then fetches
// again at `rawCapStep`, which has to stay below the cap for every aggregation.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-raw-cap-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { rawCapStep, RAW_FETCH_COUNT } from './src-vis/hooks/useMultiSeriesData.ts';",
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
const { rawCapStep, RAW_FETCH_COUNT } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};

const MIN = 60_000;
const rows = (range, agg) => Math.ceil(range / rawCapStep(range, agg)) * (agg === 'minmax' ? 4 : 1);

for (const range of [30 * MIN, 60 * MIN, 120 * MIN, 180 * MIN, 12 * 60 * MIN, 7 * 24 * 60 * MIN]) {
    for (const agg of [undefined, 'average', 'max', 'minmax']) {
        const r = rows(range, agg);
        check(`${range / MIN} min, ${agg ?? 'default'} stays below the cap`, r < RAW_FETCH_COUNT, `${r} rows`);
    }
}

// Fine enough to still read as a curve: 3 h averaged lands on 15 s, as minmax on 1 min.
check('180 min average → 15 s', rawCapStep(180 * MIN) === 15_000, `${rawCapStep(180 * MIN)} ms`);
check('180 min minmax → 1 min', rawCapStep(180 * MIN, 'minmax') === 60_000, `${rawCapStep(180 * MIN, 'minmax')} ms`);
check('60 min → 10 s', rawCapStep(60 * MIN) === 10_000, `${rawCapStep(60 * MIN)} ms`);

if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall checks passed');
