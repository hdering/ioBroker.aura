#!/usr/bin/env node
/**
 * Measures how much height a widget's content actually needs.
 *
 *   node tools/schema/measure-widget-metrics.mjs            (dev server on 5174)
 *   AURA_BASE=http://localhost:5174 node tools/schema/measure-widget-metrics.mjs
 *   … --only list,value    measure a few types while working on the table
 *   … --only list --write  measure those types and MERGE them into the committed
 *                          JSON — everything else keeps its numbers. A full run
 *                          takes the best part of an hour, so re-measuring 29
 *                          types to change one is not the way to fix one type.
 *   … --check              fail when the committed JSON is stale
 *
 * Output: public/ai/aura-widget-metrics.json, served to a model by aura_measure.
 *
 * Why measure rather than estimate: sizing a widget is the one thing a model
 * cannot check for itself. It writes gridPos.h in rows, the browser renders px,
 * and the result — a list cut off after nine of sixteen rows, a gauge squeezed
 * into an ellipse — is invisible in the JSON. Doing the arithmetic by hand
 * ("h*20 + (h-1)*8 — do sixteen rows fit in h=14?") is exactly what goes wrong.
 *
 * How: the real app renders the widget through the __auraShot harness on a grid
 * with 2 px rows (and normal 20 px columns, so the width stays realistic), and
 * the height is walked down until the content no longer fits. "Fits" means two
 * things at once — nothing scrolls inside the widget, and nothing is drawn
 * outside its card. The second is what catches the tiles: they do not scroll,
 * they simply spill over the edge.
 *
 * The walk goes DOWNWARD from a height that fits, never as a binary search: a
 * chart at 30 px renders no axis at all and would report "fits", and a search
 * would happily return that.
 *
 * Everything runs against injected demo state with screenshotMode on, so no
 * ioBroker state is ever written. The frontend does not need a reachable ioBroker
 * to render — it boots "Getrennt" and the harness feeds it — but index.html loads
 * /socket.io/socket.io.js as a blocking script, so a dev proxy whose target hangs
 * (unreachable host, not a refused port) never lets the page start at all.
 *
 * Everything is measured TWICE, at font scale 1 and at 1.3, because a measured
 * height is only a fact for the presentation it was measured in. Reported from a
 * running dashboard: with `fontScale` 1.3 and `widgetPadding` 8 every list came
 * out wrong — 14 px too much chrome and 4.8 px too little per row, which cancel
 * at three rows and diverge in both directions from there. The padding is exact
 * arithmetic (it sits twice in the chrome, so aura_measure corrects it without a
 * second measurement); the font scale is not, so it is measured.
 *
 * The second point also says WHICH KIND of row a display draws. A contact chip is
 * a text line: its +4 px stays +4 px at every scale. A shutter row is a control of
 * a fixed 43 px: its +10 px at scale 1 shrinks as the text grows and is gone once
 * the text is taller. `addPx` and `fontScalePx` carry that difference.
 *
 * A full run takes its time (every point walks down from 800 px, the list is
 * measured per layout AND per row display, and all of it twice) — half an hour is
 * normal. Use `--only list` while working on one type.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_FILE = path.join(ROOT, 'public/ai/aura-widget-metrics.json');
const SCHEMA_FILE = path.join(ROOT, 'public/ai/aura-widget-schema.json');

/** 2 px rows for resolution, 20 px columns so the width is a real widget width. */
const PROBE_GRID = { gridRowHeight: 2, gridSnapX: 20, gridGap: 0 };
const PX_PER_ROW = PROBE_GRID.gridRowHeight;
/** 800 px: taller than any widget on a dashboard, the starting point that fits. */
const TOP_ROWS = 400;
const COARSE = 10; // 20 px steps on the way down
/**
 * A FRESH widget id for every render, not one reused id.
 *
 * React keys a widget by its id, so re-showing the same one keeps the component
 * mounted — and a mounted widget only sees a new injected value through its live
 * subscription. Measuring against a dev server without a reachable ioBroker there
 * is none, so `mock()` reached nobody and every count of the jsontable rendered
 * the value of the FIRST one: 140 px + 0 px per row instead of 86 + 27. A new id
 * remounts, and a fresh mount reads the injected value out of the cache.
 */
let widSeq = 0;
const TOL = 2; // px — sub-pixel layout noise and 1px borders

/**
 * The presentation every number below is measured at, and the second font scale
 * the growth is measured against.
 *
 * 1.3 rather than something larger: it is a scale people actually run (the report
 * that started this came from one), and the model is exact at both measured
 * points, so the value that matters most is the one that is not interpolated.
 */
const REFERENCE = { fontScale: 1, widgetPaddingPx: 16 };
const SCALE_HIGH = 1.3;
const SCALE_SPAN = SCALE_HIGH - REFERENCE.fontScale;
/** Below this a slope is the 2 px walk-down resolution divided by the span, not an effect. */
const SLOPE_TOL = PX_PER_ROW / SCALE_SPAN;
const r1 = (x) => Math.round(x * 10) / 10;

const DP = 'demo.value';
const DP_BOOL = 'demo.switch';
const DP_DIM = 'demo.dim';
const DP_JSON = 'demo.json';
const DP_TIME = 'demo.time';
const DP_STATE = 'demo.state';
/** A datapoint with a fabricated HISTORY behind it, for the chart types. */
const DP_HIST = 'demo.hist';
const DP_TEXT = 'demo.text';

const MOCK = {
    [DP]: { val: 21.5, unit: '°C' },
    [DP_BOOL]: true,
    [DP_DIM]: { val: 60, unit: '%' },
    // Fixed rather than Date.now(), so a re-run measures the same row.
    [DP_TIME]: 1767225600000,
    [DP_STATE]: 1,
    [DP_HIST]: { val: 1500, unit: 'W' },
    [DP_TEXT]: 'Mein Titel',
};

/** history.0: the instance the chart types name, fabricated by the shot harness. */
const HISTORY_INSTANCE = 'history.0';

/**
 * How much drawing surface a chart needs to be worth putting on a dashboard.
 *
 * Not a cliff the walk-down can find — this is the one measurement where the
 * "does anything get cut off" question has no useful answer. eCharts and recharts
 * both paint into whatever box they are given: at 132 px of card the plot area is
 * 59 px, the curve is a stripe, the y labels collide, and NOTHING overflows. So
 * `usablePx` is the height at which the plot surface first reaches this many
 * pixels — a stated recommendation, and the one number to change if it turns out
 * too generous or too mean. 140 px is about five label bands; below it a value
 * cannot be read off the chart at all, which is the only reason to draw one.
 */
const MIN_PLOT_PX = 140;

/** Presets, so the button row and the select field render at all. */
const PRESETS = [
    { value: 0, label: 'Aus' },
    { value: 50, label: 'Halb' },
    { value: 100, label: 'Voll' },
];
/** A three-state mapping — the window handle the "states" display is made for. */
const STATES = [
    { value: 0, label: 'Zu' },
    { value: 1, label: 'Gekippt' },
    { value: 2, label: 'Offen' },
];

/**
 * The displays a list row can be drawn with, each on a datapoint that display
 * makes sense on — a slider measured on a boolean is not a row anybody has.
 *
 * Why every single one: the row height is NOT one number. A contact or a state
 * mapping draws a chip that is taller than a value row, a date picker or a select
 * field taller still, so a list of contacts was sized as one of values —
 * reported from the field as "44 px Luft" for a list that scrolls. The labels are
 * the ones the editor shows (TYPE_OPTIONS in EntryControlsConfig.tsx).
 */
const ROW_TYPES = [
    { key: 'switch', label: 'Schalter', dp: DP_BOOL },
    { key: 'slider', label: 'Schieberegler', dp: DP_DIM },
    { key: 'value', label: 'Wert', dp: DP },
    { key: 'time', label: 'Datum/Zeit', dp: DP_TIME },
    { key: 'datepicker', label: 'Datumswähler', dp: DP_TIME },
    { key: 'shutter', label: 'Rollladen', dp: DP_DIM },
    { key: 'stepper', label: '+/−', dp: DP_DIM },
    { key: 'buttons', label: 'Tasten', dp: DP_DIM, entry: { presets: PRESETS } },
    { key: 'momentary', label: 'Taster', dp: DP_BOOL },
    { key: 'states', label: 'Wertzuordnung', dp: DP_STATE, entry: { states: STATES } },
    { key: 'contact', label: 'Fenster-/Türkontakt', dp: DP_BOOL },
    { key: 'input', label: 'Eingabefeld', dp: DP },
    { key: 'select', label: 'Auswahlfeld', dp: DP_DIM, entry: { presets: PRESETS } },
];

/**
 * `rt` is a ROW_TYPES entry; without one the rows are the default (display "auto").
 *
 * Every row shares one datapoint, so one mocked value feeds them all. That is
 * only safe because ListWidget keys its rows by id AND index — while it keyed
 * them by the id alone, a change of display left the previous rows in the DOM and
 * every measurement after the first was nonsense.
 */
const listEntries = (n, rt) => {
    return Array.from({ length: n }, (_, i) => ({
        id: rt?.dp ?? DP,
        name: `Gerät ${i + 1}`,
        ...(rt ? { displayType: rt.key, ...(rt.entry ?? {}) } : {}),
    }));
};

/**
 * `n` entries of which `d` are separators, sitting strictly BETWEEN content rows.
 *
 * A separator cannot be measured the way a display is: a list of nothing but
 * separators renders the empty state, so the probe keeps the entry COUNT and
 * turns some of them into separators. The placement matters — a leading or
 * trailing separator, and two in a row, are dropped as an empty section, and a
 * dropped row silently falsifies the delta (measured: it made a −16 px row look
 * like −20.5 px).
 */
