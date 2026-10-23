// Alarm widget: "Deaktivieren nur mit PIN" must open the PIN field on AUS even
// while no alarm is triggered (armed only) — it used to set an invisible flag and
// do nothing. Also checks the cancel button, the numeric keypad hint and that the
// PIN goes to use.disable_password (never use.disable).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/alarm-pin-disarm.mjs
//   SHOT_DIR=<dir> node tools/tests/alarm-pin-disarm.mjs   → also writes PNGs
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

const ARMED = {
    [`${PREFIX}.status.state_list`]: 1,
    [`${PREFIX}.status.activated`]: true,
    [`${PREFIX}.status.enableable`]: true,
    [`${PREFIX}.status.burglar_alarm`]: false,
    [`${PREFIX}.status.silent_alarm`]: false,
    [`${PREFIX}.status.siren`]: false,
};
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
    const id = `w-alarm-${++n}`;
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
const shot = async (sel, file) => {
    if (SHOT_DIR)
        await page
            .locator(sel)
            .first()
            .screenshot({ path: `${SHOT_DIR}/${file}.png` });
};
const writes = () => page.evaluate(() => window.__auraShot.writes());
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const offButton = (sel) => page.locator(`${sel} button`, { hasText: /^\s*(AUS|Aus|Off|OFF)\s*$/ }).first();

// ── 1. Armed, PIN required: AUS opens the PIN field ──────────────────────────
let sel = await show(ARMED, { requirePinForDisarm: true });
const pinInput = () => page.locator(`${sel} input[type="password"]`);
check('armed: no PIN field before AUS', (await pinInput().count()) === 0);
await resetWrites();
await offButton(sel).click();
await settle();
check('armed: AUS opens the PIN field', (await pinInput().count()) === 1);
check(
    'PIN field asks for the numeric keypad',
    (await pinInput().getAttribute('inputmode')) === 'numeric',
    String(await pinInput().getAttribute('inputmode')),
);
check('AUS with PIN writes nothing yet', (await writes()).length === 0, JSON.stringify(await writes()));
await shot(sel, 'armed-pin-open');

// Cancel → back to the mode buttons, nothing written.
await page.locator(`${sel} button[aria-label]`, { has: page.locator('svg.lucide-x') }).click();
await settle();
check('cancel closes the PIN field', (await pinInput().count()) === 0);
check('cancel shows the mode buttons again', (await offButton(sel).count()) === 1);
check('cancel writes nothing', (await writes()).length === 0);

// Submit → use.disable_password with the PIN, field closes.
await offButton(sel).click();
await settle();
await pinInput().fill('1234');
await pinInput().press('Enter');
await settle();
const w = await writes();
check(
    'PIN goes to use.disable_password',
    w.length === 1 && w[0].id === `${PREFIX}.use.disable_password` && String(w[0].val) === '1234',
    JSON.stringify(w),
);
check('submit closes the PIN field', (await pinInput().count()) === 0);

// ── 2. Armed, no PIN: AUS writes use.disable directly ───────────────────────
sel = await show(ARMED, { requirePinForDisarm: false });
await resetWrites();
await offButton(sel).click();
await settle();
const w2 = await writes();
check(
    'without PIN: AUS writes use.disable',
    w2.length === 1 && w2[0].id === `${PREFIX}.use.disable` && w2[0].val === true,
    JSON.stringify(w2),
);
check('without PIN: no PIN field', (await page.locator(`${sel} input[type="password"]`).count()) === 0);

// ── 3. Triggered, PIN required: field shown at once, no cancel ───────────────
sel = await show(TRIGGERED, { requirePinForDisarm: true });
check(
    'triggered: PIN field shown without a click',
    (await page.locator(`${sel} input[type="password"]`).count()) === 1,
);
check(
    'triggered: no cancel button',
    (await page.locator(`${sel} button`, { has: page.locator('svg.lucide-x') }).count()) === 0,
);
await shot(sel, 'triggered-pin');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
