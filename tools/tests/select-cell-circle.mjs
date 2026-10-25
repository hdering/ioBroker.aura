// ─────────────────────────────────────────────────────────────────────────────
// Auswahlfeld-Zelle als Kreismenü (issue #838)
// ─────────────────────────────────────────────────────────────────────────────
// A custom-grid 'select' cell with `selectDisplay: 'circle'` draws the
// Auswahlfeld's circle menu inside the cell: the trigger shows the current entry,
// every entry is a button around it, and `circleStep` adds − / + for numbers
// (within min/max). Checks what each of them writes.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/select-cell-circle.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched. SHOT_DIR=<dir> also saves screenshots.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR;
const TRIGGER = '.aura-circle-trigger';
const ITEM = '.aura-circle-item';
// The widget sits top left; the open menu reaches a little past it.
const CLIP = { x: 0, y: 66, width: 190, height: 180 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ENTRIES = [
    { value: '0', label: 'Aus' },
    { value: '1', label: 'Stufe 1' },
    { value: '2', label: 'Stufe 2', color: '#ff0000' },
];
let seq = 0;
const widget = (cellExtra) => ({
    id: `w-scc-${++seq}`,
    type: 'universal',
    title: 'Lüftung',
    datapoint: '',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 4, h: 5 },
    options: {
        customGrid: {
            cols: 1,
            rows: 1,
            cells: [{ type: 'select', dpId: 'demo.mode', entries: ENTRIES, selectDisplay: 'circle', ...cellExtra }],
        },
    },
});

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
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

async function show(w, states = {}) {
    await page.evaluate(
        ([wd, s]) => {
            window.__auraShot.mock({ 'demo.mode': 1, ...s });
            window.__auraShot.showWidgets([wd]);
            window.__auraShot.writes(true);
        },
        [w, states],
    );
    await page.waitForTimeout(400);
}
const writes = async () => JSON.stringify(await page.evaluate(() => window.__auraShot.writes()));
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const titles = () => page.locator(ITEM).evaluateAll((els) => els.map((e) => e.getAttribute('title')));
const open = async () => {
    await page.locator(TRIGGER).click();
    await page.waitForTimeout(350);
};

await show(widget({}));
check('trigger drawn in the cell', (await page.locator(TRIGGER).count()) === 1);
check('no dropdown in circle display', (await page.locator('.aura-custom-cell-0 select').count()) === 0);
check('trigger shows the current entry', ((await page.locator(TRIGGER).textContent()) ?? '').includes('Stufe 1'));
if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/select-circle-closed.png`, clip: CLIP });
await open();
check(
    'entries in list order',
    JSON.stringify(await titles()) === '["Aus","Stufe 1","Stufe 2"]',
    JSON.stringify(await titles()),
);
check('current entry is active', (await page.locator(`${ITEM}[data-active="1"]`).getAttribute('title')) === 'Stufe 1');
if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/select-circle-open.png`, clip: CLIP });
await page.locator(`${ITEM}[title="Stufe 2"]`).click();
await page.waitForTimeout(250);
check('entry writes its value as number', (await writes()) === '[{"id":"demo.mode","val":2}]', await writes());
check('entry closes the menu', (await page.locator(ITEM).count()) === 0);

// − / + with circleStep, clamped by min/max.
await show(widget({ circleStep: 1, min: 0, max: 2 }), { 'demo.mode': 2 });
await open();
check(
    'circleStep adds − and +',
    JSON.stringify(await titles()) === '["−","Aus","Stufe 1","Stufe 2","+"]',
    JSON.stringify(await titles()),
);
await page.locator(`${ITEM}[title="−"]`).click();
await page.waitForTimeout(250);
check('− steps down', (await writes()) === '[{"id":"demo.mode","val":1}]', await writes());
check('− keeps the menu open', (await page.locator(ITEM).count()) > 0);
await resetWrites();
await page.locator(`${ITEM}[title="+"]`).click();
await page.waitForTimeout(250);
check('+ is clamped to max', (await writes()) === '[{"id":"demo.mode","val":2}]', await writes());
await page.keyboard.press('Escape');

// Fractional steps must not leak float noise.
await show(widget({ circleStep: 0.1 }), { 'demo.mode': 0.2 });
await open();
await page.locator(`${ITEM}[title="+"]`).click();
await page.waitForTimeout(250);
check('0.2 + 0.1 writes 0.3', (await writes()) === '[{"id":"demo.mode","val":0.3}]', await writes());
await page.keyboard.press('Escape');

// Dropdown stays the default.
await show(widget({ selectDisplay: undefined }));
check('default display is the dropdown', (await page.locator(TRIGGER).count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
