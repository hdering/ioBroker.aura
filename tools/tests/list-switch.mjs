// Verifies the "Schalter" display of the static and dynamic list widgets: which write
// values a row sends, how its on/off state is evaluated, and that the group master
// switch agrees with the row (issue #591).
//
//   node tools/tests/list-switch.mjs
//
// No dev server needed: utils/switchEntry + utils/groupTargets are pure, so both are
// bundled with esbuild and exercised directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-list-switch-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export * from './src-vis/utils/switchEntry.ts';",
            "export { listEntryTarget } from './src-vis/utils/groupTargets.ts';",
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
const { parseWrite, switchWriteValues, switchStatusDp, switchReadValue, switchEntryActive, listEntryTarget } =
    await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({ name, ok: got === want, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}` });
const deep = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });

// ── 1. Write-value coercion ──
{
    eq('empty falls back', parseWrite('', 'fb'), 'fb');
    eq('undefined falls back', parseWrite(undefined, false), false);
    eq("'true' becomes boolean", parseWrite('true', false), true);
    eq("'false' becomes boolean", parseWrite('false', true), false);
    eq("'255' becomes number", parseWrite('255', 0), 255);
    eq("'ON' stays a string", parseWrite('ON', false), 'ON');
    eq('non-strings pass through', parseWrite(42, 0), 42);
}

// ── 2. Untouched entries keep the old writes (no silent behaviour change) ──
{
    deep('boolean DP writes true/false', switchWriteValues({}, true), { on: true, off: false });
    deep('number DP writes 1/0', switchWriteValues({}, 0), { on: 1, off: 0 });
    deep('string DP writes true/false', switchWriteValues({}, 'OFF'), { on: true, off: false });
    deep('null DP writes true/false', switchWriteValues({}, null), { on: true, off: false });
}

// ── 3. Configured write values win (the actual request of issue #591) ──
{
    deep('ON/OFF strings', switchWriteValues({ onValue: 'ON', offValue: 'OFF' }, 'OFF'), { on: 'ON', off: 'OFF' });
    deep('0/255 numbers', switchWriteValues({ onValue: '255', offValue: '0' }, 0), { on: 255, off: 0 });
    // One side configured, the other keeps the datapoint default.
    deep('only AN set', switchWriteValues({ onValue: '100' }, 0), { on: 100, off: 0 });
    deep('only AUS set', switchWriteValues({ offValue: 'OFF' }, true), { on: true, off: 'OFF' });
}

// ── 4. Evaluation: default coercion ──
{
    eq('true is on', switchEntryActive({}, true, 'x'), true);
    eq('false is off', switchEntryActive({}, false, 'x'), false);
    eq('1 is on', switchEntryActive({}, 1, 'x'), true);
    eq('0 is off', switchEntryActive({}, 0, 'x'), false);
    eq('50 is on (dimmer level)', switchEntryActive({}, 50, 'x'), true);
    eq("'ON' is on", switchEntryActive({}, 'ON', 'x'), true);
    eq("'OFF' is off", switchEntryActive({}, 'OFF', 'x'), false);
    eq('null is off', switchEntryActive({}, null, 'x'), false);
}

// ── 5. Evaluation: the AN write value doubles as the comparison ──
{
    const e = { onValue: '255', offValue: '0' };
    eq('255 matches AN value', switchEntryActive(e, 255, 'x'), true);
    eq('128 does not match AN value', switchEntryActive(e, 128, 'x'), false);
    eq('0 is off', switchEntryActive(e, 0, 'x'), false);
    // Without the comparison a plain 'HEAT'/'OFF' thermostat would read as on for both.
    const mode = { onValue: 'HEAT', offValue: 'OFF' };
    eq("'HEAT' matches", switchEntryActive(mode, 'HEAT', 'x'), true);
    eq("'AUTO' does not", switchEntryActive(mode, 'AUTO', 'x'), false);
}

// ── 6. Evaluation: condition mode beats the AN value ──
{
    const e = { onValue: '255', stateMode: 'condition', stateOperator: '>', stateValue: '0' };
    eq('condition > 0 with 128', switchEntryActive(e, 128, 'x'), true);
    eq('condition > 0 with 0', switchEntryActive(e, 0, 'x'), false);
    const s = { stateMode: 'condition', stateOperator: '==', stateValue: 'ON' };
    eq("condition == ON with 'ON'", switchEntryActive(s, 'ON', 'x'), true);
    eq("condition == ON with 'on'", switchEntryActive(s, 'on', 'x'), false);
}

// ── 7. Status datapoint (Tasmota: cmnd.POWER writes, stat.POWER reports) ──
{
    const e = { statusDp: 'mqtt.0.plug.stat.POWER', onValue: 'ON', offValue: 'OFF' };
    eq('status dp trimmed', switchStatusDp({ statusDp: '  a.b  ' }), 'a.b');
    eq('no status dp', switchStatusDp({}), '');
    eq('read value comes from the status dp', switchReadValue(e, null, 'ON'), 'ON');
    eq('missing status value reads as null', switchReadValue(e, true, undefined), null);
    eq('without a status dp the own value is read', switchReadValue({}, true, 'ON'), true);
    // The AN comparison must NOT apply to a status DP — it speaks its own vocabulary,
    // so the coercion decides (ON → on) even though onValue is set.
    eq("status 'ON' is on", switchEntryActive(e, 'ON', 'mqtt.0.plug.cmnd.POWER'), true);
    eq("status 'OFF' is off", switchEntryActive(e, 'OFF', 'mqtt.0.plug.cmnd.POWER'), false);
    // A condition still wins over the coercion for a status DP.
    const cond = { ...e, stateMode: 'condition', stateOperator: '==', stateValue: '1' };
    eq('status condition == 1', switchEntryActive(cond, 1, 'x'), true);
    eq("status condition rejects 'ON'", switchEntryActive(cond, 'ON', 'x'), false);
}

// ── 8. The group master switch sends the same values as the row ──
{
    const cfg = {};
    const row = { id: 'a.b', displayType: 'switch', onValue: 'ON', offValue: 'OFF' };
    deep('master switch adopts the write values', listEntryTarget(row, 'OFF', cfg), {
        id: 'a.b',
        active: false,
        onWrite: 'ON',
        offWrite: 'OFF',
    });
    deep('master switch state matches the AN value', listEntryTarget(row, 'ON', cfg), {
        id: 'a.b',
        active: true,
        onWrite: 'ON',
        offWrite: 'OFF',
    });
    // Untouched switch rows keep the previous true/false resp. 1/0 writes.
    deep('boolean row unchanged', listEntryTarget({ id: 'a.b', displayType: 'switch' }, true, cfg), {
        id: 'a.b',
        active: true,
        onWrite: true,
        offWrite: false,
    });
    deep('number row unchanged', listEntryTarget({ id: 'a.b', displayType: 'switch' }, 0, cfg), {
        id: 'a.b',
        active: false,
        onWrite: 1,
        offWrite: 0,
    });
    // Condition mode reaches the master switch too.
    deep(
        'master switch honours the condition',
        listEntryTarget(
            { id: 'a.b', displayType: 'switch', stateMode: 'condition', stateOperator: '>=', stateValue: '50' },
            60,
            cfg,
        ),
        { id: 'a.b', active: true, onWrite: 1, offWrite: 0 },
    );
    eq('read-only row is excluded', listEntryTarget({ ...row, writable: false }, 'ON', cfg), null);
    eq('valueless row is excluded', listEntryTarget(row, null, cfg), null);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
