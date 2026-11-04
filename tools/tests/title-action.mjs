// Klick auf den Titel (#922): Header-Titel und Menü-Titel können auf die
// Startseite, einen Tab oder einen Link führen. Ohne Aktion bleiben beide ein
// reines Label.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/title-action.mjs
//
// Das Dashboard kommt aus dem Screenshot-Harness — keine echte Konfiguration,
// kein Datenpunkt wird angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const widget = (id, title) => ({
    id,
    type: 'info',
    title,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});

const tab = (id, name, slug) => ({ id, name, slug, widgets: [widget(`w-${id}`, name)] });

const LAYOUT = {
    id: 'l-haus',
    name: 'Haus',
    slug: 'haus',
    activeSectionId: 'sec-start',
    defaultSectionId: 'sec-start',
    settings: {
        showHeader: true,
        headerTitle: 'Zuhause',
        headerTitleAction: { kind: 'home' },
        layoutDrawerEnabled: true,
        layoutDrawerShowSingle: true,
        layoutDrawerPlacement: 'sidebar',
        layoutDrawerTitle: 'Räume',
        layoutDrawerTitleAction: { kind: 'link-tab', layoutId: 'l-haus', sectionId: 'sec-keller', tabId: 't-k2' },
    },
    sections: [
        {
            id: 'sec-start',
            name: 'Start',
            slug: 'start',
            activeTabId: 't-s1',
            defaultTabId: 't-s1',
            tabs: [tab('t-s1', 'Übersicht', 'uebersicht'), tab('t-s2', 'Wetter', 'wetter')],
        },
        {
            id: 'sec-keller',
            name: 'Keller',
            slug: 'keller',
            activeTabId: 't-k1',
            tabs: [tab('t-k1', 'Heizung', 'heizung'), tab('t-k2', 'Waschen', 'waschen')],
        },
    ],
};

// Zweites Layout (Header und Menü gelten je Layout): Header ohne Aktion,
// Menü-Titel als Link in neuem Fenster.
const GARTEN = {
    id: 'l-garten',
    name: 'Garten',
    slug: 'garten',
    activeSectionId: 'sec-g',
    settings: {
        showHeader: true,
        headerTitle: 'Draußen',
        headerTitleAction: { kind: 'none' },
        layoutDrawerEnabled: true,
        layoutDrawerShowSingle: true,
        layoutDrawerPlacement: 'sidebar',
        layoutDrawerTitleAction: { kind: 'link-external', url: 'https://example.org/', newTab: true },
    },
    sections: [
        { id: 'sec-g', name: 'Garten', slug: 'garten', activeTabId: 't-g1', tabs: [tab('t-g1', 'Beet', 'beet')] },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate((layouts) => window.__auraShot.seed({ layouts }), [LAYOUT, GARTEN]);
// window.open festhalten statt ein Fenster zu öffnen.
await page.evaluate(() => {
    window.__opened = [];
    window.open = (...a) => {
        window.__opened.push(a);
        return null;
    };
});

const goto = async (path) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, path);
    await page.waitForTimeout(300);
};
const hash = () => page.evaluate(() => window.location.hash);
const visible = (sel) =>
    page
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false);
const headerBtn = page.locator('header h1.aura-titel button[data-title-action]');
const drawerBtn = page.locator('aside button[data-title-action]');

// ── Header-Titel → Startseite ────────────────────────────────────────────────
console.log('\n── Header-Titel: Startseite ──');
await goto('/view/haus/s/keller/tab/heizung');
check('der Header-Titel ist ein Button', (await headerBtn.count()) === 1);
check('er zeigt den Titeltext', (await headerBtn.textContent())?.trim() === 'Zuhause');
await headerBtn.click();
await page.waitForTimeout(300);
check('Klick führt auf Standard-Bereich und -Tab', (await hash()).includes('/s/start/tab/uebersicht'), await hash());
check('der Start-Tab rendert', await visible('.aura-widget-w-t-s1'));

// ── Menü-Titel → Tab in anderem Bereich ──────────────────────────────────────
console.log('\n── Menü-Titel: Tab ──');
check('der Menü-Titel ist ein Button', (await drawerBtn.count()) === 1);
await drawerBtn.click();
await page.waitForTimeout(300);
check('Klick führt auf den gewählten Tab', (await hash()).includes('/s/keller/tab/waschen'), await hash());
check('der Ziel-Tab rendert', await visible('.aura-widget-w-t-k2'));

// ── Bereich überschreibt ─────────────────────────────────────────────────────
console.log('\n── zweites Layout: kein Ziel, Link ──');
await goto('/view/garten/tab/beet');
check('Aktion "Nichts": der Header-Titel bleibt ein Label', (await headerBtn.count()) === 0);
check(
    'der Titeltext steht trotzdem da',
    (await page.locator('header h1.aura-titel').textContent())?.trim() === 'Draußen',
);
await drawerBtn.click();
await page.waitForTimeout(200);
const opened = await page.evaluate(() => window.__opened);
check(
    'Link mit neuem Fenster geht über window.open',
    opened.length === 1 && opened[0][0] === 'https://example.org/' && opened[0][1] === '_blank',
    JSON.stringify(opened),
);
check('die Seite bleibt, wo sie war', (await hash()).includes('/view/garten/tab/beet'), await hash());

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
