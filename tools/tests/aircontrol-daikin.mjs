// The `aircontrol` widget on an air conditioner whose datapoints exist once per
// operation mode — Daikin via daikin-cloud (#650).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/aircontrol-daikin.mjs
//
// climate-mode-paths.mjs pins the path arithmetic. This pins what the user sees:
// the setpoint has to FOLLOW the mode (cooling and heating are different states,
// not one value), disappear where the mode has none, and bring that mode's own
// limits with it. The fan level 1…5 and the vane positions hang off the same
// mechanism.
//
// Values and objects are injected through the screenshot harness, so no Daikin
// device is involved. The ids and their common blocks are the ones from the
// export attached to the issue — under a device root that deliberately does not
// exist anywhere, so a live subscription cannot answer over the fixture.
// captureWrites() keeps the clicks off the socket:
// without it the invented setpoints land in the states database of whatever
// ioBroker the dev server proxies, and the next run reads them back.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const ROOT = 'daikin-cloud.0.aura-selftest-device';
const CC = `${ROOT}.climateControl`;
const setpoint = (m) => `${CC}.temperatureControl.operationModes.${m}.setpoints.roomTemperature`;
const fanMode = (m) => `${CC}.fanControl.operationModes.${m}.fanSpeed.currentMode`;
const fanFixed = (m) => `${CC}.fanControl.operationModes.${m}.fanSpeed.modes.fixed`;
const vaneV = (m) => `${CC}.fanControl.operationModes.${m}.fanDirection.vertical.currentMode`;

const OPTIONS = {
    deviceType: 'daikin-cloud',
    powerDp: `${CC}.onOffMode`,
    modeDp: `${CC}.operationMode`,
    currentTempDp: `${CC}.sensoryData.roomTemperature`,
    targetTempDp: setpoint('{mode}'),
    fanSpeedDp: fanMode('{mode}'),
    fanSpeedFixedDp: fanFixed('{mode}'),
    vaneVDp: vaneV('{mode}'),
    boostDp: `${CC}.powerfulMode`,
    onlineDp: `${ROOT}.cloudConnected`,
    humidityDp: `${CC}.sensoryData.roomHumidity`,
    outsideTempDp: `${CC}.sensoryData.outdoorTemperature`,
    showVanes: true,
    showBoost: true,
    showHumidity: true,
    showOutside: true,
    decimals: 1,
};

// Only the modes the device really owns each field in: "dry" has no setpoint and
// only an "auto" fan, "fanOnly" has no setpoint either.
const OBJECTS = {
    [`${CC}.operationMode`]: {
        common: { type: 'number', states: { 0: 'fanOnly', 1: 'heating', 2: 'cooling', 3: 'auto', 4: 'dry' } },
    },
    [setpoint('heating')]: { common: { type: 'number', min: 10, max: 30, step: 0.5 } },
    [setpoint('cooling')]: { common: { type: 'number', min: 18, max: 32, step: 0.5 } },
    [setpoint('auto')]: { common: { type: 'number', min: 18, max: 30, step: 0.5 } },
    [fanMode('heating')]: { common: { type: 'number', states: { 0: 'auto', 1: 'quiet', 2: 'fixed' } } },
    [fanMode('cooling')]: { common: { type: 'number', states: { 0: 'auto', 1: 'quiet', 2: 'fixed' } } },
    [fanMode('dry')]: { common: { type: 'number', states: { 0: 'auto' } } },
    [fanFixed('heating')]: { common: { type: 'number', min: 1, max: 5, step: 1 } },
    [fanFixed('cooling')]: { common: { type: 'number', min: 1, max: 5, step: 1 } },
    [vaneV('heating')]: { common: { type: 'number', states: { 0: 'stop', 1: 'swing', 2: 'windNice' } } },
    [vaneV('cooling')]: { common: { type: 'number', states: { 0: 'stop', 1: 'swing', 2: 'windNice' } } },
};

const VALUES = {
    [`${CC}.onOffMode`]: true,
    [`${CC}.operationMode`]: 2,
    [`${CC}.sensoryData.roomTemperature`]: 23.5,
    [`${CC}.sensoryData.roomHumidity`]: 48,
    [`${CC}.sensoryData.outdoorTemperature`]: 31,
    [`${ROOT}.cloudConnected`]: true,
    [`${CC}.powerfulMode`]: false,
    [setpoint('cooling')]: 24,
    [setpoint('heating')]: 21,
    [setpoint('auto')]: 22,
    [fanMode('cooling')]: 2,
    [fanMode('heating')]: 0,
    [fanMode('dry')]: 0,
    [fanFixed('cooling')]: 3,
    [fanFixed('heating')]: 1,
    [vaneV('cooling')]: 1,
    [vaneV('heating')]: 0,
};

await page.evaluate(
    ([objects, values]) => {
        window.__auraShot.captureWrites(true);
        window.__auraShot.mockObject(objects);
        window.__auraShot.mock(values);
        window.__auraShot.mockServerState(values);
    },
    [OBJECTS, VALUES],
);

