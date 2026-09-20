// Admin → Design → Theme: editing the two halves and the user's own themes (#640).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/theme-editor-ui.mjs
//
// The frontend side of the issue has its own cover (theme-scope.mjs asserts what
// actually gets painted). This one is about the editor: while the theme follows
// the browser, the preset grid used to be greyed out and the variable editor
// wrote ONE set of overrides, so "switch to dark and change the accent" was not
// a thing the admin could do at all.
//
// Runs fully offline: every backend request is aborted, so the seeded
// localStorage survives and no ioBroker instance is touched. What the admin
// saved is read back out of localStorage — the store persists there under
// `aura-theme`, which is also what gets synced.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, ignoreHTTPSErrors: true });
await ctx.route('**/*', (route) => {
    const url = route.request().url();
    const backend = /socket\.io|[?&]sid=|\/proxy|\/api\//.test(url);
    return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('dialog', (d) => d.dismiss().catch(() => {}));

await page.addInitScript(() => {
    // The admin is behind a session flag — same bypass the documentation
    // screenshots use, so no password is needed here.
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    localStorage.setItem(
        'aura-theme',
        JSON.stringify({
            state: {
                themeId: 'dark',
                customVars: {},
                customVarsLight: {},
                customVarsDark: {},
                userThemes: [],
                adminThemeId: 'light',
                followBrowser: true,
                browserDarkThemeId: 'dark',
                browserLightThemeId: 'light',
            },
            version: 0,
        }),
    );
});

/** The persisted theme store, as the admin just wrote it. */
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('aura-theme') || '{}').state ?? {});

await page.goto(`${BASE}/#/admin/design?ctx=global&tab=theme`, { waitUntil: 'domcontentloaded' });
const varsCard = page.locator('[data-aura-theme-vars]');
await varsCard.waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(500);

// ── Die Seite öffnet auf der Hälfte, die man gerade sieht ────────────────────
// Sie startete immer auf "Gemeinsam". Wer einmal "Hell" oder "Dunkel" gewählt
// hatte und dann eine Farbe auf der falschen Hälfte setzte, sah nichts davon und
// hielt den Akzent für den Gewinner (#640). Dieser Kontext ist hell.
const activeBrightness = async (card) => {
    for (const s of ['base', 'light', 'dark']) {
        const tab = card.locator(`[data-aura-brightness="${s}"]`);
        if ((await tab.count()) && (await tab.getAttribute('aria-pressed')) === 'true') return s;
    }
    return null;
};
check(
    'der Variablen-Editor startet auf der angezeigten Hälfte',
    (await activeBrightness(varsCard)) === 'light',
    String(await activeBrightness(varsCard)),
);

// ── The preset grid stays usable while the browser sync is on ────────────────
const presets = page.locator('[data-aura-theme-presets]');
check(
    'und die Preset-Auswahl steht auf derselben',
    (await activeBrightness(presets)) === 'light',
    String(await activeBrightness(presets)),
);
check(
    'the preset grid is not disabled any more',
    await presets.locator('[data-aura-theme-preset]').first().isEnabled(),
);

// In pair mode only designs of the shown brightness are offered — a light theme
// as the dark half would make the sync a no-op.
await presets.locator('[data-aura-brightness="dark"]').click();
await page.waitForTimeout(200);
check(
    'the dark tab offers dark designs only',
    (await presets.locator('[data-aura-theme-preset="light"]').count()) === 0,
);
await presets.locator('[data-aura-theme-preset="amoled"]').click();
await page.waitForTimeout(300);
check(
    'picking a design writes the dark half',
    (await stored()).browserDarkThemeId === 'amoled',
    JSON.stringify((await stored()).browserDarkThemeId),
);

await presets.locator('[data-aura-brightness="light"]').click();
await page.waitForTimeout(200);
await presets.locator('[data-aura-theme-preset="catppuccin-latte"]').click();
await page.waitForTimeout(300);
const afterPair = await stored();
check(
    'and the light tab writes the light half',
    afterPair.browserLightThemeId === 'catppuccin-latte',
    afterPair.browserLightThemeId,
);
check('the two halves are independent', afterPair.browserDarkThemeId === 'amoled', afterPair.browserDarkThemeId);

// ── The variable editor writes the half that is shown ────────────────────────
const accent = varsCard.locator('[data-aura-theme-var="--accent"]');
await varsCard.locator('[data-aura-brightness="dark"]').click();
await accent.fill('#88ccff');
await page.waitForTimeout(300);
let s = await stored();
check(
    'an accent set on the dark tab lands in customVarsDark',
    s.customVarsDark?.['--accent'] === '#88ccff',
    JSON.stringify(s.customVarsDark),
);
check('and does not touch the shared set', !s.customVars?.['--accent'], JSON.stringify(s.customVars));

