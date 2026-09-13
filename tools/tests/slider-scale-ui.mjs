// Verifies the step scale (#643) in all three places that draw a slider: the
// Schieberegler widget, a list row and the universal widget's slider cell.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/slider-scale-ui.mjs
//
// Checked: the numbers the issue asked for actually appear, the marks line up
// with the track (proved against the bar fill, whose edge is measurable, and
// against the native control's 8 px thumb inset), the scale takes over the
// min/max labels beside the track, and a 0…255 dimmer does not explode into 256
// marks.
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
const near = (name, got, want, tol, unit = 'px') =>
    check(name, Math.abs(got - want) <= tol, `got ${got.toFixed(2)}${unit}, want ${want.toFixed(2)}±${tol}`);

const DP = 'demo.dev1.VOLUME';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((dp) => {
    window.__auraShot.mock({ [dp]: 5 });
    window.__auraShot.mockServerState({ [dp]: 5 });
}, DP);

const show = (widgets) => page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
const settle = () => page.waitForTimeout(600);

/** The numbers printed on one widget's scale, left to right. */
const scaleNumbers = (id) =>
    page.evaluate(
        (w) =>
            [...document.querySelectorAll(`.aura-widget-${w} .aura-slider-scale span`)]
                .filter((el) => el.style.visibility !== 'hidden')
                .map((el) => el.textContent.trim()),
        id,
    );

/** Centre x of every mark on one widget's scale. */
const markXs = (id) =>
    page.evaluate(
        (w) =>
            [...document.querySelectorAll(`.aura-widget-${w} .aura-slider-scale div`)]
                .filter((el) => el.style.background)
                .map((el) => {
                    const r = el.getBoundingClientRect();
                    return r.left + r.width / 2;
                }),
        id,
    );

const rect = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom, height: r.height };
    }, sel);

const text = (id) =>
    page.evaluate(
        (w) => (document.querySelector(`.aura-widget-${w}`)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        id,
    );

// ── 1. The widget, native control: the issue's own example ───────────────────
await show([
    {
        id: 'sc-native',
        type: 'slider',
        title: 'Regler',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
        options: { min: 1, max: 10, step: 1, showScale: true, showMinMax: true },
    },
]);
await settle();
eq('widget: every step from min to max is printed', await scaleNumbers('sc-native'), [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
]);

{
    const marks = await markXs('sc-native');
    const track = await rect('.aura-widget-sc-native input[type="range"]');
    eq('widget: one mark per step', marks.length, 10);
    // The native thumb is 16 px (index.css), so the usable track starts and ends
    // half a thumb inside the control. Marks that ignore that drift by 8 px.
    near('widget: the first mark sits half a thumb inside the track', marks[0], track.left + 8, 1.5);
    near('widget: the last mark sits half a thumb inside the track', marks[9], track.right - 8, 1.5);
    const gaps = marks.slice(1).map((x, i) => x - marks[i]);
    near('widget: the marks are evenly spaced', Math.max(...gaps) - Math.min(...gaps), 0, 1.5);
    check('widget: the scale takes over the min/max labels', !/^1 .*10/.test(await text('sc-native')));
}

// ── 2. The widget, bar look: marks against a measurable fill edge ────────────
// The bar runs edge to edge, so the fill's right edge IS the position of the
// current value — the one place where alignment can be proved, not recomputed.
await show([
    {
        id: 'sc-bar',
        type: 'slider',
        title: 'Balken',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
        options: { min: 1, max: 10, step: 1, showScale: true, barStyle: true },
    },
]);
await settle();
{
    const marks = await markXs('sc-bar');
    const fill = await rect('.aura-widget-sc-bar .aura-widget-action.nodrag > div');
    // Value 5 of 1…10 → the fill ends on the fifth mark.
    near('widget (bar): the fill edge lands on the mark for the current value', fill.right, marks[4], 1.5);
}

// ── 3. A list row ────────────────────────────────────────────────────────────
await show([
    {
        id: 'sc-list',
        type: 'list',
        title: 'Liste',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 5 },
        options: {
            entries: [
                {
                    id: DP,
                    label: 'Regler',
                    displayType: 'slider',
                    sliderMin: 1,
                    sliderMax: 10,
                    sliderStep: 1,
                    sliderWidth: 240,
                    sliderShowScale: true,
                    sliderShowMinMax: true,
                },
            ],
            showTitle: false,
            hideFilterButton: true,
        },
    },
]);
await settle();
eq('list row: the scale is drawn under the row control', (await scaleNumbers('sc-list')).length, 10);
{
    const marks = await markXs('sc-list');
    const track = await rect('.aura-widget-sc-list input[type="range"]');
    near('list row: the first mark sits half a thumb inside the track', marks[0], track.left + 8, 1.5);
    near('list row: the last mark sits half a thumb inside the track', marks[9], track.right - 8, 1.5);
}

