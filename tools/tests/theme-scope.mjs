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
async function render({ themeId = 'dark', mode = null, layout, section, browserDark, browserLight, follow }) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, ignoreHTTPSErrors: true });
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
                    customVars: {},
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

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