const listWithDividers = (n, d, heading) => {
    const out = [];
    let seps = 0;
    while (out.length < n) {
        out.push({ id: DP, name: `Gerät ${out.length + 1}` });
        // `n - 2`, so a separator is never the last entry.
        if (seps < d && out.length < n - 1) {
            seps++;
            out.push({
                id: `sep${seps}`,
                divider: true,
                name: `Abschnitt ${seps}`,
                // The heading is `dividerLabel` — `name` is not read at all, which
                // is exactly how the first measurement came to describe a bare
                // rule while every dashboard uses the titled one.
                ...(heading ? { dividerLabel: `Abschnitt ${seps}` } : {}),
            });
        }
    }
    return out;
};
const chipItems = (n) => Array.from({ length: n }, (_, i) => ({ id: DP_BOOL, label: `Chip ${i + 1}` }));
/** `n` weitere Raumklima-Werte, alle im Raster — die Zeilen, die sie kosten (#698). */
const climateMetrics = (n) =>
    Array.from({ length: n }, (_, i) => ({
        id: `m${i + 1}`,
        source: 'datapoint',
        datapoint: DP,
        label: `Wert ${i + 1}`,
        icon: 'Wind',
        unit: 'ppm',
        decimals: 0,
        slot: 'grid',
    }));
/** `n` energy bars, two entries each — the shape a real balance sheet has. */
const energyBars = (n) =>
    Array.from({ length: n }, (_, i) => ({
        id: `b${i + 1}`,
        title: `Bereich ${i + 1}`,
        totalValue: 3000,
        entries: [
            { id: `b${i + 1}e1`, datapointId: DP_HIST, label: 'Haushalt', unit: 'W' },
            { id: `b${i + 1}e2`, datapointId: DP_DIM, label: 'Wärmepumpe', unit: 'W' },
        ],
    }));
const jsonRows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ Name: `Zeile ${i + 1}`, Wert: i })));

/**
 * The forecast the weather widget would fetch, as a fixed answer.
 *
 * Measured against the real open-meteo endpoint the numbers would depend on the
 * network and on the weather (a day with no rain draws no rain line). Eight days
 * because the widget asks for forecastDays + 1, capped at 8, and fixed dates so
 * a re-run measures the same rows.
 */
const WEATHER_JSON = {
    current: {
        temperature_2m: 21.5,
        relative_humidity_2m: 62,
        weather_code: 3,
        wind_speed_10m: 12.4,
        apparent_temperature: 20.8,
        cloud_cover: 75,
        precipitation: 0.2,
    },
    daily: {
        time: Array.from({ length: 8 }, (_, i) => `2026-03-${String(2 + i).padStart(2, '0')}`),
        weather_code: [3, 61, 80, 1, 2, 63, 71, 0],
        temperature_2m_max: [18.4, 15.2, 17.8, 21.3, 22.6, 16.9, 12.4, 19.1],
        temperature_2m_min: [7.2, 6.8, 8.1, 9.4, 10.2, 7.7, 2.3, 6.5],
        precipitation_probability_max: [10, 80, 65, 5, 0, 70, 45, 0],
        precipitation_sum: [0.2, 6.4, 3.1, 0, 0, 4.8, 2.2, 0],
    },
};

/**
 * `n` window contacts the status overview will discover, all of them open.
 *
 * Its rows come from the datapoint cache, not from the options — so the probe
 * seeds twelve of them once (`ensureDatapointCache` holds its result for five
 * minutes, so a second seeding would not be read) and the ROW COUNT is varied
 * with `maxRows`, which is exactly how a dashboard makes this widget plannable.
 * One category only: the default layout draws a heading per category with rows
 * in it, and two categories would put an extra heading into the per-row slope.
 */
const CONTACT_COUNT = 12;
const contactId = (i) => `hm-rpc.0.CONTACT${String(i).padStart(4, '0')}.1.STATE`;
const contactRows = () =>
    Array.from({ length: CONTACT_COUNT }, (_, i) => ({
        id: contactId(i),
        value: {
            _id: contactId(i),
            type: 'state',
            common: { name: `Fenster ${i + 1}`, type: 'boolean', role: 'sensor.window', read: true, write: false },
            native: {},
        },
    }));
const contactStates = () => Object.fromEntries(Array.from({ length: CONTACT_COUNT }, (_, i) => [contactId(i), true]));
// Into the base mock, not only into the seeding step: every render replaces the
// server-state map, and a status overview whose values are missing from it sits
// in its loading state for ever (which the walk-down would measure as a height).
Object.assign(MOCK, contactStates());

/**
 * Types whose content is countable from the configuration, so the height can be
 * given as base + per item. Everything else gets a minimum height only — a
 * status overview or a calendar discovers its content at runtime and cannot be
 * sized from here.
 */
