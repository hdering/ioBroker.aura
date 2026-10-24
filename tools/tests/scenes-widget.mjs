// Verifies the scenes widget (issue #825).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/scenes-widget.mjs
//
// Checked: own scenes listed, foreign scenes only with showForeignScenes and without "⋯";
// the active scene (state true) highlighted; a tap writes true to the scene; the tiles layout;
// devices are added through the datapoint picker and join with their current value,
// values are edited per type (on/off, number, states list) and sent with
// saveScene; "Current values" refreshes them; removing a device; editing sends the scene id;
// delete asks first, then sends deleteScene; Escape closes only the picker; the notices for a missing / stopped scenes adapter;
// editing in the frontend only with allowEdit; the edit dialog's "Manage scenes" section
// lists the own scenes and opens the master-detail editor: datapoint of a row changed,
// rows reordered by drag, a device added, all of it saved in that order.
// Backend replies come from the harness (mockSendTo), writes are captured (captureWrites).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

// What the backend says about the datapoints (sceneDevices); `value` = current value.
const DEV = [
    { id: 'demo.sc.lamp', name: 'Stehlampe', type: 'number', unit: '%', min: 0, max: 100, value: 70, problem: null },
    { id: 'demo.sc.tv', name: 'Fernseher', type: 'boolean', unit: '', value: false, problem: null },
    { id: 'demo.sc.desk', name: 'Schreibtisch', type: 'boolean', unit: '', value: true, problem: null },
    {
        id: 'demo.sc.mode',
        name: 'Modus',
        type: 'number',
        unit: '',
        states: { 0: 'Aus', 1: 'Film', 2: 'Musik' },
        value: 1,
        problem: null,
    },
    { id: 'demo.sc.temp', name: 'Temperatur', type: 'number', unit: '°C', value: 21, problem: 'read-only' },
];
const SCENES = [
    {
        id: 'scene.0.aura.Kino',
        name: 'Kino',
        own: true,
        enabled: true,
        memberCount: 2,
        members: [
            { id: 'demo.sc.lamp', value: 20 },
            { id: 'demo.sc.tv', value: true },
        ],
    },
    {
        id: 'scene.0.aura.Essen',
        name: 'Essen',
        own: true,
        enabled: true,
        memberCount: 1,
        members: [{ id: 'demo.sc.lamp', value: 90 }],
    },
    { id: 'scene.0.Nacht', name: 'Nacht', own: false, enabled: true, memberCount: 5 },
];
// The picker's datapoint list (getObjectView). demo.sc counts as an enabled instance,
// otherwise the picker hides the rows as inactive.
await page.evaluate((dev) => {
    window.__auraShot.mockObjectView({
        state: dev.map((d) => ({
            id: d.id,
            value: {
                _id: d.id,
                type: 'state',
                common: { name: d.name, type: d.type, role: 'state', unit: d.unit, write: d.problem !== 'read-only' },
            },
        })),
        instance: [{ id: 'system.adapter.demo.sc', value: { common: { enabled: true } } }],
    });
}, DEV);
const PICKER = '.z-\\[10050\\]';
/** Opens the picker with `opener`, ticks the named datapoints and confirms. */
async function pickDevices(opener, names) {
    await opener.click();
    const picker = page.locator(PICKER).last();
    await picker.waitFor({ timeout: 10000 });
    for (const name of names) {
        await picker.getByText(name, { exact: true }).first().click();
    }
    await picker.locator('button', { hasText: 'hinzufügen' }).last().click();
    await page.waitForTimeout(300);
}

const status = (patch = {}) => ({ ok: true, instance: 'scenes.0', installed: true, running: true, ...patch });
const OK = { ok: true, id: 'scene.0.aura.Neu', missing: [] };

