// Verifies the tree view of the datapoint picker (issue #686: you had to know the
// datapoint's name to find it — now the picker can show the ioBroker object tree).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-picker-tree.mjs
//
// Checked: the toggle switches between flat list and tree, folders open and close,
// a leaf can be picked, a search opens the branches it matched by itself, and the
// chosen view survives closing and reopening the picker (localStorage).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const stateRow = (id, common) => ({ id, value: { _id: id, type: 'state', common } });
const objRow = (id, type, common) => ({ id, value: { _id: id, type, common } });

// Two namespaces, so the top level of the tree has something to choose from.
const VIEW = {
    state: [
        stateRow('hm-rpc.0.ABC0001.1.STATE', {
            name: 'Schalter',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        }),
        stateRow('hm-rpc.0.ABC0001.1.LEVEL', {
            name: 'Helligkeit',
            type: 'number',
            role: 'level.dimmer',
            unit: '%',
            read: true,
            write: true,
        }),
        stateRow('hm-rpc.0.ABC0002.2.STATE', { name: 'Fenster', type: 'boolean', role: 'sensor.window', read: true }),
        // The three faces of common.custom: a classic history adapter, another storage
        // adapter (influxdb) and iot, which uses custom for the Alexa name and logs nothing.
        stateRow('hm-rpc.0.ABC0002.2.HIST', {
            name: 'Zaehler Tag',
            type: 'number',
            role: 'value',
            read: true,
            custom: { 'history.0': { enabled: true } },
        }),
        stateRow('hm-rpc.0.ABC0002.2.FLUX', {
            name: 'Temperatur Flux',
            type: 'number',
            role: 'value',
            read: true,
            custom: { 'influxdb.0': { enabled: true } },
        }),
        stateRow('hm-rpc.0.ABC0002.2.ALEXA', {
            name: 'Alexa Lampe',
            type: 'boolean',
            role: 'switch',
            read: true,
            custom: { 'iot.0': { enabled: true, smartName: 'Lampe' } },
        }),
        // Sorts before both devices alphabetically – folders still have to come first.
        stateRow('hm-rpc.0.AAA_INFO', { name: 'Instanz-Info', type: 'boolean', role: 'indicator', read: true }),
        stateRow('alias.0.wohnzimmer.licht', {
            name: 'Licht',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        }),
    ],
    channel: [objRow('hm-rpc.0.ABC0001.1', 'channel', { name: 'Kanal 1' })],
    device: [objRow('hm-rpc.0.ABC0001', 'device', { name: 'Dimmaktor Flur' })],
    // Read for common.enabled: without it hm-rpc counts as inactive and stays hidden.
    instance: [
        objRow('system.adapter.hm-rpc.0', 'instance', { enabled: true }),
        objRow('system.adapter.history.0', 'instance', { enabled: true, type: 'storage' }),
        objRow('system.adapter.influxdb.0', 'instance', { enabled: true, type: 'storage' }),
        objRow('system.adapter.iot.0', 'instance', { enabled: true, type: 'iot-systems' }),
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const knob = (datapoint) => ({
    id: 'w-knob',
    type: 'value',
    title: 'Testwert',
    datapoint,
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: {},
});

/** Puts one widget on the board in edit mode and opens its config panel. */
async function openConfig(widget) {
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
    return dlg;
}

/** Opens the datapoint picker from the widget's "Datenpunkt-ID" row. */
async function openPicker(dlg) {
    await dlg.locator('button[title="Aus ioBroker wählen"]').first().click();
    const picker = page.locator('.aura-dp-picker');
    await picker.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600); // the list loads through the stubbed object view
    return picker;
}

const rowPaths = (picker) => picker.locator('.aura-dp-tree-row').evaluateAll((els) => els.map((e) => e.dataset.path));
const storedView = () => page.evaluate(() => localStorage.getItem('aura-dp-picker-view'));

// Start from a clean slate so the default really is the flat list.
await page.evaluate(() => localStorage.removeItem('aura-dp-picker-view'));

// ── 1. Default is the flat list, the toggle is offered ───────────────────────
const dlg = await openConfig(knob(''));
let picker = await openPicker(dlg);

eq(
    'a fresh browser starts on the list',
    await picker.locator('button[data-view="list"]').getAttribute('aria-pressed'),
    'true',
);
check('and offers the tree', (await picker.locator('button[data-view="tree"]').count()) === 1);
check('the list view renders no tree rows', (await picker.locator('.aura-dp-tree-row').count()) === 0);

// ── 2. The tree starts collapsed at the namespace level ─────────────────────
await picker.locator('button[data-view="tree"]').click();
await page.waitForTimeout(250);
eq('switching to the tree shows the namespaces', await rowPaths(picker), ['alias', 'hm-rpc']);

// ── 3. Clicking a folder opens exactly that branch ───────────────────────────
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc"]').click();
await page.waitForTimeout(200);
eq('opening a namespace reveals its instance', await rowPaths(picker), ['alias', 'hm-rpc', 'hm-rpc.0']);

await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0"]').click();
await page.waitForTimeout(200);
// #686: inside a folder the sub-folders come first, the plain datapoints last –
// hm-rpc.0.AAA_INFO would be first alphabetically but is a leaf.
eq('and the instance its devices, folders before datapoints', await rowPaths(picker), [
    'alias',
    'hm-rpc',
    'hm-rpc.0',
    'hm-rpc.0.ABC0001',
    'hm-rpc.0.ABC0002',
    'hm-rpc.0.AAA_INFO',
]);
check(
    'a folder that is a known device carries its name',
    (await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0.ABC0001"]').innerText()).includes('Dimmaktor Flur'),
);

await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0.ABC0001"]').click();
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0.ABC0001.1"]').click();
await page.waitForTimeout(250);
check('the states below a channel are reachable', (await rowPaths(picker)).includes('hm-rpc.0.ABC0001.1.LEVEL'));

// Closing it again folds the whole branch away.
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc"]').click();
await page.waitForTimeout(200);
eq('closing the namespace folds everything below', await rowPaths(picker), ['alias', 'hm-rpc']);

// ── 4. A search opens the branches it matched ────────────────────────────────
await picker.locator('input').first().fill('LEVEL');
await page.waitForTimeout(300);
const searched = await rowPaths(picker);
check('a search reveals its hit without clicking', searched.includes('hm-rpc.0.ABC0001.1.LEVEL'), searched.join(', '));
check('and hides the branch that does not match', !searched.includes('alias'), searched.join(', '));

// ── 5. Picking a leaf writes the datapoint and closes the picker ─────────────
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0.ABC0001.1.LEVEL"]').click();
await page.waitForTimeout(400);
check('picking a leaf closes the picker', (await page.locator('.aura-dp-picker').count()) === 0);
// A dimmer datapoint on a value widget raises the "switch the widget type?" question –
// that is the editor's own behaviour, the picker has done its job at this point.
const keepType = page.locator('button:has-text("Bei „")');
if (await keepType.count()) {
    await keepType.first().click();
    await page.waitForTimeout(400);
}
const dpField = dlg.locator('label:text-is("Datenpunkt-ID") + div input').first();
eq('and hands the id to the widget', await dpField.inputValue(), 'hm-rpc.0.ABC0001.1.LEVEL');

// ── 6. The browser remembers the view ────────────────────────────────────────
eq('the choice is stored', await storedView(), 'tree');
picker = await openPicker(dlg);
eq(
    'reopening comes back in the tree',
    await picker.locator('button[data-view="tree"]').getAttribute('aria-pressed'),
    'true',
);
check('with tree rows, not list rows', (await picker.locator('.aura-dp-tree-row').count()) > 0);

// Switching back is remembered just as well.
await picker.locator('button[data-view="list"]').click();
await page.waitForTimeout(200);
eq('switching back is stored too', await storedView(), 'list');

// ── 6b. "Mit History" takes every logging adapter, not just history.0 ────────
await picker.locator('input').first().fill(''); // section 4 left a search behind
await page.waitForTimeout(250);
const listIds = () => picker.locator('.aura-dp-list-row').evaluateAll((els) => els.map((e) => e.dataset.dp).sort());
check('the unfiltered list shows every datapoint', (await listIds()).length > 4, (await listIds()).join(', '));
const historyBtn = picker.locator('button:text-is("Mit History")');
check('the history filter is offered', (await historyBtn.count()) === 1);
await historyBtn.click();
await page.waitForTimeout(250);
eq('it keeps history and influxdb datapoints, but not the iot-only one', await listIds(), [
    'hm-rpc.0.ABC0002.2.FLUX',
    'hm-rpc.0.ABC0002.2.HIST',
]);
check(
    'and both carry their adapter badge',
    (await picker.locator('.aura-dp-list-row[data-dp="hm-rpc.0.ABC0002.2.FLUX"]').innerText()).includes('flux'),
    await picker.locator('.aura-dp-list-row[data-dp="hm-rpc.0.ABC0002.2.FLUX"]').innerText(),
);
await historyBtn.click();
await page.waitForTimeout(250);
check('switching it off brings the others back', (await listIds()).includes('hm-rpc.0.ABC0002.2.ALEXA'));

// ── 7. A whole branch can be checked at once (multi-select) ──────────────────
// The list widget picks many datapoints in one go – there the tree also has to
// offer the branch itself, not just its leaves.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(
    ([v]) => {
        window.__auraShot.mockObjectView(v);
        window.__auraShot.writes(true);
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-list',
                    type: 'list',
                    title: 'Liste',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 8, h: 6 },
                    options: { entries: [] },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [VIEW],
);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('.aura-widget-edit-modal button:has-text("Datenpunkte verwalten")').click();
await page.waitForTimeout(400);
await page.locator('button:has-text("Datenpunkt hinzufügen")').first().click();
picker = page.locator('.aura-dp-picker');
await picker.waitFor({ timeout: 10000 });
await page.waitForTimeout(700);

eq(
    'the stored view survives a reload',
    await picker.locator('button[data-view="list"]').getAttribute('aria-pressed'),
    'true',
);
await picker.locator('button[data-view="tree"]').click();
await page.waitForTimeout(250);
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc"]').click();
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0"]').click();
await picker.locator('.aura-dp-tree-row[data-path="hm-rpc.0.ABC0001"]').click();
await page.waitForTimeout(250);
await picker.locator('[data-branch-check="hm-rpc.0.ABC0001"]').click();
await page.waitForTimeout(250);
check(
    'one click takes the whole device',
    (await picker.innerText()).includes('2 ausgewählt'),
    (await picker.innerText()).split('\n').slice(0, 4).join(' / '),
);

await picker.locator('button:has-text("2 hinzufügen")').click();
await page.waitForTimeout(500);
const entries = await page.evaluate(() => window.__auraShot.widgetOptions('w-list')?.entries ?? []);
eq('and hands both datapoints to the list', entries.map((e) => e.id).sort(), [
    'hm-rpc.0.ABC0001.1.LEVEL',
    'hm-rpc.0.ABC0001.1.STATE',
]);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
