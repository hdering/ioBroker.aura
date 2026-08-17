// Documentation examples for the advanced chart widget ("Diagramm (erweitert)").
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/echart-examples.mjs
//
// Renders the same datapoint under different settings so the docs can show what each
// one actually does — the counter/delta pair from issue #545 above all. Data is
// fabricated in here and served through `__auraShot.mockHistory`, which also emulates
// what the history adapter does with step + aggregate; nothing is read from or written
// to a real instance (screenshot mode blocks every write).
//
// Output: docs/widgets/assets/diagramm-erweitert/bsp-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/diagramm-erweitert';
const ID = 'w-ex';
const SEL = `.aura-widget-${ID}`;
mkdirSync(OUT, { recursive: true });

const HOUR = 3_600_000;
const DAY = 86_400_000;

// ── deterministic randomness ──────────────────────────────────────────────────
function mulberry32(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The page's clock is pinned to this instant (see clock.setFixedTime below), so the shots
// don't depend on the hour the script happens to run at — an evening run would otherwise
// put "0.0 kWh" in every PV current-value block.
const FIXED = (() => {
    const d = new Date();
    d.setHours(13, 40, 0, 0);
    return d.getTime();
})();
const now = FIXED;
const anchorDate = new Date(now - 2500 * DAY);
anchorDate.setHours(0, 0, 0, 0);
const ANCHOR = anchorDate.getTime();
const TOTAL_HOURS = Math.ceil((now - ANCHOR) / HOUR) + 2;
const TOTAL_DAYS = Math.ceil((now - ANCHOR) / DAY) + 2;

// ── PV plant: a ~9 kWp roof, logged as a rising total-yield counter ───────────
// Weather stays cloudy or clear for a few days at a time — a flat random factor per
// day would give a comb of alternating bars that no real plant produces.
const weather = (() => {
    const rnd = mulberry32(0x5eed01);
    const noise = Array.from({ length: TOTAL_DAYS }, () => rnd());
    return noise.map((_, i) => {
        const smooth = (noise[i] * 1 + noise[Math.max(0, i - 1)] * 0.6 + noise[Math.max(0, i - 2)] * 0.35) / 1.95;
        return 0.24 + 0.76 * Math.pow(smooth, 0.85);
    });
})();

/** Instantaneous PV power in kW — seasonal peak, daylight window, weather. */
function pvPower(ts) {
    const d = new Date(ts);
    const doy = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY;
    const seasonal = 0.5 * (1 + Math.cos((2 * Math.PI * (doy - 172)) / 365)); // 1 = midsummer
    const halfDay = 4.3 + 3.3 * seasonal; // hours of usable light either side of noon
    const h = d.getHours() + d.getMinutes() / 60;
    const from = 12 - halfDay;
    const to = 12 + halfDay;
    if (h <= from || h >= to) return 0;
    const bell = Math.pow(Math.sin((Math.PI * (h - from)) / (to - from)), 1.45);
    const peak = 2.5 + 4.3 * seasonal;
    return peak * bell * weather[Math.min(weather.length - 1, Math.max(0, Math.floor((ts - ANCHOR) / DAY)))];
}

// Counter readings on a fixed hourly grid; anything finer is interpolated, so every
// window below reads the same counter no matter which resolution it is sampled at.
const readings = new Float64Array(TOTAL_HOURS + 1);
{
    let acc = 11_480; // kWh on the meter when the anchor day started
    for (let i = 0; i <= TOTAL_HOURS; i++) {
        readings[i] = acc;
        acc += pvPower(ANCHOR + i * HOUR + HOUR / 2);
    }
}
function pvReading(ts) {
    const x = (ts - ANCHOR) / HOUR;
    if (x <= 0) return readings[0];
    if (x >= TOTAL_HOURS) return readings[TOTAL_HOURS];
    const i = Math.floor(x);
    return readings[i] + (readings[i + 1] - readings[i]) * (x - i);
}
/** Counter samples [[ts, kWh], …] — `stepMs` stands for the adapter's logging interval. */
function pvSeries(fromTs, toTs, stepMs) {
    const out = [];
    for (let ts = Math.ceil(fromTs / stepMs) * stepMs; ts <= toTs; ts += stepMs) {
        out.push([ts, Math.round(pvReading(ts) * 10) / 10]);
    }
    return out;
}

// ── House load: flat base with short, hard appliance peaks ────────────────────
// The peaks are the point of the average/minmax example: they are minutes long, so a
// 15-minute bucket average buries them.
const APPLIANCES = [
    { at: 6.7, len: 4 / 60, w: 2100 }, // kettle
    { at: 7.0, len: 3 / 60, w: 950 }, // toaster
    { at: 12.5, len: 1.4, w: 2000, duty: 0.35 }, // washing machine
    { at: 18.1, len: 0.6, w: 2650, duty: 0.75 }, // oven
    { at: 20.6, len: 1.1, w: 1850, duty: 0.4 }, // dishwasher
];
function houseLoad(ts) {
    const d = new Date(ts);
    const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const dayIdx = Math.floor((ts - ANCHOR) / DAY);
    const rnd = mulberry32(0xa11e + dayIdx * 977 + Math.floor(h * 120));
    let w = 195 + 55 * Math.sin((h / 24) * Math.PI * 2 - 1.1) + rnd() * 35;
    if (Math.floor(h * 60) % 47 < 12) w += 85; // fridge compressor
    for (const a of APPLIANCES) {
        if (h < a.at || h > a.at + a.len) continue;
        const duty = a.duty ?? 1;
        // Cycling appliances are on for `duty` of every ~6 minutes.
        const phase = ((h - a.at) * 10) % 1;
        if (phase < duty) w += a.w;
    }
    return Math.round(w);
}
/** Battery discharge the house is allowed to cover its load from, in W. */
function batteryPower(ts) {
    const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    if (h >= 17 && h < 23) return 850;
    if (h >= 23 || h < 2) return 420;
    return 0;
}
function loadSeries(fromTs, toTs, stepMs, pick) {
    const out = [];
    for (let ts = Math.ceil(fromTs / stepMs) * stepMs; ts <= toTs; ts += stepMs) {
        out.push([ts, pick(ts)]);
    }
    return out;
}

// ── datapoints ───────────────────────────────────────────────────────────────
const DP_PV = 'demo.0.PV.Ertrag_Gesamt';
const DP_LOAD = 'demo.0.Haus.Leistung';
const DP_GRID = 'demo.0.Haus.Netzbezug';
const DP_BATT = 'demo.0.Haus.Speicher';

// Sanity output — daily/monthly/yearly totals the shots will show.
{
    const byYear = new Map();
    for (let i = 0; i < TOTAL_HOURS; i++) {
        const y = new Date(ANCHOR + i * HOUR).getFullYear();
        byYear.set(y, (byYear.get(y) ?? 0) + (readings[i + 1] - readings[i]));
    }
    const yr = [...byYear.entries()].map(([y, v]) => `${y}: ${Math.round(v)} kWh`).join(', ');
    console.log('PV yearly yield —', yr);
    const d0 = new Date(now);
    d0.setHours(0, 0, 0, 0);
    console.log(
        'PV today so far —',
        Math.round((pvReading(now) - pvReading(d0.getTime())) * 10) / 10,
        'kWh, meter at',
        Math.round(pvReading(now)),
        'kWh',
    );
}

// ── browser ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1500, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
await ctx.clock.setFixedTime(FIXED);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function ready() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
}

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