await varsCard.locator('[data-aura-brightness="light"]').click();
await page.waitForTimeout(200);
check('switching tabs shows the other half, not the value just typed', (await accent.inputValue()) === '');
await accent.fill('#ff6600');
await page.waitForTimeout(300);
s = await stored();
check(
    'the light tab writes its own value',
    s.customVarsLight?.['--accent'] === '#ff6600',
    JSON.stringify(s.customVarsLight),
);
check('the dark value survives it', s.customVarsDark?.['--accent'] === '#88ccff', JSON.stringify(s.customVarsDark));

await varsCard.locator('[data-aura-brightness="base"]').click();
await page.waitForTimeout(200);
await varsCard.locator('[data-aura-theme-var="--accent-red"]').fill('#990000');
await page.waitForTimeout(300);
s = await stored();
check(
    'the shared tab writes the set both halves inherit',
    s.customVars?.['--accent-red'] === '#990000',
    JSON.stringify(s.customVars),
);

// A half inherits from the shared set — the placeholder has to show that value,
// otherwise the editor claims a colour the user does not actually get.
await varsCard.locator('[data-aura-brightness="dark"]').click();
await page.waitForTimeout(200);
const inherited = await varsCard.locator('[data-aura-theme-var="--accent-red"]').getAttribute('placeholder');
check('a half shows the shared value as its starting point', inherited === '#990000', String(inherited));

// ── Ein Element erbt von seinem Element, nicht vom Akzent ────────────────────
// Das Icon eines Navigationseintrags folgt der Farbe SEINES Eintrags; der
// Platzhalter zeigte trotzdem den Akzent, also die Farbe zwei Stufen darunter —
// wer "Aktiv" rot machte, las hinter "Icon aktiv" weiter Blau und hielt den
// Akzent für den Gewinner (#640).
await varsCard.locator('[data-aura-theme-var="--nav-active"]').fill('#ff0000');
await page.waitForTimeout(300);
const iconPlaceholder = await varsCard.locator('[data-aura-theme-var="--nav-active-icon"]').getAttribute('placeholder');
check(
    'das aktive Icon zeigt die aktive Navigationsfarbe als Vorgabe',
    iconPlaceholder === '#ff0000',
    String(iconPlaceholder),
);
await varsCard.locator('[data-aura-theme-var="--nav-active"]').fill('');
await page.waitForTimeout(300);
const iconFallback = await varsCard.locator('[data-aura-theme-var="--nav-active-icon"]').getAttribute('placeholder');
check('ohne eigene Navigationsfarbe bleibt es beim Akzent', iconFallback === '#88ccff', String(iconFallback));

// Die Navigation steht jetzt weit oben — vor den einzelnen Bedienelementen.
const groupOrder = await varsCard.locator('.grid > div > p').allTextContents();
check(
    'die Navigation steht vor den Bedienelementen',
    groupOrder.findIndex((g) => /Navigation/i.test(g)) < groupOrder.findIndex((g) => /Schalter|Switch/i.test(g)),
    groupOrder.join(' | '),
);

// ── Beide Hell/Dunkel-Schalter meinen dieselbe Hälfte ────────────────────────
// Oben (Presets) und unten (Variablen) standen unabhängig voneinander — wer oben
// umschaltete, bearbeitete unten weiter die andere Hälfte.
await presets.locator('[data-aura-brightness="light"]').click();
await page.waitForTimeout(250);
check(
    'the preset tab moves the variable editor with it',
    (await accent.inputValue()) === '#ff6600',
    await accent.inputValue(),
);
await varsCard.locator('[data-aura-brightness="dark"]').click();
await page.waitForTimeout(250);
check(
    'and the variable tab moves the preset grid with it',
    (await presets.locator('[data-aura-theme-preset="light"]').count()) === 0,
);

// ── Own themes ───────────────────────────────────────────────────────────────
// Gespeichert wird die Hälfte, die bearbeitet wird — NICHT die, die der Admin-
// Browser gerade zeigt (dieser Kontext ist hell, bearbeitet wird dunkel).
// "Meine Themes" is a group of its own now (first band, Global) - switch the tab.
await page.locator('[data-testid="design-tab-mythemes"]').click();
await page.waitForTimeout(400);
const mine = page.locator('[data-aura-my-themes]');
check(
    'the card says which half it would save',
    ((await mine.locator('[data-aura-save-target]').textContent()) ?? '').includes('AMOLED'),
    (await mine.locator('[data-aura-save-target]').textContent()) ?? '',
);
await mine.locator('[data-aura-save-theme]').click();
await page.waitForTimeout(400);
s = await stored();
check('saving the current look creates an own theme', (s.userThemes ?? []).length === 1, JSON.stringify(s.userThemes));
const own = (s.userThemes ?? [])[0] ?? {};
check('saving takes the edited half, not the admin browser', own.dark === true, JSON.stringify(own));
check('it carries the variables that were on screen', own.vars?.['--accent'] === '#88ccff', JSON.stringify(own.vars));
check('and remembers the preset it is built on', own.baseId === 'amoled', String(own.baseId));