const COUNTED = [
    {
        // Die weiteren Werte des Raumklima-Widgets stehen in einem Raster unter den
        // Hauptwerten (#698) — jeder kostet eine Zeile. Gemessen mit einer Spalte,
        // weil das die Zeile ist; mehrere Spalten packen mehrere Werte hinein und
        // aura_measure teilt die Zahl selbst durch metricColumns.
        type: 'climate',
        item: 'Zusatzwert-Zeile',
        counts: [0, 2, 4, 6],
        build: (n) => ({ options: { metricColumns: 1, metrics: climateMetrics(n) } }),
        notIncluded: [
            'gezählt werden nur die Werte mit slot "grid" (die Vorgabe). Ohne metricColumns brechen sie um — ' +
                'die Rechnung nimmt dann eine Zeile je Wert an und liegt eher zu hoch als zu niedrig',
            'Werte mit slot "secondary" stapeln sich in der rechten Spalte, slot "primary" steht neben der ' +
                'Temperatur — beide sind hier nicht mitgezählt',
            'das Verlaufsdiagramm (showChart mit historyInstance) füllt den Rest der Karte und braucht ' +
                'zusätzliche Höhe',
        ],
    },
    {
        type: 'list',
        item: 'Zeile',
        counts: [2, 4, 8, 16],
        build: (n) => ({ options: { entries: listEntries(n) } }),
        // A list row is not one shape. Measured with default options only, the
        // number was the same for a plain row and one with a second line under
        // it, and the same for every layout — a list built at the reported
        // "minimum" then scrolled on the real dashboard.
        //
        // `variants` are re-measurements (a layout changes the whole row);
        // `modifiers` are deltas measured one at a time against the default and
        // added up by aura_measure. Two counts are enough for a straight line.
        //
        // A modifier whose `when` reads `entries[].…` is a PER-ROW factor: it is
        // measured with every row carrying it (that is the honest way to get the
        // delta), but aura_measure then counts it over the rows that actually
        // have it. Reported from use: subDps was charged for all twelve rows of a
        // list where four had a second line, 123 px too much.
        variantCounts: [2, 8],
        variants: [
            // `rowTypes` re-measures the row displays for that layout. The badges
            // layout draws a row as one pill and handles the displays itself, so a
            // per-display surcharge measured on a default row means nothing there.
            { key: 'card', layout: 'card', label: 'Layout "card"', rowTypes: true },
            // Two columns: the height is a staircase in PAIRS, not in rows.
            // Measured row by row (1→96, 2→96, 3→124, 4→124 … 9→214 px), and the
            // straight line through the even counts the fit uses is therefore
            // half a pair short on every ODD one — nine rows came back 199 px
            // instead of 214. `columns` is what lets aura_measure round the item
            // count up to a full row before it multiplies.
            { key: 'compact', layout: 'compact', label: 'Layout "compact"', rowTypes: true, columns: 2 },
            { key: 'minimal', layout: 'minimal', label: 'Layout "minimal"' },
        ],
        rowTypes: ROW_TYPES,
        rowTypeBuild: (n, rt) => ({ options: { entries: listEntries(n, rt) } }),
        // A separator IS a row — it just is not a content row. Measured at a fixed
        // row count with half of them replaced, because a separator has no line of
        // its own to fit: see listWithDividers.
        dividerRow: {
            // Eight entries, three separators: enough to divide the difference by
            // and few enough that the card layout (64.7 px a row) still fits in the
            // 800 px probe. The placement rule may fit fewer than asked for, and
            // the delta is divided by what was actually built.
            rows: 8,
            dividers: 3,
            // Two shapes, because they are two different rows: the bare rule is
            // padding around a hairline, the titled one carries a line of text and
            // costs nearly a whole content row. Dashboards use the titled one.
            shapes: [
                {
                    key: 'divider',
                    label: 'Trennzeile',
                    build: (n, d) => ({ options: { entries: listWithDividers(n, d) } }),
                },
                {
                    key: 'dividerHeading',
                    label: 'Trennzeile mit Überschrift',
                    build: (n, d) => ({ options: { entries: listWithDividers(n, d, true) } }),
                },
            ],
        },
        modifiers: [
            {
                key: 'subDps',
                label: 'zweite Zeile je Eintrag (subDps)',
                when: { path: 'entries[].subDps', nonEmpty: true },
                // The minimal layout draws a row as a single pill and ignores
                // subDps entirely — adding the delta there would be a lie.
                notForVariants: ['minimal'],
                perVariant: true,
                build: (n) => ({
                    options: {
                        entries: listEntries(n).map((e) => ({ ...e, subDps: [{ id: DP, label: 'Zusatz' }] })),
                    },
                }),
            },
            {
                key: 'lastChangePerEntry',
                label: 'Zeitstempel je Eintrag (entries[].showLastChange)',
                when: { path: 'entries[].showLastChange', equals: true },
                // Measured per layout. One number for all of them was wrong in
                // three of the four: default +13.5, card +21.5, compact +6.0 and
                // minimal ±0 px a row — the pill puts the timestamp in the row it
                // already has. Reported from the field as exactly that ±0, while
                // the answer charged 13.7 px a row for a line nothing draws.
                perVariant: true,
                // Per ROW: the condition speaks about an entry, so aura_measure
                // counts the entries that carry it (isPerRowWhen in measure.js).
                build: (n) => ({
                    options: { entries: listEntries(n).map((e) => ({ ...e, showLastChange: true })) },
                }),
            },
            {
                key: 'lastChangeList',
                label: 'Zeitstempel je Zeile (showEntryLastChange)',
                when: { path: 'showEntryLastChange', equals: true },
                perVariant: true,
                // The STATIC list does not read this switch (measured: no
                // timestamp appears), and it is not in its schema either. Without
                // this guard the same payload would be charged 12 × 13.7 px for a
                // line the widget never draws.
                notForTypes: ['list'],
                // The dynamic list's list-wide switch, and there it is every row.
                // It cannot be probed on the dynamic list (its rows appear at
                // runtime) and the STATIC list ignores it — so the number comes
                // from the same rendering, driven per entry. Same line, same
                // markup, same height.
                build: (n) => ({
                    options: { entries: listEntries(n).map((e) => ({ ...e, showLastChange: true })) },
                }),
            },
            {
                // ListWidget renders its header when showTitle OR showIcon OR a
                // sum OR the group switch is on — so ONLY switching both off
                // removes the row. Turning off just the title keeps it (the icon
                // holds it open), which is why that is measured too: a zero is an
                // answer.
                key: 'noHeader',
                label: 'ohne Kopfzeile (showTitle und showIcon aus)',
                when: {
                    all: [
                        { path: 'showTitle', equals: false },
                        { path: 'showIcon', equals: false },
                        { path: 'showSum', not: true },
                        { path: 'groupSwitch', not: true },
                    ],
                },
                build: (n) => ({ options: { entries: listEntries(n), showTitle: false, showIcon: false } }),
            },
            {
                key: 'noTitle',
                label: 'nur der Titel aus (showTitle: false, Icon bleibt)',
                when: {
                    all: [
                        { path: 'showTitle', equals: false },
                        { path: 'showIcon', not: false },
                    ],
                },
                build: (n) => ({ options: { entries: listEntries(n), showTitle: false } }),
            },
            {
                key: 'groupSwitch',
                label: 'Gruppenschalter in der Kopfzeile (groupSwitch)',
                when: { path: 'groupSwitch', equals: true },
                build: (n) => ({ options: { entries: listEntries(n), groupSwitch: true } }),
            },
            {
                key: 'showSum',
                label: 'Summe/Statistik (showSum)',
                when: { path: 'showSum', equals: true },
                build: (n) => ({ options: { entries: listEntries(n), showSum: true, sumStats: ['sum'] } }),
            },
        ],
        // Measured factors are named above; these are the ones that are not, and
        // saying so is the point — the answer used to read as if it covered them.
        notIncluded: [
            'Darstellung „Auto“ folgt der Rolle des Datenpunkts — gemessen ist die Wert-Zeile',
            'Filterzeile mit sichtbaren Filtern und Suchfeld',
            'Raum-Überschriften (groupByRoom) und der Raum je Zeile (showRoom): beide brauchen die ' +
                'Raum-Aufzählungen aus ioBroker, die es beim Messen nicht gibt. Aus dem Betrieb gemeldet: mit ' +
                'showRoom wird die Zeile deutlich höher (statt einer Zeile Text stehen zwei da) — dafür ' +
                'reichlich Reserve geben',
            'Trennzeilen im Layout „compact“: sie unterbrechen zusätzlich den zweispaltigen Fluss, der ' +
                'gemessene Aufschlag ist ein Mittelwert',
            'eine Trennzeile ganz oben ist 8 px niedriger als eine zwischen zwei Zeilen (gemessen wird die ' +
                'zwischen zwei Zeilen)',
            'umbrochene Beschriftungen (wrapText) und mehrzeilige Titel',
            'mehr als ein subDp je Eintrag',
        ],
    },
    {
        type: 'jsontable',
        item: 'Tabellenzeile',
        counts: [2, 4, 8],
        datapoint: DP_JSON,
        mock: (n) => ({ [DP_JSON]: jsonRows(n) }),
        build: () => ({ options: {} }),
    },
    {
        // Reported from use: weather was classed as "fills — überlaufen kann
        // nichts" and at h=7 with four forecast days its content is 191 px in a
        // 188 px card, i.e. it scrolls. It is not a fills type at all: it draws
        // a header plus one row per forecast day, and `forecastDays` is in the
        // configuration — so the height is countable, like a list's.
        type: 'weather',
        item: 'Vorhersagetag',
        counts: [2, 4, 6],
        build: (n) => ({ options: { forecastDays: n } }),
        variantCounts: [2, 6],
        variants: [{ key: 'card', layout: 'card', label: 'Layout "card"' }],
        // „compact“ and „minimal“ draw the CURRENT conditions on one line and no
        // forecast at all (measured: identical at two and at six days), and they
        // scale that line into whatever box they get. Counting days for them
        // would be a made-up number, and letting them fall back to the default
        // layout's line — which is what an unmeasured layout does — would be
        // worse: 92 px + 17 px a day for a widget that draws one line.
        freeLayouts: ['compact', 'minimal', 'custom'],
        modifiers: [
            {
                key: 'noForecast',
                label: 'ohne Vorhersage (showForecast: false)',
                when: { path: 'showForecast', equals: false },
                build: (n) => ({ options: { forecastDays: n, showForecast: false } }),
            },
            {
                key: 'noHeader',
                label: 'ohne Kopfzeile (showTitle und showIcon aus)',
                when: {
                    all: [
                        { path: 'showTitle', equals: false },
                        { path: 'showIcon', equals: false },
                    ],
                },
                build: (n) => ({ options: { forecastDays: n, showTitle: false, showIcon: false } }),
            },
            {
                key: 'rainAmount',
                label: 'Regenmenge je Tag (showRainAmount)',
                when: { path: 'showRainAmount', equals: true },
                build: (n) => ({ options: { forecastDays: n, showRainAmount: true } }),
            },
        ],
        // Options that do not shift the number by a measurable delta but REPLACE
        // the typography the number was measured with. A widget that sets one is
        // reported with the measurement AND with the fact that it no longer
        // holds — which is the whole point: the answer used to say "passt" for a
        // configuration it had never measured (see notIncluded below).
        voids: [
            { path: 'tempFontSize', label: 'tempFontSize (Größe der Temperaturzeile)' },
            { path: 'fontScale', label: 'options.fontScale (eigener Schriftfaktor des Widgets)' },
            { path: 'forecastRowGap', label: 'forecastRowGap (Abstand der Vorhersagezeilen)' },
            { path: 'showWarnings', label: 'showWarnings (Unwetterwarnungen, beliebig lang)' },
            { path: 'forecastWrap', label: 'forecastWrap (Vorhersage umbrechen statt stapeln)' },
        ],
        notIncluded: [
            'die eigene Typografie des Widgets: tempFontSize, options.fontScale und forecastRowGap gehen ' +
                'unmittelbar in die Höhe ein und sind hier NICHT enthalten (gemessen mit den Standardwerten). ' +
                'Aus dem Betrieb gemeldet: tempFontSize 1.5, fontScale 0.95 und forecastRowGap 0.4 brauchten ' +
                '191 px, wo die Standarddarstellung passt — mit diesen Optionen die Höhe mit aura_rendered ' +
                'im Browser prüfen',
            'Unwetterwarnungen (showWarnings): sie kommen vom DWD, sind beliebig lang und scrollen in ihrem ' +
                'eigenen Bereich',
            'Layout „custom“ zeichnet, was customGrid beschreibt',
            'ein Ort mit langem Namen bricht um und macht die Kopfzeile höher',
        ],
    },
    {
        // Its rows appear at runtime, so this type could not be sized at all —
        // and the maxRows option describes itself as the answer to exactly that
        // ("with a cap the height is known"), while aura_measure still said "not
        // measured". With the cap the row count IS known, so it is countable.
        type: 'statusoverview',
        item: 'Zeile',
        counts: [2, 4, 8],
        // One category, the cap for the row count, and no "+N weitere" line:
        // aura_measure adds that one itself (out.moreRow), so measuring it in
        // would charge it twice.
        build: (n) => ({
            options: {
                maxRows: n,
                showMore: false,
                catBattery: false,
                catLight: false,
                catUnreach: false,
                catAlarm: false,
            },
        }),
        variantCounts: [2, 8],
        variants: [
            { key: 'compact', layout: 'compact', label: 'Layout "compact"' },
            { key: 'card', layout: 'card', label: 'Layout "card"' },
            { key: 'minimal', layout: 'minimal', label: 'Layout "minimal"' },
        ],
        // „count“ draws the alert count and nothing else — no rows, so no slope.
        freeLayouts: ['count'],
        modifiers: [
            {
                key: 'noCount',
                label: 'ohne Zähler-Chip (showCount: false)',
                when: { path: 'showCount', equals: false },
                build: (n) => ({
                    options: {
                        maxRows: n,
                        showMore: false,
                        showCount: false,
                        catBattery: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                    },
                }),
            },
            {
                key: 'noTitle',
                label: 'ohne Titelzeile (showTitle: false)',
                when: { path: 'showTitle', equals: false },
                build: (n) => ({
                    options: {
                        maxRows: n,
                        showMore: false,
                        showTitle: false,
                        catBattery: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                    },
                }),
            },
        ],
        voids: [
            { path: 'showOkCategories', label: 'showOkCategories (Überschrift auch für leere Kategorien)' },
            { path: 'namePattern', label: 'namePattern (die Zeilenbeschriftung kann umbrechen)' },
        ],
        notIncluded: [
            'gemessen mit Zeilen EINER Kategorie: im Layout „default“ zeichnet jede Kategorie, die Zeilen ' +
                'hat, eine Überschrift dazu (und showOkCategories auch die leeren) — je weitere Kategorie ' +
                'eine Zeile mehr',
            'die Zeilen selbst stammen aus der Erkennung: ein langer Gerätename bricht um und macht seine ' +
                'Zeile höher (namePattern/nameFilters kürzen ihn)',
            'die Layouts „card“ und „minimal“ ordnen Kacheln bzw. Pillen nach der BREITE an — gemessen an ' +
                'der Standardbreite (siehe atWidthPx). Auf einer breiteren Karte stehen mehrere in einer ' +
                'Zeile und die Höhe je Zeile sinkt entsprechend',
            'ohne maxRows ist die Zeilenzahl unbekannt — dann ist diese Rechnung keine Auskunft über die Höhe',
        ],
    },
];

/** Datapoint per type where the default demo value would not do. */
const DP_FOR = {
    switch: DP_BOOL,
    dimmer: DP_DIM,
    slider: DP_DIM,
    knob: DP_DIM,
    thermostat: DP_DIM,
    shutter: DP_DIM,
    light: DP_DIM,
    binarysensor: DP_BOOL,
    windowcontact: DP_BOOL,
    stateimage: DP_BOOL,
    jsontable: DP_JSON,
    // The simple chart reads the widget's own datapoint; the fabricated history
    // is generated per id, so it needs the id that has one.
    chart: DP_HIST,
};

