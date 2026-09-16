// Verifies that a widget with a scale takes its Min/Max from the datapoint it
// shows (issue #665: a Drehregler on a 10…30 °C setpoint sat on 0…100).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/dp-range-adopt.mjs
//
// The datapoint list is stubbed with __auraShot.mockObjectView, so the alias with
// common.min/max exists without touching a real ioBroker. Two paths are checked in
// the editor: exchanging the datapoint of a widget whose scale is still the 0…100
// default (adopts silently), and the hint under the Min/Max fields that offers the
// range to a widget that already exists (adopts on click, and only then).
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

// The datapoint from the issue — an alias that declares 10…30 °C.
const SETPOINT = 'alias.0.klima.heizung.heizen.raumtemperatur_tag';
// A second one, so exchanging the datapoint has somewhere to go.
const PLAIN = 'alias.0.demo.ohne_bereich';

const stateRow = (id, common) => ({ id, value: { _id: id, type: 'state', common } });
const VIEW = {
    state: [
        stateRow(SETPOINT, {
            name: 'Raumtemperatur Tag',
            type: 'number',
            role: 'level.temperature',
            unit: '°C',
            read: true,
            write: true,
            min: 10,
            max: 30,
        }),
        stateRow(PLAIN, { name: 'Ohne Bereich', type: 'number', role: 'level', read: true, write: true }),
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-knob'));

/** Puts one widget on the board in edit mode and opens its config panel. */
async function open(widget, view) {
    await page.evaluate(
        ([w, v, dp]) => {
            window.__auraShot.mockObjectView(v);
            window.__auraShot.mockServerState({ [dp]: 21 });
            window.__auraShot.mock({ [dp]: 21 });
            window.__auraShot.writes(true);
            window.__auraShot.showWidgets([w], { editMode: true });
            window.__auraShot.setEditMode(true);
        },
        [widget, view, SETPOINT],
    );
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    return dlg;
}

const knob = (datapoint, options) => ({
    id: 'w-knob',
    type: 'knob',
    title: 'Raumtemperatur Tag',
    datapoint,
    gridPos: { x: 0, y: 0, w: 6, h: 6 },
    options: { minValue: 0, maxValue: 100, step: 1, ...options },
});

// ── 1. The hint offers the range of a widget that already exists ─────────────
let dlg = await open(knob(SETPOINT, {}), VIEW);
const adopt = dlg.locator('button:text-is("Übernehmen"):visible').first();
check('the panel says what the datapoint reports', (await dlg.getByText(/Datenpunkt meldet 10/).count()) === 1);
check('and offers to take it over', (await adopt.count()) === 1);
eq('until then the scale is untouched', [(await opts()).minValue, (await opts()).maxValue], [0, 100]);

await adopt.click();
await page.waitForTimeout(400);
eq('one click writes the range', [(await opts()).minValue, (await opts()).maxValue], [10, 30]);
check('and the offer is gone', (await dlg.locator('button:text-is("Übernehmen"):visible').count()) === 0);
check(
    'while the line still says where the numbers come from',
    (await dlg.getByText(/Datenpunkt meldet 10/).count()) === 1,
);
const minField = dlg.locator('label:text-is("Min") + input').first();
eq('the Min field shows it', await minField.inputValue(), '10');

// ── 2. A scale somebody typed in is offered, never overwritten ───────────────
dlg = await open(knob(SETPOINT, { minValue: 5, maxValue: 40 }), VIEW);
check('a hand-set scale still gets the hint', (await dlg.getByText(/Datenpunkt meldet 10/).count()) === 1);
eq('but nothing is written behind the back', [(await opts()).minValue, (await opts()).maxValue], [5, 40]);

// ── 3. A datapoint without a range says so ────────────────────────────
// A missing line would read as a broken feature; it has to name the reason.
dlg = await open(knob(PLAIN, {}), VIEW);
check('no range declared, the line says so', (await dlg.getByText(/meldet keinen Bereich/).count()) === 1);
check('and offers nothing', (await dlg.locator('button:text-is("Übernehmen"):visible').count()) === 0);

// ── 3b. An unknown datapoint says nothing at all ──────────────────────
dlg = await open(knob('alias.0.gibt.es.nicht', {}), VIEW);
check('an id the list does not know stays silent', (await dlg.getByText(/Datenpunkt meldet/).count()) === 0);

// ── 4. Exchanging the datapoint adopts the range right away ──────────────────
dlg = await open(knob(PLAIN, {}), VIEW);
// Locate by label, not by value: the value changes under the locator mid-test.
const dpField = dlg.locator('label:text-is("Datenpunkt-ID") + div input').first();
// The field hands the id over on blur — typing alone only edits the text.
await dpField.fill(SETPOINT);
await dpField.blur();
await page.waitForTimeout(600);
eq('the new datapoint brings its scale', [(await opts()).minValue, (await opts()).maxValue], [10, 30]);
eq('and its unit', (await opts()).unit, '°C');

// ── 5. …but not onto a scale that was set by hand ────────────────────────────
dlg = await open(knob(PLAIN, { minValue: 5, maxValue: 40 }), VIEW);
const dpField2 = dlg.locator('label:text-is("Datenpunkt-ID") + div input').first();
await dpField2.fill(SETPOINT);
await dpField2.blur();
await page.waitForTimeout(600);
eq('the hand-set scale survives the swap', [(await opts()).minValue, (await opts()).maxValue], [5, 40]);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
