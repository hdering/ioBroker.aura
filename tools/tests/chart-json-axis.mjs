// Verifies that a JSON datapoint can hand the advanced chart its y-axis bounds (issue #550).
//
//   node tools/tests/chart-json-axis.mjs
//
// No dev server needed: `parseJsonAxisBounds` is pure, so the hook is bundled with esbuild and
// exercised directly. What is checked is where the min/max block may sit (root, a named wrapper,
// beside the array further down the path), which key spellings count, that a series' value
// conversion applies to the bounds as well, and above all that payloads WITHOUT such a block are
// left alone — every existing JSON chart depends on that.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

// The socket layer the hook imports would run browser-only setup on load, and none of it is
// reachable from the pure exports — so it is replaced by a stub at bundle time.
const STUBS = {
    './useIoBroker': `export const getHistoryDirect = () => Promise.resolve([]);
        export const getStateFromCache = () => null;
        export const getObjectDirect = () => Promise.resolve(null);`,
    './useChartHistory': `export const TOTAL_FLOOR_MS = 0;
        export const detectHistoryAdapters = () => Promise.resolve([]);`,
};

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-json-axis-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { parseJsonAxisBounds, parseJsonSeries } from './src-vis/hooks/useMultiSeriesData.ts';",
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
const { parseJsonAxisBounds, parseJsonSeries } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const show = (b) => (b === undefined ? 'undefined' : `min=${b.min} max=${b.max}`);
const eq = (name, got, min, max) =>
    check(name, !!got && got.min === min && got.max === max, `${show(got)} (want min=${min} max=${max})`);

const DATA = [
    { label: '12:00', value: 0.5 },
    { label: '13:00', value: 1.2 },
];
const series = (extra = {}) => ({ id: 's1', datapointId: 'x.0.y', name: 'S', source: 'json', ...extra });

// -- 1. the shapes a payload may use ---------------------------------------------------------
eq(
    'root min/max beside the array',
    parseJsonAxisBounds({ min: 0, max: 100, data: DATA }, series({ jsonPath: 'data' })),
    0,
    100,
);
eq(
    'named wrapper "axis"',
    parseJsonAxisBounds({ axis: { min: -5, max: 45 }, data: DATA }, series({ jsonPath: 'data' })),
    -5,
    45,
);
eq(
    'yAxis wrapper with yMin/yMax as strings',
    parseJsonAxisBounds({ yAxis: { yMin: '0', yMax: '3.5' }, data: DATA }, series({ jsonPath: 'data' })),
    0,
    3.5,
);
eq(
    'block beside the array further down the path',
    parseJsonAxisBounds({ data: { scale: { min: 10, max: 20 }, hours: DATA } }, series({ jsonPath: 'data.hours' })),
    10,
    20,
);
eq(
    'unnamed nested object carrying min/max',
    parseJsonAxisBounds({ whatever: { min: 1, max: 2 }, data: DATA }, series({ jsonPath: 'data' })),
    1,
    2,
);
eq(
    'payload handed over as a JSON string',
    parseJsonAxisBounds(JSON.stringify({ min: 4, max: 8, data: DATA }), series({ jsonPath: 'data' })),
    4,
    8,
);
eq(
    'minValue/maxValue spelling',
    parseJsonAxisBounds({ minValue: 2, maxValue: 6, data: DATA }, series({ jsonPath: 'data' })),
    2,
    6,
);

// -- 2. one bound only ----------------------------------------------------------------------
{
    const got = parseJsonAxisBounds({ max: 100, data: DATA }, series({ jsonPath: 'data' }));
    check('max alone leaves min automatic', !!got && got.min === undefined && got.max === 100, show(got));
}
{
    const got = parseJsonAxisBounds({ min: 0, data: DATA }, series({ jsonPath: 'data' }));
    check('min alone leaves max automatic', !!got && got.min === 0 && got.max === undefined, show(got));
}

// -- 3. jsonAxisPath pins the block down ----------------------------------------------------
eq(
    'explicit path wins over the first candidate',
    parseJsonAxisBounds(
        { min: 0, max: 1, right: { min: 100, max: 200 }, data: DATA },
        series({ jsonPath: 'data', jsonAxisPath: 'right' }),
    ),
    100,
    200,
);
check(
    'explicit path that holds nothing → no bounds',
    parseJsonAxisBounds({ min: 0, max: 1, data: DATA }, series({ jsonPath: 'data', jsonAxisPath: 'nope' })) ===
        undefined,
    'undefined expected',
);

// -- 4. payloads without a block stay untouched ---------------------------------------------
const NONE = [
    ['plain array payload', DATA, series()],
    ['object payload without min/max', { data: DATA }, series({ jsonPath: 'data' })],
    ['broken JSON string', '{not json', series()],
    ['null value', null, series()],
    ['number value', 42, series()],
    // A `min` INSIDE the entries is per-point data, not an axis bound — the array is never scanned.
    [
        'min/max inside the array entries',
        { data: [{ label: 'a', value: 1, min: 5, max: 9 }] },
        series({ jsonPath: 'data' }),
    ],
    // Non-numeric bounds are no bounds — an axis cannot be scaled to "auto".
    ['non-numeric min/max', { min: 'auto', max: '', data: DATA }, series({ jsonPath: 'data' })],
];
for (const [name, raw, s] of NONE) {
    const got = parseJsonAxisBounds(raw, s);
    check(`no bounds: ${name}`, got === undefined, show(got));
}

// -- 5. the series' value conversion applies to the bounds too ------------------------------
{
    const s = series({ jsonPath: 'data', valueFactor: 0.001 });
    const got = parseJsonAxisBounds({ min: 0, max: 5000, data: [{ label: 'a', value: 2500 }] }, s);
    const points = parseJsonSeries({ min: 0, max: 5000, data: [{ label: 'a', value: 2500 }] }, s);
    check(
        'W → kW scales axis and points alike',
        got?.max === 5 && points[0]?.value === 2.5,
        `${show(got)} · point=${points[0]?.value}`,
    );
}
{
    const s = series({ jsonPath: 'data', valueOffset: -273.15 });
    const got = parseJsonAxisBounds({ min: 273.15, max: 373.15, data: DATA }, s);
    check('offset applies to both bounds', got?.min === 0 && Math.abs((got?.max ?? 0) - 100) < 1e-9, show(got));
}

// -- 6. the data itself keeps parsing next to a bounds block --------------------------------
{
    const points = parseJsonSeries({ axis: { min: 0, max: 10 }, data: DATA }, series({ jsonPath: 'data' }));
    check(
        'bounds block does not disturb the point parsing',
        points.length === 2 && points[0].label === '12:00' && points[1].value === 1.2,
        JSON.stringify(points),
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
