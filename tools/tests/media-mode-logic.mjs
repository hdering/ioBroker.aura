// Media player shuffle / repeat buttons (#782) — the pure part.
//
//   node tools/tests/media-mode-logic.mjs
//
// No dev server needed: utils/mediaMode is pure and bundled with esbuild. Checks
// that a click steps the mode the way the adapter encodes it (button, boolean
// switch, enum) and that the button shows the mode as on/off.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-media-mode-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/mediaMode.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { modeView, nextModeValue } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const eq = (name, got, want) =>
    check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// Sonos / Alexa: boolean switch
const bool = { type: 'boolean', role: 'media.mode.shuffle' };
eq('boolean on → off', nextModeValue(true, bool), false);
eq('boolean off → on', nextModeValue(false, bool), true);
eq('boolean without value → on', nextModeValue(null, bool), true);
check('boolean on shows active', modeView(true, bool).active);
check('boolean off not active', !modeView(false, bool).active);
eq('bare boolean value toggles without object', nextModeValue(true, null), false);

// Yamaha toggle button
const btn = { type: 'boolean', role: 'button' };
eq('button always writes true', nextModeValue(true, btn), true);
check('button never shows active', !modeView(true, btn).active);

// Sonos repeat: numeric enum
const sonosRepeat = { type: 'number', role: 'media.mode.repeat', states: { 0: 'none', 1: 'all', 2: 'one' } };
eq('enum 0 → 1', nextModeValue(0, sonosRepeat), 1);
eq('enum 1 → 2', nextModeValue(1, sonosRepeat), 2);
eq('enum 2 → 0 (wraps)', nextModeValue(2, sonosRepeat), 0);
check('enum none not active', !modeView(0, sonosRepeat).active);
check('enum all active, not one', modeView(1, sonosRepeat).active && !modeView(1, sonosRepeat).one);
check('enum one active + one', modeView(2, sonosRepeat).active && modeView(2, sonosRepeat).one);

// Spotify repeat: string enum
const spRepeat = { type: 'string', states: { off: 'off', context: 'context', track: 'track' } };
eq('string enum off → context', nextModeValue('off', spRepeat), 'context');
eq('string enum track → off', nextModeValue('track', spRepeat), 'off');
check('string enum track shows one', modeView('track', spRepeat).one);

// on/off strings without states, numbers without states
eq('"on" → "off"', nextModeValue('on', null), 'off');
eq('"off" → "on"', nextModeValue('off', null), 'on');
eq('number 1 → 0', nextModeValue(1, null), 0);
check('"off" not active', !modeView('off', null).active);
check('nothing known → trigger true', nextModeValue(undefined, null) === true);

const failed = results.filter((r) => !r.ok);
for (const r of failed) {
    console.log(`  FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`media-mode: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
