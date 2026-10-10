// Period value of the "Diagramm (erweitert)" in the real widget (issue #749).
//
//   AURA_BASE=http://localhost:5199 node tools/tests/chart-period-value-ui.mjs
//
// Needs a dev server (offline is fine: AURA_IOBROKER_URL=http://127.0.0.1:9). Two meters from the
// demo energy flow are logged every 30 minutes; the chart shows their period value and the
// "Diagramm (Verteilung)" the same window's consumption. Checked:
//   1. in the legend — and the same number the distribution widget shows;
//   2. it follows the range buttons;
//   3. placement "row" and a hidden legend put it in a row of its own;
//   4. a delta series sums its bars, `max` is the highest bar.
import { chromium } from 'playwright';
import { HOUR, DAY, makeWeather, simulateEnergyFlow } from '../screenshots/demo-energy.mjs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const FIXED = (() => {
    const d = new Date();
    d.setHours(19, 20, 0, 0);
    return d.getTime();
})();
const now = FIXED;
const anchorDate = new Date(now - 45 * DAY);
anchorDate.setHours(0, 0, 0, 0);
const ANCHOR = anchorDate.getTime();
const flow = simulateEnergyFlow({ anchor: ANCHOR, end: now, weather: makeWeather(50) });

const DP = { gridIn: 'demo.0.Netz.Bezug_kWh', gridOut: 'demo.0.Netz.Einspeisung_kWh' };
const LOG_STEP = 30 * 60_000;
const history = {};
const values = {};
for (const c of Object.keys(DP)) {
    const pts = [];
    for (let ts = Math.ceil(ANCHOR / LOG_STEP) * LOG_STEP; ts <= now; ts += LOG_STEP) {
        pts.push([ts, Math.round(flow.readingAt(c, ts) * 10) / 10]);
    }
    history[DP[c]] = pts;
    values[DP[c]] = { val: pts[pts.length - 1][1], unit: 'kWh' };
}

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
/** "6,59 kWh" / "6.59 kWh" → 6.59 — the browser's locale decides the separator. */
const num = (s) => {
    if (s == null) return NaN;
    const t = String(s).replace(/[^\d.,-]/g, '');
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};

const series = (id, name, dp, extra = {}) => ({
    id,
    name,
    datapointId: dp,
    chartType: 'line',
    historyInstance: 'history.0',
    yAxisIndex: 0,
    periodValue: 'consumption',
    ...extra,
});
let shotNo = 0;
const echart = (options) => ({
    id: `w-pv-${++shotNo}`,
    type: 'echart',
    title: 'Netz',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 24, h: 12 },
    options: {
        echartMode: 'timeseries',
        echartRange: '30d',
        echartVisibleRanges: ['24h', '7d', '30d'],
        echartJsonExtra: '{"animation":false}',
        echartShowLegend: true,
        echartLeftUnit: 'kWh',
        decimals: 2,
        ...options,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.clock.setFixedTime(FIXED);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 120000 });
await page.evaluate(
    ({ h, v }) => {
        // Real adapters hand back the reading before the window - the baseline the first rise needs.
        window.__auraShot.mockHistory(h, { borderValues: true });
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    },
    { h: history, v: values },
);

const show = async (cfg, wait = 1800) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg);
    await page.waitForTimeout(wait);
};
/** Legend texts with the period value: "Einspeisung: 12,34 kWh" → { Einspeisung: 12.34 } */
const legendValues = async () => {
    const texts = (await page.evaluate(() => window.__auraShot.chartTexts())) ?? [];
    const out = {};
    for (const t of texts) {
        const m = /^(.+?): (.+ kWh)$/.exec(t);
        if (m) out[m[1]] = num(m[2]);
    }
    return out;
};

// -- 1. legend, against the distribution widget -----------------------------------------------
await show(
    echart({
        echartSeries: [
            series('s-out', 'Einspeisung', DP.gridOut, { color: '#22c55e' }),
            series('s-in', 'Bezug', DP.gridIn, { color: '#ef4444' }),
        ],
    }),
);
const leg30 = await legendValues();
const want30 = {
    Einspeisung: flow.deltaOver('gridOut', now - 30 * DAY, now),
    Bezug: flow.deltaOver('gridIn', now - 30 * DAY, now),
};
for (const k of Object.keys(want30)) {
    check(
        `legend 30d - ${k} ≈ meter delta`,
        Math.abs(leg30[k] - want30[k]) < Math.max(0.5, want30[k] * 0.01),
        `${leg30[k]} vs ${want30[k].toFixed(2)}`,
    );
}
check(
    'no period row while the legend carries the values',
    (await page.locator('[data-testid="echart-period-row"]').count()) === 0,
);

