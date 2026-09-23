// Header items in the folded card (issue #676): extra values beside the title and in
// an optional second row.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/header-items.mjs
//
// Checked in the browser: each source renders (datapoint, the widget's main value,
// a list sum, a text with bindings), items land on their slot, a second row only
// appears when used and then folds the card one row taller, 'expanded' items stay
// out of the folded header, long values truncate instead of growing the card, and
// the editor popup under Darstellung → Kopfzeile writes options.headerItems. The
// value logic itself is covered by header-items-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const VALUES = {
    'demo.temp': { val: 21.5, unit: '°C' },
    'demo.pv': { val: 1234.56 },
    'demo.l1': { val: 100 },
    'demo.l2': { val: 250 },
    'demo.l3': { val: 0 },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate((v) => {
    window.__auraShot.mockServerState(v);
    window.__auraShot.mock(v);
}, VALUES);

const settle = () => page.waitForTimeout(600);
let seq = 0;
/** Fresh id per case: the collapse store and the harness remember widgets by id. */
async function show(type, options, extra = {}, gridPos = { x: 0, y: 0, w: 14, h: 10 }) {
    const id = `hi-${++seq}`;
    const widget = {
        id,
        type,
        title: 'Wohnzimmer',
        datapoint: 'demo.temp',
        layout: 'default',
        gridPos,
        ...extra,
        options: { defaultCollapsed: true, ...options },
    };
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget]);
    await settle();
    return id;
}
const card = (id) => page.locator(`[data-aura-widget="${id}"]`).first();
const slotText = (id, slot) =>
    card(id)
        .locator(`[data-header-slot="${slot}"]`)
        .innerText()
        .catch(() => null);
const height = async (id) => (await card(id).boundingBox())?.height ?? 0;

// ── 1. Sources ────────────────────────────────────────────────────────────────
let id = await show('value', {
    unit: '°C',
    headerItems: [
        { id: 'a', source: 'widget', widgetValue: 'main', slot: 'r1-right' },
        { id: 'b', source: 'dp', dp: 'demo.pv', decimals: 0, unit: 'W', slot: 'r1-center' },
    ],
});
check('main value beside the title', (await slotText(id, 'r1-right')) === '21.5 °C', await slotText(id, 'r1-right'));
check(
    'free datapoint, rounded, with unit',
    (await slotText(id, 'r1-center')) === '1235 W',
    await slotText(id, 'r1-center'),
);
check('no second row without r2 items', (await card(id).locator('[data-header-row="2"]').count()) === 0);

id = await show('value', {
    headerItems: [{ id: 't', source: 'text', text: 'Jetzt {dp}, PV {demo.pv;round(0)}', slot: 'r1-right' }],
});
check('text with bindings', (await slotText(id, 'r1-right')) === 'Jetzt 21.5, PV 1235', await slotText(id, 'r1-right'));

id = await show(
    'list',
    {
        entries: [{ id: 'demo.l1' }, { id: 'demo.l2' }, { id: 'demo.l3' }],
        headerItems: [
            { id: 's', source: 'widget', widgetValue: 'list:sum', unit: 'W', slot: 'r1-right' },
            { id: 'c', source: 'text', text: '{active}/{count} an', slot: 'r1-center' },
        ],
    },
    { datapoint: '' },
);
check('list sum', (await slotText(id, 'r1-right')) === '350 W', await slotText(id, 'r1-right'));
check('list variables in a text', (await slotText(id, 'r1-center')) === '2/3 an', await slotText(id, 'r1-center'));

