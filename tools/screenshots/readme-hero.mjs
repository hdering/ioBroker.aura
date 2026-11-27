// Hero screenshots for the README (shown on github.com and on iobroker.com/adapters).
//
//   AURA_BASE=http://127.0.0.1:5233 node tools/screenshots/readme-hero.mjs
//
// Needs a dev server that is CONNECTED to an instance (the charts get no history
// offline); screenshot mode blocks every write, all values are fake `demo.*` data.
// No header, section menu docked on the left, tab bar on top; 1900 × 1025.
//
// Output: docs/public/readme/{overview,energy}-{light,dark}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { HOUR, DAY, mulberry32 } from './demo-energy.mjs';

const BASE = process.env.AURA_BASE ?? 'http://127.0.0.1:5233';
const OUT = 'docs/public/readme';
const VIEW = { width: 1900, height: 1025 };
mkdirSync(OUT, { recursive: true });

// Pinned clock: the picture always shows midday with the sun on the roof.
const FIXED = (() => {
    const d = new Date();
    d.setHours(13, 42, 0, 0);
    return d.getTime();
})();
const now = FIXED;
const day0 = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
})();

// ── fake history ─────────────────────────────────────────────────────────────
const rnd = mulberry32(0xa0a);
function series(from, to, step, fn) {
    const out = [];
    for (let t = from; t <= to; t += step) out.push([t, Math.round(fn(t) * 100) / 100]);
    return out;
}
const hourOf = (t) => ((((t - day0) / HOUR) % 24) + 24) % 24;
// outdoor: cool night, mild afternoon, a bit of noise
const outdoor = (t) =>
    6 + 5 * Math.sin(((hourOf(t) - 9) / 24) * 2 * Math.PI) + Math.sin(t / 7e6) * 0.8 + (rnd() - 0.5) * 0.3;
const living = (t) => {
    const h = hourOf(t);
    const base = h > 6 && h < 22.5 ? 21.4 : 19.6;
    return base + Math.sin(t / 5e6) * 0.25 + (rnd() - 0.5) * 0.1;
};
const pv = (t) => {
    const h = hourOf(t);
    if (h < 7.5 || h > 16.5) return 0;
    const x = Math.sin(((h - 7.5) / 9) * Math.PI);
    return Math.max(0, 5.6 * x * x * (0.85 + 0.15 * Math.sin(t / 2e6)));
};
const house = (t) => {
    const h = hourOf(t);
    let v = 0.35 + 0.1 * Math.sin(t / 3e6);
    if (h > 6.5 && h < 8.5) v += 1.2;
    if (h > 11.5 && h < 13) v += 1.6;
    if (h > 17.5 && h < 21.5) v += 1.1;
    return v + (rnd() - 0.5) * 0.15;
};

// PV meter (kWh, rising) for the daily bars: hourly readings over the last 9 days
const dayFactor = [0.55, 0.9, 0.35, 1, 0.75, 0.6, 0.95, 0.8, 1, 0.9];
const pvCounter = [];
{
    let acc = 8420;
    for (let t = day0 - 9 * DAY; t <= now; t += HOUR) {
        pvCounter.push([t, Math.round(acc * 100) / 100]);
        acc += pv(t + HOUR / 2) * dayFactor[Math.floor((t - (day0 - 9 * DAY)) / DAY)];
    }
}
const HISTORY = {
    'demo.energy.meter': pvCounter,
    'demo.temp.aussen': series(now - 2 * DAY, now, 10 * 60_000, outdoor),
    'demo.temp.wz': series(now - 2 * DAY, now, 10 * 60_000, living),
    'demo.energy.pv': series(now - 2 * DAY, now, 5 * 60_000, pv),
    'demo.energy.house': series(now - 2 * DAY, now, 5 * 60_000, house),
};

