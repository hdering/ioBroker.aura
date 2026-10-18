// Verifies the optional unit next to an input field - issue #622.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/input-unit.mjs
//
// Four places let a user place an input field, and the unit had to reach all of
// them: the Eingabefeld widget, the static list, the dynamic list and the
// Universal Widget's Eingabefeld cell. All of them render it as
// `.aura-input-unit` right of the field. It is opt-in everywhere, so the first
// check of each block is that nothing appears without the option - configs
// written before #622 must look exactly as they did.
//
// Values are injected through the screenshot harness (__auraShot.mock), so no
// datapoint is written.
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

const DP = 'demo.temp.SET';
const DEG = '°C';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
// The edit dialog folds every section; this test fills in settings, so open them all.
await page.evaluate(() => window.__auraShot.unfoldSections());

/** Text of the rendered unit, or null when the field has none. */
const unitText = () => page.evaluate(() => document.querySelector('.aura-input-unit')?.textContent?.trim() ?? null);

/** Unit right of the field means: same row, and it starts where the field ends. */
const unitSitsRightOfField = () =>
    page.evaluate(() => {
        const f = document.querySelector('input[type="text"], input[type="number"], textarea');
        const u = document.querySelector('.aura-input-unit');
        if (!f || !u) {
            return null;
        }
        const a = f.getBoundingClientRect();
        const b = u.getBoundingClientRect();
        // Horizontally after the field, vertically overlapping it.
        return b.left >= a.right - 1 && b.top < a.bottom && b.bottom > a.top;
    });

async function show(widget, values = { [DP]: 21 }) {
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(350);
}

// -- 1. Eingabefeld widget ---------------------------------------------------
const inputWidget = (options, layout = 'default') => ({
    id: 'w-in',
    type: 'input',
    title: 'Soll',
    datapoint: DP,
    layout,
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: { inputMode: 'number', ...options },
});

await show(inputWidget({}));
eq('widget: no unit option, no unit', await unitText(), null);

await show(inputWidget({ unit: DEG }));
eq('widget: unit renders', await unitText(), DEG);
check('widget: unit sits right of the field', (await unitSitsRightOfField()) === true);

await show(inputWidget({ unit: '   ' }));
eq('widget: whitespace-only unit renders nothing', await unitText(), null);

await show(inputWidget({ unit: DEG }, 'compact'));
eq('widget/compact: unit renders', await unitText(), DEG);

await show(inputWidget({ unit: 'kWh', inputWidth: 90 }));
eq('widget: unit survives a fixed field width', await unitText(), 'kWh');
check('widget: unit still right of the fixed-width field', (await unitSitsRightOfField()) === true);

await show(inputWidget({ unit: DEG, multiline: true, inputMode: undefined }));
eq('widget/multiline: unit renders', await unitText(), DEG);

// -- 2. Static and dynamic list ----------------------------------------------
const listWidget = (type, entryPatch, layout = 'default') => ({
    id: 'w-list',
    type,
    title: 'Liste',
    datapoint: '',
    layout,
    gridPos: { x: 0, y: 0, w: 12, h: 6 },
    options: {
        entries: [{ id: DP, label: 'Soll', displayType: 'input', unit: DEG, ...entryPatch }],
    },
});

for (const type of ['list', 'autolist']) {
    await show(listWidget(type, {}));
    eq(`${type}: unit stays hidden by default`, await unitText(), null);

    await show(listWidget(type, { inputShowUnit: true }));
    eq(`${type}: inputShowUnit renders the unit`, await unitText(), DEG);
    check(`${type}: unit sits right of the field`, (await unitSitsRightOfField()) === true);

    // No unit on the entry (a discovered datapoint without common.unit) - the
    // toggle must not print an empty box or a stray separator.
    await show(listWidget(type, { inputShowUnit: true, unit: undefined }));
    eq(`${type}: no unit on the entry, nothing rendered`, await unitText(), null);

    await show(listWidget(type, { inputShowUnit: true }, 'card'));
    eq(`${type}/card: unit renders`, await unitText(), DEG);
}

// The dynamic list configures its display once for the whole list; the toggle has
// to travel that path too (utils/listDisplayDefaults).
await show({
    id: 'w-list',
    type: 'autolist',
    title: 'Liste',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 12, h: 6 },
    options: {
        entries: [{ id: DP, label: 'Soll', unit: DEG }],
        entryDisplay: { displayType: 'input', inputShowUnit: true },
    },
});
eq('autolist: list-wide display carries the unit toggle', await unitText(), DEG);

