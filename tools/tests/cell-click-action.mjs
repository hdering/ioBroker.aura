// Per-cell click action in the Universal widget (issue #729).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/cell-click-action.mjs
//
// Runtime: each display cell opens its own popup, a cell without an action falls
// through to the widget's click action, a control cell ignores a stored action and
// the wrapper keeps the cell's grid placement. Editor: the "Klick-Aktion" button
// opens the popup editor and stores the action on the selected cell only.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const html = (text) => ({ kind: 'popup-html', html: `<p>${text}</p>` });
const cells = [
    { type: 'text', text: 'Zelle A', clickAction: html('Popup A'), popup: { title: 'Titel A' } },
    { type: 'text', text: 'Zelle B', clickAction: html('Popup B') },
    { type: 'text', text: 'Zelle C' },
    // A control owns its click - a stored action must not turn it into a popup.
    { type: 'button', text: 'Knopf', dpId: '0_userdata.0.aura_test_729', sendValue: '1', clickAction: html('Popup D') },
];
const widget = (c, extra = {}) => ({
    id: 'cca1',
    type: 'universal',
    title: 'Pollen',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 20, h: 10 },
    options: { customGrid: { cols: 2, rows: 2, cells: c }, clickAction: html('Popup Widget'), ...extra },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const settle = () => page.waitForTimeout(350);
const popups = () => page.locator('div[class*="z-[300]"]');
const popupText = async () => ((await popups().count()) ? await popups().first().innerText() : '');
const closePopup = async () => {
    await page.keyboard.press('Escape');
    await settle();
};
const show = async (c, extra) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(c, extra));
    await page.waitForSelector('.aura-widget-cca1', { timeout: 15000 });
    await settle();
};
const box = (i) => page.locator(`.aura-widget-cca1 .aura-custom-cell-${i}`).first().boundingBox();

// ── Placement: the display:contents wrapper must not move the cell ────────────
await show(cells.map(({ clickAction: _a, popup: _p, ...c }) => c));
const plain = await box(0);
await show(cells);
const wrapped = await box(0);
check(
    'clickable cell keeps its grid placement',
    !!plain && !!wrapped && Math.abs(plain.x - wrapped.x) < 1 && Math.abs(plain.width - wrapped.width) < 1,
    `${JSON.stringify(plain)} vs ${JSON.stringify(wrapped)}`,
);
check(
    'clickable cell shows a pointer',
    (await page
        .locator('.aura-widget-cca1 .aura-custom-cell-0')
        .first()
        .evaluate((e) => getComputedStyle(e).cursor)) === 'pointer',
);

// ── Runtime ───────────────────────────────────────────────────────────────────
await page.locator('.aura-widget-cca1 >> text=Zelle A').click();
await settle();
check('cell A opens exactly one popup', (await popups().count()) === 1, `count=${await popups().count()}`);
check('cell A popup shows its content', (await popupText()).includes('Popup A'));
check('cell A popup uses the per-cell title', (await popupText()).includes('Titel A'));
await closePopup();

await page.locator('.aura-widget-cca1 >> text=Zelle B').click();
await settle();
check(
    'cell B opens its own popup',
    (await popupText()).includes('Popup B') && !(await popupText()).includes('Popup A'),
);
await closePopup();

await page.locator('.aura-widget-cca1 >> text=Zelle C').click();
await settle();
check('cell without action falls through to the widget action', (await popupText()).includes('Popup Widget'));
await closePopup();

await page.locator('.aura-widget-cca1 button:text-is("Knopf")').click();
await settle();
check('control cell ignores a stored click action', (await popups().count()) === 0, await popupText());
const writes = await page.evaluate(() => window.__auraShot.writes?.() ?? null);
check('control cell still writes', !writes || JSON.stringify(writes).includes('aura_test_729'), JSON.stringify(writes));

// ── Edit mode: cells are inert ────────────────────────────────────────────────
await page.evaluate((w) => {
    window.__auraShot.showWidgets([w], { editMode: true });
    window.__auraShot.setEditMode(true);
}, widget(cells));
await page.waitForSelector('.aura-widget-cca1', { timeout: 15000 });
await settle();
await page.locator('.aura-widget-cca1 >> text=Zelle A').dispatchEvent('click');
await settle();
check('edit mode: a cell click opens nothing', (await popups().count()) === 0);

// ── Editor ────────────────────────────────────────────────────────────────────
await page.locator('.aura-widget-cca1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
const cellBtn = (rc) => dlg.locator(`button:has(> span:text-is("${rc}"))`);
const clickBtn = () => dlg.locator('button:has-text("Klick-Aktion")');

await cellBtn('2/1').click();
check('editor: display cell offers "Klick-Aktion"', (await clickBtn().count()) === 1);
await cellBtn('2/2').click();
check('editor: control cell has no "Klick-Aktion"', (await clickBtn().count()) === 0);

await cellBtn('2/1').click();
await clickBtn().click();
const modal = page.locator('div:has(> div > h2:has-text("Klick-Aktion"))').last();
const actionSelect = page.locator('select:has(option[value="link-external"])').last();
await actionSelect.waitFor({ timeout: 5000 });
check('editor: popup starts on "Aus"', (await actionSelect.inputValue()) === 'none', await actionSelect.inputValue());
await actionSelect.selectOption('link-external');
await settle();
const grid = () => page.evaluate(() => window.__auraShot.widgetOptions('cca1')?.customGrid);
let g = await grid();
check(
    'editor: action stored on the selected cell only',
    g?.cells[2]?.clickAction?.kind === 'link-external' && g?.cells[0]?.clickAction?.kind === 'popup-html',
    JSON.stringify(g?.cells.map((c) => c.clickAction?.kind ?? null)),
);
await actionSelect.selectOption('none');
await settle();
g = await grid();
check('editor: "Aus" removes the action', g?.cells[2]?.clickAction === undefined, JSON.stringify(g?.cells[2]));
void modal;

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