// ── calendar (ical adapter table) ────────────────────────────────────────────
const at = (dayOffset, h, m = 0) => {
    const d = new Date(day0 + dayOffset * DAY);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
};
const allDay = (dayOffset) => new Date(day0 + dayOffset * DAY).toISOString();
const ICAL = [
    { event: 'Paket abholen', _date: at(0, 15, 0), _end: at(0, 15, 30), _calName: 'Haus', location: 'Packstation' },
    {
        event: 'Zahnarzt Lena',
        _date: at(0, 16, 30),
        _end: at(0, 17, 15),
        _calName: 'Familie',
        location: 'Praxis Dr. Weber',
    },
    { event: 'Wochenmarkt', _date: at(1, 9, 0), _end: at(1, 10, 30), _calName: 'Familie' },
    { event: 'Elternabend', _date: at(1, 19, 0), _end: at(1, 20, 30), _calName: 'Familie', location: 'Grundschule' },
    { event: 'Schornsteinfeger', _date: at(2, 9, 0), _end: at(2, 10, 0), _calName: 'Haus' },
    { event: 'Geburtstag Oma', _date: allDay(3), _end: allDay(4), _allDay: true, _calName: 'Geburtstage' },
    { event: 'Fußballtraining', _date: at(4, 17, 30), _end: at(4, 19, 0), _calName: 'Familie', location: 'Sportplatz' },
    { event: 'Yoga', _date: at(5, 18, 0), _end: at(5, 19, 0), _calName: 'Familie' },
    { event: 'Heizungswartung', _date: at(6, 8, 0), _end: at(6, 11, 0), _calName: 'Haus' },
];

// ── weather (open-meteo answer, served by page.route) ────────────────────────
function weatherJson() {
    const days = [...Array(8)].map((_, i) => new Date(day0 + i * DAY).toISOString().slice(0, 10));
    return {
        current: {
            time: new Date(now).toISOString().slice(0, 16),
            temperature_2m: 9.4,
            relative_humidity_2m: 71,
            weather_code: 2,
            wind_speed_10m: 12,
            apparent_temperature: 7.6,
            cloud_cover: 40,
            precipitation: 0,
            pressure_msl: 1018,
        },
        current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
        daily: {
            time: days,
            weather_code: [2, 61, 3, 0, 1, 80, 3, 2],
            temperature_2m_max: [10.1, 8.2, 7.5, 9.8, 11.2, 8.9, 7.1, 8.0],
            temperature_2m_min: [3.2, 4.1, 2.0, 0.4, 1.8, 3.9, 2.5, 1.1],
            precipitation_probability_max: [10, 80, 35, 0, 5, 65, 30, 15],
            precipitation_sum: [0, 6.2, 0.8, 0, 0, 3.4, 0.4, 0],
        },
    };
}

// ── status overview (windows + batteries, discovered from mocked objects) ────
const st = (id, name, role, type, unit) => ({
    id,
    value: {
        _id: id,
        type: 'state',
        common: { name, role, type, read: true, write: false, ...(unit ? { unit } : {}) },
        native: {},
    },
});
const WINDOWS = [
    ['demo.fenster.bad', 'Bad Fenster', true],
    ['demo.fenster.kueche', 'Küche Fenster', true],
    ['demo.fenster.wz', 'Wohnzimmer Terrassentür', false],
    ['demo.fenster.sz', 'Schlafzimmer Fenster', false],
    ['demo.fenster.kind', 'Kinderzimmer Fenster', false],
];
const BATTERIES = [
    ['demo.batt.rauchmelder', 'Rauchmelder Flur', 8],
    ['demo.batt.thermostat', 'Thermostat Bad', 14],
    ['demo.batt.bewegung', 'Bewegungsmelder Keller', 64],
    ['demo.batt.tuer', 'Haustür Sensor', 92],
];
// Handed over as the adapter's discovery answer — otherwise the widget would load the
// whole object DB of the connected instance and show its real devices.
const dpEntry = (id, name, role, type, unit, room) => ({
    id,
    name,
    role,
    type,
    unit,
    rooms: [room],
    funcs: [],
    logging: [],
});
const CANDIDATES = [
    ...WINDOWS.map(([id, name]) => ({
        dp: dpEntry(id, name, 'sensor.window', 'boolean', undefined, name.split(' ')[0]),
        cat: 'window',
        level: null,
    })),
    ...BATTERIES.map(([id, name]) => ({
        dp: dpEntry(id, name, 'value.battery', 'number', '%', name.split(' ')[0]),
        cat: 'battery',
        level: null,
    })),
];
const OBJECTS = {
    state: [
        ...WINDOWS.map(([id, name]) => st(id, name, 'sensor.window', 'boolean')),
        ...BATTERIES.map(([id, name]) => st(id, name, 'value.battery', 'number', '%')),
    ],
    channel: [],
    device: [],
    enum: [],
};

