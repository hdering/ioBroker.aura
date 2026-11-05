// Verifies the Ansagen widget and the countdown's end announcement (issue #918).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/announcements-widget.mjs
//
// Checked: scope "own" lists only this device's rules, scope "device" adds the admin
// rules that speak here (read only: no pencil, switch off); a new rule is sent with
// announcementEdit/upsert, owned by and speaking on this device; the named triggers
// of option `triggers` replace the datapoint field; switching, editing (prefilled) and
// deleting (after a confirmation) the own rules; the test button of an admin rule
// speaks only here; allowCreate / allowOtherDevices; the countdown's Start carries the
// device along when an end announcement is set, and a plain "start" without one; the
// Zeitschaltuhr offers an announcement per event only with allowEventAnnounce, then
// runs without target datapoint and marks such events in its list.
// Backend replies come from the harness (mockSendTo), writes are captured (captureWrites).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const STATE = 'aura.0.config.announcements';

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

const REPLIES = {
    announcementEdit: { ok: true },
    announcementTest: { ok: true, text: 'Es hat geklingelt' },
};
const ADMIN = {
    id: 'a1',
    name: 'Klingel (Admin)',
    enabled: true,
    clause: { datapoint: 'demo.bell', operator: 'true', value: '' },
    text: 'Es hat geklingelt',
};

let n = 0;
/** Mounts one Ansagen widget over the given rules; returns its locator. */
async function mount(options = {}, rules = [ADMIN]) {
    n++;
    const id = `w-ann-${n}`;
    await page.evaluate(
        ([id, options, rules, replies, state]) => {
            const a = window.__auraShot;
            a.mockSendTo(replies);
            const vals = { [state]: JSON.stringify({ rules }) };
            a.mock(vals);
            a.mockServerState(vals);
            a.showWidgets([
                { id, type: 'announcements', title: 'Ansagen', gridPos: { x: 0, y: 0, w: 10, h: 12 }, options },
            ]);
        },
        [id, options, rules, REPLIES, STATE],
    );
    const w = page.locator(`.aura-widget-${id}`).first();
    await w.waitFor();
    await page.waitForTimeout(400);
    return w;
}
const calls = () => page.evaluate(() => window.__auraShot.sendToCalls());
const lastCall = async (command) => (await calls()).filter((c) => c.command === command).pop();
const modal = page.locator('[data-testid="announcement-modal"]');

// ── a new rule: owned by this device, speaking here ───────────────────────────
let clientId = '';
{
    const w = await mount();
    check('scope own: the admin rule is not listed', (await w.locator('[data-testid="announcement"]').count()) === 0);
    await w.locator('[data-testid="announcement-add"]').click();
    await modal.waitFor();
    check(
        'no triggers option: free datapoint field',
        (await modal.locator('input[data-testid="announcement-trigger"]').count()) === 1,
    );
    check(
        'devices: only this one without allowOtherDevices',
        (await modal.locator('[data-testid="announcement-devices"]').count()) === 0,
    );
    const save = modal.locator('[data-testid="announcement-save"]');
    check('save needs name, trigger and text', await save.isDisabled());
    await modal.locator('[data-testid="announcement-name"]').fill('Pizza');
    await modal.locator('input[data-testid="announcement-trigger"]').fill('demo.oven.done');
    await modal.locator('[data-testid="announcement-text"]').fill('Die Pizza ist fertig');
    await save.click();
    await modal.waitFor({ state: 'detached' });
    const call = await lastCall('announcementEdit');
    const p = call?.payload ?? {};
    clientId = p.clientId ?? '';
    check(
        'saved through announcementEdit/upsert',
        p.edit?.op === 'upsert' && p.edit.rule.name === 'Pizza' && p.edit.rule.clause.datapoint === 'demo.oven.done',
        JSON.stringify(p.edit),
    );
    check(
        'speaks on this device only',
        !!clientId && JSON.stringify(p.edit?.rule.clientIds) === JSON.stringify([clientId]),
        `${clientId} ${JSON.stringify(p.edit?.rule.clientIds)}`,
    );
}

// ── named triggers ────────────────────────────────────────────────────────────
{
    const w = await mount({
        triggers: [
            { dp: 'demo.bell', name: 'Haustürklingel' },
            { dp: 'demo.wash', name: 'Waschmaschine' },
        ],
    });
    await w.locator('[data-testid="announcement-add"]').click();
    await modal.waitFor();
    const sel = modal.locator('select[data-testid="announcement-trigger"]');
    const labels = await sel.locator('option').allInnerTexts();
    check('triggers: a select of names', labels.join('|') === 'Haustürklingel|Waschmaschine', labels.join('|'));
    check('first trigger preselected', (await sel.inputValue()) === 'demo.bell');
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
}

// ── own rules: switch, edit, delete ──────────────────────────────────────────
{
    const own = {
        ...ADMIN,
        id: 'k1',
        name: 'Pizza',
        owner: clientId,
        clientIds: [clientId],
        timeFrom: '07:00',
        timeTo: '22:00',
    };
    const w = await mount({}, [ADMIN, own]);
    const rows = w.locator('[data-testid="announcement"]');
    check('scope own: only the own rule', (await rows.count()) === 1 && /Pizza/.test(await rows.first().innerText()));
    check(
        'summary shows trigger and window',
        /07:00–22:00/.test(await rows.first().innerText()),
        await rows.first().innerText(),
    );

    await rows.first().locator('[data-testid="announcement-toggle"]').click();
    await page.waitForTimeout(200);
    const tog = (await lastCall('announcementEdit'))?.payload?.edit;
    check(
        'switch sends toggle off',
        tog?.op === 'toggle' && tog.id === 'k1' && tog.enabled === false,
        JSON.stringify(tog),
    );

    await rows.first().locator('[data-testid="announcement-edit"]').click();
    await modal.waitFor();
    check('edit is prefilled', (await modal.locator('[data-testid="announcement-name"]').inputValue()) === 'Pizza');
    await modal.locator('[data-testid="announcement-delete"]').click();
    await page.getByRole('button', { name: 'Ja' }).click();
    await modal.waitFor({ state: 'detached' });
    const del = (await lastCall('announcementEdit'))?.payload?.edit;
    check('delete after confirmation', del?.op === 'delete' && del.id === 'k1', JSON.stringify(del));
}

