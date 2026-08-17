// ─────────────────────────────────────────────────────────────────────────────
// Rollladen — slat tilt for Jalousie/Raffstore (issue #547)
// ─────────────────────────────────────────────────────────────────────────────
// The interesting parts are not visible in a screenshot: what raw value a slat
// angle converts to on a 0…1 / -90…90 datapoint, whether the graphic follows the
// drag or waits for the release, and that a shutter WITHOUT a tilt datapoint is
// untouched by all of it.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/shutter-tilt.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const TILT = 'input[aria-label="Lamellen"]';
const TILT_BTN = 'button[aria-label="Lamellen"]';
const OPEN_SLATS = 'button[aria-label="Lamellen öffnen"]';
const CLOSE_SLATS = 'button[aria-label="Lamellen schließen"]';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// A fresh widget id per render: the same id keeps React's component (and with it
// a half-finished drag) alive, which would leak into the next assertion.
let seq = 0;

function shutter(options, layout = 'default') {
    return {
        id: `w-sh-${++seq}`,
        type: 'shutter',
        title: 'Wohnzimmer',
        datapoint: 'demo.level',
        layout,
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        options: { showTitle: true, ...options },
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

/** Render one shutter widget and arm a fresh write log. */
async function show(options, layout = 'default', states = {}) {
    await page.evaluate(
        ([w, s]) => {
            window.__auraShot.mock({ 'demo.level': 40, 'demo.tilt': 30, 'demo.tiltStatus': 80, ...s });
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [shutter(options, layout), states],
    );
    await page.waitForTimeout(400);
}

const writes = () => page.evaluate(() => window.__auraShot.writes());

/** The repeating slat gradient currently painted — the tilt made visible. */
const slatStyle = () =>
    page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) =>
            getComputedStyle(d).backgroundImage.includes('repeating-linear-gradient'),
        );
        return el ? getComputedStyle(el).backgroundImage : null;
    });

/** How far the slat area reaches down — the POSITION made visible (the tilt only
 *  changes the gradient above, never this height). */
const slatFill = () =>
    page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) =>
            getComputedStyle(d).backgroundImage.includes('repeating-linear-gradient'),
        );
        return el ? el.style.height : null;
    });

const count = (sel) => page.locator(sel).count();

/** Move the tilt slider without releasing it (the draft state). */
async function dragTiltTo(pct) {
    const el = page.locator(TILT).first();
    await el.fill(String(pct));
    await page.waitForTimeout(150);
}
async function releaseTilt() {
    await page.locator(TILT).first().dispatchEvent('mouseup');
    await page.waitForTimeout(200);
}

// ── 1. Without a tilt datapoint nothing changes ───────────────────────────────
for (const layout of ['default', 'compact', 'minimal']) {
    await show({}, layout);
    const dom = await page.evaluate(() => ({
        ranges: document.querySelectorAll('input[type="range"]').length,
        tilt: document.querySelectorAll('[aria-label^="Lamellen"]').length,
    }));
    check(
        `${layout}: no tilt DP → no tilt control`,
        dom.tilt === 0 && dom.ranges === (layout === 'default' ? 1 : 0),
        JSON.stringify(dom),
    );
}

// ── 2. Default layout: a vertical regulator next to the graphic ───────────────
await show({ tiltDp: 'demo.tilt' });
check(`default: tilt DP adds a second regulator`, (await count(TILT)) === 1);
const vertical = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).writingMode : null;
}, TILT);
check('default: the tilt regulator is vertical', String(vertical).startsWith('vertical'), `writing-mode=${vertical}`);

// ── 3. Which side it sits on ─────────────────────────────────────────────────
const tiltX = async () => (await page.locator(TILT).first().boundingBox()).x;
const xRight = await tiltX();
await show({ tiltDp: 'demo.tilt', tiltSliderSide: 'left' });
const xLeft = await tiltX();
check(
    'tiltSliderSide: left really sits left of the default place',
    xLeft < xRight - 20,
    `left=${xLeft} right=${xRight}`,
);

// ── 4. Raw value conversion ──────────────────────────────────────────────────
const CASES = [
    { name: '0…100', opts: {}, pct: 40, want: 40 },
    { name: '0…1', opts: { tiltMin: 0, tiltMax: 1 }, pct: 40, want: 0.4 },
    { name: '-90…90', opts: { tiltMin: -90, tiltMax: 90 }, pct: 40, want: -18 },
    { name: 'inverted', opts: { invertTilt: true }, pct: 40, want: 60 },
    { name: '0…180 at 100 %', opts: { tiltMin: 0, tiltMax: 180 }, pct: 100, want: 180 },
];
for (const c of CASES) {
    await show({ tiltDp: 'demo.tilt', ...c.opts });
    await dragTiltTo(c.pct);
    await releaseTilt();
    const w = (await writes()).filter((x) => x.id === 'demo.tilt');
    check(
        `range ${c.name}: ${c.pct} % writes ${c.want}`,
        w.length === 1 && Math.abs(w[0].val - c.want) < 0.0005,
        JSON.stringify(w),
    );
}