async function show() {
    await page.evaluate((options) => {
        window.__auraShot.showWidgets([
            {
                id: 'ac',
                type: 'aircontrol',
                title: 'Klima Wohnzimmer',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options,
            },
        ]);
    }, OPTIONS);
    await page.waitForSelector('.aura-widget-ac', { timeout: 10000 });
    await page.evaluate((values) => window.__auraShot.mock(values), VALUES);
    await page.waitForTimeout(700);
}

/** Sets the operation mode and waits for the per-mode datapoints to be re-read. */
async function setMode(v) {
    await page.evaluate(([id, val]) => window.__auraShot.mock({ [id]: val }), [`${CC}.operationMode`, v]);
    await page.waitForTimeout(400);
    // The widget has just subscribed to a different set of ids; hand it the
    // fixture for them, the way the device would answer — with the mode itself
    // left at the value just set, not reset to the fixture's.
    await page.evaluate(
        ([values, id, val]) => window.__auraShot.mock({ ...values, [id]: val }),
        [VALUES, `${CC}.operationMode`, v],
    );
    await page.waitForTimeout(400);
}

const text = () => page.evaluate(() => document.querySelector('.aura-widget-ac')?.textContent ?? '');
const buttons = () =>
    page.evaluate(() => [...document.querySelectorAll('.aura-widget-ac button')].map((b) => b.textContent.trim()));
const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

await show();

// ── 1. Cooling: the cooling setpoint, not "the" setpoint ────────────────────
let txt = await text();
check('the room temperature is shown', txt.includes('23,5') || txt.includes('23.5'), txt);
check('the cooling setpoint is shown', txt.includes('24'), txt);
check('the heating setpoint is NOT shown', !txt.includes('21,0') && !txt.includes('21.0'), txt);
check('the humidity is shown', txt.includes('48'), txt);
check('the outside temperature is shown', txt.includes('31'), txt);

let btns = await buttons();
check(
    'the mode buttons carry translated state names',
    btns.includes('Kühlen') && btns.includes('Heizen'),
    btns.join('|'),
);
check('fanOnly is translated too', btns.includes('Lüften'), btns.join('|'));
check(
    'the fan speed offers auto, quiet and the level',
    btns.includes('Leise') && btns.includes('Stufe'),
    btns.join('|'),
);
// fanSpeed.currentMode is "fixed" in cooling, so the 1…5 row is offered.
check(
    'the fan level row is shown while the fan is fixed',
    ['1', '2', '3', '4', '5'].every((n) => btns.includes(n)),
    btns.join('|'),
);
check('the vane positions are selectable', btns.includes('Schwenken') && btns.includes('Sanft'), btns.join('|'));
check('the powerful button is offered', btns.includes('Powerful'), btns.join('|'));

// ── 2. Switching the mode switches the whole set of datapoints ──────────────
await setMode(1); // heating
txt = await text();
check('the heating setpoint replaces the cooling one', txt.includes('21'), txt);
check('and 24 is gone with it', !txt.includes('24'), txt);
btns = await buttons();
// The fan runs on "auto" in heating, so the level row must disappear with it.
check('the fan level row follows the mode', !btns.includes('5'), btns.join('|'));

// ── 3. A mode without a setpoint shows none ─────────────────────────────────
// Daikin has no setpoint in "dry"; the resolved id does not exist, so the
// temperature row and its +/- buttons have to stay away rather than show a stale
// number from the previous mode.
await setMode(4); // dry
txt = await text();
check('dry shows no setpoint', !txt.includes('21') && !txt.includes('24'), txt);
btns = await buttons();
check('dry offers only its single auto fan speed', !btns.includes('Stufe') && !btns.includes('Leise'), btns.join('|'));
check('the room temperature is still shown', txt.includes('23,5') || txt.includes('23.5'), txt);

// ── 4. The limits come from the resolved datapoint ──────────────────────────
// Cooling allows up to 32, heating only up to 30. A range frozen into the widget
// would clamp one of the two wrong.
await setMode(2); // cooling
await page.evaluate(([id, val]) => window.__auraShot.mock({ [id]: val }), [setpoint('cooling'), 32]);
await page.waitForTimeout(400);
await writes(true);
// The last "+" of the widget belongs to the temperature stepper.
await page.click('.aura-widget-ac button:has(svg.lucide-plus)');
await page.waitForTimeout(300);
let log = await writes();
eq('cooling stops at its own maximum of 32', log.at(-1)?.val, 32);

await setMode(1); // heating
await page.evaluate(([id, val]) => window.__auraShot.mock({ [id]: val }), [setpoint('heating'), 30]);
await page.waitForTimeout(400);
await writes(true);
await page.click('.aura-widget-ac button:has(svg.lucide-plus)');
await page.waitForTimeout(300);
log = await writes();
eq('heating stops two degrees earlier, at 30', log.at(-1)?.val, 30);
eq('and it writes the heating setpoint, not the cooling one', log.at(-1)?.id, setpoint('heating'));

// ── 5. The step comes from the datapoint too ────────────────────────────────
await page.evaluate(([id, val]) => window.__auraShot.mock({ [id]: val }), [setpoint('heating'), 21]);
await page.waitForTimeout(400);
await writes(true);
await page.click('.aura-widget-ac button:has(svg.lucide-minus)');
await page.waitForTimeout(300);
log = await writes();
eq('half a degree, as the datapoint declares', log.at(-1)?.val, 20.5);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\naircontrol-daikin: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
