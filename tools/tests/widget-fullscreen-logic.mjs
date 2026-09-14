// Placement rules of the frame-level fullscreen button (issue #644): which types
// offer it, which corner it lands in, and how it shares the top-right corner with
// the embed action button of issue #527.
//
//   node tools/tests/widget-fullscreen-logic.mjs
//
// No dev server needed - utils/fullscreenButton.ts is pure arithmetic and is
// bundled with esbuild. The overlay itself is covered by widget-fullscreen.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-fullscreen-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/fullscreenButton.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const {
    FULLSCREEN_POSITIONS,
    FULLSCREEN_EXCLUDED_TYPES,
    DEFAULT_FULLSCREEN_POSITION,
    supportsFullscreenButton,
    fullscreenButtonEnabled,
    fullscreenPosition,
    fullscreenButtonInset,
    cornerRight,
    actionButtonRight,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// ── 1. Which types offer the button ──
ok('a chart offers it', supportsFullscreenButton('chart'));
ok('a list offers it', supportsFullscreenButton('list'));
ok('a group offers it', supportsFullscreenButton('group'));
for (const type of ['iframe', 'camera', 'echartsPreset']) {
    ok(`${type} keeps its own fullscreen instead`, !supportsFullscreenButton(type));
}

// ── 2. The option has to be set explicitly ──
ok('off without options', !fullscreenButtonEnabled('chart', undefined));
ok('off when unset', !fullscreenButtonEnabled('chart', {}));
ok('off when false', !fullscreenButtonEnabled('chart', { fullscreenWidget: false }));
ok('on when true', fullscreenButtonEnabled('chart', { fullscreenWidget: true }));
// A stored 'true' string must not turn it on silently - the editor writes booleans.
ok('a string does not count as on', !fullscreenButtonEnabled('chart', { fullscreenWidget: 'true' }));
ok('an excluded type stays off even when set', !fullscreenButtonEnabled('iframe', { fullscreenWidget: true }));

// ── 3. Corner resolution ──
eq('default corner is top right', fullscreenPosition({}), 'tr');
eq('default corner is a listed one', DEFAULT_FULLSCREEN_POSITION, 'tr');
eq('a stored corner is kept', fullscreenPosition({ fullscreenPosition: 'br' }), 'br');
eq('nonsense falls back', fullscreenPosition({ fullscreenPosition: 'middle' }), 'tr');
eq('no options fall back', fullscreenPosition(undefined), 'tr');
eq('three corners are offered', [...FULLSCREEN_POSITIONS], ['tr', 'tl', 'br']);

// ── 4. Insets ──
eq('top right', fullscreenButtonInset('tr'), { top: 6, right: 6 });
eq('top left', fullscreenButtonInset('tl'), { top: 6, left: 6 });
eq('bottom right', fullscreenButtonInset('br'), { bottom: 6, right: 6 });
for (const pos of FULLSCREEN_POSITIONS) {
    const inset = fullscreenButtonInset(pos);
    ok(`${pos} pins exactly one horizontal and one vertical edge`, Object.keys(inset).length === 2);
}

// ── 5. The shared top-right ladder ──
// The action button is the innermost one: every other occupant pushes it inwards
// by one slot, so two buttons never end up on top of each other.
eq('an empty corner', actionButtonRight({ iframeOwnFullscreen: false, fullscreenTopRight: false }), 6);
eq('beside the iframe button', actionButtonRight({ iframeOwnFullscreen: true, fullscreenTopRight: false }), 38);
eq('beside the frame button', actionButtonRight({ iframeOwnFullscreen: false, fullscreenTopRight: true }), 38);
eq('beside both', actionButtonRight({ iframeOwnFullscreen: true, fullscreenTopRight: true }), 70);
// A button is 28px wide, so consecutive slots must not overlap.
ok('slots clear the 28px button', cornerRight(1) - cornerRight(0) >= 28);
// Placed anywhere but top right, the frame button leaves the ladder alone.
eq(
    'a left corner does not shift the action',
    actionButtonRight({ iframeOwnFullscreen: false, fullscreenTopRight: false }),
    6,
);

// ── 6. The excluded list matches what the schema tells a model ──
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
const described = schema.commonOptions?.fullscreenWidget?.description ?? '';
for (const type of FULLSCREEN_EXCLUDED_TYPES) {
    ok(`the schema names ${type} as excluded`, described.includes(type));
}
eq('the schema offers the same corners', schema.commonOptions?.fullscreenPosition?.enum ?? [], [
    ...FULLSCREEN_POSITIONS,
]);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nwidget-fullscreen-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