await show({
    id: 'w-vt',
    type: 'energiebilanz',
    title: 'Netz',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 24, h: 12 },
    options: {
        unit: 'kWh',
        decimals: 2,
        range: '30d',
        lockRange: true,
        chartStyle: 'bars',
        showTotals: true,
        showPercent: false,
        bars: [
            {
                id: 'b1',
                title: 'Einspeisung',
                entries: [
                    {
                        id: 'e1',
                        datapointId: DP.gridOut,
                        label: 'Einspeisung',
                        historyInstance: 'history.0',
                        aggregate: 'consumption',
                    },
                ],
            },
            {
                id: 'b2',
                title: 'Bezug',
                entries: [
                    {
                        id: 'e2',
                        datapointId: DP.gridIn,
                        label: 'Bezug',
                        historyInstance: 'history.0',
                        aggregate: 'consumption',
                    },
                ],
            },
        ],
    },
});
const vtText = await page.locator('.aura-widget-w-vt').first().innerText();
const vtNums = [...vtText.matchAll(/([\d.,]+)\s*kWh/g)].map((m) => num(m[1]));
check(
    'same numbers as the distribution widget',
    vtNums.some((n) => Math.abs(n - leg30.Einspeisung) < 0.006) &&
        vtNums.some((n) => Math.abs(n - leg30.Bezug) < 0.006),
    `chart ${leg30.Einspeisung}/${leg30.Bezug} — Verteilung ${vtNums.join(', ')}`,
);

// -- 2. follows the range buttons -------------------------------------------------------------
await show(echart({ echartSeries: [series('s-out', 'Einspeisung', DP.gridOut)] }));
await page.locator('[_echarts_instance_]').first().waitFor();
const btn = page.locator('button', { hasText: /^7/ }).first();
await btn.click();
await page.waitForTimeout(1800);
const leg7 = await legendValues();
const want7 = flow.deltaOver('gridOut', now - 7 * DAY, now);
check(
    'range button 7d - value follows',
    Math.abs(leg7.Einspeisung - want7) < Math.max(0.3, want7 * 0.01),
    `${leg7.Einspeisung} vs ${want7.toFixed(2)}`,
);

// -- 3. row placement -------------------------------------------------------------------------
await show(echart({ echartPeriodPlacement: 'row', echartSeries: [series('s-out', 'Einspeisung', DP.gridOut)] }));
let row = page.locator('[data-testid="echart-period-row"]');
let rowText = (await row.count()) ? await row.innerText() : '';
check('placement row - row shown', /Einspeisung/.test(rowText) && /kWh/.test(rowText), rowText.replace(/\s+/g, ' '));
check(
    'placement row - legend without value',
    !(await page.evaluate(() => window.__auraShot.chartTexts() ?? [])).some((t) => /: .*kWh$/.test(t)),
);
await page
    .locator('.aura-widget-w-pv-' + shotNo)
    .first()
    .screenshot({ path: 'node_modules/.cache/period-row.png' });

await show(echart({ echartShowLegend: false, echartSeries: [series('s-out', 'Einspeisung', DP.gridOut)] }));
row = page.locator('[data-testid="echart-period-row"]');
rowText = (await row.count()) ? await row.innerText() : '';
check('legend hidden - falls back to the row', /Einspeisung/.test(rowText), rowText.replace(/\s+/g, ' '));

