// Own y scale per series of the advanced chart (issue #959): a valve position 0–100 % next to
// temperatures (left) and humidity (right) gets an axis of its own — hidden by default, or shown
// on the far right in the series colour without colliding with the right axis' labels.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-own-axis.mjs
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
// Screenshots for a look by eye — outside the repo.
const OUT = join(tmpdir(), 'aura-chart-own-axis');
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
const curve = (base, amp) => JSON.stringify(hours.map((label, i) => ({ label, value: base + amp * Math.sin(i / 2) })));
const mocks = {
    'demo.room.temp': curve(21, 1.2),
    'demo.room.setpoint': JSON.stringify(hours.map((label, i) => ({ label, value: i < 6 ? 21 : 19 }))),
    'demo.room.hum': curve(55, 8),
    'demo.room.valve': JSON.stringify(hours.map((label, i) => ({ label, value: [0, 20, 60, 100, 80, 40][i % 6] }))),
};

const series = ({ hum = true, valve = {} } = {}) => [
    {
        id: 't',
        name: 'Ist',
        datapointId: 'demo.room.temp',
        chartType: 'line',
        color: '#ef4444',
        source: 'json',
        yAxisIndex: 0,
    },
    {
        id: 's',
        name: 'Soll',
        datapointId: 'demo.room.setpoint',
        chartType: 'line',
        color: '#10b981',
        source: 'json',
        yAxisIndex: 0,
    },
    ...(hum
        ? [
              {
                  id: 'h',
                  name: 'Feuchte',
                  datapointId: 'demo.room.hum',
                  chartType: 'line',
                  color: '#3b82f6',
                  source: 'json',
                  yAxisIndex: 1,
              },
          ]
        : []),
    {
        id: 'v',
        name: 'Ventil',
        datapointId: 'demo.room.valve',
        chartType: 'area',
        color: '#f59e0b',
        source: 'json',
        yAxisIndex: 0,
        unit: '%',
        ...valve,
    },
];

const widget = (id, title, opts) => ({
    id,
    title,
    type: 'echart',
    layout: 'default',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 40, h: 14 },
    options: {
        icon: 'BarChart2',
        echartMode: 'json',
        echartLeftUnit: '°C',
        echartRightUnit: 'rF',
        echartShowYAxisRight: true,
        decimals: 1,
        ...opts,
    },
});

