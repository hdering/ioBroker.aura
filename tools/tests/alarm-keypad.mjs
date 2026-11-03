// Alarm widget (#911): touch keypad popup (`pinInput: 'keypad'`) and "Aktivieren nur
// mit PIN" (`requirePinForArm`). Checks which DP each PIN goes to:
//   AUS            → use.disable_password
//   SCHARF         → use.toggle_password                 (never while already armed)
//   Verzögert      → use.toggle_with_delay_and_password
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/alarm-keypad.mjs
//   SHOT_DIR=<dir> node tools/tests/alarm-keypad.mjs   → also writes PNGs
//
// Writes are captured by the harness (captureWrites) and never reach an instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR ?? '';
const PREFIX = 'demo.alarmtest.0';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const BASE_STATE = {
    [`${PREFIX}.status.enableable`]: true,
    [`${PREFIX}.status.burglar_alarm`]: false,
    [`${PREFIX}.status.silent_alarm`]: false,
    [`${PREFIX}.status.siren`]: false,
};
const DISARMED = { ...BASE_STATE, [`${PREFIX}.status.state_list`]: 0, [`${PREFIX}.status.activated`]: false };
const ARMED = { ...BASE_STATE, [`${PREFIX}.status.state_list`]: 1, [`${PREFIX}.status.activated`]: true };
const TRIGGERED = { ...ARMED, [`${PREFIX}.status.state_list`]: 3, [`${PREFIX}.status.burglar_alarm`]: true };

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

/** Mount a fresh widget (new id — the harness keeps known ids mounted). */
async function show(values, options) {
    const id = `w-alarmkp-${++n}`;
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
                gridPos: { x: 0, y: 0, w: 6, h: 8 },
                options: { alarmPrefix: PREFIX, ...options },
            },
            values,
        ],
    );
    await settle();
    return `.aura-widget-${id}`;
}
const writes = () => page.evaluate(() => window.__auraShot.writes());
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const modeButton = (sel, re) => page.locator(`${sel} button`, { hasText: re }).first();
const OFF = /^\s*(AUS|Aus|Off|OFF)\s*$/;
const SHARP = /^\s*(Scharf|SCHARF|Armed|ARMED)\s*$/;
const modal = () => page.locator('.aura-alarm-keypad');
const key = (d) => modal().locator('.aura-keypad button', { hasText: new RegExp(`^${d}$`) });
const typeOnPad = async (digits) => {
    for (const d of digits) await key(d).click();
};
const okButton = () => modal().locator('button', { hasText: /^\s*OK\s*$/ });
const oneWrite = (w, dp, val) => w.length === 1 && w[0].id === `${PREFIX}.${dp}` && String(w[0].val) === val;

// ── 1. Keypad: AUS opens the popup, digits + OK → use.disable_password ─────────
let sel = await show(ARMED, { requirePinForDisarm: true, pinInput: 'keypad' });
await resetWrites();
await modeButton(sel, OFF).click();
await settle();
check('keypad: AUS opens the popup', (await modal().count()) === 1);
check('keypad: no inline password field', (await page.locator(`${sel} input[type="password"]`).count()) === 0);
check('keypad: OK disabled while empty', await okButton().isDisabled());
await typeOnPad('1234');
// Physical keyboard works too: backspace + a digit.
await page.keyboard.press('Backspace');
await page.keyboard.press('9');
if (SHOT_DIR)
    await modal()
        .locator('> div')
        .screenshot({ path: `${SHOT_DIR}/keypad-disarm.png` });
await okButton().click();
await settle();
check(
    'keypad: PIN → use.disable_password',
    oneWrite(await writes(), 'use.disable_password', '1239'),
    JSON.stringify(await writes()),
);
check('keypad: popup closes after OK', (await modal().count()) === 0);

// Escape cancels without writing.
await resetWrites();
await modeButton(sel, OFF).click();
await settle();
await typeOnPad('55');
await page.keyboard.press('Escape');
await settle();
check('keypad: Escape closes the popup', (await modal().count()) === 0);
check('keypad: Escape writes nothing', (await writes()).length === 0);

// ── 2. Arm with PIN (inline field): SCHARF → use.toggle_password ──────────────
sel = await show(DISARMED, { requirePinForArm: true });
await resetWrites();
await modeButton(sel, SHARP).click();
await settle();
const field = page.locator(`${sel} input[type="password"]`);
check('arm: SCHARF opens the PIN field', (await field.count()) === 1);
check('arm: nothing written before the PIN', (await writes()).length === 0);
await field.fill('4321');
await field.press('Enter');
await settle();
check(
    'arm: PIN → use.toggle_password',
    oneWrite(await writes(), 'use.toggle_password', '4321'),
    JSON.stringify(await writes()),
);

// AUS stays without PIN when only arming requires one.
await resetWrites();
await modeButton(sel, OFF).click();
await settle();
check(
    'arm only: AUS writes use.disable directly',
    oneWrite(await writes(), 'use.disable', 'true'),
    JSON.stringify(await writes()),
);

// ── 3. Arm with PIN + keypad: delayed → use.toggle_with_delay_and_password ─────
sel = await show(DISARMED, { requirePinForArm: true, pinInput: 'keypad' });
await resetWrites();
await page
    .locator(`${sel} button`, { has: page.locator('svg.lucide-clock') })
    .first()
    .click();
await settle();
check('delay: opens the keypad', (await modal().count()) === 1);
const title = (await modal().textContent()) ?? '';
check('delay: title says arming', /einschalten|Arm alarm/.test(title), title.slice(0, 40));
if (SHOT_DIR)
    await modal()
        .locator('> div')
        .screenshot({ path: `${SHOT_DIR}/keypad-arm.png` });
await typeOnPad('77');
await okButton().click();
await settle();
check(
    'delay: PIN → use.toggle_with_delay_and_password',
    oneWrite(await writes(), 'use.toggle_with_delay_and_password', '77'),
    JSON.stringify(await writes()),
);

// ── 4. Already armed: SCHARF must not send the toggle (it would disarm) ──────
sel = await show(ARMED, { requirePinForArm: true, pinInput: 'keypad' });
await resetWrites();
await modeButton(sel, SHARP).click();
await settle();
check('armed: SCHARF opens no keypad', (await modal().count()) === 0);
check('armed: SCHARF writes nothing', (await writes()).length === 0, JSON.stringify(await writes()));

// ── 5. Triggered + keypad: a button reopens the popup ─────────────────────────
sel = await show(TRIGGERED, { requirePinForDisarm: true, pinInput: 'keypad' });
check('triggered: open-keypad button shown', (await page.locator(`${sel} .aura-alarm-keypad-open`).count()) === 1);
check('triggered: no inline field', (await page.locator(`${sel} input[type="password"]`).count()) === 0);
if (SHOT_DIR) await page.locator(sel).screenshot({ path: `${SHOT_DIR}/keypad-triggered.png` });
await resetWrites();
await page.locator(`${sel} .aura-alarm-keypad-open`).click();
await settle();
await typeOnPad('0000');
await okButton().click();
await settle();
check(
    'triggered: PIN → use.disable_password',
    oneWrite(await writes(), 'use.disable_password', '0000'),
    JSON.stringify(await writes()),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
