// Verifies the active-state detection of custom-layout cells: which datapoint values
// count as "on" (issue #567 — MQTT plugs report the strings ON/OFF), and how the
// 'condition' mode compares numeric and string states.
//
//   node tools/tests/cell-state.mjs
//
// No dev server needed: isTruthyState/cellStateActive are pure, so the util is bundled
// with esbuild and exercised directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-cell-state-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { isTruthyState, cellStateActive } from './src-vis/utils/cellState.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { isTruthyState, cellStateActive } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({ name, ok: got === want, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}` });
// ── 1. Boolean coercion ──
{
    eq('true is on', isTruthyState(true), true);
    eq('1 is on', isTruthyState(1), true);
    eq("'true' is on", isTruthyState('true'), true);
    eq("'1' is on", isTruthyState('1'), true);
    eq("'ON' is on (MQTT)", isTruthyState('ON'), true);
    eq("' on ' is on", isTruthyState(' on '), true);
    eq("'OFF' is off", isTruthyState('OFF'), false);
    eq('false is off', isTruthyState(false), false);
    eq('0 is off', isTruthyState(0), false);
    eq('null is off', isTruthyState(null), false);
    eq('undefined is off (cmnd DP after reset)', isTruthyState(undefined), false);
    eq("'OPEN' is off without a condition", isTruthyState('OPEN'), false);
    eq('2 is off (only exactly 1 counts)', isTruthyState(2), false);
}

// ── 2. Default cell = boolean mode ──
{
    const cell = { type: 'switch' };
    eq("boolean mode: 'ON'", cellStateActive(cell, 'ON', 'x'), true);
    eq("boolean mode: 'OFF'", cellStateActive(cell, 'OFF', 'x'), false);
    eq('boolean mode: explicit', cellStateActive({ ...cell, stateMode: 'boolean' }, 'ON', 'x'), true);
}

// ── 3. Condition mode: string states (Tasmota stat.POWER) ──
{
    const cell = { type: 'switch', stateMode: 'condition', stateOperator: '==', stateValue: 'ON' };
    eq("== ON matches 'ON'", cellStateActive(cell, 'ON', 'x'), true);
    eq("== ON rejects 'OFF'", cellStateActive(cell, 'OFF', 'x'), false);
    eq('== ON rejects null', cellStateActive(cell, null, 'x'), false);
    const neq = { type: 'switch', stateMode: 'condition', stateOperator: '!=', stateValue: 'OFF' };
    eq("!= OFF matches 'ON'", cellStateActive(neq, 'ON', 'x'), true);
    eq("!= OFF rejects 'OFF'", cellStateActive(neq, 'OFF', 'x'), false);
}

// ── 4. Condition mode: numeric states (dimmer, issue #467) ──
{
    const cell = { type: 'state-icon', stateMode: 'condition' }; // defaults to '> 0'
    eq('default > 0 with 42', cellStateActive(cell, 42, 'x'), true);
    eq('default > 0 with 0', cellStateActive(cell, 0, 'x'), false);
    const ge = { type: 'state-text', stateMode: 'condition', stateOperator: '>=', stateValue: '50' };
    eq('>= 50 with 50', cellStateActive(ge, 50, 'x'), true);
    eq('>= 50 with 49', cellStateActive(ge, 49, 'x'), false);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
