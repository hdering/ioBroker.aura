// Editor: das Tablet-Reihenfolge-Panel (#413) neben dem Mobile-Panel.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tablet-order-panel.mjs
//
// Das Panel zeigt die eingestellten Spalten und die Baender in voller Breite, so wie
// das Tablet sie rendert. Geprueft: Knopf oeffnet das Panel, die Karten starten
// abwechselnd in der Rasterreihenfolge, Pfeile versetzen innerhalb und zwischen den
// Spalten, ⤢ macht ein Widget zum Band und zurueck, die Mobile-Liste bleibt davon
// unberuehrt, nur ein Panel ist offen, die Editor-Vorschau bleibt das Raster.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const TITLES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const LAYOUT = {
    id: 'l1',
    name: 'Test',
    slug: 'test',
    activeSectionId: 's1',
    sections: [
        {
            id: 's1',
            name: 'Home',
            slug: 'home',
            activeTabId: 't1',
            tabs: [
                {
                    id: 't1',
                    name: 'Tab',
                    slug: 'tab',
                    widgets: TITLES.map((title, i) => ({
                        id: `w${i}`,
                        type: 'value',
                        title,
                        datapoint: `demo.${i}`,
                        layout: 'default',
                        options: {},
                        gridPos: { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 },
                    })),
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((LAYOUT) => {
    window.__auraShot.mock({});
    window.__auraShot.setFrontend({ tabletCols: 2 });
    window.__auraShot.seed({ layouts: [LAYOUT], activeLayoutId: 'l1' });
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
}, LAYOUT);
// Hash-Wechsel laedt nicht neu — ueber about:blank, dann frisch seeden.
await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((LAYOUT) => {
    window.__auraShot.mock({});
    window.__auraShot.setFrontend({ tabletCols: 2 });
    window.__auraShot.seed({ layouts: [LAYOUT], activeLayoutId: 'l1', editMode: true });
}, LAYOUT);
await page.waitForTimeout(700);

const tabletBtn = page.locator('[data-aura-order-panel="tablet"]');
const mobileBtn = page.locator('[data-aura-order-panel="mobile"]');
check((await tabletBtn.count()) === 1, 'Toolbar hat den Tablet-Knopf');
check((await mobileBtn.count()) === 1, 'Toolbar hat den Smartphone-Knopf');

const tablet = page.locator('[data-aura-order-list="tablet"]');
const mobile = page.locator('[data-aura-order-list="mobile"]');
/** Titel der Karten einer Spalte, von oben nach unten. */
const colTitles = async (ci) =>
    tablet.locator(`[data-aura-order-col="${ci}"] [data-aura-order-card] [data-aura-order-title]`).allInnerTexts();
/** Titel der Baender in voller Breite, von oben nach unten. */
const bandTitles = async () => tablet.locator('[data-aura-order-band="full"] [data-aura-order-title]').allInnerTexts();
const action = (id, name) => tablet.locator(`[data-aura-order-card="${id}"] [data-aura-order-action="${name}"]`);
const mobileTitles = async () => {
    const rows = mobile.locator('[draggable="true"]');
    const n = await rows.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push((await rows.nth(i).locator('span.flex-1').innerText()).trim());
    return out;
};
const s = (a) => a.map((x) => x.trim()).join(',');

// ── Tablet-Panel oeffnen: zwei Spalten, abwechselnd gefuellt ────────────────
await tabletBtn.click();
await page.waitForTimeout(300);
check(await page.getByText('Tablet-Reihenfolge', { exact: true }).isVisible(), 'Tablet-Panel offen (Titel)');
check((await page.getByText('Mobile-Reihenfolge', { exact: true }).count()) === 0, 'Mobile-Panel dabei geschlossen');
check((await tablet.locator('[data-aura-order-col]').count()) === 2, 'Panel zeigt zwei Spalten');
check(s(await colTitles(0)) === 'Alpha,Gamma', 'Spalte 1 startet mit Alpha, Gamma', s(await colTitles(0)));
check(s(await colTitles(1)) === 'Beta,Delta', 'Spalte 2 startet mit Beta, Delta', s(await colTitles(1)));
check((await bandTitles()).length === 0, 'kein Band in voller Breite');
check((await page.locator('.react-grid-layout').count()) >= 1, 'Editor-Vorschau bleibt das Raster');

// ── ▼ an Alpha: tauscht innerhalb der Spalte ────────────────────────────────
await action('w0', 'down').click();
await page.waitForTimeout(300);
check(s(await colTitles(0)) === 'Gamma,Alpha', '▼ tauscht Alpha mit Gamma', s(await colTitles(0)));
check(s(await colTitles(1)) === 'Beta,Delta', 'Spalte 2 unveraendert', s(await colTitles(1)));

// ── ▶ an Gamma: in die zweite Spalte, gleiche Hoehe ────────────────────────
await action('w2', 'right').click();
await page.waitForTimeout(300);
check(s(await colTitles(0)) === 'Alpha', '▶ nimmt Gamma aus Spalte 1', s(await colTitles(0)));
check(s(await colTitles(1)) === 'Gamma,Beta,Delta', 'Gamma steht oben in Spalte 2', s(await colTitles(1)));
check(await action('w0', 'left').isDisabled(), '◀ in der ersten Spalte ist gesperrt');

// ── ⤢ an Beta: wird zum Band unter dem Block ────────────────────────────────
await action('w1', 'wide').click();
await page.waitForTimeout(300);
check(s(await bandTitles()) === 'Beta', 'Beta ist ein Band in voller Breite', s(await bandTitles()));
check(s(await colTitles(1)) === 'Gamma,Delta', 'Spalte 2 ohne Beta', s(await colTitles(1)));

// ── Mobile-Panel: eigene Reihenfolge, vom Tablet-Panel unberuehrt ──────────
await mobileBtn.click();
await page.waitForTimeout(300);
check(await page.getByText('Mobile-Reihenfolge', { exact: true }).isVisible(), 'Mobile-Panel offen');
check(
    (await page.getByText('Tablet-Reihenfolge', { exact: true }).count()) === 0,
    'Tablet-Panel dabei geschlossen (nur eins offen)',
);
check(
    s(await mobileTitles()) === TITLES.join(','),
    'Mobile-Liste unveraendert in Rasterreihenfolge',
    s(await mobileTitles()),
);

// ── Zurueck: die Anordnung ist gespeichert ─────────────────────────────────
await tabletBtn.click();
await page.waitForTimeout(300);
check(s(await colTitles(0)) === 'Alpha', 'Spalte 1 bleibt erhalten', s(await colTitles(0)));
check(s(await colTitles(1)) === 'Gamma,Delta', 'Spalte 2 bleibt erhalten', s(await colTitles(1)));
check(s(await bandTitles()) === 'Beta', 'Band bleibt erhalten', s(await bandTitles()));

// ── ⤡ an Beta: zurueck in eine Spalte, der Block darunter verschmilzt ──────
await action('w1', 'narrow').click();
await page.waitForTimeout(300);
check((await bandTitles()).length === 0, 'kein Band mehr');
check(
    s(await colTitles(0)) === 'Alpha,Beta',
    'Beta landet in der leersten Spalte (Spalte 1, unten)',
    s(await colTitles(0)),
);
check((await tablet.locator('[data-aura-order-block]').count()) === 1, 'ein zusammenhaengender Block');

// ── Knopf erneut: Panel schliesst ──────────────────────────────────────────
await tabletBtn.click();
await page.waitForTimeout(200);
check((await page.getByText('Tablet-Reihenfolge', { exact: true }).count()) === 0, 'zweiter Klick schliesst das Panel');

check(pageErrors.length === 0, 'keine Seitenfehler', pageErrors.join(' | '));

await browser.close();
console.log(`\ntablet-order-panel: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
