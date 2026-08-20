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
        contents:
            "export { parseJsonAxisBounds, parseJsonSeries, resolveJsonArray, suggestJsonArrayPaths } from './src-vis/hooks/useMultiSeriesData.ts';",
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
const { parseJsonAxisBounds, parseJsonSeries, resolveJsonArray, suggestJsonArrayPaths } = await import(
    pathToFileURL(bundle).href
);
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

// -- 7. the payload arrives wrapped in an array ---------------------------------------------
// The shape reported on the issue: a script that used to write a bare array wraps it in one so
// it can add the bounds block. Neither the data nor the bounds were found before — whatever the
// user typed into the two path fields.
const WRAPPED = JSON.stringify([
    {
        yAxis: { yMin: 20, yMax: 0 },
        data: [
            { ts: 1786990830338, value: 10 },
            { ts: 1787077230338, value: 30 },
        ],
    },
]);
for (const cfg of [{}, { jsonPath: 'data' }, { jsonPath: '0.data' }, { jsonPath: 'data', jsonAxisPath: 'yAxis' }]) {
    const s = series(cfg);
    const arr = resolveJsonArray(WRAPPED, s.jsonPath);
    const points = parseJsonSeries(WRAPPED, s);
    const got = parseJsonAxisBounds(WRAPPED, s);
    const label = JSON.stringify(cfg) === '{}' ? 'no paths set' : JSON.stringify(cfg);
    check(
        `array-wrapped payload (${label})`,
        arr?.length === 2 && points.length === 2 && points[1].value === 30 && got?.min === 0 && got?.max === 20,
        `${arr?.length ?? 'null'} entries · ${points.length} points · ${show(got)}`,
    );
}

// -- 8. bounds are handed over in ascending order -------------------------------------------
eq('min/max written the wrong way round', parseJsonAxisBounds({ min: 20, max: 0, data: DATA }, series()), 0, 20);
eq(
    'a negative factor flips them back',
    parseJsonAxisBounds({ min: 0, max: 100, data: DATA }, series({ jsonPath: 'data', valueFactor: -1 })),
    -100,
    0,
);

// -- 9. a real data array is never mistaken for a wrapper ----------------------------------
{
    const one = [{ ts: 1786990830338, value: 7 }];
    const points = parseJsonSeries(one, series());
    check(
        'single-entry data array stays the data',
        points.length === 1 && points[0].value === 7,
        JSON.stringify(points),
    );
}
{
    // Two nested arrays are ambiguous — the path has to pick one, so the wrapper stays put.
    const ambiguous = [{ a: [{ label: 'x', value: 1 }], b: [{ label: 'y', value: 2 }] }];
    const arr = resolveJsonArray(ambiguous, undefined);
    const picked = resolveJsonArray(ambiguous, 'b');
    check(
        'ambiguous wrapper is left alone, path picks the array',
        arr?.length === 1 && picked?.length === 1 && picked[0].value === 2,
        `${arr?.length} / ${JSON.stringify(picked)}`,
    );
}
{
    const nested = { rows: [{ label: 'a', value: 1, min: 5, max: 9 }] };
    check(
        'entry-level min/max stays out of the axis with a wrapper in play',
        parseJsonAxisBounds([nested], series({ jsonPath: 'rows' })) === undefined,
        show(parseJsonAxisBounds([nested], series({ jsonPath: 'rows' }))),
    );
}

// -- 10. the editor's path suggestions ------------------------------------------------------
// What the options panel offers when the configured path found nothing.
const SUGGEST = [
    ['object payload', { axis: { min: 0, max: 1 }, data: DATA }, ['data']],
    ['array-wrapped payload suggests the inner key, not 0.data', [{ yAxis: {}, data: DATA }], ['data']],
    ['nested one level down', { result: { hours: DATA, days: DATA } }, ['result.hours', 'result.days']],
    ['JSON string payload', JSON.stringify({ rows: DATA }), ['rows']],
    ['empty arrays are no suggestion', { data: [] }, []],
    ['broken JSON', '{not json', []],
    ['plain array payload has nothing to offer', DATA, []],
];
for (const [name, raw, want] of SUGGEST) {
    const got = suggestJsonArrayPaths(raw);
    check(
        `suggest: ${name}`,
        JSON.stringify(got) === JSON.stringify(want),
        `${JSON.stringify(got)} (want ${JSON.stringify(want)})`,
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
