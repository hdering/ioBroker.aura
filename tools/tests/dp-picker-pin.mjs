// The datapoint picker can pin its filters so every dialog opens with them (#1005).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-picker-pin.mjs
//
// Checked: a pinned adapter filter survives closing the dialog, later changes while
// pinned are kept, a pinned value the next dialog doesn't offer is ignored (list not
// emptied), and unpinning brings back the unfiltered default.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const stateRow = (id, type = 'number') => ({
    id,
    value: { _id: id, type: 'state', common: { name: id, type, role: 'value', read: true } },
});
const instance = (id) => ({ id, value: { _id: id, type: 'instance', common: { enabled: true } } });
const VIEW = {
    state: [
        stateRow('test.0.a'),
        stateRow('test.0.b'),
        stateRow('alias.0.room.temp'),
        stateRow('alias.0.room.switch', 'boolean'),
    ],
    instance: [instance('system.adapter.test.0'), instance('system.adapter.alias.0')],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => localStorage.removeItem('aura-dp-picker-filters'));
await page.evaluate(() => window.__auraShot.unfoldSections());

const widget = {
    id: 'w-val',
    type: 'value',
    title: 'Wert',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 3 },
    options: {},
};
await page.evaluate(
    ([w, v]) => {
        window.__auraShot.mockObjectView(v);
        window.__auraShot.writes(true);
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    [widget, VIEW],
);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(300);

const picker = page.locator('.aura-dp-picker');
const pin = picker.locator('[data-testid="dp-picker-pin"]');
const adapterSelect = picker.locator('select').first();
const open = async () => {
    await dlg.locator('button[title="Aus ioBroker wählen"]').first().click();
    await picker.waitFor({ timeout: 10000 });
    await picker.getByText('alias.0.room.temp').or(picker.getByText('test.0.a')).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(200);
};
const close = async () => {
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached', timeout: 5000 });
};
const rowsShown = async () => ({
    alias: (await picker.getByText('alias.0.room.temp').count()) > 0,
    test: (await picker.getByText('test.0.a').count()) > 0,
});

// 1. Pin "alias" → reopened dialog is filtered to alias.
await open();
eq('starts unpinned', await pin.getAttribute('aria-pressed'), 'false');
await adapterSelect.selectOption('alias');
await pin.click();
eq('pin button shows pinned', await pin.getAttribute('aria-pressed'), 'true');
await close();
await open();
eq('reopened picker keeps the pinned adapter', await adapterSelect.inputValue(), 'alias');
eq('only alias rows are listed', await rowsShown(), { alias: true, test: false });

// 2. Changes while pinned are kept.
await adapterSelect.selectOption('test');
await close();
await open();
eq('a change while pinned is remembered', await adapterSelect.inputValue(), 'test');

// 3. A pinned value this dialog doesn't offer is ignored, not applied.
await page.evaluate(() =>
    localStorage.setItem('aura-dp-picker-filters', JSON.stringify({ adapter: 'zigbee', type: 'nope' })),
);
await close();
await open();
eq('unknown pinned adapter does not empty the list', await rowsShown(), { alias: true, test: true });

// 4. Unpin → default again.
await adapterSelect.selectOption('alias');
await pin.click();
eq('pin button shows unpinned', await pin.getAttribute('aria-pressed'), 'false');
eq('unpinning clears the storage', await page.evaluate(() => localStorage.getItem('aura-dp-picker-filters')), null);
await close();
await open();
eq('unpinned picker opens with all adapters', await adapterSelect.inputValue(), '');
await close();

eq('no page errors', pageErrors, []);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
