// Verifies the shared colour-threshold matching used by Werte-Anzeige, Dimmer,
// Rollladen, Thermostat and both list widgets (issue #559).
//
//   node tools/tests/color-thresholds.mjs
//
// No dev server needed: `getThresholdColor` is pure, so the util is bundled with
// esbuild and exercised directly. The point of the test is that the scale works
// no matter which order the rows were entered in - the editors accept any - plus
// the band edges, values above the top band and non-numeric input.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-color-thresholds-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { getThresholdColor, sortColorThresholds } from './src-vis/utils/colorThresholds.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { getThresholdColor, sortColorThresholds } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREEN = '#22c55e';

// ── 1. The order the rows were entered in must not matter (the reported bug) ──
// A temperature scale entered as "< 100 → green" first and "< 17 → red" second
// answered green for 16.59, because the first matching row won.
{
    const entered = [
        [100, GREEN],
        [17, RED],
    ];
    eq('unsorted scale: 16.59 is red', getThresholdColor(16.59, entered), RED);
    eq('unsorted scale: 20 is green', getThresholdColor(20, entered), GREEN);
    const sorted = [
        [17, RED],
        [100, GREEN],
    ];
    eq('sorted scale answers the same', getThresholdColor(16.59, sorted), RED);
    eq('sorted scale answers the same for 20', getThresholdColor(20, sorted), GREEN);
}

// ── 2. Band edges: the threshold itself belongs to the band above it ──────────
{
    const scale = [
        [17, RED],
        [100, GREEN],
    ];
    eq('just below the edge', getThresholdColor(16.999, scale), RED);
    eq('exactly on the edge', getThresholdColor(17, scale), GREEN);
    eq('above the top threshold keeps the top colour', getThresholdColor(1000, scale), GREEN);
}

// ── 3. A multi-band scale in a shuffled order (the pH scale from the issue) ───
{
    const scale = [
        [7.4, AMBER],
        [6.3, RED],
        [8, RED],
        [6.55, AMBER],
        [7.1, GREEN],
    ];
    eq('6.1 → red', getThresholdColor(6.1, scale), RED);
    eq('6.4 → amber', getThresholdColor(6.4, scale), AMBER);
    eq('7.0 → green', getThresholdColor(7, scale), GREEN);
    eq('7.2 → amber', getThresholdColor(7.2, scale), AMBER);
    eq('9 → red (above the top band)', getThresholdColor(9, scale), RED);
}

// ── 4. Negative thresholds and a numeric string value ────────────────────────
{
    const scale = [
        [0, RED],
        [-10, GREEN],
    ];
    eq('-20 takes the lowest band', getThresholdColor(-20, scale), GREEN);
    eq('-5 takes the next band', getThresholdColor(-5, scale), RED);
    eq('a numeric string is matched too', getThresholdColor('-20', scale), GREEN);
}

// ── 5. Nothing to match against → no colour, callers keep their default ──────
{
    eq('no scale', getThresholdColor(5, undefined), undefined);
    eq('empty scale', getThresholdColor(5, []), undefined);
    eq('null value', getThresholdColor(null, [[10, RED]]), undefined);
    eq('boolean value', getThresholdColor(true, [[10, RED]]), undefined);
    eq('text value', getThresholdColor('offen', [[10, RED]]), undefined);
}

// ── 6. Sorting hands back a copy - the config array is shared state ──────────
{
    const original = [
        [100, GREEN],
        [17, RED],
    ];
    const sorted = sortColorThresholds(original);
    eq('sorted copy starts at the lowest band', sorted[0][0], 17);
    eq('the original is untouched', original[0][0], 100);
    check('the copy is a different array', sorted !== original);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
