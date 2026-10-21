// Verifies the shutter "Fahr-DP" mode: one move DP for up and down (KNX DPT 1.008).
//
//   node tools/tests/shutter-move-dp.mjs
//
// controlMode "move" writes moveUpValue / moveDownValue (default false / true) to
// moveDp; "taster" keeps pulsing true on openDp / closeDp. The group action reads
// the same commands through groupChildShutterTargets.
//
// No dev server needed — the modules are pure and are bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-shutter-move-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { shutterCommands, parseShutterValue } from './src-vis/utils/shutterCommand.ts';\n" +
            "export { groupChildShutterTargets } from './src-vis/utils/groupTargets.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { shutterCommands, parseShutterValue, groupChildShutterTargets } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));

const DP = 'knx.0.Rollo.Fahren';

eq('move: defaults false = up, true = down', shutterCommands({ controlMode: 'move', moveDp: DP }), {
    upDp: DP,
    upValue: false,
    downDp: DP,
    downValue: true,
});
eq(
    'move: text values are parsed',
    shutterCommands({ controlMode: 'move', moveDp: DP, moveUpValue: '0', moveDownValue: '1' }),
    { upDp: DP, upValue: 0, downDp: DP, downValue: 1 },
);
eq(
    'move: free text stays text',
    shutterCommands({ controlMode: 'move', moveDp: DP, moveUpValue: 'UP', moveDownValue: 'DOWN' }),
    { upDp: DP, upValue: 'UP', downDp: DP, downValue: 'DOWN' },
);
eq('move without moveDp → null', shutterCommands({ controlMode: 'move' }), null);
eq('position → null', shutterCommands({ moveDp: DP, openDp: 'a' }), null);
eq('taster: true on both DPs', shutterCommands({ controlMode: 'taster', openDp: 'a', closeDp: 'b' }), {
    upDp: 'a',
    upValue: true,
    downDp: 'b',
    downValue: true,
});
eq('taster: only open DP', shutterCommands({ controlMode: 'taster', openDp: 'a' }), {
    upDp: 'a',
    upValue: true,
    downDp: undefined,
    downValue: true,
});
eq('parse: "true"', parseShutterValue('true', 0), true);
eq('parse: boolean kept', parseShutterValue(false, true), false);
eq('parse: empty → fallback', parseShutterValue('', true), true);

const targets = groupChildShutterTargets([
    {
        id: 'a',
        type: 'shutter',
        datapoint: '',
        options: { controlMode: 'move', moveDp: DP, stopDp: 'knx.0.Rollo.Stopp' },
    },
    { id: 'b', type: 'shutter', datapoint: 'hm.0.LEVEL', options: { invertPosition: true } },
]);
eq('group: move child → command DPs with values', targets[0], {
    upDp: DP,
    upValue: false,
    downDp: DP,
    downValue: true,
    stopDp: 'knx.0.Rollo.Stopp',
    writeValue: true,
});
eq('group: position child unchanged', targets[1], {
    positionDp: 'hm.0.LEVEL',
    invert: true,
    writeValue: true,
});

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall shutter move-DP checks passed');
