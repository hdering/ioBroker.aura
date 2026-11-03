// Verifies the per-entry conversion of the "Diagramm (Verteilung)" widget (valueFactor /
// valueOffset on an EnergyEntry, e.g. Wh → kWh).
//
//   node tools/tests/energy-value-transform.mjs
//
// No dev server needed: `aggregateEntry` / `liveValue` are pure, so the module is bundled with
// esbuild and exercised directly (same stubs as energy-counter-increase.mjs).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

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
const bundle = join(cache, `aura-energy-transform-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `export { aggregateEntry, liveValue } from './src-vis/hooks/useEnergyBalanceValues.ts';
            export { matchValueTransformPreset } from './src-vis/utils/valueTransform.ts';`,
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
const { aggregateEntry, liveValue, matchValueTransformPreset } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= eps;

const at = (n, hour) => new Date(2026, 10, 1 + n, hour, 0, 0, 0).getTime();
const kwh = { id: 'a', datapointId: 'x', valueFactor: 0.001, valueTransform: 'wh-kwh' };
const plain = { id: 'b', datapointId: 'x' };

/** A lifetime inverter counter in Wh (acEnergyWh), +1000 Wh per hour from 08:00 to 16:00. */
const lifetime = Array.from({ length: 24 }, (_, h) => [
    at(0, h),
    412_345_000 + Math.max(0, Math.min(h, 16) - 8) * 1000,
]);

// -- 1. consumption / delta of a Wh counter come out in kWh --------------------------------------
{
    const got = aggregateEntry(kwh, lifetime, 'consumption', at(0, 0));
    check('consumption: 8000 Wh rise reads as 8 kWh', near(got, 8), String(got));
    const raw = aggregateEntry(plain, lifetime, 'consumption', at(0, 0));
    check('consumption without a factor stays in Wh', near(raw, 8000), String(raw));
    const d = aggregateEntry(kwh, lifetime, 'delta', at(0, 0));
    check('delta: 8 kWh', near(d, 8), String(d));
}

// -- 2. the offset cancels out in the differencing modes -----------------------------------------
{
    const shifted = { ...kwh, valueOffset: 500 };
    check('consumption ignores the offset', near(aggregateEntry(shifted, lifetime, 'consumption', at(0, 0)), 8));
    check('delta ignores the offset', near(aggregateEntry(shifted, lifetime, 'delta', at(0, 0)), 8));
}

// -- 3. a negative factor flips the result instead of reading as a falling counter ---------------
{
    const neg = { ...kwh, valueFactor: -0.001 };
    const got = aggregateEntry(neg, lifetime, 'consumption', at(0, 0));
    check('consumption with ×−0.001 = −8', near(got, -8), String(got));
}

// -- 4. the reading modes convert every reading ---------------------------------------------------
{
    const power = [
        [at(0, 10), 2000],
        [at(0, 11), 4000],
    ];
    const kw = { id: 'p', datapointId: 'x', valueFactor: 0.001, valueOffset: 1 };
    check('average: (2+1 + 4+1)/2 = 4', near(aggregateEntry(kw, power, 'average', at(0, 10)), 4));
    check('max: 4+1 = 5', near(aggregateEntry(kw, power, 'max', at(0, 10)), 5));
    check('sum: 3 + 5 = 8', near(aggregateEntry(kw, power, 'sum', at(0, 10)), 8));
    check('empty window stays null', aggregateEntry(kw, [], 'consumption', at(0, 10)) === null);
}

// -- 5. live / last values --------------------------------------------------------------------------
check('live: 23456 Wh → 23.456 kWh', near(liveValue(kwh, 23456), 23.456));
check('live without a factor is untouched', liveValue(plain, 23456) === 23456);
check('live: a text value is no number', liveValue(kwh, 'n/a') === null);

// -- 6. the Wh → MWh preset is recognised from its factor -------------------------------------------
check('preset wh-mwh matches ×0.000001', matchValueTransformPreset(0.000001, 0) === 'wh-mwh');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
