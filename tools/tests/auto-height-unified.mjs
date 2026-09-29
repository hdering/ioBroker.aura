// "Höhe automatisch an Inhalt anpassen" (autoHeight) is one option for every
// content-driven type (utils/autoHeight AUTO_HEIGHT_TYPES): the widget reports
// its content height to autoHeightStore and the Dashboard sizes the grid item.
// Also: the toggle sits in the Darstellung block (only for those types), and
// grabbing the resize handle of such a widget shows a hint at the corner.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/auto-height-unified.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROW = 20; // gridRowHeight of the harness layout
const GAP = 10;
const boxPx = (rows) => rows * ROW + (rows - 1) * GAP;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const rowsJson = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ name: `Zeile ${i + 1}`, wert: i * 3 })));
const mock = {
    'test.json': { val: rowsJson },
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`test.list.${i}`, { val: i * 2, unit: 'W' }])),
};
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

const TYPES = {
    list: { options: { entries: Array.from({ length: 6 }, (_, i) => ({ id: `test.list.${i}` })) } },
    jsontable: { datapoint: 'test.json', options: {} },
    statusoverview: { options: {} },
};

let scenario = 0;
async function show(type, { rows, autoHeight }) {
    scenario += 1;
    const id = `w-ah-${type}-${scenario}`;
    const base = TYPES[type];
    await page.evaluate(
        ([w]) => window.__auraShot.showWidgets([w]),
        [
            {
                id,
                type,
                title: type,
                datapoint: base.datapoint ?? '',
                gridPos: { x: 0, y: 0, w: 6, h: rows },
                options: { ...base.options, autoHeight },
            },
        ],
    );
    await page.waitForTimeout(1200);
    const item = await page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
    });
    return { id, item };
}

// ── 1. every type: off keeps the box, on shrinks a too-tall and grows a too-short one ──
for (const type of Object.keys(TYPES)) {
    const off = await show(type, { rows: 30, autoHeight: false });
    check(`${type}: off keeps the stored box`, off.item === boxPx(30), `${off.item}px`);
    const tall = await show(type, { rows: 30, autoHeight: true });
    check(`${type}: on shrinks a too-tall box`, tall.item > 0 && tall.item < boxPx(30), `${tall.item}px`);
    const short = await show(type, { rows: 1, autoHeight: true });
    check(`${type}: on grows a too-short box`, short.item > boxPx(1), `${short.item}px`);
    check(`${type}: same content, same height`, Math.abs(short.item - tall.item) <= 1, `${short.item} vs ${tall.item}`);
}

// ── 3. toggle in the Darstellung block, only for content types ─────────────
async function openEditor(id) {
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(600);
    const card = page.locator(`[data-aura-widget="${id}"]`);
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(600);
    return page.locator('.aura-widget-edit-modal');
}
async function closeEditor() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

const listW = await show('list', { rows: 4, autoHeight: false });
let dlg = await openEditor(listW.id);
const toggle = dlg.locator('details [data-auto-height-option]');
check('list: toggle sits in the Darstellung block', (await toggle.count()) === 1);
await toggle.evaluate((b) => b.click());
await page.waitForTimeout(300);
const listOpts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), listW.id);
check('list: toggle writes options.autoHeight', listOpts?.autoHeight === true, JSON.stringify(listOpts?.autoHeight));
await closeEditor();

scenario += 1;
await page.evaluate(
    ([w]) => window.__auraShot.showWidgets([w]),
    [
        {
            id: 'w-ah-switch',
            type: 'switch',
            title: 'Schalter',
            datapoint: 'test.list.0',
            gridPos: { x: 0, y: 0, w: 4, h: 4 },
            options: {},
        },
    ],
);
await page.waitForTimeout(800);
dlg = await openEditor('w-ah-switch');
check('switch: no auto-height toggle', (await dlg.locator('[data-auto-height-option]').count()) === 0);
await closeEditor();

// ── 4. resize hint at the handle ───────────────────────────────────────────
const hinted = await show('list', { rows: 4, autoHeight: true });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(800);
const handle = page.locator(`[data-aura-widget="${hinted.id}"] .react-resizable-handle`).first();
const hb = await handle.boundingBox();
check('resize handle is there', !!hb);
if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 10, hb.y + 80, { steps: 6 });
    const hint = page.locator(`[data-aura-widget="${hinted.id}"] [data-auto-height-lock-hint]`);
    check('hint shows while resizing', (await hint.count()) === 1);
    await page.screenshot({ path: 'node_modules/.cache/auto-height-hint.png' });
    await page.mouse.up();
    check('hint stays briefly after release', (await hint.count()) === 1);
    await page.waitForTimeout(3000);
    check('hint disappears again', (await hint.count()) === 0);
}
// A normal widget gets no hint.
const plain = await show('list', { rows: 4, autoHeight: false });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(800);
await page.locator(`[data-aura-widget="${plain.id}"]`).hover();
const ph = await page.locator(`[data-aura-widget="${plain.id}"] .react-resizable-handle`).first().boundingBox();
check('fixed widget: resize handle is there', !!ph);
if (ph) {
    await page.mouse.move(ph.x + ph.width / 2, ph.y + ph.height / 2);
    await page.mouse.down();
    await page.mouse.move(ph.x + 10, ph.y + 60, { steps: 6 });
    check('no hint for a fixed-height widget', (await page.locator('[data-auto-height-lock-hint]').count()) === 0);
    await page.mouse.up();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
