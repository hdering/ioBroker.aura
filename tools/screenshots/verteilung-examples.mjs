// Documentation examples for the distribution widget ("Diagramm (Verteilung)", type
// `energiebilanz`).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/verteilung-examples.mjs
//
// Feeds the widget a full household energy flow (see demo-energy.mjs): PV, battery,
// EV and base load, booked into seven meter readings whose production and consumption
// sides add up to the same total. Each shot changes one part of the configuration —
// chart style, legend, time range, aggregation — so the docs can show what it does.
//
// Output: docs/widgets/assets/verteilung/bsp-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { HOUR, DAY, makeWeather, simulateEnergyFlow } from './demo-energy.mjs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/verteilung';
mkdirSync(OUT, { recursive: true });

// Pinned clock: the shots must not depend on the hour the script runs at.
const FIXED = (() => {
    const d = new Date();
    d.setHours(19, 20, 0, 0); // after the evening EV session, so every entry has a share
    return d.getTime();
})();
const now = FIXED;
const anchorDate = new Date(now - 45 * DAY);
anchorDate.setHours(0, 0, 0, 0);
const ANCHOR = anchorDate.getTime();

const weather = makeWeather(50);
const flow = simulateEnergyFlow({ anchor: ANCHOR, end: now, weather });

// ── datapoints ───────────────────────────────────────────────────────────────
const DP = {
    pv: 'demo.0.PV.Erzeugung_kWh',
    battDischarge: 'demo.0.Speicher.Entladung_kWh',
    battCharge: 'demo.0.Speicher.Ladung_kWh',
    gridIn: 'demo.0.Netz.Bezug_kWh',
    gridOut: 'demo.0.Netz.Einspeisung_kWh',
    home: 'demo.0.Haus.Verbrauch_kWh',
    ev: 'demo.0.Wallbox.Geladen_kWh',
    soc: 'demo.0.Speicher.Ladestand',
    socFree: 'demo.0.Speicher.Frei',
};

// Meter readings as an adapter would have logged them: every 30 minutes, one decimal.
const LOG_STEP = 30 * 60_000;
const history = {};
for (const counter of flow.counters) {
    const points = [];
    for (let ts = Math.ceil(ANCHOR / LOG_STEP) * LOG_STEP; ts <= now; ts += LOG_STEP) {
        points.push([ts, Math.round(flow.readingAt(counter, ts) * 10) / 10]);
    }
    history[DP[counter]] = points;
}

// Battery state of charge is a percentage, not a counter — the `last` example.
const socPercent = Math.round((flow.socNow / 10) * 1000) / 10;
const values = {
    ...Object.fromEntries(
        flow.counters.map((c) => [DP[c], { val: Math.round(flow.readingAt(c, now) * 10) / 10, unit: 'kWh' }]),
    ),
    [DP.soc]: { val: socPercent, unit: '%' },
    [DP.socFree]: { val: Math.round((100 - socPercent) * 10) / 10, unit: '%' },
};

// Sanity output: the two sides of the balance have to match, otherwise the example
// contradicts what the widget is for.
for (const [label, ms] of [
    ['24 h', DAY],
    ['7 d', 7 * DAY],
    ['30 d', 30 * DAY],
]) {
    const d = (c) => flow.deltaOver(c, now - ms, now);
    const prod = d('pv') + d('battDischarge') + d('gridIn');
    const cons = d('home') + d('ev') + d('battCharge') + d('gridOut');
    console.log(
        `${label}: PV ${d('pv').toFixed(1)} + Speicher ${d('battDischarge').toFixed(1)} + Netz ${d('gridIn').toFixed(1)}` +
            ` = ${prod.toFixed(1)} kWh  |  Haus ${d('home').toFixed(1)} + Wallbox ${d('ev').toFixed(1)}` +
            ` + Speicher ${d('battCharge').toFixed(1)} + Einspeisung ${d('gridOut').toFixed(1)} = ${cons.toFixed(1)} kWh` +
            `  (Δ ${(prod - cons).toFixed(2)})`,
    );
}
console.log('Speicher-Ladestand:', socPercent, '%');

// ── widget building blocks ───────────────────────────────────────────────────
const entry = (id, dp, label, icon, color, extra = {}) => ({
    id,
    datapointId: dp,
    label,
    icon,
    color,
    historyInstance: 'history.0',
    aggregate: 'delta',
    ...extra,
});

