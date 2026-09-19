// Escape must always reach the topmost overlay only. Reported case: the datapoint
// picker opened from a widget's edit dialog ignored Escape, and the dialog behind
// it closed instead.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/editor-escape-layers.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const stateRow = (id, common) => ({ id, value: { _id: id, type: 'state', common } });
const VIEW = {
    state: [
        stateRow('hm-rpc.0.ABC0001.1.STATE', { name: 'Schalter', type: 'boolean', role: 'switch', read: true, write: true }),
        stateRow('hm-rpc.0.ABC0001.1.LEVEL', { name: 'Helligkeit', type: 'number', role: 'level.dimmer', read: true, write: true }),
    ],
    instance: [{ id: 'system.adapter.hm-rpc.0', value: { _id: 'system.adapter.hm-rpc.0', type: 'instance', common: { enabled: true } } }],
};

const WIDGET = {
    id: 'w-esc',
    type: 'value',
    title: 'Testwert',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: {},
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const dlg = page.locator('.aura-widget-edit-modal');
const picker = page.locator('.aura-dp-picker');

/** Puts the widget on the board in edit mode and opens its config dialog. */
async function openConfig() {
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
}

async function openPicker() {
    await dlg.locator('button[title="Aus ioBroker wählen"]').first().click();
    await picker.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600); // the list loads through the stubbed object view
}

// ── 1. The edit dialog alone still closes on Escape ──────────────────────────
console.log('\n1. Edit dialog on its own');
await openConfig();
check('the edit dialog is open', await dlg.isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('Escape closes it', (await dlg.count()) === 0);

// ── 2. Picker on top: Escape closes the picker, not the dialog ───────────────
console.log('\n2. Datapoint picker on top of the dialog');
await openConfig();
await openPicker();
check('the picker is open', await picker.isVisible());

await picker.getByPlaceholder(/suchen/i).first().click(); // realistic: focus is in the search field
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the picker', (await picker.count()) === 0);
check('and leaves the dialog behind it open', (await dlg.count()) === 1);

await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('the next Escape closes the dialog', (await dlg.count()) === 0);

// ── 3. Opening and closing the picker repeatedly keeps the order ─────────────
console.log('\n3. Repeated open/close');
await openConfig();
for (let i = 1; i <= 2; i++) {
    await openPicker();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`round ${i}: picker gone, dialog stays`, (await picker.count()) === 0 && (await dlg.count()) === 1);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('the dialog closes once nothing sits on top', (await dlg.count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
