// Statusübersicht: classic HomeMatic battery devices (no OPERATING_VOLTAGE) are found
// through the battery library; mains actuators with a LOWBAT flag stay out; one row per
// device when LOWBAT sits in channel 0 and 1.
//
//   node tools/tests/status-overview-hm-battery.mjs
//
// No dev server: categoryOf, collectHmBatterySerials, batteryDeviceTest … are pure.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-status-hm-battery-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/statusOverview.ts';\n" +
            "export { batteryDeviceTest, loadBatteryLibrary } from './src-vis/utils/batteryLibrary.ts';",
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

const dp = (id, role, over = {}) => ({
    id,
    name: id.split('.').slice(-2).join('.'),
    type: 'boolean',
    role,
    rooms: [],
    funcs: [],
    logging: [],
    ...over,
});

// Drehgriff Schlafzimmer (HM-Sec-RHS): LOWBAT in channel 0 and 1, no voltage.
const rhs0 = dp('hm-rpc.2.OEQ1127049.0.LOWBAT', 'indicator.lowbat');
const rhs1 = dp('hm-rpc.2.OEQ1127049.1.LOWBAT', 'indicator.lowbat');
// Garage-Licht (HM-LC-Sw1-FM): mains actuator with a LOWBAT flag.
const garage = dp('hm-rpc.2.LEQ1015993.0.LOWBAT', 'indicator.lowbat');
// HmIP-RCB1: LOW_BAT plus OPERATING_VOLTAGE — found as before.
const rcb = dp('hm-rpc.1.0020DA499B8F41.0.LOW_BAT', 'indicator.lowbat');
const rcbV = dp('hm-rpc.1.0020DA499B8F41.0.OPERATING_VOLTAGE', 'value.voltage', { type: 'number', unit: 'V' });
const all = [rhs0, rhs1, garage, rcb, rcbV];

const lib = await m.loadBatteryLibrary();
const model = (id, type) => [id, { id, name: id, kind: 'device', manufacturer: 'eQ-3', model: type, modelId: type }];
const index = new Map([
    model('hm-rpc.2.OEQ1127049', 'HM-Sec-RHS'),
    model('hm-rpc.2.LEQ1015993', 'HM-LC-Sw1-FM'),
    model('hm-rpc.1.0020DA499B8F41', 'HmIP-RCB1'),
]);
const test = m.batteryDeviceTest(index, lib);

console.log('Gate ohne Bibliothek (wie bisher)');
const before = m.collectHmBatterySerials(all);
eq('HM-Sec-RHS ohne Spannung → null', m.categoryOf(rhs0, {}, before), null);
eq('HmIP mit Spannung → battery', m.categoryOf(rcb, {}, before), 'battery');
eq('Netz-Aktor → null', m.categoryOf(garage, {}, before), null);

console.log('Gate mit Bibliothek');
const gate = m.collectHmBatterySerials(all, test);
eq('HM-Sec-RHS → battery', m.categoryOf(rhs0, {}, gate), 'battery');
eq('HM-LC-Sw1-FM (nicht in der Bibliothek) → null', m.categoryOf(garage, {}, gate), null);
eq('HmIP-RCB1 → battery', m.categoryOf(rcb, {}, gate), 'battery');
eq('Modell unbekannt → null', m.categoryOf(dp('hm-rpc.2.XEQ0000001.0.LOWBAT', 'indicator.lowbat'), {}, gate), null);
eq(
    'Batterietyp per Hand zugewiesen → battery',
    m.categoryOf(
        garage,
        {},
        m.collectHmBatterySerials(all, m.batteryDeviceTest(index, lib, { 'hm-rpc.2.LEQ1015993': { type: 'AA' } })),
    ),
    'battery',
);

console.log('Eine Zeile je Gerät');
const found = [rhs1, rhs0, rcb].map((d) => ({ dp: d, cat: m.categoryOf(d, {}, gate) }));
eq(
    'Kanal 0 bleibt, Kanal 1 fällt weg',
    m.dedupeHmLowbat(found).map((c) => c.dp.id),
    ['hm-rpc.2.OEQ1127049.0.LOWBAT', 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT'],
);
const pct = { dp: dp('hm-rpc.1.X.0.BAT', 'value.battery', { type: 'number' }), cat: 'battery' };
eq('Prozentwert bleibt neben dem Flag', m.dedupeHmLowbat([...found, pct]).length, 3);

console.log('Anzeige ohne Spannung');
const item = m.evaluateItem(rhs0, true, 'battery', {});
eq('Label „schwach“ ohne Klammer', item?.label, 'schwach');
eq('kein Spannungs-Nachbar', m.findBatteryLevelDp(rhs0, all), null);

if (failed) {
    console.log(`\n${failed} failed`);
    process.exit(1);
}
console.log('\nall ok');