const PV_COLOR = '#f59e0b';

function chart(title, series, options = {}, size = {}) {
    return {
        id: ID,
        type: 'echart',
        title,
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: size.w ?? 30, h: size.h ?? 12 },
        options: {
            echartMode: 'timeseries',
            echartShowLegend: false,
            echartShowCurrent: true,
            lockRange: true,
            decimals: 1,
            // The page clock is frozen (see FIXED), and echarts drives its entrance animation
            // off the wall clock — leaving it on would capture bars at height 0 mid-transition.
            // Purely about when the picture is finished, not what it looks like.
            echartJsonExtra: '{"animation":false}',
            ...options,
            echartSeries: series,
        },
    };
}

function pvSeriesCfg(extra = {}) {
    return [
        {
            id: 's1',
            name: 'PV-Ertrag',
            datapointId: DP_PV,
            chartType: 'bar',
            color: PV_COLOR,
            historyInstance: 'history.0',
            yAxisIndex: 0,
            ...extra,
        },
    ];
}

async function shot(file, { widget, history, values, wait = 1600 }) {
    await page.evaluate(
        ({ w, h, v }) => {
            window.__auraShot.setTheme('light');
            window.__auraShot.mockHistory(h);
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        { w: widget, h: history, v: values },
    );
    await page.waitForTimeout(wait);
    await page
        .locator(SEL)
        .first()
        .screenshot({ path: `${OUT}/${file}.png` });
    // What ended up on the canvas — a curve that stops short of the window is easy to miss
    // in a thumbnail and would be a wrong picture in the docs.
    const plotted = await page.evaluate(() => window.__auraShot.chartSeries());
    const fmt = (v) => (typeof v === 'number' ? new Date(v).toISOString().slice(0, 16) : String(v));
    console.log(
        '✓',
        file,
        '—',
        (plotted ?? []).map((s) => `${s.name}: ${s.points} pts ${fmt(s.first)} → ${fmt(s.last)}`).join(' | '),
    );
}

const pvNow = Math.round(pvReading(now) * 10) / 10;

// Window each dataset has to cover: the delta fetch reaches one bucket before the
// visible window, so generate generously and let mockHistory slice.
const H_SHORT = { [DP_PV]: pvSeries(now - 4 * DAY, now, 15 * 60_000) };
const H_MID = { [DP_PV]: pvSeries(now - 420 * DAY, now, HOUR) };
const H_LONG = { [DP_PV]: pvSeries(ANCHOR, now, 6 * HOUR) };

// ── 1. the same counter, raw vs. differenced (issue #545) ─────────────────────
await shot('bsp-zaehlerstand', {
    widget: chart('PV-Zählerstand', pvSeriesCfg({ chartType: 'line', aggregate: 'average' }), {
        echartRange: '30d',
        echartLeftUnit: 'kWh',
    }),
    history: H_MID,
    values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
});

await shot('bsp-delta-tag', {
    widget: chart('PV-Ertrag pro Tag', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'day' }), {
        echartRange: '30d',
        echartLeftUnit: 'kWh',
        // Bars are read by their height, so they have to start at 0 — the automatic scale
        // would crop them at the smallest value and make a weak day look like nothing.
        echartLeftMin: 0,
    }),
    history: H_MID,
    values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
});

