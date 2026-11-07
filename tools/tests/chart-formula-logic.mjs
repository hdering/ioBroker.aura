// Computed chart series — utils/formulaSeries.ts (issue #930).
//
//   node tools/tests/chart-formula-logic.mjs
//
// Pure module, driven directly: inputs logged on change only (sample and hold, seeded from the
// row before the window), formula checks, per-bucket deltas of several counters, the
// time-weighted bucketing of a raw curve and the area under it (W over time → Wh).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-formula-${process.pid}.mjs`);
await build({
    stdin: { contents: "export * from './src-vis/utils/formulaSeries.ts';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const f = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let n = 0;
const check = (name, fn) => {
    fn();
    n++;
    console.log(`  ok  ${name}`);
};

const M = 60_000;
const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 1);

check('sample and hold: change-only inputs leave no gaps', () => {
    // u logged once before the window, i changes twice inside it.
    const out = f.combineFormula(
        'u * i',
        [
            { name: 'u', data: [[T0 - 5 * M, 50]] },
            {
                name: 'i',
                data: [
                    [T0 - 1 * M, 2],
                    [T0 + 10 * M, 4],
                    [T0 + 30 * M, 0],
                ],
            },
        ],
        T0,
    );
    assert.deepEqual(out, [
        [T0, 100],
        [T0 + 10 * M, 200],
        [T0 + 30 * M, 0],
    ]);
});

check('nothing until every input is known; three inputs sum', () => {
    const out = f.combineFormula(
        'a + b + c',
        [
            {
                name: 'a',
                data: [
                    [T0 + 1 * M, 1],
                    [T0 + 5 * M, 2],
                ],
            },
            { name: 'b', data: [[T0 + 2 * M, 10]] },
            { name: 'c', data: [[T0 + 3 * M, 100]] },
        ],
        T0,
    );
    assert.deepEqual(out, [
        [T0 + 3 * M, 111],
        [T0 + 5 * M, 112],
    ]);
});

check('division by zero is a gap, not Infinity', () => {
    const out = f.combineFormula(
        'a / b',
        [
            { name: 'a', data: [[T0, 4]] },
            {
                name: 'b',
                data: [
                    [T0, 2],
                    [T0 + M, 0],
                    [T0 + 2 * M, 4],
                ],
            },
        ],
        T0,
    );
    assert.deepEqual(out, [
        [T0, 2],
        [T0 + 2 * M, 1],
    ]);
});

check('formula problems are named', () => {
    const ins = [
        { name: 'is', datapointId: 'a.0.x' },
        { name: 'ib', datapointId: 'a.0.y' },
    ];
    assert.equal(f.formulaProblem('(is - ib) * 2', ins), null);
    assert.deepEqual(f.formulaProblem('is - ix', ins), { kind: 'unknown', name: 'ix' });
    assert.deepEqual(f.formulaProblem('is - ', ins), { kind: 'parse' });
    assert.deepEqual(f.formulaProblem('', ins), { kind: 'empty' });
    assert.deepEqual(f.formulaProblem('is + alias.0.z', ins), { kind: 'datapoint', id: 'alias.0.z' });
    assert.deepEqual(f.formulaProblem('a', [{ name: '1a', datapointId: 'x.0.a' }]), { kind: 'name', name: '1a' });
    assert.deepEqual(
        f.formulaProblem('a', [
            { name: 'a', datapointId: 'x.0.a' },
            { name: 'a', datapointId: 'x.0.b' },
        ]),
        {
            kind: 'duplicate',
            name: 'a',
        },
    );
    assert.equal(f.formulaProblem('Math.max(is, ib, 0)', ins), null);
});

check('suggested names are identifiers and unique', () => {
    assert.equal(f.suggestVarName('alias.0.battery.raVoltage', []), 'raVoltage');
    assert.equal(f.suggestVarName('x.0.power', ['power']), 'power2');
    assert.equal(f.suggestVarName('x.0.1-phase', []), '_1_phase');
});

check('counters: deltas per bucket, then the formula; a missing bucket is left out', () => {
    const out = f.combineBuckets('a + b - c', [
        {
            name: 'a',
            data: [
                [1, 5],
                [2, 6],
                [3, 7],
            ],
        },
        {
            name: 'b',
            data: [
                [1, 1],
                [2, 1],
            ],
        },
        {
            name: 'c',
            data: [
                [1, 2],
                [2, 0],
                [3, 1],
            ],
        },
    ]);
    assert.deepEqual(out, [
        [1, 4],
        [2, 7],
    ]);
});

check('integral: 100 W for 30 min + 200 W for 30 min = 150 Wh', () => {
    const pts = [
        [T0 - 10 * M, 100],
        [T0 + 30 * M, 200],
    ];
    assert.equal(f.integrate(pts, T0, T0 + H), 150);
    // Nothing known before the first row: that part counts nothing.
    assert.equal(f.integrate([[T0 + 30 * M, 200]], T0, T0 + H), 100);
    assert.equal(f.integrate([], T0, T0 + H), null);
});

check('bucketing: time-weighted, not per reading', () => {
    // 0 W for 50 min, then 600 W for 10 min with many readings: the mean is 100 W.
    const pts = [[T0, 0]];
    for (let k = 0; k < 10; k++) pts.push([T0 + (50 + k) * M, 600]);
    const [row] = f.bucketFormula(pts, T0, T0 + H, H, 'average');
    assert.equal(row[0], T0 + 30 * M);
    assert.ok(Math.abs(row[1] - 100) < 1e-9, String(row[1]));
    assert.deepEqual(f.bucketFormula(pts, T0, T0 + H, H, 'max'), [[T0 + 30 * M, 600]]);
    // Held from the previous bucket into an empty one.
    const two = f.bucketFormula([[T0, 5]], T0, T0 + 2 * H, H, 'average');
    assert.deepEqual(two, [
        [T0 + 30 * M, 5],
        [T0 + 90 * M, 5],
    ]);
    assert.ok(Math.abs(f.timeAverage(pts, T0, T0 + H) - 100) < 1e-9);
});

console.log(`chart-formula-logic: ${n} checks passed`);
