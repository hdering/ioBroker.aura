// Verifies the automatic unit prefix of the value conversion (850 Wh, 1.25 kWh, 3.4 MWh).
//
//   node tools/tests/value-auto-unit.mjs
//
// A fixed factor can only show one unit; `valueAutoUnit` moves value and unit along a prefix
// ladder instead, starting from the configured unit. The list path (`resolveValueTransform`)
// inherits the switch from the list unless an entry says otherwise.
//
// No dev server needed — the module is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-auto-unit-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { autoScaleUnit, autoUnitDecimals, resolveValueTransform, isAutoScalableUnit } from './src-vis/utils/valueTransform.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { autoScaleUnit, autoUnitDecimals, resolveValueTransform, isAutoScalableUnit } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const deep = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
const scaled = (v, u) => {
    const r = autoScaleUnit(v, u);
    return [r.value, r.unit, r.scaledUp];
};

// Climbing from Wh
deep('850 Wh stays', scaled(850, 'Wh'), [850, 'Wh', false]);
deep('999.9 Wh stays', scaled(999.9, 'Wh'), [999.9, 'Wh', false]);
deep('1000 Wh → 1 kWh', scaled(1000, 'Wh'), [1, 'kWh', true]);
deep('1250 Wh → 1.25 kWh', scaled(1250, 'Wh'), [1.25, 'kWh', true]);
deep('3 400 000 Wh → 3.4 MWh', scaled(3400000, 'Wh'), [3.4, 'MWh', true]);
deep('negative climbs too', scaled(-2500, 'W'), [-2.5, 'kW', true]);

// Descending from kWh
deep('0.4 kWh → 400 Wh', scaled(0.4, 'kWh'), [400, 'Wh', false]);
deep('2 kWh stays, counts as larger rung', scaled(2, 'kWh'), [2, 'kWh', true]);
deep('0 kWh stays as configured', scaled(0, 'kWh'), [0, 'kWh', true]);
deep('0.5 Wh stays (bottom of ladder)', scaled(0.5, 'Wh'), [0.5, 'Wh', false]);

// Spelling
deep('KWh is read as kWh', scaled(1500, 'KWh'), [1.5, 'MWh', true]);
deep('own spelling kept on the same rung', scaled(12, 'KWh'), [12, 'KWh', true]);
deep('mW is not MW', scaled(5000, 'mW'), [5000, 'mW', false]);
deep('bytes step by 1024', scaled(2048, 'B'), [2, 'KB', true]);

// Pass-through
deep('unknown unit untouched', scaled(5000, '°C'), [5000, '°C', false]);
deep('no unit untouched', scaled(5000, undefined), [5000, null, false]);
deep('string untouched', scaled('n/a', 'Wh'), ['n/a', 'Wh', false]);
check('isAutoScalableUnit(Wh)', isAutoScalableUnit('Wh') === true);
check('isAutoScalableUnit(%)', isAutoScalableUnit('%') === false);

// Decimals
check('smallest rung keeps decimals', autoUnitDecimals(false, 0, 2) === 0);
check('larger rung takes its own', autoUnitDecimals(true, 0, 2) === 2);
check('larger rung without own → normal', autoUnitDecimals(true, 1, undefined) === 1);

// List inheritance
const list = { valueAutoUnit: true, valueAutoUnitDecimals: 2 };
const r1 = resolveValueTransform({}, list);
check('entry inherits list auto unit', r1.autoUnit === true && r1.autoUnitDecimals === 2 && r1.active === true);
const r2 = resolveValueTransform({ valueFactor: 0.001, valueTransform: 'wh-kwh' }, list);
check('own factor keeps the inherited auto unit', r2.autoUnit === true && r2.factor === 0.001);
const r3 = resolveValueTransform({ valueAutoUnit: false }, list);
check('explicit false switches it off', r3.autoUnit === false && r3.active === false);
const r4 = resolveValueTransform({ valueAutoUnit: true, valueAutoUnitDecimals: 3 }, {});
check('own setting without list', r4.autoUnit === true && r4.autoUnitDecimals === 3);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
