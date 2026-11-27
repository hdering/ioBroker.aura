// A widget mirror shows its source's header and may format its own (#1042).
//
//   AURA_BASE=http://127.0.0.1:5245 node tools/tests/mirror-header.mjs
//
// The mirror's frame handed the body no header items and read the title/symbol
// look (colour, size, place) from the mirror's empty options, so the source's
// header formatting was lost — and the edit dialog hid the header row for a
// mirror, so it could not be formatted either. Unset, each header option now
// follows the source; set on the mirror, it wins there and the source keeps its own.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SRC_ID = 'mh-src';
const MIR_ID = 'mh-mir';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const source = (options = {}) => ({
    id: SRC_ID,
    type: 'value',
    title: 'Quelle',
    datapoint: 'demo.0.temp',
    gridPos: { x: 0, y: 0, w: 6, h: 3 },
    options: {
        titleColor: 'rgb(255, 0, 0)',
        headerItems: [{ id: 'h1', source: 'text', slot: 'r1-right', text: 'SRC-ITEM' }],
        ...options,
    },
});

const mirror = (options = {}) => ({
    id: MIR_ID,
    type: 'mirror',
    title: '',
    datapoint: '',
    gridPos: { x: 6, y: 0, w: 6, h: 3 },
    options: { targetWidgetId: SRC_ID, ...options },
});

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.mock({ 'demo.0.temp': { val: 21.5, unit: '°C' } }));

const card = (id) => page.locator(`.aura-widget-${id}`).first();
const show = async (src, mir) => {
    await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [src, mir]);
    await page.waitForTimeout(700);
};
const text = (id) => card(id).innerText();
const titleColor = (id) =>
    card(id)
        .locator('.aura-widget-title')
        .first()
        .evaluate((el) => getComputedStyle(el).color)
        .catch(() => '');
const titleCount = (id) => card(id).locator('.aura-widget-title').count();

// ── Mirror without own settings: the source's header ───────────────────────
await show(source(), mirror());
check('source shows its header item', (await text(SRC_ID)).includes('SRC-ITEM'));
check('mirror shows the source header item', (await text(MIR_ID)).includes('SRC-ITEM'), await text(MIR_ID));
check('source title has its colour', (await titleColor(SRC_ID)) === 'rgb(255, 0, 0)', await titleColor(SRC_ID));
check(
    'mirror title takes the source colour',
    (await titleColor(MIR_ID)) === 'rgb(255, 0, 0)',
    await titleColor(MIR_ID),
);

// ── Mirror with its own header: those win, the source keeps its own ────────
await show(
    source(),
    mirror({
        titleColor: 'rgb(0, 0, 255)',
        headerItems: [{ id: 'h2', source: 'text', slot: 'r1-right', text: 'MIR-ITEM' }],
    }),
);
const mt = await text(MIR_ID);
check('own header item replaces the source one', mt.includes('MIR-ITEM') && !mt.includes('SRC-ITEM'), mt);
check('own title colour wins on the mirror', (await titleColor(MIR_ID)) === 'rgb(0, 0, 255)', await titleColor(MIR_ID));
check('source keeps its item', (await text(SRC_ID)).includes('SRC-ITEM') && !(await text(SRC_ID)).includes('MIR-ITEM'));
check('source keeps its colour', (await titleColor(SRC_ID)) === 'rgb(255, 0, 0)');

// ── Title switched off on the mirror only ──────────────────────────────────
await show(source(), mirror({ showTitle: false }));
check('mirror hides the title', (await titleCount(MIR_ID)) === 0 || !(await text(MIR_ID)).includes('Quelle'));
check('source still shows its title', (await text(SRC_ID)).includes('Quelle'));

// ── An empty own list hides the source's items on the mirror ───────────────
await show(source(), mirror({ headerItems: [] }));
check('empty own list hides the inherited items', !(await text(MIR_ID)).includes('SRC-ITEM'));

// ── The edit dialog offers the header row for a mirror ─────────────────────
await page.evaluate(
    ([s1, m1]) => {
        window.__auraShot.showWidgets([s1, m1], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    [source(), mirror()],
);
await page.waitForTimeout(800);
await card(MIR_ID).hover();
await card(MIR_ID).locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('summary:has(span:text-is("Darstellung"))').first().click();
await page.waitForTimeout(300);
const btn = dlg.locator('[data-header-items-open]');
check('mirror dialog offers the header editor', (await btn.count()) === 1);
if (await btn.count()) {
    const label = await btn.first().innerText();
    check('header button counts the inherited item', label.includes('1'), label);
}
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page error', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
