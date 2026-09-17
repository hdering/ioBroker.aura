// Admin und Frontend im SELBEN Browser: ein Drag im Editor darf im Frontend-Tab
// nicht sichtbar werden, bevor gespeichert wurde.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (oder AURA_BASE setzen)
//   AURA_BASE=http://localhost:5199 node tools/tests/frontend-same-browser-ui.mjs
//
// Beide Tabs teilen localStorage (ein Browser-Kontext). Der Admin verschiebt ein
// Widget mit der Maus (persist schreibt die ungespeicherte Kopie in den Speicher),
// der Frontend-Tab muss an seiner Stelle bleiben - früher zog ein `storage`-Listener
// die Kopie sofort in jeden Frontend-Tab. Undo im Admin darf genauso wenig
// durchschlagen. Offline (kein Adapter) lässt sich nur der Nicht-Effekt prüfen; die
// Übernahme eines Speicherns über den Socket steht in frontend-readonly-sync.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const widget = (id, x) => ({
    id,
    type: 'value',
    title: `W ${id}`,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 6 },
    options: { showTitle: true },
});
const layouts = [
    {
        id: 'layout-default',
        name: 'Standard',
        slug: 'default',
        activeSectionId: 'sec',
        sections: [
            {
                id: 'sec',
                name: 'Bereich',
                slug: 'bereich',
                activeTabId: 'tab1',
                tabs: [{ id: 'tab1', name: 'Eins', slug: 'eins', widgets: [widget('w1', 0), widget('w2', 12)] }],
            },
        ],
    },
];
const persisted = JSON.stringify({ state: { layouts, activeLayoutId: 'layout-default', editMode: false }, version: 0 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
await ctx.addInitScript((p) => {
    try {
        if (!localStorage.getItem('aura-dashboard')) localStorage.setItem('aura-dashboard', p);
    } catch {
        /* ignore */
    }
}, persisted);

// Frontend-Tab
const front = await ctx.newPage();
front.on('pageerror', (e) => pageErrors.push(e.message));
await front.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await front.locator('.aura-widget-w1').first().waitFor({ timeout: 30000 });
await front.waitForTimeout(800);
const frontX = async () => {
    const b = await front.locator('.aura-widget-w1').first().boundingBox();
    return b ? Math.round(b.x) : null;
};
const storedX = () =>
    front.evaluate(
        () =>
            JSON.parse(localStorage.getItem('aura-dashboard')).state.layouts[0].sections[0].tabs[0].widgets[0].gridPos
                .x,
    );
const x0 = await frontX();
eq('Frontend startet mit w1 an Spalte 0', await storedX(), 0);

// Admin-Tab (Dev-Login: jede PIN, wenn die API fehlt)
const admin = await ctx.newPage();
admin.on('pageerror', (e) => pageErrors.push(e.message));
await admin.goto(`${BASE}/#/admin/login`, { waitUntil: 'domcontentloaded' });
await admin.locator('input[type="password"]').first().fill('1234');
await admin.keyboard.press('Enter');
await admin.waitForTimeout(1200);
await admin.goto(`${BASE}/#/admin/editor`, { waitUntil: 'domcontentloaded' });
await admin.locator('.aura-widget-w1').first().waitFor({ timeout: 30000 });
await admin.waitForTimeout(600);
await admin.evaluate(() => window.__auraEditHistory.captureWrites(true));

// 1. Drag im Admin
const b = await admin.locator('.aura-widget-w1').first().boundingBox();
const grip = { x: b.x + 16, y: b.y + b.height - 10 };
await admin.mouse.move(grip.x, grip.y);
await admin.mouse.down();
for (let i = 1; i <= 10; i++) {
    await admin.mouse.move(grip.x + i * 30, grip.y);
    await admin.waitForTimeout(16);
}
await admin.mouse.up();
await admin.waitForTimeout(1200);
const adminCounts = await admin.evaluate(() => window.__auraEditHistory.counts());
check(
    'Admin: der Drag ist ein ungespeicherter Schritt',
    adminCounts.undo === 1 && adminCounts.dirty,
    JSON.stringify(adminCounts),
);
eq(
    'Admin: keine config.*-Schreibaktion',
    await admin.evaluate(() => window.__auraEditHistory.writes().map((w) => w.id)),
    [],
);
check('localStorage trägt die verschobene Kopie', (await storedX()) > 0, `x=${await storedX()}`);

await front.bringToFront();
await front.waitForTimeout(1500);
eq('Frontend-Tab: w1 steht unverändert', await frontX(), x0);

// 2. Undo im Admin (schreibt den Speicher erneut) - auch kein Effekt im Frontend
await admin.bringToFront();
await admin.evaluate(() => window.__auraEditHistory.undo());
await admin.waitForTimeout(800);
eq('Admin: Undo stellt Spalte 0 wieder her', await storedX(), 0);
await front.bringToFront();
await front.waitForTimeout(1000);
eq('Frontend-Tab: nach Undo weiterhin unverändert', await frontX(), x0);

// 3. Redo + ein zweiter Drag - der Frontend-Tab bleibt stumm
await admin.bringToFront();
await admin.evaluate(() => window.__auraEditHistory.redo());
await admin.waitForTimeout(800);
check('Admin: Redo schiebt w1 wieder weg', (await storedX()) > 0);
await front.bringToFront();
await front.waitForTimeout(1000);
eq('Frontend-Tab: nach Redo unverändert', await frontX(), x0);

eq('keine Seitenfehler', pageErrors, []);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
