// Own themes and per-brightness variables — issue #640.
//
//   node tools/tests/theme-vars.mjs
//
// Two things could not be done before: with "theme follows the browser" the
// SAME custom variables were laid on the light and the dark theme (so the accent
// could only be right in one of them), and a theme of one's own did not exist at
// all — only the shipped presets could be picked for the two halves.
//
// Everything checked here is pure, so it runs without a dev server: the resolver
// that decides which override wins, the registry that makes an own theme
// answerable by getTheme() (which is called from plain functions, outside React),
// and the import/export format.
//
// The cases that matter most are the ones that used to be impossible: the same
// token carrying a different value per brightness, and a half that is EMPTY
// falling back to the shared set instead of to the bare theme.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-theme-vars-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { resolveThemeVars, resolveVar, hasVars, varKeys, VAR_SET_KEYS } from './src-vis/utils/themeVars.ts';",
            "export { serializeThemes, parseThemeFile, uniqueThemeName } from './src-vis/utils/themeIo.ts';",
            "export { THEMES, getTheme, allThemes, themeExists, setUserThemes, materializeUserTheme, isUserThemeId, DEFAULT_THEME_ID } from './src-vis/themes/index.ts';",
            "export { resolveThemeModeId } from './src-vis/utils/themeModeCache.ts';",
        ].join('\n'),
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
    resolveThemeVars,
    resolveVar,
    hasVars,
    varKeys,
    VAR_SET_KEYS,
    serializeThemes,
    parseThemeFile,
    uniqueThemeName,
    THEMES,
    getTheme,
    allThemes,
    themeExists,
    setUserThemes,
    materializeUserTheme,
    isUserThemeId,
    DEFAULT_THEME_ID,
    resolveThemeModeId,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

// ── The resolver ─────────────────────────────────────────────────────────────
const SETS = {
    base: { '--accent': '#111111', '--accent-red': '#990000' },
    light: { '--accent': '#ff6600' },
    dark: { '--accent': '#88ccff', '--text-primary': '#dddddd' },
};

eq('the light half wins on a light theme', resolveThemeVars(false, SETS)['--accent'], '#ff6600');
eq('the dark half wins on a dark theme', resolveThemeVars(true, SETS)['--accent'], '#88ccff');
eq('the shared set reaches both halves', resolveThemeVars(false, SETS)['--accent-red'], '#990000');
eq('a key of one half does not leak into the other', resolveThemeVars(false, SETS)['--text-primary'], undefined);

// Everything stored before #640 sits in `base` alone — it has to keep meaning
// exactly what it meant, for both brightnesses.
const legacy = { base: { '--accent': '#abcdef' } };
eq('a stored set without halves still applies (light)', resolveThemeVars(false, legacy)['--accent'], '#abcdef');
eq('a stored set without halves still applies (dark)', resolveThemeVars(true, legacy)['--accent'], '#abcdef');
eq('nothing configured resolves to nothing', resolveThemeVars(true, undefined), {});

// An EMPTY half must not blank the shared set — that was the tempting
// implementation (`sets[polarity] ?? sets.base`) and it would drop every shared
// colour the moment one half held a single key.
const halfEmpty = { base: { '--accent': '#111111' }, light: {}, dark: { '--accent-green': '#00ff00' } };
eq('an empty half keeps the shared set', resolveThemeVars(false, halfEmpty), { '--accent': '#111111' });
eq('a half adds to the shared set, it does not replace it', resolveThemeVars(true, halfEmpty), {
    '--accent': '#111111',
    '--accent-green': '#00ff00',
});

eq('a single var resolves with the same precedence', resolveVar('--accent', true, SETS), '#88ccff');
eq('a var nobody set is undefined', resolveVar('--nope', true, SETS), undefined);
check('hasVars sees any of the three sets', hasVars({ dark: { '--accent': '#fff' } }) && !hasVars({ base: {} }));
eq('varKeys lists every touched key once', varKeys(SETS).sort(), ['--accent', '--accent-red', '--text-primary']);
eq('the stored keys are the ones a layout carries', VAR_SET_KEYS, {
    base: 'customVars',
    light: 'customVarsLight',
    dark: 'customVarsDark',
});

