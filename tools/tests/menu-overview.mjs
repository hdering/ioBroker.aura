// Verifies the Menü widget's overview mode (issue #669) in a real browser against
// the dev server.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5174
//   node tools/tests/menu-overview.mjs
//
// The overview is the one menu mode that reaches across sections: every visible
// section becomes a group, its tabs become chips, and a chip navigates to a tab
// in ANOTHER section — which the section/tab modes never do. So the checks are
// about exactly that: the groups and chips that appear (hidden ones must not), the
// hash a click lands on (with and without the /s/<section> segment), the active
// chip, the search filter, and the "all layouts" source.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WID = 'menu-overview-test';
const SEL = `.aura-widget-${WID}`;

const tabs = (names, extra = {}) =>
    names.map((n) => ({ id: `tab-${n.toLowerCase()}`, name: n, slug: n.toLowerCase(), widgets: [], ...extra }));

const menu = (options) => ({
    id: WID,
    type: 'menu',
    title: 'Übersicht',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 10 },
    options: { menuMode: 'overview', ...options },
});

/** Two-section layout; the menu sits on the first tab of the first section. */
const layout = (options) => ({
    id: 'lay-test',
    name: 'Zuhause',
    slug: 'zuhause',
    activeSectionId: 'sec-wohnen',
    sections: [
        {
            id: 'sec-wohnen',
            name: 'Wohnen',
            slug: 'wohnen',
            icon: 'lucide:sofa',
            activeTabId: 'tab-start',
            tabs: [
                { id: 'tab-start', name: 'Start', slug: 'start', widgets: [menu(options)] },
                ...tabs(['Licht', 'Heizung']),
                // A hidden tab never appears, whatever the mode.
                ...tabs(['Geheim'], { hidden: true }),
            ],
        },
        {
            id: 'sec-technik',
            name: 'Technik',
            slug: 'technik',
            icon: 'lucide:cog',
            activeTabId: 'tab-server',
            tabs: tabs(['Server', 'Netzwerk']),
        },
        // A hidden section never appears either.
        {
            id: 'sec-hidden',
            name: 'Versteckt',
            slug: 'versteckt',
            hidden: true,
            activeTabId: 'tab-x',
            tabs: tabs(['X']),
        },
    ],
});