// ── 4. The universal widget's slider cell ────────────────────────────────────
await show([
    {
        id: 'sc-cell',
        type: 'universal',
        title: 'Zelle',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
        options: {
            customGrid: {
                cols: 1,
                rows: 1,
                cells: [{ type: 'slider', dpId: DP, min: 1, max: 10, step: 1, showScale: true }],
            },
            showTitle: false,
            showIcon: false,
        },
    },
]);
await settle();
eq('cell: the scale is drawn in the slider cell', await scaleNumbers('sc-cell'), [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
]);
{
    const marks = await markXs('sc-cell');
    const track = await rect('.aura-widget-sc-cell input[type="range"]');
    near('cell: the first mark sits half a thumb inside the track', marks[0], track.left + 8, 1.5);
    near('cell: the last mark sits half a thumb inside the track', marks[9], track.right - 8, 1.5);
}

// ── 5. A 0…255 dimmer does not draw 256 marks ────────────────────────────────
await show([
    {
        id: 'sc-dimmer',
        type: 'slider',
        title: 'Dimmer',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
        options: { min: 0, max: 255, step: 1, showScale: true },
    },
]);
await settle();
{
    const nums = await scaleNumbers('sc-dimmer');
    check('dimmer: the fine scale is thinned out', nums.length > 1 && nums.length <= 15, nums.join(' '));
    eq('dimmer: it still starts at min', nums[0], '0');
    eq('dimmer: it still ends at max', nums[nums.length - 1], '255');
}

// ── 6. Turning the scale off leaves the widget as it was ─────────────────────
await show([
    {
        id: 'sc-off',
        type: 'slider',
        title: 'Ohne',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 10, h: 4 },
        options: { min: 1, max: 10, step: 1, showMinMax: true },
    },
]);
await settle();
eq('scale off: nothing is drawn', (await markXs('sc-off')).length, 0);
check('scale off: the min/max labels are back', (await text('sc-off')).includes('10'), await text('sc-off'));

// ── 7. The editor ────────────────────────────────────────────────────────────
// The visible fields live in the Schieberegler block, not in the generic
// "Darstellung" one: the scale brings settings of its own and they belong next
// to their own switch. A field the widget draws only on request must also start
// unticked - a plain "unset = on" would show it as active while nothing is drawn.
await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'sc-edit',
                type: 'slider',
                title: 'Regler',
                datapoint: 'demo.dev1.VOLUME',
                gridPos: { x: 0, y: 0, w: 10, h: 4 },
                options: { min: 1, max: 10, step: 1 },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const editOpts = () => page.evaluate(() => window.__auraShot.widgetOptions('sc-edit'));
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();

const box = (label) => page.locator(`label:has(span:text-is("${label}")) input[type="checkbox"]`);
const scaleToggle = box('Skala (Schritte)');
await scaleToggle.waitFor({ timeout: 10000 });
check('editor: the scale box starts unticked', !(await scaleToggle.isChecked()));
check('editor: the min/max box starts unticked too', !(await box('Min/Max-Beschriftung').isChecked()));
check('editor: the value box starts ticked', await box('Wert').isChecked());

await scaleToggle.check();
await page.waitForTimeout(200);
eq('editor: ticking it sets showScale', (await editOpts()).showScale, true);

const everyField = page.locator('span:text-is("Skala: jeden n-ten Schritt") + input');
await everyField.waitFor({ timeout: 5000 });
await everyField.fill('3');
await page.waitForTimeout(200);
eq('editor: the label interval reaches the option', (await editOpts()).scaleLabelEvery, 3);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nslider-scale-ui: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
