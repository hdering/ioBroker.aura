// Verifies the two-way conversion behind slider, Drehregler, Dimmer and number input (issue #682).
//
//   node tools/tests/control-value-transform.mjs
//
// A control writes as well as reads, so its conversion has to survive the round trip: a datapoint
// in seconds driven in minutes must get exactly its seconds back, not 299.99999999999994. And the
// scale a widget adopts from the object has to land in the converted unit too, or the slider ends
// up with a 0…86400 range on a dial the user reads in minutes.
//
// No dev server needed — both modules are pure and are bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-ctrl-transform-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { controlValueTransform, invertValueTransform } from './src-vis/utils/valueTransform.ts';",
            "export { scaleOptionsFromDatapoint, scalePatchFromDatapoint } from './src-vis/utils/dpScale.ts';",
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
const { controlValueTransform, invertValueTransform, scaleOptionsFromDatapoint, scalePatchFromDatapoint } =
    await import(pathToFileURL(bundle).href);
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
const deep = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

const SEC_MIN = { valueTransform: 's-min', valueFactor: 1 / 60 };
const CELSIUS_F = { valueTransform: 'c-f', valueFactor: 1.8, valueOffset: 32 };
const DIM_255 = { valueTransform: 'custom', valueFactor: 100 / 255 };

// -- 1. nothing configured stays a no-op ------------------------------------------------------
for (const [label, opts] of [
    ['no options', undefined],
    ['empty options', {}],
    ['a plain ×1', { valueFactor: 1, valueOffset: 0 }],
    ["the literal 'none'", { valueTransform: 'none', valueFactor: 1 / 60 }],
]) {
    const tr = controlValueTransform(opts);
    check(`${label} is inactive`, tr.active === false, String(tr.active));
    eq(`${label} reads through`, tr.toDisplay(42), 42);
    eq(`${label} writes through`, tr.toRaw(42), 42);
}

// -- 2. seconds ↔ minutes, the case from the issue --------------------------------------------
{
    const tr = controlValueTransform(SEC_MIN);
    check('seconds → minutes is active', tr.active === true);
    eq('300 s reads as 5 min', tr.toDisplay(300), 5);
    eq('5 min writes 300 s', tr.toRaw(5), 300);
    eq('1.5 min writes 90 s', tr.toRaw(1.5), 90);
    eq('0 stays 0', tr.toRaw(0), 0);
    // A numeric string datapoint (upnp & co. store numbers as text) still converts.
    eq('a numeric string converts', tr.toDisplay('300'), 5);
    const roundTrip = [0, 1, 7, 45, 90, 300, 3599, 3600, 86400];
    check(
        'every second survives the round trip',
        roundTrip.every((s) => tr.toRaw(tr.toDisplay(s)) === s),
        JSON.stringify(roundTrip.map((s) => tr.toRaw(tr.toDisplay(s)))),
    );
}

// -- 3. a conversion with an offset ------------------------------------------------------------
{
    const tr = controlValueTransform(CELSIUS_F);
    eq('25 °C reads as 77 °F', tr.toDisplay(25), 77);
    eq('77 °F writes 25 °C', tr.toRaw(77), 25);
    eq('the freezing point round-trips', tr.toRaw(tr.toDisplay(0)), 0);
    eq('a half degree round-trips', tr.toRaw(tr.toDisplay(21.5)), 21.5);
}

// -- 4. a 0…255 dimmer driven in percent -------------------------------------------------------
{
    const tr = controlValueTransform(DIM_255);
    eq('255 reads as 100 %', tr.toDisplay(255), 100);
    eq('100 % writes 255', tr.toRaw(100), 255);
    eq('0 % writes 0', tr.toRaw(0), 0);
    check('no negative zero reaches the datapoint', Object.is(tr.toRaw(0), 0));
}

// -- 5. a factor that cannot be inverted is not a conversion -----------------------------------
for (const [label, factor] of [
    ['zero', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
]) {
    const tr = controlValueTransform({ valueTransform: 'custom', valueFactor: factor });
    check(`a ${label} factor is inactive`, tr.active === false, String(tr.active));
    eq(`a ${label} factor writes the value unchanged`, tr.toRaw(50), 50);
}

// -- 6. non-numeric values are never rewritten -------------------------------------------------
{
    const tr = controlValueTransform(SEC_MIN);
    eq('text passes through', tr.toDisplay('an'), 'an');
    eq('null passes through', tr.toDisplay(null), null);
    eq('undefined passes through', tr.toDisplay(undefined), undefined);
    eq('a boolean passes through', tr.toDisplay(true), true);
}

// -- 7. invertValueTransform on its own --------------------------------------------------------
eq('invert without a factor', invertValueTransform(5), 5);
eq('invert with a zero factor keeps the value', invertValueTransform(5, 0), 5);
eq('invert with an offset only', invertValueTransform(12, undefined, 2), 10);

// -- 8. the scale a widget adopts is converted too ---------------------------------------------
deep(
    'a seconds range lands on the slider in minutes',
    scaleOptionsFromDatapoint('slider', { min: 0, max: 86400, step: 60 }, SEC_MIN),
    { min: 0, max: 1440, step: 1 },
);
deep(
    'without a conversion the range is untouched',
    scaleOptionsFromDatapoint('slider', { min: 0, max: 86400, step: 60 }, {}),
    { min: 0, max: 86400, step: 60 },
);
deep('a °C range reaches the dial in °F', scaleOptionsFromDatapoint('knob', { min: 10, max: 30 }, CELSIUS_F), {
    minValue: 50,
    maxValue: 86,
});
deep(
    'a negative factor turns the range round instead of inverting it',
    scaleOptionsFromDatapoint('slider', { min: 0, max: 100 }, { valueTransform: 'custom', valueFactor: -1 }),
    { min: -100, max: 0 },
);
deep(
    'exchanging the datapoint adopts the converted range',
    scalePatchFromDatapoint('slider', { min: 0, max: 86400 }, { ...SEC_MIN, min: 0, max: 100 }),
    { min: 0, max: 1440 },
);
deep(
    'a hand-typed scale still wins over the converted range',
    scalePatchFromDatapoint('slider', { min: 0, max: 86400 }, { ...SEC_MIN, min: 0, max: 60 }),
    {},
);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