/**
 * Options a type needs before it renders anything at all.
 *
 * Getting one of these wrong does not fail — it measures the EMPTY state and
 * reports it as the type's minimum height. Four types were doing exactly that:
 *
 *   chips        the option is `chips`, not `items` — measured as an empty row
 *                (44 px), and the answer for a real chip row was 44 px too small
 *   chart        no historyInstance, so it drew "Keine Daten" (52 px, i.e. the
 *                bare card) instead of a curve
 *   echart       no echartMode and no series instance — same, 52 px
 *   mediaplayer  had no options at all and sat in SKIP with "content follows the
 *                player's datapoints", which is true of every widget here
 *
 * A minimum is only a fact for a widget with content in it, so every entry below
 * has to be checked against what the widget actually reads. CONTENT (further
 * down) is the guard that stops this happening again: it names, per type, the
 * element that has to BE there for a height to count as fitting.
 */
const OPTIONS_FOR = {
    enum: { entries: [{ value: 1, label: 'Eins' }] },
    // No adapter behind the harness: the widget shows the configured duration
    // (15:00) in its waiting state, with the control row it draws by default.
    countdown: { durationSec: 900 },
    list: { entries: listEntries(4) },
    chips: { chips: chipItems(4) },
    carousel: { items: chipItems(4) },
    chart: { historyInstance: HISTORY_INSTANCE, historyRange: '24h', decimals: 1, unit: 'W' },
    echart: {
        echartMode: 'timeseries',
        // echarts drives its entrance animation off the wall clock, and the walk
        // reads the height a frame or two after the mount — a growing bar would
        // measure as a short one.
        echartJsonExtra: '{"animation":false}',
        echartSeries: [
            {
                id: 's1',
                name: 'Leistung',
                datapointId: DP_HIST,
                chartType: 'line',
                historyInstance: HISTORY_INSTANCE,
                yAxisIndex: 0,
            },
        ],
    },
    mediaplayer: {
        titleDp: DP_TEXT,
        artistDp: DP_TEXT,
        playStateDp: DP_BOOL,
        volumeDp: DP_DIM,
        playDp: DP_BOOL,
        pauseDp: DP_BOOL,
        nextDp: DP_BOOL,
        prevDp: DP_BOOL,
    },
    energiebilanz: { bars: energyBars(1) },
    // The minimum of a status overview is the card with rows in it, not the
    // all-clear: the probe seeds twelve contacts, so without a cap it would
    // measure all twelve. Four, the same shape a fresh widget has on a
    // dashboard with a handful of open windows.
    statusoverview: {
        maxRows: 4,
        showMore: false,
        catBattery: false,
        catLight: false,
        catUnreach: false,
        catAlarm: false,
    },
};

/**
 * What a measured MINIMUM does not cover, per type — the same field the counted
 * types carry, so aura_measure prints it the same way.
 *
 * The list below is what the measurement actually ran into, not caution:
 * energiebilanz was tried as a counted type first (base + per bar) and the
 * linearity guard threw it out — 1→224, 2→288, 4→306 px, because the bars are
 * laid out to fit the card instead of being stacked. So its number is one
 * configuration's minimum, and the shape of the configuration is what moves it.
 */
const MIN_NOTES = {
    energiebilanz: [
        'gemessen mit EINEM Balken aus zwei Einträgen. Die Balken werden in die Karte eingepasst, nicht ' +
            'gestapelt (gemessen 1→224, 2→288, 4→306 px) — für mehrere Balken die Höhe am Ergebnis prüfen',
        'Zeitbereichs-Umschalter (visibleRanges) und eine umbrechende Legende kommen oben drauf',
    ],
    mediaplayer: [
        'gemessen mit Titel, Interpret, Abspielzustand, Lautstärke und den vier Tasten. Cover, Chips und ' +
            'die Fortschrittsleiste ändern die Höhe',
    ],
    chips: ['gemessen mit vier Chips in einer Reihe. Mehr Chips als in eine Reihe passen brechen um (wrapCols)'],
    weather: [
        'gemessen mit fünf Vorhersagetagen (der Standard). Mit bekanntem forecastDays rechnet aura_measure ' +
            'genau: siehe counted.weather',
    ],
    statusoverview: [
        'gemessen mit vier Zeilen EINER Kategorie (maxRows 4). Die Zeilen dieses Widgets entstehen erst zur ' +
            'Laufzeit — mit maxRows steht die Zeilenzahl fest und aura_measure rechnet genau: siehe ' +
            'counted.statusoverview',
    ],
    datepicker: [
        'gemessen mit der Standard-Schriftgröße der Eingabefelder (fontSize leer = 12 px). Eine größere ' +
            'fontSize macht die Felder höher — die Höhe dann am Ergebnis prüfen',
    ],
    carousel: ['gemessen mit vier Einträgen. Das Karussell rollt waagerecht, die Höhe hängt nicht an der Anzahl'],
};

/**
 * Layouts of a MINIMUM type that have to be measured on their own, and by which
 * criterion.
 *
 * A minimum is measured once per type, in that type's default layout — which is
 * right for a type whose layouts only move things around, and wrong for one whose
 * layout changes what the frame draws. Reported from use on the section title:
 * aura_measure answered "braucht 28 px, Minimum h=2" for every header, including
 * `framed` — and a framed header at h=2 renders without an error, with its title
 * sitting in the card's border. Usable is h=3.
 *
 * `hard` and `usable` name the extra criterion for each of the two walks (see
 * requiredPx). `usableWhy` and `hardWhy` are the two sentences aura_measure prints
 * for the pair, because "the plot surface reaches 140 px" is not the reason here.
 *
 * Only layouts that need it: the other three header styles are the bare header
 * without a card, all within 2 px of the number the type already carries.
 */
const MIN_VARIANTS = {
    header: [
        {
            layout: 'framed',
            // Without `box` this walk has no floor at all: the framed card stops
            // shrinking at its content (measured 32 px) and grows out of its grid cell
            // instead, so "nothing is cut off" stays true down to one row.
            hard: 'box',
            usable: 'pad',
            usableWhy: 'ab hier steht der Titel mit dem vollen Innenabstand in der Karte',
            hardWhy:
                'darunter rückt der Titel in den Rand der Karte, und ab der harten Grenze wächst die Karte ' +
                'über ihre Rasterhöhe hinaus',
        },
    ],
};

/**
 * An OPTION that changes a minimum, measured as a delta against the type's own
 * number — the counterpart of MIN_VARIANTS for something that is not a layout.
 *
 * A minimum is measured once, in the default configuration, and that used to be
 * the end of it: an option that adds a row was simply not in the number. The
 * slider's scale is exactly that case — it draws a second row under the track,
 * and aura_measure answered every slider with the 64 px of a bare one.
 *
 * A delta rather than a second absolute number, so it composes: it adds to the
 * type's minimum and to a layout variant alike, the way the counted modifiers
 * do. `when` is evaluated by aura_measure against the widget's options; `options`
 * is what the probe here renders with.
 */
/**
 * Header items on the second header row (issue #676) take a row of their own, in the
 * widget's title area or in the frame's strip — for every type, so the modifier is
 * common rather than listed per type. Measured with one plain text item on r2-left.
 */
const HEADER_ROW2_ITEM = { id: 'm-r2', source: 'text', text: 'Zweite Zeile', slot: 'r2-left' };
const HEADER_ROW2_MODIFIER = {
    key: 'headerRow2',
    label: 'zweite Kopfzeile (headerItems auf r2-*)',
    when: { path: 'headerItems[].slot', startsWith: 'r2-' },
};

const MIN_MODIFIERS = {
    // The Auswahlfeld's dropdown sets the height of the row it sits in (#679), so
    // a bigger control raises the whole widget's minimum. Two entries rather than
    // one because the option has three steps and `sm` is the measured baseline.
    enum: [
        {
            key: 'selectSize=md',
            label: 'Auswahlfeld mittel (selectSize md)',
            when: { path: 'selectSize', equals: 'md' },
            options: { selectSize: 'md' },
        },
        {
            key: 'selectSize=lg',
            label: 'Auswahlfeld groß (selectSize lg)',
            when: { path: 'selectSize', equals: 'lg' },
            options: { selectSize: 'lg' },
        },
    ],
    slider: [
        {
            key: 'showScale',
            label: 'Skala unter der Spur (showScale)',
            // The condition aura_measure evaluates against the widget's options,
            // in the same language the counted modifiers use.
            when: { path: 'showScale', equals: true },
            // What the probe is rendered with to measure the delta.
            options: { showScale: true },
        },
    ],
    // The volume presets (25/50/75/100 %) are part of the measured baseline;
    // switching them off takes their row away again (#708) — a negative delta.
    mediaplayer: [
        {
            key: 'showVolumePresets=false',
            label: 'ohne Lautstärke-Schnellwahl (showVolumePresets false)',
            when: { path: 'showVolumePresets', equals: false },
            options: { showVolumePresets: false },
        },
    ],
    // The preset chips are a row of their own under the buttons; without presets
    // the row is not drawn at all, so the baseline is measured without them.
    countdown: [
        {
            key: 'presets',
            label: 'Vorgaben-Chips (presets)',
            when: { path: 'presets', nonEmpty: true },
            options: { presets: [300, 900, 3600] },
        },
    ],
};

/**
 * Types that cannot be sized this way, with the reason kept in the output so the
 * next person does not go looking for the number again.
 */
const SKIP = {
    iframe: 'zeigt eine fremde Seite — die Höhe bestimmt der Inhalt, nicht das Widget',
    camera: 'Videostream, Seitenverhältnis der Kamera',
    image: 'Höhe folgt dem Bild',
    map: 'Karte füllt jede Höhe',
    group: 'Höhe ergibt sich aus den Kindern (groupRows)',
    panels: 'Höhe ergibt sich aus den Kindern',
    universal: 'Höhe ergibt sich aus den Kindern',
    mirror: 'spiegelt ein anderes Widget',
    autolist: 'Zeilen entstehen erst zur Laufzeit aus Raum und Gewerk — wie list rechnen',
    calendar: 'Zeilen entstehen erst zur Laufzeit aus den Terminen',
    messages: 'Zeilen entstehen erst zur Laufzeit',
    adapterlogs: 'Zeilen entstehen erst zur Laufzeit',
    scriptstatus: 'Zeilen entstehen erst zur Laufzeit',
    trash: 'Zeilen entstehen erst zur Laufzeit',
    trashSchedule: 'Zeilen entstehen erst zur Laufzeit',
    evcc: 'Inhalt kommt aus einer evcc-Instanz',
    echartsPreset: 'rendert ein gespeichertes eCharts-Preset',
    timer: 'Zeilen entstehen erst zur Laufzeit',
    alarm: 'Zeilen entstehen erst zur Laufzeit',
    aircontrol: 'Inhalt folgt den Datenpunkten der Klimaanlage',
    loadtimes: 'Zeilen entstehen erst zur Laufzeit',
    menu: 'Höhe folgt den Menüeinträgen des Dashboards',
    html: 'freies HTML',
    adapterstatus: 'Zeilen entstehen erst zur Laufzeit',
};