const PRODUCTION = [
    entry('e-pv', DP.pv, 'PV-Anlage', 'Sun', '#f59e0b'),
    entry('e-bat-out', DP.battDischarge, 'Speicher', 'BatteryCharging', '#22c55e'),
    entry('e-grid-in', DP.gridIn, 'Netzbezug', 'Zap', '#ef4444'),
];
const CONSUMPTION = [
    entry('e-home', DP.home, 'Haushalt', 'House', '#3b82f6'),
    entry('e-ev', DP.ev, 'Wallbox', 'Car', '#8b5cf6'),
    entry('e-bat-in', DP.battCharge, 'Speicher', 'BatteryFull', '#22c55e'),
    entry('e-grid-out', DP.gridOut, 'Einspeisung', 'Zap', '#06b6d4'),
];

function widget(title, options, size = {}) {
    return {
        id: 'w-vt',
        type: 'energiebilanz',
        title,
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: size.w ?? 26, h: size.h ?? 14 },
        options: {
            unit: 'kWh',
            decimals: 1,
            range: '24h',
            lockRange: true,
            ...options,
        },
    };
}

// ── browser ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
await ctx.clock.setFixedTime(FIXED);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function ready() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
}

/** Install theme, history and current values — the same data for every shot. */
async function installData() {
    await page.evaluate(
        ({ h, v, obj }) => {
            window.__auraShot.setTheme('light');
            window.__auraShot.mockHistory(h);
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            // Lets the editor show the detected history adapter instead of "kein Adapter".
            window.__auraShot.mockObject(obj);
        },
        {
            h: history,
            v: values,
            obj: Object.fromEntries(
                Object.values(DP).map((id) => [
                    id,
                    { _id: id, common: { custom: { 'history.0': { enabled: true } } } },
                ]),
            ),
        },
    );
}

/** `w`/`h` size the widget in grid cells — each example gets the frame its layout needs. */
async function shot(file, cfg, { wait = 2200, editMode = false, w, h } = {}) {
    // Own id per shot so React remounts instead of updating in place.
    const id = `w-${file}`;
    const sized = {
        ...cfg,
        id,
        gridPos: { ...cfg.gridPos, ...(w ? { w } : {}), ...(h ? { h } : {}) },
    };
    await page.evaluate(({ w: widgetCfg, edit }) => window.__auraShot.showWidgets([widgetCfg], { editMode: edit }), {
        w: sized,
        edit: editMode,
    });
    await page.waitForTimeout(wait);
    const el = page.locator(`.aura-widget-${id}`).first();
    await el.screenshot({ path: `${OUT}/${file}.png` });
    const text = await el.innerText();
    console.log('✓', file, '—', text.replace(/\s+/g, ' ').slice(0, 150));
}

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await installData();

// ── 1. the reference layout: production against consumption ──────────────────
const BALANCE_BARS = [
    { id: 'b-prod', title: 'Erzeugung', legendSide: 'left', entries: PRODUCTION },
    { id: 'b-cons', title: 'Verbrauch', legendSide: 'right', entries: CONSUMPTION },
];

await shot(
    'bsp-vt-bilanz',
    widget('Energiebilanz — heute', {
        bars: BALANCE_BARS,
        chartStyle: 'bars',
        legendFormat: 'icon-value',
        showSegmentIcon: true,
    }),
    { w: 22, h: 13 },
);

// ── 2./3. one group as a pie and as a donut ──────────────────────────────────
const CONSUMPTION_BAR = [{ id: 'b-only', title: 'Verbrauch', legendSide: 'right', entries: CONSUMPTION }];

await shot(
    'bsp-vt-torte',
    widget('Verbrauch — heute', {
        bars: CONSUMPTION_BAR,
        chartStyle: 'pie',
        pieSize: 190,
        legendFormat: 'icon-label-value',
        showSegmentIcon: true,
    }),
    { w: 17, h: 11 },
);

await shot(
    'bsp-vt-donut',
    widget('Verbrauch — heute', {
        bars: CONSUMPTION_BAR,
        chartStyle: 'donut',
        pieSize: 190,
        legendFormat: 'icon-label-value',
    }),
    { w: 17, h: 11 },
);

// ── 4. legend below, labels instead of icons ─────────────────────────────────
await shot(
    'bsp-vt-legende-unten',
    widget('Verbrauch — heute', {
        bars: [{ id: 'b-only', title: 'Verbrauch', entries: CONSUMPTION }],
        chartStyle: 'donut',
        pieSize: 170,
        legendSide: 'below',
        legendAlign: 'center',
        legendFormat: 'label-value',
    }),
    { w: 13, h: 14 },
);

// ── 5. the frontend range switcher: same configuration, other window ─────────
for (const [file, range] of [
    ['bsp-vt-zeitraum-24h', '24h'],
    ['bsp-vt-zeitraum-30d', '30d'],
]) {
    await shot(
        file,
        widget('Energiebilanz', {
            bars: BALANCE_BARS,
            chartStyle: 'bars',
            legendFormat: 'icon-value',
            range,
            lockRange: false,
            visibleRanges: ['24h', '7d', '30d'],
            decimals: 0,
        }),
        { w: 22, h: 13 },
    );
}

