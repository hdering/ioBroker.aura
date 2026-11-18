// Tabs als Unterpunkte im Bereichs-Menü (#951).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/drawer-tabs.mjs
//
// layoutDrawerTabs: 'off' | 'collapsible' | 'expanded', ein Bereich kann per
// section.settings abweichen. Ab zwei sichtbaren Tabs; hidden-Tabs fehlen; der
// aktive Bereich ist aufgeklappt; ein Tipp auf einen Tab springt direkt dorthin.
//
// Läuft offline, fasst keine Instanz an.
/* global window */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const tab = (id, name, extra = {}) => ({ id, name, slug: id, widgets: [], ...extra });
const dashboard = (section3Settings) =>
    JSON.stringify({
        state: {
            layouts: [
                {
                    id: 'layout-default',
                    name: 'Tablet',
                    slug: 'default',
                    sections: [
                        {
                            id: 'eg',
                            name: 'Erdgeschoss',
                            slug: 'eg',
                            tabs: [
                                tab('wohnen', 'Wohnen'),
                                tab('kueche', 'Küche'),
                                tab('geheim', 'Geheim', { hidden: true }),
                            ],
                            activeTabId: 'wohnen',
                        },
                        {
                            id: 'og',
                            name: 'Obergeschoss',
                            slug: 'og',
                            tabs: [tab('bad', 'Bad'), tab('schlafen', 'Schlafen')],
                            activeTabId: 'bad',
                        },
                        {
                            id: 'keller',
                            name: 'Keller',
                            slug: 'keller',
                            tabs: [tab('k1', 'Werkstatt'), tab('k2', 'Heizraum')],
                            activeTabId: 'k1',
                            settings: section3Settings,
                        },
                        {
                            id: 'garten',
                            name: 'Garten',
                            slug: 'garten',
                            tabs: [tab('g1', 'Übersicht')],
                            activeTabId: 'g1',
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

async function open(mode, section3Settings, hash = '#/') {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
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
                layoutDrawerEnabled: true,
                layoutDrawerPlacement: 'sidebar',
                layoutDrawerWidth: 260,
                ...(mode ? { layoutDrawerTabs: mode } : {}),
            },
        },
        version: 0,
    });
    await page.addInitScript(
        ([dash, cfg]) => {
            localStorage.setItem('aura-dashboard', dash);
            localStorage.setItem('aura-config', cfg);
        },
        [dashboard(section3Settings), config],
    );
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Obergeschoss', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    return { ctx, page };
}

const tabIds = (page) =>
    page.$$eval('aside [data-aura-drawer-tab]', (els) => els.map((e) => e.getAttribute('data-aura-drawer-tab')));

// ── off (Standard) ─────────────────────────────────────────────────────────────
{
    const { ctx, page } = await open(undefined);
    check('off: keine Tab-Einträge', (await tabIds(page)).length === 0);
    check('off: kein Aufklapp-Pfeil', (await page.locator('aside [data-aura-drawer-fold]').count()) === 0);
    await ctx.close();
}

// ── collapsible ───────────────────────────────────────────────────────────────
{
    const { ctx, page } = await open('collapsible', { layoutDrawerTabs: 'off' });
    const ids = await tabIds(page);
    check('collapsible: aktiver Bereich aufgeklappt, hidden fehlt', ids.join(',') === 'wohnen,kueche', ids.join(','));
    const folds = await page.$$eval('aside [data-aura-drawer-fold]', (els) =>
        els.map((e) => `${e.getAttribute('data-aura-drawer-fold')}:${e.getAttribute('aria-expanded')}`),
    );
    // Keller per Bereichs-Override aus, Garten hat nur einen Tab → nur EG und OG haben Pfeile.
    check('collapsible: Pfeile nur bei EG und OG', folds.join(',') === 'eg:true,og:false', folds.join(','));

    const activeTab = await page.getAttribute(
        'aside [data-aura-drawer-tab][aria-current="page"]',
        'data-aura-drawer-tab',
    );
    check('collapsible: aktiver Tab markiert', activeTab === 'wohnen', String(activeTab));

    await page.click('aside [data-aura-drawer-fold="og"]');
    check(
        'collapsible: OG aufklappen zeigt dessen Tabs',
        (await tabIds(page)).join(',') === 'wohnen,kueche,bad,schlafen',
    );
    await page.click('aside [data-aura-drawer-fold="eg"]');
    check('collapsible: EG zuklappen', (await tabIds(page)).join(',') === 'bad,schlafen');

    await page.click('aside [data-aura-drawer-tab="schlafen"]');
    await page
        .waitForFunction(() => window.location.hash.includes('/s/og/tab/schlafen'), null, { timeout: 5000 })
        .catch(() => {});
    const hash = await page.evaluate(() => window.location.hash);
    check('collapsible: Tipp auf Tab navigiert direkt', hash.includes('/s/og/tab/schlafen'), hash);
    await page.waitForTimeout(300);
    const active2 = await page.getAttribute(
        'aside [data-aura-drawer-tab][aria-current="page"]',
        'data-aura-drawer-tab',
    );
    check('collapsible: neuer Tab aktiv', active2 === 'schlafen', String(active2));
    await ctx.close();
}

// ── expanded + Bereichs-Override ──────────────────────────────────────────────
{
    const { ctx, page } = await open('expanded', { layoutDrawerTabs: 'collapsible' });
    const ids = await tabIds(page);
    // EG + OG offen, Keller (Override collapsible, nicht aktiv) zu, Garten ohne Unterpunkte.
    check('expanded: alle offen außer Override', ids.join(',') === 'wohnen,kueche,bad,schlafen', ids.join(','));
    const folds = await page.$$eval('aside [data-aura-drawer-fold]', (els) =>
        els.map((e) => e.getAttribute('data-aura-drawer-fold')),
    );
    check('expanded: Pfeil nur beim Override-Bereich', folds.join(',') === 'keller', folds.join(','));
    await ctx.close();
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