/**
 * What has to BE in the card for a height to count as fitting, per type.
 *
 * The overflow test below cannot see a widget that draws less instead of
 * spilling, and the chart types do exactly that: recharts stops drawing the
 * curve entirely below roughly 150 px of card and reports no overflow at all, so
 * the walk-down happily returned 52 px — the bare card, with "Keine Daten" in it
 * (the probe had no history behind its datapoint either, so it never drew a curve
 * at any height). A missing series IS content loss, so it belongs in the hard
 * minimum, not in a footnote.
 *
 * `plot` names the drawing surface whose HEIGHT decides whether a chart is worth
 * looking at — see MIN_PLOT_PX and the usable minimum.
 */
const CONTENT = {
    chart: { need: '.recharts-line, .recharts-area, .recharts-bar', what: 'die Kurve', plot: '.recharts-surface' },
    echart: { plot: '[_echarts_instance_]' },
    chips: { need: '.aura-chip, button', what: 'die Chips' },
};

/**
 * Does the content fit in the card?
 *
 * Three questions in one: does anything scroll (a list with a scrollbar), does
 * anything reach past the card's own box (a tile whose number spills over the
 * edge — it does not scroll, it just sticks out, which is why an overflow check
 * alone reported that a gauge fits in 20 px), and is the content the type is
 * supposed to draw actually THERE (CONTENT above).
 *
 * `plotPx` and `padInPx` are reported alongside rather than judged here: a canvas
 * never overflows and a card whose content sits in its own padding does not
 * either, so those are second walks with their own criteria (`plot`, `pad`).
 * `height` is the card as the browser drew it, which is not always the height it
 * was given — see the `box` criterion.
 */
const FITS = ({ id, need, plot }) => {
    const root = document.querySelector(`.aura-widget-${id}`);
    if (!root) {
        return { error: 'not rendered' };
    }
    const rb = root.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const padTop = parseFloat(rootStyle.paddingTop) || 0;
    const padBottom = parseFloat(rootStyle.paddingBottom) || 0;
    let out = 0;
    let scroll = 0;
    let into = 0;
    for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.height) {
            out = Math.max(out, b.bottom - rb.bottom, rb.top - b.top);
            // How far the content reaches INTO the card's own padding. Zero while
            // the padding is intact, and that is the whole criterion.
            into = Math.max(into, rb.top + padTop - b.top, b.bottom - (rb.bottom - padBottom));
        }
        if (getComputedStyle(el).overflowY !== 'visible') {
            scroll = Math.max(scroll, el.scrollHeight - el.clientHeight);
        }
    }
    const plotEl = plot ? root.querySelector(plot) : null;
    return {
        over: Math.round(Math.max(out, scroll)),
        height: Math.round(rb.height),
        missing: !!need && !root.querySelector(need),
        plotPx: plotEl ? Math.round(plotEl.getBoundingClientRect().height) : null,
        padInPx: Math.round(Math.max(0, into)),
    };
};

const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg
    ? new Set((onlyArg.split('=')[1] || process.argv[process.argv.indexOf(onlyArg) + 1] || '').split(','))
    : null;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The weather widget fetches its forecast from open-meteo. Answered from the
// fixture above instead: over the real endpoint the row heights would depend on
// the network and on the actual weather.
await ctx.route(/api\.open-meteo\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEATHER_JSON) }),
);
// The DWD warnings are off by default; a probe that turns them on must not reach
// out either.
await ctx.route(/warnungen|dwd/i, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => {
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    // Without this the chart types have no history behind their datapoints and
    // draw "Keine Daten" at EVERY height — which the walk-down then reported as
    // the type's minimum (52 px, the bare card).
    window.__auraShot.enableHistory(true);
});
// Datapoints for the types that discover their rows instead of reading them out
// of the options (the status overview). Seeded once: the datapoint cache holds
// its result for five minutes, so this has to be in place before the first such
// widget renders — and the row count is varied with maxRows, not with the seed.
await page.evaluate(
    ({ rows, states }) => {
        window.__auraShot.mockObjectView({ state: rows, channel: [], device: [], enum: [], instance: [] });
        window.__auraShot.mock(states);
        window.__auraShot.mockServerState(states);
    },
    { rows: contactRows(), states: contactStates() },
);

async function render(type, { rows, cols, datapoint, options, mock, layout, fontScale }) {
    const wid = `m${++widSeq}`;
    const cfg = {
        id: wid,
        type,
        title: 'Messung',
        datapoint: datapoint ?? DP_FOR[type] ?? (schema.widgets[type].addMode === 'free' ? '' : DP),
        gridPos: { x: 0, y: 0, w: cols, h: rows },
        options: options ?? OPTIONS_FOR[type] ?? {},
        ...(layout ? { layout } : {}),
    };
    await page.evaluate(
        ({ cfg, grid, mock }) => {
            window.__auraShot.mock(mock);
            // What the SERVER holds too: a fresh mount asks getState, and without
            // this it falls through to a socket that may not be there.
            window.__auraShot.mockServerState(mock);
            window.__auraShot.showWidgets([cfg], { editMode: false, ...grid });
        },
        {
            cfg,
            grid: { ...PROBE_GRID, fontScale: fontScale ?? REFERENCE.fontScale },
            mock: { ...MOCK, ...(mock || {}) },
        },
    );
    // Two identical readings instead of a guessed timeout: fonts, charts and the
    // grid settle over a frame or two.
    const content = CONTENT[type] || {};
    let last = null;
    let prev = '';
    for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(60);
        last = await page.evaluate(FITS, { id: wid, need: content.need, plot: content.plot });
        const key = JSON.stringify(last);
        // "Two identical readings" is settled enough for layout — but not for a
        // chart, which fetches its history after the mount. The first two
        // readings of a perfectly tall chart are both "no curve yet", identical,
        // and the walk read that as "the content is missing at 800 px" and gave
        // up on the whole type. While something the type must draw is still
        // absent, keep polling to the end of the loop.
        if (key === prev && !last.missing) {
            break;
        }
        prev = key;
    }
    return last;
}

/**
 * Walk down from a height that fits and return the last one that still does.
 *
 * Three criteria can be added to the "nothing is cut off" one, because there are
 * three ways for a card to stop being right without cutting anything off:
 *
 *   plot  the drawing surface has to reach MIN_PLOT_PX — the chart types paint
 *         into any box and never cut anything off at all
 *   box   the card has to still BE the height it was given. A framed header
 *         stops shrinking at its content and grows out of its grid cell instead,
 *         over whatever sits below it: nothing is cut off, and nothing is right
 *   pad   nothing may reach into the card's own padding. That is not a cliff but
 *         a stated criterion — the card below it draws its content into its
 *         border, which is the "technically fine, looks squeezed" range
 */
async function requiredPx(type, setup) {
    const { plot, box, pad } = setup || {};
    // The ceiling is raised rather than reported as "does not fit": a row that
    // grows with the font scale can push a tall layout past 800 px, and eight
    // card rows at scale 1.3 do exactly that (measured: 67 px over). Doubling
    // only costs the walk that needs it.
    // A height "fits" only when nothing is cut off AND the content the type is
    // supposed to draw is present. The three optional criteria above are checked
    // against the height the card was ASKED for, which is why `ok` takes it.
    const ok = (m, rows) =>
        m.over <= TOL &&
        !m.missing &&
        (!plot || (m.plotPx ?? 0) >= MIN_PLOT_PX) &&
        (!box || m.height - rows * PX_PER_ROW <= TOL) &&
        (!pad || (m.padInPx ?? 0) <= TOL);

    let start = TOP_ROWS;
    let top = await render(type, { ...setup, rows: start });
    while (!top.error && !ok(top, start) && start < TOP_ROWS * 4) {
        start *= 2;
        top = await render(type, { ...setup, rows: start });
    }
    if (top.error) {
        return { error: top.error };
    }
    if (!ok(top, start)) {
        return {
            error:
                `passt selbst in ${start * PX_PER_ROW} px nicht ` +
                `(${top.over} px darüber${top.missing ? ', Inhalt fehlt' : ''}` +
                `${plot ? `, Zeichenfläche ${top.plotPx} px` : ''}` +
                `${box ? `, Karte ${top.height} px hoch` : ''}` +
                `${pad ? `, ${top.padInPx} px im Innenabstand` : ''})`,
        };
    }
    let good = start;
    let rows = start - COARSE;
    while (rows >= 1) {
        const m = await render(type, { ...setup, rows });
        if (m.error || !ok(m, rows)) {
            break;
        }
        good = rows;
        rows -= COARSE;
    }
    // Refine the last coarse step one row at a time.
    for (let r = good - 1; r >= 1 && r > good - COARSE; r--) {
        const m = await render(type, { ...setup, rows: r });
        if (m.error || !ok(m, r)) {
            break;
        }
        good = r;
    }
    return { px: good * PX_PER_ROW };
}

/**
 * The row height per display, as the DIFFERENCE to this layout's default row.
 *
 * A delta rather than an absolute number so aura_measure can apply it per ROW: a
 * list of four values and four contacts is neither four value rows nor four
 * contact rows, and that is exactly the list whose height was wrong.
 *
 * Below one pixel a difference is fit noise over the measured span, not a factor
 * anybody can plan a row height with — reported as the zero it is.
 */
