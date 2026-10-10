// ─────────────────────────────────────────────────────────────────────────────
// Rollladen — quick-select presets (issue #745)
// ─────────────────────────────────────────────────────────────────────────────
// What a preset button writes is the point: the percentage reads like the
// display (showClosedPercent, invertPosition), the slats go first and only when
// a tilt datapoint exists, and a widget without presets draws no extra row.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/shutter-presets.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROW = '.aura-shutter-presets';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
function shutter(options, layout = 'default') {
    return {
        id: `w-shp-${++seq}`,
        type: 'shutter',
        title: 'Wohnzimmer',
        datapoint: 'demo.level',
        layout,
        gridPos: { x: 0, y: 0, w: 8, h: 7 },
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

async function show(options, layout = 'default', states = {}) {
    await page.evaluate(
        ([w, s]) => {
            window.__auraShot.mock({ 'demo.level': 40, 'demo.tilt': 30, ...s });
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [shutter(options, layout), states],
    );
    await page.waitForTimeout(400);
}
const writes = async () => JSON.stringify(await page.evaluate(() => window.__auraShot.writes()));
const count = (sel) => page.locator(sel).count();
const click = async (text) => {
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.locator(`${ROW} button`, { hasText: text }).first().click();
    await page.waitForTimeout(250);
};
const activeLabels = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-shutter-presets button[aria-pressed="true"]')].map((b) => b.textContent),
    );

// ── 1. No presets: no row ────────────────────────────────────────────────────
await show({});
check('without presets no row is drawn', (await count(ROW)) === 0);

// ── 2. Plain position presets ────────────────────────────────────────────────
await show({ positionPresets: [{ pos: 0 }, { pos: 40, label: 'Halb' }, { pos: 100 }] });
check('three buttons', (await count(`${ROW} button`)) === 3);
check('label wins over the percentage', (await page.locator(`${ROW} button`).nth(1).textContent()) === 'Halb');
check('the matching preset is highlighted', JSON.stringify(await activeLabels()) === '["Halb"]');
await click('100%');
check('a preset writes the position', (await writes()) === '[{"id":"demo.level","val":100}]');

// ── 3. Display semantics ─────────────────────────────────────────────────────
await show({ positionPresets: [{ pos: 30 }], showClosedPercent: true });
await click('30%');
check('showClosedPercent: 30 % closed writes 70', (await writes()) === '[{"id":"demo.level","val":70}]');
await show({ positionPresets: [{ pos: 30 }], invertPosition: true });
await click('30%');
check('invertPosition: 30 % open writes raw 70', (await writes()) === '[{"id":"demo.level","val":70}]');

// ── 4. Tilt ──────────────────────────────────────────────────────────────────
await show({ tiltDp: 'demo.tilt', positionPresets: [{ pos: 0, tilt: 50, label: 'Schatten' }, { pos: 100 }] });
await click('Schatten');
check(
    'tilt preset writes slats first, then position',
    (await writes()) === '[{"id":"demo.tilt","val":50},{"id":"demo.level","val":0}]',
);
await click('100%');
check('preset without tilt leaves the slats alone', (await writes()) === '[{"id":"demo.level","val":100}]');
await show({ positionPresets: [{ pos: 20, tilt: 50 }] });
await click('20%');
check('tilt is ignored without a tilt datapoint', (await writes()) === '[{"id":"demo.level","val":20}]');
await show({ tiltDp: 'demo.tilt', tiltMin: 0, tiltMax: 1, positionPresets: [{ pos: 0, tilt: 50 }] });
await click('0%');
check(
    'tilt follows the datapoint range',
    (await writes()) === '[{"id":"demo.tilt","val":0.5},{"id":"demo.level","val":0}]',
);

// ── 4b. Slat-only presets and presets at the current position ───────────────
await show({ tiltDp: 'demo.tilt', positionPresets: [{ tilt: 70 }, { pos: 40, tilt: 20, label: 'Hier' }] });
check(
    'slat-only preset is labelled with the slat text',
    (await page.locator(`${ROW} button`).first().textContent()) === 'Lamellen 70%',
);
await click('Lamellen 70%');
check('slat-only preset writes only the slats', (await writes()) === '[{"id":"demo.tilt","val":70}]');
await click('Hier');
check('preset at the current position writes only the slats', (await writes()) === '[{"id":"demo.tilt","val":20}]');
await show({ positionPresets: [{ tilt: 70 }, { pos: 10 }] });
check(
    'slat-only preset is hidden without a tilt datapoint',
    JSON.stringify(await page.locator(`${ROW} button`).allTextContents()) === '["10%"]',
);

// ── 4c. Re-set slats after the drive (no activity DP → 3 s fallback) ─────────
// One-shot: the preset's angle comes back once, and a slat change while no
// drive is pending does not arm a later re-set (#745).
await show({
    tiltDp: 'demo.tilt',
    reapplyTiltAfterMove: true,
    positionPresets: [{ pos: 0, tilt: 50, label: 'Schatten' }, { tilt: 70 }],
});
await click('Schatten');
await page.waitForTimeout(3300);
check(
    'reapply: the preset angle is written again after the drive',
    (await writes()) === '[{"id":"demo.tilt","val":50},{"id":"demo.level","val":0},{"id":"demo.tilt","val":50}]',
);
await page.evaluate(() => window.__auraShot.writes(true));
await page.waitForTimeout(3300);
check('reapply: only once', (await writes()) === '[]');
await click('Lamellen 70%');
await page.waitForTimeout(3300);
check('reapply: a slat-only change is not re-sent', (await writes()) === '[{"id":"demo.tilt","val":70}]');

// ── 5. Robust input and layouts ──────────────────────────────────────────────
await show({ positionPresets: [25, { label: 'kaputt' }, { pos: 150 }] });
check(
    'bare numbers count, invalid entries drop, values clamp',
    JSON.stringify(await page.locator(`${ROW} button`).allTextContents()) === '["25%","100%"]',
);
await show({ positionPresets: [{ pos: 0 }] }, 'compact');
check('compact layout shows no row', (await count(ROW)) === 0);

// ── 6. Row stays inside the card ─────────────────────────────────────────────
await show({ positionPresets: [{ pos: 0 }, { pos: 25 }, { pos: 50 }, { pos: 75 }, { pos: 100 }] });
const fits = await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    const card = row?.closest('.aura-widget');
    if (!row || !card) return 'missing';
    const r = row.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return r.bottom <= c.bottom + 0.5 && r.right <= c.right + 0.5 ? 'ok' : `${r.bottom}/${c.bottom}`;
}, ROW);
check('the row stays inside the card', fits === 'ok', fits);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
process.exit(failed.length ? 1 : 0);
