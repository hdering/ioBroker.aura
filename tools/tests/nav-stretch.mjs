// Ausrichtung "Gleichmäßig" (#661): Tab-Leiste und Bereichsleiste teilen die Breite
// zu gleichen Teilen unter ihren Einträgen auf — der aktive Streifen wird damit
// breiter als die Beschriftung. Menü-Elemente behalten ihre natürliche Breite an
// den Rändern.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/nav-stretch.mjs
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

// Vier Tabs mit sehr unterschiedlich langen Namen: bei "gleichmäßig" müssen sie
// trotzdem gleich breit werden, sonst misst der Test nur die Textlänge.
const section = (id, slug, tabBar) => ({
    id,
    name: slug,
    slug,
    activeTabId: `t-${id}-a`,
    settings: { tabBar },
    tabs: [
        tab(`t-${id}-a`, 'Wohnen', 'wohnen'),
        tab(`t-${id}-b`, 'Küche', 'kueche'),
        tab(`t-${id}-c`, 'Arbeitszimmer Dachgeschoss', 'arbeit'),
        tab(`t-${id}-d`, 'Bad', 'bad'),
    ],
});

const LAYOUT = {
    id: 'l-str',
    name: 'Stretch',
    slug: 'stretch',
    activeSectionId: 'even',
    sections: [
        section('even', 'gleich', { position: 'top', tabsAlignment: 'stretch' }),
        // Gegenprobe: die Voreinstellung links lässt die Tabs bei ihrer Textbreite.
        section('left', 'links', { position: 'top', tabsAlignment: 'left' }),
        // Mit Menü-Element: das Element behält seine Breite, die Tabs teilen den Rest.
        section('item', 'element', {
            position: 'top',
            tabsAlignment: 'stretch',
            items: [{ id: 'it-1', type: 'text', position: 'right', text: 'Hallo Welt' }],
        }),
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const goto = async (slug) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, `/view/stretch/s/${slug}/tab/wohnen`);
    await page.waitForTimeout(300);
};

// Breiten der Leisteneinträge plus die Breite der Leiste selbst.
const measure = async (barSel, entrySel) =>
    page.evaluate(
        ([bar, entry]) => {
            const barEl = document.querySelector(bar);
            const els = [...document.querySelectorAll(entry)];
            return {
                bar: Math.round(barEl?.getBoundingClientRect().width ?? 0),
                left: Math.round(barEl?.getBoundingClientRect().left ?? 0),
                widths: els.map((e) => Math.round(e.getBoundingClientRect().width)),
                first: els[0] ? Math.round(els[0].getBoundingClientRect().left) : null,
                last: els.at(-1) ? Math.round(els.at(-1).getBoundingClientRect().right) : null,
            };
        },
        [barSel, entrySel],
    );

const spread = (ws) => (ws.length ? Math.max(...ws) - Math.min(...ws) : Infinity);

// ── Tab-Leiste: gleichmäßig ──────────────────────────────────────────────────
console.log('\n── Tab-Leiste, Ausrichtung "gleichmäßig" ──');
await goto('gleich');
let m = await measure('.aura-tabs', '.aura-tab-btn');
check('alle vier Tabs sind da', m.widths.length === 4, JSON.stringify(m.widths));
// 2px Toleranz für Teilpixel.
check('die Tabs sind gleich breit', spread(m.widths) <= 2, JSON.stringify(m.widths));
const filled = m.last - m.first;
check('die Tabs füllen die Leiste', filled > m.bar - 40, `${filled} von ${m.bar}`);
check('der erste Tab sitzt am linken Rand', m.first - m.left < 20, `${m.first - m.left}px Abstand`);

// ── Gegenprobe links ─────────────────────────────────────────────────────────
console.log('\n── Gegenprobe: Ausrichtung "links" ──');
await goto('links');
const mLeft = await measure('.aura-tabs', '.aura-tab-btn');
check('links bleibt jeder Tab bei seiner Textbreite', spread(mLeft.widths) > 20, JSON.stringify(mLeft.widths));
check('links bleibt die Leiste rechts frei', mLeft.last < mLeft.bar - 100, `${mLeft.last} von ${mLeft.bar}`);

// ── Mit Menü-Element ─────────────────────────────────────────────────────────
console.log('\n── gleichmäßig + Menü-Element ──');
await goto('element');
m = await measure('.aura-tabs', '.aura-tab-btn');
check('die Tabs bleiben gleich breit', spread(m.widths) <= 2, JSON.stringify(m.widths));
const itemBox = await page
    .locator('.aura-tabs')
    .evaluate((bar) => {
        const el = [...bar.querySelectorAll('div')].find((d) => d.textContent?.trim() === 'Hallo Welt');
        return el ? Math.round(el.getBoundingClientRect().width) : 0;
    })
    .catch(() => 0);
check('das Menü-Element behält seine eigene Breite', itemBox > 0 && itemBox < 200, `${itemBox}px`);
check('die Tabs enden vor dem Element', m.last <= mLeft.bar, `${m.last} von ${m.bar}`);

// ── Bereichsleiste ───────────────────────────────────────────────────────────
console.log('\n── Bereichsleiste, Ausrichtung "gleichmäßig" ──');
await page.evaluate(() =>
    window.__auraShot.setFrontend({
        layoutDrawerEnabled: true,
        layoutDrawerPlacement: 'top',
        layoutDrawerBarAlignment: 'stretch',
        layoutDrawerEntryStyle: 'nameOnly',
    }),
);
await goto('gleich');
const sec = await measure('.aura-section-bar', '.aura-section-bar button');
check('alle drei Bereiche sind da', sec.widths.length === 3, JSON.stringify(sec.widths));
check('die Bereiche sind gleich breit', spread(sec.widths) <= 2, JSON.stringify(sec.widths));
check('die Bereiche füllen die Leiste', sec.last - sec.first > sec.bar - 40, `${sec.last - sec.first} von ${sec.bar}`);

// Gegenprobe: zurück auf links.
await page.evaluate(() => window.__auraShot.setFrontend({ layoutDrawerBarAlignment: 'left' }));
await goto('gleich');
const secLeft = await measure('.aura-section-bar', '.aura-section-bar button');
check('links bleibt die Bereichsleiste rechts frei', secLeft.last < secLeft.bar - 100, JSON.stringify(secLeft));

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