async function rowTypeDeltas(spec, { cols, counts, layout, ref, refHigh }) {
    const out = {};
    for (const rt of spec.rowTypes) {
        const build = (n) => spec.rowTypeBuild(n, rt);
        const lo = await line(spec, { cols, counts, layout, build });
        const hi = await line(spec, { cols, counts, layout, build, fontScale: SCALE_HIGH });
        if (lo.error || hi.error) {
            console.warn(`  skip ${spec.type}/${layout ?? 'default'}:${rt.key}: ${lo.error || hi.error}`);
            continue;
        }
        out[rt.key] = { label: rt.label, ...rowKind(lo.perItemPx, hi.perItemPx, ref.perItemPx, refHigh.perItemPx) };
    }
    const shown = Object.entries(out)
        .filter(([, v]) => v.perItemPx || v.addPx)
        .map(([k, v]) => `${k} ${v.perItemPx > 0 ? '+' : ''}${v.perItemPx}${v.fontScalePx ? '' : ' (fest)'}`);
    console.log(
        `  ${`Zeilen (${layout ?? 'default'})`.padEnd(14)} ${shown.length ? shown.join(', ') : 'alle wie die Wert-Zeile'}`,
    );
    return out;
}

/**
 * One modifier as the DIFFERENCE to a reference line, ready to store.
 *
 * Pulled out of the main loop because the variants need exactly the same
 * arithmetic against THEIR line: a factor that changes the row changes it
 * differently per layout, and one number for all of them was wrong in three of
 * the list's four (the timestamp per entry: default +13.5, card +21.5, compact
 * +6.0, minimal ±0 px a row).
 */
function modifierDelta(m, { r, rHigh, ref, refHigh }) {
    // The probe grid resolves to 2 px, so a delta that small is noise from the
    // fit rather than a factor. Reported as the zero it is.
    const denoise = (d) => (Math.abs(d) <= PX_PER_ROW ? 0 : d);
    // A modifier can change how the widget REACTS to the scale, not only how
    // tall it is: switching the header off takes the line that grows with it
    // away. Stored as the difference of the two slopes, denoised on the same
    // 2 px the walk-down resolves — divided by the span, so it takes a real
    // effect to survive.
    const slope = (a, b) => denoiseSlope((a - b) / SCALE_SPAN);
    const fontScalePx = {
        basePx: slope(rHigh.basePx - r.basePx, refHigh.basePx - ref.basePx),
        perItemPx: slope(rHigh.perItemPx - r.perItemPx, refHigh.perItemPx - ref.perItemPx),
    };
    return {
        key: m.key,
        label: m.label,
        when: m.when,
        ...(m.notForVariants ? { notForVariants: m.notForVariants } : {}),
        ...(m.notForTypes ? { notForTypes: m.notForTypes } : {}),
        basePx: denoise(r.basePx - ref.basePx),
        perItemPx: denoise(Math.round((r.perItemPx - ref.perItemPx) * 10) / 10),
        ...(fontScalePx.basePx || fontScalePx.perItemPx ? { fontScalePx } : {}),
    };
}

/** A slope small enough to be the walk-down's own resolution is reported as zero. */
function denoiseSlope(px) {
    return Math.abs(px) < SLOPE_TOL ? 0 : r1(px);
}

/** What one step of the font scale is worth for a measured line, in px. */
function scaleOf(lo, hi) {
    return {
        basePx: denoiseSlope((hi.basePx - lo.basePx) / SCALE_SPAN),
        perItemPx: r1((hi.perItemPx - lo.perItemPx) / SCALE_SPAN),
    };
}

/**
 * What kind of row this is, from the same row measured at two font scales.
 *
 * A row is either text or a control. A contact chip is text with a little
 * padding: its +4 px over the value row is +4 px at every scale. A shutter row is
 * a control 43 px tall: its +10 px at scale 1 shrinks as the text grows and is
 * gone the moment the text is taller than the control. Told apart by whether the
 * surcharge SHRANK between the two measurements, and written so that
 * aura_measure's one formula covers both:
 *
 *   surcharge(f) = max(perItemPx + (fontScalePx − Zeilensteigung) × (f − 1), addPx)
 *
 * Exact at both measured scales either way.
 */
function rowKind(rowLo, rowHi, baseLo, baseHi) {
    const addLo = r1(rowLo - baseLo);
    const addHi = r1(rowHi - baseHi);
    // Below a pixel over the measured span it is fit noise, not a row height
    // anybody can plan with — reported as the zero it is (as it always was).
    const quiet = (d) => (Math.abs(d) < 1 ? 0 : d);
    if (addHi < addLo - 0.5) {
        // A control of a fixed height: it does not follow the text at all, and
        // `addPx` is what is left of it once the text has caught up.
        return { perItemPx: quiet(addLo), addPx: addHi, fontScalePx: 0 };
    }
    return { perItemPx: quiet(addLo), addPx: quiet(addLo), fontScalePx: r1((rowHi - rowLo) / SCALE_SPAN) };
}

/**
 * What a separator row costs against a content row, per layout.
 *
 * Not a line fit: `rows` stays the same and `dividers` of those rows become
 * separators, so the difference to the plain probe at that count divided by the
 * number of separators IS the delta. A list of only separators renders the empty
 * state and two in a row are dropped as an empty section — neither can be fitted.
 *
 * Reported from use: aura_measure counted a separator as a full content row while
 * its own footnote claimed separators were "not included", which reads as "add
 * space for each of them". Both halves were wrong.
 */
async function dividerDeltas(spec, { cols, layout, base, baseHigh }) {
    const { rows, dividers, shapes } = spec.dividerRow;
    const out = {};
    for (const shape of shapes) {
        const payload = shape.build(rows, dividers);
        // Counted from what was BUILT, not from what was asked for: the placement
        // rule can fit fewer separators than requested, and dividing by the request
        // would falsify the delta the same way the dropped row did.
        const n = (payload.options.entries || []).filter((e) => e && e.divider).length;
        if (!n) {
            continue;
        }
        const at = async (fontScale) => {
            const plain = await requiredPx(spec.type, { cols, layout, fontScale, ...spec.build(rows) });
            const mixed = await requiredPx(spec.type, { cols, layout, fontScale, ...payload });
            return plain.error || mixed.error
                ? { error: plain.error || mixed.error }
                : { d: (mixed.px - plain.px) / n };
        };
        const lo = await at(REFERENCE.fontScale);
        const hi = await at(SCALE_HIGH);
        if (lo.error || hi.error) {
            console.warn(`  skip ${spec.type}/${layout ?? 'default'}:${shape.key}: ${lo.error || hi.error}`);
            continue;
        }
        // A separator is a row like any other — measured as a delta, so its
        // absolute height is the layout's row plus that delta at the same scale.
        const kind = rowKind(base.perItemPx + lo.d, baseHigh.perItemPx + hi.d, base.perItemPx, baseHigh.perItemPx);
        out[shape.key] = { label: shape.label, ...kind };
        console.log(
            `  ${`${shape.key} (${layout ?? 'default'})`.padEnd(24)} ${r1(lo.d)} px/Zeile bei Skalierung ` +
                `${REFERENCE.fontScale}, ${r1(hi.d)} px bei ${SCALE_HIGH} ⇒ ` +
                `${r1(base.perItemPx + lo.d)} px hohe Zeile${kind.fontScalePx ? '' : ', feste Höhe'}`,
        );
    }
    return Object.keys(out).length ? out : null;
}

const wanted = (type) => !only || only.has(type);
const results = {};
const counted = {};

/**
 * One straight line through the measured points: base + per item.
 *
 * Two counts are the minimum, four give the same slope and catch a row that is
 * not linear at all.
 */
async function line(spec, { cols, counts, build, layout, fontScale }) {
    const points = [];
    for (const n of counts) {
        const r = await requiredPx(spec.type, {
            cols,
            datapoint: spec.datapoint,
            layout,
            fontScale,
            ...build(n),
            mock: spec.mock ? spec.mock(n) : undefined,
        });
        if (r.error) {
            return { error: r.error };
        }
        points.push({ n, px: r.px });
    }
    const first = points[0];
    const last = points[points.length - 1];
    const perItem = (last.px - first.px) / (last.n - first.n);
    const basePx = Math.round(first.px - perItem * first.n);
    // How far the points in BETWEEN are from the line through the outer two.
    // The comment above used to claim four counts "catch a row that is not
    // linear at all" — nothing actually checked, and energiebilanz walked
    // straight through it: 1→224, 2→288, 4→306 px, because its bars are laid out
    // to fit the card instead of being stacked. The fit through 1 and 4 reported
    // 27.3 px a bar, which is wrong at every measured point except those two.
    let off = 0;
    for (const p of points) {
        off = Math.max(off, Math.abs(p.px - (basePx + perItem * p.n)));
    }
    return {
        basePx,
        perItemPx: Math.round(perItem * 10) / 10,
        offLinePx: Math.round(off),
        measured: points,
    };
}

/**
 * How far off the straight line a counted type may be before "base + per item"
 * is the wrong shape for it.
 *
 * Two probe rows of resolution plus a pixel of layout noise. Above that the type
 * does not stack its content, and a linear model of it is not an approximation —
 * it is a different widget.
 */
const LINEAR_TOL = 3 * PX_PER_ROW;

// The second header row applies to the counted types as well: their header is the
// list's own, row 2 sits inside it (ListWidget / AutoListWidget).
for (const spec of COUNTED) {
    spec.modifiers = [
        ...(spec.modifiers ?? []),
        {
            ...HEADER_ROW2_MODIFIER,
            build: (n, d) => {
                const base = spec.build(n, d);
                return { ...base, options: { ...(base.options ?? {}), headerItems: [HEADER_ROW2_ITEM] } };
            },
        },
    ];
}

