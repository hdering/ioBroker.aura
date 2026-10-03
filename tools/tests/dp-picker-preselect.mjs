// The datapoint picker opens on the datapoint the field already holds (#746).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-picker-preselect.mjs
//
// The climate widget's setpoint / humidity / pressure fields used to open the picker
// on the *actual temperature* — every picker target the pre-selection didn't know fell
// back to actualDatapoint. Checked: each "Aus ioBroker wählen" button of the climate
// panel opens with its own datapoint in the search field, and picking writes back into
// that same option (and only that one).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const DP = {
    main: 'test.0.climate.actual',
    target: 'test.0.climate.setpoint',
    humidity: 'test.0.climate.humidity',
    pressure: 'test.0.climate.pressure',
};
const stateRow = (id, name) => ({
    id,
    value: { _id: id, type: 'state', common: { name, type: 'number', role: 'value', read: true } },
});
const VIEW = {
    state: [...Object.entries(DP).map(([k, id]) => stateRow(id, k)), stateRow('test.0.climate.other', 'other')],
    instance: [
        {
            id: 'system.adapter.test.0',
            value: { _id: 'system.adapter.test.0', type: 'instance', common: { enabled: true } },
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const widget = {
    id: 'w-clim',
    type: 'climate',
    title: 'Wohnzimmer',
    datapoint: DP.main,
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options: {
        actualDatapoint: DP.main,
        targetDatapoint: DP.target,
        humidityDatapoint: DP.humidity,
        pressureDatapoint: DP.pressure,
    },
};

await page.evaluate(
    ([w, v]) => {
        window.__auraShot.mockObjectView(v);
        window.__auraShot.writes(true);
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    [widget, VIEW],
);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(300);

/** Text field right before each picker button — the value the field shows. */
const fields = await dlg
    .locator('button[title="Aus ioBroker wählen"]')
    .evaluateAll((btns) => btns.map((b) => b.parentElement?.querySelector('input')?.value ?? null));

const picker = page.locator('.aura-dp-picker');
const searchOf = async (i) => {
    await dlg.locator('button[title="Aus ioBroker wählen"]').nth(i).click();
    await picker.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    const v = await picker.locator('input').first().inputValue();
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached', timeout: 5000 });
    return v;
};

for (const key of ['target', 'humidity', 'pressure']) {
    const i = fields.indexOf(DP[key]);
    check(`the panel shows a field holding the ${key} datapoint`, i >= 0, JSON.stringify(fields));
    if (i < 0) continue;
    eq(`the ${key} picker opens on its own datapoint`, await searchOf(i), DP[key]);
}

// Picking writes into the field the picker was opened from — not actualDatapoint.
{
    const i = fields.indexOf(DP.humidity);
    await dlg.locator('button[title="Aus ioBroker wählen"]').nth(i).click();
    await picker.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    const search = picker.locator('input').first();
    await search.fill('test.0.climate.other');
    await page.waitForTimeout(300);
    await picker.getByText('test.0.climate.other').first().click();
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-clim'));
    eq('picking sets humidityDatapoint', opts?.humidityDatapoint, 'test.0.climate.other');
    eq('and leaves actualDatapoint alone', opts?.actualDatapoint, DP.main);
    eq('and leaves targetDatapoint alone', opts?.targetDatapoint, DP.target);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
