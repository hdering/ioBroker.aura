// Verifies the reachability detection behind "Nicht erreichbare Geräte ausblenden" and
// the alias target lookup behind "Aliase ohne Ziel ausblenden" (#925).
//
//   node tools/tests/device-reach.mjs
//
// Pure logic, no dev server: src-vis/utils/deviceReach.ts bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-device-reach-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/deviceReach.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { findReachDp, isUnreachable, aliasTargetOf } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : ` - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
};

// ── finding the datapoint ────────────────────────────────────────────────────
eq(
    'alias channel: UNREACH, true = unreachable',
    findReachDp('alias.0.Licht.Kette.ON', [
        { id: 'alias.0.Licht.Kette.ON' },
        { id: 'alias.0.Licht.Kette.UNREACH', role: 'indicator.maintenance.unreach' },
    ]),
    { id: 'alias.0.Licht.Kette.UNREACH', positive: false },
);
eq(
    'zigbee: available, true = reachable',
    findReachDp('zigbee.0.00158d0001.state', [
        { id: 'zigbee.0.00158d0001.state' },
        { id: 'zigbee.0.00158d0001.available' },
    ]),
    { id: 'zigbee.0.00158d0001.available', positive: true },
);
eq(
    'shelly: online in the device folder',
    findReachDp('shelly.0.SHSW-1#A1#1.Relay0.Switch', [
        { id: 'shelly.0.SHSW-1#A1#1.Relay0.Switch' },
        { id: 'shelly.0.SHSW-1#A1#1.online' },
    ]),
    { id: 'shelly.0.SHSW-1#A1#1.online', positive: true },
);
eq(
    'HmIP: UNREACH on channel 0 of the device',
    findReachDp('hm-rpc.1.0001.4.STATE', [{ id: 'hm-rpc.1.0001.4.STATE' }, { id: 'hm-rpc.1.0001.0.UNREACH' }]),
    { id: 'hm-rpc.1.0001.0.UNREACH', positive: false },
);
eq(
    'by role when the name says nothing',
    findReachDp('alias.0.X.Y.SET', [
        { id: 'alias.0.X.Y.SET' },
        { id: 'alias.0.X.Y.REACH', role: 'indicator.reachable' },
    ]),
    { id: 'alias.0.X.Y.REACH', positive: true },
);
eq(
    'own channel wins over the device',
    findReachDp('hm-rpc.1.0001.4.STATE', [
        { id: 'hm-rpc.1.0001.4.STATE' },
        { id: 'hm-rpc.1.0001.4.UNREACH' },
        { id: 'hm-rpc.1.0001.0.UNREACH' },
    ]),
    { id: 'hm-rpc.1.0001.4.UNREACH', positive: false },
);
eq(
    'no reachability datapoint: undefined',
    findReachDp('a.0.b.c', [{ id: 'a.0.b.c' }, { id: 'a.0.b.LEVEL' }]),
    undefined,
);
eq(
    'the row datapoint itself is never its own reachability',
    findReachDp('a.0.b.online', [{ id: 'a.0.b.online' }]),
    undefined,
);

// ── reading the value ────────────────────────────────────────────────────────
const neg = { id: 'x', positive: false };
const pos = { id: 'x', positive: true };
eq('UNREACH true hides', isUnreachable(neg, true), true);
eq('UNREACH false keeps', isUnreachable(neg, false), false);
eq('available false hides', isUnreachable(pos, false), true);
eq('available "true" keeps', isUnreachable(pos, 'true'), false);
eq('online 0 hides', isUnreachable(pos, 0), true);
eq(
    'no value hides nothing',
    [isUnreachable(neg, null), isUnreachable(pos, undefined), isUnreachable(pos, 'unknown')],
    [false, false, false],
);

// ── alias targets ────────────────────────────────────────────────────────────
eq('alias id as string', aliasTargetOf({ alias: { id: 'hm-rpc.0.A.1.STATE' } }), 'hm-rpc.0.A.1.STATE');
eq('alias id as read/write', aliasTargetOf({ alias: { id: { read: 'r.0.x', write: 'w.0.x' } } }), 'r.0.x');
eq('alias id write only', aliasTargetOf({ alias: { id: { write: 'w.0.x' } } }), 'w.0.x');
eq(
    'no alias: undefined',
    [aliasTargetOf({}), aliasTargetOf({ alias: { id: '' } }), aliasTargetOf(undefined)],
    [undefined, undefined, undefined],
);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall checks passed');