let n = 0;
/** Mounts one scenes widget (next to two ordinary widgets); returns its locator. */
async function mount(options = {}, replies = {}, layout = 'default') {
    n++;
    const id = `w-scenes-${n}`;
    await page.evaluate(
        ([id, options, replies, layout]) => {
            const a = window.__auraShot;
            a.mockSendTo(replies);
            const vals = { 'scene.0.aura.Kino': true, 'scene.0.aura.Essen': false, 'scene.0.Nacht': false };
            a.mock(vals);
            a.mockServerState(vals);
            a.showWidgets([
                { id, type: 'scenes', title: 'Szenen', layout, gridPos: { x: 0, y: 0, w: 10, h: 12 }, options },
                {
                    id: `${id}-desk`,
                    type: 'switch',
                    title: 'Schreibtisch',
                    datapoint: 'demo.sc.desk',
                    gridPos: { x: 12, y: 0, w: 4, h: 4 },
                    options: {},
                },
                {
                    id: `${id}-mode`,
                    type: 'value',
                    title: 'Modus',
                    datapoint: 'demo.sc.mode',
                    gridPos: { x: 12, y: 5, w: 4, h: 4 },
                    options: {},
                },
            ]);
        },
        [id, options, replies, layout],
    );
    const w = page.locator(`.aura-widget-${id}`).first();
    await w.waitFor();
    await page.waitForTimeout(400);
    return w;
}
const calls = () => page.evaluate(() => window.__auraShot.sendToCalls());
const lastCall = async (command) => (await calls()).filter((c) => c.command === command).pop();
const REPLIES = {
    sceneStatus: status(),
    listScenes: { ok: true, scenes: SCENES },
    sceneDevices: { ok: true, devices: DEV },
    saveScene: OK,
    deleteScene: { ok: true },
};
const modal = page.locator('[data-testid="scene-modal"]');
const row = (name) => modal.locator('[data-testid="scene-device"]', { hasText: name });

// ── list ──────────────────────────────────────────────────────────────────────
{
    const w = await mount({}, REPLIES);
    const names = await w.locator('[data-testid="scene"]').allInnerTexts();
    check('own scenes listed, foreign hidden by default', names.length === 2 && /Kino/.test(names[0]), names.join('|'));
    const active = await w.locator('[data-testid="scene"][data-active]').allInnerTexts();
    check('active scene highlighted', active.length === 1 && /Kino/.test(active[0]), active.join('|'));
    check('device count shown', /2 Geräte/.test(names[0]), names[0]);
    const call = await lastCall('sceneStatus');
    check('backend asked on the page instance', !!call && /^aura\.\d+$/.test(call.target), call?.target);

    await w.locator('[data-testid="scene"]', { hasText: 'Essen' }).click();
    const write = await page.evaluate(() => window.__auraShot.lastWrite);
    check(
        'tap writes true to the scene',
        write?.id === 'scene.0.aura.Essen' && write?.val === true,
        JSON.stringify(write),
    );
}

{
    const w = await mount({ showForeignScenes: true }, REPLIES);
    const rows = w.locator('[data-testid="scene"]');
    const nacht = rows.filter({ hasText: 'Nacht' });
    check(
        'foreign scene shown with showForeignScenes, without ⋯',
        (await rows.count()) === 3 && (await nacht.locator('[data-testid="scene-edit"]').count()) === 0,
    );
}

{
    const w = await mount({}, REPLIES, 'card');
    const grid = await w.locator('[data-testid="scenes-list"]').evaluate((el) => getComputedStyle(el).display);
    check('tiles layout is a grid', grid === 'grid', grid);
}

// ── create ────────────────────────────────────────────────────────────────────
{
    const w = await mount({ allowEdit: true }, REPLIES);
    await w.locator('[data-testid="scene-add"]').click();
    await modal.waitFor();
    const save = modal.locator('[data-testid="scene-save"]');
    check('save disabled without name and devices', await save.isDisabled());

    await pickDevices(modal.locator('[data-testid="scene-pick"]'), ['Schreibtisch', 'Modus']);
    const toggle = row('Schreibtisch').locator('[data-testid="scene-value"]');
    check('picked device joins with its current value', (await toggle.innerText()) === 'an', await toggle.innerText());
    await toggle.click();
    check('on/off toggles', (await toggle.innerText()) === 'aus');

    const select = row('Modus').locator('select[data-testid="scene-value"]');
    check('states datapoint gets a list', (await select.count()) === 1);
    await select.selectOption('2');

    await modal.locator('[data-testid="scene-name"]').fill('Lesen');
    await save.click();
    await modal.waitFor({ state: 'detached' });
    const call = await lastCall('saveScene');
    check(
        'new scene: saveScene with name, devices and values, no id',
        call?.payload?.name === 'Lesen' &&
            JSON.stringify(call?.payload?.members) ===
                JSON.stringify([
                    { id: 'demo.sc.desk', value: false },
                    { id: 'demo.sc.mode', value: '2' },
                ]) &&
            !('id' in (call?.payload ?? {})),
        JSON.stringify(call?.payload),
    );
}

