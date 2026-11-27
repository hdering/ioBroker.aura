// Alarm widget without the alarm adapter (#1037): own datapoints, mode buttons and
// zones from the widget options or from a JSON datapoint, PIN via a datapoint, and
// the label/order overrides in adapter mode.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/alarm-manual.mjs
//   SHOT_DIR=<dir> node tools/tests/alarm-manual.mjs   → also writes PNGs
//
// Writes are captured by the harness (captureWrites) and never reach an instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR ?? '';
const D = 'demo.alarmmanual.0';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const settle = () => page.waitForTimeout(400);
let n = 0;

async function show(values, options, h = 8) {
    const id = `w-alarm-manual-${++n}`;
    await page.evaluate(
        ([cfg, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState?.(vals);
            window.__auraShot.showWidgets([cfg]);
            window.__auraShot.mock(vals);
        },
        [
            {
                id,
                type: 'alarm',
                title: 'Alarmanlage',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 6, h },
                options,
            },
            values,
        ],
    );
    await settle();
    return `.aura-widget-${id}`;
}
const setValues = async (vals) => {
    await page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState?.(v);
    }, vals);
    await settle();
};
const shot = async (sel, file) => {
    if (SHOT_DIR)
        await page
            .locator(sel)
            .first()
            .screenshot({ path: `${SHOT_DIR}/${file}.png` });
};
const writes = () => page.evaluate(() => window.__auraShot.writes());
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const modeTexts = (sel) => page.locator(`${sel} .aura-alarm-mode`).allInnerTexts();
const activeModes = (sel) => page.locator(`${sel} .aura-alarm-mode[data-active="true"]`).allInnerTexts();
const pill = (sel) => page.locator(`${sel} .aura-alarm-state`).innerText();
const norm = (a) => a.map((s) => s.trim().toUpperCase());

// ── 1. Boolean state, default modes AUS / SCHARF ─────────────────────────────
const MANUAL = {
    sourceMode: 'manual',
    stateDp: `${D}.state`,
    modes: [
        { key: 'off', label: 'Aus', disarm: true, writeValue: 'false' },
        { key: 'armed', label: 'Scharf', writeValue: 'true' },
    ],
};
let sel = await show({ [`${D}.state`]: false }, MANUAL);
check(
    'bool: two buttons',
    JSON.stringify(norm(await modeTexts(sel))) === '["AUS","SCHARF"]',
    JSON.stringify(await modeTexts(sel)),
);
check(
    'bool: AUS active at false',
    JSON.stringify(norm(await activeModes(sel))) === '["AUS"]',
    JSON.stringify(await activeModes(sel)),
);
check('bool: pill says deactivated', /deaktiviert/i.test(await pill(sel)), await pill(sel));
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /scharf/i }).click();
await settle();
let w = await writes();
check(
    'bool: SCHARF writes true into the state dp',
    w.length === 1 && w[0].id === `${D}.state` && w[0].val === true,
    JSON.stringify(w),
);
await setValues({ [`${D}.state`]: true });
check(
    'bool: state true lights SCHARF',
    JSON.stringify(norm(await activeModes(sel))) === '["SCHARF"]',
    JSON.stringify(await activeModes(sel)),
);
check('bool: pill says armed', /scharf/i.test(await pill(sel)), await pill(sel));
check('bool: no delay/panic/zones without dps', (await page.locator(`${sel} .aura-alarm-zones`).count()) === 0);
await shot(sel, 'manual-bool');

// ── 2. Number state with map, triggered + PIN via datapoint ──────────────────
const MAPPED = {
    ...MANUAL,
    modes: [
        { key: 'off', label: 'Aus', disarm: true, writeValue: '0' },
        { key: 'armed', label: 'Scharf', writeValue: '1' },
    ],
    stateMap: [
        { value: '0', phase: 'off' },
        { value: '1', phase: 'armed', label: 'Abwesend' },
        { value: '2', phase: 'triggered' },
    ],
    requirePinForDisarm: true,
    pinCheck: 'dp',
    pinDp: `${D}.pin`,
    wrongPinDp: `${D}.wrongPin`,
};
sel = await show({ [`${D}.state`]: 1, [`${D}.wrongPin`]: false }, MAPPED);
check('map: own label in pill', /abwesend/i.test(await pill(sel)), await pill(sel));
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /aus/i }).click();
await settle();
check('pin: AUS opens the PIN field', (await page.locator(`${sel} input[type="password"]`).count()) === 1);
check('pin: nothing written before the PIN', (await writes()).length === 0, JSON.stringify(await writes()));
await page.locator(`${sel} input[type="password"]`).fill('1234');
await page.locator(`${sel} input[type="password"]`).press('Enter');
await settle();
w = await writes();
let payload = null;
try {
    payload = JSON.parse(w[0]?.val);
} catch {
    /* checked below */
}
check(
    'pin: JSON request into the pin dp',
    w.length === 1 &&
        w[0].id === `${D}.pin` &&
        payload?.pin === '1234' &&
        payload?.mode === 'off' &&
        payload?.value === '0',
    JSON.stringify(w),
);
check('pin: state dp itself not written', !w.some((x) => x.id === `${D}.state`));

