// Statusübersicht: dimmers as lights — detection via the light function, one lamp
// per channel, brightness label, and the "Aus" row action writing 0 to a dimmer.
//
//   node tools/tests/status-overview-dimmer.mjs
//
// No dev server: categoryOf, evaluateItem, dedupeLights … are pure.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-status-dimmer-${process.pid}.mjs`);
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
                    contents: 'export const getObjectViewDirect = () => Promise.resolve({ rows: [] });',
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

const ch = (id, role, over = {}) => ({
    id,
    name: id.split('.').slice(-2).join('.'),
    type: role.startsWith('level') ? 'number' : 'boolean',
    role,
    rooms: ['Küche'],
    funcs: ['Licht'],
    logging: [],
    ...over,
});
const kitchen = ch('hm-rpc.2.PEQ0157676.1.LEVEL', 'level.dimmer', { min: 0, max: 1, name: 'Küche' });
const flur = ch('hm-rpc.1.000E1D899A48AF.2.LEVEL', 'level.dimmer', { min: 0, max: 100, unit: '%', name: 'Flur EG' });
// RGBW dimmer: channel 1 is the lamp (in Licht), channel 2 colour, channel 3 program — not in Licht.
const rgbw1 = ch('hm-rpc.2.PEQ1604273.1.LEVEL', 'level.dimmer', { max: 1 });
const rgbw2 = ch('hm-rpc.2.PEQ1604273.2.COLOR', 'level.color.hue', { funcs: [] });
const rgbw3 = ch('hm-rpc.2.PEQ1604273.3.LEVEL', 'level.dimmer', { funcs: [], max: 1 });
const virt = ch('hm-rpc.1.000E1D899A48AF.3.LEVEL', 'level.dimmer', { funcs: [], max: 100, unit: '%' });
const sw = ch('hm-rpc.1.0001.3.STATE', 'switch');
const lightOpts = { lightRoleScope: 'all', lightsOnlyFunction: true };

console.log('Erkennung');
eq('HM-Dimmer im Gewerk Licht', m.categoryOf(kitchen, lightOpts), 'light');
eq('HmIP-Dimmer, Scope light', m.categoryOf(flur, {}), 'light');
eq('RGBW Kanal 1 zählt', m.categoryOf(rgbw1, lightOpts), 'light');
eq('RGBW Farbkanal zählt nicht', m.categoryOf(rgbw2, lightOpts), null);
eq('RGBW Programmkanal (nicht im Gewerk) zählt nicht', m.categoryOf(rgbw3, lightOpts), null);
eq('virtueller Kanal ohne Gewerk zählt nicht', m.categoryOf(virt, { lightRoleScope: 'all' }), null);
eq('lightIncludeDimmers: false', m.categoryOf(kitchen, { ...lightOpts, lightIncludeDimmers: false }), null);
eq('Schalter weiter erkannt', m.categoryOf(sw, lightOpts), 'light');

console.log('Doubletten');
const zState = ch('zigbee.0.abc.state', 'switch.light', { funcs: [] });
const zBri = ch('zigbee.0.abc.brightness', 'level.dimmer', { max: 254 });
const found = [zState, zBri, sw].map((dp) => ({ dp, cat: 'light' }));
eq(
    'STATE + LEVEL eines Kanals → nur LEVEL',
    m.dedupeLights(found).map((c) => c.dp.id),
    ['zigbee.0.abc.brightness', 'hm-rpc.1.0001.3.STATE'],
);

console.log('Zustand + Beschriftung');
const label = (dp, v) => m.evaluateItem(dp, v, 'light', lightOpts, undefined, true)?.label;
const sev = (dp, v) => m.evaluateItem(dp, v, 'light', lightOpts)?.severity ?? null;
eq('Küche 1.0 (0–1) → 100 %', label(kitchen, 1), 'An · 100 %');
eq('Küche 0.6 → 60 %', label(kitchen, 0.6), 'An · 60 %');
eq('Küche 0 → aus, keine Zeile', sev(kitchen, 0), null);
eq('Küche 0 mit includeOk → Aus', label(kitchen, 0), 'Aus');
eq('HmIP 100 (0–100 %) → 100 %', label(flur, 100), 'An · 100 %');
eq('HmIP 0.5 % → 1 %, nicht 0 %', label(flur, 0.5), 'An · 1 %');
eq('Zigbee 127 von 254 → 50 %', label(zBri, 127), 'An · 50 %');
eq('ohne max, Wert 40 → 40 %', label(ch('x.0.a.level', 'level.dimmer'), 40), 'An · 40 %');
eq('ohne max, Wert 0.3 → 30 %', label(ch('x.0.a.level', 'level.dimmer'), 0.3), 'An · 30 %');
eq('Wert als Text', label(flur, '75'), 'An · 75 %');
eq('null → Aus', label(flur, null), 'Aus');

console.log('Zeilen-Aktion „Aus“');
eq('false auf Dimmer → 0', m.coerceActionValue(false, kitchen), 0);
eq('true auf Dimmer → max', m.coerceActionValue(true, flur), 100);
eq('false auf Schalter bleibt false', m.coerceActionValue(false, sw), false);
eq('Text bleibt Text', m.coerceActionValue('x', kitchen), 'x');
eq('unbekannter DP', m.coerceActionValue(false, undefined), false);

if (failed) {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
}
console.log('\nall ok');