// ── edit / current values / delete ────────────────────────────────────────────
{
    const w = await mount({ allowEdit: true }, REPLIES);
    await w.locator('[data-testid="scene"]', { hasText: 'Kino' }).locator('[data-testid="scene-edit"]').click();
    await modal.waitFor();
    await page.waitForTimeout(200);
    const lamp = row('Stehlampe').locator('input[data-testid="scene-value"]');
    check('edit shows stored values', (await lamp.inputValue()) === '20', await lamp.inputValue());
    check(
        'unit next to the number',
        /%/.test(await row('Stehlampe').innerText()) &&
            (await row('Fernseher').locator('[data-testid="scene-value"]').innerText()) === 'an',
    );
    check(
        'editing does not trigger the scene',
        (await page.evaluate(() => window.__auraShot.lastWrite))?.id !== 'scene.0.aura.Kino',
    );

    await modal.locator('[data-testid="scene-current"]').click();
    await page.waitForTimeout(300);
    check(
        '"Current values" takes what the devices show',
        (await lamp.inputValue()) === '70' &&
            (await row('Fernseher').locator('[data-testid="scene-value"]').innerText()) === 'aus',
        await lamp.inputValue(),
    );

    await lamp.fill('35');
    await row('Fernseher').locator('[data-testid="scene-remove"]').click();
    await modal.locator('[data-testid="scene-save"]').click();
    await modal.waitFor({ state: 'detached' });
    const save = await lastCall('saveScene');
    check(
        'edit: saveScene with id, remaining device and typed value',
        save?.payload?.id === 'scene.0.aura.Kino' &&
            JSON.stringify(save?.payload?.members) === JSON.stringify([{ id: 'demo.sc.lamp', value: '35' }]),
        JSON.stringify(save?.payload),
    );

    await w.locator('[data-testid="scene"]', { hasText: 'Kino' }).locator('[data-testid="scene-edit"]').click();
    await modal.waitFor();
    const before = (await calls()).filter((c) => c.command === 'deleteScene').length;
    await modal.locator('[data-testid="scene-delete"]').click();
    const askedFirst = (await calls()).filter((c) => c.command === 'deleteScene').length === before;
    await modal.getByRole('button', { name: 'Ja' }).click();
    await modal.waitFor({ state: 'detached' });
    const del = await lastCall('deleteScene');
    check('delete asks first, then sends deleteScene', askedFirst && del?.payload?.id === 'scene.0.aura.Kino');
}

// ── datapoint picker ──────────────────────────────────────────────────────────
{
    const w = await mount({ allowEdit: true }, REPLIES);
    await w.locator('[data-testid="scene-add"]').click();
    await modal.waitFor();
    await modal.locator('[data-testid="scene-pick"]').click();
    const picker = page.locator('.z-\\[10050\\]');
    await picker
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => {});
    check('"Add device" opens the datapoint picker', (await picker.count()) > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(
        'Escape closes only the picker',
        (await picker.count()) === 0 && (await modal.count()) === 1,
        `picker ${await picker.count()}, modal ${await modal.count()}`,
    );
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
}

// ── notices ───────────────────────────────────────────────────────────────────
{
    const w = await mount({}, { ...REPLIES, sceneStatus: status({ installed: false }) });
    const t = await w.innerText();
    check('scenes adapter missing: notice, no list', /nicht installiert/.test(t) && !/Neue Szene/.test(t), t);
}
{
    const w = await mount({}, { ...REPLIES, sceneStatus: status({ running: false }) });
    check('scenes adapter stopped: warning above the list', /läuft nicht/.test(await w.innerText()));
}
{
    const w = await mount({}, REPLIES);
    check(
        'frontend editing off by default: no + and no ⋯',
        (await w.locator('[data-testid="scene-add"], [data-testid="scene-edit"]').count()) === 0,
    );
}