// -- 4. delta bars ----------------------------------------------------------------------------
await show(
    echart({
        echartRange: '7d',
        echartSeries: [
            series('s-d', 'Tag', DP.gridOut, { chartType: 'bar', aggregate: 'delta', deltaBucket: 'day' }),
            series('s-m', 'Max', DP.gridOut, {
                chartType: 'bar',
                aggregate: 'delta',
                deltaBucket: 'day',
                periodValue: 'max',
            }),
        ],
    }),
);
const bars = (await page.evaluate(() => window.__auraShot.chartSeries())) ?? [];
const ys = (bars[0]?.ys ?? []).filter((v) => typeof v === 'number');
const sum = ys.reduce((a, b) => a + b, 0);
const legD = await legendValues();
check('delta - consumption = sum of the bars', Math.abs(legD.Tag - sum) < 0.006, `${legD.Tag} vs ${sum.toFixed(2)}`);
check(
    'delta - max = highest bar',
    Math.abs(legD.Max - Math.max(...ys)) < 0.006,
    `${legD.Max} vs ${Math.max(...ys).toFixed(2)}`,
);

// -- 5. editor: per-series select and the placement in the "Werte" tab --------------------------
{
    const cfg = echart({ echartSeries: [series('s-out', 'Einspeisung', DP.gridOut, { periodValue: undefined })] });
    await page.evaluate((w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    }, cfg);
    await page.waitForTimeout(1500);
    const opts = () => page.evaluate((id) => window.__auraShot.widgetOptions(id), cfg.id);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.locator('button:has-text("Datenpunkte verwalten")').first().click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('button:text-is("Serie hinzufügen")').waitFor({ timeout: 10000 });
    const valuesTab = dlg.locator('.aura-config-modal-tabs button', { hasText: 'Werte' }).first();
    await valuesTab.click();
    check(
        'no placement while no series has a period value',
        (await dlg.locator('[data-testid="echart-period-placement"]').count()) === 0,
    );
    await dlg.locator('.aura-config-modal-tabs button', { hasText: 'Serien' }).first().click();
    await dlg.locator('span:text-is("Einspeisung")').first().click();
    const sel = dlg.locator('[data-testid="echart-period-value"]');
    await sel.selectOption('consumption');
    await page.waitForTimeout(400);
    check(
        'select writes periodValue',
        (await opts())?.echartSeries?.[0]?.periodValue === 'consumption',
        JSON.stringify((await opts())?.echartSeries?.[0]?.periodValue),
    );
    await valuesTab.click();
    const place = dlg.locator('[data-testid="echart-period-placement"]');
    await place.selectOption('row');
    await page.waitForTimeout(400);
    check('placement writes echartPeriodPlacement', (await opts())?.echartPeriodPlacement === 'row');
    await place.selectOption('legend');
    await page.waitForTimeout(400);
    check('legend is the default - stored unset', (await opts())?.echartPeriodPlacement === undefined);
}

// -- docs images (--shots) ---------------------------------------------------------------------
if (process.argv.includes('--shots')) {
    const OUT = 'docs/widgets/assets/diagramm-erweitert';
    const dctx = await browser.newContext({
        viewport: { width: 1200, height: 800 },
        deviceScaleFactor: 2,
        locale: 'de-DE',
    });
    await dctx.clock.setFixedTime(FIXED);
    const dp = await dctx.newPage();
    await dp.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle', timeout: 120000 });
    await dp.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 120000 });
    await dp.evaluate(
        ({ h, v }) => {
            window.__auraShot.setTheme('light');
            window.__auraShot.mockHistory(h, { borderValues: true });
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
        },
        { h: history, v: values },
    );
    const both = [
        series('s-out', 'Einspeisung', DP.gridOut, {
            color: '#22c55e',
            chartType: 'bar',
            aggregate: 'delta',
            deltaBucket: 'day',
        }),
        series('s-in', 'Bezug', DP.gridIn, {
            color: '#ef4444',
            chartType: 'bar',
            aggregate: 'delta',
            deltaBucket: 'day',
        }),
    ];
    for (const [file, extra] of [
        ['bsp-zeitraumwert-legende', {}],
        ['bsp-zeitraumwert-zeile', { echartPeriodPlacement: 'row' }],
    ]) {
        const cfg = echart({ echartShowCurrent: false, echartLeftMin: 0, echartSeries: both, ...extra });
        cfg.gridPos = { x: 0, y: 0, w: 18, h: 9 };
        await dp.evaluate((w) => window.__auraShot.showWidgets([w]), cfg);
        await dp.waitForTimeout(2200);
        await dp
            .locator(`.aura-widget-${cfg.id}`)
            .first()
            .screenshot({ path: `${OUT}/${file}.png` });
        console.log('  shot', file);
    }
    await dctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
