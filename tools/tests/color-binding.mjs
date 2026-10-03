// Colours taken from a datapoint (#747):
//
//   node tools/tests/color-binding.mjs
//
// No dev server needed — src-vis/utils/colorBinding.ts is pure, so it is bundled
// with esbuild and exercised directly together with dualColor.ts.
//
// What this guards:
//   * only a value that is ENTIRELY `{id}` / `[[id]]` and sits under a colour key
//     is a binding — a value text `{dp}` must stay a text,
//   * the datapoint shapes WLED, Hue, Shelly and scripts deliver become CSS,
//   * resolve returns the INPUT REFERENCE when nothing is bound,
//   * the write path puts bindings back, also when only one half of a light/dark
//     pair is bound (restoreColorBindingsDeep before restoreDualDeep).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-color-binding-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/colorBinding.ts'; export { resolveDualDeep, restoreDualDeep } from './src-vis/utils/dualColor.ts';",
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
    colorBindingRef,
    hasColorBinding,
    dpColorToCss,
    collectColorBindingRefs,
    resolveColorBindingsDeep,
    restoreColorBindingsDeep,
    resolveDualDeep,
    restoreDualDeep,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ── recognising a binding ─────────────────────────────────────────────────
eq('curly binding', colorBindingRef('{wled.0.seg.0.col}'), 'wled.0.seg.0.col');
eq('title spelling', colorBindingRef(' [[wled.0.col]] '), 'wled.0.col');
eq('a hex is no binding', colorBindingRef('#ff0000'), null);
eq('text around it is no binding', colorBindingRef('Farbe {a.b}'), null);
eq('a formatted template is no binding', colorBindingRef('{a.b;round(1)}'), null);
check('a pair with a bound half', hasColorBinding('light-dark({a.b}, #ffffff)'));
check('a plain pair has none', !hasColorBinding('light-dark(#000, #fff)'));

// ── datapoint shapes ──────────────────────────────────────────────────────
eq('hex with #', dpColorToCss('#FF8800'), '#ff8800');
eq('hex without #', dpColorToCss('ff8800'), '#ff8800');
eq('short hex', dpColorToCss('#f80'), '#f80');
eq('r,g,b text', dpColorToCss('255, 136, 0'), '#ff8800');
eq('[r,g,b] JSON text (WLED)', dpColorToCss('[255,136,0]'), '#ff8800');
eq('RGBW array drops the white channel', dpColorToCss([255, 136, 0, 200]), '#ff8800');
eq('array with alpha', dpColorToCss([255, 0, 0, 0.5]), '#ff000080');
eq('{r,g,b} object text', dpColorToCss('{"r":0,"g":0,"b":255}'), '#0000ff');
eq('integer 0xRRGGBB', dpColorToCss(0xff8800), '#ff8800');
eq('rgb() passes', dpColorToCss('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
eq('colour keyword', dpColorToCss('Red'), 'red');
eq('empty / missing → fallback', [dpColorToCss(null), dpColorToCss(''), dpColorToCss(true)], ['', '', '']);
eq('garbage → fallback', dpColorToCss('an aus'), '');

// ── deep resolve ──────────────────────────────────────────────────────────
const values = { 'wled.0.col': '#ff0000', 'wled.1.col': '[0,255,0]' };
const lookup = (ref) => values[ref];
const cfg = {
    id: 'w1',
    options: {
        iconColor: '{wled.0.col}',
        valueText: '{wled.0.col}',
        entries: [{ id: 'e1', textColorOn: '[[wled.1.col]]', label: '{wled.1.col}' }],
        colors: ['{wled.0.col}', '#123456'],
    },
};
eq('refs only from colour keys', collectColorBindingRefs(cfg).sort(), ['wled.0.col', 'wled.1.col']);
const out = resolveColorBindingsDeep(cfg, lookup);
eq('option resolved', out.options.iconColor, '#ff0000');
eq('text option untouched', out.options.valueText, '{wled.0.col}');
eq('nested entry resolved', out.options.entries[0].textColorOn, '#00ff00');
eq('nested text untouched', out.options.entries[0].label, '{wled.1.col}');
eq('array of colours resolved', out.options.colors, ['#ff0000', '#123456']);
const plain = { options: { iconColor: '#fff', valueText: '{a.b}' } };
check('nothing bound → same reference', resolveColorBindingsDeep(plain, lookup) === plain);

// ── a bound half of a pair ────────────────────────────────────────────────
const pairRaw = { options: { iconColor: 'light-dark(#000000, {wled.0.col})' } };
const darkView = resolveColorBindingsDeep(resolveDualDeep(pairRaw, true), lookup);
const lightView = resolveColorBindingsDeep(resolveDualDeep(pairRaw, false), lookup);
eq('dark half from the datapoint', darkView.options.iconColor, '#ff0000');
eq('light half stays fixed', lightView.options.iconColor, '#000000');

// ── write path ────────────────────────────────────────────────────────────
const restore = (next, raw, dark) => restoreDualDeep(restoreColorBindingsDeep(next, raw, lookup, dark), raw);
eq('binding comes back', restore(out, cfg, true).options.iconColor, '{wled.0.col}');
eq('bound entry comes back', restore(out, cfg, true).options.entries[0].textColorOn, '[[wled.1.col]]');
const reordered = { ...out, options: { ...out.options, entries: [...out.options.entries].reverse() } };
eq('matched by id after a reorder', restore(reordered, cfg, true).options.entries[0].textColorOn, '[[wled.1.col]]');
eq('bound pair comes back whole', restore(darkView, pairRaw, true).options.iconColor, pairRaw.options.iconColor);
eq(
    'fixed half of the pair comes back whole',
    restore(lightView, pairRaw, false).options.iconColor,
    pairRaw.options.iconColor,
);
const changed = { ...out, options: { ...out.options, iconColor: '#abcdef' } };
eq('a colour the widget changed on purpose sticks', restore(changed, cfg, true).options.iconColor, '#abcdef');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
