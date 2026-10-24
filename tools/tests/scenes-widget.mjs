// Verifies the scenes widget (issue #825).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/scenes-widget.mjs
//
// Checked: own scenes listed, foreign scenes only with showForeignScenes and without "⋯";
// the active scene (state true) highlighted; a tap writes true to the scene; the tiles layout;
// the popup suggests the datapoints of the section's widgets, a suggestion joins with its
// current value, values are edited per type (on/off, number, states list) and sent with
// saveScene; "Current values" refreshes them; removing a device; editing sends the scene id;
// delete asks first, then sends deleteScene; the datapoint picker opens above the popup and
// Escape closes only the picker; the notices for a missing / stopped scenes adapter;
// editing in the frontend only with allowEdit; the edit dialog's "Manage scenes" section
// lists the own scenes and opens the same popup.
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
const status = (patch = {}) => ({ ok: true, instance: 'scenes.0', installed: true, running: true, ...patch });
const OK = { ok: true, id: 'scene.0.aura.Neu', missing: [] };

let n = 0;
/** Mounts one scenes widget (plus widgets whose datapoints are the suggestions); returns its locator. */
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

    const lookup = await lastCall('sceneDevices');
    const asked = JSON.stringify(lookup?.payload?.ids ?? []);
    check(
        'popup looks up the datapoints of the section',
        /demo\.sc\.desk/.test(asked) && /demo\.sc\.mode/.test(asked),
        asked,
    );
    const sugg = await modal.locator('[data-testid="scene-suggestion"]').allInnerTexts();
    check(
        'suggestions: section devices only',
        sugg.length === 2 && sugg.includes('Schreibtisch') && sugg.includes('Modus'),
        sugg.join('|'),
    );

    await modal.locator('[data-testid="scene-suggestion"]', { hasText: 'Schreibtisch' }).click();
    const toggle = row('Schreibtisch').locator('[data-testid="scene-value"]');
    check('suggestion joins with its current value', (await toggle.innerText()) === 'an', await toggle.innerText());
    check(
        'joined device leaves the suggestions',
        (await modal.locator('[data-testid="scene-suggestion"]', { hasText: 'Schreibtisch' }).count()) === 0,
    );
    await toggle.click();
    check('on/off toggles', (await toggle.innerText()) === 'aus');

    await modal.locator('[data-testid="scene-suggestion"]', { hasText: 'Modus' }).click();
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
    check('"More devices" opens the datapoint picker', (await picker.count()) > 0);
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
    await modal.waitFor();
    const visible = await modal.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
        return !!top && el.contains(top);
    });
    check('popup opens above the edit dialog', visible);
    await row('Stehlampe').locator('input[data-testid="scene-value"]').fill('55');
    await modal.locator('[data-testid="scene-save"]').click();
    await modal.waitFor({ state: 'detached' });
    const save = await lastCall('saveScene');
    check(
        'edit dialog saves through the same popup',
        save?.payload?.id === 'scene.0.aura.Kino' &&
            JSON.stringify(save?.payload?.members?.[0]) === JSON.stringify({ id: 'demo.sc.lamp', value: '55' }),
        JSON.stringify(save?.payload),
    );
    check('edit dialog stays open', (await cfg.count()) === 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
