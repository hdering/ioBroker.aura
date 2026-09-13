// Regression cover for issue #573 — where a picked design actually shows up.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/theme-scope.mjs
//
// Two separate failures were reported: a design chosen for a whole LAYOUT never
// reached the frontend (the scoped <style> rule was built from section.settings
// only), and a device that had ever used the header sun/moon button was pinned
// to the plain dark preset for good, because the themeMode datapoint was written
// into the saved themeId and snapped back on every store change.
//
// Runs fully offline: every request to the ioBroker backend is aborted, so the
// seeded localStorage state survives (no remote config load overwrites it) and
// no instance is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const SETTLE_MS = 3000;

const BG = {
    dark: 'rgb(17, 24, 39)',
    light: 'rgb(249, 250, 251)',
    amoled: 'rgb(0, 0, 0)',
    'catppuccin-latte': 'rgb(239, 241, 245)',
    'catppuccin-mocha': 'rgb(30, 30, 46)',
};

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const dashboard = (layoutSettings, sectionSettings) =>
    JSON.stringify({
        state: {
            layouts: [
                {
                    id: 'layout-default',
                    name: 'Tablet',
                    slug: 'default',
                    ...(layoutSettings ? { settings: layoutSettings } : {}),
                    sections: [
                        {
                            id: 'section-1',
                            name: 'Home',
                            slug: 'home',
                            ...(sectionSettings ? { settings: sectionSettings } : {}),
                            tabs: [{ id: 'tab-1', name: 'Dashboard', slug: 'dashboard', widgets: [] }],
                            activeTabId: 'tab-1',
                        },
                    ],
                    activeSectionId: 'section-1',
                },
            ],
            activeLayoutId: 'layout-default',
            editMode: false,
        },
        version: 0,
    });

const browser = await chromium.launch();

/** Render the frontend with a seeded store and report what it actually paints. */
async function render({
    themeId = 'dark',
    mode = null,
    layout,
    section,
    browserDark,
    browserLight,
    follow,
    vars,
    varsLight,
    varsDark,
    userThemes,
    prefersDark = false,
}) {
    const ctx = await browser.newContext({
        viewport: { width: 900, height: 600 },
        ignoreHTTPSErrors: true,
        // The browser sync reads prefers-color-scheme, so a test of the pair has
        // to be able to say which half the device asks for.
        colorScheme: prefersDark ? 'dark' : 'light',
    });
    // No backend: only same-origin dev-server assets are allowed through.
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
        return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
    });
    const page = await ctx.newPage();
    await page.addInitScript(
        ([dash, theme, cachedMode]) => {
            localStorage.setItem('aura-dashboard', dash);
            localStorage.setItem('aura-theme', theme);
            if (cachedMode) localStorage.setItem('aura-theme-mode', cachedMode);
            else localStorage.removeItem('aura-theme-mode');
        },
        [
            dashboard(layout, section),
            JSON.stringify({
                state: {
                    themeId,
                    customVars: vars ?? {},
                    customVarsLight: varsLight ?? {},
                    customVarsDark: varsDark ?? {},
                    userThemes: userThemes ?? [],
                    followBrowser: !!follow,
                    browserDarkThemeId: browserDark ?? 'dark',
                    browserLightThemeId: browserLight ?? 'light',
                },
                version: 0,
            }),
            mode,
        ],
    );
    await page.goto(`${BASE}/view/default`, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);
    const out = await page.evaluate(() => ({
        bg: getComputedStyle(document.querySelector('[data-aura-app="frontend"]')).backgroundColor,
        // The accent is the token the issue is about: with the browser sync on,
        // it could only be right in one of the two themes.
        accent: getComputedStyle(document.querySelector('[data-aura-app="frontend"]'))
            .getPropertyValue('--accent')
            .trim(),
        text: getComputedStyle(document.querySelector('[data-aura-app="frontend"]'))
            .getPropertyValue('--text-primary')
            .trim(),
        // Native chrome (scrollbars, selects, date pickers) follows color-scheme,
        // not our variables — a scoped design has to carry it too.
        scheme: getComputedStyle(document.querySelector('[data-aura-app="frontend"]')).colorScheme,
        // The saved design must survive a mode switch — it used to be overwritten.
        savedThemeId: JSON.parse(localStorage.getItem('aura-theme') || '{}').state?.themeId,
    }));
    await ctx.close();
    return out;
}

// ── Scope cascade ────────────────────────────────────────────────────────────
const global = await render({ themeId: 'dark' });
check('global design paints', global.bg === BG.dark, global.bg);

const layoutScope = await render({ themeId: 'dark', layout: { themeId: 'light' } });
check('layout-scope design paints', layoutScope.bg === BG.light, layoutScope.bg);

const sectionWins = await render({
    themeId: 'dark',
    layout: { themeId: 'light' },
    section: { themeId: 'catppuccin-mocha' },
});
check('section beats layout', sectionWins.bg === BG['catppuccin-mocha'], sectionWins.bg);

const sectionScope = await render({ themeId: 'dark', section: { themeId: 'light' } });
check('section-scope design paints', sectionScope.bg === BG.light, sectionScope.bg);

// ── Native chrome follows the scoped design ──────────────────────────────────
// ThemeProvider sets color-scheme from the GLOBAL design, so a light layout on a
// dark global kept dark scrollbars inside its widgets.
check('global design sets color-scheme', global.scheme === 'dark', global.scheme);
check('layout-scope design sets color-scheme', layoutScope.scheme === 'light', layoutScope.scheme);
check('section-scope design sets color-scheme', sectionScope.scheme === 'light', sectionScope.scheme);

