// Verifies the "draw below the zero line" half of the value conversion (issue #594).
//
//   node tools/tests/value-transform-sign.mjs
//
// No dev server needed: the rules are pure, so the module is bundled with esbuild and exercised
// directly. The point of the design is that "show as negative" is kept as the SIGN of
// `valueFactor` rather than as a flag of its own — so it reaches every consumer of the factor
// without any of them knowing about it, and it composes with a unit conversion. Which means the
// two halves must not overwrite each other: picking "Wh → kWh" may not undo the inversion, and
// the literal 'none' (= "switch the list-wide default off") may not swallow the sign.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-vtsign-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/valueTransform.ts';",
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
    applyValueTransform,
    chooseTransformPreset,
    resolveValueTransform,
    selectedTransformPreset,
    toggleTransformSign,
    transformMagnitude,
    transformSign,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) <= 1e-9;

// -- 1. splitting a factor into magnitude and sign --------------------------------------------
check('negative factor is a downward sign', transformSign(-1) === -1 && transformMagnitude(-1) === 1);
check('a conversion keeps its magnitude', transformSign(-0.001) === -1 && near(transformMagnitude(-0.001), 0.001));
for (const [label, f] of [
    ['unset', undefined],
    ['plain', 1],
    ['positive', 0.001],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
]) {
    check(`${label} factor draws upwards`, transformSign(f) === 1, String(transformSign(f)));
}
check('an unset factor has no magnitude', transformMagnitude(undefined) === undefined);

// -- 2. which dropdown entry is showing --------------------------------------------------------
check("a plain ×−1 still reads as 'Keine'", selectedTransformPreset(undefined, -1, undefined) === 'none');
// Several presets share a factor (ms→s and Wh→kWh are both ×0.001), so which one a bare factor
// matches is arbitrary — the stored id is what disambiguates them. What must hold is that the
// SIGN does not change the answer.
check(
    'a negated preset matches whatever its positive twin matches',
    selectedTransformPreset(undefined, -0.001, undefined) === selectedTransformPreset(undefined, 0.001, undefined),
    `${selectedTransformPreset(undefined, -0.001, undefined)} vs ${selectedTransformPreset(undefined, 0.001, undefined)}`,
);
check('a stored preset id still wins', selectedTransformPreset('w-kw', -0.001, undefined) === 'w-kw');
check('an unmatched factor is custom', selectedTransformPreset(undefined, -2, undefined) === 'custom');

// -- 3. picking a conversion while inverted ----------------------------------------------------
{
    const p = chooseTransformPreset('wh-kwh', { factor: -1 });
    check(
        'a preset picked while inverted comes out negative',
        near(p.valueFactor, -0.001) && p.valueTransform === 'wh-kwh',
        JSON.stringify(p),
    );
    check('and still suggests its unit', p.unit === 'kWh', String(p.unit));
    const up = chooseTransformPreset('wh-kwh', { factor: 1 });
    check('the same preset picked normally stays positive', near(up.valueFactor, 0.001), JSON.stringify(up));
    const cf = chooseTransformPreset('c-f', { factor: -1 });
    check('an offset preset keeps its offset', cf.valueOffset === 32, JSON.stringify(cf));
}

// -- 4. "Keine" while inverted is still a conversion --------------------------------------------
{
    // 'none' means "switch the list-wide default off" — storing it here would drop the factor,
    // and with it the sign the user just set.
    const p = chooseTransformPreset('none', { factor: -0.001 }, true);
    check('Keine + inverted keeps the ×−1', p.valueFactor === -1, JSON.stringify(p));
    check('and does not store the literal none', p.valueTransform === undefined, String(p.valueTransform));
    const r = resolveValueTransform(
        { valueTransform: p.valueTransform, valueFactor: p.valueFactor },
        { valueFactor: 0.001 },
    );
    check('so the list-wide default is still overridden', r.factor === -1, JSON.stringify(r));
    check('the entry still converts', applyValueTransform(5, r.factor, r.offset) === -5);

    const off = chooseTransformPreset('none', { factor: 1 }, true);
    check('Keine on its own still switches the default off', off.valueTransform === 'none', JSON.stringify(off));
}

// -- 5. the checkbox itself ---------------------------------------------------------------------
{
    const on = toggleTransformSign({ factor: undefined, offset: undefined, presetId: undefined });
    check('checking it on a bare value gives ×−1', on.valueFactor === -1, JSON.stringify(on));
    const off = toggleTransformSign({ factor: -1, offset: undefined, presetId: undefined });
    check('unchecking clears the factor again', off.valueFactor === undefined, JSON.stringify(off));

    const conv = toggleTransformSign({ factor: 0.001, offset: undefined, presetId: 'wh-kwh' });
    check(
        'checking it on a conversion negates it and keeps the preset',
        near(conv.valueFactor, -0.001) && conv.valueTransform === 'wh-kwh',
        JSON.stringify(conv),
    );
    const back = toggleTransformSign({ factor: -0.001, offset: undefined, presetId: 'wh-kwh' });
    check('and back again', near(back.valueFactor, 0.001) && back.valueTransform === 'wh-kwh', JSON.stringify(back));

    const withOffset = toggleTransformSign({ factor: -1, offset: 32, presetId: 'custom' });
    check('an offset keeps the factor around', withOffset.valueFactor === 1, JSON.stringify(withOffset));

    // A factor may not sit next to the literal 'none' — see case 4.
    const fromNone = toggleTransformSign({ factor: undefined, offset: undefined, presetId: 'none' });
    check('checking it clears an explicit none', fromNone.valueTransform === undefined, JSON.stringify(fromNone));
}

// -- 6. round trip: the sign survives every path ------------------------------------------------
{
    let state = { factor: undefined, offset: undefined, presetId: undefined };
    const apply = (p) => {
        state = { factor: p.valueFactor, offset: p.valueOffset, presetId: p.valueTransform };
    };
    apply(toggleTransformSign(state)); // check "negative"
    apply(chooseTransformPreset('wh-kwh', state)); // then pick Wh → kWh
    check('negative first, conversion second', near(state.factor, -0.001), JSON.stringify(state));
    check('the checkbox still reads as checked', transformSign(state.factor) === -1);
    check('the dropdown still reads as Wh → kWh', selectedTransformPreset(state.presetId, state.factor) === 'wh-kwh');
    apply(toggleTransformSign(state)); // uncheck again
    check('unchecking leaves the conversion alone', near(state.factor, 0.001), JSON.stringify(state));
    check('2000 Wh = 2 kWh', near(applyValueTransform(2000, state.factor, state.offset), 2));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