// ── 5. sendOnRelease writes late — the graphic may still follow live ──────────
await show({ tiltDp: 'demo.tilt' });
const before = await slatStyle();
await dragTiltTo(95);
const duringWrites = await writes();
const during = await slatStyle();
check('sendOnRelease: nothing written while dragging', duringWrites.length === 0, JSON.stringify(duringWrites));
check('tiltLivePreview on: the slats follow the drag', during !== before, `${before} → ${during}`);
await releaseTilt();
check('sendOnRelease: the release writes', (await writes()).length === 1);

await show({ tiltDp: 'demo.tilt', tiltLivePreview: false });
const beforeOff = await slatStyle();
await dragTiltTo(95);
const duringOff = await slatStyle();
const thumbOff = await page.evaluate((sel) => document.querySelector(sel)?.value, TILT);
check('tiltLivePreview off: the slats wait for the release', duringOff === beforeOff, `${beforeOff} → ${duringOff}`);
check('tiltLivePreview off: the thumb still follows the finger', thumbOff === '95', `value=${thumbOff}`);
await releaseTilt();
check('tiltLivePreview off: the release updates the graphic', (await slatStyle()) !== beforeOff);

// ── 6. Position live preview (off by default, as it always was) ───────────────
await show({});
const posBefore = await slatFill();
await page.locator('input[type="range"]').first().fill('80');
await page.waitForTimeout(150);
check(
    'positionLivePreview off: the blind edge waits (unchanged behaviour)',
    (await slatFill()) === posBefore,
    `height=${posBefore}`,
);
await show({ positionLivePreview: true });
const posBefore2 = await slatFill();
await page.locator('input[type="range"]').first().fill('80');
await page.waitForTimeout(150);
const posAfter2 = await slatFill();
check(
    'positionLivePreview on: the blind edge follows the drag',
    posAfter2 !== posBefore2,
    `${posBefore2} → ${posAfter2}`,
);

// ── 7. Read-only status datapoint ────────────────────────────────────────────
await show({ tiltDp: 'demo.tilt', actualTiltDp: 'demo.tiltStatus' });
const shown = await page.evaluate((sel) => document.querySelector(sel)?.value, TILT);
check('actualTiltDp feeds the display', shown === '80', `value=${shown} (tiltDp=30, status=80)`);
await dragTiltTo(20);
await releaseTilt();
const statusWrites = await writes();
check(
    'actualTiltDp stays read-only — the write goes to tiltDp',
    statusWrites.length === 1 && statusWrites[0].id === 'demo.tilt',
    JSON.stringify(statusWrites),
);

// ── 8. Step buttons ──────────────────────────────────────────────────────────
await show({ tiltDp: 'demo.tilt', tiltControl: 'buttons', tiltStep: 25 });
check(
    'tiltControl buttons: two step buttons, no regulator',
    (await count(OPEN_SLATS)) === 1 && (await count(TILT)) === 0,
);
await page.locator(OPEN_SLATS).click();
await page.waitForTimeout(200);
check('step button opens the slats by tiltStep', JSON.stringify(await writes()) === '[{"id":"demo.tilt","val":55}]');
await show({ tiltDp: 'demo.tilt', tiltControl: 'buttons', tiltStep: 25 }, 'default', { 'demo.tilt': 90 });
await page.locator(OPEN_SLATS).click();
await page.waitForTimeout(200);
check('step button clamps at 100 %', JSON.stringify(await writes()) === '[{"id":"demo.tilt","val":100}]');
await show({ tiltDp: 'demo.tilt', tiltControl: 'buttons', tiltStep: 25 }, 'default', { 'demo.tilt': 10 });
await page.locator(CLOSE_SLATS).click();
await page.waitForTimeout(200);
check('step button clamps at 0 %', JSON.stringify(await writes()) === '[{"id":"demo.tilt","val":0}]');

// ── 9. Flat layouts degrade to the step buttons / the popover ────────────────
for (const layout of ['compact', 'minimal']) {
    await show({ tiltDp: 'demo.tilt' }, layout);
    check(`${layout}: defaults to the popover button`, (await count(TILT_BTN)) === 1 && (await count(TILT)) === 0);
    await show({ tiltDp: 'demo.tilt', tiltPlacement: 'inline' }, layout);
    check(
        `${layout}: inline degrades to the step buttons (no room for a slider)`,
        (await count(OPEN_SLATS)) === 1 && (await count(TILT)) === 0,
    );
}

// ── 10. The popover ─────────────────────────────────────────────────────────
await show({ tiltDp: 'demo.tilt', tiltPlacement: 'popup' });
check(
    'tiltPlacement popup: a button instead of the regulator',
    (await count(TILT_BTN)) === 1 && (await count(TILT)) === 0,
);
await page.locator(TILT_BTN).click();
await page.waitForTimeout(300);
check('the popover carries the regulator', (await count(TILT)) === 1);
await page.locator('button', { hasText: /^50%$/ }).first().click();
await page.waitForTimeout(250);
check('a quick value writes it', JSON.stringify(await writes()) === '[{"id":"demo.tilt","val":50}]');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escape closes the popover', (await count(TILT)) === 0);

// ── 11. tiltPlacement off keeps the widget clean ─────────────────────────────
await show({ tiltDp: 'demo.tilt', tiltPlacement: 'off' });
check(
    'tiltPlacement off: no tilt control in the widget',
    (await count(TILT)) === 0 && (await count(TILT_BTN)) === 0 && (await count(OPEN_SLATS)) === 0,
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
process.exit(failed.length ? 1 : 0);