// ── scope device: admin rules read only, test speaks here only ───────────────
{
    const w = await mount({ scope: 'device' });
    const row = w.locator('[data-testid="announcement"]').first();
    check('scope device: admin rule listed', /Klingel/.test(await row.innerText()));
    check('admin rule: no pencil', (await row.locator('[data-testid="announcement-edit"]').count()) === 0);
    check('admin rule: switch disabled', await row.locator('[data-testid="announcement-toggle"]').isDisabled());
    await row.locator('[data-testid="announcement-test-row"]').click();
    await page.waitForTimeout(200);
    const test = (await lastCall('announcementTest'))?.payload?.rule;
    check(
        'test of an admin rule speaks only here',
        JSON.stringify(test?.clientIds) === JSON.stringify([clientId]),
        JSON.stringify(test?.clientIds),
    );
}

// ── switches ─────────────────────────────────────────────────────────────────
{
    const w = await mount({ allowCreate: false });
    check('allowCreate false: no add row', (await w.locator('[data-testid="announcement-add"]').count()) === 0);
    const w2 = await mount({ allowOtherDevices: true });
    await w2.locator('[data-testid="announcement-add"]').click();
    await modal.waitFor();
    check(
        'allowOtherDevices: device chips',
        (await modal.locator('[data-testid="announcement-devices"]').count()) === 1,
    );
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
}

// ── countdown: Start carries the device when an announcement is set ──────────
async function countdownStart(options) {
    n++;
    const id = `w-cd-${n}`;
    const base = `aura.0.countdowns.t918x${n}`;
    await page.evaluate(
        ([id, options, base]) => {
            const a = window.__auraShot;
            const vals = { [`${base}.state`]: 'idle', [`${base}.durationMs`]: 60000, [`${base}.remainingMs`]: 60000 };
            a.mock(vals);
            a.mockServerState(vals);
            a.showWidgets([
                {
                    id,
                    type: 'countdown',
                    title: 'Pizza',
                    gridPos: { x: 0, y: 0, w: 8, h: 8 },
                    options: { durationSec: 60, stateBaseId: base, ...options },
                },
            ]);
        },
        [id, options, base],
    );
    const w = page.locator(`.aura-widget-${id}`).first();
    await w.waitFor();
    await page.waitForTimeout(500);
    await w.getByRole('button', { name: 'Start' }).first().click();
    await page.waitForTimeout(200);
    const writes = await page.evaluate(() => window.__auraShot.writes?.() ?? []);
    const last = await page.evaluate(() => window.__auraShot.lastWrite);
    return { last, writes, base };
}
{
    const r = await countdownStart({ announceText: '{{title}} ist fertig' });
    let cmd = null;
    try {
        cmd = JSON.parse(String(r.last?.val));
    } catch {
        /* plain text */
    }
    check(
        'countdown with announcement: start carries the device',
        r.last?.id === `${r.base}.cmd` && cmd?.cmd === 'start' && cmd?.client === clientId,
        JSON.stringify(r.last),
    );
    const r2 = await countdownStart({});
    check(
        'countdown without announcement: plain start',
        r2.last?.id === `${r2.base}.cmd` && r2.last?.val === 'start',
        JSON.stringify(r2.last),
    );
}

// ── Zeitschaltuhr: an announcement per event, no target datapoint needed ─────
async function mountTimer(options) {
    n++;
    const id = `w-tm-${n}`;
    await page.evaluate(
        ([id, options]) => {
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'timer',
                    title: 'Müll',
                    gridPos: { x: 0, y: 0, w: 10, h: 10 },
                    options: { stateBaseId: `aura.0.timers.t918${id}`, events: [], ...options },
                },
            ]);
        },
        [id, options],
    );
    const w = page.locator(`.aura-widget-${id}`).first();
    await w.waitFor();
    await page.waitForTimeout(400);
    return w;
}
{
    const plain = await mountTimer({});
    await plain.getByTitle('Neues Ereignis').first().click();
    const field = page.locator('[data-testid="timer-event-announce"]');
    await page.waitForTimeout(300);
    check('timer without allowEventAnnounce: no announcement field', (await field.count()) === 0);
    await page.keyboard.press('Escape');

    const w = await mountTimer({ allowEventAnnounce: true });
    check(
        'announcement-only timer is not "target missing"',
        !/Ziel-DP fehlt/.test(await w.innerText()),
        await w.innerText(),
    );
    await w.getByTitle('Neues Ereignis').first().click();
    await field.waitFor();
    await field.fill('Die Mülltonne muss raus');
    check('hint: on this device', /auf diesem Gerät/.test(await field.locator('xpath=..').innerText()));
    await page.getByRole('button', { name: 'Speichern' }).last().click();
    await page.waitForTimeout(300);
    const badge = w.locator('[data-testid="timer-announce"]').first();
    check(
        'saved event shows the announcement',
        (await badge.count()) === 1 && (await badge.getAttribute('title')) === 'Ansage: Die Mülltonne muss raus',
        await badge.getAttribute('title').catch(() => ''),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
