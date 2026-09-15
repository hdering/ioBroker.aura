// Sitzt die Tableiste als Footer, gehört der Strich des aktiven Tabs über das
// Icon und nicht darunter (#657) — sonst klebt er an der Bildschirmkante statt
// zum Dashboard zu zeigen. Die Seite ist einstellbar: `auto` folgt der Leiste,
// `top`/`bottom` pinnen sie fest.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-bar-indicator.mjs
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

// Prüffarbe für den Strich — weit weg von jeder Theme-Farbe, damit ein Treffer
// eindeutig ist.
const ACTIVE = 'rgb(255, 0, 255)';

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

// Jeder Bereich probiert eine Kombination aus Leisten-Position und Strich-Seite.
const section = (id, slug, tabBar) => ({
    id,
    name: slug,
    slug,
    activeTabId: `t-${id}-a`,
    settings: { tabBar: { activeColor: ACTIVE, ...tabBar } },
    tabs: [tab(`t-${id}-a`, 'Wohnen', 'wohnen'), tab(`t-${id}-b`, 'Küche', 'kueche')],
});

const LAYOUT = {
    id: 'l-ind',
    name: 'Strich',
    slug: 'strich',
    activeSectionId: 'top',
    sections: [
        // Voreinstellung oben: klassischer Unterstrich.
        section('top', 'oben', { position: 'top' }),
        // Der gemeldete Fall: Leiste unten → Strich über dem Tab.
        section('foot', 'unten', { position: 'bottom' }),
        // …und beide Richtungen lassen sich festnageln.
        section('footfix', 'unten-fix', { position: 'bottom', indicatorSide: 'bottom' }),
        section('topfix', 'oben-fix', { position: 'top', indicatorSide: 'top' }),
        // Gegenprobe: ohne Unterstrich-Stil gibt es gar keinen Strich.
        section('pills', 'pills', { position: 'bottom', indicatorStyle: 'pills' }),
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
    }, `/view/strich/s/${slug}/tab/wohnen`);
    await page.waitForTimeout(250);
};

// Liest die tatsächlich gezeichneten Ränder des aktiven Tabs. Ein Rand zählt nur,
// wenn er Breite UND die Prüffarbe hat — eine durchsichtige 2px-Reserve ist kein
// sichtbarer Strich.
const edges = async () => {
    const el = page.locator('.aura-tab-active').first();
    return el.evaluate((node) => {
        const cs = getComputedStyle(node);
        const on = (w, c) => parseFloat(w) > 0 && c !== 'rgba(0, 0, 0, 0)' && !c.startsWith('rgba(0, 0, 0, 0');
        return {
            top: on(cs.borderTopWidth, cs.borderTopColor) ? cs.borderTopColor : null,
            bottom: on(cs.borderBottomWidth, cs.borderBottomColor) ? cs.borderBottomColor : null,
            height: Math.round(node.getBoundingClientRect().height),
        };
    });
};

// ── Leiste oben: Unterstrich wie gehabt ──────────────────────────────────────
console.log('\n── Leiste oben (Voreinstellung) ──');
await goto('oben');
let e = await edges();
const headerHeight = e.height;
check('der Strich liegt unter dem Tab', e.bottom === ACTIVE, JSON.stringify(e));
check('oben ist kein Strich', e.top === null, JSON.stringify(e));

// ── Leiste unten: Strich wandert nach oben ───────────────────────────────────
console.log('\n── Leiste unten (#657) ──');
await goto('unten');
e = await edges();
check('der Strich liegt über dem Tab', e.top === ACTIVE, JSON.stringify(e));
check('unten ist kein Strich', e.bottom === null, JSON.stringify(e));
check('die Tab-Höhe bleibt gleich', e.height === headerHeight, `${e.height} statt ${headerHeight}`);

// ── feste Seiten schlagen die Automatik ──────────────────────────────────────
console.log('\n── fest eingestellte Seite ──');
await goto('unten-fix');
e = await edges();
check('unten + "unten" hält den Strich unten', e.bottom === ACTIVE && e.top === null, JSON.stringify(e));

await goto('oben-fix');
e = await edges();
check('oben + "oben" zieht den Strich nach oben', e.top === ACTIVE && e.bottom === null, JSON.stringify(e));

// ── Gegenprobe: anderer Stil, kein Strich ────────────────────────────────────
console.log('\n── Gegenprobe Pill-Stil ──');
await goto('pills');
e = await edges();
check('der Pill-Stil zeichnet keinen Strich', e.top === null && e.bottom === null, JSON.stringify(e));

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