// ── Dark/light mode datapoint ────────────────────────────────────────────────
const darkModeKeepsDark = await render({ themeId: 'catppuccin-mocha', mode: 'dark' });
check('dark mode keeps a dark design', darkModeKeepsDark.bg === BG['catppuccin-mocha'], darkModeKeepsDark.bg);

const darkModeReplacesLight = await render({ themeId: 'catppuccin-latte', mode: 'dark' });
check('dark mode replaces a light design', darkModeReplacesLight.bg === BG.dark, darkModeReplacesLight.bg);

const configuredPair = await render({ themeId: 'catppuccin-latte', mode: 'dark', browserDark: 'amoled' });
check('dark mode uses the configured dark theme', configuredPair.bg === BG.amoled, configuredPair.bg);

const modeKeepsSaved = await render({ themeId: 'catppuccin-latte', mode: 'dark' });
check(
    'mode leaves the saved design alone',
    modeKeepsSaved.savedThemeId === 'catppuccin-latte',
    String(modeKeepsSaved.savedThemeId),
);

const modeOverLayout = await render({ themeId: 'dark', layout: { themeId: 'light' }, mode: 'dark' });
check('mode wins over a layout override', modeOverLayout.bg === BG.dark, modeOverLayout.bg);

const modeMatchesLayout = await render({
    themeId: 'dark',
    layout: { themeId: 'catppuccin-mocha' },
    mode: 'dark',
});
check('mode keeps a matching layout override', modeMatchesLayout.bg === BG['catppuccin-mocha'], modeMatchesLayout.bg);

// ── Own variables per brightness (#640) ──────────────────────────────────────
// The whole point of the issue: "theme follows browser" made both halves share
// ONE set of overrides, so the accent could not differ between light and dark.
const PAIR = { follow: true, browserLight: 'light', browserDark: 'dark' };
const SPLIT = {
    vars: { '--text-primary': '#abcdef' },
    varsLight: { '--accent': '#ff6600' },
    varsDark: { '--accent': '#88ccff' },
};

const lightHalf = await render({ ...PAIR, ...SPLIT, prefersDark: false });
check('the light half paints its own accent', lightHalf.accent === '#ff6600', lightHalf.accent);
check('and is the light design', lightHalf.bg === BG.light, lightHalf.bg);

const darkHalf = await render({ ...PAIR, ...SPLIT, prefersDark: true });
check('the dark half paints its own accent', darkHalf.accent === '#88ccff', darkHalf.accent);
check('and is the dark design', darkHalf.bg === BG.dark, darkHalf.bg);

check(
    'the shared set still reaches both halves',
    lightHalf.text === '#abcdef' && darkHalf.text === '#abcdef',
    `${lightHalf.text} / ${darkHalf.text}`,
);

// Everything saved before the split lives in customVars alone and has to keep
// applying to whatever design is on screen.
const legacyVars = await render({ themeId: 'light', vars: { '--accent': '#123456' } });
check('a set stored before the split still applies', legacyVars.accent === '#123456', legacyVars.accent);

// The mode datapoint switches brightness as well — the halves must follow it,
// not the followBrowser flag.
const modeHalf = await render({ themeId: 'catppuccin-latte', mode: 'dark', ...SPLIT });
check('the dark/light-mode datapoint picks the half too', modeHalf.accent === '#88ccff', modeHalf.accent);

// ── Own themes (#640) ────────────────────────────────────────────────────────
const OWN = [
    { id: 'user-1', name: 'Nacht', dark: true, baseId: 'amoled', vars: { '--accent': '#ff00ff' } },
    { id: 'user-2', name: 'Tag', dark: false, baseId: 'catppuccin-latte', vars: { '--accent': '#00aa00' } },
];

const ownGlobal = await render({ themeId: 'user-1', userThemes: OWN });
check('an own theme paints its base background', ownGlobal.bg === BG.amoled, ownGlobal.bg);
check('and its own accent', ownGlobal.accent === '#ff00ff', ownGlobal.accent);

// The request from the issue, end to end: a fully own design for each half.
const ownPairLight = await render({
    follow: true,
    browserLight: 'user-2',
    browserDark: 'user-1',
    userThemes: OWN,
    prefersDark: false,
});
check('an own theme can be the light half', ownPairLight.bg === BG['catppuccin-latte'], ownPairLight.bg);
check('with its own accent', ownPairLight.accent === '#00aa00', ownPairLight.accent);

const ownPairDark = await render({
    follow: true,
    browserLight: 'user-2',
    browserDark: 'user-1',
    userThemes: OWN,
    prefersDark: true,
});
check('and another own theme the dark half', ownPairDark.bg === BG.amoled, ownPairDark.bg);
check('with its own accent', ownPairDark.accent === '#ff00ff', ownPairDark.accent);
check('native chrome follows an own theme', ownPairDark.scheme === 'dark', ownPairDark.scheme);

// A layout may pick an own theme like any other.
const ownScoped = await render({ themeId: 'dark', layout: { themeId: 'user-2' }, userThemes: OWN });
check('a layout can override with an own theme', ownScoped.bg === BG['catppuccin-latte'], ownScoped.bg);

// A theme that was deleted must not leave the frontend blank.
const ownGone = await render({ themeId: 'user-404', userThemes: [] });
check('a deleted own theme falls back to a shipped one', ownGone.bg === BG.dark, ownGone.bg);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
