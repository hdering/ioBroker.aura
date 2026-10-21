// Menü-Element in der Tab-Leiste (#791): ein Element rechts (z. B. der Knopf der
// Rückkehr-Pause) belegt nur seine eigene Breite — vorher bekam die rechte Zone
// über das symmetrische 1fr/auto/1fr-Raster die halbe Leiste, auf dem Handy blieb
// den Tabs nur die andere Hälfte. Bei zentrierten Tabs bleibt das Raster symmetrisch,
// ebenso bei einem Element auf „Mitte“ (#820) — das stand sonst neben der rechten Zone.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-bar-item-width.mjs
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

const ITEM = 'Pause';

const section = (id, slug, tabsAlignment, position = 'right') => ({
    id,
    name: slug,
    slug,
    activeTabId: `t-${id}-a`,
    settings: {
        tabBar: {
            position: 'top',
            tabsAlignment,
            items: [{ id: `it-${id}`, type: 'text', position, text: ITEM }],
        },
    },
    tabs: [
        tab(`t-${id}-a`, 'Wohnen', 'wohnen'),
        tab(`t-${id}-b`, 'Küche', 'kueche'),
        tab(`t-${id}-c`, 'Arbeitszimmer', 'arbeit'),
        tab(`t-${id}-d`, 'Bad', 'bad'),
    ],
});

const LAYOUT = {
    id: 'l-iw',
    name: 'Item width',
    slug: 'itemwidth',
    activeSectionId: 'left',
    sections: [
        section('left', 'links', 'left'),
        section('right', 'rechts', 'right', 'left'),
        section('center', 'mitte', 'center'),
        section('cleft', 'element-mitte-links', 'left', 'center'),
        section('cright', 'element-mitte-rechts', 'right', 'center'),
    ],
};

const browser = await chromium.launch();
// Handybreite wie im Issue.
const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const goto = async (slug) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, `/view/itemwidth/s/${slug}/tab/wohnen`);
    await page.waitForTimeout(300);
};

// Breiten der drei Rasterzonen und des Elements.
const measure = () =>
    page.evaluate((text) => {
        const bar = document.querySelector('.aura-tabs');
        const zones = [...(bar?.children ?? [])].map((z) => Math.round(z.getBoundingClientRect().width));
        // Das innerste Element mit dem Text — die Zonen selbst enthalten ihn auch.
        const item = [...bar.querySelectorAll('div')].filter((d) => d.textContent?.trim() === text).at(-1);
        const br = bar?.getBoundingClientRect();
        const ir = item?.getBoundingClientRect();
        return {
            bar: Math.round(br?.width ?? 0),
            // Abstand der Element-Mitte zur Leisten-Mitte.
            offCenter: ir && br ? Math.round(ir.left + ir.width / 2 - (br.left + br.width / 2)) : NaN,
            zones,
            item: item ? Math.round(item.getBoundingClientRect().width) : 0,
        };
    }, ITEM);

console.log('\n── Tabs links, Element rechts ──');
await goto('links');
let m = await measure();
check('drei Rasterzonen', m.zones.length === 3, JSON.stringify(m));
check('das Element ist sichtbar', m.item > 0, JSON.stringify(m));
// Rechte Zone = Element + Innenabstand (px-2), nicht die halbe Leiste.
check('die rechte Zone ist nur so breit wie das Element', m.zones[2] <= m.item + 24, JSON.stringify(m));
check('die Tabs bekommen den Rest der Leiste', m.zones[0] >= m.bar - m.item - 60, JSON.stringify(m));

console.log('\n── Tabs rechts, Element links ──');
await goto('rechts');
m = await measure();
check('die linke Zone ist nur so breit wie das Element', m.zones[0] <= m.item + 24, JSON.stringify(m));
check('die Tabs bekommen den Rest der Leiste', m.zones[2] >= m.bar - m.item - 60, JSON.stringify(m));

console.log('\n── Tabs mittig: Raster bleibt symmetrisch ──');
await goto('mitte');
m = await measure();
check('linke und rechte Zone gleich breit', Math.abs(m.zones[0] - m.zones[2]) <= 1, JSON.stringify(m));

// #820: ein Element auf „Mitte“ stand bei Tabs links/rechts direkt neben der rechten Zone.
for (const [slug, label] of [
    ['element-mitte-links', 'Tabs links'],
    ['element-mitte-rechts', 'Tabs rechts'],
]) {
    console.log(`\n── ${label}, Element mittig (#820) ──`);
    await goto(slug);
    m = await measure();
    check('das Element ist sichtbar', m.item > 0, JSON.stringify(m));
    check('das Element steht in der Mitte der Leiste', Math.abs(m.offCenter) <= 2, JSON.stringify(m));
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
