// The datapoint-finding heuristic behind the flow widget's data-source dropdown —
// utils/energySources.ts.
//
//   node tools/tests/energy-sources.mjs
//
// No dev server needed: the module is pure, so esbuild bundles it and the test
// drives it directly.
//
// The fixtures below are shaped like what real PV adapters publish, including the
// things that make this hard: energy counters sitting right next to the live power
// reading, per-string detail below the headline value, kW instead of W, and a
// battery whose SoC and power states differ by one word.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-energy-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { mapEnergyDatapoints, scoreCandidate, powerUnitFactor, instanceLabel, isEvccInstance, SLOT_OPTION } from './src-vis/utils/energySources.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { mapEnergyDatapoints, scoreCandidate, powerUnitFactor, instanceLabel, isEvccInstance, SLOT_OPTION } =
    await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** Shorthand for a numeric state. */
const s = (id, extra = {}) => ({ id, type: 'number', read: true, ...extra });

// ── units ────────────────────────────────────────────────────────────────────
eq('watts pass through', powerUnitFactor('W'), 1);
eq('kW is scaled to watts', powerUnitFactor('kW'), 1000);
eq('the unit is matched case-insensitively', powerUnitFactor('kw'), 1000);
eq('a missing unit is assumed to be watts', powerUnitFactor(undefined), 1);
eq('an unknown unit is left alone rather than guessed', powerUnitFactor('dBm'), 1);

// ── labels ───────────────────────────────────────────────────────────────────
eq('a known adapter gets its proper name', instanceLabel('sma.0'), 'SMA (sma.0)');
eq('an unknown one keeps its id', instanceLabel('mycustom.2'), 'mycustom.2');
eq('evcc is recognised', isEvccInstance('evcc.0'), true);
eq('… and a lookalike is not', isEvccInstance('evccfoo.0'), false);

// ── an SMA-shaped instance ───────────────────────────────────────────────────
{
    const found = mapEnergyDatapoints([
        s('sma.0.pvPower', { role: 'value.power', unit: 'W' }),
        s('sma.0.pvEnergyToday', { unit: 'kWh' }),
        s('sma.0.pvEnergyTotal', { unit: 'kWh' }),
        s('sma.0.strings.1.pvPower', { role: 'value.power', unit: 'W' }),
        s('sma.0.strings.2.pvPower', { role: 'value.power', unit: 'W' }),
        s('sma.0.gridPower', { role: 'value.power', unit: 'W' }),
        s('sma.0.homePower', { role: 'value.power', unit: 'W' }),
        s('sma.0.battery.soc', { role: 'value.battery', unit: '%', min: 0, max: 100 }),
        s('sma.0.battery.power', { role: 'value.power', unit: 'W' }),
        s('sma.0.device.temperature', { unit: '°C' }),
        s('sma.0.grid.frequency', { unit: 'Hz' }),
    ]);
    eq('production is the headline value', found.pv?.id, 'sma.0.pvPower');
    eq('not the per-string detail below it', found.pv?.id !== 'sma.0.strings.1.pvPower', true);
    eq('grid is found', found.grid?.id, 'sma.0.gridPower');
    eq('house consumption is found', found.home?.id, 'sma.0.homePower');
    eq('the battery charge level is found', found.batterySoc?.id, 'sma.0.battery.soc');
    eq('and the battery power, separately', found.batteryPower?.id, 'sma.0.battery.power');
    check(
        'the energy counters are left out entirely',
        !Object.values(found).some((m) => m.id.includes('Energy')),
        JSON.stringify(found),
    );
}

// ── a Fronius-shaped instance, German names and kW ───────────────────────────
{
    const found = mapEnergyDatapoints([
        s('fronius.0.inverter.1.Leistung', { unit: 'kW', name: 'PV Leistung' }),
        s('fronius.0.meter.1.PowerReal_P_Sum', { unit: 'W', name: 'Netz Leistung' }),
        s('fronius.0.powerflow.P_Load', { unit: 'W', name: 'Hausverbrauch' }),
        s('fronius.0.powerflow.P_Akku', { unit: 'W', name: 'Akku Leistung' }),
        s('fronius.0.storage.1.StateOfCharge_Relative', { unit: '%', name: 'Akku Ladestand' }),
        s('fronius.0.inverter.1.TagesEnergie', { unit: 'Wh' }),
    ]);
    eq('a German production name is understood', found.pv?.id, 'fronius.0.inverter.1.Leistung');
    eq('the kW unit comes back with it', found.pv?.unit, 'kW');
    eq('the house load is found by its name, not its id', found.home?.id, 'fronius.0.powerflow.P_Load');
    eq('"Akku" counts as a battery', found.batteryPower?.id, 'fronius.0.powerflow.P_Akku');
    eq('and its charge level', found.batterySoc?.id, 'fronius.0.storage.1.StateOfCharge_Relative');
}

// ── the traps ────────────────────────────────────────────────────────────────
eq(
    'a temperature is never a power reading',
    scoreCandidate('pv', s('sma.0.pv.temperature', { unit: '°C' })),
    null,
);
eq('a kWh counter is not a power reading', scoreCandidate('pv', s('sma.0.pvPowerToday', { unit: 'kWh' })), null);
eq('a string state is skipped', scoreCandidate('grid', { id: 'x.0.gridPower', type: 'string' }), null);
eq('a write-only state is skipped', scoreCandidate('grid', s('x.0.gridPower', { read: false })), null);
eq(
    'a maximum is not the current value',
    scoreCandidate('grid', s('x.0.gridPowerMax', { role: 'value.power', unit: 'W' })),
    null,
);
eq(
    'an evcc loadpoint is a consumer, not the house',
    scoreCandidate('home', s('evcc.0.loadpoint.1.status.chargePower', { role: 'value.power', unit: 'W' })),
    null,
);
eq(
    'a battery SoC is not offered as battery power',
    scoreCandidate('batteryPower', s('x.0.battery.soc', { unit: '%' })),
    null,
);
check(
    'an explicit role beats a bare word match',
    scoreCandidate('pv', s('x.0.pvPower', { role: 'value.power', unit: 'W' })) >
        scoreCandidate('pv', s('x.0.pvPower', { unit: 'W' })),
);

// ── nothing recognisable ─────────────────────────────────────────────────────
{
    const found = mapEnergyDatapoints([
        s('hm-rpc.0.ABC123.1.STATE', { type: 'boolean' }),
        s('mqtt.0.some.random.value'),
    ]);
    eq('an instance with nothing usable yields nothing', Object.keys(found).length, 0);
}

// ── one datapoint is never used for two slots ────────────────────────────────
{
    // A single "battery" state that both battery slots match by word.
    const found = mapEnergyDatapoints([s('x.0.batteryPower', { role: 'value.power', unit: 'W' })]);
    eq('it goes to the better-fitting slot', found.batteryPower?.id, 'x.0.batteryPower');
    eq('and not to the other one as well', found.batterySoc, undefined);
}

// ── the slot→option mapping the config panel writes through ──────────────────
eq('production writes pvPowerDatapoint', SLOT_OPTION.pv, 'pvPowerDatapoint');
eq('consumption writes homePowerDatapoint', SLOT_OPTION.home, 'homePowerDatapoint');
eq('grid writes gridPowerDatapoint', SLOT_OPTION.grid, 'gridPowerDatapoint');
eq('the charge level writes batterySocDatapoint', SLOT_OPTION.batterySoc, 'batterySocDatapoint');
eq('battery power writes batteryPowerDatapoint', SLOT_OPTION.batteryPower, 'batteryPowerDatapoint');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
