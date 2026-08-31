// Verifies the "Auswahlfeld" display of both list widgets (issue #609): a row
// renders the standalone Auswahlfeld widget's dropdown and carries its full
// option set — entries with label/colour/icon/image, entries from a JSON
// datapoint, the current entry as text / icon+text / icon, the dropdown itself
// switchable off and a fixed control width.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-select.mjs
//
// Both lists render the shared control from entryControls, so every case runs
// against the static and the dynamic list. Datapoint values are injected via the
// screenshot harness — no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const DP = 'demo.sel.MODE';
const JSON_DP = 'demo.sel.LIST';
const ROOT = '.aura-widget-w-sel';
const CONTROL = `${ROOT} .aura-select-control`;
const TYPES = ['list', 'autolist'];

const PRESETS = [
    { value: 0, label: 'Aus', color: '#ef4444' },
    { value: 1, label: 'Eco', icon: 'Leaf' },
    { value: 2, label: 'Komfort', color: '#3b82f6' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Mount one list widget with a single select row. */
async function show(type, entryPatch, values, layout = 'default') {
    const widget = {
        id: 'w-sel',
        type,
        title: 'Auswahl',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 14, h: 8 },
        options: {
            showTitle: false,
            hideFilterButton: true,
            syncIntervalMin: 999,
            entries: [{ id: DP, label: 'Zeile', displayType: 'select', ...entryPatch }],
        },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

const text = () =>
    page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(), ROOT);
const writes = () => page.evaluate(() => window.__auraShot.writes());
/** The closed dropdown button. */
const trigger = () => page.locator(`${CONTROL} .aura-widget-action button`).first();

/** Open the dropdown, hand back the option texts, close it again. */
async function openOptions() {
    await trigger().click();
    await page.waitForTimeout(200);
    const texts = await page.locator('.z-\\[9999\\] button').allInnerTexts();
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    return texts.map((s) => s.trim());
}

/** Open the dropdown and pick the option with that label. */
async function pick(label) {
    await trigger().click();
    await page.waitForTimeout(200);
    await page.locator('.z-\\[9999\\] button', { hasText: label }).first().click();
    await page.waitForTimeout(200);
}

// ── 1. the dropdown itself: entries, current value, writing ──────────────────
for (const type of TYPES) {
    await show(type, { presets: PRESETS }, { [DP]: 1 });
    eq(`${type}: the row draws one dropdown`, await page.locator(`${CONTROL}`).count(), 1);
    eq(`${type}: it lists every entry`, await openOptions(), ['Aus', 'Eco', 'Komfort']);
    check(`${type}: the closed dropdown shows the current entry`, (await text()).includes('Eco'), await text());

    await pick('Komfort');
    eq(`${type}: picking an entry writes its value`, (await writes()).at(-1), { id: DP, val: 2 });

    // The label follows the datapoint, it is not frozen at mount.
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: 0 }), DP);
    await page.waitForTimeout(300);
    check(`${type}: the label follows the datapoint`, (await text()).includes('Aus'), await text());

    // A value no entry covers still prints, so a row never goes blank.
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: 7 }), DP);
    await page.waitForTimeout(300);
    check(`${type}: an unmapped value prints raw`, (await text()).includes('7'), await text());
}

// ── 2. the current entry next to the dropdown (text / icon+text / icon) ──────
for (const type of TYPES) {
    await show(type, { presets: PRESETS, selectShowValue: true }, { [DP]: 2 });
    const both = await page.locator(`${CONTROL} > *`).count();
    eq(`${type}: the current value can sit next to the dropdown`, both, 2);
    const color = await page.evaluate(
        (sel) => getComputedStyle(document.querySelector(`${sel} > span`)).color,
        CONTROL,
    );
    eq(`${type}: it takes the entry colour`, color, 'rgb(59, 130, 246)');

    await show(type, { presets: PRESETS, selectShowValue: true, selectEntryDisplay: 'icon-text' }, { [DP]: 1 });
    await page.locator(`${CONTROL} > span svg`).first().waitFor({ timeout: 10000 });
    const iconText = await page.evaluate((sel) => {
        const el = document.querySelector(`${sel} > span`);
        return { svg: el.querySelectorAll('svg').length, text: (el.textContent ?? '').trim() };
    }, CONTROL);
    eq(`${type}: "Icon + Text" draws both`, iconText, { svg: 1, text: 'Eco' });

    await show(type, { presets: PRESETS, selectShowValue: true, selectEntryDisplay: 'icon' }, { [DP]: 1 });
    await page.locator(`${CONTROL} > svg`).first().waitFor({ timeout: 10000 });
    const iconOnly = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return { svg: el.children[0].tagName.toLowerCase(), text: (el.children[0].textContent ?? '').trim() };
    }, CONTROL);
    eq(`${type}: "Nur Icon" drops the text`, iconOnly, { svg: 'svg', text: '' });
}

