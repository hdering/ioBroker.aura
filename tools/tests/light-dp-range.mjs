// Verifies that the light widget takes its colour-temperature and brightness range
// from the datapoint when Min/Max are left empty (issue #923: one shared popup with
// {{parent}}.TEMPERATURE serves lamps of 2000–6500 K and 2200–4000 K).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/light-dp-range.mjs
//
// The objects are seeded with __auraShot.mockObject, the datapoint ids are invented
// and writes are captured, so nothing reaches a real ioBroker.
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

const NARROW = 'alias.0.aura_test923.treppe.TEMPERATURE';
const WIDE = 'alias.0.aura_test923.esszimmer.TEMPERATURE';
const BARE = 'alias.0.aura_test923.ohne.TEMPERATURE';
const DIMMER = 'alias.0.aura_test923.dimmer.LEVEL';
const FRACTION = 'alias.0.aura_test923.anteil.LEVEL';

const obj = (id, common) => ({
    _id: id,
    type: 'state',
    common: { type: 'number', read: true, write: true, ...common },
});
const OBJECTS = {
    [NARROW]: obj(NARROW, { min: 2200, max: 4000, unit: 'K' }),
    [WIDE]: obj(WIDE, { min: 2000, max: 6500, unit: 'K' }),
    [BARE]: obj(BARE, { unit: 'K' }),
    [DIMMER]: obj(DIMMER, { min: 0, max: 254 }),
    [FRACTION]: obj(FRACTION, { min: 0, max: 1 }),
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((o) => {
    window.__auraShot.mockObject(o);
    window.__auraShot.captureWrites(true);
}, OBJECTS);

const light = (layout, options) => ({
    id: 'w-light',
    type: 'light',
    title: 'Licht',
    layout,
    gridPos: { x: 0, y: 0, w: 4, h: 8 },
    options: { colorMode: 'none', ...options },
});

/** Shows one light widget; no value on the DP, so the slider sits at the middle of its range. */
async function show(widget) {
    await page.evaluate((w) => {
        window.__auraShot.writes(true);
        window.__auraShot.showWidgets([w]);
    }, widget);
    await page.waitForTimeout(500);
}

/** The "… K" label of the colour-temperature slider. */
const ctLabel = () =>
    page
        .locator('div.nodrag', { hasText: / K$/ })
        .last()
        .innerText()
        .then((t) => t.trim());

/** Drags the slider past its top edge (pointer capture clamps to max) and returns the writes. */
async function dragToTop(selector) {
    const box = await page.locator(selector).last().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    return page.evaluate(() => window.__auraShot.writes());
}

// ── Colour temperature ───────────────────────────────────────────────────────
await show(light('light-temperature', { temperatureDp: NARROW }));
eq('empty fields follow the 2200–4000 K datapoint', await ctLabel(), '3100 K');
let writes = await dragToTop('div.nodrag.rounded-2xl');
eq('and the top of the slider writes its max', writes.at(-1)?.val, 4000);

await show(light('light-temperature', { temperatureDp: WIDE }));
eq('the same widget on a 2000–6500 K lamp', await ctLabel(), '4250 K');

await show(light('light-temperature', { temperatureDp: BARE }));
eq('a datapoint without a range falls back to the default', await ctLabel(), '4250 K');

await show(light('light-temperature', { temperatureDp: NARROW, ctMin: 2700 }));
eq('a typed bound wins, the empty one still follows the datapoint', await ctLabel(), '3350 K');

await show(light('light-temperature', { temperatureDp: WIDE, ctMin: 2000, ctMax: 3000 }));
writes = await dragToTop('div.nodrag.rounded-2xl');
eq('typed bounds narrow the range below the datapoint', writes.at(-1)?.val, 3000);

// ── Brightness ───────────────────────────────────────────────────────────────
await show(light('light-brightness', { brightnessDp: DIMMER }));
writes = await dragToTop('div.nodrag.rounded-2xl');
eq('a 0–254 dimmer is driven up to 254', writes.at(-1)?.val, 254);

await show(light('light-brightness', { brightnessDp: FRACTION }));
const box = await page.locator('div.nodrag.rounded-2xl').last().boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(200);
writes = await page.evaluate(() => window.__auraShot.writes());
const v = writes.at(-1)?.val;
check('a 0…1 level keeps its fractions', typeof v === 'number' && v > 0.3 && v < 0.7, `got ${v}`);

// ── Editor: empty fields say where the value comes from ──────────────────────
await page.evaluate(
    (w) => {
        window.__auraShot.unfoldSections(true);
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    light('light-all', { temperatureDp: NARROW, ctMax: 3800 }),
);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
const ctMinField = dlg.locator('label:text-is("Min (warm)") + div input');
const ctMaxField = dlg.locator('label:text-is("Max (kalt)") + div input');
eq('an empty Min shows the datapoint value', await ctMinField.getAttribute('placeholder'), '2200 (Datenpunkt)');
eq('a typed Max shows its value', await ctMaxField.inputValue(), '3800');
await dlg.locator('label:text-is("Max (kalt)") + div button').click();
await page.waitForTimeout(300);
const opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-light'));
check('the × empties the option', opts.ctMax === undefined, `ctMax ${JSON.stringify(opts.ctMax)}`);
eq('and the field falls back to the datapoint', await ctMaxField.getAttribute('placeholder'), '4000 (Datenpunkt)');

eq('no page errors', pageErrors, []);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