// ── mocked values ────────────────────────────────────────────────────────────
// own instance number: the test instance's real evcc.0 would push its live values in
const EVCC = 'evcc.7';
const evcc = (p = EVCC) => ({
    [`${p}.status.pvPower`]: 4850,
    [`${p}.status.gridPower`]: -620,
    [`${p}.status.homePower`]: 1130,
    [`${p}.status.batteryPower`]: -1500,
    [`${p}.status.batterySoc`]: 76,
    [`${p}.status.batteryMode`]: 'normal',
    [`${p}.status.greenShareHome`]: 1,
    [`${p}.status.greenShareLoadpoints`]: 1,
    [`${p}.status.tariffGrid`]: 0.29,
    [`${p}.loadpoint.1.status.chargePower`]: 1600,
    [`${p}.loadpoint.1.status.chargedEnergy`]: 6400,
    [`${p}.loadpoint.1.status.charging`]: true,
    [`${p}.loadpoint.1.status.connected`]: true,
    [`${p}.loadpoint.1.status.mode`]: 'pv',
    [`${p}.loadpoint.1.status.vehicleTitle`]: 'ID.4',
    [`${p}.loadpoint.1.status.vehicleSoc`]: 58,
    [`${p}.loadpoint.1.status.vehicleRange`]: 248,
    [`${p}.loadpoint.1.status.effectiveLimitSoc`]: 80,
    [`${p}.loadpoint.1.status.sessionSolarPercentage`]: 94,
    [`${p}.loadpoint.1.status.phasesActive`]: 1,
    [`${p}.loadpoint.1.status.title`]: 'Garage',
});
const MOCK = {
    'demo.temp.aussen': 9.4,
    'demo.temp.wz': 21.5,
    'demo.energy.pv': 4.85,
    'demo.energy.house': 1.13,
    'demo.energy.today': 14.0,
    'demo.energy.autarky': 87,
    'demo.energy.batt': 76,
    'demo.energy.meter': pvCounter[pvCounter.length - 1][1],
    'demo.energy.price': 0.29,
    'demo.ical.table': JSON.stringify(ICAL),
    'demo.trash.json': JSON.stringify([
        { name: 'Bio', daysLeft: 0, nextDate: day0, _color: '#22c55e' },
        { name: 'Papier', daysLeft: 3, nextDate: day0 + 3 * DAY, _color: '#3b82f6' },
        { name: 'Restmüll', daysLeft: 7, nextDate: day0 + 7 * DAY, _color: '#6b7280' },
        { name: 'Gelber Sack', daysLeft: 10, nextDate: day0 + 10 * DAY, _color: '#eab308' },
    ]),
    'demo.licht.wz': true,
    'demo.licht.kueche': false,
    'demo.dim.ess': 70,
    'demo.sht.wz': 35,
    ...Object.fromEntries(WINDOWS.map(([id, , v]) => [id, v])),
    ...Object.fromEntries(BATTERIES.map(([id, , v]) => [id, v])),
    ...evcc(),
};

// ── layout ───────────────────────────────────────────────────────────────────
let nid = 0;
const W = (type, title, datapoint, [x, y, w, h], options = {}, layout = 'default') => ({
    id: `w-${type}-${nid++}`,
    type,
    title,
    datapoint,
    layout,
    options,
    gridPos: { x, y, w, h },
});
const NO_ANIM = '{"animation":false}';

