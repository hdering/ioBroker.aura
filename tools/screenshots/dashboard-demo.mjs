// Seed a realistic multi-tab smart-home dashboard that exercises EVERY widget
// type, then screenshot each tab. Side-effect-free: all data is mocked in the
// browser (state injection + dev history/objectView/sendTo stubs); screenshotMode
// disables every write back to the ioBroker instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const OUT = 'tools/screenshots/out';
mkdirSync(OUT, { recursive: true });

// ── grid config ──────────────────────────────────────────────────────────────
const SETTINGS = { gridRowHeight: 16, gridSnapX: 16, gridGap: 5 };
const TOTAL = 78; // usable columns at 1680px viewport
const GAP = 1;
const ROW_GAP = 1;

// ── widget + packing helpers ─────────────────────────────────────────────────
let nid = 0;
// Explicit-size widget: full control over type/size/options.
const W = (type, title, dp, w, h, options = {}) => ({ type, title, dp, w, h, options });
// Standard control widget by short kind key (size from the K table).
const K = {
    sw: ['switch', 11, 5],
    dim: ['dimmer', 12, 5],
    sld: ['slider', 13, 5],
    val: ['value', 12, 5],
    win: ['windowcontact', 11, 5],
    bin: ['binarysensor', 11, 5],
    sht: ['shutter', 12, 6],
    thr: ['thermostat', 13, 7],
    cli: ['climate', 14, 7],
    gau: ['gauge', 12, 7],
    knb: ['knob', 11, 7],
    fil: ['fill', 9, 8],
    clk: ['clock', 13, 6],
};
const w = (k, title, dp, options = {}) => W(K[k][0], title, dp, K[k][1], K[k][2], options);

function pack(items, startY) {
    let y = startY,
        x = 0,
        rowH = 0;
    const out = [];
    for (const i of items) {
        if (x + i.w > TOTAL) {
            x = 0;
            y += rowH + ROW_GAP;
            rowH = 0;
        }
        out.push({
            id: `w-${nid++}`,
            type: i.type,
            title: i.title,
            datapoint: i.dp ?? '',
            layout: i.options?.__layout ?? 'default',
            options: i.options ?? {},
            gridPos: { x, y, w: i.w, h: i.h },
        });
        x += i.w + GAP;
        rowH = Math.max(rowH, i.h);
    }
    return { widgets: out, nextY: y + rowH + ROW_GAP };
}

function tab(id, name, slug, sections) {
    let y = 0;
    let widgets = [];
    for (const s of sections) {
        if (s.header) {
            widgets.push({
                id: `w-${nid++}`,
                type: 'header',
                title: s.header,
                datapoint: '',
                layout: 'default',
                options: { title: s.header },
                gridPos: { x: 0, y, w: TOTAL, h: 2 },
            });
            y += 3;
        }
        const packed = pack(s.items, y);
        widgets = widgets.concat(packed.widgets);
        y = packed.nextY + 1;
    }
    return { id, name, slug, widgets };
}

