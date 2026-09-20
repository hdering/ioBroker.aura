// Editor: das Tablet-Reihenfolge-Panel (#413) neben dem Mobile-Panel.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tablet-order-panel.mjs
//
// Geprueft: Knopf oeffnet das Panel mit eigenem Titel, die Liste startet in der
// Rasterreihenfolge, ▼ schreibt tabletOrder (die Liste folgt sofort), die
// Mobile-Liste bleibt davon unberuehrt, nur ein Panel ist offen, und die
// Editor-Vorschau bleibt das Raster (kein Tablet-Fluss im Editor).
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
    window.__auraShot.seed({ layouts: [LAYOUT], activeLayoutId: 'l1' });
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
}, LAYOUT);
// Hash-Wechsel laedt nicht neu — ueber about:blank, dann frisch seeden.
await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((LAYOUT) => {
    window.__auraShot.mock({});
    window.__auraShot.seed({ layouts: [LAYOUT], activeLayoutId: 'l1', editMode: true });
}, LAYOUT);
await page.waitForTimeout(700);

const tabletBtn = page.locator('[data-aura-order-panel="tablet"]');
const mobileBtn = page.locator('[data-aura-order-panel="mobile"]');
check((await tabletBtn.count()) === 1, 'Toolbar hat den Tablet-Knopf');
check((await mobileBtn.count()) === 1, 'Toolbar hat den Smartphone-Knopf');

/** Das offene Panel (Wurzel traegt data-aura-order-list) und seine ziehbaren Zeilen. */
const panel = (mode) => page.locator(`[data-aura-order-list="${mode}"]`);
const rowTitles = async (mode) => {
    const rows = panel(mode).locator('[draggable="true"]');
    const n = await rows.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push((await rows.nth(i).locator('span.flex-1').innerText()).trim());
    return out;
};

// ── Tablet-Panel oeffnen ─────────────────────────────────────────────────────
await tabletBtn.click();
await page.waitForTimeout(300);
check(await page.getByText('Tablet-Reihenfolge', { exact: true }).isVisible(), 'Tablet-Panel offen (Titel)');
check((await page.getByText('Mobile-Reihenfolge', { exact: true }).count()) === 0, 'Mobile-Panel dabei geschlossen');
let order = await rowTitles('tablet');
check(order.join(',') === TITLES.join(','), 'Liste startet in der Rasterreihenfolge', order.join(','));
check((await page.locator('.react-grid-layout').count()) >= 1, 'Editor-Vorschau bleibt das Raster');

// ── ▼ am ersten Eintrag: tabletOrder wird geschrieben, Liste folgt ─────────
await panel('tablet').locator('[draggable="true"]').first().locator('button', { hasText: '▼' }).click();
await page.waitForTimeout(300);
order = await rowTitles('tablet');
check(order.join(',') === 'Beta,Alpha,Gamma,Delta', '▼ tauscht die ersten beiden', order.join(','));

// ── Mobile-Panel: eigene Reihenfolge, vom Tablet-Panel unberuehrt ──────────
await mobileBtn.click();
await page.waitForTimeout(300);
check(await page.getByText('Mobile-Reihenfolge', { exact: true }).isVisible(), 'Mobile-Panel offen');
check(
    (await page.getByText('Tablet-Reihenfolge', { exact: true }).count()) === 0,
    'Tablet-Panel dabei geschlossen (nur eins offen)',
);
const mobile = await rowTitles('mobile');
check(mobile.join(',') === TITLES.join(','), 'Mobile-Liste unveraendert in Rasterreihenfolge', mobile.join(','));

// ── Und zurueck: Tablet-Reihenfolge ist gespeichert geblieben ──────────────
await tabletBtn.click();
await page.waitForTimeout(300);
order = await rowTitles('tablet');
check(order.join(',') === 'Beta,Alpha,Gamma,Delta', 'Tablet-Reihenfolge bleibt erhalten', order.join(','));

// ── Knopf erneut: Panel schliesst ──────────────────────────────────────────
await tabletBtn.click();
await page.waitForTimeout(200);
check((await page.getByText('Tablet-Reihenfolge', { exact: true }).count()) === 0, 'zweiter Klick schliesst das Panel');

check(pageErrors.length === 0, 'keine Seitenfehler', pageErrors.join(' | '));

await browser.close();
console.log(`\ntablet-order-panel: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