// ── 2. the same series per hour / month / year ────────────────────────────────
await shot('bsp-delta-stunde', {
    widget: chart('PV-Ertrag pro Stunde', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'hour' }), {
        echartRange: '24h',
        echartLeftUnit: 'kWh',
        echartLeftMin: 0,
    }),
    history: H_SHORT,
    values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
});

await shot('bsp-delta-monat', {
    widget: chart('PV-Ertrag pro Monat', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'month' }), {
        echartRange: '1y',
        echartLeftUnit: 'kWh',
        echartLeftMin: 0,
        decimals: 0,
    }),
    history: H_MID,
    values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
});

await shot('bsp-delta-jahr', {
    widget: chart('PV-Ertrag pro Jahr', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'year' }), {
        echartRange: 'custom',
        echartRangeCustomValue: 1825,
        echartRangeCustomUnit: 'd',
        echartLeftUnit: 'kWh',
        echartLeftMin: 0,
        decimals: 0,
    }),
    history: H_LONG,
    values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
});

// ── 3. automatic unit follows the range switcher ──────────────────────────────
for (const [file, range] of [
    ['bsp-auto-30d', '30d'],
    ['bsp-auto-1y', '1y'],
]) {
    await shot(file, {
        widget: chart('PV-Ertrag', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'auto' }), {
            echartRange: range,
            echartLeftUnit: 'kWh',
            echartLeftMin: 0,
            echartVisibleRanges: ['24h', '30d', '1y'],
            lockRange: false,
            decimals: 0,
        }),
        history: H_MID,
        values: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
    });
}

