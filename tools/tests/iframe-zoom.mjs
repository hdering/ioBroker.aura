// Verifies the zoom of the iFrame widget (issue #667): the configured level, the
// per-device override that beats it, the ladder the +/- buttons walk and the
// size/transform pair that keeps a scaled frame filling its widget exactly.
//
//   node tools/tests/iframe-zoom.mjs
//
// No dev server needed — the zoom logic is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-iframe-zoom-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            'export { IFRAME_ZOOM_MIN, IFRAME_ZOOM_MAX, IFRAME_ZOOM_STOPS, clampIframeZoom, resolveIframeZoom, ' +
            'stepIframeZoom, iframeZoomStyle, pinchDistance, zoomFromPinch, parseDeviceZoomMap, readDeviceZoom, ' +
            "writeDeviceZoom, IFRAME_ZOOM_STORAGE_KEY } from './src-vis/utils/iframeZoom.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const mod = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });
const {
    IFRAME_ZOOM_MIN,
    IFRAME_ZOOM_MAX,
    IFRAME_ZOOM_STOPS,
    clampIframeZoom,
    resolveIframeZoom,
    stepIframeZoom,
    iframeZoomStyle,
    pinchDistance,
    zoomFromPinch,
    parseDeviceZoomMap,
    readDeviceZoom,
    writeDeviceZoom,
    IFRAME_ZOOM_STORAGE_KEY,
} = mod;

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ── clamp ────────────────────────────────────────────────────────────────────
eq('nothing configured means 100 %', clampIframeZoom(undefined), 100);
eq('garbage means 100 %', clampIframeZoom('weit weg'), 100);
eq('zero means 100 %', clampIframeZoom(0), 100);
eq('a negative level means 100 %', clampIframeZoom(-50), 100);
eq('a numeric string counts', clampIframeZoom('150'), 150);
eq('fractions are rounded', clampIframeZoom(66.6), 67);
eq('below the floor clamps up', clampIframeZoom(5), IFRAME_ZOOM_MIN);
eq('above the ceiling clamps down', clampIframeZoom(5000), IFRAME_ZOOM_MAX);

// ── which level wins ─────────────────────────────────────────────────────────
eq('without an override the config wins', resolveIframeZoom(75, null, true), 75);
eq('the device beats the config', resolveIframeZoom(75, 150, true), 150);
eq('with the controls off the device is ignored', resolveIframeZoom(75, 150, false), 75);
eq('an unconfigured level is 100 %', resolveIframeZoom(undefined, null, true), 100);
eq('a stored device level is clamped too', resolveIframeZoom(100, 9999, true), IFRAME_ZOOM_MAX);

// ── the ladder ───────────────────────────────────────────────────────────────
eq('one step up from the default', stepIframeZoom(100, 1), 110);
eq('one step down from the default', stepIframeZoom(100, -1), 90);
eq('a pinch level between stops steps to the next one up', stepIframeZoom(137, 1), 150);
eq('and to the next one down', stepIframeZoom(137, -1), 125);
eq('the top does not move further', stepIframeZoom(IFRAME_ZOOM_MAX, 1), IFRAME_ZOOM_MAX);
eq('the bottom does not move further', stepIframeZoom(IFRAME_ZOOM_MIN, -1), IFRAME_ZOOM_MIN);
check(
    'the ladder runs from the floor to the ceiling',
    IFRAME_ZOOM_STOPS[0] === IFRAME_ZOOM_MIN && IFRAME_ZOOM_STOPS[IFRAME_ZOOM_STOPS.length - 1] === IFRAME_ZOOM_MAX,
);
check(
    'the ladder is sorted and free of duplicates',
    IFRAME_ZOOM_STOPS.every((s, i) => i === 0 || s > IFRAME_ZOOM_STOPS[i - 1]),
);

// ── the style handed to the frame ────────────────────────────────────────────
eq('100 % writes no transform at all', iframeZoomStyle(100), { width: '100%', height: '100%' });
eq('50 % doubles the box and halves it back', iframeZoomStyle(50), {
    width: '200%',
    height: '200%',
    transform: 'scale(0.5)',
    transformOrigin: 'top left',
});
eq('200 % halves the box and doubles it back', iframeZoomStyle(200), {
    width: '50%',
    height: '50%',
    transform: 'scale(2)',
    transformOrigin: 'top left',
});
// The scaled frame has to end up exactly as wide as the widget, or the page
// either leaves a gap or overflows the clip.
for (const zoom of IFRAME_ZOOM_STOPS) {
    const style = iframeZoomStyle(zoom);
    const painted = (parseFloat(style.width) * zoom) / 100;
    check(`${zoom} % fills the widget exactly`, Math.abs(painted - 100) < 0.01, `covers ${painted} %`);
}

// ── pinch ────────────────────────────────────────────────────────────────────
eq('distance is the plain hypotenuse', pinchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }), 5);
eq('spreading twice as far doubles the level', zoomFromPinch(100, 50, 100), 200);
eq('pinching to half halves it', zoomFromPinch(100, 100, 50), 50);
eq('a pinch starts from the level already shown', zoomFromPinch(150, 100, 200), 300);
eq('the ceiling still holds', zoomFromPinch(300, 100, 400), IFRAME_ZOOM_MAX);
eq('a zero-length start changes nothing', zoomFromPinch(125, 0, 80), 125);
eq('two fingers on the same spot change nothing', zoomFromPinch(125, 80, 0), 125);

// ── the per-device store ─────────────────────────────────────────────────────
eq('no blob means no override', parseDeviceZoomMap(null), {});
eq('broken JSON means no override', parseDeviceZoomMap('{nope'), {});
eq('an array is not a map', parseDeviceZoomMap('[1,2]'), {});
eq('non-numbers are dropped', parseDeviceZoomMap('{"a":"150","b":150}'), { b: 150 });
eq('stored levels are clamped on read', parseDeviceZoomMap('{"a":9999}'), { a: IFRAME_ZOOM_MAX });

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};
eq('an unknown widget has no override', readDeviceZoom('w1'), null);
writeDeviceZoom('w1', 150);
eq('a written level comes back', readDeviceZoom('w1'), 150);
writeDeviceZoom('w2', 67);
eq('a second widget keeps its own', readDeviceZoom('w2'), 67);
eq('and does not disturb the first', readDeviceZoom('w1'), 150);
writeDeviceZoom('w1', null);
eq('resetting drops the override', readDeviceZoom('w1'), null);
eq('while the other survives', readDeviceZoom('w2'), 67);
writeDeviceZoom('w2', null);
check('the last reset removes the key entirely', store.get(IFRAME_ZOOM_STORAGE_KEY) === undefined);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