for (const spec of COUNTED) {
    if (!wanted(spec.type)) {
        continue;
    }
    const cols = schema.widgets[spec.type].defaultSize.w;
    const base = await line(spec, { cols, counts: spec.counts, build: spec.build });
    const baseHigh = await line(spec, { cols, counts: spec.counts, build: spec.build, fontScale: SCALE_HIGH });
    if (base.error || baseHigh.error) {
        console.warn(`skip ${spec.type} (gezählt): ${base.error || baseHigh.error}`);
        continue;
    }
    // Not a straight line: the type does not stack its content, so no per-item
    // number describes it. It keeps its measured MINIMUM (the loop below) — a
    // number that is right for one configuration beats a slope that is wrong for
    // every count but two.
    if (base.offLinePx > LINEAR_TOL) {
        console.warn(
            `skip ${spec.type} (gezählt): nicht linear — ${base.measured.map((p) => `${p.n}→${p.px}px`).join(' ')} ` +
                `liegt bis zu ${base.offLinePx} px neben der Gerade (${base.basePx} px + ${base.perItemPx} px/${spec.item})`,
        );
        continue;
    }
    const entry = {
        item: spec.item,
        basePx: base.basePx,
        perItemPx: base.perItemPx,
        ...(base.offLinePx ? { offLinePx: base.offLinePx } : {}),
        fontScalePx: scaleOf(base, baseHigh),
        atWidthPx: cols * PROBE_GRID.gridSnapX,
        measured: base.measured,
    };
    console.log(
        `${spec.type.padEnd(16)} ${base.measured.map((p) => `${p.n}→${p.px}px`).join('  ')}   → ` +
            `${entry.basePx} px + ${entry.perItemPx} px/${spec.item} ` +
            `(je Schriftskalierung +${entry.fontScalePx.basePx}/+${entry.fontScalePx.perItemPx} px)`,
    );

    const counts = spec.variantCounts ?? spec.counts;
    for (const v of spec.variants ?? []) {
        const build = v.build ?? spec.build;
        const r = await line(spec, { cols, counts, build, layout: v.layout });
        const rHigh = await line(spec, { cols, counts, build, layout: v.layout, fontScale: SCALE_HIGH });
        if (r.error || rHigh.error) {
            console.warn(`  skip ${spec.type}/${v.key}: ${r.error || rHigh.error}`);
            continue;
        }
        entry.variants = entry.variants ?? {};
        entry.variants[v.key] = {
            label: v.label,
            basePx: r.basePx,
            perItemPx: r.perItemPx,
            ...(v.columns ? { columns: v.columns } : {}),
            fontScalePx: scaleOf(r, rHigh),
            measured: r.measured,
        };
        console.log(`  ${v.key.padEnd(14)} ${r.basePx} px + ${r.perItemPx} px/${spec.item}`);
        // The displays are measured against THIS layout's own row — a card row is
        // twice a default one, so the same chip is not worth the same delta in it.
        if (v.rowTypes && (spec.rowTypes ?? []).length) {
            entry.variants[v.key].rowTypes = await rowTypeDeltas(spec, {
                cols,
                counts,
                layout: v.layout,
                ref: r,
                refHigh: rHigh,
            });
        }
        if (spec.dividerRow) {
            const d = await dividerDeltas(spec, { cols, layout: v.layout, base: r, baseHigh: rHigh });
            if (d) {
                entry.variants[v.key].rowTypes = { ...(entry.variants[v.key].rowTypes || {}), ...d };
            }
        }
        // Modifiers that change the ROW have to be measured against THIS layout's
        // row. One number for all of them was wrong in three of the list's four:
        // the timestamp per entry is +13.5 px a row by default, +21.5 in "card",
        // +6.0 in "compact" and ±0 in "minimal", where the pill puts it in the row
        // it already has. Reported from the field as exactly that ±0, against an
        // answer that charged 13.7 px a row for a line nothing draws.
        //
        // Only the modifiers that opt in (`perVariant`) are re-measured — the
        // header ones (title, icon, group switch, sum) sit above the rows and are
        // the same in every layout, and every extra one costs four walk-downs.
        for (const m of (spec.modifiers ?? []).filter((x) => x.perVariant)) {
            if ((m.notForVariants || []).includes(v.key)) {
                continue;
            }
            const mr = await line(spec, { cols, counts, build: m.build, layout: v.layout });
            const mrHigh = await line(spec, { cols, counts, build: m.build, layout: v.layout, fontScale: SCALE_HIGH });
            if (mr.error || mrHigh.error) {
                console.warn(`  skip ${spec.type}/${v.key}/${m.key}: ${mr.error || mrHigh.error}`);
                continue;
            }
            const delta = modifierDelta(m, { r: mr, rHigh: mrHigh, ref: r, refHigh: rHigh });
            entry.variants[v.key].modifiers = entry.variants[v.key].modifiers ?? [];
            entry.variants[v.key].modifiers.push(delta);
            console.log(
                `  ${`${m.key} (${v.key})`.padEnd(24)} ${delta.basePx >= 0 ? '+' : ''}${delta.basePx} px Basis, ` +
                    `${delta.perItemPx >= 0 ? '+' : ''}${delta.perItemPx} px/${spec.item}`,
            );
        }
    }

    // A modifier is stored as the DIFFERENCE to the default, so aura_measure can
    // add up the ones a widget actually has. Measured one at a time: what two of
    // them do together is an approximation, and the answer says so.
    //
    // The reference is the default at the SAME counts, or the two lines would
    // differ by the noise between four measured points and two. The row displays
    // below are deltas against the same line.
    const needRef = (spec.modifiers ?? []).length || (spec.rowTypes ?? []).length;
    const ref = needRef ? await line(spec, { cols, counts, build: spec.build }) : null;
    const refHigh = needRef ? await line(spec, { cols, counts, build: spec.build, fontScale: SCALE_HIGH }) : null;
    for (const m of spec.modifiers ?? []) {
        if (ref.error || refHigh.error) {
            console.warn(`  skip ${spec.type} modifiers: ${ref.error || refHigh.error}`);
            break;
        }
        const r = await line(spec, { cols, counts, build: m.build });
        const rHigh = await line(spec, { cols, counts, build: m.build, fontScale: SCALE_HIGH });
        if (r.error || rHigh.error) {
            console.warn(`  skip ${spec.type}/${m.key}: ${r.error || rHigh.error}`);
            continue;
        }
        entry.modifiers = entry.modifiers ?? [];
        entry.modifiers.push(modifierDelta(m, { r, rHigh, ref, refHigh }));
        const d = entry.modifiers[entry.modifiers.length - 1];
        console.log(
            `  ${m.key.padEnd(14)} ${d.basePx >= 0 ? '+' : ''}${d.basePx} px Basis, ` +
                `${d.perItemPx >= 0 ? '+' : ''}${d.perItemPx} px/${spec.item}`,
        );
    }
    if ((spec.rowTypes ?? []).length) {
        if (ref.error || refHigh.error) {
            console.warn(`  skip ${spec.type} Zeilendarstellungen: ${ref.error || refHigh.error}`);
        } else {
            entry.rowTypes = await rowTypeDeltas(spec, { cols, counts, ref, refHigh });
        }
    }
    if (spec.dividerRow) {
        const d = await dividerDeltas(spec, { cols, base, baseHigh });
        if (d) {
            entry.rowTypes = { ...(entry.rowTypes || {}), ...d };
        }
    }
    if (spec.notIncluded) {
        entry.notIncluded = spec.notIncluded;
    }
    if (spec.voids) {
        entry.voids = spec.voids;
    }
    if (spec.freeLayouts) {
        entry.freeLayouts = spec.freeLayouts;
    }
    counted[spec.type] = entry;
}

for (const type of Object.keys(schema.widgets)) {
    if (!wanted(type) || SKIP[type]) {
        continue;
    }
    const cols = schema.widgets[type].defaultSize.w;
    const r = await requiredPx(type, { cols });
    const rHigh = await requiredPx(type, { cols, fontScale: SCALE_HIGH });
    if (r.error || rHigh.error) {
        console.warn(`skip ${type}: ${r.error || rHigh.error}`);
        continue;
    }
    const rowsAt20 = Math.ceil((r.px + 10) / 30); // rows at the default grid (20 px + 10 px gap)
    // A minimum grows with the font scale too — a value tile is one big number.
    const fontScalePx = denoiseSlope((rHigh.px - r.px) / SCALE_SPAN);
    // A second, higher number for the types that draw into a plot area: nothing
    // is ever cut off there, so "the minimum" alone said a chart fits in 132 px
    // and had 80 px to spare, while its drawing surface was 59 px.
    const plotType = !!(CONTENT[type] || {}).plot;
    const usable = plotType ? await requiredPx(type, { cols, plot: true }) : null;
    if (usable && usable.error) {
        console.warn(`  ${type}: keine nutzbare Mindesthöhe (${usable.error})`);
    }
    results[type] = {
        minPx: r.px,
        minRowsDefaultGrid: rowsAt20,
        ...(MIN_NOTES[type] ? { notIncluded: MIN_NOTES[type] } : {}),
        ...(usable && usable.px
            ? { usablePx: usable.px, usableRowsDefaultGrid: Math.ceil((usable.px + 10) / 30) }
            : {}),
        ...(fontScalePx ? { fontScalePx } : {}),
        atWidthPx: cols * PROBE_GRID.gridSnapX,
    };
    console.log(
        `${type.padEnd(16)} min ${String(r.px).padStart(4)} px  (${rowsAt20} Zeilen im Standardraster` +
            `${fontScalePx ? `, +${fontScalePx} px je Schriftskalierung` : ''})` +
            `${usable && usable.px ? `  brauchbar ab ${usable.px} px (${results[type].usableRowsDefaultGrid} Zeilen)` : ''}`,
    );

    // Layouts that change what the FRAME draws, measured on their own (see
    // MIN_VARIANTS). The slope is taken from the walk whose number decides the
    // verdict — the usable one where there is one — because aura_measure applies
    // a single fontScalePx to both numbers of an entry.
    for (const v of MIN_VARIANTS[type] ?? []) {
        const setup = { cols, layout: v.layout, ...(v.hard ? { [v.hard]: true } : {}) };
        const hard = await requiredPx(type, setup);
        const hardHigh = await requiredPx(type, { ...setup, fontScale: SCALE_HIGH });
        if (hard.error || hardHigh.error) {
            console.warn(`  ${type}/${v.layout}: ${hard.error || hardHigh.error}`);
            continue;
        }
        const uSetup = { cols, layout: v.layout, ...(v.usable ? { [v.usable]: true } : {}) };
        const u = v.usable ? await requiredPx(type, uSetup) : null;
        const uHigh = v.usable ? await requiredPx(type, { ...uSetup, fontScale: SCALE_HIGH }) : null;
        if (u && (u.error || uHigh.error)) {
            console.warn(`  ${type}/${v.layout}: keine brauchbare Mindesthöhe (${u.error || uHigh.error})`);
        }
        const usableOk = u && u.px && uHigh && uHigh.px;
        const slope = usableOk
            ? denoiseSlope((uHigh.px - u.px) / SCALE_SPAN)
            : denoiseSlope((hardHigh.px - hard.px) / SCALE_SPAN);
        const entry = {
            minPx: hard.px,
            minRowsDefaultGrid: Math.ceil((hard.px + 10) / 30),
            ...(usableOk
                ? {
                      usablePx: u.px,
                      usableRowsDefaultGrid: Math.ceil((u.px + 10) / 30),
                      usableWhy: v.usableWhy,
                      hardWhy: v.hardWhy,
                  }
                : {}),
            ...(slope ? { fontScalePx: slope } : {}),
        };
        results[type].variants = { ...(results[type].variants || {}), [v.layout]: entry };
        console.log(
            `  Layout "${v.layout}"`.padEnd(18) +
                ` min ${String(hard.px).padStart(4)} px (${entry.minRowsDefaultGrid} Zeilen)` +
                `${usableOk ? `  brauchbar ab ${u.px} px (${entry.usableRowsDefaultGrid} Zeilen)` : ''}` +
                `${slope ? `, +${slope} px je Schriftskalierung` : ''}`,
        );
    }

    // Options that add to the minimum (MIN_MODIFIERS), each measured on its own
    // against the two walks above. Stored as the DELTA, so aura_measure can add
    // it to the type's number or to a layout variant alike.
    for (const mod of [
        ...(MIN_MODIFIERS[type] ?? []),
        { ...HEADER_ROW2_MODIFIER, options: { headerItems: [HEADER_ROW2_ITEM] } },
    ]) {
        const opts = { ...(OPTIONS_FOR[type] ?? {}), ...mod.options };
        const on = await requiredPx(type, { cols, options: opts });
        const onHigh = await requiredPx(type, { cols, options: opts, fontScale: SCALE_HIGH });
        if (on.error || onHigh.error) {
            console.warn(`  ${type}/${mod.key}: ${on.error || onHigh.error}`);
            continue;
        }
        const addPx = on.px - r.px;
        // The extra row grows with the font scale too — its own slope, on top of
        // the type's. Denoised the same way: below a pixel over the measured span
        // it is fit noise, not a factor to plan with.
        const addSlope = denoiseSlope((onHigh.px - on.px) / SCALE_SPAN - fontScalePx);
        results[type].modifiers = [
            ...(results[type].modifiers || []),
            {
                key: mod.key,
                label: mod.label,
                when: mod.when,
                basePx: addPx,
                ...(addSlope ? { fontScalePx: { basePx: addSlope } } : {}),
            },
        ];
        console.log(
            `  Option "${mod.key}"`.padEnd(18) +
                ` ${addPx >= 0 ? '+' : ''}${addPx} px (${on.px} px mit der Option)` +
                `${addSlope ? `, ${addSlope > 0 ? '+' : ''}${addSlope} px je Schriftskalierung` : ''}`,
        );
    }
}

