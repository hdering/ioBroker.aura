// Undo/Redo im Editor (Strg+Z / Strg+Y) - der Teil, der nur im Browser sichtbar wird.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (oder AURA_BASE setzen)
//   AURA_BASE=http://localhost:5199 node tools/tests/edit-history-ui.mjs
//
// Geprüft wird die echte Kette: ein Widget wird im Rasterlayout mit der Maus
// verschoben (react-grid-layout → updateLayouts → persist → Verlauf), Strg+Z bringt
// es an die alte Stelle, Strg+Y und Strg+Shift+Z wiederholen. Ein fokussiertes
// Textfeld behält das Browser-eigene Rückgängig, ein Kontrollkästchen gibt Strg+Z an
// den Editor weiter. Die reine Verlaufslogik steht in tools/tests/edit-history.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 900 };

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
    title: id,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 8 },
    options: {},
});

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate((w) => window.__auraShot.showWidgets(w, { editMode: true }), [widget('w1', 0), widget('w2', 40)]);
await page.waitForTimeout(500);
await page.evaluate(() => window.__auraShot.editHistory(true));

const hist = () => page.evaluate(() => window.__auraShot.history());
const box = (id) => page.locator(`.aura-widget-${id}`).boundingBox();
const near = (a, b) => Math.abs(a - b) < 2;

eq('Verlauf startet leer', await hist(), { undo: 0, redo: 0, keys: [] });

// ── 1. Ziehen im Raster ist ein Schritt ──────────────────────────────────────
const b0 = await box('w1');
const grip = { x: b0.x + 20, y: b0.y + b0.height - 12 }; // abseits der Editor-Knöpfe
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
    await page.mouse.move(grip.x + i * 20, grip.y);
    await page.waitForTimeout(15);
}
await page.mouse.up();
await page.waitForTimeout(450);
const b1 = await box('w1');
check('Ziehen verschiebt das Widget', b1.x - b0.x > 100, `dx=${b1.x - b0.x}`);
eq('… und ist genau ein Verlaufseintrag (Dashboard)', await hist(), { undo: 1, redo: 0, keys: [['aura-dashboard']] });

// ── 2. Strg+Z / Strg+Y / Strg+Shift+Z ────────────────────────────────────────
await page.keyboard.press('Control+z');
await page.waitForTimeout(350);
const b2 = await box('w1');
check('Strg+Z stellt die alte Position wieder her', near(b2.x, b0.x), `x=${b2.x}, war ${b0.x}`);
eq('… Eintrag liegt jetzt auf Redo', (await hist()).redo, 1);

await page.keyboard.press('Control+y');
await page.waitForTimeout(350);
const b3 = await box('w1');
check('Strg+Y verschiebt wieder', near(b3.x, b1.x), `x=${b3.x}, soll ${b1.x}`);

await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(350);
const b4 = await box('w1');
check('Strg+Shift+Z wiederholt ebenfalls', near(b4.x, b1.x), `x=${b4.x}, soll ${b1.x}`);
eq('… Redo ist danach leer', (await hist()).redo, 0);

// ── 3. Textfeld behält das native Rückgängig ─────────────────────────────────
await page.evaluate(() => {
    const i = document.createElement('input');
    i.type = 'text';
    i.id = '__undo_probe_text';
    document.body.appendChild(i);
    i.focus();
});
await page.keyboard.type('abc');
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
eq('Strg+Z im Textfeld lässt den Verlauf in Ruhe', (await hist()).undo, 1);
check('… und das Widget bleibt, wo es ist', near((await box('w1')).x, b1.x));

// ── 4. Kontrollkästchen gibt Strg+Z an den Editor ────────────────────────────
await page.evaluate(() => {
    document.getElementById('__undo_probe_text')?.remove();
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.id = '__undo_probe_check';
    document.body.appendChild(c);
    c.focus();
});
await page.keyboard.press('Control+z');
await page.waitForTimeout(350);
eq('Strg+Z auf einem Kontrollkästchen macht rückgängig', (await hist()).undo, 0);
check('… Widget wieder an der alten Stelle', near((await box('w1')).x, b0.x));
await page.evaluate(() => document.getElementById('__undo_probe_check')?.remove());

// ── 5. Aus = vergessen ───────────────────────────────────────────────────────
await page.evaluate(() => window.__auraShot.editHistory(false));
eq('Abschalten leert den Verlauf', await hist(), { undo: 0, redo: 0, keys: [] });

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