const show = async (w, clear = true) => {
    if (clear) {
        await page.evaluate(() => window.__auraShot.showWidgets([]));
        await page.waitForFunction(() => document.querySelectorAll('.react-grid-item').length === 0, {
            timeout: 10000,
        });
    }
    await page.evaluate(
        ([ws, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState?.(vals);
            window.__auraShot.showWidgets(ws, { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
        },
        [[w], mocks],
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
        boxes: window.__auraShot.chartTextBoxes(),
        canvasWidth: document.querySelector('[_echarts_instance_]')?.clientWidth ?? 0,
    }));

// ── Hidden own scale ──
await show(
    widget('w-own', 'Heizung', { echartSeries: series({ valve: { ownAxis: true, ownAxisMin: 0, ownAxisMax: 100 } }) }),
);
let s = await state();
check('hidden: three y axes', s.axes?.yAxis?.length === 3, `${s.axes?.yAxis?.length}`);
check('hidden: own axis not shown', s.axes?.yAxis?.[2]?.show === false);
check('hidden: own axis spans 0–100', JSON.stringify(s.extents?.[2]) === '[0,100]', JSON.stringify(s.extents));
check('hidden: left axis keeps the temperature range', s.extents?.[0]?.[1] < 30, JSON.stringify(s.extents?.[0]));
check('hidden: no extra right margin', s.axes?.grid?.right === 6, `${s.axes?.grid?.right}`);
check('hidden: no "100 %" label painted', !s.boxes.some((b) => b.text === '100.0 %' || b.text === '100 %'));
await page
    .screenshot({ path: join(OUT, 'chart-own-axis-hidden.png'), clip: { x: 0, y: 60, width: 1280, height: 360 } })
    .catch(() => {});

// ── Visible own scale behind the right axis ──
await show(
    widget('w-own-vis', 'Heizung sichtbar', {
        echartSeries: series({
            valve: { yAxisIndex: 1, ownAxis: true, ownAxisMin: 0, ownAxisMax: 100, ownAxisShow: true },
        }),
    }),
);
s = await state();
const own = s.axes?.yAxis?.[2];
check('visible: own axis shown on the right', own?.show === true && own?.position === 'right');
check('visible: own axis pushed out behind the right axis', (own?.offset ?? 0) > 10, `offset ${own?.offset}`);
const ownLabels = s.boxes.filter((b) => / %$/.test(b.text) && b.x > s.canvasWidth / 2);
const rightLabels = s.boxes.filter((b) => / rF$/.test(b.text));
check('visible: own labels painted', ownLabels.length >= 2, `${ownLabels.length}`);
check('visible: right labels painted', rightLabels.length >= 2, `${rightLabels.length}`);
const rightEdge = Math.max(...rightLabels.map((b) => b.x + b.width));
const ownLeft = Math.min(...ownLabels.map((b) => b.x));
check(
    'visible: own labels clear of the right axis labels',
    ownLeft > rightEdge,
    `own from ${ownLeft.toFixed(1)}, right to ${rightEdge.toFixed(1)}`,
);
const ownRight = Math.max(...ownLabels.map((b) => b.x + b.width));
check('visible: own labels inside the canvas', ownRight <= s.canvasWidth, `${ownRight.toFixed(1)} / ${s.canvasWidth}`);
check('visible: grid leaves room', (s.axes?.grid?.right ?? 0) > 6, `${s.axes?.grid?.right}`);
await page
    .screenshot({ path: join(OUT, 'chart-own-axis-visible.png'), clip: { x: 0, y: 60, width: 1280, height: 360 } })
    .catch(() => {});

// ── Visible own scale on the LEFT, behind the left axis ──
await show(
    widget('w-own-left', 'Links', {
        echartSeries: series({
            valve: { yAxisIndex: 0, ownAxis: true, ownAxisMin: 0, ownAxisMax: 100, ownAxisShow: true },
        }),
    }),
);
s = await state();
const ownL = s.axes?.yAxis?.[2];
check('left: own axis on the left', ownL?.show === true && ownL?.position === 'left');
check('left: own axis pushed out behind the left axis', (ownL?.offset ?? 0) > 10, 'offset ' + ownL?.offset);
const ownLLabels = s.boxes.filter((b) => / %$/.test(b.text) && b.x < s.canvasWidth / 2);
const leftLabels = s.boxes.filter((b) => / °C$/.test(b.text) && b.x < s.canvasWidth / 2);
check('left: own labels painted', ownLLabels.length >= 2, String(ownLLabels.length));
const ownLRight = Math.max(...ownLLabels.map((b) => b.x + b.width));
const leftStart = Math.min(...leftLabels.map((b) => b.x));
check(
    'left: own labels clear of the left axis labels',
    ownLRight < leftStart,
    'own to ' + ownLRight.toFixed(1) + ', left from ' + leftStart.toFixed(1),
);
check('left: own labels inside the canvas', Math.min(...ownLLabels.map((b) => b.x)) >= 0);
check('left: grid leaves room', (s.axes?.grid?.left ?? 0) > 6, String(s.axes?.grid?.left));
await page
    .screenshot({ path: join(OUT, 'chart-own-axis-left.png'), clip: { x: 0, y: 60, width: 1280, height: 360 } })
    .catch(() => {});

// ── Visible own scale without a right axis: takes the right edge itself ──
await show(
    widget('w-own-noright', 'Ohne rechte Achse', {
        echartSeries: series({
            hum: false,
            valve: { yAxisIndex: 1, ownAxis: true, ownAxisMin: 0, ownAxisMax: 100, ownAxisShow: true },
        }),
    }),
);
s = await state();
check('no right axis: own axis at offset 0', s.axes?.yAxis?.[2]?.offset === 0, `${s.axes?.yAxis?.[2]?.offset}`);
check('no right axis: no extra margin', s.axes?.grid?.right === 6, `${s.axes?.grid?.right}`);
const lone = s.boxes.filter((b) => / %$/.test(b.text) && b.x > s.canvasWidth / 2);
check(
    'no right axis: labels inside the canvas',
    lone.length >= 2 && Math.max(...lone.map((b) => b.x + b.width)) <= s.canvasWidth,
);

// ── Switched off again on the same chart: the third axis must go (replaceMerge) ──
await show(widget('w-own-noright', 'Ohne rechte Achse', { echartSeries: series({ hum: false }) }), false);
s = await state();
check('switched off: back to two y axes', s.axes?.yAxis?.length === 2, `${s.axes?.yAxis?.length}`);
check('switched off: no own labels left', !s.boxes.some((b) => / %$/.test(b.text) && b.x > s.canvasWidth / 2));

// ── Axes from echartJsonExtra are not taken over ──
const extra = JSON.stringify({ yAxis: [{}, {}, { type: 'value', show: false }] });
const sx = series();
sx[2] = { ...sx[2], yAxisIndex: 2 };
sx[3] = { ...sx[3], ownAxis: true };
await show(widget('w-own-extra', 'Mit Extra', { echartSeries: sx, echartJsonExtra: extra }));
s = await state();
check('extra axes: own axis comes after them', s.extents?.length === 4, `${s.extents?.length}`);
check('extra axes: own axis spans the valve', s.extents?.[3]?.[1] >= 100, JSON.stringify(s.extents?.[3]));

// ── The series editor: side + "Eigene Skala" switch ──
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.evaluate(
    (w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    },
    widget('w-own-edit', 'Editor', { echartSeries: series({ hum: false }).slice(2) }),
);
await page.waitForTimeout(1200);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
const dlg = page.locator('.aura-config-modal');
await dlg.locator('[data-testid="echart-ownAxis"]').waitFor({ timeout: 10000 });
const stored = () => page.evaluate(() => window.__auraShot.widgetOptions('w-own-edit')?.echartSeries?.[0]);
const sideGreyed = () =>
    dlg.locator('[data-testid="echart-axis-right"]').evaluate((el) => !!el.closest('fieldset[disabled]'));
check('editor: no own-scale fields while off', (await dlg.locator('[data-testid="echart-own-axis"]').count()) === 0);
check('editor: side usable while off', !(await sideGreyed()));
await dlg.locator('[data-testid="echart-ownAxis"]').click();
await page.waitForTimeout(300);
check('editor: switch stores ownAxis', (await stored())?.ownAxis === true);
check('editor: fields appear', (await dlg.locator('[data-testid="echart-own-axis"]').count()) === 1);
check('editor: side greyed while the scale is hidden', await sideGreyed());
await dlg.locator('[data-testid="echart-ownAxisMax"]').fill('100');
await dlg.locator('[data-testid="echart-ownAxisMax"]').press('Enter');
await dlg.locator('[data-testid="echart-ownAxisShow"]').click();
await page.waitForTimeout(300);
check('editor: max stored as number', (await stored())?.ownAxisMax === 100, JSON.stringify(await stored()));
check('editor: show stored', (await stored())?.ownAxisShow === true);
check('editor: side usable once shown', !(await sideGreyed()));
await dlg.locator('[data-testid="echart-axis-right"]').click();
await page.waitForTimeout(300);
check('editor: side right stored', (await stored())?.yAxisIndex === 1);
await dlg.screenshot({ path: join(OUT, 'chart-own-axis-editor.png') }).catch(() => {});

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