// ── Own themes ───────────────────────────────────────────────────────────────
const OWN = { id: 'user-1', name: 'Wohnzimmer', dark: true, baseId: 'amoled', vars: { '--accent': '#ff6600' } };

const mat = materializeUserTheme(OWN);
eq('an own theme keeps its own colour', mat.vars['--accent'], '#ff6600');
eq('and takes everything else from its base', mat.vars['--app-bg'], getTheme('amoled').vars['--app-bg']);
eq('it carries its own name and polarity', [mat.id, mat.name, mat.dark], ['user-1', 'Wohnzimmer', true]);

// A base that no longer exists (an import from another installation, a renamed
// preset) must still produce a complete palette — a theme with holes in it
// paints half the dashboard transparent.
const orphan = materializeUserTheme({ ...OWN, baseId: 'does-not-exist' });
eq('an unknown base falls back to a shipped one', orphan.vars['--app-bg'], THEMES[0].vars['--app-bg']);

check('getTheme does not know an own theme before it is registered', getTheme('user-1').id === THEMES[0].id);
setUserThemes([OWN]);
check('getTheme answers for an own theme once registered', getTheme('user-1').name === 'Wohnzimmer');
check('themeExists follows the registry', themeExists('user-1') && !themeExists('user-2'));
eq('built-ins come first, own themes after them', allThemes().length, THEMES.length + 1);
check('an unknown id still falls back to a shipped theme', getTheme('nope').id === THEMES[0].id);
check('own ids are recognisable', isUserThemeId('user-1') && !isUserThemeId('amoled'));

// The whole point of the issue: an own theme can be the dark half of the pair,
// and the mode datapoint must treat it like any other dark design.
eq('a dark own theme stays put in dark mode', resolveThemeModeId('user-1', 'dark', 'dark', 'light'), 'user-1');
eq('and is used when a light design has to give way', resolveThemeModeId('light', 'dark', 'user-1', 'light'), 'user-1');

setUserThemes([]);
check('deregistering removes it again', !themeExists('user-1') && getTheme('user-1').id === THEMES[0].id);
eq(
    'the default theme is a shipped one',
    THEMES.some((t) => t.id === DEFAULT_THEME_ID),
    true,
);

// ── Import / export ──────────────────────────────────────────────────────────
const file = serializeThemes([OWN, { ...OWN, id: 'user-2', name: 'Küche', dark: false, baseId: 'light' }]);
const back = parseThemeFile(file);
eq('an export comes back with both themes', back.length, 2);
eq('the vars survive the round trip', back[0].vars, OWN.vars);
check('ids are not exported — the importing side assigns its own', !('id' in back[0]));
eq('a bare list is accepted too', parseThemeFile(JSON.stringify([OWN])).length, 1);
eq('so is a single theme object', parseThemeFile(JSON.stringify(OWN))[0].name, 'Wohnzimmer');
eq('a file that is not JSON yields nothing', parseThemeFile('nope {'), []);
eq('an entry without a name is dropped', parseThemeFile(JSON.stringify([{ vars: {} }])), []);
// Anything that is not `--var: "string"` is refused: an imported file writes
// straight onto :root, so a nested object or a number has no business there.
eq('a bogus vars block is refused', parseThemeFile(JSON.stringify([{ name: 'x', vars: { color: 'red' } }])), []);
eq('a non-string value is refused', parseThemeFile(JSON.stringify([{ name: 'x', vars: { '--accent': 5 } }])), []);
eq(
    'a missing base is filled in from the polarity',
    parseThemeFile(JSON.stringify([{ name: 'x', dark: true, vars: {} }]))[0].baseId,
    'dark',
);

eq('a free name is kept', uniqueThemeName('Nacht', ['Tag']), 'Nacht');
eq('a taken name is numbered', uniqueThemeName('Nacht', ['Nacht']), 'Nacht 2');
eq('and keeps counting', uniqueThemeName('Nacht', ['Nacht', 'Nacht 2']), 'Nacht 3');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
