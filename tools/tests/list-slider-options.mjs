// Verifies that the "Schieberegler" display of BOTH list widgets offers the same
// settings as the standalone Schieberegler widget: scale + step, colour, native or
// bar look, track thickness / bar height, control width, value / unit / min-max
// labels, write-on-release and the read-only progress bar.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-slider-options.mjs
//
// Both lists render the shared SliderControl (entryControls), so every case runs
// against the static and the dynamic list. The last block drives the editor: the
// per-entry panel has to write those fields onto the entry.
//
// Datapoint values are injected via the screenshot harness (__auraShot.mock) and
// writes are logged instead of sent — no real datapoint is touched.
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

const DP = 'demo.slider.VOLUME';
const ROOT = '.aura-widget-w-sl';
const RANGE = `${ROOT} input[type="range"]`;
const BAR = `${ROOT} .aura-slider-bar`;
const TYPES = ['list', 'autolist'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** One list widget with a single slider entry; arms the write log. */
async function show(type, entryPatch = {}, value = 42, layout) {
    const widget = {
        id: 'w-sl',
        type,
        title: 'Regler',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            showTitle: false,
            hideFilterButton: true,
            syncIntervalMin: 999,
            entries: [{ id: DP, label: 'Regler', displayType: 'slider', ...entryPatch }],
        },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, { [DP]: value }],
    );
    await page.waitForTimeout(400);
}

const attrs = () =>
    page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return {
            min: el.min,
            max: el.max,
            step: el.step,
            value: el.value,
            disabled: el.disabled,
            height: getComputedStyle(el).height,
            width: Math.round(el.getBoundingClientRect().width),
        };
    }, RANGE);

const text = () =>
    page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(), ROOT);

const writes = () => page.evaluate(() => window.__auraShot.writes());

// ── 1. Scale and step reach the control ──────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderMin: -20, sliderMax: 40, sliderStep: 0.5, unit: '°C' }, 21.5);
    const a = await attrs();
    eq(`${type}: min/max/step come from the entry`, [a?.min, a?.max, a?.step], ['-20', '40', '0.5']);
    check(`${type}: the value prints with the step's decimals`, (await text()).includes('21.5°C'), await text());
}

// ── 2. Writes are stepped and clamped to the scale ───────────────────────────────
// A range input refuses a value off its step grid, so the drag is replayed the way
// the browser does it: set the value, fire "input". The snapping under test is ours.
const dragRange = (v) =>
    page.$eval(
        RANGE,
        (el, val) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, String(val));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        v,
    );

for (const type of TYPES) {
    await show(type, { sliderMin: 0, sliderMax: 255, sliderStep: 5 }, 100);
    await dragRange(123);
    await page.waitForTimeout(150);
    eq(`${type}: the write snaps onto the step`, (await writes()).at(-1), { id: DP, val: 125 });
    await dragRange(999);
    await page.waitForTimeout(150);
    eq(`${type}: and never leaves the scale`, (await writes()).at(-1), { id: DP, val: 255 });
}

// ── 3. Write on release ──────────────────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderCommitOnRelease: true }, 10);
    await page.locator(RANGE).fill('70');
    await page.waitForTimeout(150);
    eq(`${type}: dragging writes nothing while the button is held`, await writes(), []);
    eq(`${type}: but the thumb follows the finger`, (await attrs())?.value, '70');
    await page.locator(RANGE).dispatchEvent('mouseup');
    await page.waitForTimeout(150);
    eq(`${type}: releasing writes once`, await writes(), [{ id: DP, val: 70 }]);
}

// ── 4. Read-only progress bar ────────────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderReadOnly: true }, 42);
    const a = await attrs();
    check(`${type}: the read-only slider still renders`, !!a, JSON.stringify(a));
    eq(`${type}: and refuses input`, a?.disabled, true);
}

