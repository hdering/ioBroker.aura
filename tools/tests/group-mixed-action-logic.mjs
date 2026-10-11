// Group switch: what a click does from each aggregate state (issue #764).
// Off turns all on, on turns all off; the mixed state (some on, some off)
// follows groupMixedAction — 'on' (default, the old behaviour) or 'off'.
//
//   node tools/tests/group-mixed-action-logic.mjs
//
// No dev server needed - nextTurnOn in utils/groupTargets.ts is pure and is
// bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-group-mixed-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { nextTurnOn } from './src-vis/utils/groupTargets.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { nextTurnOn } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (name, got, want) => {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — got ${got}, want ${want}`}`);
};

eq('off → on (default)', nextTurnOn('off'), true);
eq('on → off (default)', nextTurnOn('on'), false);
eq('mixed → on (default, unchanged behaviour)', nextTurnOn('mixed'), true);
eq('mixed + undefined → on', nextTurnOn('mixed', undefined), true);
eq("mixed + 'on' → on", nextTurnOn('mixed', 'on'), true);
eq("mixed + 'off' → off", nextTurnOn('mixed', 'off'), false);
eq("off + 'off' → still on", nextTurnOn('off', 'off'), true);
eq("on + 'off' → off", nextTurnOn('on', 'off'), false);

if (failed) {
    console.log(`\n${failed} failed`);
    process.exit(1);
}
console.log('\nall passed');
