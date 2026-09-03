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
 * ioBroker state is ever written.
 *
 * A full run takes its time (every point walks down from 800 px, and the list is
 * measured per layout AND per row display) — a quarter of an hour is normal. Use
 * `--only list` while working on one type.
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
const WID = 'm';
const TOL = 2; // px — sub-pixel layout noise and 1px borders

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
const listEntries = (n, rt) =>
    Array.from({ length: n }, (_, i) => ({
        id: rt?.dp ?? DP,
        name: `Gerät ${i + 1}`,
        ...(rt ? { displayType: rt.key, ...(rt.entry ?? {}) } : {}),
    }));
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
            'Raum-Überschriften (groupByRoom) und Trennzeilen (entries[].divider)',
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

async function render(type, { rows, cols, datapoint, options, mock, layout }) {
    const cfg = {
        id: WID,
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
            window.__auraShot.showWidgets([cfg], { editMode: false, ...grid });
        },
        { cfg, grid: PROBE_GRID, mock: { ...MOCK, ...(mock || {}) } },
    );
    // Two identical readings instead of a guessed timeout: fonts, charts and the
    // grid settle over a frame or two.
    let last = null;
    let prev = '';
    for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(60);
        last = await page.evaluate(FITS, WID);
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
    const top = await render(type, { ...setup, rows: TOP_ROWS });
    if (top.error) {
        return { error: top.error };
    }
    if (top.over > TOL) {
        return { error: `passt selbst in ${TOP_ROWS * PX_PER_ROW} px nicht (${top.over} px darüber)` };
    }
    let good = TOP_ROWS;
    let rows = TOP_ROWS - COARSE;
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
async function rowTypeDeltas(spec, { cols, counts, layout, ref }) {
    const out = {};
    for (const rt of spec.rowTypes) {
        const r = await line(spec, { cols, counts, layout, build: (n) => spec.rowTypeBuild(n, rt) });
        if (r.error) {
            console.warn(`  skip ${spec.type}/${layout ?? 'default'}:${rt.key}: ${r.error}`);
            continue;
        }
        const d = Math.round((r.perItemPx - ref.perItemPx) * 10) / 10;
        out[rt.key] = { label: rt.label, perItemPx: Math.abs(d) < 1 ? 0 : d };
    }
    const shown = Object.entries(out)
        .filter(([, v]) => v.perItemPx)
        .map(([k, v]) => `${k} ${v.perItemPx > 0 ? '+' : ''}${v.perItemPx}`);
    console.log(
        `  ${`Zeilen (${layout ?? 'default'})`.padEnd(14)} ${shown.length ? shown.join(', ') : 'alle wie die Wert-Zeile'}`,
    );
    return out;
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
async function line(spec, { cols, counts, build, layout }) {
    const points = [];
    for (const n of counts) {
        const r = await requiredPx(spec.type, {
            cols,
            datapoint: spec.datapoint,
            layout,
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
    if (base.error) {
        console.warn(`skip ${spec.type} (gezählt): ${base.error}`);
        continue;
    }
    const entry = {
        item: spec.item,
        basePx: base.basePx,
        perItemPx: base.perItemPx,
        atWidthPx: cols * PROBE_GRID.gridSnapX,
        measured: base.measured,
    };
    console.log(
        `${spec.type.padEnd(16)} ${base.measured.map((p) => `${p.n}→${p.px}px`).join('  ')}   → ` +
            `${entry.basePx} px + ${entry.perItemPx} px/${spec.item}`,
    );

    const counts = spec.variantCounts ?? spec.counts;
    for (const v of spec.variants ?? []) {
        const r = await line(spec, { cols, counts, build: v.build ?? spec.build, layout: v.layout });
        if (r.error) {
            console.warn(`  skip ${spec.type}/${v.key}: ${r.error}`);
            continue;
        }
        entry.variants = entry.variants ?? {};
        entry.variants[v.key] = { label: v.label, basePx: r.basePx, perItemPx: r.perItemPx, measured: r.measured };
        console.log(`  ${v.key.padEnd(14)} ${r.basePx} px + ${r.perItemPx} px/${spec.item}`);
        // The displays are measured against THIS layout's own row — a card row is
        // twice a default one, so the same chip is not worth the same delta in it.
        if (v.rowTypes && (spec.rowTypes ?? []).length) {
            entry.variants[v.key].rowTypes = await rowTypeDeltas(spec, {
                cols,
                counts,
                layout: v.layout,
                ref: r,
            });
        }
    }

    // A modifier is stored as the DIFFERENCE to the default, so aura_measure can
    // add up the ones a widget actually has. Measured one at a time: what two of
    // them do together is an approximation, and the answer says so.
    //
    // The reference is the default at the SAME counts, or the two lines would
    // differ by the noise between four measured points and two. The row displays
    // below are deltas against the same line.
    const ref =
        (spec.modifiers ?? []).length || (spec.rowTypes ?? []).length
            ? await line(spec, { cols, counts, build: spec.build })
            : null;
    for (const m of spec.modifiers ?? []) {
        if (ref.error) {
            console.warn(`  skip ${spec.type} modifiers: ${ref.error}`);
            break;
        }
        const r = await line(spec, { cols, counts, build: m.build });
        if (r.error) {
            console.warn(`  skip ${spec.type}/${m.key}: ${r.error}`);
            continue;
        }
        entry.modifiers = entry.modifiers ?? [];
        // The probe grid resolves to 2 px, so a delta that small is noise from the
        // fit rather than a factor. Reported as the zero it is.
        const denoise = (d) => (Math.abs(d) <= PX_PER_ROW ? 0 : d);
        entry.modifiers.push({
            key: m.key,
            label: m.label,
            when: m.when,
            ...(m.notForVariants ? { notForVariants: m.notForVariants } : {}),
            basePx: denoise(r.basePx - ref.basePx),
            perItemPx: denoise(Math.round((r.perItemPx - ref.perItemPx) * 10) / 10),
        });
        const d = entry.modifiers[entry.modifiers.length - 1];
        console.log(
            `  ${m.key.padEnd(14)} ${d.basePx >= 0 ? '+' : ''}${d.basePx} px Basis, ` +
                `${d.perItemPx >= 0 ? '+' : ''}${d.perItemPx} px/${spec.item}`,
        );
    }
    if ((spec.rowTypes ?? []).length) {
        if (ref.error) {
            console.warn(`  skip ${spec.type} Zeilendarstellungen: ${ref.error}`);
        } else {
            entry.rowTypes = await rowTypeDeltas(spec, { cols, counts, ref });
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
    if (r.error) {
        console.warn(`skip ${type}: ${r.error}`);
        continue;
    }
    const rowsAt20 = Math.ceil((r.px + 10) / 30); // rows at the default grid (20 px + 10 px gap)
    results[type] = { minPx: r.px, minRowsDefaultGrid: rowsAt20, atWidthPx: cols * PROBE_GRID.gridSnapX };
    console.log(`${type.padEnd(16)} min ${String(r.px).padStart(4)} px  (${rowsAt20} Zeilen im Standardraster)`);
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
        method:
            `Measured in the real frontend: the height is walked down until the content either scrolls or ` +
            `reaches past the card. ${PX_PER_ROW} px resolution, each type at its default width.`,
        caveats: [
            'Height only. A too-narrow widget truncates its labels instead of spilling and is not covered.',
            'A minimum is measured with default options and one line of title. A filter row, a statistics line or a second title line add to it.',
            'Counted types carry the shapes that do change the height: counted.<type>.variants per layout, counted.<type>.modifiers as deltas per option, counted.<type>.rowTypes as the surcharge per row display, counted.<type>.notIncluded for what is still left out.',
            'A row display (rowTypes) is a delta on ONE row, measured per layout: a contact or a state chip is taller than the measured value row, and a list that mixes displays is summed row by row.',
            'Modifiers are measured one at a time. Several at once are added up, which is an approximation, not a measurement of that combination.',
            'A minimum is the point where content starts to be lost, not a recommended size — defaultSize is that.',
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