// ── 3. dropdown off = read-only display, fixed width ─────────────────────────
for (const type of TYPES) {
    await show(type, { presets: PRESETS, selectShowSelect: false }, { [DP]: 0 });
    eq(`${type}: without the dropdown no control is drawn`, await page.locator(`${CONTROL} button`).count(), 0);
    check(`${type}: and the current entry is printed instead`, (await text()).includes('Aus'), await text());

    await show(type, { presets: PRESETS, selectWidth: 150 }, { [DP]: 0 });
    const w = await page.evaluate((sel) => Math.round(document.querySelector(`${sel} button`).offsetWidth), CONTROL);
    eq(`${type}: a fixed width sizes the dropdown`, w, 150);
}

// ── 4. entries from a JSON datapoint, with custom field names ────────────────
const JSON_VALUE = JSON.stringify([
    { id: 10, name: 'Zehn' },
    { id: 20, name: 'Zwanzig' },
]);
for (const type of TYPES) {
    await show(
        type,
        {
            presetsSource: 'json',
            presetsDp: JSON_DP,
            presetsValueKey: 'id',
            presetsLabelKey: 'name',
        },
        { [DP]: 10, [JSON_DP]: JSON_VALUE },
    );
    eq(`${type}: the JSON datapoint fills the dropdown`, await openOptions(), ['Zehn', 'Zwanzig']);
    await pick('Zwanzig');
    eq(`${type}: picking a JSON entry writes its value`, (await writes()).at(-1), { id: DP, val: 20 });

    // The JSON DP is subscribed, so a new payload rebuilds the list live.
    await page.evaluate(
        ([dp, v]) => window.__auraShot.mock({ [dp]: v }),
        [JSON_DP, JSON.stringify([{ id: 10, name: 'Neu' }])],
    );
    await page.waitForTimeout(300);
    eq(`${type}: a new payload rebuilds the list`, await openOptions(), ['Neu']);
}

// ── 5. the badge layout has no room for a control — it prints the label ──────
for (const type of TYPES) {
    await show(type, { presets: PRESETS }, { [DP]: 2 }, 'minimal');
    eq(`${type}: a badge draws no dropdown`, await page.locator(CONTROL).count(), 0);
    check(`${type}: the badge prints the matched label`, (await text()).includes('Komfort'), await text());
}

// ── 6. the editor writes the select options onto the entry ──────────────────
// Same per-entry panel in both lists (EntryControlsConfig), reached through
// "Datenpunkte verwalten" — driven here on the static one.
await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-cfg',
                type: 'list',
                title: 'Liste',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { entries: [{ id: 'demo.sel.MODE', label: 'Modus' }] },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-cfg'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const manage = page.locator('button:has-text("Datenpunkte verwalten")').first();
await manage.waitFor({ timeout: 10000 });
await manage.click();

const dlg = page.locator('.aura-config-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('text=Modus').first().click();
await page.waitForTimeout(300);
check(
    'the display list offers "Auswahlfeld"',
    (await dlg.locator('button:text-is("Auswahlfeld"):visible').count()) > 0,
);

await dlg.locator('button:text-is("Auswahlfeld"):visible').first().click();
await page.waitForTimeout(300);
eq('picking it writes displayType', (await opts()).entries[0].displayType, 'select');

// The value list is the one the "Tasten" display maintains, so switching between
// the two keeps the configured entries.
// Several panels carry an "+ Hinzufügen" — scope it to the value list's own header.
await dlg.locator('div:has(> label:text-is("Auswahl-Einträge")) > button:visible').first().click();
await page.waitForTimeout(200);
await dlg.locator('input[placeholder="Wert"]:visible').first().fill('5');
await dlg.locator('input[placeholder="Label"]:visible').first().fill('Fünf');
await page.waitForTimeout(400);
eq('an entry lands on the row', (await opts()).entries[0].presets, [{ value: 5, label: 'Fünf' }]);
await dlg.locator('button:text-is("Tasten"):visible').first().click();
await page.waitForTimeout(300);
eq('switching to "Tasten" keeps them', (await opts()).entries[0].presets, [{ value: 5, label: 'Fünf' }]);
await dlg.locator('button:text-is("Auswahlfeld"):visible').first().click();
await page.waitForTimeout(300);

await dlg.locator('label:text-is("Aktuellen Wert anzeigen") + button').first().click();
await page.waitForTimeout(300);
eq('the value toggle lands on the entry', (await opts()).entries[0].selectShowValue, true);

await dlg.locator('label:text-is("Wert-Darstellung") + select').first().selectOption('icon-text');
await dlg.locator('label:text-is("Breite (px)") + input').first().fill('120');
await page.waitForTimeout(400);
const cfg = (await opts()).entries[0];
eq('display mode and width land on it too', [cfg.selectEntryDisplay, cfg.selectWidth], ['icon-text', 120]);

await dlg.locator('label:text-is("Auswahlliste anzeigen") + button').first().click();
await page.waitForTimeout(300);
eq('and the dropdown can be switched off', (await opts()).entries[0].selectShowSelect, false);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
