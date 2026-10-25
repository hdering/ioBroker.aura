// ─────────────────────────────────────────────────────────────────────────────
// Diagramm in einer Custom-Zelle (issue #838)
// ─────────────────────────────────────────────────────────────────────────────
// The custom grid's 'widget' cell mirrors a chart widget of the dashboard
// (`embedWidgetId`) inside one cell. Checked: the mirror fills its cell, refuses
// itself / non-charts, the host's header items stay out of the chart, and the
// editor creates the cell and lists chart widgets only.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/custom-cell-chart.mjs
//
// Runs against injected demo state with screenshotMode on, so no ioBroker object
// or state is ever touched. SHOT_DIR=<dir> also saves screenshots.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const now = Date.now();
const curve = Array.from({ length: 96 }, (_, i) => [now - (95 - i) * 15 * 60 * 1000, 20 + 2 * Math.sin(i / 8)]);

const CHART_OPTIONS = {
    echartMode: 'timeseries',
    echartRange: '24h',
    echartShowCurrent: false,
    echartSeries: [
        {
            id: 's1',
            name: 'Temperatur',
            datapointId: 'demo.temp',
            chartType: 'line',
            historyInstance: 'history.0',
            yAxisIndex: 0,
        },
    ],
};
const comp = (componentKey) => ({ type: 'component', componentKey, align: 'center', valign: 'middle' });
// Thermostat with its circle on the left and the history on the right — the
// combination the issue asks for.
const host = (chartCell, extra = {}) => ({
    id: 'w-ccc-host',
    type: 'thermostat',
    title: 'Bad',
    datapoint: 'demo.set',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 14, h: 6 },
    options: {
        presets: [19, 21],
        customGrid: { cols: 2, rows: 1, colSizes: ['1fr', '2fr'], cells: [comp('circle-menu'), chartCell] },
        ...extra,
    },
});
const source = {
    id: 'w-ccc-source',
    type: 'echart',
    title: 'Quelle',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 7, w: 14, h: 6 },
    options: CHART_OPTIONS,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: SHOT_DIR ? 2 : 1,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate((c) => {
    window.__auraShot.enableHistory(true);
    window.__auraShot.mockHistory({ 'demo.temp': c });
}, curve);

async function show(widgets, opts) {
    await page.evaluate(
        ([ws, o]) => {
            window.__auraShot.mock({ 'demo.set': 20, 'demo.temp': 21 });
            window.__auraShot.showWidgets(ws, o);
        },
        [widgets, opts],
    );
    await page.waitForTimeout(1500);
}
/** Size of the ECharts container inside the host's cell 1 (the line itself needs real history). */
const chartBox = () =>
    page.evaluate(() => {
        const cell = document.querySelector('.aura-widget-w-ccc-host .aura-custom-cell-1');
        const el = cell?.querySelector('[_echarts_instance_]');
        if (!cell || !el) return null;
        const c = cell.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { cw: c.width, ch: c.height, w: r.width, h: r.height };
    });
const cellText = () => page.locator('.aura-widget-w-ccc-host .aura-custom-cell-1').textContent();

// ── Mirror ───────────────────────────────────────────────────────────────────
const mirrorCell = { type: 'widget', embedWidgetId: source.id };
await show([host(mirrorCell), source]);
{
    const b = await chartBox();
    check('mirror draws the source chart in its cell', !!b && b.w > 100 && b.h > 60, JSON.stringify(b));
    check('and fills its width', !!b && b.w >= b.cw * 0.8, JSON.stringify(b));
}
check(
    'circle menu sits beside it',
    (await page.locator('.aura-widget-w-ccc-host .aura-custom-cell-0 .aura-circle-trigger').count()) === 1,
);
if (SHOT_DIR) await page.locator('.aura-widget-w-ccc-host').screenshot({ path: `${SHOT_DIR}/cell-chart-mirror.png` });

// Header items of the host stay in the host's own header.
await show([
    host(mirrorCell, { headerItems: [{ id: 'h1', kind: 'text', text: 'HDR-838', slot: 'r1-right' }] }),
    { ...source, options: { ...CHART_OPTIONS, showTitle: true } },
]);
check(
    'host header items are not repeated inside the chart',
    !((await cellText()) ?? '').includes('HDR-838'),
    (await cellText()) ?? '',
);
await show([host({ type: 'widget', embedWidgetId: 'w-ccc-host' })]);
check('mirror of the host itself is refused', ((await cellText()) ?? '').includes('nicht gefunden'));
await show([host({ type: 'widget', embedWidgetId: 'nope' })]);
check('missing source is named', ((await cellText()) ?? '').includes('nicht gefunden'));
await show([
    host({ type: 'widget', embedWidgetId: 'w-ccc-val' }),
    { id: 'w-ccc-val', type: 'value', title: 'Wert', datapoint: 'demo.temp', gridPos: { x: 0, y: 7, w: 4, h: 2 } },
]);
check('a non-chart source is refused', ((await cellText()) ?? '').includes('Kein Diagramm'));

// ── Editor ───────────────────────────────────────────────────────────────────
await page.evaluate(() => window.__auraShot.unfoldSections());
await show(
    [
        {
            id: 'w-ccc-edit',
            type: 'universal',
            title: 'Raster',
            layout: 'custom',
            gridPos: { x: 0, y: 0, w: 20, h: 10 },
            options: { customGrid: { cols: 1, rows: 1, cells: [{ type: 'empty' }] } },
        },
        source,
    ],
    { editMode: true },
);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.locator('.aura-widget-w-ccc-edit').hover();
await page.locator('.aura-widget-w-ccc-edit .aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('button:has(> span:text-is("1/1"))').click();
await dlg.locator('select:has(option[value="widget"])').selectOption('widget');
await page.waitForTimeout(300);
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-ccc-edit'));
check('cell type "Diagramm" is offered and set', (await opts()).customGrid.cells[0].type === 'widget');
// The picker lists the chart widget, not the host itself.
const optionValues = await dlg
    .locator('.aura-widget-cell-editor select option')
    .evaluateAll((els) => els.map((e) => e.value));
check(
    'mirror picker lists chart widgets only',
    JSON.stringify(optionValues) === '["","w-ccc-source"]',
    JSON.stringify(optionValues),
);
await dlg.locator('.aura-widget-cell-editor select').selectOption('w-ccc-source');
await page.waitForTimeout(200);
{
    const c = (await opts()).customGrid.cells[0];
    check('mirror choice is written', c.embedWidgetId === 'w-ccc-source', JSON.stringify(c));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
