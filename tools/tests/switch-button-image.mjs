// The two control styles the Schalter widget and the universal widget's switch cell did not
// share: the widget gains "button", the cell gains "image" — each as the other already had it.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5211    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5211 node tools/tests/switch-button-image.mjs
//
// Worth pinning: the button carries the per-state caption and colours, writes the same values
// the toggle writes and is exactly as tall as the toggle at its default size (so no widget
// metric changes with the style); the image cell draws the per-state image, falls back to the
// ON image for OFF, and writes on click.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5211';

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const LAMP = 'aura-selftest.0.switchstyle.lamp';
const VALUES = { [LAMP]: false };

await page.evaluate((values) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mock(values);
    window.__auraShot.mockServerState(values);
}, VALUES);

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

const mock = (v) =>
    page.evaluate((vals) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState(vals);
    }, v);

async function show(widgets, selector, values = VALUES) {
    await mock(values);
    await page.evaluate((ws) => window.__auraShot.showWidgets(ws), widgets);
    await page.waitForSelector(selector, { timeout: 10000 });
    await mock(values);
    await page.waitForTimeout(400);
    await writes(true);
}

let seq = 0;
const switchWidget = (layout, options = {}) => ({
    id: `switch-${layout}-${++seq}`,
    type: 'switch',
    title: 'Lampe',
    datapoint: LAMP,
    layout,
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options,
});
const actionHeight = async () => (await page.locator('button.aura-widget-action').first().boundingBox())?.height;
const actionText = () => page.locator('button.aura-widget-action').first().innerText();

// ── 1. Schalter widget: button mode ──────────────────────────────────────────
for (const layout of ['default', 'compact']) {
    await show([switchWidget(layout)], 'button.aura-widget-action');
    const toggleH = await actionHeight();
    await show([switchWidget(layout, { controlMode: 'button' })], 'button.aura-widget-action');
    eq(`${layout}: the button reads AUS when off`, await actionText(), 'AUS');
    eq(`${layout}: the button is as tall as the toggle it replaces`, await actionHeight(), toggleH);
    await page.locator('button.aura-widget-action').first().click();
    await page.waitForTimeout(250);
    const log = await writes();
    eq(`${layout}: a click writes the widget datapoint`, log.at(-1)?.id, LAMP);
    eq(`${layout}: and switches it on`, log.at(-1)?.val, true);
}

await show(
    [
        switchWidget('default', {
            controlMode: 'button',
            onText: 'Licht an',
            offText: 'Licht aus',
            buttonOnColor: '#ff0080',
            buttonOnTextColor: '#000000',
        }),
    ],
    'button.aura-widget-action',
    { [LAMP]: true },
);
eq('the ON caption replaces AN', await actionText(), 'Licht an');
const style = await page
    .locator('button.aura-widget-action')
    .first()
    .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
eq('the ON colours paint the button', style, ['rgb(255, 0, 128)', 'rgb(0, 0, 0)']);
await page.locator('button.aura-widget-action').first().click();
await page.waitForTimeout(250);
eq('from on, the click switches it off', (await writes()).at(-1)?.val, false);

await show(
    [
        switchWidget('custom', {
            controlMode: 'button',
            customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'toggle' }] },
        }),
    ],
    'button.aura-widget-action',
);
eq('custom layout: the toggle slot draws the button', await actionText(), 'AUS');

// ── 2. Universal widget: switch cell in image mode ───────────────────────────
const ON_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E#on';
const OFF_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E#off';
const universal = (cell) => ({
    id: `universal-${++seq}`,
    type: 'universal',
    title: 'Zelle',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options: { customGrid: { cols: 1, rows: 1, cells: [{ type: 'switch', dpId: LAMP, ...cell }] } },
});
const cellImg = () => page.locator('.aura-custom-cell-0 button img');

await show(
    [universal({ controlMode: 'image', trueImage: ON_IMG, falseImage: OFF_IMG, fontSize: 40 })],
    '.aura-custom-cell-0 button img',
);
eq('off: the OFF image is drawn', await cellImg().getAttribute('src'), OFF_IMG);
eq('the size option sets the image size', (await cellImg().boundingBox())?.height, 40);
await page.locator('.aura-custom-cell-0 button').first().click();
await page.waitForTimeout(250);
let log = await writes();
eq('a click on the image writes the cell datapoint', log.at(-1)?.id, LAMP);
eq('and switches it on', log.at(-1)?.val, true);

await show(
    [universal({ controlMode: 'image', trueImage: ON_IMG, falseImage: OFF_IMG })],
    '.aura-custom-cell-0 button img',
    {
        [LAMP]: true,
    },
);
eq('on: the ON image is drawn', await cellImg().getAttribute('src'), ON_IMG);

await show([universal({ controlMode: 'image', trueImage: ON_IMG })], '.aura-custom-cell-0 button img');
eq('without an OFF image the ON image stays', await cellImg().getAttribute('src'), ON_IMG);

await show([universal({ controlMode: 'image' })], '.aura-custom-cell-0 button svg');
eq('without any image the icon is drawn', await cellImg().count(), 0);

// ── 3. Editors: the new mode buttons write the options ───────────────────────
await page.evaluate(() => window.__auraShot.unfoldSections());
async function openEditor(widget) {
    await page.evaluate((w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    }, widget);
    await page.waitForSelector(`.aura-widget-${widget.id}`, { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.locator(`.aura-widget-${widget.id}`).hover();
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    return dlg;
}
const optionsOf = (id) => page.evaluate((i) => window.__auraShot.widgetOptions(i), id);

const sw = { ...switchWidget('default'), id: 'sbi-switch' };
let dlg = await openEditor(sw);
await dlg.locator('button:text-is("Button")').first().click();
await page.waitForTimeout(200);
eq('switch editor: "Button" sets controlMode', (await optionsOf('sbi-switch'))?.controlMode, 'button');
await dlg.locator('input[placeholder="AN"]').first().fill('Ein');
await page.waitForTimeout(300);
eq('switch editor: the ON caption lands in onText', (await optionsOf('sbi-switch'))?.onText, 'Ein');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const uni = {
    id: 'sbi-uni',
    type: 'universal',
    title: 'Zelle',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 20, h: 10 },
    options: { customGrid: { cols: 1, rows: 1, cells: [{ type: 'switch', dpId: LAMP }] } },
};
dlg = await openEditor(uni);
await dlg.locator('button:has(> span:text-is("1/1"))').click();
await dlg.locator('button:text-is("Bild")').first().click();
await page.waitForTimeout(200);
const cell0 = async () => (await optionsOf('sbi-uni'))?.customGrid?.cells?.[0];
eq('universal editor: "Bild" sets the cell controlMode', (await cell0())?.controlMode, 'image');
await dlg.locator('input[placeholder="https://… · /adapter/… · data:image/…"]').first().fill('/vis.0/lamp-on.png');
await page.waitForTimeout(300);
eq('universal editor: Bild AN lands in trueImage', (await cell0())?.trueImage, '/vis.0/lamp-on.png');
eq('universal editor: Bild AUS field is offered', await dlg.locator('input[placeholder="leer = wie AN"]').count(), 1);

eq('no page errors', pageErrors, []);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
