// Colours that differ between the light and the dark theme (#689):
//
//   node tools/tests/dual-color.mjs
//
// No dev server needed — the pair lives inside the value (`light-dark(a, b)`) and
// everything that matters about it is pure, so src-vis/utils/dualColor.ts is
// bundled with esbuild and exercised directly.
//
// What this guards, beyond the obvious parsing:
//   * a half may itself contain commas (`rgb(1, 2, 3)`), so the split counts
//     parentheses instead of using String.split,
//   * two equal halves are never stored as a pair,
//   * resolveDualDeep returns the INPUT REFERENCE when nothing changed — the
//     editor-drop work depends on a stable options blob,
//   * restoreDualDeep puts pairs back on the widget's write path, which is the
//     one failure mode that would silently destroy the other colour.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-dual-color-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { isDualColor, parseDual, makeDual, pickDual, splitDual, resolveDualDeep, restoreDualDeep } from './src-vis/utils/dualColor.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { isDualColor, parseDual, makeDual, pickDual, splitDual, resolveDualDeep, restoreDualDeep } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ── recognising a pair ────────────────────────────────────────────────────
check('a pair is recognised', isDualColor('light-dark(#111111, #eeeeee)'));
check('whitespace and case do not matter', isDualColor('  LIGHT-DARK( #111 , #eee ) '));
check('a plain hex is not a pair', isDualColor('#112233') === false);
check('a token is not a pair', isDualColor('var(--accent)') === false);
check('undefined is not a pair', isDualColor(undefined) === false);
// HTML and templates are strings too — only a value that is ENTIRELY the call counts,
// otherwise the html widget's markup would be rewritten.
check(
    'html that merely mentions the syntax is not a pair',
    isDualColor('<b style="color:light-dark(#111,#eee)">hi</b>') === false,
);
check('a call without a second half is not a pair', isDualColor('light-dark(#111111)') === false);

eq('both halves come back', parseDual('light-dark(#111111, #eeeeee)'), { light: '#111111', dark: '#eeeeee' });
eq('a half may be a token', parseDual('light-dark(var(--accent), #eeeeee)'), {
    light: 'var(--accent)',
    dark: '#eeeeee',
});
// The reason the split counts parentheses: rgb() and color-mix() carry commas.
eq('a half may contain commas', parseDual('light-dark(rgb(1, 2, 3), rgba(4, 5, 6, 0.5))'), {
    light: 'rgb(1, 2, 3)',
    dark: 'rgba(4, 5, 6, 0.5)',
});
eq('color-mix survives as a half', parseDual('light-dark(color-mix(in srgb, #fff 50%, #000), #123456)'), {
    light: 'color-mix(in srgb, #fff 50%, #000)',
    dark: '#123456',
});
check('a plain colour parses as null', parseDual('#112233') === null);

// ── building a value ──────────────────────────────────────────────────────
check('two colours make a pair', makeDual('#111111', '#eeeeee') === 'light-dark(#111111, #eeeeee)');
// The pair syntax costs a longer value, a resolve step and a line in the docs —
// it buys nothing while both sides agree.
check('two equal colours stay one colour', makeDual('#111111', '#111111') === '#111111');
check('equality ignores case', makeDual('#AABBCC', '#aabbcc') === '#AABBCC');
check('an empty half falls back to the other', makeDual('', '#eeeeee') === '#eeeeee');
check('an empty dark half falls back to light', makeDual('#111111', '') === '#111111');

// ── picking a half ────────────────────────────────────────────────────────
check('light picks the first', pickDual('light-dark(#111111, #eeeeee)', false) === '#111111');
check('dark picks the second', pickDual('light-dark(#111111, #eeeeee)', true) === '#eeeeee');
check('a plain colour passes through', pickDual('#112233', true) === '#112233');
check('a token passes through untouched', pickDual('var(--accent)', true) === 'var(--accent)');

eq('splitDual reports a pair', splitDual('light-dark(#111111, #eeeeee)'), {
    light: '#111111',
    dark: '#eeeeee',
    isPair: true,
});
eq('splitDual doubles a single colour', splitDual('#112233'), { light: '#112233', dark: '#112233', isPair: false });

