// Verifies that a widget takes its scale over from the datapoint it shows
// (issue #665: a Drehregler on a 10…30 °C setpoint started on 0…100).
//
//   node tools/tests/dp-scale.mjs
//
// No dev server needed — the range logic is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-dp-scale-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { hasScaleFromDatapoint, scaleOptionsFromDatapoint, scalePatchFromDatapoint } from './src-vis/utils/dpScale.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { hasScaleFromDatapoint, scaleOptionsFromDatapoint, scalePatchFromDatapoint } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// The datapoint from the issue: alias.0…raumtemperatur_tag, 10…30 °C.
const setpoint = { min: 10, max: 30 };

// ── which types have a scale ──────────────────────────────────────────────
for (const t of ['gauge', 'knob', 'fill', 'slider', 'input']) {
    check(`${t} has a scale`, hasScaleFromDatapoint(t) === true);
}
for (const t of ['value', 'chart', 'switch', undefined]) {
    check(`${t} has none`, hasScaleFromDatapoint(t) === false);
}

// ── creation: the full range, under each type's own option keys ───────────
eq('knob takes minValue/maxValue', scaleOptionsFromDatapoint('knob', setpoint), { minValue: 10, maxValue: 30 });
eq('gauge takes minValue/maxValue', scaleOptionsFromDatapoint('gauge', setpoint), { minValue: 10, maxValue: 30 });
eq('fill takes minValue/maxValue', scaleOptionsFromDatapoint('fill', setpoint), { minValue: 10, maxValue: 30 });
eq('slider takes min/max', scaleOptionsFromDatapoint('slider', setpoint), { min: 10, max: 30 });
eq('input takes min/max', scaleOptionsFromDatapoint('input', setpoint), { min: 10, max: 30 });
eq('value takes nothing', scaleOptionsFromDatapoint('value', setpoint), {});

// common.step comes along only where the widget has one.
eq('knob takes the step', scaleOptionsFromDatapoint('knob', { min: 10, max: 30, step: 0.5 }), {
    minValue: 10,
    maxValue: 30,
    step: 0.5,
});
eq('gauge has no step to take', scaleOptionsFromDatapoint('gauge', { min: 10, max: 30, step: 0.5 }), {
    minValue: 10,
    maxValue: 30,
});
eq('a step of 0 is not a step', scaleOptionsFromDatapoint('knob', { min: 10, max: 30, step: 0 }), {
    minValue: 10,
    maxValue: 30,
});

// ── what does not count as a range ────────────────────────────────────────
eq('no datapoint', scaleOptionsFromDatapoint('knob', null), {});
eq('nothing declared', scaleOptionsFromDatapoint('knob', {}), {});
eq('only a min', scaleOptionsFromDatapoint('knob', { min: 10 }), {});
eq('only a max', scaleOptionsFromDatapoint('knob', { max: 30 }), {});
eq('max below min', scaleOptionsFromDatapoint('knob', { min: 30, max: 10 }), {});
eq('min equals max', scaleOptionsFromDatapoint('knob', { min: 0, max: 0 }), {});
eq('strings are not numbers', scaleOptionsFromDatapoint('knob', { min: '10', max: '30' }), {});
eq('NaN is not a number', scaleOptionsFromDatapoint('knob', { min: NaN, max: 30 }), {});
// Negative scales are perfectly normal (an AV receiver's dB volume).
eq('a negative range', scaleOptionsFromDatapoint('slider', { min: -80.5, max: 16.5 }), { min: -80.5, max: 16.5 });

// ── exchanging the datapoint on an existing widget ────────────────────────
eq(
    'an untouched 0…100 knob adopts the range',
    scalePatchFromDatapoint('knob', setpoint, { minValue: 0, maxValue: 100, step: 1, unit: '°C' }),
    { minValue: 10, maxValue: 30 },
);
eq('a knob without options adopts it too', scalePatchFromDatapoint('knob', setpoint, undefined), {
    minValue: 10,
    maxValue: 30,
});
eq('a hand-typed scale is left alone', scalePatchFromDatapoint('knob', setpoint, { minValue: 5, maxValue: 40 }), {});
eq('a hand-typed max alone already protects the pair', scalePatchFromDatapoint('knob', setpoint, {
    minValue: 0,
    maxValue: 40,
}), {});
eq('a hand-typed min alone does as well', scalePatchFromDatapoint('knob', setpoint, {
    minValue: 5,
    maxValue: 100,
}), {});
eq('a hand-typed step survives the new range', scalePatchFromDatapoint('knob', { min: 10, max: 30, step: 0.5 }, {
    minValue: 0,
    maxValue: 100,
    step: 5,
}), { minValue: 10, maxValue: 30 });
eq('an untouched step follows', scalePatchFromDatapoint('knob', { min: 10, max: 30, step: 0.5 }, {
    minValue: 0,
    maxValue: 100,
    step: 1,
}), { minValue: 10, maxValue: 30, step: 0.5 });
eq('a slider reads its own keys', scalePatchFromDatapoint('slider', setpoint, { min: 0, max: 100 }), {
    min: 10,
    max: 30,
});
// The number input has no default scale — anything set there was set by hand.
eq('an input with bounds keeps them', scalePatchFromDatapoint('input', setpoint, { min: 0, max: 100 }), {});
eq('an input without bounds adopts them', scalePatchFromDatapoint('input', setpoint, { unit: '°C' }), {
    min: 10,
    max: 30,
});
eq('a datapoint without a range changes nothing', scalePatchFromDatapoint('knob', { min: 10 }, { minValue: 0 }), {});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
