#!/usr/bin/env node
/**
 * Measures how much height a widget's content actually needs.
 *
 *   node tools/schema/measure-widget-metrics.mjs            (dev server on 5174)
 *   AURA_BASE=http://localhost:5174 node tools/schema/measure-widget-metrics.mjs
 *   … --only list,value    measure a few types while working on the table
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

const MOCK = {
    [DP]: { val: 21.5, unit: '°C' },
    [DP_BOOL]: true,
    [DP_DIM]: { val: 60, unit: '%' },
    // Fixed rather than Date.now(), so a re-run measures the same row.
    [DP_TIME]: 1767225600000,
    [DP_STATE]: 1,
};

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
const jsonRows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ Name: `Zeile ${i + 1}`, Wert: i })));

/**
 * Types whose content is countable from the configuration, so the height can be
 * given as base + per item. Everything else gets a minimum height only — a
 * status overview or a calendar discovers its content at runtime and cannot be
 * sized from here.
 */
const COUNTED = [
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
            { key: 'compact', layout: 'compact', label: 'Layout "compact"', rowTypes: true },
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
            'Raum-Überschriften (groupByRoom)',
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
};

/** Options a type needs before it renders anything at all. */
const OPTIONS_FOR = {
    enum: { entries: [{ value: 1, label: 'Eins' }] },
    list: { entries: listEntries(4) },
    chips: { items: chipItems(4) },
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
    statusoverview: 'Zeilen entstehen erst zur Laufzeit',
    calendar: 'Zeilen entstehen erst zur Laufzeit aus den Terminen',
    messages: 'Zeilen entstehen erst zur Laufzeit',
    adapterlogs: 'Zeilen entstehen erst zur Laufzeit',
    scriptstatus: 'Zeilen entstehen erst zur Laufzeit',
    trash: 'Zeilen entstehen erst zur Laufzeit',
    trashSchedule: 'Zeilen entstehen erst zur Laufzeit',
    evcc: 'Inhalt kommt aus einer evcc-Instanz',
    weather: 'Inhalt kommt aus einer Wetter-Instanz',
    echartsPreset: 'rendert ein gespeichertes eCharts-Preset',
    timer: 'Zeilen entstehen erst zur Laufzeit',
    alarm: 'Zeilen entstehen erst zur Laufzeit',
    aircontrol: 'Inhalt folgt den Datenpunkten der Klimaanlage',
    mediaplayer: 'Inhalt folgt den Datenpunkten des Players',
    loadtimes: 'Zeilen entstehen erst zur Laufzeit',
    carousel: 'Inhalt sind andere Widgets',
    menu: 'Höhe folgt den Menüeinträgen des Dashboards',
    html: 'freies HTML',
    energiebilanz: 'Höhe folgt der Konfiguration — Balken oder Ringe, Einträge, Legende',
    adapterstatus: 'Zeilen entstehen erst zur Laufzeit',
};

/**
 * Does the content fit in the card?
 *
 * Two questions in one: does anything scroll (a list with a scrollbar), and does
 * anything reach past the card's own box (a tile whose number spills over the
 * edge — it does not scroll, it just sticks out, which is why an overflow check
 * alone reported that a gauge fits in 20 px).
 */
const FITS = (id) => {
    const root = document.querySelector(`.aura-widget-${id}`);
    if (!root) {
        return { error: 'not rendered' };
    }
    const rb = root.getBoundingClientRect();
    let out = 0;
    let scroll = 0;
    for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.height) {
            out = Math.max(out, b.bottom - rb.bottom, rb.top - b.top);
        }
        if (getComputedStyle(el).overflowY !== 'visible') {
            scroll = Math.max(scroll, el.scrollHeight - el.clientHeight);
        }
    }
    return { over: Math.round(Math.max(out, scroll)), height: Math.round(rb.height) };
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

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
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
    let last = null;
    let prev = '';
    for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(60);
        last = await page.evaluate(FITS, wid);
        const key = JSON.stringify(last);
        if (key === prev) {
            break;
        }
        prev = key;
    }
    return last;
}

