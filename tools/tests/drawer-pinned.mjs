// Fixierter Hamburger des Bereichs-Menüs in der Tab-Leiste (layoutDrawerPinned).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/drawer-pinned.mjs
//
// Handy-Breite, Platzierung „In Tab-Leiste“, viele Tabs, ein Tab ganz hinten aktiv:
// ohne Option scrollt der Hamburger mit den Tabs aus dem Bild, mit Option bleibt er
// am linken Rand stehen und öffnet weiterhin das Menü. Gilt für die einfache Leiste
// und die Raster-Leiste. Bei zentrierten/rechten Tabs steht der Hamburger immer
// fest, und die ersten Tabs bleiben per Scrollen erreichbar.
//
// Läuft offline, fasst keine Instanz an.
/* global window, document */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const tabs = Array.from({ length: 12 }, (_, i) => ({
    id: `t${i}`,
    name: `Raum Nummer ${i + 1}`,
    slug: `t${i}`,
    widgets: [],
}));
const dashboard = (tabBar) =>
    JSON.stringify({
        state: {
            layouts: [
                {
                    id: 'layout-default',
                    name: 'Handy',
                    slug: 'default',
                    settings: tabBar ? { tabBar } : undefined,
                    sections: [
                        { id: 'eg', name: 'Erdgeschoss', slug: 'eg', tabs, activeTabId: 't0' },
                        {
                            id: 'og',
                            name: 'Obergeschoss',
                            slug: 'og',
                            tabs: [{ id: 'o1', name: 'Bad', slug: 'o1', widgets: [] }],
                            activeTabId: 'o1',
                        },
                    ],
                    activeSectionId: 'eg',
                },
            ],
            activeLayoutId: 'layout-default',
            editMode: false,
        },
        version: 0,
    });

const browser = await chromium.launch();
const pageErrors = [];

async function open(pinned, tabBar) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 800 },
        hasTouch: true,
        isMobile: true,
        ignoreHTTPSErrors: true,
    });
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
        return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const config = JSON.stringify({
        state: {
            frontend: {
                showHeader: false,
                layoutDrawerEnabled: true,
                layoutDrawerPlacement: 'floating',
                layoutDrawerMobilePlacement: 'tabbar',
                ...(pinned ? { layoutDrawerPinned: true } : {}),
            },
        },
        version: 0,
    });
    await page.addInitScript(
        ([dash, cfg]) => {
            localStorage.setItem('aura-dashboard', dash);
            localStorage.setItem('aura-config', cfg);
        },
        [dashboard(tabBar), config],
    );
    await page.goto(`${BASE}/#/tab/t11`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Raum Nummer 12', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    // ScrollRow centres the active tab after layout.
    await page.waitForTimeout(600);
    return { ctx, page };
}

// Wirklich zu sehen = der Punkt in der Mitte trifft das Element selbst (Überlauf-
// Clipping der Scroll-Zonen zählt mit, das prüft isVisible() nicht).
async function onScreen(locator) {
    return locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= 0 || r.left >= window.innerWidth) {
            return false;
        }
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (hit === el || el.contains(hit));
    });
}
const burger = (page) => page.locator('.aura-tabs button[aria-label]').first();
const tabLabel = (page, n) => page.getByText(`Raum Nummer ${n}`, { exact: true }).first();
const scrollTabsToStart = (page) =>
    page.$$eval('.aura-tabs .aura-scroll', (els) => els.forEach((e) => (e.scrollLeft = 0)));

const clock = { id: 'clk', type: 'clock', clockDisplay: 'time', position: 'right' };
for (const [label, tabBar, scrollsAway] of [
    ['einfach', undefined, true],
    // Linke Tabs + Element rechts = Raster-Leiste, Hamburger und Tabs teilen Zone 1.
    ['Raster links', { items: [clock] }, true],
    // Zentrierte / rechte Tabs: Hamburger steht immer fest – Zone 1 wurde dort von
    // überlaufenden Tabs auf 0 px gedrückt und schnitt ihn komplett ab.
    ['zentriert', { tabsAlignment: 'center' }, false],
    ['rechts', { tabsAlignment: 'right' }, false],
]) {
    {
        const { ctx, page } = await open(false, tabBar);
        check(`${label}, ohne Option: aktiver Tab sichtbar`, await onScreen(tabLabel(page, 12)));
        if (scrollsAway) {
            check(`${label}, ohne Option: Hamburger scrollt mit weg`, !(await onScreen(burger(page))));
        }
        await scrollTabsToStart(page);
        await page.waitForTimeout(150);
        check(`${label}, ohne Option: ganz links Hamburger sichtbar`, await onScreen(burger(page)));
        check(`${label}, ohne Option: ganz links erster Tab sichtbar`, await onScreen(tabLabel(page, 1)));
        await ctx.close();
    }
    {
        const { ctx, page } = await open(true, tabBar);
        check(`${label}, mit Option: Hamburger sichtbar`, await onScreen(burger(page)));
        check(`${label}, mit Option: Pin-Container da`, (await page.locator('.aura-tabs-pinned').count()) === 1);
        check(`${label}, mit Option: aktiver Tab sichtbar`, await onScreen(tabLabel(page, 12)));
        await page.locator('.aura-tabs-pinned button').first().click();
        const menuOpen = await page
            .getByText('Obergeschoss', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false);
        check(`${label}, mit Option: Hamburger öffnet Menü`, menuOpen);
        await ctx.close();
    }
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