await setValues({ [`${D}.state`]: 2, [`${D}.wrongPin`]: true });
check('triggered: pill says burglary', /einbruch/i.test(await pill(sel)), await pill(sel));
check('triggered: PIN field stays open', (await page.locator(`${sel} input[type="password"]`).count()) === 1);
check('triggered: wrong PIN feedback shown', (await page.locator(sel, { hasText: /falsche pin/i }).count()) === 1);
await shot(sel, 'manual-triggered');

await setValues({ [`${D}.state`]: 7, [`${D}.wrongPin`]: false });
check('map: unknown value shows the raw value', (await pill(sel)).trim() === '7', await pill(sel));

// PIN "plain" payload
sel = await show({ [`${D}.state`]: 1 }, { ...MAPPED, pinPayload: 'pin' });
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /aus/i }).click();
await settle();
await page.locator(`${sel} input[type="password"]`).fill('99');
await page.locator(`${sel} input[type="password"]`).press('Enter');
await settle();
w = await writes();
check('pin: plain payload writes only the PIN', w.length === 1 && w[0].val === '99', JSON.stringify(w));

// Without a PIN check the PIN switches have no effect
sel = await show({ [`${D}.state`]: 1 }, { ...MAPPED, pinCheck: 'none' });
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /aus/i }).click();
await settle();
w = await writes();
check(
    'pinCheck none: AUS writes the state at once',
    w.length === 1 && w[0].id === `${D}.state` && w[0].val === 0,
    JSON.stringify(w),
);

// ── 3. Modes from a JSON datapoint, live ─────────────────────────────────────
const MODES_JSON = JSON.stringify([
    { key: 'off', label: 'Aus', icon: 'ShieldOff', disarm: true, writeValue: '0' },
    { key: 'away', label: 'Weg', writeDp: `${D}.cmd`, writeValue: 'away', activeWhen: '1' },
    { key: 'night', label: 'Nacht', icon: 'Moon', color: '#6366f1', writeValue: '2' },
]);
sel = await show(
    { [`${D}.state`]: 1, [`${D}.modes`]: MODES_JSON },
    { sourceMode: 'manual', stateDp: `${D}.state`, modesSource: 'json', modesDp: `${D}.modes` },
);
check(
    'json: three buttons',
    JSON.stringify(norm(await modeTexts(sel))) === '["AUS","WEG","NACHT"]',
    JSON.stringify(await modeTexts(sel)),
);
check(
    'json: activeWhen lights WEG',
    JSON.stringify(norm(await activeModes(sel))) === '["WEG"]',
    JSON.stringify(await activeModes(sel)),
);
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /weg/i }).click();
await settle();
w = await writes();
check(
    'json: own writeDp/writeValue',
    w.length === 1 && w[0].id === `${D}.cmd` && w[0].val === 'away',
    JSON.stringify(w),
);
// Offline, useDatapoint does not receive harness updates after the mount (it only
// subscribes while connected) — a changed JSON value is checked as a fresh mount.
const JSON_OPTS = { sourceMode: 'manual', stateDp: `${D}.state`, modesSource: 'json', modesDp: `${D}.modes` };
sel = await show({ [`${D}.state`]: 1, [`${D}.modes`]: '{"0":"Aus","1":"Scharf"}' }, JSON_OPTS);
check(
    'json: map form gives the buttons',
    JSON.stringify(norm(await modeTexts(sel))) === '["AUS","SCHARF"]',
    JSON.stringify(await modeTexts(sel)),
);
check(
    'json: map form, key = written value, lights at 1',
    JSON.stringify(norm(await activeModes(sel))) === '["SCHARF"]',
    JSON.stringify(await activeModes(sel)),
);
sel = await show({ [`${D}.state`]: 1, [`${D}.modes`]: 'kaputt' }, JSON_OPTS);
check('json: broken JSON → no buttons', (await page.locator(`${sel} .aura-alarm-mode`).count()) === 0);
await shot(sel, 'manual-json-broken');

// ── 4. Zones ─────────────────────────────────────────────────────────────────
sel = await show({ [`${D}.state`]: false }, { ...MANUAL, zones: [] });
check('zones: empty list → no zone row', (await page.locator(`${sel} .aura-alarm-zones`).count()) === 0);
const five = Array.from({ length: 5 }, (_, i) => ({ key: `z${i}`, label: `Z${i}`, onOffDp: `${D}.z${i}` }));
sel = await show(
    { [`${D}.state`]: false, ...Object.fromEntries(five.map((z, i) => [z.onOffDp, i === 0])) },
    { ...MANUAL, zones: five },
);
check('zones: five tiles', (await page.locator(`${sel} .aura-alarm-zone`).count()) === 5);
await resetWrites();
await page.locator(`${sel} .aura-alarm-zone[data-zone="z0"]`).click();
await settle();
w = await writes();
check(
    'zones: click toggles the on/off dp',
    w.length === 1 && w[0].id === `${D}.z0` && w[0].val === false,
    JSON.stringify(w),
);
sel = await show(
    {
        [`${D}.state`]: false,
        [`${D}.zones`]: JSON.stringify({
            zones: [{ key: 'eg', label: 'EG', onOffDp: `${D}.eg`, triggeredDp: `${D}.egAlarm` }],
        }),
        [`${D}.eg`]: true,
        [`${D}.egAlarm`]: true,
    },
    { ...MANUAL, zonesSource: 'json', zonesDp: `${D}.zones` },
);
check(
    'zones json: wrapper form',
    (await page.locator(`${sel} .aura-alarm-zone`).allInnerTexts()).join('|').includes('EG'),
);
check('zones json: triggered marker', (await page.locator(`${sel} .aura-alarm-zone`).innerText()).includes('⚠'));