// ── 2. Second row ─────────────────────────────────────────────────────────────
const plain = await show('value', {});
const plainH = await height(plain);
id = await show('value', {
    headerItems: [
        { id: 'l', source: 'dp', dp: 'demo.pv', decimals: 0, slot: 'r2-left' },
        { id: 'm', source: 'text', text: 'Mitte', slot: 'r2-center' },
        { id: 'r', source: 'text', text: 'Rechts', slot: 'r2-right' },
    ],
});
check('second row appears', (await card(id).locator('[data-header-row="2"]').count()) === 1);
const rowH = await height(id);
check('…and folds the card taller', rowH > plainH, `${rowH} vs ${plainH}`);
const boxes = await Promise.all(
    ['r2-left', 'r2-center', 'r2-right'].map((s) => card(id).locator(`[data-header-slot="${s}"]`).boundingBox()),
);
check(
    'row two slots run left → centre → right',
    boxes.every(Boolean) && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x,
    JSON.stringify(boxes.map((b) => b && Math.round(b.x))),
);
const cardBox = await card(id).boundingBox();
const mid = boxes[1] ? boxes[1].x + boxes[1].width / 2 : 0;
check(
    'the centre slot sits in the middle',
    Math.abs(mid - (cardBox.x + cardBox.width / 2)) < 24,
    `${Math.round(mid)} vs ${Math.round(cardBox.x + cardBox.width / 2)}`,
);

// ── 3. Visibility ─────────────────────────────────────────────────────────────
id = await show('value', {
    headerItems: [
        { id: 'x', source: 'text', text: 'NUR-AUF', slot: 'r1-right', show: 'expanded' },
        { id: 'y', source: 'text', text: 'NUR-ZU', slot: 'r1-right', show: 'collapsed' },
    ],
});
check('expanded-only item stays out of the folded header', (await slotText(id, 'r1-right')) === 'NUR-ZU');

// ── 4. Long values truncate instead of growing the card ──────────────────────
const narrow = { x: 0, y: 0, w: 8, h: 10 };
const narrowPlain = await show('value', {}, {}, narrow);
const narrowPlainH = await height(narrowPlain);
id = await show(
    'value',
    {
        headerItems: [
            {
                id: 'long',
                source: 'text',
                text: 'Ein sehr langer Wert der niemals in diese Zeile passt',
                slot: 'r1-right',
            },
        ],
    },
    {},
    narrow,
);
check(
    'a long value keeps the folded card one row high',
    (await height(id)) === narrowPlainH,
    `${await height(id)} vs ${narrowPlainH}`,
);
const itemBox = await card(id).locator('[data-header-item="long"]').boundingBox();
const nb = await card(id).boundingBox();
check('…and stays inside the card', !!itemBox && itemBox.x + itemBox.width <= nb.x + nb.width + 0.5);

// ── 5. Editor: Darstellung → Kopfzeile ───────────────────────────────────────
const editId = `hi-${++seq}`;
await page.evaluate(
    ([w]) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    [
        {
            id: editId,
            type: 'value',
            title: 'Wohnzimmer',
            datapoint: 'demo.temp',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 14, h: 10 },
            options: {},
        },
    ],
);
await settle();
await card(editId).hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('summary:has(span:text-is("Darstellung"))').first().click();
await page.waitForTimeout(300);
const openBtn = dlg.locator('[data-header-items-open]');
check('Darstellung offers the header editor', (await openBtn.count()) === 1);
await openBtn.click();
const editor = page.locator('[data-header-items-editor]');
await editor.waitFor({ timeout: 5000 });
await editor.locator('[data-header-slot-add="r2-center"]').click();
await page.waitForTimeout(300);
let opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), editId);
const added = opts?.headerItems?.[0];
check(
    'a tap on a slot adds an item there, preset to the main value',
    added?.slot === 'r2-center' && added?.source === 'widget' && added?.widgetValue === 'main',
    JSON.stringify(added),
);
await editor.locator('[data-header-item-source]').first().selectOption('text');
await editor.locator('[data-header-item-text]').first().fill('PV {demo.pv}');
await page.waitForTimeout(300);
opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), editId);
check(
    'source and text are written',
    opts?.headerItems?.[0]?.source === 'text' && opts.headerItems[0].text === 'PV {demo.pv}',
);
await editor.locator('[data-header-item-delete]').first().click();
await page.waitForTimeout(300);
opts = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), editId);
check('deleting the last item clears the option', opts?.headerItems === undefined, JSON.stringify(opts?.headerItems));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nheader-items: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