// -- 3. Universal Widget cell ------------------------------------------------
const universal = (cellPatch) => ({
    id: 'w-uni',
    type: 'universal',
    title: 'Raster',
    datapoint: '',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: {
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'input', dpId: DP, ...cellPatch }] },
    },
});

await show(universal({}));
eq('universal: no unit option, no unit', await unitText(), null);

await show(universal({ inputUnit: DEG }));
eq('universal: inputUnit renders', await unitText(), DEG);
check('universal: unit sits right of the field', (await unitSitsRightOfField()) === true);

await show(universal({ inputUnit: DEG, multiline: true }));
eq('universal/multiline: unit renders', await unitText(), DEG);

// A cell that also shows the last change stacks vertically - the unit must still
// be there next to the send button.
await show(universal({ inputUnit: DEG, showLastChange: true }));
eq('universal: unit renders alongside the last-change line', await unitText(), DEG);

// -- 4. The editor writes the option ------------------------------------------
await page.evaluate((dp) => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-in',
                type: 'input',
                title: 'Soll',
                datapoint: dp,
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {},
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, DP);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });

const unitField = dlg.locator('label:text-is("Einheit") + input');
check('widget editor offers an Einheit field', (await unitField.count()) === 1);
await unitField.fill(DEG);
await page.waitForTimeout(400);
eq('widget editor writes options.unit', await page.evaluate(() => window.__auraShot.widgetOptions('w-in').unit), DEG);
await unitField.fill('');
await page.waitForTimeout(400);
eq(
    'clearing the field drops the option again',
    await page.evaluate(() => window.__auraShot.widgetOptions('w-in').unit ?? null),
    null,
);

// The per-entry panel is the same component in both lists (EntryControlsConfig),
// reached through "Datenpunkte verwalten" - driven here on the static one.
await page.evaluate((dp) => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-list',
                type: 'list',
                title: 'Liste',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { entries: [{ id: dp, label: 'Soll', unit: '°C', displayType: 'input' }] },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, DP);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const manage = page.locator('button:has-text("Datenpunkte verwalten")').first();
await manage.waitFor({ timeout: 10000 });
await manage.click();
const entryDlg = page.locator('.aura-config-modal');
await entryDlg.waitFor({ timeout: 10000 });
await entryDlg.locator('text=Soll').first().click();
await page.waitForTimeout(300);

const unitToggle = entryDlg.locator('label:text-is("Einheit neben dem Feld") + button');
check('entry editor offers the unit toggle', (await unitToggle.count()) === 1);
await unitToggle.click();
await page.waitForTimeout(400);
eq(
    'entry editor writes inputShowUnit',
    await page.evaluate(() => window.__auraShot.widgetOptions('w-list').entries[0].inputShowUnit),
    true,
);
await unitToggle.click();
await page.waitForTimeout(400);
eq(
    'switching it off drops the option again',
    await page.evaluate(() => window.__auraShot.widgetOptions('w-list').entries[0].inputShowUnit ?? null),
    null,
);

// And the cell editor of the Universal Widget.
await page.evaluate((dp) => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-uni',
                type: 'universal',
                title: 'Raster',
                datapoint: '',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 8, h: 8 },
                options: { customGrid: { cols: 1, rows: 1, cells: [{ type: 'input', dpId: dp }] } },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, DP);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const uniDlg = page.locator('.aura-widget-edit-modal');
await uniDlg.waitFor({ timeout: 10000 });
const grid = uniDlg.locator('div:has(> p:has-text("Raster-Konfiguration"))').first();
await grid.waitFor({ timeout: 10000 });
await grid.locator('button:has-text("1/1")').first().click();
await page.waitForTimeout(300);

const cellUnitField = uniDlg.locator('label:text-is("Einheit") + input');
check('cell editor offers an Einheit field', (await cellUnitField.count()) === 1);
await cellUnitField.fill(DEG);
await page.waitForTimeout(400);
eq(
    'cell editor writes inputUnit',
    await page.evaluate(() => window.__auraShot.widgetOptions('w-uni').customGrid.cells[0].inputUnit),
    DEG,
);
await cellUnitField.fill('');
await page.waitForTimeout(400);
eq(
    'clearing the cell field drops the option again',
    await page.evaluate(() => window.__auraShot.widgetOptions('w-uni').customGrid.cells[0].inputUnit ?? null),
    null,
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
