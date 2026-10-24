// Verifies the scenes widget (issue #825).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/scenes-widget.mjs
//
// Checked: own scenes listed, foreign scenes only with showForeignScenes and without "⋯";
// the active scene (state true) highlighted; a tap writes true to the scene; the tiles layout;
// "+ Neue Szene" sends saveScene with name + chosen devices; editing sends the scene id;
// "Neu lernen" sends learnScene; delete asks first, then sends deleteScene; the PIN field
// appears with pinRequired and travels along; a wrong PIN shows the error; the notices for a
// missing / stopped scenes adapter and for an empty device list; allowEdit off hides editing.
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

const DEV = [
    { id: 'demo.sc.lamp', name: 'Stehlampe', label: 'Stehlampe', type: 'number', unit: '%' },
    { id: 'demo.sc.tv', name: 'Fernseher', label: '', type: 'boolean', unit: '' },
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
const status = (patch = {}) => ({
    ok: true,
    instance: 'scenes.0',
    installed: true,
    running: true,
    pinRequired: false,
    devices: DEV,
    ...patch,
});
const OK = { ok: true, id: 'scene.0.aura.Neu', missing: [] };

let n = 0;
/** Mounts one scenes widget with the given backend replies; returns its locator. */
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
    saveScene: OK,
    learnScene: { ok: true, missing: [] },
    deleteScene: { ok: true },
};

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
    const w = await mount({}, REPLIES);
    await w.locator('[data-testid="scene-add"]').click();
    const modal = page.locator('[data-testid="scene-modal"]');
    await modal.waitFor();
    const save = modal.locator('[data-testid="scene-save"]');
    check('save disabled without name and devices', await save.isDisabled());
    await modal.locator('[data-testid="scene-name"]').fill('Lesen');
    await modal.locator('[data-testid="scene-device"]', { hasText: 'Stehlampe' }).click();
    await save.click();
    await modal.waitFor({ state: 'detached' });
    const call = await lastCall('saveScene');
    check(
        'new scene: saveScene with name and devices, no id',
        call?.payload?.name === 'Lesen' &&
            JSON.stringify(call?.payload?.members) === '["demo.sc.lamp"]' &&
            !('id' in (call?.payload ?? {})),
        JSON.stringify(call?.payload),
    );
}

// ── edit / learn / delete ─────────────────────────────────────────────────────
{
    const w = await mount({}, REPLIES);
    await w.locator('[data-testid="scene"]', { hasText: 'Kino' }).locator('[data-testid="scene-edit"]').click();
    const modal = page.locator('[data-testid="scene-modal"]');
    await modal.waitFor();
    const text = await modal.innerText();
    check(
        'edit shows stored values',
        /20 %/.test(text) && /\ban\b/.test(text),
        text.replace(/\s+/g, ' ').slice(0, 160),
    );
    check(
        'editing does not trigger the scene',
        (await page.evaluate(() => window.__auraShot.lastWrite))?.id !== 'scene.0.aura.Kino',
    );

    await modal.locator('[data-testid="scene-learn"]').click();
    await page.waitForTimeout(300);
    const learn = await lastCall('learnScene');
    check(
        'learn sends learnScene with the id',
        learn?.payload?.id === 'scene.0.aura.Kino',
        JSON.stringify(learn?.payload),
    );
    check(
        'learn confirms in the popup',
        /übernommen/.test(await modal.locator('[data-testid="scene-msg"]').innerText()),
    );

    await modal.locator('[data-testid="scene-device"]', { hasText: 'Fernseher' }).click();
    await modal.locator('[data-testid="scene-save"]').click();
    await modal.waitFor({ state: 'detached' });
    const save = await lastCall('saveScene');
    check(
        'edit: saveScene with id and remaining devices',
        save?.payload?.id === 'scene.0.aura.Kino' && JSON.stringify(save?.payload?.members) === '["demo.sc.lamp"]',
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

// ── PIN ───────────────────────────────────────────────────────────────────────
{
    const w = await mount(
        {},
        { ...REPLIES, sceneStatus: status({ pinRequired: true }), saveScene: { ok: false, error: 'pin' } },
    );
    await w.locator('[data-testid="scene-add"]').click();
    const modal = page.locator('[data-testid="scene-modal"]');
    await modal.locator('[data-testid="scene-name"]').fill('Mit PIN');
    await modal.locator('[data-testid="scene-device"]').first().click();
    const save = modal.locator('[data-testid="scene-save"]');
    check('pin required: save disabled until a PIN is typed', await save.isDisabled());
    await modal.locator('[data-testid="scene-pin"]').fill('0000');
    await save.click();
    await page.waitForTimeout(300);
    const call = await lastCall('saveScene');
    check('PIN travels with the write', call?.payload?.pin === '0000', JSON.stringify(call?.payload));
    const msg = await modal.locator('[data-testid="scene-msg"]').innerText();
    check('wrong PIN shown, popup stays open', /Falscher PIN/.test(msg), msg);
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
    const w = await mount({}, { ...REPLIES, sceneStatus: status({ devices: [] }) });
    check('no devices allowed: hint to the instance settings', /Instanz-Einstellungen/.test(await w.innerText()));
}
{
    const w = await mount({ allowEdit: false }, REPLIES);
    check(
        'allowEdit off: no + and no ⋯',
        (await w.locator('[data-testid="scene-add"], [data-testid="scene-edit"]').count()) === 0,
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