// ── 6. aggregate `last`: a share of something that is not energy ─────────────
await shot(
    'bsp-vt-speicher',
    widget('Speicherbelegung', {
        bars: [
            {
                id: 'b-soc',
                title: 'Hausspeicher',
                legendSide: 'right',
                entries: [
                    entry('e-soc', DP.soc, 'Belegt', 'BatteryCharging', '#22c55e', {
                        aggregate: 'last',
                        unit: '%',
                    }),
                    entry('e-free', DP.socFree, 'Frei', 'Battery', '#94a3b8', {
                        aggregate: 'last',
                        unit: '%',
                    }),
                ],
            },
        ],
        chartStyle: 'donut',
        pieSize: 170,
        unit: '%',
        legendFormat: 'icon-label-value',
        showTotals: false,
    }),
    { w: 15, h: 10, wait: 1800 },
);

// ── 7. the configuration behind example 1 ────────────────────────────────────
await page.setViewportSize({ width: 1200, height: 1900 });
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await ready();
await installData();

const editorCfg = widget('Energiebilanz — heute', {
    bars: BALANCE_BARS,
    chartStyle: 'bars',
    legendFormat: 'icon-value',
    showSegmentIcon: true,
});
await page.evaluate((w) => window.__auraShot.showWidgets([w], { editMode: true }), { ...editorCfg, id: 'w-vt' });
await page.waitForTimeout(1200);
await page.locator('.aura-widget-w-vt button[title="Widget-Optionen"]').first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForSelector('div.pointer-events-auto.rounded-xl.shadow-2xl', { timeout: 15000 });
await page.waitForTimeout(1000);

const MODAL = 'div.pointer-events-auto.rounded-xl.shadow-2xl';
async function shotModal(file) {
    const box = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, MODAL);
    if (!box) throw new Error('modal not found');
    const pad = 6;
    await page.screenshot({
        path: `${OUT}/${file}.png`,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', file, `${Math.round(box.width)}×${Math.round(box.height)}`);
}

await shotModal('bsp-vt-config');

// Expand one entry — its settings (label, unit, colour, aggregation) are behind the
// gear button in the entry's header row. Located via the row carrying the datapoint
// id, so it does not depend on the button's tooltip text.
const gearHandle = await page.evaluateHandle((dp) => {
    const row = [...document.querySelectorAll('div')].find(
        (el) => el.textContent?.trim() === dp && el.querySelectorAll('button').length >= 2,
    );
    const buttons = [...(row?.querySelectorAll('button') ?? [])];
    // …[up, down, settings, remove] — settings is the second from the end.
    return buttons[buttons.length - 2] ?? null;
}, DP.pv);
const gear = gearHandle.asElement();
if (!gear) throw new Error('entry settings button not found');
// A real click, not element.click(): the row scrolls into view first, and the event
// carries the coordinates the component's handler expects.
await gear.click();
// The aggregation select only exists while the entry is expanded ('sum' is unique to
// this widget's list).
await page.waitForFunction(
    () => [...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'sum')),
    { timeout: 8000 },
);
await page.waitForTimeout(700);

// Crop the expanded entry: the card holding the aggregation select ('sum' only exists
// in this widget's aggregation list).
const cardHandle = await page.evaluateHandle(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'sum'));
    return sel ? sel.closest('div.rounded-lg') : null;
});
const card = cardHandle.asElement();
if (!card) throw new Error('entry card not found');
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await card.screenshot({ path: `${OUT}/bsp-vt-config-eintrag.png` });
console.log('✓ bsp-vt-config-eintrag');

// Crop the appearance block: from the chart-style select down to the last legend option.
const styleBox = await page.evaluate(() => {
    const style = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'donut'));
    const legend = [...document.querySelectorAll('select')].find((s) =>
        [...s.options].some((o) => o.value === 'icon-label-value'),
    );
    if (!style || !legend) return null;
    style.scrollIntoView({ block: 'center' });
    const a = style.getBoundingClientRect();
    const b = legend.getBoundingClientRect();
    return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: a.left, right: a.right };
});
if (styleBox && styleBox.bottom - styleBox.top < 1600) {
    await page.screenshot({
        path: `${OUT}/bsp-vt-config-darstellung.png`,
        clip: {
            x: Math.max(0, styleBox.left - 14),
            y: Math.max(0, styleBox.top - 26),
            width: styleBox.right - styleBox.left + 28,
            height: styleBox.bottom - styleBox.top + 34,
        },
    });
    console.log('✓ bsp-vt-config-darstellung');
} else {
    console.log('✗ bsp-vt-config-darstellung — appearance block does not fit in one view', styleBox);
}

await browser.close();
console.log('done');
