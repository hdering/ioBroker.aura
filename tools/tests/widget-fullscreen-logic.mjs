// Placement rules of the frame-level fullscreen button (issue #644): which types
// offer it, which corner it lands in, and how it shares the top-right corner with
// the other corner buttons.
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
    fullscreenScreenEnabled,
    screenIsFullscreen,
    enterScreenFullscreen,
    exitScreenFullscreen,
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

// ── 5. Corner slots ──
// The ladder of buttons sharing a corner (click-action icon, fold button) is
// covered by click-action-icon-logic.mjs; here only the slot spacing itself.
ok('slots clear the 28px button', cornerRight(1) - cornerRight(0) >= 28);

// ── 6. The excluded list matches what the schema tells a model ──
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
const described = schema.commonOptions?.fullscreenWidget?.description ?? '';
for (const type of FULLSCREEN_EXCLUDED_TYPES) {
    ok(`the schema names ${type} as excluded`, described.includes(type));
}
eq('the schema offers the same corners', schema.commonOptions?.fullscreenPosition?.enum ?? [], [
    ...FULLSCREEN_POSITIONS,
]);

// ── 7. Browser fullscreen on top of the overlay (issue #711) ──
ok('screen off by default', !fullscreenScreenEnabled({ fullscreenWidget: true }));
ok('screen needs the button', !fullscreenScreenEnabled({ fullscreenScreen: true }));
ok('screen on with both', fullscreenScreenEnabled({ fullscreenWidget: true, fullscreenScreen: true }));

/** Minimal document stand-in that records calls. */
const fakeDoc = ({ already = false, api = 'std', reject = false, throws = false } = {}) => {
    const calls = [];
    const doc = { fullscreenElement: already ? {} : null, documentElement: {} };
    if (api === 'std') {
        doc.documentElement.requestFullscreen = () => {
            calls.push('request');
            if (throws) throw new Error('sync');
            return reject ? Promise.reject(new Error('denied')) : Promise.resolve();
        };
        doc.exitFullscreen = () => {
            calls.push('exit');
            return Promise.resolve();
        };
    } else if (api === 'webkit') {
        doc.documentElement.webkitRequestFullscreen = () => calls.push('webkitRequest');
        doc.webkitExitFullscreen = () => calls.push('webkitExit');
    }
    return { doc, calls };
};

{
    const { doc, calls } = fakeDoc();
    ok('requests and owns the screen', enterScreenFullscreen(doc) === true);
    eq('standard API used', calls, ['request']);
}
{
    const { doc, calls } = fakeDoc({ already: true });
    ok('already fullscreen (F11/kiosk): not owned', enterScreenFullscreen(doc) === false);
    eq('no request when already fullscreen', calls, []);
}
{
    const { doc, calls } = fakeDoc({ api: 'webkit' });
    ok('webkit prefix counts as owned', enterScreenFullscreen(doc) === true);
    eq('webkit request used', calls, ['webkitRequest']);
}
ok('no API (iPhone): not owned', enterScreenFullscreen(fakeDoc({ api: 'none' }).doc) === false);
ok('a synchronous throw is swallowed', enterScreenFullscreen(fakeDoc({ throws: true }).doc) === false);
{
    // A rejected promise must not surface as an unhandled rejection.
    let unhandled = false;
    const onRej = () => (unhandled = true);
    process.on('unhandledRejection', onRej);
    enterScreenFullscreen(fakeDoc({ reject: true }).doc);
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', onRej);
    ok('a refused request is swallowed', !unhandled);
}
{
    const { doc, calls } = fakeDoc();
    exitScreenFullscreen(doc);
    eq('exit is a no-op when not fullscreen', calls, []);
    doc.fullscreenElement = {};
    ok('screenIsFullscreen sees the element', screenIsFullscreen(doc));
    exitScreenFullscreen(doc);
    eq('exit leaves fullscreen', calls, ['exit']);
}
{
    const { doc, calls } = fakeDoc({ api: 'webkit' });
    doc.fullscreenElement = undefined;
    doc.webkitFullscreenElement = {};
    exitScreenFullscreen(doc);
    eq('webkit exit used', calls, ['webkitExit']);
}
ok(
    'the schema describes fullscreenScreen',
    (schema.commonOptions?.fullscreenScreen?.description ?? '').includes('fullscreenWidget'),
);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nwidget-fullscreen-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
