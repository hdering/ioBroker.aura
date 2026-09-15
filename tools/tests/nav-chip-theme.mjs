// Zwei gemeldete Lücken der Theme-Einstellungen (#640): die Navigations-Icons
// (Tab- und Bereichsleiste) waren gar nicht einstellbar, und die aktive
// Chip-Farbe wurde vom Akzent überfahren — das Karussell las `--chip-active` nie,
// und die Tönung `var(--chip-active)22` ist nach der Ersetzung ungültiges CSS,
// fiel also lautlos weg.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/nav-chip-theme.mjs
//
// Das Dashboard kommt aus dem Screenshot-Harness, die Variablen werden wie vom
// ThemeProvider auf <html> gesetzt — keine echte Konfiguration, kein Datenpunkt
// wird angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

// Prüffarben — bewusst weit weg von jeder Theme-Farbe, damit ein Treffer eindeutig ist.
const NAV_ICON = 'rgb(255, 0, 0)';
const NAV_ICON_ACTIVE = 'rgb(0, 255, 0)';
const NAV_TEXT = 'rgb(0, 0, 255)';
const NAV_ACTIVE = 'rgb(255, 0, 255)';
const CHIP_ACTIVE = 'rgb(255, 128, 0)';
const NAV_SHADOW = 'rgb(255, 0, 0) 0px 4px 12px 0px';
const VARS = {
    '--nav-icon': NAV_ICON,
    '--nav-active-icon': NAV_ICON_ACTIVE,
    '--nav-text': NAV_TEXT,
    '--nav-active': NAV_ACTIVE,
    '--chip-active': CHIP_ACTIVE,
    '--nav-shadow': '0 4px 12px rgb(255, 0, 0)',
};

const CHECK_DP = 'demo.mode';

const chipsWidget = (id, type, x) => ({
    id,
    type,
    title: id,
    datapoint: '',
    layout: 'default',
    gridPos: { x, y: 0, w: 10, h: 6 },
    options: {
        showTitle: false,
        chipStyle: 'outlined',
        checkDp: CHECK_DP,
        [type === 'chips' ? 'chips' : 'items']: [
            { id: 'a', label: 'Aus', dp: CHECK_DP, value: 'off' },
            { id: 'b', label: 'An', dp: CHECK_DP, value: 'on' },
        ],
    },
});

const LAYOUT = {
    id: 'l-nav',
    name: 'Navigation',
    slug: 'navigation',
    activeSectionId: 'sec-a',
    settings: { layoutDrawerEnabled: true, layoutDrawerPlacement: 'top', layoutDrawerIndicatorStyle: 'underline' },
    sections: [
        {
            id: 'sec-a',
            name: 'Wohnen',
            slug: 'wohnen',
            icon: 'mdi:sofa',
            activeTabId: 't-a1',
            tabs: [
                {
                    id: 't-a1',
                    name: 'Übersicht',
                    slug: 'uebersicht',
                    icon: 'mdi:home',
                    widgets: [
                        chipsWidget('chips-1', 'chips', 0),
                        chipsWidget('carousel-1', 'carousel', 11),
                        {
                            id: 'menu-1',
                            type: 'menu',
                            title: 'Menü',
                            datapoint: '',
                            layout: 'default',
                            gridPos: { x: 22, y: 0, w: 10, h: 6 },
                            options: { menuMode: 'section', showIcons: true, showLabels: true },
                        },
                    ],
                },
                { id: 't-a2', name: 'Details', slug: 'details', icon: 'mdi:cog', widgets: [] },
            ],
        },
        {
            id: 'sec-b',
            name: 'Küche',
            slug: 'kueche',
            icon: 'mdi:silverware',
            activeTabId: 't-b1',
            tabs: [{ id: 't-b1', name: 'Küche', slug: 'kueche', icon: 'mdi:stove', widgets: [] }],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await page.evaluate(() => {
    window.location.hash = '#/view/navigation/s/wohnen';
});
await page.waitForTimeout(900);
// Der zweite Chip ist aktiv. Erst NACH der Navigation mocken (der Remount würde
// den Wert sonst wieder holen) und mockServerState mit, sonst überschreibt der
// nächste getState den gemockten Wert.
await page.evaluate((dp) => {
    window.__auraShot.mockServerState({ [dp]: 'on' });
    window.__auraShot.mock({ [dp]: 'on' });
}, CHECK_DP);
await page.waitForTimeout(900);

/** Die eigenen Overrides — genau das, was der ThemeProvider aus customVars macht. */
const applyVars = (vars) =>
    page.evaluate((v) => {
        for (const [k, val] of Object.entries(v)) document.documentElement.style.setProperty(k, val);
    }, vars);
const clearVars = () =>
    page.evaluate((keys) => {
        for (const k of keys) document.documentElement.style.removeProperty(k);
    }, Object.keys(VARS));

const colorOf = (sel) =>
    page
        .locator(sel)
        .first()
        .evaluate((el) => {
            const cs = getComputedStyle(el);
            return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor };
        });
const countOf = (sel) => page.locator(sel).count();

// ── Ausgangslage: ohne Overrides folgt das Icon dem Text seines Eintrags ──────
const tabIcons = '[data-aura-nav-icon="tab"]';
const sectionIcons = '[data-aura-nav-icon="section"]';
const menuIcons = '[data-aura-nav-icon="menu"]';

check('die Tableiste zeigt Icons', (await countOf(tabIcons)) >= 2, String(await countOf(tabIcons)));
check('die Bereichsleiste zeigt Icons', (await countOf(sectionIcons)) >= 2, String(await countOf(sectionIcons)));
check('das Menü-Widget zeigt Icons', (await countOf(menuIcons)) >= 2, String(await countOf(menuIcons)));

const beforeTab = await colorOf(`${tabIcons}`);
const beforeTabText = await page
    .locator('.aura-tabs [data-aura-nav-icon="tab"]')
    .first()
    .evaluate((el) => getComputedStyle(el.parentElement).color);
check('ohne Override folgt das Tab-Icon dem Tab-Text', beforeTab.color === beforeTabText, beforeTab.color);

// ── Mit Overrides ────────────────────────────────────────────────────────────
await applyVars(VARS);
await page.waitForTimeout(200);

const activeTabIcon = await page
    .locator(`${tabIcons}`)
    .first()
    .evaluate((el) => getComputedStyle(el).color);
const inactiveTabIcon = await page
    .locator(`${tabIcons}`)
    .nth(1)
    .evaluate((el) => getComputedStyle(el).color);
check('das Icon des aktiven Tabs nimmt --nav-active-icon', activeTabIcon === NAV_ICON_ACTIVE, activeTabIcon);
check('das Icon eines inaktiven Tabs nimmt --nav-icon', inactiveTabIcon === NAV_ICON, inactiveTabIcon);

const activeSectionIcon = await page
    .locator(`${sectionIcons}`)
    .first()
    .evaluate((el) => getComputedStyle(el).color);
const inactiveSectionIcon = await page
    .locator(`${sectionIcons}`)
    .nth(1)
    .evaluate((el) => getComputedStyle(el).color);
check(
    'das Icon des aktiven Bereichs nimmt --nav-active-icon',
    activeSectionIcon === NAV_ICON_ACTIVE,
    activeSectionIcon,
);
check('das Icon eines inaktiven Bereichs nimmt --nav-icon', inactiveSectionIcon === NAV_ICON, inactiveSectionIcon);

const activeMenuIcon = await page
    .locator(`${menuIcons}`)
    .first()
    .evaluate((el) => getComputedStyle(el).color);
const inactiveMenuIcon = await page
    .locator(`${menuIcons}`)
    .nth(1)
    .evaluate((el) => getComputedStyle(el).color);
check('das Menü-Widget färbt das aktive Icon mit', activeMenuIcon === NAV_ICON_ACTIVE, activeMenuIcon);
check('das Menü-Widget färbt das inaktive Icon mit', inactiveMenuIcon === NAV_ICON, inactiveMenuIcon);

// Schatten der Navigation — es gab gar keinen, die Leisten trugen nur ihre
// 1px-Linie und lagen damit flach auf einer gleichfarbigen Fläche (#640).
const tabBarShadow = await page
    .locator('.aura-tabs')
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow);
const sectionBarShadow = await page
    .locator('.aura-section-bar')
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow);
check('die Tableiste nimmt --nav-shadow', tabBarShadow === NAV_SHADOW, tabBarShadow);
check('die Bereichsleiste nimmt --nav-shadow', sectionBarShadow === NAV_SHADOW, sectionBarShadow);