const overview = [
    W('clock', 'Uhrzeit', '', [0, 0, 12, 8], {
        display: 'datetime',
        dateLength: 'long',
        showTitle: false,
        showIcon: false,
        timeFontSize: 64,
        dateFontSize: 18,
    }),
    W('trashSchedule', 'Müllabfuhr', 'demo.trash.json', [0, 8, 12, 9], {
        showNames: true,
        showDays: true,
        showDate: true,
        dateFormat: 'dd.MM.',
    }),
    W('weather', 'Wetter', '', [12, 0, 17, 17], {
        dataSource: 'online',
        latitude: 48.14,
        longitude: 11.58,
        locationName: 'Zuhause',
        showForecast: true,
        forecastDays: 5,
    }),
    W('calendar', 'Termine', '', [29, 0, 25, 17], {
        calFontScale: 1.35,
        showLocation: true,
        calendars: [
            {
                id: 'c1',
                type: 'adapter',
                datapoint: 'demo.ical.table',
                url: '',
                name: 'Familie',
                color: '#3b82f6',
                showName: false,
                calFilter: 'Familie',
            },
            {
                id: 'c2',
                type: 'adapter',
                datapoint: 'demo.ical.table',
                url: '',
                name: 'Haus',
                color: '#f59e0b',
                showName: false,
                calFilter: 'Haus',
            },
            {
                id: 'c3',
                type: 'adapter',
                datapoint: 'demo.ical.table',
                url: '',
                name: 'Geburtstage',
                color: '#ec4899',
                showName: false,
                calFilter: 'Geburtstage',
            },
        ],
    }),
    W('echart', 'Temperatur', '', [0, 17, 30, 14], {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartShowLegend: true,
        echartShowCurrent: true,
        decimals: 1,
        echartLeftUnit: '°C',
        echartJsonExtra: NO_ANIM,
        echartSeries: [
            {
                id: 's1',
                name: 'Außen',
                datapointId: 'demo.temp.aussen',
                chartType: 'line',
                color: '#0ea5e9',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                smooth: true,
                area: true,
            },
            {
                id: 's2',
                name: 'Wohnzimmer',
                datapointId: 'demo.temp.wz',
                chartType: 'line',
                color: '#f97316',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                smooth: true,
            },
        ],
    }),
    W('statusoverview', 'Status', '', [30, 17, 24, 14], {
        catWindow: true,
        catBattery: true,
        catLight: false,
        catUnreach: false,
        catAlarm: false,
        batteryTypeEnabled: false,
        valueFilter: 'all',
        showOkCategories: true,
    }),
];

const energy = [
    W(
        'evcc',
        'Energiefluss',
        '',
        [0, 0, 26, 15],
        { evccPrefix: EVCC, loadpointCount: 1, showBattery: true, showLoadpoints: true, autoScale: true },
        'flow',
    ),
    W('echart', 'PV-Ertrag pro Tag', '', [0, 15, 26, 16], {
        echartMode: 'timeseries',
        echartRange: '7d',
        echartShowLegend: false,
        echartShowCurrent: true,
        decimals: 1,
        echartLeftUnit: 'kWh',
        echartLeftMin: 0,
        echartJsonExtra: NO_ANIM,
        echartSeries: [
            {
                id: 'd1',
                name: 'PV-Ertrag',
                datapointId: 'demo.energy.meter',
                chartType: 'bar',
                color: '#f59e0b',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                aggregate: 'delta',
                deltaBucket: 'day',
            },
        ],
    }),
    W('echart', 'Erzeugung & Verbrauch heute', '', [26, 0, 28, 24], {
        echartMode: 'timeseries',
        echartRange: '24h',
        echartShowLegend: true,
        echartShowCurrent: true,
        decimals: 2,
        echartLeftUnit: 'kW',
        echartLeftMin: 0,
        echartJsonExtra: NO_ANIM,
        echartSeries: [
            {
                id: 'e1',
                name: 'PV',
                datapointId: 'demo.energy.pv',
                chartType: 'line',
                color: '#f59e0b',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                smooth: true,
                area: true,
            },
            {
                id: 'e2',
                name: 'Haus',
                datapointId: 'demo.energy.house',
                chartType: 'line',
                color: '#6366f1',
                historyInstance: 'history.0',
                yAxisIndex: 0,
                smooth: true,
            },
        ],
    }),
    W('value', 'PV heute', 'demo.energy.today', [26, 24, 7, 7], { unit: 'kWh', decimals: 1, icon: 'lucide:sun' }),
    W('value', 'Autarkie', 'demo.energy.autarky', [33, 24, 7, 7], { unit: '%', decimals: 0, icon: 'lucide:leaf' }),
    W('value', 'Hausbatterie', 'demo.energy.batt', [40, 24, 7, 7], {
        unit: '%',
        decimals: 0,
        icon: 'lucide:battery-medium',
    }),
    W('value', 'Strompreis', 'demo.energy.price', [47, 24, 7, 7], { unit: '€/kWh', decimals: 2, icon: 'lucide:euro' }),
];

