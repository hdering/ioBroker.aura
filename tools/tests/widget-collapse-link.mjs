// Kopplungsgruppen einklappbarer Widgets (Issue #1038).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-collapse-link.mjs
//
// Geprüft wird im Browser: „Andere zuklappen" (Standard) hält immer nur ein Widget
// der Gruppe offen — auch eine Gruppe (eigene Kopfzeile) nimmt teil —, ein Widget
// ohne Kopplungsgruppe bleibt unberührt, und „Andere mitklappen" klappt die ganze
// Gruppe gemeinsam auf und zu. Die Regel selbst steht in widget-collapse-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options, y) => ({
    id,
    type,
    title: `Probe ${id}`,
    datapoint: 'demo.temp',
    layout: 'default',
    gridPos: { x: 0, y, w: 20, h: 8 },
    options: { defaultCollapsed: true, ...options },
});

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.mockServerState({ 'demo.temp': { val: 21.5, unit: '°C' } }));

async function show(widgets) {
    await page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
    await page.waitForTimeout(500);
}
const header = (id) => page.locator(`[data-aura-widget="${id}"] [data-collapsed-header]`);
const folded = async (id) => (await header(id).count()) === 1;
const open = async (id) => {
    await header(id).click();
    await page.waitForTimeout(250);
};
const fold = async (id) => {
    await page.locator(`[data-aura-widget="${id}"] [data-collapse-toggle]`).dispatchEvent('click');
    await page.waitForTimeout(250);
};
const height = async (id) => (await page.locator(`[data-aura-widget="${id}"]`).first().boundingBox())?.height ?? 0;
const openGroup = async (id) => {
    await page.locator(`[data-aura-widget="${id}"] .aura-group-header`).first().click();
    await page.waitForTimeout(250);
};

// ── 1. Andere zuklappen ──────────────────────────────────────────────────────────
await show([
    widget('ln-a', 'value', { collapseGroup: 'wz' }, 0),
    widget('ln-b', 'value', { collapseGroup: 'wz' }, 8),
    widget('ln-g', 'group', { collapseGroup: 'wz' }, 16),
    widget('ln-free', 'value', {}, 24),
]);
check('alle starten eingeklappt', (await folded('ln-a')) && (await folded('ln-b')) && (await folded('ln-free')));
const groupFolded = await height('ln-g');

await open('ln-free');
await open('ln-a');
check('A offen', !(await folded('ln-a')));
check('ein Widget ohne Gruppe bleibt offen', !(await folded('ln-free')));

await open('ln-b');
check('B öffnen klappt A zu', await folded('ln-a'));
check('B ist offen', !(await folded('ln-b')));

await openGroup('ln-g');
check('die Gruppe öffnet sich', (await height('ln-g')) > groupFolded + 20, `${groupFolded} → ${await height('ln-g')}`);
check('die Gruppe öffnen klappt B zu', await folded('ln-b'));

await open('ln-a');
check('A öffnen klappt die Gruppe zu', (await height('ln-g')) <= groupFolded + 2, `${await height('ln-g')}`);

await fold('ln-a');
check('Zuklappen öffnet nichts anderes', (await folded('ln-a')) && (await folded('ln-b')));
check('das Widget ohne Gruppe blieb die ganze Zeit offen', !(await folded('ln-free')));

// ── 2. Andere mitklappen ─────────────────────────────────────────────────────────
await show([
    widget('lt-a', 'value', { collapseGroup: 'kz', collapseGroupMode: 'together' }, 0),
    widget('lt-b', 'value', { collapseGroup: 'kz', collapseGroupMode: 'together' }, 8),
    widget('lt-c', 'value', { collapseGroup: 'anders', collapseGroupMode: 'together' }, 16),
]);
await open('lt-a');
check('mitklappen: B öffnet mit', !(await folded('lt-b')));
check('andere Gruppe bleibt zu', await folded('lt-c'));
await fold('lt-b');
check('mitklappen: B zuklappen klappt A mit zu', await folded('lt-a'));

// ── 3. Editor: Feld unter „Standardmäßig eingeklappt", Auswahl erst mit Namen ──────
await page.evaluate(() => window.__auraShot.unfoldSections());
await show([widget('le-a', 'value', {}, 0)]);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
const card = page.locator('[data-aura-widget="le-a"]').first();
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
const dlg = page.locator('.aura-widget-edit-modal');
const groupField = dlg.locator('[data-collapse-group-option]');
check('Editor zeigt das Feld Kopplungsgruppe', (await groupField.count()) === 1);
const modeGreyed = () => dlg.locator('[data-collapse-group-mode]').evaluate((el) => el.matches(':disabled'));
check('ohne Namen ist das Verhalten ausgegraut', await modeGreyed());
// Playwright counts the dialog's fields as hidden while it animates in, so the
// values go in through the DOM with React's own value setter.
const setValue = (loc, value) =>
    loc.evaluate((el, v) => {
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, value);
await setValue(groupField, 'wz');
await page.waitForTimeout(300);
check('mit Namen ist das Verhalten wählbar', !(await modeGreyed()));
await setValue(dlg.locator('[data-collapse-group-mode]'), 'together');
await page.waitForTimeout(300);
await dlg.locator('[data-collapse-group-option]').evaluate((el) => {
    el.closest('details').open = true;
    el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'tools/tests/out/collapse-link-editor.png' });
const stored = await page.evaluate(() => window.__auraShot.widgetOptions('le-a'));
check(
    'Name und Verhalten landen in den Optionen',
    stored?.collapseGroup === 'wz' && stored?.collapseGroupMode === 'together',
    JSON.stringify({ g: stored?.collapseGroup, m: stored?.collapseGroupMode }),
);

await ctx.close();
await browser.close();

check('keine JS-Fehler', pageErrors.length === 0, pageErrors.join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-collapse-link: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
