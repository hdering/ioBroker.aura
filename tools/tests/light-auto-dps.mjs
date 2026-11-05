// Verifies the light widget's runtime datapoint detection (option autoDetectDps, #925).
//
// One shared popup opens for every lamp of a list, so its single light widget must
// find each lamp's own datapoints. The fixture holds alias channels named the way the
// type-detector / devices adapter creates them (ON, SET, DIMMER, TEMPERATURE, RGB,
// HUE/SAT), all in ONE folder - plus a HmIP device whose lamp spans several channels.
// Checks:
//   * every lamp type gets exactly its own controls and colour mode,
//   * a lamp never borrows a neighbour's datapoint from the shared alias folder,
//   * HmIP still reaches across channels when the grandparent is a real device,
//   * the main datapoint's type decides switch vs. brightness.
//
//   node tools/tests/light-auto-dps.mjs
//
// No dev server needed - the object view is served from the fixture instead of ioBroker.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

const st = (role, type) => ({ type: 'state', common: { role, type } });
const L = 'alias.0.Licht';
const OBJECTS = {
    [L]: { type: 'folder', common: {} },
    // plain switch
    [`${L}.Flur.SET`]: st('switch.light', 'boolean'),
    [`${L}.Flur.ACTUAL`]: st('sensor.light', 'boolean'),
    // dimmer (type-detector "dimmer": SET is the level, ON_SET the switch)
    [`${L}.Bad.SET`]: st('level.dimmer', 'number'),
    [`${L}.Bad.ON_SET`]: st('switch.light', 'boolean'),
    // colour temperature
    [`${L}.Kueche.ON`]: st('switch.light', 'boolean'),
    [`${L}.Kueche.DIMMER`]: st('level.dimmer', 'number'),
    [`${L}.Kueche.TEMPERATURE`]: st('level.color.temperature', 'number'),
    // rgbSingle + ct
    [`${L}.Wohnen.ON`]: st('switch.light', 'boolean'),
    [`${L}.Wohnen.BRIGHTNESS`]: st('level.brightness', 'number'),
    [`${L}.Wohnen.RGB`]: st('level.color.rgb', 'string'),
    [`${L}.Wohnen.TEMPERATURE`]: st('level.color.temperature', 'number'),
    // hue
    [`${L}.Kind.ON`]: st('switch.light', 'boolean'),
    [`${L}.Kind.DIMMER`]: st('level.dimmer', 'number'),
    [`${L}.Kind.HUE`]: st('level.color.hue', 'number'),
    [`${L}.Kind.SAT`]: st('level.color.saturation', 'number'),
    // HmIP: switch/level on channel 2, colour temperature on channel 3 of one device
    'hm-rpc.1.LAMP1': { type: 'device', common: {} },
    'hm-rpc.1.LAMP1.2.LEVEL': st('level.dimmer', 'number'),
    'hm-rpc.1.LAMP1.3.COLOR_TEMPERATURE': st('level.color.temperature', 'number'),
};

const bundle = join(cache, `aura-light-auto-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { detectLightAutoDps } from './src-vis/hooks/useLightAutoDps.ts';",
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
            name: 'objects-from-fixture',
            setup(b) {
                b.onResolve({ filter: /^\.\/useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: [
                        `const OBJECTS = ${JSON.stringify(OBJECTS)};`,
                        'export const getObjectDirect = async (id) => OBJECTS[id] ? { _id: id, ...OBJECTS[id] } : null;',
                        'export const getObjectViewDirect = async (type, from, to) => ({ rows: Object.entries(OBJECTS)',
                        '    .filter(([id, o]) => o.type === type && id >= from && id <= to)',
                        '    .map(([id, o]) => ({ id, value: { _id: id, ...o } })) });',
                    ].join('\n'),
                    loader: 'js',
                }));
            },
        },
    ],
});
const { detectLightAutoDps } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, cond, detail) => {
    if (cond) {
        console.log(`  ok    ${label}`);
        return;
    }
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const show = (r) =>
    JSON.stringify({ ...Object.fromEntries(Object.entries(r.dps).filter(([, v]) => v)), main: r.mainType });

let r = await detectLightAutoDps(`${L}.Flur.SET`);
check(
    'switch: main boolean, nothing else',
    r.mainType === 'boolean' && !r.dps.brightnessDp && !r.dps.temperatureDp && r.dps.colorMode === 'none',
    show(r),
);

r = await detectLightAutoDps(`${L}.Bad.SET`);
check(
    'dimmer: ON_SET is the switch, main is the level',
    r.dps.switchDp === `${L}.Bad.ON_SET` && r.mainType === 'number' && !r.dps.temperatureDp,
    show(r),
);

// A list of switch.light rows hands the popup the switch, not the level.
r = await detectLightAutoDps(`${L}.Bad.ON_SET`);
check(
    'dimmer opened from its switch row: SET is the brightness',
    r.mainType === 'boolean' && r.dps.brightnessDp === `${L}.Bad.SET`,
    show(r),
);

r = await detectLightAutoDps(`${L}.Kueche.ON`);
check(
    'ct: DIMMER + TEMPERATURE',
    r.dps.brightnessDp === `${L}.Kueche.DIMMER` &&
        r.dps.temperatureDp === `${L}.Kueche.TEMPERATURE` &&
        r.dps.colorMode === 'none',
    show(r),
);

r = await detectLightAutoDps(`${L}.Wohnen.ON`);
check(
    'rgbSingle + ct: hex mode',
    r.dps.colorMode === 'hex' &&
        r.dps.colorHexDp === `${L}.Wohnen.RGB` &&
        r.dps.brightnessDp === `${L}.Wohnen.BRIGHTNESS` &&
        r.dps.temperatureDp === `${L}.Wohnen.TEMPERATURE`,
    show(r),
);

r = await detectLightAutoDps(`${L}.Kind.ON`);
check(
    'hue: hsv mode',
    r.dps.colorMode === 'hsv' && r.dps.hueDp === `${L}.Kind.HUE` && r.dps.saturationDp === `${L}.Kind.SAT`,
    show(r),
);

r = await detectLightAutoDps(`${L}.Flur.SET`);
const borrowed = Object.values(r.dps).filter(
    (v) => typeof v === 'string' && v.startsWith(`${L}.`) && !v.startsWith(`${L}.Flur.`),
);
check('no neighbour datapoints from the shared alias folder', borrowed.length === 0, borrowed.join(', '));

r = await detectLightAutoDps('hm-rpc.1.LAMP1.2.LEVEL');
check(
    'HmIP: colour temperature from the sibling channel',
    r.dps.temperatureDp === 'hm-rpc.1.LAMP1.3.COLOR_TEMPERATURE',
    show(r),
);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall checks passed');
