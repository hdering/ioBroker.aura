// Die Tableiste zählt nur, was sie auch zeigt. Ein ausgeblendeter (oder
// deaktivierter) Tab verschwindet im Frontend aus der Leiste — bleibt aber über
// seinen Slug erreichbar. Ein Bereich mit zwei Tabs, von denen einer
// ausgeblendet ist, sieht damit aus wie ein Bereich mit einem Tab, und genau so
// soll er sich auch verhalten: keine Leiste mit einem einsamen Reiter.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-bar-hidden.mjs
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

const tab = (id, name, slug, extra = {}) => ({
    id,
    name,
    slug,
    widgets: [widget(`w-${id}`, name)],
    ...extra,
});

const LAYOUT = {
    id: 'l-bar',
    name: 'Leiste',
    slug: 'leiste',
    activeSectionId: 'sec-two',
    sections: [
        // Zwei sichtbare Tabs — die Leiste gehört hierhin.
        {
            id: 'sec-two',
            name: 'Zwei',
            slug: 'zwei',
            activeTabId: 't-two-a',
            tabs: [tab('t-two-a', 'Wohnen', 'wohnen'), tab('t-two-b', 'Küche', 'kueche')],
        },
        // Der gemeldete Fall: zwei Tabs, einer ausgeblendet.
        {
            id: 'sec-hidden',
            name: 'Versteckt',
            slug: 'versteckt',
            activeTabId: 't-hid-a',
            tabs: [tab('t-hid-a', 'Sichtbar', 'sichtbar'), tab('t-hid-b', 'Geheim', 'geheim', { hidden: true })],
        },
        // Deaktivierte Tabs fallen im Frontend genauso aus der Leiste.
        {
            id: 'sec-disabled',
            name: 'Gesperrt',
            slug: 'gesperrt',
            activeTabId: 't-dis-a',
            tabs: [tab('t-dis-a', 'Aktiv', 'aktiv'), tab('t-dis-b', 'Aus', 'aus', { disabled: true })],
        },
        // Gegenprobe 1: showSingle hält die Leiste bewusst am Leben.
        {
            id: 'sec-single',
            name: 'Einzeln',
            slug: 'einzeln',
            activeTabId: 't-sing-a',
            settings: { tabBar: { showSingle: true } },
            tabs: [tab('t-sing-a', 'Allein', 'allein'), tab('t-sing-b', 'Weg', 'weg', { hidden: true })],
        },
        // Gegenprobe 2: ein Element in der Leiste muss auch ohne zweiten Tab zeigen.
        {
            id: 'sec-items',
            name: 'Elemente',
            slug: 'elemente',
            activeTabId: 't-item-a',
            settings: { tabBar: { items: [{ id: 'i1', type: 'text', position: 'right', text: 'FLUR' }] } },
            tabs: [tab('t-item-a', 'Eins', 'eins'), tab('t-item-b', 'Zwei', 'zwei', { hidden: true })],
        },
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

const goto = async (path) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, path);
    await page.waitForTimeout(250);
};
const barCount = () => page.locator('.aura-tabs').count();
const visible = async (sel) =>
    page
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false);

// ── zwei sichtbare Tabs: Leiste da ───────────────────────────────────────────
console.log('\n── zwei sichtbare Tabs ──');
await goto('/view/leiste/s/zwei/tab/wohnen');
check('die Leiste rendert', (await barCount()) === 1);
check('beide Tabs stehen darin', (await page.locator('.aura-tabs').getByText('Küche').count()) === 1);

// ── zwei Tabs, einer ausgeblendet ────────────────────────────────────────────
console.log('\n── einer ausgeblendet ──');
await goto('/view/leiste/s/versteckt/tab/sichtbar');
check('keine Leiste mit einem einsamen Reiter', (await barCount()) === 0);
check('der sichtbare Tab rendert trotzdem', await visible('.aura-widget-w-t-hid-a'));

// Ausgeblendet heißt nur "nicht in der Leiste" — der Slug führt weiter hin.
await goto('/view/leiste/s/versteckt/tab/geheim');
check('der ausgeblendete Tab bleibt über seinen Slug erreichbar', await visible('.aura-widget-w-t-hid-b'));
check('auch dort bleibt die Leiste weg', (await barCount()) === 0);

// ── zwei Tabs, einer deaktiviert ─────────────────────────────────────────────
console.log('\n── einer deaktiviert ──');
await goto('/view/leiste/s/gesperrt/tab/aktiv');
check('ein deaktivierter Tab hält die Leiste nicht am Leben', (await barCount()) === 0);

// ── Gegenproben ──────────────────────────────────────────────────────────────
console.log('\n── Gegenproben ──');
await goto('/view/leiste/s/einzeln/tab/allein');
check('showSingle zeigt die Leiste weiterhin', (await barCount()) === 1);

await goto('/view/leiste/s/elemente/tab/eins');
check('ein Leisten-Element zeigt die Leiste weiterhin', (await barCount()) === 1);
check('das Element steht darin', (await page.locator('.aura-tabs').getByText('FLUR').count()) === 1);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
