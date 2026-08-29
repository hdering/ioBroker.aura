// Verifies that the "Rollladen" display of both list widgets offers what the
// standalone Rollladen widget does — the row used to be three buttons and nothing
// else: position slider (with write-on-release and live preview), a separate
// feedback datapoint, inverted counting, the position/closed percentage, the slat
// control with its own scale, and the activity / direction / lock datapoints.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-shutter-options.mjs
//
// Both lists render the shared ShutterControl from entryControls, so every case
// runs against the static and the dynamic list. Datapoint values are injected via
// the screenshot harness — no real datapoint is touched.
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

const DP = 'demo.sh.LEVEL';
const ACTUAL_DP = 'demo.sh.ACTUAL';
const TILT_DP = 'demo.sh.TILT';
const ACT_DP = 'demo.sh.ACTIVITY';
const DIR_DP = 'demo.sh.DIRECTION';
const LOCK_DP = 'demo.sh.LOCK';
const ROOT = '.aura-widget-w-sh';
// The row itself can be a button (popup trigger), so the control counts on its own.
const CTRL = `${ROOT} .aura-shutter-control`;
const SLIDER = `${ROOT} .aura-shutter-slider`;
const TYPES = ['list', 'autolist'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function show(type, entryPatch, values) {
    const widget = {
        id: 'w-sh',
        type,
        title: 'Rollladen',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 8 },
        options: {
            showTitle: false,
            hideFilterButton: true,
            syncIntervalMin: 999,
            entries: [{ id: DP, label: 'Zeile', displayType: 'shutter', shutterMode: 'position', ...entryPatch }],
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
    await page.waitForTimeout(450);
}

const text = () =>
    page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(), ROOT);
const writes = () => page.evaluate(() => window.__auraShot.writes());
const sliderValue = () => page.evaluate((sel) => document.querySelector(sel)?.value ?? null, SLIDER);
/** Drag a range control the way the browser does: set value, fire "input". */
const drag = (sel, v) =>
    page.$eval(
        sel,
        (el, val) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, String(val));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        v,
    );

// ── 1. Without the new options nothing changes: three buttons, no slider ─────
for (const type of TYPES) {
    await show(type, {}, { [DP]: 40 });
    const dom = await page.evaluate(
        (sel) => ({
            buttons: document.querySelectorAll(`${sel} .aura-shutter-control button`).length,
            sliders: document.querySelectorAll(`${sel} input[type="range"]`).length,
        }),
        ROOT,
    );
    eq(`${type}: the plain row is still the three buttons`, dom, { buttons: 3, sliders: 0 });
}

// ── 2. Position slider, write on release ─────────────────────────────────────
for (const type of TYPES) {
    await show(type, { shutterShowSlider: true }, { [DP]: 40 });
    eq(`${type}: the slider starts on the datapoint`, await sliderValue(), '40');
    await drag(SLIDER, 80);
    await page.waitForTimeout(150);
    eq(`${type}: dragging alone writes nothing`, await writes(), []);
    await page.locator(SLIDER).dispatchEvent('mouseup');
    await page.waitForTimeout(150);
    eq(`${type}: the release writes the position`, await writes(), [{ id: DP, val: 80 }]);

    // Live writing is the other setting.
    await show(type, { shutterShowSlider: true, shutterSendOnRelease: false }, { [DP]: 40 });
    await drag(SLIDER, 55);
    await page.waitForTimeout(150);
    eq(`${type}: without it every move writes`, (await writes()).at(-1), { id: DP, val: 55 });
}

// ── 3. Feedback datapoint and inverted counting ──────────────────────────────
for (const type of TYPES) {
    await show(type, { shutterShowSlider: true, shutterActualDp: ACTUAL_DP }, { [DP]: 40, [ACTUAL_DP]: 15 });
    eq(`${type}: the feedback datapoint drives the display`, await sliderValue(), '15');

    await show(type, { shutterShowSlider: true, shutterInvert: true, shutterShowValue: true }, { [DP]: 30 });
    eq(`${type}: inverted counting flips the shown position`, await sliderValue(), '70');
    await drag(SLIDER, 90);
    await page.locator(SLIDER).dispatchEvent('mouseup');
    await page.waitForTimeout(150);
    eq(`${type}: and the write is flipped back`, (await writes()).at(-1), { id: DP, val: 10 });
}

// ── 4. Position text, open or closed ─────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { shutterShowValue: true }, { [DP]: 30 });
    check(`${type}: the position is printed`, (await text()).includes('30%'), await text());
    await show(type, { shutterShowValue: true, shutterShowClosedPercent: true }, { [DP]: 30 });
    check(`${type}: as the closed percentage when asked`, (await text()).includes('70%'), await text());
}

// ── 5. Slats ─────────────────────────────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { shutterTiltDp: TILT_DP, shutterShowTiltValue: true }, { [DP]: 40, [TILT_DP]: 25 });
    check(`${type}: the slat percentage is printed`, (await text()).includes('25%'), await text());
    const btns = await page.locator(`${CTRL} button`).count();
    eq(`${type}: and a fourth button opens the slat control`, btns, 4);
    await page.locator(`${CTRL} button`).nth(3).click();
    await page.waitForTimeout(300);
    const tilt = page.locator('input[type="range"]').last();
    await tilt.waitFor({ timeout: 5000 });
    await tilt.fill('60');
    await tilt.dispatchEvent('mouseup');
    await page.waitForTimeout(200);
    eq(`${type}: dragging the slats writes the slat datapoint`, (await writes()).at(-1), { id: TILT_DP, val: 60 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // The device's own scale: 0…1 instead of 0…100.
    await show(
        type,
        { shutterTiltDp: TILT_DP, shutterTiltMax: 1, shutterShowTiltValue: true },
        { [DP]: 40, [TILT_DP]: 0.5 },
    );
    check(`${type}: a 0…1 slat datapoint reads as 50 %`, (await text()).includes('50%'), await text());
}

// ── 6. Activity, direction and lock ──────────────────────────────────────────
for (const type of TYPES) {
    await show(
        type,
        { shutterShowValue: true, shutterActivityDp: ACT_DP, shutterDirectionDp: DIR_DP },
        { [DP]: 40, [ACT_DP]: true, [DIR_DP]: 1 },
    );
    const moving = await page.evaluate(
        (sel) => ({
            pos: getComputedStyle(document.querySelector(`${sel} .aura-shutter-pos`)).color,
            up: getComputedStyle(document.querySelectorAll(`${sel} .aura-shutter-control button`)[0]).color,
            down: getComputedStyle(document.querySelectorAll(`${sel} .aura-shutter-control button`)[2]).color,
        }),
        ROOT,
    );
    check(
        `${type}: while it drives, the position and the direction stand out`,
        moving.pos === moving.up && moving.up !== moving.down,
        JSON.stringify(moving),
    );

    await show(type, { shutterLockDp: LOCK_DP }, { [DP]: 40, [LOCK_DP]: true });
    eq(`${type}: a lock datapoint adds the padlock`, await page.locator(`${ROOT} .aura-contact-lock`).count(), 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