// ── edit dialog: "Szenen verwalten" ───────────────────────────────────────────
{
    await page.evaluate((replies) => {
        const a = window.__auraShot;
        a.mockSendTo(replies);
        a.unfoldSections();
        a.showWidgets(
            [
                {
                    id: 'w-scenes-cfg',
                    type: 'scenes',
                    title: 'Szenen',
                    gridPos: { x: 0, y: 0, w: 10, h: 12 },
                    options: {},
                },
            ],
            { editMode: true },
        );
        a.setEditMode(true);
    }, REPLIES);
    await page.locator('.aura-widget-w-scenes-cfg .aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const cfg = page.locator('[data-testid="scenes-cfg"]');
    await cfg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    const listed = await cfg.locator('[data-testid="scenes-cfg-scene"]').allInnerTexts();
    check(
        'edit dialog lists the own scenes',
        listed.length === 2 && /Essen/.test(listed.join('|')) && /Kino/.test(listed.join('|')),
        listed.join('|'),
    );
    check(
        'foreign scenes only counted',
        /Aus dem Szenen-Adapter: 1/.test(await cfg.innerText()),
        await cfg.innerText(),
    );

    await cfg
        .locator('[data-testid="scenes-cfg-scene"]', { hasText: 'Kino' })
        .locator('[data-testid="scenes-cfg-edit"]')
        .click();
    const mgr = page.locator('.aura-config-modal').filter({ has: page.locator('[data-testid="scene-mgr-header"]') });
    await mgr.waitFor();
    await page.waitForTimeout(300);
    const onTop = await mgr.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
        return !!top && el.contains(top);
    });
    check('scene editor opens above the edit dialog', onTop);
    const text = await mgr.innerText();
    check(
        'editor lists the devices with their values',
        /Stehlampe/.test(text) && /20 %/.test(text) && /Fernseher/.test(text),
        text.replace(/s+/g, ' ').slice(0, 200),
    );
    const detail = mgr.locator('[data-testid="scene-member-detail"]');
    const dp = detail.locator('[data-testid="scene-member-dp"]');
    check('first device selected: datapoint shown', (await dp.inputValue()) === 'demo.sc.lamp', await dp.inputValue());
    check('… and its value', (await detail.locator('input[data-testid="scene-value"]').inputValue()) === '20');

    // change the datapoint of an existing row
    await dp.fill('demo.sc.desk');
    await dp.press('Enter');
    await page.waitForTimeout(300);
    check(
        'datapoint changed: row renamed, value from the new device',
        /Schreibtisch/.test(await mgr.innerText()) &&
            (await detail.locator('[data-testid="scene-value"]').innerText()) === 'an',
        await detail.locator('[data-testid="scene-value"]').innerText(),
    );

    // reorder: drag the second row (Fernseher) onto the first
    await page.evaluate(() => {
        const m = [...document.querySelectorAll('.aura-config-modal')].find((x) =>
            x.querySelector('[data-testid="scene-mgr-header"]'),
        );
        window.__sceneGrips = [...m.querySelectorAll('[draggable="true"]')];
        window.__sceneDt = new DataTransfer();
        window.__sceneGrips[1].dispatchEvent(
            new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__sceneDt }),
        );
    });
    await page.waitForTimeout(100);
    for (const type of ['dragover', 'drop']) {
        await page.evaluate((t) => {
            const row = window.__sceneGrips[0].closest('.cursor-pointer');
            row.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: window.__sceneDt }));
        }, type);
        await page.waitForTimeout(100);
    }

    // add through the picker
    await pickDevices(mgr.locator('button', { hasText: 'Gerät hinzufügen' }), ['Modus']);
    check('no suggestions tab', (await mgr.locator('button:text-is("Geräte in diesem Bereich")').count()) === 0);

    await mgr.locator('[data-testid="scene-save"]').click();
    await mgr.waitFor({ state: 'detached' });
    const save = await lastCall('saveScene');
    check(
        'save: new order, changed datapoint, added device',
        save?.payload?.id === 'scene.0.aura.Kino' &&
            JSON.stringify(save?.payload?.members) ===
                JSON.stringify([
                    { id: 'demo.sc.tv', value: true },
                    { id: 'demo.sc.desk', value: true },
                    { id: 'demo.sc.mode', value: 1 },
                ]),
        JSON.stringify(save?.payload?.members),
    );
    check('edit dialog stays open', (await cfg.count()) === 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
