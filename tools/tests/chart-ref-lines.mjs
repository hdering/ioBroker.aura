// Reference lines of the advanced chart (issue #959): a fixed limit, a setpoint read from a
// datapoint and a band — drawn, labelled, pulling the axis along, and kept out of tooltip and
// legend. Plus the "Linien" tab of "Datenpunkte verwalten".
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-ref-lines.mjs
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
// Screenshots for a look by eye — outside the repo.
const OUT = join(tmpdir(), 'aura-chart-ref-lines');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const hours = Array.from({ length: 12 }, (_, i) => String(i * 2).padStart(2, '0'));
const mocks = {
    'demo.ref.temp': JSON.stringify(hours.map((label, i) => ({ label, value: 21 + 1.2 * Math.sin(i / 2) }))),
    'demo.ref.hum': JSON.stringify(hours.map((label, i) => ({ label, value: 55 + 8 * Math.sin(i / 3) }))),
    'demo.ref.setpoint': 20.5,
};

const series = [
    { id: 't', name: 'Ist', datapointId: 'demo.ref.temp', chartType: 'line', color: '#ef4444', source: 'json' },
    {
        id: 'h',
        name: 'Feuchte',
        datapointId: 'demo.ref.hum',
        chartType: 'line',
        color: '#3b82f6',
        source: 'json',
        yAxisIndex: 1,
    },
];

const widget = (id, refLines, extra = {}) => ({
    id,
    title: 'Linien',
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 40, h: 14 },
    options: {
        icon: 'BarChart2',
        echartMode: 'json',
        echartLeftUnit: '°C',
        echartRightUnit: 'rF',
        echartShowLegend: true,
        decimals: 1,
        echartSeries: series,
        echartRefLines: refLines,
        ...extra,
    },
});

const show = async (w, vals = mocks) => {
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForFunction(() => document.querySelectorAll('.react-grid-item').length === 0, { timeout: 10000 });
    await page.evaluate(
        ([ws, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState?.(v);
            window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
        },
        [[w], vals],
    );
    await page.waitForFunction(() => document.querySelectorAll('.react-grid-item canvas').length >= 1, {
        timeout: 20000,
    });
    await page.waitForTimeout(1200);
};

const state = () =>
    page.evaluate(() => ({
        axes: window.__auraShot.chartAxes(),
        extents: window.__auraShot.chartYExtents(),
        texts: window.__auraShot.chartTexts() ?? [],
    }));

// ── A fixed limit above the data, a datapoint setpoint and a band ──
await show(
    widget('w-ref', [
        { id: 'a', value: 25, label: 'Grenze', showValue: true, color: '#a855f7' },
        { id: 'b', value: 18, valueDp: 'demo.ref.setpoint', label: 'Soll', showValue: true, lineType: 'solid' },
        { id: 'c', value: 50, valueTo: 60, label: 'Komfort', axis: 1, color: '#10b981' },
        { id: 'd', label: 'ohne Wert' },
    ]),
);
let s = await state();
check(
    'limit labelled with its value',
    s.texts.includes('Grenze: 25.0 °C'),
    s.texts.filter((x) => /:/.test(x)).join(' | '),
);
check('limit above the data pulls the left axis up', (s.extents?.[0]?.[1] ?? 0) >= 25, JSON.stringify(s.extents?.[0]));
check('setpoint read from the datapoint, not the typed fallback', s.texts.includes('Soll: 20.5 °C'));
check('band labelled on the right axis', s.texts.includes('Komfort'));
check('a line without a value is not drawn', !s.texts.includes('ohne Wert'));
const legend = s.axes?.legend?.data ?? [];
check(
    'legend lists the series only',
    legend.length === 2 && legend.every((e) => (typeof e === 'string' ? e : e?.name)),
    JSON.stringify(legend),
);
await page
    .screenshot({ path: join(OUT, 'chart-ref-lines.png'), clip: { x: 0, y: 60, width: 1280, height: 360 } })
    .catch(() => {});

// ── Tooltip: hover the plot, the carriers must not add rows ──
const box = await page.locator('[_echarts_instance_]').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(500);
const tip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
        (d) => d.style.position === 'absolute' && /Ist/.test(d.textContent ?? '') && d.style.zIndex,
    );
    return el?.innerHTML ?? '';
});
const rows = (tip.match(/<br\/?>/g) ?? []).length;
check('tooltip: two series rows, no empty carrier rows', /Ist/.test(tip) && /Feuchte/.test(tip) && rows === 2, tip);
await page.mouse.move(5, 5);

// ── Unreadable datapoint: the typed value stays the fallback ──
await show(
    widget('w-ref-fallback', [{ id: 'b', value: 18, valueDp: 'demo.ref.missing', label: 'Soll', showValue: true }]),
);
s = await state();
check('missing datapoint falls back to the typed value', s.texts.includes('Soll: 18.0 °C'), s.texts.join(' | '));

// ── Right axis without series: the line follows the left one ──
await show(
    widget('w-ref-noright', [{ id: 'r', value: 21.5, axis: 1, label: 'R', showValue: true }], {
        echartSeries: [series[0]],
    }),
);
s = await state();
check('right line without right series reads the left unit', s.texts.includes('R: 21.5 °C'), s.texts.join(' | '));

// ── Comparison mode draws none ──
await show(
    widget('w-ref-cmp', [{ id: 'a', value: 25, label: 'Grenze', showValue: true }], {
        echartMode: 'comparison',
        echartSeries: [{ id: 'x', name: 'X', datapointId: 'demo.ref.setpoint', chartType: 'bar', color: '#3b82f6' }],
    }),
);
s = await state();
check('comparison mode: no line', !s.texts.some((x) => x.startsWith('Grenze')));

// ── Editor: "Linien" tab ──
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(
    (w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    widget('w-ref-edit', undefined),
);
await page.waitForTimeout(1200);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
const dlg = page.locator('.aura-config-modal');
await dlg.locator('button:text-is("Linien")').click();
await dlg.locator('[data-testid="echart-ref-add"]').click();
await page.waitForTimeout(200);
const stored = () => page.evaluate(() => window.__auraShot.widgetOptions('w-ref-edit')?.echartRefLines);
check('editor: a line is added', (await stored())?.length === 1, JSON.stringify(await stored()));
await dlg.locator('[data-testid="echart-ref-label"]').fill('Soll');
await dlg.locator('[data-testid="echart-ref-value"]').fill('21,5');
await dlg.locator('[data-testid="echart-ref-value"]').press('Enter');
await dlg.locator('[data-testid="echart-ref-valueDp"]').fill('demo.ref.setpoint');
await dlg.locator('[data-testid="echart-ref-showValue"]').check();
await dlg.locator('[data-testid="echart-ref-axis-1"]').click();
await dlg.locator('[data-testid="echart-ref-lineType"]').selectOption('dotted');
await page.waitForTimeout(300);
const line = (await stored())?.[0] ?? {};
check('editor: label stored', line.label === 'Soll');
check('editor: decimal comma stored as number', line.value === 21.5, JSON.stringify(line));
check('editor: datapoint stored', line.valueDp === 'demo.ref.setpoint');
check('editor: value switch stored', line.showValue === true);
check('editor: axis stored', line.axis === 1);
check('editor: stroke stored', line.lineType === 'dotted');
await dlg.screenshot({ path: join(OUT, 'chart-ref-lines-editor.png') }).catch(() => {});
await dlg.locator('[data-testid="echart-ref-remove"]').click();
await page.waitForTimeout(200);
check('editor: last line removed drops the option', (await stored()) === undefined);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