/** Walk down from a height that fits and return the last one that still does. */
async function requiredPx(type, setup) {
    // The ceiling is raised rather than reported as "does not fit": a row that
    // grows with the font scale can push a tall layout past 800 px, and eight
    // card rows at scale 1.3 do exactly that (measured: 67 px over). Doubling
    // only costs the walk that needs it.
    let start = TOP_ROWS;
    let top = await render(type, { ...setup, rows: start });
    while (!top.error && top.over > TOL && start < TOP_ROWS * 4) {
        start *= 2;
        top = await render(type, { ...setup, rows: start });
    }
    if (top.error) {
        return { error: top.error };
    }
    if (top.over > TOL) {
        return { error: `passt selbst in ${start * PX_PER_ROW} px nicht (${top.over} px darüber)` };
    }
    let good = start;
    let rows = start - COARSE;
    while (rows >= 1) {
        const m = await render(type, { ...setup, rows });
        if (m.error || m.over > TOL) {
            break;
        }
        good = rows;
        rows -= COARSE;
    }
    // Refine the last coarse step one row at a time.
    for (let r = good - 1; r >= 1 && r > good - COARSE; r--) {
        const m = await render(type, { ...setup, rows: r });
        if (m.error || m.over > TOL) {
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
    return {
        basePx: Math.round(first.px - perItem * first.n),
        perItemPx: Math.round(perItem * 10) / 10,
        measured: points,
    };
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
    const entry = {
        item: spec.item,
        basePx: base.basePx,
        perItemPx: base.perItemPx,
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
        entry.modifiers.push({
            key: m.key,
            label: m.label,
            when: m.when,
            ...(m.notForVariants ? { notForVariants: m.notForVariants } : {}),
            ...(m.notForTypes ? { notForTypes: m.notForTypes } : {}),
            basePx: denoise(r.basePx - ref.basePx),
            perItemPx: denoise(Math.round((r.perItemPx - ref.perItemPx) * 10) / 10),
            ...(fontScalePx.basePx || fontScalePx.perItemPx ? { fontScalePx } : {}),
        });
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
    results[type] = {
        minPx: r.px,
        minRowsDefaultGrid: rowsAt20,
        ...(fontScalePx ? { fontScalePx } : {}),
        atWidthPx: cols * PROBE_GRID.gridSnapX,
    };
    console.log(
        `${type.padEnd(16)} min ${String(r.px).padStart(4)} px  (${rowsAt20} Zeilen im Standardraster` +
            `${fontScalePx ? `, +${fontScalePx} px je Schriftskalierung` : ''})`,
    );
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
        method:
            `Measured in the real frontend: the height is walked down until the content either scrolls or ` +
            `reaches past the card. ${PX_PER_ROW} px resolution, each type at its default width, ` +
            `at font scale ${REFERENCE.fontScale} and ${SCALE_HIGH} with ${REFERENCE.widgetPaddingPx} px widget padding.`,
        caveats: [
            'Height only. A too-narrow widget truncates its labels instead of spilling and is not covered.',
            'A minimum is measured with default options and one line of title. A filter row, a statistics line or a second title line add to it.',
            'Counted types carry the shapes that do change the height: counted.<type>.variants per layout, counted.<type>.modifiers as deltas per option, counted.<type>.rowTypes as the surcharge per row display, counted.<type>.notIncluded for what is still left out.',
            'A row display (rowTypes) is a delta on ONE row, measured per layout: a contact or a state chip is taller than the measured value row, and a list that mixes displays is summed row by row.',
            'Modifiers are measured one at a time. Several at once are added up, which is an approximation, not a measurement of that combination.',
            'A minimum is the point where content starts to be lost, not a recommended size — defaultSize is that.',
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
} else if (only) {
    console.log('--only: nothing written, this is a working run.');
} else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, json);
    console.log(
        `${path.relative(ROOT, OUT_FILE).replace(/\\/g, '/')}: ${Object.keys(results).length} Mindesthöhen, ` +
            `${Object.keys(counted).length} gezählte Typen`,
    );
}
