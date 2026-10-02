// Universal widget: vertical text in text cells (issue #734).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-text-direction.mjs
//
// Renders one cell per textDirection and checks that the box really turns upright,
// which end the text starts at, that long text is cut inside the cell and that
// valign moves vertical text along the cell's height.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT = process.env.AURA_SHOT_OUT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const cell = (text, textDirection, extra = {}) => ({ type: 'text', text, textDirection, fontSize: 18, ...extra });
const cells = [
    cell('Wohnzimmer', 'horizontal'),
    cell('Wohnzimmer', 'vertical-cw'),
    cell('Wohnzimmer', 'vertical-ccw'),
    cell('AURA', 'stacked'),
    cell('Ein sehr langer Text, der nicht in die Zelle passt', 'vertical-cw'),
    cell('oben', 'vertical-cw', { valign: 'top' }),
    cell('oben', 'vertical-ccw', { valign: 'top' }),
    { type: 'title', textDirection: 'vertical-ccw', fontSize: 18, bg: '#3b82f6', bgMode: 'content' },
];
await page.evaluate(
    ([cells]) => {
        window.__auraShot.showWidgets([
            {
                id: 'td1',
                type: 'universal',
                title: 'Titel',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 40, h: 14 },
                options: { customGrid: { cols: 8, rows: 1, cells } },
            },
        ]);
    },
    [cells],
);
await page.waitForSelector('.aura-widget-td1 .aura-custom-cell-7', { timeout: 15000 });
await page.waitForTimeout(400);

const info = (i) =>
    page.evaluate((i) => {
        const c = document.querySelector(`.aura-widget-td1 .aura-custom-cell-${i}`);
        const span = c.querySelector('span');
        const node = [...span.childNodes].find((n) => n.nodeType === 3) ?? span.firstChild;
        const r = document.createRange();
        r.setStart(node, 0);
        r.setEnd(node, 1);
        const first = r.getBoundingClientRect();
        const box = span.getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        return {
            wm: getComputedStyle(span).writingMode,
            box: { x: box.x, y: box.y, w: box.width, h: box.height },
            cell: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
            first: { y: first.y + first.height / 2 },
        };
    }, i);

const h = await info(0);
check('horizontal stays horizontal', h.wm === 'horizontal-tb' && h.box.w > h.box.h, JSON.stringify(h.box));

const cw = await info(1);
check('clockwise box is upright', cw.wm === 'vertical-rl' && cw.box.h > cw.box.w * 2, JSON.stringify(cw.box));
check('clockwise starts at the top', cw.first.y < cw.box.y + cw.box.h / 2, JSON.stringify(cw));

const ccw = await info(2);
check('counter-clockwise box is upright', ccw.box.h > ccw.box.w * 2, JSON.stringify(ccw.box));
check('counter-clockwise starts at the bottom', ccw.first.y > ccw.box.y + ccw.box.h / 2, JSON.stringify(ccw));

const st = await info(3);
check(
    'stacked runs top to bottom with upright letters',
    st.wm === 'vertical-lr' && st.box.h > st.box.w * 2 && st.first.y < st.box.y + st.box.h / 2,
    JSON.stringify(st),
);

const long = await info(4);
check(
    'long vertical text is cut inside the cell',
    long.box.y >= long.cell.y - 1 && long.box.y + long.box.h <= long.cell.y + long.cell.h + 1,
    JSON.stringify(long),
);

const topCw = await info(5);
check('valign top: clockwise text sits at the top', topCw.box.y - topCw.cell.y < 6, JSON.stringify(topCw));
const topCcw = await info(6);
check('valign top: counter-clockwise text sits at the top', topCcw.box.y - topCcw.cell.y < 6, JSON.stringify(topCcw));

const title = await info(7);
check('title cell turns too (with label background)', title.box.h > title.box.w, JSON.stringify(title.box));

if (SHOT) {
    await page.locator('.aura-widget-td1').screenshot({ path: SHOT });
    console.log(`  screenshot → ${SHOT}`);
}

// Editor: the cell editor offers the four directions and stores the choice.
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(300);
await page.locator('.aura-widget-td1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('button:has(> span:text-is("1/1"))').click();
const opt = dlg.locator('button[title="Gegen den Uhrzeigersinn gedreht, liest sich von unten nach oben"]');
check('cell editor offers the text direction', (await opt.count()) === 1);
await opt.click();
await page.waitForTimeout(300);
const stored = () => page.evaluate(() => window.__auraShot.widgetOptions('td1')?.customGrid?.cells?.[0]?.textDirection);
check('choice is stored', (await stored()) === 'vertical-ccw', String(await stored()));
await dlg.locator('button:text-is("Waagrecht")').click();
await page.waitForTimeout(300);
check('horizontal removes the option again', (await stored()) === undefined, String(await stored()));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-text-direction: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
