// ─────────────────────────────────────────────────────────────────────────────
// Thermostat + Auswahlfeld — layout "circle" (issue #815)
// ─────────────────────────────────────────────────────────────────────────────
// The shared CircleMenu in the two widgets that followed the shutter: the
// thermostat fans out −, its presets and +, the enum its value list. Checks what
// the entries write, that − / + keep the menu open with the setpoint in the
// middle, the active entry, circleOrder, and that the edit dialog offers the
// "Kreismenü" block in both.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/thermostat-enum-circle.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched. SHOT_DIR=<dir> also saves screenshots.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR;
const TRIGGER = '.aura-circle-trigger';
const ITEM = '.aura-circle-item';
const CENTER = '.aura-circle-close';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
const thermostat = (options) => ({
    id: `w-thc-${++seq}`,
    type: 'thermostat',
    title: 'Bad',
    datapoint: 'demo.set',
    layout: 'circle',
    gridPos: { x: 0, y: 0, w: 5, h: 6 },
    options: { showTitle: true, actualDatapoint: 'demo.actual', presets: [17, 19, 21], ...options },
});
const ENTRIES = [
    { value: '0', label: 'Aus', render: 'icon', icon: 'mdi:fan-off' },
    { value: '1', label: 'Stufe 1' },
    { value: '2', label: 'Stufe 2', color: '#ff0000' },
];
const enumW = (options) => ({
    id: `w-enc-${++seq}`,
    type: 'enum',
    title: 'Lüftung',
    datapoint: 'demo.mode',
    layout: 'circle',
    gridPos: { x: 0, y: 0, w: 5, h: 6 },
    options: { showTitle: true, entries: ENTRIES, ...options },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(widget, states = {}) {
    await page.evaluate(
        ([w, s]) => {
            window.__auraShot.mock({ 'demo.set': 19, 'demo.actual': 20.5, 'demo.mode': 1, ...s });
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, states],
    );
    await page.waitForTimeout(400);
}
const writes = async () => JSON.stringify(await page.evaluate(() => window.__auraShot.writes()));
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const open = async () => {
    await page.locator(TRIGGER).click();
    await page.waitForTimeout(350);
};
const shot = async (name) => {
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};
const itemTitles = () => page.locator(ITEM).evaluateAll((els) => els.map((e) => e.getAttribute('title')));
const itemCount = () => page.locator(ITEM).count();

// ── Thermostat ───────────────────────────────────────────────────────────────
await show(thermostat({}));
const tText = (await page.locator(TRIGGER).textContent()) ?? '';
check('thermostat: trigger shows setpoint and reading', /19\D/.test(tText) && /20[.,]5/.test(tText), tText);
await shot('thermostat-circle-closed');

await open();
check(
    'thermostat: entries −, presets, +',
    JSON.stringify(await itemTitles()) === '["Kälter","17°","19°","21°","Wärmer"]',
    JSON.stringify(await itemTitles()),
);
check(
    'thermostat: current preset is active',
    (await page.locator(`${ITEM}[data-active="1"]`).getAttribute('title')) === '19°',
);
check('thermostat: setpoint in the middle', ((await page.locator(CENTER).textContent()) ?? '').includes('19'));
await shot('thermostat-circle-open');

await page.locator(`${ITEM}[title="Wärmer"]`).click();
await page.waitForTimeout(250);
check('thermostat: + writes setpoint + step', (await writes()) === '[{"id":"demo.set","val":19.5}]', await writes());
check('thermostat: + keeps the menu open', (await itemCount()) > 0);

await resetWrites();
await page.locator(`${ITEM}[title="21°"]`).click();
await page.waitForTimeout(250);
check('thermostat: preset writes its temperature', (await writes()) === '[{"id":"demo.set","val":21}]', await writes());
check('thermostat: preset closes the menu', (await itemCount()) === 0);

await show(thermostat({ showControls: false }));
await open();
check(
    'thermostat: showControls off drops − and +',
    JSON.stringify(await itemTitles()) === '["17°","19°","21°"]',
    JSON.stringify(await itemTitles()),
);
await page.keyboard.press('Escape');

await show(thermostat({ circleOrder: ['plus', 'preset-21', 'minus'] }));
await open();
check(
    'thermostat: circleOrder',
    JSON.stringify(await itemTitles()) === '["Wärmer","21°","Kälter","17°","19°"]',
    JSON.stringify(await itemTitles()),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('thermostat: Escape closes', (await itemCount()) === 0);

// ── Enum ─────────────────────────────────────────────────────────────────────
await show(enumW({}));
check('enum: trigger shows the active label', ((await page.locator(TRIGGER).textContent()) ?? '').includes('Stufe 1'));
await shot('enum-circle-closed');

await open();
check(
    'enum: entries in list order',
    JSON.stringify(await itemTitles()) === '["Aus","Stufe 1","Stufe 2"]',
    JSON.stringify(await itemTitles()),
);
check(
    'enum: active entry marked',
    (await page.locator(`${ITEM}[data-active="1"]`).getAttribute('title')) === 'Stufe 1',
);
check('enum: icon entry draws its icon', (await page.locator(`${ITEM}[title="Aus"] svg`).count()) === 1);
check(
    'enum: entry colour tints an inactive entry',
    (await page.locator(`${ITEM}[title="Stufe 2"]`).evaluate((e) => getComputedStyle(e).color)) === 'rgb(255, 0, 0)',
);
await shot('enum-circle-open');

await page.locator(`${ITEM}[title="Stufe 2"]`).click();
await page.waitForTimeout(250);
check('enum: entry writes its value (as number)', (await writes()) === '[{"id":"demo.mode","val":2}]', await writes());
check('enum: pick closes the menu', (await itemCount()) === 0);

await show(enumW({}), { 'demo.mode': 0 });
check('enum: active icon entry shows its icon on the trigger', (await page.locator(`${TRIGGER} svg`).count()) >= 1);

await show(enumW({ confirmAction: true }));
await open();
await page.locator(`${ITEM}[title="Aus"]`).click();
await page.waitForTimeout(250);
check('enum: confirmAction holds the write', (await writes()) === '[]', await writes());
await page.keyboard.press('Escape');

// ── Edit dialog: "Kreismenü" block in both ───────────────────────────────────
await page.evaluate(() => window.__auraShot.unfoldSections());
for (const [label, widget] of [
    ['thermostat', thermostat({})],
    ['enum', enumW({})],
]) {
    await show(widget);
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(500);
    const card = page.locator(`[data-aura-widget="${widget.id}"]`).first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(600);
    const dlg = page.locator('.aura-widget-edit-modal');
    check(
        `${label}: edit dialog shows the circle settings`,
        (await dlg.locator('.aura-circle-settings').count()) === 1,
    );
    check(
        `${label}: order list only where the widget has its own entries`,
        (await dlg.locator('[data-aura-circle-order]').count()) === (label === 'thermostat' ? 1 : 0),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
process.exit(failed.length ? 1 : 0);