/** A second layout with a single section: its tab URLs carry no /s/ segment. */
const GARAGE = {
    id: 'lay-garage',
    name: 'Garage',
    slug: 'garage',
    activeSectionId: 'sec-garage',
    sections: [
        {
            id: 'sec-garage',
            name: 'Anzeige',
            slug: 'anzeige',
            activeTabId: 'tab-status',
            tabs: tabs(['Status', 'PV']),
        },
    ],
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function open(options, layouts = [layout(options)]) {
    // A fresh document per case: a goto to the SAME hash URL leaves the old document
    // (and the widget's search text) in place, and hash-only navigation keeps state.
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/view/zuhause/s/wohnen/tab/start`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    await page.evaluate((ls) => window.__auraShot.seed({ layouts: ls, activeLayoutId: ls[0].id }), layouts);
    await page.waitForSelector(`${SEL} [data-menu-overview]`, { timeout: 10000 });
    await page.waitForTimeout(300);
}

const groups = () => page.$$eval(`${SEL} [data-menu-group]`, (els) => els.map((e) => e.dataset.menuGroup));
const chips = () => page.$$eval(`${SEL} [data-menu-item]`, (els) => els.map((e) => e.dataset.menuItem));
const activeChips = () =>
    page.$$eval(`${SEL} [data-menu-item][data-active]`, (els) => els.map((e) => e.dataset.menuItem));
const hash = () => page.evaluate(() => location.hash);
const chipIn = (group, item) => page.locator(`${SEL} [data-menu-group="${group}"] [data-menu-item="${item}"]`);

// ── groups & chips ───────────────────────────────────────────────────────────
await open({});
let g = await groups();
check('one group per visible section, in layout order', JSON.stringify(g) === '["wohnen","technik"]', g.join(','));
let c = await chips();
check(
    'the chips are the visible tabs of every section',
    JSON.stringify(c) === '["start","licht","heizung","server","netzwerk"]',
    c.join(','),
);
check('a hidden tab is not a chip', !c.includes('geheim'));
check('a hidden section is not a group', !g.includes('versteckt'));
let a = await activeChips();
check('the tab on screen is the only active chip', JSON.stringify(a) === '["start"]', a.join(','));
const titles = await page.$$eval(`${SEL} [data-menu-group] > div:first-child span`, (els) =>
    els.map((e) => e.textContent),
);
check(
    'group titles carry the section names',
    titles.includes('Wohnen') && titles.includes('Technik'),
    titles.join(','),
);

// ── navigation across sections ───────────────────────────────────────────────
await chipIn('technik', 'server').click();
await page.waitForTimeout(400);
let h = await hash();
check(
    'a chip of another section navigates there, with the /s/ segment',
    h === '#/view/zuhause/s/technik/tab/server',
    h,
);

// ── active chip follows the URL ──────────────────────────────────────────────
// The menu lives on Wohnen/Start, so go back there and open Heizung via a chip.
await open({});
await chipIn('wohnen', 'heizung').click();
await page.waitForTimeout(400);
h = await hash();
check('a chip of the own section navigates within it', h === '#/view/zuhause/s/wohnen/tab/heizung', h);

// ── group title off / hiddenItems ────────────────────────────────────────────
await open({ groupTitle: 'none', hiddenItems: ['technik'] });
g = await groups();
check('hiddenItems drops a whole section group', JSON.stringify(g) === '["wohnen"]', g.join(','));
const titleCount = await page.$$eval(`${SEL} [data-menu-group] .uppercase`, (els) => els.length);
check('groupTitle "none" renders no group title', titleCount === 0, String(titleCount));

// ── search ───────────────────────────────────────────────────────────────────
await open({ showSearch: true });
const search = page.locator(`${SEL} [data-menu-search]`);
check('the search field is shown when showSearch is on', (await search.count()) === 1);
await search.fill('netz');
await page.waitForTimeout(200);
c = await chips();
g = await groups();
check('the search leaves only matching chips', JSON.stringify(c) === '["netzwerk"]', c.join(','));
check('and drops groups without a hit', JSON.stringify(g) === '["technik"]', g.join(','));
await search.fill('wohn');
await page.waitForTimeout(200);
c = await chips();
check(
    'a hit on the section name keeps all of its tabs',
    JSON.stringify(c) === '["start","licht","heizung"]',
    c.join(','),
);
await search.fill('xyz');
await page.waitForTimeout(200);
const noMatch = await page
    .locator(SEL)
    .getByText(/Keine Treffer|No matches/)
    .count();
check('no hit shows the no-match hint', noMatch === 1 && (await chips()).length === 0);
await open({});
check('without showSearch there is no search field', (await page.locator(`${SEL} [data-menu-search]`).count()) === 0);

// ── all layouts ──────────────────────────────────────────────────────────────
await open({ menuSource: 'all' }, [layout({ menuSource: 'all' }), GARAGE]);
g = await groups();
check(
    'menuSource "all" adds the sections of the other layouts',
    JSON.stringify(g) === '["wohnen","technik","anzeige"]',
    g.join(','),
);
const headings = await page.$$eval(`${SEL} [data-menu-layout]`, (els) => els.map((e) => e.textContent));
check('each layout gets a heading', JSON.stringify(headings) === '["Zuhause","Garage"]', headings.join(','));
await chipIn('anzeige', 'pv').click();
await page.waitForTimeout(400);
h = await hash();
check('a chip of a one-section layout navigates without /s/', h === '#/view/garage/tab/pv', h);

// ── chip size ────────────────────────────────────────────────────────────────
const pad = async (opts) => {
    await open(opts);
    return page.$eval(`${SEL} [data-menu-item]`, (el) => getComputedStyle(el).paddingLeft);
};
const padSm = await pad({ chipSize: 'sm' });
const padLg = await pad({ chipSize: 'lg' });
check('chipSize changes the chip padding', parseFloat(padSm) < parseFloat(padLg), `${padSm} < ${padLg}`);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
