// ─────────────────────────────────────────────────────────────────────────────
// Raumklima — Solltemperatur bedienen (issue #838)
// ─────────────────────────────────────────────────────────────────────────────
// `targetControl` makes the target writable: − / + beside the target and the
// quick-select row in the default layout, and in a custom grid the components
// 'btn-minus' / 'btn-plus' / 'presets' / 'circle-menu'. Every write goes to
// `targetDatapoint`, clamped to minTemp…maxTemp on the step grid. The 'circle-menu'
// component of the thermostat custom grid is checked along the way.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/climate-setpoint.mjs
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
const climate = (layout, options = {}) => ({
    id: `w-cls-${++seq}`,
    type: 'climate',
    title: 'Wohnzimmer',
    datapoint: 'demo.temp',
    layout,
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options: {
        targetDatapoint: 'demo.target',
        humidityDatapoint: 'demo.hum',
        targetControl: true,
        presets: [19, 21],
        ...options,
    },
});
const cell = (componentKey) => ({ type: 'component', componentKey, align: 'center', valign: 'middle' });

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: SHOT_DIR ? 2 : 1,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

async function show(widget, states = {}) {
    await page.evaluate(
        ([w, s]) => {
            window.__auraShot.mock({ 'demo.temp': 20.5, 'demo.target': 20, 'demo.hum': 48, 'demo.set': 19, ...s });
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, states],
    );
    await page.waitForTimeout(400);
}
const writes = async () => JSON.stringify(await page.evaluate(() => window.__auraShot.writes()));
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const shot = async (name) => {
    // Just the widget card — these double as the doc images.
    if (SHOT_DIR)
        await page
            .locator('[class*="aura-widget-w-cls-"]')
            .first()
            .screenshot({ path: `${SHOT_DIR}/${name}.png` });
};
const clickTitle = async (title) => {
    await page.locator(`button[title="${title}"]`).first().click();
    await page.waitForTimeout(250);
};

// ── Default layout ───────────────────────────────────────────────────────────
await show(climate('default'));
await shot('climate-default-control');
await clickTitle('Wärmer');
check('default: + writes target + step', (await writes()) === '[{"id":"demo.target","val":20.5}]', await writes());
await resetWrites();
await clickTitle('Kälter');
check('default: − writes target − step', (await writes()) === '[{"id":"demo.target","val":19.5}]', await writes());
await resetWrites();
await page.locator('button', { hasText: /^21°$/ }).click();
await page.waitForTimeout(250);
check('default: preset writes its temperature', (await writes()) === '[{"id":"demo.target","val":21}]', await writes());

await show(climate('default', { maxTemp: 20 }));
await clickTitle('Wärmer');
check('default: + clamps to maxTemp', (await writes()) === '[{"id":"demo.target","val":20}]', await writes());

await show(climate('default', { targetControl: undefined }));
check('default: no control without targetControl', (await page.locator('button[title="Wärmer"]').count()) === 0);
check('default: no presets without targetControl', (await page.locator('button', { hasText: /^21°$/ }).count()) === 0);

// ── Custom grid ──────────────────────────────────────────────────────────────
const grid = {
    cols: 3,
    rows: 2,
    rowSizes: ['1fr', 'auto'],
    cells: [
        cell('btn-minus'),
        { ...cell('circle-menu') },
        cell('btn-plus'),
        { ...cell('presets'), colSpan: 3 },
        { type: 'empty' },
        { type: 'empty' },
    ],
};
await show(climate('custom', { customGrid: grid }));
await shot('climate-custom-control');
check('custom: circle-menu cell drawn', (await page.locator(TRIGGER).count()) === 1);
const trig = (await page.locator(TRIGGER).textContent()) ?? '';
check('custom: trigger shows target and reading', /20\D/.test(trig) && /20[.,]5/.test(trig), trig);
await page.locator(TRIGGER).click();
await page.waitForTimeout(350);
if (SHOT_DIR)
    await page.screenshot({
        path: `${SHOT_DIR}/climate-custom-circle-open.png`,
        clip: { x: 0, y: 60, width: 420, height: 320 },
    });
check(
    'custom: circle entries −, presets, +',
    JSON.stringify(await page.locator(ITEM).evaluateAll((els) => els.map((e) => e.getAttribute('title')))) ===
        '["Kälter","19°","21°","Wärmer"]',
);
await page.locator(`${ITEM}[title="Wärmer"]`).click();
await page.waitForTimeout(250);
check('custom: circle + writes the target', (await writes()) === '[{"id":"demo.target","val":20.5}]', await writes());
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await resetWrites();
await page.locator('.aura-custom-cell-0 button').click();
await page.waitForTimeout(250);
check('custom: btn-minus writes the target', (await writes()) === '[{"id":"demo.target","val":19.5}]', await writes());

await show(climate('custom', { customGrid: grid, targetControl: undefined }));
check('custom: no circle without targetControl', (await page.locator(TRIGGER).count()) === 0);

// ── Thermostat custom grid with its circle ───────────────────────────────────
await show({
    id: `w-cls-${++seq}`,
    type: 'thermostat',
    title: 'Bad',
    datapoint: 'demo.set',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 5, h: 6 },
    options: { presets: [17, 21], customGrid: { cols: 1, rows: 1, cells: [cell('circle-menu')] } },
});
check('thermostat custom: circle-menu cell drawn', (await page.locator(TRIGGER).count()) === 1);
await page.locator(TRIGGER).click();
await page.waitForTimeout(350);
await page.locator(`${ITEM}[title="21°"]`).click();
await page.waitForTimeout(250);
check('thermostat custom: preset writes', (await writes()) === '[{"id":"demo.set","val":21}]', await writes());

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
