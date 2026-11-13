// A right-click inside the widget edit dialog (or the datapoint picker on top of
// it) must not close the dialog. Reported case: right-click in the datapoint
// field — React bubbled the portal's contextmenu up to the widget, whose own
// right-click menu replaced the dialog. The browser menu (copy/paste) must stay.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/editor-contextmenu-keeps-dialog.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WIDGET = {
    id: 'w-ctx',
    type: 'value',
    title: 'Testwert',
    datapoint: 'hm-rpc.0.ABC0001.1.LEVEL',
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: {},
};
const VIEW = {
    state: [
        {
            id: 'hm-rpc.0.ABC0001.1.LEVEL',
            value: {
                _id: 'hm-rpc.0.ABC0001.1.LEVEL',
                type: 'state',
                common: { name: 'Helligkeit', type: 'number', role: 'level', read: true, write: true },
            },
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.unfoldSections());

const dlg = page.locator('.aura-widget-edit-modal');

await page.evaluate(
    ([w, v]) => {
        window.__auraShot.mockObjectView(v);
        window.__auraShot.writes(true);
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    [WIDGET, VIEW],
);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(300);

/** Fires a contextmenu on the element and reports whether the page cancelled it. */
const rightClick = (loc) =>
    loc.evaluate((el) => {
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
    });

// ── 1. Every field in the dialog ─────────────────────────────────────────────
console.log('\n1. Right-click on every field of the edit dialog');
const fields = dlg.locator('input:not([type=hidden]), textarea, select, [contenteditable=true]');
const n = await fields.count();
check('the dialog has fields', n > 3, `${n} fields`);
let closed = 0;
let prevented = 0;
for (let i = 0; i < n; i++) {
    const f = fields.nth(i);
    if (!(await f.isVisible())) continue;
    if (await rightClick(f)) prevented++;
    await page.waitForTimeout(30);
    if ((await dlg.count()) === 0) {
        closed++;
        break;
    }
}
check('the dialog stays open', closed === 0);
check('the browser menu is not suppressed', prevented === 0, `${prevented} fields cancelled it`);

const dpInput = dlg.locator('input[value="hm-rpc.0.ABC0001.1.LEVEL"]').first();
check('the datapoint field exists', (await dpInput.count()) === 1);
if (await dpInput.count()) {
    await dpInput.click({ button: 'right' });
    await page.waitForTimeout(200);
    check('a real right-click in the datapoint field keeps the dialog', (await dlg.count()) === 1);
}

// ── 2. Inside the datapoint picker ───────────────────────────────────────────
console.log('\n2. Right-click in the datapoint picker');
const picker = page.locator('.aura-dp-picker');
await dlg.locator('button[title="Aus ioBroker wählen"]').first().click();
await picker.waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
await rightClick(picker.getByPlaceholder(/suchen/i).first());
await page.waitForTimeout(150);
check('the picker stays open', (await picker.count()) === 1);
check('the dialog behind it stays open', (await dlg.count()) === 1);

// ── 3. The widget itself still opens its menu ────────────────────────────────
console.log('\n3. Widget right-click menu still works');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const widget = page.locator('.aura-widget-w-ctx').first();
check('right-click on the widget is handled', await rightClick(widget));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
