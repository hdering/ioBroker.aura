// Thermostat "Rundskala" with a widget click action, driven by touch — issue #776.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/thermostat-dial-touch.mjs
//
// Reported on a phone: setting the temperature on the dial also fired the widget's
// click action, and the knob could not be dragged — it only moved one step at a time.
// Driven through CDP touch events (the browser's real gesture pipeline) plus a mouse
// pass. The click action is an external link in a new tab; window.open is stubbed, so
// "the action fired" is a counter instead of a popup to hunt for.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SET = 'daikin-cloud.0.aura-selftest-device.thermo776.set';
const WID = 'w-thermo-776';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 400, height: 800 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => {
    window.__opened = 0;
    window.open = () => {
        window.__opened++;
        return null;
    };
    window.__auraShot.captureWrites(true);
});

async function show(over = {}, extra = []) {
    const widget = {
        id: WID,
        type: 'thermostat',
        title: 'Wohnzimmer',
        datapoint: SET,
        layout: 'dial',
        gridPos: { x: 0, y: 0, w: 5, h: 14 },
        options: {
            showPresets: false,
            minTemp: 10,
            maxTemp: 30,
            step: 0.5,
            clickAction: { kind: 'link-external', url: 'https://example.invalid/', newTab: true },
        },
    };
    await page.evaluate(
        ([w, dp, more]) => {
            window.__auraShot.mock({ [dp]: 20 });
            window.__auraShot.mockServerState({ [dp]: 20 });
            window.__auraShot.showWidgets([w, ...more]);
        },
        [{ ...widget, ...over }, SET, extra],
    );
    await page.waitForSelector(`[data-aura-thermo-dial="${WID}"]`, { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        window.__opened = 0;
        window.__auraShot.writes(true);
    });
}

/** Screen point of a viewBox point on the letterboxed square dial. */
const dialPoint = (px, py) =>
    page.evaluate(
        ([x, y, id]) => {
            const r = document.querySelector(`[data-aura-thermo-dial="${id}"]`).getBoundingClientRect();
            const side = Math.min(r.width, r.height);
            return {
                x: r.left + (r.width - side) / 2 + (x / 200) * side,
                y: r.top + (r.height - side) / 2 + (y / 200) * side,
            };
        },
        [px, py, WID],
    );

// Arc centre (100,100), radius as drawn by the widget; angles 135° → 405°.
const R = 78;
const onArc = async (deg) => {
    const a = (deg * Math.PI) / 180;
    return dialPoint(100 + R * Math.cos(a), 100 + R * Math.sin(a));
};

const state = () =>
    page.evaluate(() => ({
        opened: window.__opened,
        writes: window.__auraShot.writes().map((w) => w.val),
    }));

const cdp = await ctx.newCDPSession(page);
const touch = async (type, p) =>
    cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [],
    });

async function touchDrag(fromDeg, toDeg, steps = 20) {
    await touch('touchStart', await onArc(fromDeg));
    for (let i = 1; i <= steps; i++) {
        await touch('touchMove', await onArc(fromDeg + ((toDeg - fromDeg) * i) / steps));
        await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(500);
}

const tap = async (p) => {
    await touch('touchStart', p);
    await page.waitForTimeout(60);
    await touch('touchEnd');
    // The click trails the touch by the double-tap window.
    await page.waitForTimeout(800);
};

// ── Touch tap on the arc ────────────────────────────────────────────────────
await show();
await tap(await onArc(270));
let s = await state();
check('touch tap on the arc writes the tapped value', s.writes.at(-1) === 20, JSON.stringify(s));
check('touch tap on the arc does not fire the click action', s.opened === 0, JSON.stringify(s));

// ── +/- buttons by touch ────────────────────────────────────────────────────
// Before any drag: once a touch drag has run, the harness remount (show) leaves
// Chromium without a tap for the next touch, a test artefact, not the widget.
await show();
await tap(await dialPoint(126, 160));
s = await state();
check('touch on + writes 20.5', s.writes.at(-1) === 20.5, JSON.stringify(s));
check('touch on + does not fire the click action', s.opened === 0, JSON.stringify(s));

// ── Touch drag along the arc: 20 °C (top) → right end ──────────────────────
await show();
await touchDrag(270, 380);
s = await state();
check('touch drag writes once', s.writes.length === 1, JSON.stringify(s));
check('touch drag follows the finger to ~28 °C', Math.abs((s.writes.at(-1) ?? 0) - 28.1) < 1, JSON.stringify(s));
check('touch drag does not fire the click action', s.opened === 0, JSON.stringify(s));

// ── Mouse drags ─────────────────────────────────────────────────────────────
async function mouseDrag(from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
}
await show();
await mouseDrag(await onArc(270), await onArc(380));
s = await state();
check('mouse drag lands near ~28 °C', Math.abs((s.writes.at(-1) ?? 0) - 28.1) < 1, JSON.stringify(s));
check('mouse drag does not fire the click action', s.opened === 0, JSON.stringify(s));

// A release off the arc (in the centre) must not count as a click on the card either.
await show();
await mouseDrag(await onArc(270), await dialPoint(100, 100));
s = await state();
check('mouse drag released in the centre does not fire the click action', s.opened === 0, JSON.stringify(s));

// ── Tap in the centre still fires the action (the widget body) ─────────────
await show();
await tap(await dialPoint(100, 100));
s = await state();
check('touch tap in the centre fires the click action', s.opened === 1, JSON.stringify(s));

// ── A swipe beside the dial still scrolls the page ─────────────────────────
// A tall dial is letterboxed top and bottom; a filler below makes the page scroll.
await show({ gridPos: { x: 0, y: 0, w: 5, h: 40 } }, [
    { id: 'w-filler-776', type: 'value', title: 'Füller', datapoint: SET, gridPos: { x: 0, y: 41, w: 5, h: 70 } },
]);
const box = await page.evaluate((id) => {
    const r = document.querySelector(`[data-aura-thermo-dial="${id}"]`).getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}, WID);
const scroller = () => page.evaluate(() => document.querySelector('div.aura-scroll')?.scrollTop ?? -1);
check('the dial is letterboxed vertically', box.height > box.width + 40, JSON.stringify(box));
const beside = { x: box.left + box.width / 2, y: box.top + 10 + (box.height - box.width) / 2 - 20 };
await touch('touchStart', beside);
for (let i = 1; i <= 10; i++) {
    await touch('touchMove', { x: beside.x, y: beside.y - 20 * i });
    await page.waitForTimeout(16);
}
await touch('touchEnd');
await page.waitForTimeout(500);
s = await state();
check('a swipe above the dial scrolls the page', (await scroller()) > 50, `${await scroller()}`);
check('and writes nothing', s.writes.length === 0, JSON.stringify(s));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