// ── shared inline assets (offline) ────────────────────────────────────────────
const SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="400" height="240" fill="url(#g)"/><text x="200" y="130" font-family="sans-serif" font-size="28" fill="white" text-anchor="middle">Wohnzimmer</text></svg>`;
const SVG_IMG = 'data:image/svg+xml;base64,' + Buffer.from(SVG_RAW).toString('base64');

// ── group / panels children (live in a separate store, keyed by defId) ────────
const GROUP_DEFS = {
    'gd-klima': [
        { id: 'gc1', type: 'value', title: 'Temperatur', datapoint: 'demo.heiz.wz', layout: 'default', options: { unit: '°C' }, gridPos: { x: 0, y: 0, w: 13, h: 5 } },
        { id: 'gc2', type: 'value', title: 'Luftfeuchte', datapoint: 'demo.hum.wz', layout: 'default', options: { unit: '%' }, gridPos: { x: 14, y: 0, w: 13, h: 5 } },
        { id: 'gc3', type: 'gauge', title: 'CO₂', datapoint: 'demo.co2', layout: 'default', options: { unit: 'ppm', min: 400, max: 1500 }, gridPos: { x: 0, y: 6, w: 13, h: 7 } },
        { id: 'gc4', type: 'switch', title: 'Lüftung', datapoint: 'demo.lueftung', layout: 'default', options: {}, gridPos: { x: 14, y: 6, w: 13, h: 5 } },
    ],
    'gd-panels': [
        { id: 'pc1', type: 'gauge', title: 'PV', datapoint: 'demo.pv', layout: 'default', options: { unit: 'kW', min: 0, max: 10 }, gridPos: { x: 0, y: 0, w: 30, h: 14 } },
        { id: 'pc2', type: 'gauge', title: 'Netzbezug', datapoint: 'demo.netz', layout: 'default', options: { unit: 'kW', min: 0, max: 10 }, gridPos: { x: 0, y: 0, w: 30, h: 14 } },
        { id: 'pc3', type: 'fill', title: 'Batterie', datapoint: 'demo.batt', layout: 'default', options: { unit: '%' }, gridPos: { x: 0, y: 0, w: 30, h: 14 } },
    ],
};

// ── objectView + sendTo stubs (adapter-backed widgets) ────────────────────────
const inst = (id, nameDe, titleDe, version, mode = 'daemon', enabled = true) => ({
    id: `system.adapter.${id}`,
    value: { _id: `system.adapter.${id}`, type: 'instance', common: { name: nameDe, title: titleDe, enabled, mode, version, host: 'iobroker' } },
});
const script = (id, nameDe, engine, enabled) => ({
    id: `script.js.${id}`,
    value: { _id: `script.js.${id}`, type: 'script', common: { name: nameDe, enabled, engineType: engine } },
});

const OBJECT_VIEW = {
    instance: [
        inst('hm-rpc.0', 'Funk-Geräte', 'Homematic RPC', '4.13.7'),
        inst('shelly.0', 'Shelly', 'Shelly', '8.2.1'),
        inst('openweathermap.0', 'Wetter', 'OpenWeatherMap', '3.2.1', 'schedule'),
        inst('history.0', 'Verlauf', 'History', '3.0.5'),
        inst('web.0', 'Web', 'ioBroker.web', '6.2.5'),
        inst('backitup.0', 'Backup', 'BackItUp', '3.0.30', 'schedule', false),
    ],
    script: [
        script('common.Anwesenheit', 'Anwesenheit', 'Javascript/js', true),
        script('common.Heizung', 'Heizungssteuerung', 'Blockly', true),
        script('automation.Rollladen', 'Rollladen-Automatik', 'Rules', true),
        script('test.Debug', 'Debug-Skript', 'TypeScript/ts', false),
    ],
};

const now = 1751200000000; // fixed-ish epoch for deterministic-looking logs
const LOGS = {
    ok: true,
    latestSeq: 1005,
    entries: [
        { severity: 'info', ts: now - 60000, message: 'Adapter shelly.0 gestartet', from: 'shelly.0', seq: 1001 },
        { severity: 'info', ts: now - 48000, message: 'Verbindung zu 8 Geräten hergestellt', from: 'hm-rpc.0', seq: 1002 },
        { severity: 'warn', ts: now - 32000, message: 'Antwortzeit hoch für Gerät 0x1a2b3c', from: 'hm-rpc.0', seq: 1003 },
        { severity: 'error', ts: now - 18000, message: 'Timeout beim Abruf der Wetterdaten', from: 'openweathermap.0', seq: 1004 },
        { severity: 'info', ts: now - 4000, message: 'Backup erfolgreich abgeschlossen (412 MB)', from: 'backitup.0', seq: 1005 },
    ],
};
const SEND_TO = { getRecentLogs: LOGS };

// ── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
    tab('t-overview', 'Übersicht', 'uebersicht', [
        {
            header: 'Auf einen Blick',
            items: [
                w('clk', 'Uhrzeit', ''),
                w('val', 'Außentemperatur', 'demo.aussen', { unit: '°C' }),
                w('gau', 'PV-Leistung', 'demo.pv', { unit: 'kW', min: 0, max: 10 }),
                w('val', 'Hausverbrauch', 'demo.verbrauch', { unit: 'kW' }),
                w('val', 'Pool-Temperatur', 'demo.pool.temp', { unit: '°C' }),
            ],
        },
        {
            header: 'Wohnzimmer',
            items: [
                w('sw', 'Deckenlicht', 'demo.licht.wz'),
                w('dim', 'Stehlampe', 'demo.dim.wz'),
                w('sht', 'Rollladen', 'demo.sht.wz'),
                w('thr', 'Heizung', 'demo.heiz.wz'),
                w('win', 'Terrassentür', 'demo.tuer'),
                w('bin', 'Bewegung Flur', 'demo.bewegung'),
            ],
        },
        {
            header: 'Verlauf & Favoriten',
            items: [
                W('chart', 'PV-Leistung (24 h)', 'demo.pv', 36, 16, { historyInstance: 'history.0', historyRange: '24h', unit: 'kW', showAverage: true }),
                W('list', 'Favoriten', '', 24, 16, {
                    entries: [
                        { id: 'demo.licht.wz', label: 'Deckenlicht', icon: 'lucide:lightbulb', writable: true, displayType: 'switch' },
                        { id: 'demo.dim.wz', label: 'Stehlampe', unit: '%', displayType: 'slider', writable: true },
                        { id: 'demo.aussen', label: 'Außentemperatur', unit: '°C', decimals: 1, displayType: 'value' },
                        { id: 'demo.tuer', label: 'Terrassentür', role: 'door', displayType: 'auto' },
                        { id: 'demo.pool.temp', label: 'Pool', unit: '°C', decimals: 1, displayType: 'value' },
                    ],
                    showCount: true,
                }),
                W('jsontable', 'Raumtemperaturen', 'demo.raeume', 17, 16, { showSearch: false, striped: true }),
            ],
        },
    ]),

    tab('t-licht', 'Licht', 'licht', [
        {
            header: 'Beleuchtung',
            items: [
                w('sw', 'Deckenlicht WZ', 'demo.licht.wz'),
                w('dim', 'Stehlampe WZ', 'demo.dim.wz'),
                w('dim', 'Esstisch', 'demo.dim.ess'),
                w('sw', 'Küche', 'demo.licht.ku'),
                w('sw', 'Flur', 'demo.licht.flur'),
                w('sw', 'Außen', 'demo.licht.aussen'),
            ],
        },
        {
            header: 'Stimmung & Szenen',
            items: [
                W('light', 'RGB LED-Strip', 'demo.rgb.bri', 22, 26, {
                    switchDp: 'demo.rgb.on',
                    brightnessDp: 'demo.rgb.bri',
                    colorMode: 'hsv',
                    hueDp: 'demo.rgb.hue',
                    saturationDp: 'demo.rgb.sat',
                    satMax: 100,
                    temperatureDp: 'demo.rgb.ct',
                    ctMin: 2000,
                    ctMax: 6500,
                    colorPresets: ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#5ac8fa', '#af52de'],
                }),
                W('chips', 'Szenen', '', 30, 6, {
                    chips: [
                        { id: 'c1', label: 'Aus', icon: 'lucide:power-off', dp: 'demo.scene', value: 'off' },
                        { id: 'c2', label: 'Entspannen', icon: 'lucide:sofa', dp: 'demo.scene', value: 'relax' },
                        { id: 'c3', label: 'Kochen', icon: 'lucide:cooking-pot', dp: 'demo.scene', value: 'cook' },
                        { id: 'c4', label: 'Kino', icon: 'lucide:film', dp: 'demo.scene', value: 'movie' },
                    ],
                    checkDp: 'demo.scene',
                    chipStyle: 'filled',
                    chipSize: 38,
                    __layout: 'default',
                }),
                W('carousel', 'Räume', '', 30, 8, {
                    items: [
                        { id: 'r1', label: 'Wohnen', icon: 'lucide:sofa', dp: 'demo.room', value: 'wz', bgColor: '#0ea5e9' },
                        { id: 'r2', label: 'Küche', icon: 'lucide:utensils', dp: 'demo.room', value: 'ku', bgColor: '#22c55e' },
                        { id: 'r3', label: 'Bad', icon: 'lucide:bath', dp: 'demo.room', value: 'bad', bgColor: '#a855f7' },
                        { id: 'r4', label: 'Schlafen', icon: 'lucide:bed', dp: 'demo.room', value: 'sz', bgColor: '#f59e0b' },
                    ],
                    checkDp: 'demo.room',
                    chipStyle: 'filled',
                }),
            ],
        },
    ]),

    tab('t-heizung', 'Heizung', 'heizung', [
        {
            header: 'Thermostate',
            items: [
                w('thr', 'Wohnzimmer', 'demo.heiz.wz'),
                w('thr', 'Schlafzimmer', 'demo.heiz.sz'),
                w('thr', 'Bad', 'demo.heiz.bad'),
                w('knb', 'Soll-Temperatur', 'demo.soll', { unit: '°C', min: 15, max: 28 }),
            ],
        },
        {
            header: 'Klima & Heizkreis',
            items: [
                w('cli', 'Raumklima', 'demo.heiz.wz', { humidityDatapoint: 'demo.hum.wz' }),
                w('gau', 'Kesseltemperatur', 'demo.kessel', { unit: '°C', min: 0, max: 90 }),
                w('val', 'Vorlauf', 'demo.vorlauf', { unit: '°C' }),
                w('val', 'Rücklauf', 'demo.ruecklauf', { unit: '°C' }),
                W('chart', 'Raumtemperatur (24 h)', 'demo.heiz.wz', 40, 16, { historyInstance: 'history.0', historyRange: '24h', unit: '°C', lineColor: '#ef4444', showAverage: true }),
            ],
        },
    ]),

    tab('t-beschattung', 'Beschattung', 'beschattung', [
        {
            header: 'Rollläden',
            items: [
                w('sht', 'Wohnzimmer', 'demo.sht.wz'),
                w('sht', 'Küche', 'demo.sht.ku'),
                w('sht', 'Schlafzimmer', 'demo.sht.sz'),
                w('sht', 'Bad', 'demo.sht.bad'),
                w('sht', 'Terrasse', 'demo.sht.terrasse'),
            ],
        },
        {
            header: 'Fenster & Tore',
            items: [
                W('stateimage', 'Garagentor', 'demo.garage', 14, 9, {
                    trueType: 'icon', trueIcon: 'DoorOpen', trueColor: '#ef4444', trueLabel: 'Offen',
                    falseType: 'icon', falseIcon: 'DoorClosed', falseColor: '#22c55e', falseLabel: 'Geschlossen',
                    layout: 'card', showLabel: true,
                }),
                w('win', 'Fenster Küche', 'demo.fenster.ku'),
                w('win', 'Terrassentür', 'demo.tuer'),
                w('sld', 'Markise', 'demo.markise', { unit: '%', min: 0, max: 100 }),
            ],
        },
    ]),

    tab('t-pool', 'Pool', 'pool', [
        {
            header: 'Pool',
            items: [
                w('val', 'Wassertemperatur', 'demo.pool.temp', { unit: '°C' }),
                w('gau', 'pH-Wert', 'demo.pool.ph', { min: 6, max: 8 }),
                w('sw', 'Poolpumpe', 'demo.pool.pumpe'),
                w('sw', 'Poolbeleuchtung', 'demo.pool.licht'),
                w('fil', 'Füllstand', 'demo.pool.fuell', { unit: '%' }),
                w('sld', 'Filterlaufzeit', 'demo.pool.filter', { unit: 'h', min: 0, max: 24 }),
                w('bin', 'Abdeckung offen', 'demo.pool.cover'),
            ],
        },
    ]),

    tab('t-energie', 'Energie', 'energie', [
        {
            header: 'Photovoltaik & Verbrauch',
            items: [
                w('gau', 'PV-Leistung', 'demo.pv', { unit: 'kW', min: 0, max: 10 }),
                w('gau', 'Netzbezug', 'demo.netz', { unit: 'kW', min: 0, max: 10 }),
                w('val', 'Hausverbrauch', 'demo.verbrauch', { unit: 'kW' }),
                w('fil', 'Batterie', 'demo.batt', { unit: '%' }),
                w('knb', 'Ladegrenze', 'demo.ladegrenze', { unit: '%', min: 0, max: 100 }),
            ],
        },
        {
            header: 'Verlauf',
            items: [
                W('echart', 'Erzeugung vs. Verbrauch (24 h)', '', 50, 20, {
                    echartMode: 'timeseries',
                    echartSeries: [
                        { id: 's1', name: 'PV', datapointId: 'demo.pv', chartType: 'area', color: '#22c55e', historyInstance: 'history.0', smooth: true, yAxisIndex: 0 },
                        { id: 's2', name: 'Verbrauch', datapointId: 'demo.verbrauch', chartType: 'line', color: '#ef4444', historyInstance: 'history.0', smooth: true, yAxisIndex: 0 },
                        { id: 's3', name: 'Batterie', datapointId: 'demo.batt', chartType: 'line', color: '#0ea5e9', historyInstance: 'history.0', smooth: true, yAxisIndex: 1 },
                    ],
                    echartShowLegend: true, echartShowCurrent: true, echartRange: '24h', echartLeftUnit: 'kW', echartRightUnit: '%', decimals: 1,
                }),
                W('datepicker', 'Abrechnung ab', 'demo.datum', 26, 6, { showTime: false, outputFormat: 'iso', showCurrentValue: true }),
            ],
        },
        {
            header: 'Wallbox (evcc)',
            items: [W('evcc', 'Energiefluss', '', 50, 30, { evccPrefix: 'evcc.0', loadpointCount: 1, showBattery: true, showLoadpoints: true, autoScale: true })],
        },
    ]),

    tab('t-medien', 'Medien & Web', 'medien', [
        {
            header: 'Medien',
            items: [
                W('mediaplayer', 'Wohnzimmer Speaker', 'demo.media.playing', 38, 22, {
                    titleDp: 'demo.media.title', artistDp: 'demo.media.artist', albumDp: 'demo.media.album',
                    playStateDp: 'demo.media.playing', volumeDp: 'demo.media.vol',
                    playDp: 'demo.media.play', pauseDp: 'demo.media.pause', nextDp: 'demo.media.next', prevDp: 'demo.media.prev',
                    showCover: true,
                }),
                W('weather', 'Wetter München', '', 26, 24, { dataSource: 'online', latitude: 48.14, longitude: 11.58, locationName: 'München', showForecast: true, forecastDays: 4 }),
            ],
        },
        {
            header: 'Web & Inhalte',
            items: [
                W('image', 'Kamerabild', '', 22, 16, { imageUrl: SVG_IMG, fit: 'contain' }),
                W('html', 'Statusboard', '', 22, 16, { htmlContent: "<div style='font-family:sans-serif;padding:18px;text-align:center'><div style='font-size:42px'>🏠</div><h2 style='margin:6px 0;color:#0ea5e9'>System online</h2><p style='color:#64748b'>12 Geräte · 3 Szenen aktiv</p></div>", scrollable: false }),
                W('enum', 'Betriebsmodus', 'demo.mode', 18, 8, {
                    entries: [
                        { value: '0', label: 'Aus', color: '#ef4444' },
                        { value: '1', label: 'Automatik', color: '#22c55e' },
                        { value: '2', label: 'Manuell', color: '#f59e0b' },
                        { value: '3', label: 'Urlaub', color: '#6366f1' },
                    ],
                    showValue: true, showSelect: true,
                }),
            ],
        },
        {
            header: 'Eingebettet & dynamisch',
            items: [
                W('camera', 'Eingang', '', 24, 16, { streamUrl: SVG_IMG, fitMode: 'cover' }),
                W('autolist', 'Sensoren', '', 24, 16, {
                    entries: [
                        { id: 'demo.aussen', label: 'Außentemperatur', unit: '°C', role: 'value.temperature' },
                        { id: 'demo.hum.wz', label: 'Luftfeuchte WZ', unit: '%', role: 'value.humidity' },
                        { id: 'demo.co2', label: 'CO₂', unit: 'ppm', role: 'value' },
                        { id: 'demo.bewegung', label: 'Bewegung Flur', role: 'sensor.motion' },
                    ],
                    showCount: true,
                }),
                W('iframe', 'Webpanel', '', 24, 16, { iframeUrl: 'data:text/html,<body style="margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100%;background:%23f1f5f9"><div style="text-align:center"><h3 style="color:%230ea5e9">iFrame-Inhalt</h3><p style="color:%2364748b">eingebettete Seite</p></div></body>', allowInteraction: false }),
            ],
        },
    ]),

    tab('t-sicherheit', 'Sicherheit', 'sicherheit', [
        {
            header: 'Alarmanlage',
            items: [W('alarm', 'Alarm', '', 40, 30, { alarmPrefix: 'alarm.0', showHeader: true, showModes: true, showCountdown: true, showZones: true, showLog: true, logLines: 4 })],
        },
        {
            header: 'Kontakte & Müllabfuhr',
            items: [
                w('bin', 'Bewegung Flur', 'demo.bewegung'),
                w('win', 'Fenster Küche', 'demo.fenster.ku'),
                W('trash', 'Mülltonnen', '', 24, 10, {
                    bins: [
                        { id: 'b1', name: 'Restmüll', icon: 'Trash2', color: '#6b7280', datapoint: 'demo.trash.rest' },
                        { id: 'b2', name: 'Papier', icon: 'Newspaper', color: '#3b82f6', datapoint: 'demo.trash.papier' },
                        { id: 'b3', name: 'Bio', icon: 'Leaf', color: '#22c55e', datapoint: 'demo.trash.bio' },
                    ],
                }),
                W('trashSchedule', 'Abfuhr-Termine', 'demo.trash.json', 26, 14, { showNames: true, showDays: true, showDate: true, dateFormat: 'dd.MM.' }),
                W('calendar', 'Termine', '', 30, 18, { calendars: [{ id: 'cal1', url: 'https://example.com/cal.ics', name: 'Familie', color: '#3b82f6', showName: true }] }),
            ],
        },
    ]),

    tab('t-system', 'System', 'system', [
        {
            header: 'Instanzen & Skripte',
            items: [
                W('adapterstatus', 'Adapter-Status', '', 38, 26, { showTitle: true }),
                W('scriptstatus', 'Skripte', '', 38, 26, { showTitle: true }),
            ],
        },
        {
            header: 'Logs & Automatik',
            items: [
                W('adapterlogs', 'Adapter-Logs', '', 50, 22, { showTitle: true, bufferSize: 200 }),
                W('timer', 'Bewässerung', '', 28, 22, {
                    targetDp: 'demo.pool.pumpe', value: 'true', masterEnabled: true, showMasterSwitch: true, showEvents: true,
                    events: [
                        { id: 't1', enabled: true, label: 'Morgens', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], trigger: { kind: 'astro', event: 'sunrise', offsetMin: 0 }, filter: 'all-days' },
                        { id: 't2', enabled: true, label: 'Abends', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], trigger: { kind: 'time', hour: 20, minute: 0 }, filter: 'all-days' },
                    ],
                }),
            ],
        },
        {
            header: 'Aktionen',
            items: [
                W('button', 'Alles aus', '', 14, 8, { buttonLabel: 'Ausschalten', buttonColor: '#ef4444', icon: 'power-off', iconSize: 26 }),
                W('httpRequest', 'Webhook', '', 18, 8, { method: 'POST', url: 'https://example.com/hook', buttonLabel: 'Senden', showStatus: true, icon: 'globe' }),
                W('input', 'Notiz', 'demo.note', 22, 8, { placeholder: 'Text eingeben…', submitMode: 'submit', showSubmit: true }),
            ],
        },
    ]),

    tab('t-bausteine', 'Bausteine', 'bausteine', [
        {
            header: 'Container',
            items: [
                W('group', 'Raumklima (Gruppe)', '', 30, 16, { defId: 'gd-klima', showTitle: true, icon: 'thermometer' }),
                W('panels', 'Energie (Panels)', '', 30, 16, { defId: 'gd-panels', showDots: true, showArrows: true }),
            ],
        },
        {
            header: 'Universal-Raster',
            items: [
                W('universal', 'Steuer-Panel', '', 30, 18, {
                    customGrid: {
                        cols: 3,
                        rows: 2,
                        cells: [
                            { type: 'title', text: 'Licht' },
                            { type: 'switch', dpId: 'demo.licht.wz' },
                            { type: 'slider', dpId: 'demo.dim.wz', min: 0, max: 100 },
                            { type: 'title', text: 'Klima' },
                            { type: 'value', dpId: 'demo.heiz.wz', decimals: 1, suffix: '°C' },
                            { type: 'state-icon', dpId: 'demo.tuer', trueIcon: 'DoorOpen', falseIcon: 'DoorClosed', trueColor: '#ef4444', falseColor: '#22c55e' },
                        ],
                    },
                }),
                W('echartsPreset', 'eCharts-Preset', '', 30, 18, { showTitle: true }),
            ],
        },
    ]),
];

const LAYOUT = {
    id: 'dash-demo',
    name: 'Zuhause',
    slug: 'zuhause',
    icon: 'House',
    activeTabId: 't-overview',
    settings: SETTINGS,
    tabs: TABS,
};

// ── mock state map ─────────────────────────────────────────────────────────────
function alarmStates() {
    const p = 'alarm.0';
    return {
        [`${p}.status.state_list`]: 1,
        [`${p}.status.state`]: 'sharp',
        [`${p}.status.activated`]: true,
        [`${p}.status.activated_with_warnings`]: false,
        [`${p}.status.sleep`]: false,
        [`${p}.status.sharp_inside_activated`]: false,
        [`${p}.status.burglar_alarm`]: false,
        [`${p}.status.silent_alarm`]: false,
        [`${p}.status.siren`]: false,
        [`${p}.status.enableable`]: true,
        [`${p}.status.activation_countdown`]: 0,
        [`${p}.status.silent_countdown`]: 0,
        [`${p}.status.activation_failed`]: false,
        [`${p}.info.alarm_circuit_list`]: 'Erdgeschoss, Keller',
        [`${p}.info.notification_circuit_list`]: 'Rauchmelder',
        [`${p}.info.sharp_inside_circuit_list`]: 'Bewegung Flur',
        [`${p}.info.notification_circuit_changes`]: false,
        [`${p}.info.wrong_password`]: false,
        [`${p}.info.log`]: '',
        [`${p}.info.log_today`]: '06:42 Aktiviert (Scharf)\n07:15 Bewegung Flur\n08:30 Deaktiviert',
        [`${p}.zone.one_on_off`]: true,
        [`${p}.zone.one`]: false,
        [`${p}.zone.two_on_off`]: true,
        [`${p}.zone.two`]: false,
        [`${p}.zone.three_on_off`]: true,
        [`${p}.zone.three`]: false,
        [`${p}.presence.on_off`]: true,
    };
}
function evccStates() {
    const p = 'evcc.0';
    return {
        [`${p}.status.pvPower`]: 5400,
        [`${p}.status.gridPower`]: -1800,
        [`${p}.status.homePower`]: 1900,
        [`${p}.status.batteryPower`]: -1700,
        [`${p}.status.batterySoc`]: 72,
        [`${p}.status.batteryMode`]: 'normal',
        [`${p}.status.greenShareHome`]: 0.82,
        [`${p}.status.greenShareLoadpoints`]: 1,
        [`${p}.status.tariffGrid`]: 0.28,
        [`${p}.loadpoint.1.status.chargePower`]: 3600,
        [`${p}.loadpoint.1.status.chargedEnergy`]: 8200,
        [`${p}.loadpoint.1.status.charging`]: true,
        [`${p}.loadpoint.1.status.connected`]: true,
        [`${p}.loadpoint.1.status.mode`]: 'pv',
        [`${p}.loadpoint.1.status.vehicleTitle`]: 'ID.4',
        [`${p}.loadpoint.1.status.vehicleSoc`]: 64,
        [`${p}.loadpoint.1.status.vehicleRange`]: 312,
        [`${p}.loadpoint.1.status.effectiveLimitSoc`]: 80,
        [`${p}.loadpoint.1.status.sessionSolarPercentage`]: 91,
        [`${p}.loadpoint.1.status.phasesActive`]: 2,
        [`${p}.loadpoint.1.status.title`]: 'Garage',
    };
}
// adapterstatus / scriptstatus subscriptions
const adapterStates = {
    'system.adapter.hm-rpc.0.alive': true, 'system.adapter.hm-rpc.0.connected': true,
    'system.adapter.shelly.0.alive': true, 'system.adapter.shelly.0.connected': true,
    'system.adapter.openweathermap.0.alive': true, 'system.adapter.openweathermap.0.connected': true,
    'system.adapter.history.0.alive': true, 'system.adapter.history.0.connected': true,
    'system.adapter.web.0.alive': true, 'system.adapter.web.0.connected': true,
    'system.adapter.backitup.0.alive': false, 'system.adapter.backitup.0.connected': false,
    'script.js.common.Anwesenheit': true,
    'script.js.common.Heizung': true,
    'script.js.automation.Rollladen': true,
    'script.js.test.Debug': false,
};

const MOCK = {
    'demo.aussen': 14.2, 'demo.pv': 6.4, 'demo.netz': 0.4, 'demo.verbrauch': 1.8,
    'demo.co2': 720, 'demo.batt': 72, 'demo.bewegung': true, 'demo.tuer': false,
    'demo.lueftung': true, 'demo.scene': 'relax', 'demo.room': 'wz', 'demo.mode': '1',
    'demo.garage': false, 'demo.fenster.ku': true, 'demo.markise': 30, 'demo.ladegrenze': 80,
    'demo.soll': 22, 'demo.kessel': 62, 'demo.vorlauf': 48, 'demo.ruecklauf': 39,
    'demo.note': 'Heizung Bad prüfen', 'demo.datum': '2026-01-01',
    // Licht
    'demo.licht.wz': true, 'demo.licht.ku': false, 'demo.licht.flur': true, 'demo.licht.aussen': true,
    'demo.dim.wz': 60, 'demo.dim.ess': 35,
    'demo.rgb.on': true, 'demo.rgb.bri': 80, 'demo.rgb.hue': 280, 'demo.rgb.sat': 90, 'demo.rgb.ct': 4000,
    // Heizung
    'demo.heiz.wz': 21.5, 'demo.heiz.sz': 19.0, 'demo.heiz.bad': 23.0, 'demo.hum.wz': 48,
    // Rollläden
    'demo.sht.wz': 45, 'demo.sht.ku': 100, 'demo.sht.sz': 0, 'demo.sht.bad': 80, 'demo.sht.terrasse': 30,
    // Pool
    'demo.pool.temp': 26.5, 'demo.pool.pumpe': true, 'demo.pool.ph': 7.2,
    'demo.pool.licht': false, 'demo.pool.fuell': 74, 'demo.pool.filter': 8, 'demo.pool.cover': false,
    // Media
    'demo.media.title': 'Midnight City', 'demo.media.artist': 'M83', 'demo.media.album': 'Hurry Up, We\'re Dreaming',
    'demo.media.playing': true, 'demo.media.vol': 65,
    // Trash
    'demo.trash.rest': true, 'demo.trash.papier': false, 'demo.trash.bio': true,
    'demo.trash.json': JSON.stringify([
        { name: 'Restmüll', daysLeft: 0, nextDate: now, _color: '#6b7280' },
        { name: 'Bio', daysLeft: 2, nextDate: now + 172800000, _color: '#22c55e' },
        { name: 'Papier', daysLeft: 6, nextDate: now + 518400000, _color: '#3b82f6' },
    ]),
    'demo.raeume': JSON.stringify([
        { Raum: 'Wohnzimmer', Temperatur: '21.5 °C', Luftfeuchte: '48 %' },
        { Raum: 'Küche', Temperatur: '23.1 °C', Luftfeuchte: '52 %' },
        { Raum: 'Schlafzimmer', Temperatur: '19.8 °C', Luftfeuchte: '45 %' },
        { Raum: 'Bad', Temperatur: '24.0 °C', Luftfeuchte: '61 %' },
    ]),
    ...alarmStates(),
    ...evccStates(),
    ...adapterStates,
};

// ── run ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function ready() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
}

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(() => localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })));

async function seed(theme) {
    await page.evaluate(
        ({ LAYOUT, MOCK, theme, GROUP_DEFS, OBJECT_VIEW, SEND_TO }) => {
            const s = window.__auraShot;
            s.setTheme(theme);
            s.enableHistory(true);
            s.mockObjectView(OBJECT_VIEW);
            s.mockSendTo(SEND_TO);
            s.groupDefs(GROUP_DEFS);
            s.mock(MOCK);
            s.seed({ layouts: [LAYOUT], activeLayoutId: 'dash-demo' });
        },
        { LAYOUT, MOCK, theme, GROUP_DEFS, OBJECT_VIEW, SEND_TO },
    );
    await page.waitForTimeout(900);
}

async function showTab(slug) {
    await page.evaluate((slug) => {
        window.location.hash = slug ? `#/tab/${slug}` : '#/';
    }, slug);
    await page.waitForTimeout(900);
    await page.evaluate((MOCK) => window.__auraShot.mock(MOCK), MOCK);
    await page.waitForTimeout(900);
}

// The dashboard scrolls inside an inner container (body never grows), so a
// fullPage screenshot only captures the viewport. Size the viewport to each
// tab's content height up front so everything is visible without scrolling.
function tabHeight(t) {
    const maxBottom = Math.max(...t.widgets.map((wg) => wg.gridPos.y + wg.gridPos.h));
    const rowPx = SETTINGS.gridRowHeight + SETTINGS.gridGap;
    return Math.min(3400, Math.max(640, 150 + maxBottom * rowPx + 48));
}

await seed('light');
for (const t of TABS) {
    await page.setViewportSize({ width: 1680, height: tabHeight(t) });
    await showTab(t.slug);
    await page.screenshot({ path: `${OUT}/dash-${t.slug}.png` });
    console.log('✓', `dash-${t.slug}.png`);
}
await page.setViewportSize({ width: 1680, height: tabHeight(TABS[0]) });
await seed('dark');
await showTab('uebersicht');
await page.screenshot({ path: `${OUT}/dash-overview-dark.png` });
console.log('✓', 'dash-overview-dark.png');

await browser.close();
console.log('done');