const tab = (id, name, slug, icon, widgets = []) => ({ id, name, slug, icon, widgets });
const section = (id, name, slug, icon, tabs) => ({ id, name, slug, icon, tabs, activeTabId: tabs[0].id });

const LAYOUT = {
    id: 'readme',
    name: 'Zuhause',
    slug: 'zuhause',
    activeSectionId: 'sec-home',
    settings: {
        gridRowHeight: 20,
        gridSnapX: 20,
        gridGap: 10,
        showHeader: false,
        layoutDrawerEnabled: true,
        layoutDrawerPlacement: 'sidebar',
        layoutDrawerShowTitle: true,
        layoutDrawerTitle: 'Zuhause',
        layoutDrawerEntryStyle: 'iconAndName',
        layoutDrawerIndicatorStyle: 'filled',
        guidelinesEnabled: false,
        guidelinesShowInFrontend: false,
        guidelinesShowResolution: false,
    },
    sections: [
        section('sec-home', 'Übersicht', 'uebersicht', 'lucide:house', [
            tab('t-today', 'Heute', 'heute', 'lucide:sun', overview),
            tab('t-living', 'Wohnen', 'wohnen', 'lucide:sofa'),
            tab('t-garden', 'Garten', 'garten', 'lucide:trees'),
        ]),
        section('sec-energy', 'Energie', 'energie', 'lucide:zap', [
            tab('t-flow', 'Energiefluss', 'fluss', 'lucide:zap', energy),
            tab('t-hist', 'Verlauf', 'verlauf', 'lucide:chart-line'),
        ]),
        section('sec-climate', 'Klima', 'klima', 'lucide:thermometer', [tab('t-c', 'Räume', 'raeume')]),
        section('sec-light', 'Licht', 'licht', 'lucide:lightbulb', [tab('t-l', 'Alle', 'alle')]),
        section('sec-security', 'Sicherheit', 'sicherheit', 'lucide:shield', [tab('t-s', 'Status', 'status')]),
        section('sec-media', 'Medien', 'medien', 'lucide:music', [tab('t-m', 'Wiedergabe', 'wiedergabe')]),
        section('sec-system', 'System', 'system', 'lucide:server', [tab('t-y', 'Adapter', 'adapter')]),
    ],
};

// ── run ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    locale: 'de-DE',
});
await ctx.clock.setFixedTime(FIXED);
await ctx.route(/api\.open-meteo\.com/, (r) => r.fulfill({ json: weatherJson() }));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

async function seed(theme) {
    await page.evaluate(
        ({ LAYOUT, MOCK, theme, OBJECTS, HISTORY, CANDIDATES }) => {
            const s = window.__auraShot;
            s.setTheme(theme);
            s.mockObjectView(OBJECTS);
            s.mockSendTo({ statusDiscover: { ok: true, candidates: CANDIDATES, devices: [] } });
            s.mockHistory(HISTORY);
            s.mockServerState(MOCK);
            s.mock(MOCK);
            s.seed({ layouts: [LAYOUT], activeLayoutId: LAYOUT.id });
        },
        { LAYOUT, MOCK, theme, OBJECTS, HISTORY, CANDIDATES },
    );
}

async function show(path, file) {
    await page.evaluate((p) => (window.location.hash = p), path);
    await page.waitForTimeout(1500);
    await page.evaluate((m) => window.__auraShot.mock(m), MOCK);
    // charts load lazily; the status overview searches its datapoints first
    await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
    await page
        .waitForFunction(() => !/Datenpunkte werden gesucht|Daten werden geladen/.test(document.body.innerText), null, {
            timeout: 30000,
        })
        .catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    const plotted = await page.evaluate(() => window.__auraShot.chartSeries?.());
    console.log('✓', file, (plotted ?? []).map((s) => `${s.name}:${s.points}`).join(' '));
}

for (const theme of ['dark', 'light']) {
    await seed(theme);
    await show('#/view/zuhause/s/uebersicht/tab/heute', `overview-${theme}`);
    await show('#/view/zuhause/s/energie/tab/fluss', `energy-${theme}`);
}

await browser.close();
