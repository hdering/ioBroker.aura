// Verifies the editor side of the Universal Widget's Auswahl cell (#615): it offers
// the same entry sources as the standalone Auswahlfeld widget — a manual list or a
// JSON datapoint — and switching the source rewires the panel accordingly.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/universal-select-cell.mjs
//
// What the configured cell then renders is covered by tools/tests/enum-json-widget.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-uni-cfg',
                type: 'universal',
                title: 'Raster',
                datapoint: '',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 8, h: 8 },
                options: {
                    customGrid: { cols: 1, rows: 1, cells: [{ type: 'empty' }] },
                },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});

const cell = async () => (await page.evaluate(() => window.__auraShot.widgetOptions('w-uni-cfg').customGrid.cells))[0];

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();

const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
const grid = dlg.locator('div:has(> p:has-text("Raster-Konfiguration"))').first();
await grid.waitFor({ timeout: 10000 });

await grid.locator('button:has-text("1/1")').first().click();
await page.waitForTimeout(200);
await dlg.locator('label:text-is("Inhalt") + select').selectOption('select');
await page.waitForTimeout(300);

// ── manual mode is what a fresh Auswahl cell starts in ────────────────────────

const manualBtn = dlg.locator('button:text-is("Manuell")');
const jsonBtn = dlg.locator('button:text-is("JSON-Datenpunkt")');
const importBtn = dlg.locator('button:has-text("common.states")');
const addBtn = dlg.locator('button:has-text("Einträge hinzufügen")');

check('the cell offers both entry sources', (await manualBtn.count()) === 1 && (await jsonBtn.count()) === 1);
check('manual mode shows the entry list', (await addBtn.count()) === 1);
check('manual mode offers the common.states import', (await importBtn.count()) === 1);

await addBtn.click();
await page.waitForTimeout(200);
eq('adding an entry writes it to the cell', (await cell()).entries, [{ value: '0', label: '' }]);

// ── the JSON datapoint source (#615) ──────────────────────────────────────────

await jsonBtn.click();
await page.waitForTimeout(300);
eq('the toggle writes the source', (await cell()).entriesSource, 'json');
check('the manual list is gone in JSON mode', (await addBtn.count()) === 0);
check('the states import is gone in JSON mode', (await importBtn.count()) === 0);

const dpField = dlg.locator('input[placeholder="0_userdata.0.auswahl.liste"]');
check('the JSON source panel offers the datapoint field', (await dpField.count()) === 1);
await dpField.fill('0_userdata.0.modi');
await page.waitForTimeout(300);
eq('the datapoint is written to the cell', (await cell()).entriesDp, '0_userdata.0.modi');

// Field names are optional overrides behind their own button.
await dlg.locator('button:text-is("Feldnamen")').click();
await page.waitForTimeout(200);
const labelKey = dlg.locator('label:text-is("Label") + input');
check('the field-name rows are reachable', (await labelKey.count()) === 1);
await labelKey.fill('bezeichnung');
await page.waitForTimeout(300);
eq('a field name is written to the cell', (await cell()).entriesLabelKey, 'bezeichnung');

// Switching back must keep the entries that were configured by hand.
await manualBtn.click();
await page.waitForTimeout(300);
const back = await cell();
eq('switching back restores the manual source', back.entriesSource, 'manual');
eq('the manual entries survive the round trip', back.entries, [{ value: '0', label: '' }]);
eq('the JSON datapoint is kept for a switch back', back.entriesDp, '0_userdata.0.modi');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