// ── 4. average vs. minmax on a spiky power reading ────────────────────────────
const loadHistory = { [DP_LOAD]: loadSeries(now - 2 * DAY, now, 30_000, houseLoad) };
const loadNow = houseLoad(now);
for (const [file, aggregate, title] of [
    ['bsp-agg-average', 'average', 'Hausleistung — Mittelwert'],
    ['bsp-agg-minmax', 'minmax', 'Hausleistung — Min/Max'],
]) {
    await shot(file, {
        widget: chart(
            title,
            [
                {
                    id: 's1',
                    name: 'Hausleistung',
                    datapointId: DP_LOAD,
                    chartType: 'area',
                    color: '#3b82f6',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                    aggregate,
                },
            ],
            { echartRange: '24h', echartLeftUnit: 'W', decimals: 0 },
        ),
        history: loadHistory,
        values: { [DP_LOAD]: { val: loadNow, unit: 'W' } },
    });
}

// ── 5. stacking: where the house load comes from ──────────────────────────────
{
    const grid = (ts) => Math.max(0, houseLoad(ts) - Math.min(houseLoad(ts), batteryPower(ts)));
    const batt = (ts) => Math.min(houseLoad(ts), batteryPower(ts));
    await shot('bsp-stapeln', {
        widget: chart(
            'Hausverbrauch — Herkunft',
            [
                {
                    id: 's1',
                    name: 'Netzbezug',
                    datapointId: DP_GRID,
                    chartType: 'area',
                    color: '#f97316',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                    stack: true,
                },
                {
                    id: 's2',
                    name: 'Speicher',
                    datapointId: DP_BATT,
                    chartType: 'area',
                    color: '#10b981',
                    historyInstance: 'history.0',
                    yAxisIndex: 0,
                    stack: true,
                },
            ],
            { echartRange: '24h', echartLeftUnit: 'W', decimals: 0, echartShowLegend: true },
        ),
        history: {
            [DP_GRID]: loadSeries(now - 2 * DAY, now, 60_000, grid),
            [DP_BATT]: loadSeries(now - 2 * DAY, now, 60_000, batt),
        },
        values: { [DP_GRID]: { val: grid(now), unit: 'W' }, [DP_BATT]: { val: batt(now), unit: 'W' } },
    });
}

// ── 6. the settings behind example 1, in the editor ───────────────────────────
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(
    ({ w, h, v, dp }) => {
        window.__auraShot.setTheme('light');
        window.__auraShot.mockHistory(h);
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
        // Without the object the editor reports "Kein History-Adapter aktiv" for a
        // datapoint that, in the example, is logged by history.0.
        window.__auraShot.mockObject({
            [dp]: { _id: dp, common: { name: 'PV Ertrag Gesamt', custom: { 'history.0': { enabled: true } } } },
        });
        window.__auraShot.showWidgets([w], { editMode: true });
    },
    {
        dp: DP_PV,
        w: chart('PV-Ertrag pro Tag', pvSeriesCfg({ aggregate: 'delta', deltaBucket: 'day' }), {
            echartRange: '30d',
            echartLeftUnit: 'kWh',
        }),
        h: H_MID,
        v: { [DP_PV]: { val: pvNow, unit: 'kWh' } },
    },
);
await page.waitForTimeout(900);
await page.locator(`${SEL} button[title="Widget-Optionen"]`).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(1000);
// Open the series card — its settings are collapsed behind the header row.
await page.getByText('PV-Ertrag', { exact: true }).last().click();
await page.waitForTimeout(600);

const card = await page.evaluateHandle(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'delta'));
    return sel ? sel.closest('div.rounded-lg') : null;
});
const el = card.asElement();
if (!el) throw new Error('series card not found');
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await el.screenshot({ path: `${OUT}/bsp-config-delta.png` });
console.log('✓ bsp-config-delta');

await browser.close();
console.log('done');
