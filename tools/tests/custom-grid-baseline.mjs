// Universal widget: valign 'baseline' lines up text cells of one row (issue #879).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-grid-baseline.mjs
//
// Row 1 sets a 40 px value next to an 18 px unit with 'baseline', row 2 the same
// with 'bottom' (the reported offset). Measures where each text's baseline really
// sits, that long text is still cut inside its cell and that the cell editor stores
// the new choice.
import * as pw from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT = process.env.AURA_SHOT_OUT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// AURA_BROWSER=webkit|firefox checks the other engines ('last baseline' support differs).
const browser = await pw[process.env.AURA_BROWSER ?? 'chromium'].launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(() => window.__auraShot.captureWrites(true));

const text = (t, fontSize, valign, extra = {}) => ({
    type: 'text',
    text: t,
    fontSize,
    align: 'left',
    valign,
    ...extra,
});
const cells = [
    text('56', 40, 'baseline'),
    text('%', 18, 'baseline'),
    text('kWh', 12, 'baseline', { bold: true }),
    text('56', 40, 'bottom'),
    text('%', 18, 'bottom'),
    text('kWh', 12, 'bottom', { bold: true }),
    text('Ein sehr langer Text, der nicht in die Zelle passt', 18, 'baseline', { colSpan: 2 }),
    { type: 'empty' },
    { type: 'icon', iconName: 'Home', align: 'left', valign: 'baseline' },
];
await page.evaluate(
    ([cells]) => {
        window.__auraShot.showWidgets([
            {
                id: 'bl1',
                type: 'universal',
                title: 'Titel',
                icon: 'mdi:water-percent',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 14, h: 14 },
                options: { customGrid: { cols: 3, rows: 3, cells } },
            },
        ]);
    },
    [cells],
);
await page.waitForSelector('.aura-widget-bl1 .aura-custom-cell-8', { timeout: 15000 });
await page.waitForTimeout(400);

// Baseline = top of a zero-size inline-block dropped into the text (sits on the baseline).
const info = (i) =>
    page.evaluate((i) => {
        const c = document.querySelector(`.aura-widget-bl1 .aura-custom-cell-${i}`);
        const cr = c.getBoundingClientRect();
        const span = c.querySelector('span');
        if (!span) return { cell: { y: cr.y, b: cr.bottom, x: cr.x, r: cr.right } };
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        span.appendChild(probe);
        const baseline = probe.getBoundingClientRect().top;
        probe.remove();
        const sr = span.getBoundingClientRect();
        return {
            baseline,
            cell: { y: cr.y, b: cr.bottom, x: cr.x, r: cr.right },
            span: { x: sr.x, r: sr.right, w: span.scrollWidth, cw: span.clientWidth },
            ellipsis: getComputedStyle(span).textOverflow,
        };
    }, i);

const [v, u, k, vb, ub] = await Promise.all([0, 1, 2, 3, 4].map(info));
check(
    'baseline: value, unit and small text share one text line',
    Math.abs(v.baseline - u.baseline) < 1 && Math.abs(v.baseline - k.baseline) < 1,
    `${v.baseline} / ${u.baseline} / ${k.baseline}`,
);
check(
    'bottom keeps the old offset (the reported case)',
    ub.baseline - vb.baseline > 3,
    `${vb.baseline} / ${ub.baseline}`,
);
// Row 1 ends just above row 2 (one grid gap); 'bottom' cells stretch over their row.
const row1End = vb.cell.y;
check(
    'baseline row sits at the bottom of its row',
    row1End - v.cell.b >= 0 && row1End - v.cell.b < 10 && v.cell.b - v.cell.y < vb.cell.b - vb.cell.y,
    `value cell ${v.cell.y}–${v.cell.b}, next row starts ${row1End}`,
);

const long = await info(6);
check(
    'long baseline text is cut inside its cell',
    long.span.w > long.span.cw && long.span.r <= long.cell.r + 1 && long.ellipsis === 'ellipsis',
    JSON.stringify(long),
);

const icon = await page.evaluate(() => {
    const c = document.querySelector('.aura-widget-bl1 .aura-custom-cell-8');
    return getComputedStyle(c).alignItems;
});
check('non-text cell falls back to bottom', icon === 'flex-end', icon);

if (SHOT) {
    await page.locator('.aura-widget-bl1').screenshot({ path: SHOT });
    console.log(`  screenshot → ${SHOT}`);
}

// Editor: the cell editor offers 'Schriftlinie' and stores it.
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(300);
await page.locator('.aura-widget-bl1').hover();
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('button:has(> span:text-is("2/1"))').click();
const stored = () => page.evaluate(() => window.__auraShot.widgetOptions('bl1')?.customGrid?.cells?.[3]?.valign);
const opt = dlg.locator('button:text-is("Schriftlinie")');
check('cell editor offers the baseline choice', (await opt.count()) === 1);
await opt.click();
await page.waitForTimeout(300);
check('choice is stored', (await stored()) === 'baseline', String(await stored()));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-grid-baseline: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
