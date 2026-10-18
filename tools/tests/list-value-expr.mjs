// Verifies the expression conversion and the JSON path of list entries (issue #794).
//
//   node tools/tests/list-value-expr.mjs
//
// A list entry may read one field out of a JSON datapoint (`id?path`) and convert it with an
// expression (`dp.objektName * 0.4 | fixed(2)`) instead of factor/offset. The expression replaces
// factor/offset as a whole, a list-wide expression is inherited like any other conversion, and a
// typo must leave the value standing rather than blank the row.
//
// No dev server needed — the modules are pure and are bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-list-value-expr-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { applyValueExpr } from './src-vis/utils/valueExpr.ts';",
            "export { resolveValueTransform, chooseTransformPreset, selectedTransformPreset } from './src-vis/utils/valueTransform.ts';",
            "export { splitDpRef, resolveDpValue } from './src-vis/utils/dpRef.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const {
    applyValueExpr,
    resolveValueTransform,
    chooseTransformPreset,
    selectedTransformPreset,
    splitDpRef,
    resolveDpValue,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) {
        failed++;
    }
};
const eq = (label, actual, expected) =>
    check(label, Object.is(actual, expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const OPS = { formatNum: (n, d) => n.toFixed(d).replace('.', ','), decimals: 1, t: (k) => k };
const JSON_VAL = '{"objektName": 12.5, "devices": [{"soc": 81}], "name": "Akku"}';

// ── expression ────────────────────────────────────────────────────────────
eq(
    'issue example: JSON field × 0.4, fixed(2)',
    applyValueExpr(JSON_VAL, 'dp.objektName * 0.4 | fixed(2)', OPS),
    '5.00',
);
eq('array index into JSON string', applyValueExpr(JSON_VAL, 'dp.devices[0].soc', OPS), 81);
eq('plain number arithmetic', applyValueExpr(300, 'dp / 60', OPS), 5);
eq('numeric string is coerced', applyValueExpr('21.5', 'dp + 1', OPS), 22.5);
eq('conditional', applyValueExpr(1, 'dp ? "an" : "aus"', OPS), 'an');
eq('formatValue uses the widget number format', applyValueExpr(3.14159, 'dp | formatValue(2)', OPS), '3,14');
eq('Math function', applyValueExpr(-4, 'abs(dp)', OPS), 4);
eq('text filter', applyValueExpr(JSON_VAL, 'dp.name | upper', OPS), 'AKKU');
eq('object result prints as JSON', applyValueExpr(JSON_VAL, 'dp.devices[0]', OPS), '{"soc":81}');
eq('division by zero reads as no value', applyValueExpr(5, 'dp / 0', OPS), null);
eq('parse error leaves the value', applyValueExpr(42, 'dp * (', OPS), 42);
eq('empty expression leaves the value', applyValueExpr(42, '  ', OPS), 42);
eq('no foreign datapoints are read', applyValueExpr(2, 'dp * other.0.factor', OPS), null);
eq('hex-looking text is not coerced', applyValueExpr('0x004', 'dp + 1', OPS), '0x0041');

// ── resolution ────────────────────────────────────────────────────────────
const own = { valueTransform: 'expr', valueExpr: 'dp * 2', valueFactor: 0.001 };
let tr = resolveValueTransform(own, undefined);
eq('expr resolves', tr.expr, 'dp * 2');
eq('stale factor beside an expr is ignored', tr.factor, undefined);
eq('expr counts as active', tr.active, true);

tr = resolveValueTransform({}, { valueTransform: 'expr', valueExpr: 'dp / 10' });
eq('list-wide expr is inherited', tr.expr, 'dp / 10');

tr = resolveValueTransform({ valueTransform: 'none' }, { valueTransform: 'expr', valueExpr: 'dp / 10' });
eq("entry 'none' switches the list expr off", tr.expr, undefined);

tr = resolveValueTransform({ valueTransform: 'w-kw', valueFactor: 0.001 }, { valueTransform: 'expr', valueExpr: 'dp' });
eq('own preset wins over list expr', tr.expr, undefined);
eq('own preset factor stays', tr.factor, 0.001);

tr = resolveValueTransform({ valueTransform: 'custom', valueFactor: 2, valueExpr: 'dp * 9' }, undefined);
eq('leftover expr text without the preset stays inactive', tr.expr, undefined);

tr = resolveValueTransform({ valueTransform: 'expr', valueExpr: '   ' }, undefined);
eq('blank expr is not active', tr.active, false);

const chosen = chooseTransformPreset('expr', { factor: 0.001, offset: 3 });
eq('choosing expr stores the preset', chosen.valueTransform, 'expr');
eq('choosing expr drops the factor', chosen.valueFactor, undefined);
eq('choosing expr drops the offset', chosen.valueOffset, undefined);
eq('expr stays selected in the dropdown', selectedTransformPreset('expr', undefined, undefined), 'expr');

// ── JSON path ref, as the static list subscribes it ───────────────────────
const ref = splitDpRef('0_userdata.0.akku?devices[0].soc');
eq('ref splits into the bare id', ref.id, '0_userdata.0.akku');
eq('ref keeps the path', ref.path, 'devices[0].soc');
eq('value is resolved through the path', resolveDpValue(JSON_VAL, ref.path), 81);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