// Back to the presets for the checks below.
await page.locator('[data-testid="design-tab-theme"]').click();
await varsCard.waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(300);

// The point of the issue: the own theme can now be picked as one of the halves.
await presets.locator(`[data-aura-brightness="${own.dark ? 'dark' : 'light'}"]`).click();
await page.waitForTimeout(200);
check(
    'an own theme shows up in the preset grid',
    (await presets.locator(`[data-aura-theme-preset="${own.id}"]`).count()) === 1,
);
await presets.locator(`[data-aura-theme-preset="${own.id}"]`).click();
await page.waitForTimeout(300);
s = await stored();
check(
    'and can be used as a half of the browser pair',
    (own.dark ? s.browserDarkThemeId : s.browserLightThemeId) === own.id,
    `${s.browserLightThemeId} / ${s.browserDarkThemeId}`,
);

// Deleting the theme in use must not leave the dashboard pointing at nothing.
await page.locator('[data-testid="design-tab-mythemes"]').click();
await page.waitForTimeout(400);
await mine.locator('[data-aura-delete-theme]').first().click();
await mine.locator('[data-aura-confirm-delete-theme]').first().click();
await page.waitForTimeout(400);
s = await stored();
check('deleting removes it again', (s.userThemes ?? []).length === 0);
check(
    'and the half it was used for falls back to a shipped design',
    (own.dark ? s.browserDarkThemeId : s.browserLightThemeId) !== own.id,
    `${s.browserLightThemeId} / ${s.browserDarkThemeId}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

// ── Dieselbe Startwahl aus den anderen beiden Quellen ────────────────────────
// Die angezeigte Helligkeit kommt aus drei Ecken: dem Hell/Dunkel-Datenpunkt
// (gecacht, weil der Admin außerhalb von <App/> läuft), der Browser-Kopplung und
// sonst der Polarität des eingestellten Designs.
async function startsOn({ colorScheme, follow, themeId, cachedMode }) {
    const c = await browser.newContext({ viewport: { width: 1500, height: 1100 }, colorScheme });
    await c.route('**/*', (route) => {
        const url = route.request().url();
        const backend = /socket\.io|[?&]sid=|\/proxy|\/api\//.test(url);
        return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
    });
    const p = await c.newPage();
    await p.addInitScript(
        ([follow, themeId, cachedMode]) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            localStorage.setItem(
                'aura-theme',
                JSON.stringify({
                    state: {
                        themeId,
                        customVars: {},
                        customVarsLight: {},
                        customVarsDark: {},
                        userThemes: [],
                        adminThemeId: 'light',
                        followBrowser: follow,
                        browserDarkThemeId: 'dark',
                        browserLightThemeId: 'light',
                    },
                    version: 0,
                }),
            );
            if (cachedMode) localStorage.setItem('aura-theme-mode', cachedMode);
            else localStorage.removeItem('aura-theme-mode');
        },
        [follow, themeId, cachedMode ?? null],
    );
    await p.goto(`${BASE}/#/admin/design?ctx=global&tab=theme`, { waitUntil: 'domcontentloaded' });
    const card = p.locator('[data-aura-theme-vars]');
    await card.waitFor({ state: 'visible', timeout: 30000 });
    await p.waitForTimeout(600);
    const out = await activeBrightness(card);
    await c.close();
    return out;
}

const darkBrowser = await startsOn({ colorScheme: 'dark', follow: true, themeId: 'dark' });
check('ein dunkler Browser öffnet auf der dunklen Hälfte', darkBrowser === 'dark', String(darkBrowser));

const modeDp = await startsOn({ colorScheme: 'light', follow: false, themeId: 'light', cachedMode: 'dark' });
check('der Hell/Dunkel-Datenpunkt schlägt den Browser', modeDp === 'dark', String(modeDp));

const single = await startsOn({ colorScheme: 'dark', follow: false, themeId: 'light' });
check('ohne zweite Helligkeit bleibt es beim gemeinsamen Satz', single === null, String(single));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
