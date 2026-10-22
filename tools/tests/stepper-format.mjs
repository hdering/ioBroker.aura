// Verifies the time formats of the −/+ stepper (#827).
//
//   node tools/tests/stepper-format.mjs
//
// The stepper counts in a plain number and converts at the edges: time strings from the DP are
// parsed ("05:00" → 5 min), the value is shown in the time format, and the write format is chosen
// separately. Sprinkle Control's runningTime is the reference: it shows "05:00" / "1:5:03" and
// only accepts minutes as a number.
//
// No dev server needed — the module is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-stepper-format-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/stepperFormat.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { parseDuration, formatDuration, readStepperValue, writeStepperValue, showStepperValue, stepperUnit } =
    await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (label, got, want) => {
    const ok = Object.is(got, want);
    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
    if (!ok) failed++;
};

// ── parse / format ──────────────────────────────────────────────────────────
eq('mm:ss "05:00" = 300 s', parseDuration('05:00', 'mm:ss'), 300);
eq('mm:ss with hours "1:5:03" = 3903 s', parseDuration('1:5:03', 'mm:ss'), 3903);
eq('hh:mm "01:30" = 5400 s', parseDuration('01:30', 'hh:mm'), 5400);
eq('hh:mm rejects three fields', parseDuration('01:30:00', 'hh:mm'), undefined);
eq('no colon = no time', parseDuration('5', 'mm:ss'), undefined);
eq('"--:--" = no time', parseDuration('--:--', 'mm:ss'), undefined);
eq('format 300 s mm:ss', formatDuration(300, 'mm:ss'), '05:00');
eq('format 5400 s mm:ss keeps counting', formatDuration(5400, 'mm:ss'), '90:00');
eq('format 5400 s hh:mm', formatDuration(5400, 'hh:mm'), '01:30');
eq('format 3903 s hh:mm:ss', formatDuration(3903, 'hh:mm:ss'), '01:05:03');

// ── units ───────────────────────────────────────────────────────────────────
eq('default unit mm:ss = s', stepperUnit({ stepTimeFormat: 'mm:ss' }), 's');
eq('default unit hh:mm = min', stepperUnit({ stepTimeFormat: 'hh:mm' }), 'min');
eq('explicit unit wins', stepperUnit({ stepTimeFormat: 'mm:ss', stepUnit: 'min' }), 'min');

// ── Sprinkle Control: shows mm:ss, takes minutes as number ─────────────────
const sprinkle = { stepTimeFormat: 'mm:ss', stepUnit: 'min' };
eq('sprinkle: read "05:00" = 5 min', readStepperValue('05:00', sprinkle), 5);
eq('sprinkle: read idle "00:00" = 0', readStepperValue('00:00', sprinkle), 0);
eq('sprinkle: read echo 10 = 10 min', readStepperValue(10, sprinkle), 10);
eq('sprinkle: read default "-" = nothing', readStepperValue('-', sprinkle), undefined);
eq('sprinkle: show 5 min as 05:00', showStepperValue(5, sprinkle), '05:00');
eq('sprinkle: write 10 min as number', writeStepperValue(10, sprinkle), 10);

// ── adapter that wants the string ───────────────────────────────────────────
const asTime = { stepTimeFormat: 'mm:ss', stepUnit: 'min', stepWrite: 'time' };
eq('time: write 5 min as "05:00"', writeStepperValue(5, asTime), '05:00');
eq('time: write 7.5 min as "07:30"', writeStepperValue(7.5, asTime), '07:30');
eq(
    'time in seconds: write 90 s as "01:30"',
    writeStepperValue(90, { stepTimeFormat: 'mm:ss', stepWrite: 'time' }),
    '01:30',
);

// ── plain number (old behaviour) ───────────────────────────────────────────
eq('plain: read number', readStepperValue(21.5, {}), 21.5);
eq('plain: read numeric string', readStepperValue('21.5', {}), 21.5);
eq('plain: read garbage', readStepperValue('abc', {}), undefined);
eq('plain: read null', readStepperValue(null, {}), undefined);
eq('plain: no time display', showStepperValue(5, {}), undefined);
eq('plain: write number', writeStepperValue(5, {}), 5);
eq('string: write "5"', writeStepperValue(5, { stepWrite: 'string' }), '5');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