await browser.close();

if (pageErrors.length) {
    console.warn(`Seitenfehler: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
}

const metrics = {
    $meta: {
        name: 'AURA widget height metrics',
        generator: 'tools/schema/measure-widget-metrics.mjs',
        measured: new Date().toISOString().slice(0, 10),
        // What every number below is a fact FOR. aura_measure re-computes them for
        // the dashboard it is asked about: the padding by arithmetic (it sits
        // twice in the chrome), the font scale from the second measured point.
        reference: { fontScale: REFERENCE.fontScale, widgetPaddingPx: REFERENCE.widgetPaddingPx },
        fontScaleMeasuredAt: [REFERENCE.fontScale, SCALE_HIGH],
        // What `minimum.<type>.usablePx` means, and the one number behind it.
        usablePlotPx: MIN_PLOT_PX,
        method:
            `Measured in the real frontend: the height is walked down until the content either scrolls or ` +
            `reaches past the card. ${PX_PER_ROW} px resolution, each type at its default width, ` +
            `at font scale ${REFERENCE.fontScale} and ${SCALE_HIGH} with ${REFERENCE.widgetPaddingPx} px widget padding.`,
        caveats: [
            'Height only. A too-narrow widget truncates its labels instead of spilling and is not covered.',
            'A minimum is measured with default options and one line of title. A filter row, a statistics line or a second title line add to it.',
            'minimum.<type>.modifiers are the options of a MINIMUM type that were measured anyway, as a delta on minPx (and on usablePx where there is one): the slider scale draws a row under the track that the default measurement does not have. Each carries the `when` that decides whether it applies to a widget, in the same language as the counted modifiers.',
            'Counted types carry the shapes that do change the height: counted.<type>.variants per layout, counted.<type>.modifiers as deltas per option, counted.<type>.rowTypes as the surcharge per row display, counted.<type>.notIncluded for what is still left out.',
            'A row display (rowTypes) is a delta on ONE row, measured per layout: a contact or a state chip is taller than the measured value row, and a list that mixes displays is summed row by row.',
            'Modifiers are measured one at a time. Several at once are added up, which is an approximation, not a measurement of that combination.',
            'A variant with counted.<type>.variants.<v>.columns draws its rows in that many columns, so its height grows per ROW OF COLUMNS: aura_measure rounds the item count up to a full row before multiplying. The per-row surcharges are still counted per item, which is an approximation for a mixed list.',
            'counted.<type>.variants.<v>.modifiers overrides the top-level modifier of the same key for that layout: a factor that changes the ROW changes it differently per layout (the timestamp per entry is +13.5 px a row by default, +21.5 in "card", +6.0 in "compact" and ±0 in "minimal"). A key a variant does not list keeps the top-level number.',
            'A minimum is the point where content starts to be lost, not a recommended size — defaultSize is that.',
            'minimum.<type>.variants.<layout> re-measures a layout that changes what the FRAME draws, and wins over the type-level numbers for a widget in that layout: a header in "framed" sits in a card, every other header style is bare. A layout that is not listed keeps the number of the type.',
            'minimum.<type>.usablePx is not always the plot criterion. Where the entry carries usableWhy, that sentence is the criterion it was measured against — for a framed header, the height at which the title stops sitting in the padding of the card. Both are recommendations; minPx stays the cliff.',
            `A chart never loses content: eCharts and recharts paint into whatever box they get, so "nothing is cut off" is satisfied long before the chart is readable. Those types therefore carry a second number, minimum.<type>.usablePx — the height at which the plot surface first reaches ${MIN_PLOT_PX} px. That is a stated recommendation, not a measured cliff; everything else here is a cliff.`,
            'Every type is measured WITH content in it (OPTIONS_FOR). A type measured empty reports the height of its empty state, which is what chips, chart and echart used to do.',
            'counted.<type>.voids names the options that do not shift the height by a delta but replace the typography the number was measured with (weather: tempFontSize, fontScale, forecastRowGap). A widget that sets one keeps the number as an order of magnitude, and aura_measure says the verdict is not a verdict — the browser (aura_rendered) is the only answer there.',
            "counted.<type>.freeLayouts lists the layouts of a counted type whose height does NOT follow the item count: they draw a summary and scale it into any box (weather compact/minimal, the status overview's count). aura_measure reports those as [fills] instead of applying the default layout's line to them.",
            'Every number is measured at font scale 1 with 16 px widget padding (the reference above). aura_measure corrects for the dashboard it is asked about: the padding exactly (2 px of chrome per px of padding), the font scale from fontScalePx/addPx, which is exact at the two measured scales and an interpolation between and beyond them.',
        ],
    },
    grid: { note: 'rows × rowHeight + (rows − 1) × gap = px. Row height and gap come from aura_dashboard.' },
    counted,
    minimum: results,
    notMeasurable: Object.fromEntries(Object.entries(SKIP).filter(([type]) => wanted(type))),
};

const json = `${JSON.stringify(metrics, null, 2)}\n`;
if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    const strip = (s) => s.replace(/"measured": "\d{4}-\d\d-\d\d",?/g, '');
    if (strip(current) !== strip(json)) {
        console.error('aura-widget-metrics.json is stale — run: npm run metrics');
        process.exit(1);
    }
    console.log('aura-widget-metrics.json is up to date.');
} else if (only && !process.argv.includes('--write')) {
    console.log('--only: nothing written, this is a working run. Mit --write in die Datei einmischen.');
} else if (only) {
    // A partial run, merged into the committed file. The full run takes the best
    // part of an hour, and re-measuring 29 types to change one is why --only
    // exists in the first place — it just had nowhere to put the result.
    //
    // Merged per TYPE, and only for the types that were asked for: everything
    // else keeps the numbers it has, and nothing measured for a type survives
    // half-way (the whole entry is replaced). `notMeasurable` is filtered by
    // `wanted()` above, so it is merged the same way rather than assigned.
    const current = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : null;
    if (!current) {
        console.error(`${path.relative(ROOT, OUT_FILE)} gibt es nicht — ein voller Lauf muss der erste sein.`);
        process.exit(1);
    }
    const merged = {
        ...current,
        $meta: { ...current.$meta, ...metrics.$meta },
        counted: { ...current.counted, ...counted },
        minimum: { ...current.minimum, ...results },
        notMeasurable: { ...current.notMeasurable, ...metrics.notMeasurable },
    };
    // A type that USED to be unmeasurable and now has a number must lose the
    // other entry, or aura_measure would read the reason instead of the number.
    for (const type of [...Object.keys(counted), ...Object.keys(results)]) {
        delete merged.notMeasurable[type];
    }
    for (const type of Object.keys(metrics.notMeasurable)) {
        delete merged.counted[type];
        delete merged.minimum[type];
    }
    fs.writeFileSync(OUT_FILE, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(
        `${path.relative(ROOT, OUT_FILE)}: ${[...only].join(', ')} eingemischt ` +
            `(${Object.keys(merged.minimum).length} Mindesthöhen, ${Object.keys(merged.counted).length} gezählte Typen). ` +
            'Die übrigen Typen behalten ihre Zahlen.',
    );
} else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, json);
    console.log(
        `${path.relative(ROOT, OUT_FILE).replace(/\\/g, '/')}: ${Object.keys(results).length} Mindesthöhen, ` +
            `${Object.keys(counted).length} gezählte Typen`,
    );
}