// ── 5. Contacts, countdown, notice, delay, panic ─────────────────────────────
sel = await show(
    {
        [`${D}.state`]: false,
        [`${D}.win`]: true,
        [`${D}.door`]: false,
        [`${D}.cd`]: 30,
        [`${D}.notice`]: 'Sabotage Kontakt Keller',
    },
    {
        ...MANUAL,
        contacts: [
            { dp: `${D}.win`, name: 'Fenster Bad' },
            { dp: `${D}.door`, name: 'Haustür' },
        ],
        contactsBlockArm: true,
        countdownDp: `${D}.cd`,
        noticeDp: `${D}.notice`,
        quitDp: `${D}.quit`,
        delayDp: `${D}.delay`,
        panicDp: `${D}.panic`,
        showPanic: true,
        panicConfirm: false,
    },
    10,
);
const circuits = await page.locator(`${sel} .aura-alarm-circuits`).innerText();
check(
    'contacts: open contact listed by name',
    circuits.includes('Fenster Bad') && !circuits.includes('Haustür'),
    circuits,
);
check(
    'contacts: arming blocked while open',
    await page.locator(`${sel} .aura-alarm-mode`, { hasText: /scharf/i }).isDisabled(),
);
check('countdown shown', (await page.locator(`${sel} .aura-alarm-countdown`).innerText()).includes('30s'));
check('notice text shown', (await page.locator(`${sel} .aura-alarm-notice`).innerText()).includes('Sabotage'));
await resetWrites();
await page.locator(`${sel} .aura-alarm-notice button`).click();
await page.locator(`${sel} button`, { hasText: /verzögerung/i }).click();
await page.locator(`${sel} button`, { hasText: /panik/i }).click();
await settle();
w = await writes();
check(
    'quit / delay / panic write their dps',
    JSON.stringify(w.map((x) => [x.id, x.val])) ===
        JSON.stringify([
            [`${D}.quit`, true],
            [`${D}.delay`, true],
            [`${D}.panic`, true],
        ]),
    JSON.stringify(w),
);
await shot(sel, 'manual-full');

// ── 6. Adapter mode: own labels and order ────────────────────────────────────
const P = 'demo.alarmtest.0';
sel = await show(
    { [`${P}.status.state_list`]: 0, [`${P}.status.enableable`]: true },
    {
        alarmPrefix: P,
        modes: [{ key: 'sharp', label: 'Weg' }, { key: 'off' }, { key: 'night', hidden: true }],
        zones: [
            { key: 'two', label: 'Garage' },
            { key: 'three', hidden: true },
        ],
        showModeInside: false,
    },
);
check(
    'adapter: own order, label, hidden + legacy switch',
    JSON.stringify(norm(await modeTexts(sel))) === '["WEG","AUS"]',
    JSON.stringify(await modeTexts(sel)),
);
check(
    'adapter: zone label + hidden',
    JSON.stringify(
        await page.locator(`${sel} .aura-alarm-zone`).evaluateAll((els) => els.map((e) => e.dataset.zone)),
    ) === '["two","one"]',
);
check(
    'adapter: zone label text',
    (await page.locator(`${sel} .aura-alarm-zone[data-zone="two"]`).innerText()).includes('Garage'),
);
await resetWrites();
await page.locator(`${sel} .aura-alarm-mode`, { hasText: /weg/i }).click();
await settle();
w = await writes();
check(
    'adapter: renamed SCHARF still writes use.list = 1',
    w.length === 1 && w[0].id === `${P}.use.list` && w[0].val === 1,
    JSON.stringify(w),
);
sel = await show(
    {
        [`${P}.status.state_list`]: 0,
        [`${P}.modesCfg`]: '[{"key":"off","label":"Unscharf"},{"key":"bogus","label":"X","writeDp":"a.0.b"}]',
    },
    { alarmPrefix: P, modesSource: 'json', modesDp: `${P}.modesCfg` },
);
check(
    'adapter json: label override, unknown key ignored',
    JSON.stringify(norm(await modeTexts(sel))) === '["UNSCHARF","SCHARF","INNEN","NACHT"]',
    JSON.stringify(await modeTexts(sel)),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