// Text der Navigation — vorher fest an --text-secondary / --accent
const inactiveTabColor = await page
    .locator('.aura-tabs [data-aura-nav-icon="tab"]')
    .nth(1)
    .evaluate((el) => getComputedStyle(el.parentElement).color);
check('ein inaktiver Tab nimmt --nav-text', inactiveTabColor === NAV_TEXT, inactiveTabColor);
const inactiveSectionColor = await page
    .locator('.aura-section-bar button')
    .nth(1)
    .evaluate((el) => getComputedStyle(el).color);
check('ein inaktiver Bereich nimmt --nav-text', inactiveSectionColor === NAV_TEXT, inactiveSectionColor);
const activeSectionColor = await page
    .locator('.aura-section-bar button')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
check('der aktive Bereich nimmt --nav-active', activeSectionColor === NAV_ACTIVE, activeSectionColor);

// ── Chips: die aktive Farbe gehört --chip-active, nicht dem Akzent ───────────
const activeChip = await colorOf('[data-aura-widget="chips-1"] button:nth-of-type(2)');
check('der aktive Chip färbt die Schrift mit --chip-active', activeChip.color === CHIP_ACTIVE, activeChip.color);
// Getönt heißt: die Chip-Farbe mit Alpha — nicht durchsichtig (das war der Fehler)
// und auch nicht die Kartenfarbe.
const tinted = (v) => /^color\(srgb 1 0\.50\d+ 0 \/ 0\.\d+\)$/.test(v) || /^rgba\(255, 128, 0, 0\.\d+\)$/.test(v);
check('der aktive Chip tönt seinen Hintergrund (war ungültiges CSS)', tinted(activeChip.bg), activeChip.bg);
check('der aktive Chip tönt seinen Rahmen', tinted(activeChip.border), activeChip.border);

const activeItem = await colorOf('[data-aura-widget="carousel-1"] button:nth-of-type(2)');
check('das Karussell liest --chip-active jetzt auch', activeItem.color === CHIP_ACTIVE, activeItem.color);
check('das Karussell tönt seinen aktiven Eintrag', tinted(activeItem.bg), activeItem.bg);

// Gegenprobe: ohne --chip-active bleibt es beim Akzent.
await clearVars();
await page.waitForTimeout(200);
const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
);
const fallbackChip = await colorOf('[data-aura-widget="chips-1"] button:nth-of-type(2)');
const accentRgb = await page.evaluate((hex) => {
    const d = document.createElement('div');
    d.style.color = hex;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
}, accent);
check('ohne eigene Chip-Farbe gilt weiterhin der Akzent', fallbackChip.color === accentRgb, fallbackChip.color);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nnav-chip-theme: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