// ── resolving a whole config ──────────────────────────────────────────────
const config = {
    id: 'w1',
    type: 'switch',
    title: 'Lampe',
    options: {
        iconColor: 'light-dark(#1e3a8a, #93c5fd)',
        color: '#ff0000',
        icon: 'lucide:zap',
        cells: [
            { id: 'c1', color: 'light-dark(#000000, #ffffff)' },
            { id: 'c2', color: 'var(--accent)' },
        ],
        thresholds: { warn: { color: 'light-dark(#aa0000, #ff8888)' } },
        count: 3,
        enabled: true,
        nothing: null,
    },
};
const light = resolveDualDeep(config, false);
const dark = resolveDualDeep(config, true);
check('top-level option resolves light', light.options.iconColor === '#1e3a8a');
check('top-level option resolves dark', dark.options.iconColor === '#93c5fd');
check('a nested array entry resolves', dark.options.cells[0].color === '#ffffff');
check('a nested object entry resolves', dark.options.thresholds.warn.color === '#ff8888');
check('a plain colour is untouched', dark.options.color === '#ff0000');
check('a token is untouched', dark.options.cells[1].color === 'var(--accent)');
check('non-strings survive', dark.options.count === 3 && dark.options.enabled === true);
check('null survives', dark.options.nothing === null);
check('the original is not mutated', config.options.iconColor === 'light-dark(#1e3a8a, #93c5fd)');

// Identity is the point: WidgetFrame feeds this into a useMemo whose consumers are
// memoised on it. A fresh object per render re-renders every card on the tab.
const plain = { id: 'w2', options: { color: '#ff0000', cells: [{ color: '#00ff00' }] } };
check('nothing to resolve returns the same reference', resolveDualDeep(plain, true) === plain);
check('an untouched branch keeps its reference', dark.options.cells[1] === config.options.cells[1]);
check('a touched branch is a copy', dark.options.cells[0] !== config.options.cells[0]);

// ── the write path ────────────────────────────────────────────────────────
// A widget body spreads the config it was HANDED (the resolved one). Without
// restoreDualDeep a cell drag would write today's half back over the pair.
const written = { ...dark, options: { ...dark.options, cells: [...dark.options.cells].reverse() } };
const restored = restoreDualDeep(written, config);
// Dragging a cell reorders the array — position alone would hand the pair to the
// wrong entry, so entries with an `id` are matched on it.
check('a dragged cell keeps its own pair', restored.options.cells[1].color === 'light-dark(#000000, #ffffff)');
check('and the other cell keeps its token', restored.options.cells[0].color === 'var(--accent)');
// Without an id there is nothing to match on but the position. Documented limit:
// an unidentified list that the BODY reorders loses the pair rather than guessing.
const noId = { options: { list: [{ color: 'light-dark(#000000, #ffffff)' }, { color: '#123456' }] } };
const noIdWritten = { options: { list: [...resolveDualDeep(noId, true).options.list].reverse() } };
check(
    'an id-less list falls back to the index',
    restoreDualDeep(noIdWritten, noId).options.list[0].color === '#123456',
);
const untouched = restoreDualDeep(dark, config);
check('an untouched write restores every pair', untouched.options.iconColor === 'light-dark(#1e3a8a, #93c5fd)');
check('and the nested one too', untouched.options.thresholds.warn.color === 'light-dark(#aa0000, #ff8888)');
// A colour the body genuinely set to something else is NOT a half of the pair.
const changed = { ...dark, options: { ...dark.options, iconColor: '#00ff00' } };
check(
    'a deliberately different colour is left alone',
    restoreDualDeep(changed, config).options.iconColor === '#00ff00',
);
check('nothing to restore returns the same reference', restoreDualDeep(plain, plain) === plain);
// The light half written back must restore just as well as the dark one — the user
// may have been on either theme while dragging.
check(
    'the light half restores too',
    restoreDualDeep(resolveDualDeep(config, false), config).options.iconColor === 'light-dark(#1e3a8a, #93c5fd)',
);

// A config key that is new in `next` has no counterpart in `raw` — must not throw.
const withNew = { ...dark, options: { ...dark.options, brandNew: 'light-dark(#1, #2)' } };
check('a key unknown to raw survives', restoreDualDeep(withNew, config).options.brandNew === 'light-dark(#1, #2)');

console.log(failed === 0 ? '\nAll dual-colour checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed ? 1 : 0);