// ── 5. Bar style, bar height and colour ──────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderBarStyle: true, sliderBarSize: 50, sliderColor: '#ff0000' }, 25);
    const bar = await page.evaluate(
        ([barSel, rangeSel]) => {
            const el = document.querySelector(barSel);
            if (!el) return null;
            const fill = el.firstElementChild;
            return {
                height: getComputedStyle(el).height,
                fill: fill ? getComputedStyle(fill).backgroundColor : null,
                fillPct: fill ? fill.style.width : null,
                ranges: document.querySelectorAll(rangeSel).length,
            };
        },
        [BAR, RANGE],
    );
    eq(`${type}: the bar replaces the native control`, bar?.ranges, 0);
    eq(`${type}: bar height follows sliderBarSize`, bar?.height, '8px');
    eq(`${type}: the fill takes the configured colour`, bar?.fill, 'rgb(255, 0, 0)');
    eq(`${type}: and shows the value as a share of the scale`, bar?.fillPct, '25%');
    // The bar is dragged, not typed into: a click at 80 % of its width writes 80.
    const box = await page.locator(BAR).boundingBox();
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.waitForTimeout(150);
    eq(`${type}: clicking the bar writes that position`, (await writes()).at(-1), { id: DP, val: 80 });
}

// ── 6. Track thickness and control width ─────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderThickness: 12, sliderWidth: 200 }, 42);
    const a = await attrs();
    eq(`${type}: the track takes the configured thickness`, a?.height, '12px');
    check(`${type}: and the control the configured width`, Math.abs((a?.width ?? 0) - 200) <= 2, `${a?.width}px`);
}

// ── 7. Value / unit / min-max labels ─────────────────────────────────────────
for (const type of TYPES) {
    await show(type, { unit: 'W', sliderMin: 0, sliderMax: 500, sliderShowMinMax: true }, 250);
    check(`${type}: the scale ends are printed`, /0.*500/.test(await text()), await text());

    await show(type, { unit: 'W' }, 42);
    check(`${type}: the unit sits next to the value`, (await text()).includes('42W'), await text());

    await show(type, { unit: 'W', sliderShowUnit: false }, 42);
    check(`${type}: turning the unit off drops it`, !(await text()).includes('42W'), await text());

    await show(type, { sliderShowValue: false }, 42);
    check(`${type}: turning the value off drops it`, !(await text()).includes('42'), await text());
}

// ── 8. Card layout gets the same options ─────────────────────────────────────
for (const type of TYPES) {
    await show(type, { sliderMin: 0, sliderMax: 255, sliderStep: 5, unit: 'lx' }, 100, 'card');
    const a = await attrs();
    eq(`${type}/card: min/max/step reach the card control too`, [a?.min, a?.max, a?.step], ['0', '255', '5']);
    check(`${type}/card: the value prints above it`, (await text()).includes('100'), await text());
}

// ── 9. The editor writes those fields onto the entry ─────────────────────────
// Same per-entry panel in both lists (EntryControlsConfig), reached through
// "Datenpunkte verwalten" — driven here on the static one.
await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-sl',
                type: 'list',
                title: 'Liste',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { entries: [{ id: 'demo.slider.VOLUME', label: 'Regler' }] },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-sl'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
await trigger.click();

const dlg = page.locator('.aura-config-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('text=Regler').first().click();
await page.waitForTimeout(300);
await dlg.locator('button:text-is("Schieberegler"):visible').first().click();
await page.waitForTimeout(300);
eq('picking the display writes displayType', (await opts()).entries[0].displayType, 'slider');

const field = (label) => dlg.locator(`label:text-is("${label}") + input`).first();
await field('Min').fill('-10');
await field('Max').fill('40');
await field('Schritt').fill('0.5');
await page.waitForTimeout(400);
const after = (await opts()).entries[0];
eq('the scale lands on the entry', [after.sliderMin, after.sliderMax, after.sliderStep], [-10, 40, 0.5]);

await field('Breite (px, leer = 80)').fill('160');
await page.waitForTimeout(300);
eq('and so does the control width', (await opts()).entries[0].sliderWidth, 160);

await dlg.locator('button:text-is("Balken"):visible').first().click();
await page.waitForTimeout(300);
eq('the bar style lands on the entry', (await opts()).entries[0].sliderBarStyle, true);
check(
    'and swaps the thickness field for the bar height',
    (await dlg.locator('label:text-is("Balkenhöhe (%)"):visible').count()) === 1,
);

await dlg.locator('label:text-is("Min/Max-Beschriftung") + button').first().click();
await dlg.locator('label:text-is("Erst beim Loslassen schreiben") + button').first().click();
await dlg.locator('label:text-is("Wert anzeigen") + button').first().click();
await page.waitForTimeout(400);
const flags = (await opts()).entries[0];
eq(
    'the toggles land on the entry',
    [flags.sliderShowMinMax, flags.sliderCommitOnRelease, flags.sliderShowValue],
    [true, true, false],
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
