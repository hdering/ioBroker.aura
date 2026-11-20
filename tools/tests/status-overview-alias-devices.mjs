// Statusübersicht: aliases filed as alias.0.<room>.<device>.<state> are one device each
// (#1002). Before, three id segments made the room folder the device, so one percent
// alias in a room hid the voltage/LOWBAT aliases of every other device there.
//
//   node tools/tests/status-overview-alias-devices.mjs
//
// No dev server: discovery and the device key are pure.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-status-alias-devices-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/statusOverview.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents:
                        'export const getObjectViewDirect = () => Promise.resolve({ rows: [] });\n' +
                        'export const getObjectDirect = () => Promise.resolve(null);',
                    loader: 'js',
                }));
            },
        },
    ],
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(
        `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
};

const dp = (id, role, type, unit) => ({ id, name: id, role, type, unit, rooms: ['Bad'], funcs: [], logging: [] });
const bool = (id) => dp(id, 'indicator.lowbat', 'boolean');
const pct = (id) => dp(id, 'value.battery', 'number', '%');
const volt = (id) => dp(id, 'value.voltage', 'number', 'V');

// ── device key ────────────────────────────────────────────────────────────────
eq('alias in a room folder: its own folder', m.deviceIdFallback('alias.0.Bad.Fenster.battery'), 'alias.0.Bad.Fenster');
eq('alias without room folder: unchanged', m.deviceIdFallback('alias.0.Fenster.battery'), 'alias.0.Fenster');
eq('alias state directly under alias.0', m.deviceIdFallback('alias.0.battery'), 'alias.0');
eq('adapter id: unchanged', m.deviceIdFallback('hm-rpc.1.0020DA499B8F41.0.LOW_BAT'), 'hm-rpc.1.0020DA499B8F41');

// ── discovery: one battery row per alias device, not per room ─────────────────
const opts = {
    catWindow: false,
    catLight: false,
    catUnreach: false,
    catAlarm: false,
    batteryKinds: ['bool', 'percent', 'volt', 'millivolt'],
};
const rows = (cache) =>
    m
        .discoverStatusCandidates(cache, opts)
        .map((c) => c.dp.id)
        .sort();

eq(
    'two alias devices in one room both keep their battery',
    rows([pct('alias.0.Bad.Fenster.battery'), volt('alias.0.Bad.Thermostat.battery_voltage')]),
    ['alias.0.Bad.Fenster.battery', 'alias.0.Bad.Thermostat.battery_voltage'],
);
eq(
    'LOWBAT of a third device in the room stays too',
    rows([
        pct('alias.0.Bad.Fenster.battery'),
        volt('alias.0.Bad.Thermostat.battery_voltage'),
        bool('alias.0.Bad.Rauchmelder.lowbat'),
    ]),
    ['alias.0.Bad.Fenster.battery', 'alias.0.Bad.Rauchmelder.lowbat', 'alias.0.Bad.Thermostat.battery_voltage'],
);
eq(
    // #1000: percent displaces the voltage; the LOWBAT flag only gives way to a voltage.
    'within one alias device the percent value displaces the voltage',
    rows([
        pct('alias.0.Bad.Fenster.battery'),
        volt('alias.0.Bad.Fenster.battery_voltage'),
        bool('alias.0.Bad.Fenster.lowbat'),
    ]),
    ['alias.0.Bad.Fenster.battery', 'alias.0.Bad.Fenster.lowbat'],
);

// ── device names saved on the old room-folder key still apply ─────────────────
eq(
    'name on the alias device',
    m.customDeviceName('alias.0.Bad.Fenster.battery', { 'alias.0.Bad.Fenster': 'Fenster' }),
    'Fenster',
);
eq(
    'name saved before #1002 on the room folder',
    m.customDeviceName('alias.0.Bad.Fenster.battery', { 'alias.0.Bad': 'Alt' }),
    'Alt',
);
eq(
    'own device name beats the old room-folder name',
    m.customDeviceName('alias.0.Bad.Fenster.battery', { 'alias.0.Bad': 'Alt', 'alias.0.Bad.Fenster': 'Neu' }),
    'Neu',
);

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
