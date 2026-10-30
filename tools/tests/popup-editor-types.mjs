// Every widget type can be put into a popup view — new ones included, without a list to maintain.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/popup-editor-types.mjs
//
// The popup editor adds widgets through the same "+ Neues Widget" dialog as a tab, and that
// dialog is derived from DP_TEMPLATES + WIDGET_REGISTRY, so a new type shows up by itself.
// This test holds that in place: every type of the generated widget schema has to be
// offered, and every offered type has to land in the view (with {{dp}} prefilled) and
// render in the editor without an error. It also checks the toolbar wraps instead of
// pushing the page sideways — a wide toolbar scrolled the canvas, and the widget just
// added landed out of sight.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));
const VIEW_ID = 'pv-types';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/popups/${VIEW_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
const reset = () => page.evaluate((id) => window.__auraShot.popupViews([{ id, name: 'Typen', widgets: [] }]), VIEW_ID);
await reset();
await page.waitForTimeout(800);

const addBtn = page.getByRole('button', { name: 'Neues Widget', exact: true }).first();
const dialogTile = (type) => page.locator(`[data-widget-type="${type}"]`).first();
const closeDialog = async () => {
    if (await page.locator('[data-widget-type]').count()) await page.keyboard.press('Escape');
};

await addBtn.click();
await dialogTile('value').waitFor({ timeout: 10000 });
const offered = await page.evaluate(() => [
    ...new Set([...document.querySelectorAll('[data-widget-type]')].map((el) => el.dataset.widgetType)),
]);
await closeDialog();
check('alte Typ-Auswahlliste ist weg', (await page.locator('select option[value="value"]').count()) === 0);

// Deprecated types (registry `hidden`) stay out of every add picker on purpose.
const missing = Object.entries(schema.widgets)
    .filter(([t, def]) => !def.deprecated && !offered.includes(t))
    .map(([t]) => t);
check('jeder Schema-Typ steht im Dialog', missing.length === 0, missing.join(', '));

const scrolledAside = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('main, .aura-scroll')].some((n) => n.scrollWidth > n.clientWidth + 2),
    );
check('Werkzeugleiste schiebt die Seite nicht zur Seite', !(await scrolledAside()));

const failed = [];
for (const type of offered) {
    await reset();
    await page.waitForTimeout(150);
    pageErrors = [];
    await addBtn.click();
    await dialogTile(type).dblclick();
    await page.waitForTimeout(500);
    await closeDialog();
    const stored = await page.evaluate((id) => window.__auraShot.popupViewWidgets(id) ?? [], VIEW_ID);
    const shown = await page.evaluate((t) => {
        const el = document.querySelector(`.aura-widget-type-${t}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
            visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth,
            unknown: /Unbekannte[rs]? (Widget-)?Typ/.test(el.textContent ?? ''),
        };
    }, type);
    const why = [];
    if (stored.length !== 1 || stored[0].type !== type)
        why.push(`gespeichert: ${JSON.stringify(stored.map((w) => w.type))}`);
    if (type === 'value' && stored[0]?.datapoint !== '{{dp}}') why.push(`Datenpunkt: ${stored[0]?.datapoint}`);
    if (!shown) why.push('nicht gerendert');
    else if (!shown.visible) why.push('außerhalb des Sichtbereichs');
    else if (shown.unknown) why.push('unbekannter Typ');
    if (pageErrors.length) why.push(pageErrors[0].slice(0, 120));
    if (why.length) failed.push(`${type}: ${why.join('; ')}`);
}
check(`alle ${offered.length} Typen lassen sich hinzufügen und rendern`, failed.length === 0, failed.join(' | '));

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
