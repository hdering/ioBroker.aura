// ─────────────────────────────────────────────────────────────────────────────
// Rollladen — layout "circle" (issue #815)
// ─────────────────────────────────────────────────────────────────────────────
// The round trigger opens the circle menu; its entries write what the fixed
// layouts' buttons write, the menu stays inside the window, and Escape / a click
// beside it closes it again.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/shutter-circle.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched. SHOT_DIR=<dir> also saves screenshots.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR;
const TRIGGER = '.aura-circle-trigger';
const ITEM = '.aura-circle-item';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
function shutter(options, gridPos = { x: 0, y: 0, w: 5, h: 6 }) {
    return {
        id: `w-shc-${++seq}`,
        type: 'shutter',
        title: 'Küche',
        datapoint: 'demo.level',
        layout: 'circle',
        gridPos,
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

async function show(options, gridPos, states = {}) {
    await page.evaluate(
        ([w, s]) => {
            window.__auraShot.mock({ 'demo.level': 50, 'demo.tilt': 30, ...s });
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [shutter(options, gridPos), states],
    );
    await page.waitForTimeout(400);
}
const writes = async () => JSON.stringify(await page.evaluate(() => window.__auraShot.writes()));
const open = async () => {
    await page.locator(TRIGGER).click();
    await page.waitForTimeout(350);
};
const shot = async (name) => {
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};
const itemTitles = () => page.locator(ITEM).evaluateAll((els) => els.map((e) => e.getAttribute('title')));
/** Every entry inside the window, and no two entries overlapping. */
const placement = () =>
    page.evaluate((sel) => {
        const rs = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
        for (const r of rs)
            if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
                return `outside: ${Math.round(r.left)},${Math.round(r.top)}`;
        for (let i = 0; i < rs.length; i++)
            for (let j = i + 1; j < rs.length; j++) {
                const a = rs[i];
                const b = rs[j];
                const d = Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
                if (d < a.width - 0.5) return `overlap ${i}/${j}: ${d.toFixed(1)}`;
            }
        return rs.length ? 'ok' : 'none';
    }, ITEM);

// ── 1. Closed: round trigger with the value ──────────────────────────────────
await show({ positionPresets: [{ pos: 75 }, { pos: 50 }, { pos: 30, label: 'Schatten' }] });
const box = await page.locator(TRIGGER).boundingBox();
check('trigger is drawn round', !!box && Math.abs(box.width - box.height) < 1 && box.width > 40, JSON.stringify(box));
check('trigger shows the position', ((await page.locator(TRIGGER).textContent()) ?? '').includes('50%'));
check('menu closed at first', (await page.locator(ITEM).count()) === 0);
await shot('circle-closed');

// ── 2. Open: entries in order, active preset marked ──────────────────────────
await open();
check(
    'entries: up, presets, down, stop',
    JSON.stringify(await itemTitles()) === '["Öffnen","75%","50%","Schatten: 30%","Schließen","Stopp"]',
    JSON.stringify(await itemTitles()),
);
check('current position preset is active', (await page.locator(`${ITEM}[data-active="1"]`).count()) === 1);
check('entries placed inside the window without overlap', (await placement()) === 'ok', await placement());
await shot('circle-open');

// ── 3. Picking writes and closes ─────────────────────────────────────────────
await page.locator(`${ITEM}[title="Schatten: 30%"]`).click();
await page.waitForTimeout(250);
check('preset writes the position', (await writes()) === '[{"id":"demo.level","val":30}]', await writes());
check('menu closes after a pick', (await page.locator(ITEM).count()) === 0);

await open();
await page.evaluate(() => window.__auraShot.writes(true));
await page.locator(`${ITEM}[title="Öffnen"]`).click();
await page.waitForTimeout(250);
check('"Öffnen" writes 100', (await writes()) === '[{"id":"demo.level","val":100}]', await writes());

// ── 4. Escape and click beside close ─────────────────────────────────────────
await open();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes', (await page.locator(ITEM).count()) === 0);
await open();
await page.mouse.click(5, 5);
await page.waitForTimeout(150);
check('click beside closes', (await page.locator(ITEM).count()) === 0);

// ── 5. keepOpen ──────────────────────────────────────────────────────────────
await show({ positionPresets: [{ pos: 25 }], circleKeepOpen: true });
await open();
await page.locator(`${ITEM}[title="25%"]`).click();
await page.waitForTimeout(200);
check('keepOpen leaves the menu open', (await page.locator(ITEM).count()) > 0);
await page.keyboard.press('Escape');

// ── 5a. circleTriggerSize ────────────────────────────────────────────────────
await show({ circleTriggerSize: 60 });
const small = await page.locator(TRIGGER).boundingBox();
check('circleTriggerSize fixes the diameter', !!small && Math.round(small.width) === 60, JSON.stringify(small));
await show({ circleTriggerSize: 2000 });
const capped = await page.locator(TRIGGER).boundingBox();
check(
    'circleTriggerSize never exceeds the widget',
    !!capped && !!box && Math.abs(capped.width - box.width) < 1,
    `${capped?.width} vs ${box?.width}`,
);

// ── 5a'. circleIcon replaces the graphic ────────────────────────────────────
await show({});
const vizBefore = await page.locator(`${TRIGGER} .aura-widget-icon`).evaluate((e) => e.tagName.toLowerCase());
await show({ circleIcon: 'mdi:window-shutter' });
await page.waitForTimeout(400);
const iconAfter = await page.locator(`${TRIGGER} .aura-widget-icon`).evaluate((e) => e.outerHTML.slice(0, 80));
check(
    'circleIcon replaces the shutter graphic',
    vizBefore === 'div' && iconAfter.startsWith('<svg'),
    `${vizBefore} → ${iconAfter}`,
);

// ── 5b. circleOrder ──────────────────────────────────────────────────────────
await show({
    positionPresets: [{ pos: 75 }, { pos: 25 }],
    circleOrder: ['up', 'down', 'gone', 'preset-1', 'up'],
});
await open();
check(
    'circleOrder: named first, unknown/duplicate dropped, rest in default order',
    JSON.stringify(await itemTitles()) === '["Öffnen","Schließen","25%","75%","Stopp"]',
    JSON.stringify(await itemTitles()),
);
await page.keyboard.press('Escape');

// ── 6. Near the window edge: still inside ────────────────────────────────────
for (const [name, vp] of [
    ['top-left corner', { width: 1280, height: 900 }],
    ['phone', { width: 390, height: 700 }],
]) {
    await page.setViewportSize(vp);
    await show({ positionPresets: [{ pos: 90 }, { pos: 75 }, { pos: 50 }, { pos: 25 }, { pos: 10 }] });
    await open();
    check(`${name}: entries inside the window`, (await placement()) === 'ok', await placement());
    await shot(`circle-${name.replace(/\s/g, '-')}`);
    await page.keyboard.press('Escape');
}
await page.setViewportSize({ width: 1280, height: 900 });

// ── 7. Tilt entry opens the slat popover ─────────────────────────────────────
await show({ tiltDp: 'demo.tilt' });
await open();
check('tilt entry present with tiltDp', (await page.locator(`${ITEM}[title="Lamellen"]`).count()) === 1);
await page.locator(`${ITEM}[title="Lamellen"]`).click();
await page.waitForTimeout(250);
check(
    'tilt entry closes the menu and opens the slat popover',
    (await page.locator(ITEM).count()) === 0 && (await page.getByText('Lamellen').count()) > 0,
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
process.exit(failed.length ? 1 : 0);
