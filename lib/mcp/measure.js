'use strict';

/**
 * Turns rows into pixels and back, and says whether the content fits.
 *
 * The one thing a model cannot see. It writes `gridPos.h` in rows, the browser
 * renders pixels, and a list cut off after nine of sixteen rows looks exactly
 * like a correct one in the JSON. The arithmetic ("h*20 + (h-1)*8 — do sixteen
 * rows fit in h=14?") was being done by hand, per widget, with the row height
 * guessed.
 *
 * The per-type numbers are MEASURED in the real frontend
 * (tools/schema/measure-widget-metrics.mjs → public/ai/aura-widget-metrics.json),
 * not estimated here. Without that file this module still answers the geometry
 * half, which is the half that is exact.
 *
 * Pure functions — widget, metrics and grid in, findings out.
 */

const { renderCanvas } = require('./canvas.js');

/**
 * What the metrics file was measured at, unless it says otherwise.
 *
 * A measured height is only a fact for the presentation it was measured in.
 * Reported from a running dashboard: every list came out wrong, one way below
 * three rows and the other way above it — the installation runs `widgetPadding`
 * 8 and `fontScale` 1.3, the numbers were measured at 16 and 1. That is 14 px
 * too much chrome and 4.8 px too little per row; at three rows the two cancel,
 * and from there the error grows in both directions (a twelve-row list came
 * back 50 px too small, and the "make it h=15" advice still scrolled).
 */
const REFERENCE = { fontScale: 1, widgetPaddingPx: 16 };

/**
 * Types the frame draws without any padding (WidgetFrame's isNoPad) — the
 * padding correction below must not touch them.
 */
const NO_PAD_TYPES = new Set(['header', 'group', 'panels', 'iframe', 'map', 'echartsPreset']);

/**
 * How a type behaves when it gets more or less height than its content wants.
 *
 * Reported from the field: the answer said „nicht gemessen“ for three completely
 * different situations — a player that would have taken any height, a list that
 * had to be computed to the row, and an autolist whose rows do not exist yet.
 * Without the difference the player was resized three times to find a number it
 * never needed. The class is the one sentence that decides what to do next, so
 * it is now on every line of the answer.
 *
 *   fills     the content stretches to the card; above the minimum h is free
 *   content   a definite content height — too little means a scrollbar
 *   runtime   the rows appear at runtime; plannable only with maxRows/items
 *   children  the height comes from the children, not from this widget
 */
const CHILD_HEIGHT_TYPES = new Set(['group', 'panels', 'universal', 'mirror']);

const RUNTIME_HEIGHT_TYPES = new Set([
    'adapterlogs',
    'adapterstatus',
    'alarm',
    'autolist',
    'calendar',
    'loadtimes',
    'menu',
    'messages',
    'scriptstatus',
    'statusoverview',
    'timer',
    'trash',
    'trashSchedule',
]);

const HEIGHT_CLASS_NOTE = {
    fills: 'füllt die Karte — über der Mindesthöhe ist h frei, überlaufen kann nichts',
    content: 'feste Inhaltshöhe — h muss gerechnet werden, sonst Scrollbalken',
    runtime: 'Zeilen entstehen erst zur Laufzeit — nur mit options.maxRows (oder items=N) planbar',
    children: 'Höhe kommt von den Kindern, nicht von diesem Widget',
};

/**
 * @param {string} type widget type
 * @param {object} [metrics] the metrics file, for the list of counted types
 * @returns {'fills'|'content'|'runtime'|'children'}
 */
function heightClass(type, metrics) {
    if (CHILD_HEIGHT_TYPES.has(type)) {
        return 'children';
    }
    if (RUNTIME_HEIGHT_TYPES.has(type)) {
        return 'runtime';
    }
    // Anything counted row by row has to be computed; everything else either
    // centres its content or scales it, and does neither harm nor good with the
    // extra pixels.
    return metrics && metrics.counted && metrics.counted[type] ? 'content' : 'fills';
}

/** The presentation the caller measured for, defaults filled in. */
function presentationOf(input) {
    const p = (input && input.presentation) || {};
    const ref = (input && input.metrics && input.metrics.$meta && input.metrics.$meta.reference) || REFERENCE;
    return {
        fontScale: Number.isFinite(p.fontScale) && p.fontScale > 0 ? p.fontScale : REFERENCE.fontScale,
        widgetPadding: Number.isFinite(p.widgetPadding) ? p.widgetPadding : REFERENCE.widgetPaddingPx,
        refFontScale: Number.isFinite(ref.fontScale) ? ref.fontScale : REFERENCE.fontScale,
        refPaddingPx: Number.isFinite(ref.widgetPaddingPx) ? ref.widgetPaddingPx : REFERENCE.widgetPaddingPx,
    };
}

/** Is this dashboard drawn the way the metrics were measured? */
function isReferencePresentation(pres) {
    return pres.fontScale === pres.refFontScale && pres.widgetPadding === pres.refPaddingPx;
}

/** How far this dashboard's font scale is from the measured one. */
function fontOffset(pres) {
    return pres.fontScale - pres.refFontScale;
}

/**
 * The padding sits twice in every card's chrome, so a dashboard with a different
 * one needs exactly that much more or less. Measured across 0…40 px: the card
 * chrome is 35 px + 2 × padding, to the pixel.
 */
function paddingDelta(type, pres) {
    return NO_PAD_TYPES.has(type) ? 0 : 2 * (pres.widgetPadding - pres.refPaddingPx);
}

/** Pixels a widget of `rows` rows occupies, gaps included. */
function rowsToPx(rows, grid) {
    const rowHeight = grid && Number.isFinite(grid.rowHeight) ? grid.rowHeight : 20;
    const gap = grid && Number.isFinite(grid.gap) ? grid.gap : 10;
    return rows > 0 ? rows * rowHeight + (rows - 1) * gap : 0;
}

/** Smallest row count that covers `px`. */
function pxToRows(px, grid) {
    const rowHeight = grid && Number.isFinite(grid.rowHeight) ? grid.rowHeight : 20;
    const gap = grid && Number.isFinite(grid.gap) ? grid.gap : 10;
    return Math.max(1, Math.ceil((px + gap) / (rowHeight + gap)));
}

/** Columns to pixels — the same sum with the horizontal snap. */
function colsToPx(cols, grid) {
    const snapX = grid && Number.isFinite(grid.snapX) ? grid.snapX : 20;
    const gap = grid && Number.isFinite(grid.gap) ? grid.gap : 10;
    return cols > 0 ? cols * snapX + (cols - 1) * gap : 0;
}

// ── What shape this widget's rows actually have ─────────────────────────────
// The metrics file measures a type in several shapes: `variants` are whole
// re-measurements (a layout draws a row differently), `modifiers` are deltas
// measured one at a time against the default. Both carry a `when` that is
// evaluated against the widget's own options here, so the numbers follow the
// configuration instead of describing only the default one.

/** Every value a path addresses in `options`; `a[].b` means "b of any element of a". */
function valuesAt(options, path) {
    let nodes = [options];
    for (const seg of String(path).split('.')) {
        const many = seg.endsWith('[]');
        const key = many ? seg.slice(0, -2) : seg;
        const next = [];
        for (const node of nodes) {
            const v = node && typeof node === 'object' ? node[key] : undefined;
            if (many) {
                if (Array.isArray(v)) {
                    next.push(...v);
                }
            } else if (v !== undefined) {
                next.push(v);
            }
        }
        nodes = next;
        if (!nodes.length) {
            return [];
        }
    }
    return nodes;
}

/** One `when` clause, or an `all` of them. `not` is "is not exactly this value". */
function matches(when, options) {
    if (!when || typeof when !== 'object') {
        return false;
    }
    if (Array.isArray(when.all)) {
        return when.all.every((w) => matches(w, options));
    }
    const found = valuesAt(options, when.path);
    if (when.nonEmpty) {
        return found.some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== ''));
    }
    if ('equals' in when) {
        return found.some((v) => v === when.equals);
    }
    if ('not' in when) {
        // An absent option counts as "not that value" — that is what a default is.
        return !found.some((v) => v === when.not);
    }
    return false;
}

/**
 * Is this modifier's condition about a single ROW rather than about the widget?
 *
 * `entries[].subDps` reads "some entry has a second line", and that is all
 * `matches()` can answer — so the delta was added to the widget's per-item
 * height and charged for EVERY row. Reported from use: a list of twelve rows of
 * which four have a second line came back 123 px too big, and the answer said so
 * itself ("12 × 48.3 px/Zeile — zweite Zeile je Eintrag"). Where every row has
 * one the two sums are identical, which is why it stood for so long.
 */
function isPerRowWhen(when) {
    if (!when || typeof when !== 'object') {
        return false;
    }
    if (Array.isArray(when.all)) {
        return when.all.length > 0 && when.all.every(isPerRowWhen);
    }
    return typeof when.path === 'string' && when.path.startsWith('entries[].');
}

/** The same condition, asked of ONE entry (the `entries[].` prefix dropped). */
function matchesEntry(when, entry) {
    if (Array.isArray(when.all)) {
        return when.all.every((w) => matchesEntry(w, entry));
    }
    return matches({ ...when, path: when.path.slice('entries[].'.length) }, entry || {});
}

/**
 * The line (base + per item) for THIS widget: the layout's variant if it has
 * one, plus every modifier whose condition its options meet.
 *
 * Modifiers were each measured alone; two of them together is their sum, which
 * is an approximation. renderMeasure says so rather than pretending otherwise.
 */
function rowShape(counted, widget, pres) {
    const options = (widget && widget.options) || {};
    const layout = (widget && widget.layout) || null;
    const variant = layout && counted.variants ? counted.variants[layout] : null;
    // Row displays are measured per layout, because a layout that draws the row
    // itself (the badges pill) does not react to them at all — no measurement,
    // no surcharge.
    const rowTypes = (variant ? variant.rowTypes : counted.rowTypes) || null;
    const applied = [];
    const perRow = [];
    let basePx = variant ? variant.basePx : counted.basePx;
    let perItemPx = variant ? variant.perItemPx : counted.perItemPx;
    // This layout's own row, before any option touches it — what the „+N weitere“
    // footer is: a line of text, with none of the row's extras on it.
    const plainPerItemPx = perItemPx;
    // What a step of the font scale is worth here, in px: the header holds one
    // text line, a row holds as many as the layout draws. Absent (a metrics file
    // from before this was measured) means "does not scale", which is what the
    // arithmetic did before.
    const scale = (variant ? variant.fontScalePx : counted.fontScalePx) || {};
    const rowScalePx = Number.isFinite(scale.perItemPx) ? scale.perItemPx : 0;
    let baseScalePx = Number.isFinite(scale.basePx) ? scale.basePx : 0;
    let itemScalePx = rowScalePx;
    if (variant) {
        applied.push(variant.label || `Layout "${layout}"`);
    }
    // A factor that changes the ROW changes it differently per layout, so the
    // variant's own measurement wins where it has one. Measured: the timestamp
    // per entry is +13.5 px a row by default, +21.5 in "card", +6.0 in "compact"
    // and ±0 in "minimal", where the pill puts it in the row it already has —
    // reported from the field as exactly that ±0, against an answer that charged
    // 13.7 px a row for a line nothing draws. A key the variant does not carry
    // keeps the type's number (the header factors are the same in every layout).
    const perVariant = new Map(((variant && variant.modifiers) || []).map((m) => [m.key, m]));
    for (const own of counted.modifiers || []) {
        const m = perVariant.get(own.key) || own;
        if (!matches(m.when, options)) {
            continue;
        }
        if (variant && (m.notForVariants || []).includes(layout)) {
            continue;
        }
        // A factor measured on one type but read by another: `showEntryLastChange`
        // is the dynamic list's switch, and the static list ignores it — charging
        // it there would add a line the widget never draws.
        if ((m.notForTypes || []).includes(widget && widget.type)) {
            continue;
        }
        // A per-row factor is counted per matching row further down; adding its
        // per-item delta here would charge it for the rows that do not have it.
        if (isPerRowWhen(m.when) && m.perItemPx) {
            basePx += m.basePx || 0;
            perRow.push(m);
            continue;
        }
        basePx += m.basePx || 0;
        perItemPx += m.perItemPx || 0;
        // A modifier can change how the widget REACTS to the font scale, not just
        // its height: switching the header off removes the line that scales, so
        // its own slope has to come off too.
        baseScalePx += (m.fontScalePx && m.fontScalePx.basePx) || 0;
        itemScalePx += (m.fontScalePx && m.fontScalePx.perItemPx) || 0;
        // A measured zero is an answer too: it says the factor was looked at.
        const delta = [
            m.basePx ? `${m.basePx > 0 ? '+' : ''}${m.basePx} px` : '',
            m.perItemPx ? `${m.perItemPx > 0 ? '+' : ''}${m.perItemPx} px/Zeile` : '',
        ]
            .filter(Boolean)
            .join(', ');
        applied.push(`${m.label || m.key}: ${delta || '±0'}`);
    }
    // The dashboard's own presentation, applied last: the padding sits twice in
    // the chrome, the font scale stretches every text line the measurement found.
    const df = fontOffset(pres);
    basePx += baseScalePx * df + paddingDelta(widget && widget.type, pres);
    perItemPx += itemScalePx * df;
    return {
        basePx: Math.round(basePx),
        perItemPx: Math.round(perItemPx * 10) / 10,
        rowScalePx,
        applied,
        perRow,
        rowTypes,
        plainPerItemPx: Math.round((plainPerItemPx + rowScalePx * fontOffset(pres)) * 10) / 10,
        // How many rows this variant draws side by side. The compact list draws
        // two, so its height grows per PAIR: measured 1→96, 2→96, 3→124, 4→124 …
        // 9→214 px. The straight line through the even counts is exact on those
        // and half a pair short on every odd one — nine rows came back 199 px for
        // a widget that needs 214.
        columns: variant && Number.isFinite(variant.columns) && variant.columns > 1 ? variant.columns : 1,
    };
}

/** Items rounded up to a full row of columns — the phantom slot costs height. */
function paddedItems(items, columns) {
    return columns > 1 ? Math.ceil(items / columns) * columns : items;
}

/**
 * The display a row is actually drawn with.
 *
 * `entryDisplay` is the list-wide block every discovered row starts from, and it
 * is all-or-nothing per row: an entry with a `displayType` of its own is
 * configured on its own and ignores it (see utils/listDisplayDefaults.ts).
 */
function rowDisplayType(entry, options) {
    // A separator is a row shape of its own — 17 px against a 33 px content row,
    // measured. It used to be charged as a full row while the answer claimed
    // separators were "not included", which read as "add space for each of them".
    //
    // With a heading it is a different row again: the bare rule is 17 px of
    // padding around a hairline, the heading adds a line of text and takes the
    // separator to 29 px — nearly a content row. Measured as two shapes because
    // real dashboards use the heading and the metrics only knew the bare rule,
    // which is where the rest of an under-reported list height came from.
    if (entry && entry.divider === true) {
        return entry.dividerLabel && String(entry.dividerLabel).trim() ? 'dividerHeading' : 'divider';
    }
    const own = entry && typeof entry === 'object' ? entry.displayType : undefined;
    if (own) {
        return own;
    }
    const wide = options.entryDisplay ? options.entryDisplay.displayType : undefined;
    return wide || 'auto';
}

/**
 * What the rows' displays add to the default row, per row.
 *
 * The per-item number is ONE display's row — the measured default is a value row,
 * and a contact or a state mapping draws a chip that is taller, a date picker or
 * a select field taller still. A list of contacts was therefore sized as one of
 * values and reported "44 px Luft" for a list that scrolled: four pixels a row,
 * eleven rows.
 *
 * Applied per row, not per widget: four values and four contacts is neither four
 * value rows nor four contact rows.
 */
/**
 * The rows a surcharge is counted over: the visible ones, separators left out.
 *
 * `null` means there are no rows to look at — an autolist finds them at runtime.
 */
function countedRows(widget, items) {
    const options = (widget && widget.options) || {};
    if (!Array.isArray(options.entries)) {
        return null;
    }
    // Separators included: they occupy a row, they are just a shorter one (the
    // `divider` row type). What they cannot have is a display or a second line,
    // and the two surcharges below leave them out themselves.
    return options.entries.slice(0, items);
}

/**
 * What the per-row factors add, counted over the rows that actually have them.
 *
 * The one that was wrong: `subDps` (+15.3 px for a second line under the entry).
 */
function perRowSurcharge(perRow, widget, items, pres) {
    if (!perRow || !perRow.length || !Number.isFinite(items) || items <= 0) {
        return { px: 0, notes: [] };
    }
    const rows = countedRows(widget, items);
    if (!rows) {
        return { px: 0, notes: [] };
    }
    let px = 0;
    const notes = [];
    const df = fontOffset(pres);
    for (const m of perRow) {
        // A separator draws no second line, whatever the entry carries.
        const n = rows.filter((e) => !(e && e.divider === true) && matchesEntry(m.when, e)).length;
        if (!n) {
            continue;
        }
        // A second line under the entry is a text line: it grows with the scale.
        const each = Math.round((m.perItemPx + ((m.fontScalePx && m.fontScalePx.perItemPx) || 0) * df) * 10) / 10;
        px += n * each;
        notes.push(`${n} × ${m.label || m.key} ${each > 0 ? '+' : ''}${each} px/Zeile`);
    }
    return { px: Math.round(px * 10) / 10, notes };
}

/**
 * What one row display costs on top of the layout's own row, at THIS font scale.
 *
 * A row is either text or a control, and the two do not react to the scale the
 * same way. A contact chip is a text line with a bit of padding: it keeps its
 * +4 px at every scale. A shutter row is a control of a fixed 43 px: its
 * surcharge over the text row (+10 px at scale 1) shrinks as the text grows and
 * disappears once the text is taller. Measured at two scales, both cases are the
 * same formula — the additive part rides on the row, the fixed part is a floor:
 *
 *   surcharge(f) = max(perItemPx + (own slope − row slope) × (f − 1), addPx)
 *
 * With neither field present (an older metrics file) this is exactly `perItemPx`,
 * which is what it used to be.
 */
/** A shape a metrics file may not carry yet, and the one to fall back to. */
const FALLBACK_ROW_TYPE = { dividerHeading: 'divider' };

function rowTypePx(rt, rowScalePx, df) {
    const own = Number.isFinite(rt.fontScalePx) ? rt.fontScalePx : rowScalePx;
    const floor = Number.isFinite(rt.addPx) ? rt.addPx : rt.perItemPx;
    return Math.round(Math.max(rt.perItemPx + (own - rowScalePx) * df, floor) * 10) / 10;
}

function rowTypeSurcharge(rowTypes, widget, items, rowScalePx, pres) {
    if (!rowTypes || !Number.isFinite(items) || items <= 0) {
        return { px: 0, notes: [] };
    }
    const df = fontOffset(pres);
    const options = (widget && widget.options) || {};
    const entries = countedRows(widget, items);
    // No entries to look at: an autolist finds its rows at runtime and every one
    // of them starts from the list-wide display block.
    const displays = entries
        ? entries.map((e) => rowDisplayType(e, options))
        : Array.from({ length: items }, () => rowDisplayType(null, options));
    const counts = new Map();
    let px = 0;
    for (const dt of displays) {
        const m = rowTypes[dt] || rowTypes[FALLBACK_ROW_TYPE[dt]];
        if (!m) {
            continue;
        }
        const d = rowTypePx(m, rowScalePx, df);
        if (!d) {
            continue;
        }
        px += d;
        counts.set(dt, (counts.get(dt) || 0) + 1);
    }
    const notes = [...counts].map(([dt, n]) => {
        const m = rowTypes[dt] || rowTypes[FALLBACK_ROW_TYPE[dt]];
        const d = rowTypePx(m, rowScalePx, df);
        return `${n} × ${m.label || dt} ${d > 0 ? '+' : ''}${d} px/Zeile`;
    });
    return { px: Math.round(px * 10) / 10, notes };
}

/**
 * How many content items a widget holds, where that is visible in the options.
 *
 * A static list knows its rows. An autolist does not — its rows appear at runtime
 * out of room and function — so it returns null and the caller has to be told to
 * pass a count.
 */
function itemCount(widget) {
    const o = (widget && widget.options) || {};
    const cap = capped(widget) ? Math.floor(o.maxRows) : null;
    const own = Array.isArray(o.entries) ? o.entries.length : Array.isArray(o.items) ? o.items.length : null;
    if (own !== null) {
        return cap ? Math.min(own, cap) : own;
    }
    return cap;
}

/**
 * Is this widget's row count bounded by maxRows?
 *
 * Only where the widget READS the option. A cap turns a runtime row count into a
 * known one — that is the whole point of maxRows on the types whose rows are
 * otherwise countable only once the dashboard is running. The static list is not
 * one of them: it ignores the option (measured in the browser, nine rows stay
 * nine), so honouring it here reported four rows where nine are drawn. It stood
 * in the list's schema only because the option reader followed an import into the
 * dynamic list.
 */
const CAPPED_TYPES = new Set(['autolist', 'statusoverview', 'jsontable']);

function capped(widget) {
    const o = (widget && widget.options) || {};
    return CAPPED_TYPES.has(widget && widget.type) && Number.isFinite(o.maxRows) && o.maxRows > 0;
}

/**
 * A measured minimum height, re-computed for this dashboard's presentation.
 *
 * The same two corrections as for a counted type — a minimum is a card with
 * content in it, so it carries the padding twice and grows with the font scale.
 * `fontScalePx` is what one step of the scale is worth for this type; without it
 * (an older metrics file) only the padding is corrected, which is the exact half.
 */
function minimumPx(minimum, type, pres) {
    const slope = Number.isFinite(minimum.fontScalePx) ? minimum.fontScalePx : 0;
    return minimum.minPx + slope * fontOffset(pres) + paddingDelta(type, pres);
}

/**
 * The height a CHART needs to be a chart, where the metrics carry one.
 *
 * The one place where "does anything get cut off" has no useful answer: eCharts
 * and recharts paint into whatever box they are given. Reported from use — a
 * diagram at h=5 (132 px) has a drawing surface of 59 px, is unreadable, and
 * aura_measure answered "passt, 80 px Luft", because at 132 px nothing is cut
 * off and that is all the hard minimum ever asked.
 *
 * So `usablePx` is measured against a stated criterion (the plot surface reaching
 * `$meta.usablePlotPx`) rather than against a cliff, and the answer says so —
 * this is the only number here that is a recommendation.
 */
function usablePx(minimum, type, pres) {
    if (!minimum || !Number.isFinite(minimum.usablePx)) {
        return null;
    }
    const slope = Number.isFinite(minimum.fontScalePx) ? minimum.fontScalePx : 0;
    return minimum.usablePx + slope * fontOffset(pres) + paddingDelta(type, pres);
}

/**
 * Measure one widget against the grid it sits on.
 *
 * @param {object} widget the widget object
 * @param {object} input
 * @param {object} input.metrics the measured metrics file, or null
 * @param {object} input.grid { rowHeight, snapX, gap }
 * @param {object} [input.presentation] { fontScale, widgetPadding } of THIS dashboard
 * @param {number} [input.items] item count, for the types that only know it at runtime
 * @returns {object} one row of the answer
 */
function measureWidget(widget, input) {
    const { metrics, grid } = input || {};
    const pres = presentationOf(input);
    const rows = widget && widget.gridPos && Number.isFinite(widget.gridPos.h) ? widget.gridPos.h : null;
    const cols = widget && widget.gridPos && Number.isFinite(widget.gridPos.w) ? widget.gridPos.w : null;
    const type = widget && widget.type;
    const out = {
        id: (widget && widget.id) || type || '?',
        type,
        rows,
        cols,
        availPx: rows ? rowsToPx(rows, grid) : null,
        widthPx: cols ? colsToPx(cols, grid) : null,
        items: input && Number.isFinite(input.items) ? input.items : itemCount(widget),
        heightClass: heightClass(type, metrics),
    };
    // Where the widget ENDS, which is what decides whether it is still on screen.
    const y = widget && widget.gridPos && Number.isFinite(widget.gridPos.y) ? widget.gridPos.y : null;
    out.bottomRow = rows != null && y != null ? y + rows : null;
    out.rightCol = cols != null && widget && Number.isFinite(widget.gridPos.x) ? widget.gridPos.x + cols : null;

    // An autolist builds the same rows as a static list, it just finds them at
    // runtime. With a row count from the caller the list measurement applies.
    const alias = type === 'autolist' ? 'list' : null;
    const own = (metrics && metrics.counted && metrics.counted[type]) || null;
    const viaAlias = (alias && metrics && metrics.counted && metrics.counted[alias]) || null;
    const counted = own || viaAlias;
    const minimum = metrics && metrics.minimum && metrics.minimum[type];
    const notMeasurable = metrics && metrics.notMeasurable && metrics.notMeasurable[type];

    if (counted && Number.isFinite(out.items)) {
        // A row is not one shape: the layout re-measures it, options like a second
        // line per entry or a missing header shift it. Flat base + per item was the
        // same number for all of them, and a list built to it scrolled.
        const shape = rowShape(counted, widget, pres);
        // A row is drawn by its display: the switch, slider and value rows are the
        // measured default, a contact or a state chip is taller, and a separator is
        // SHORTER than any of them. Per row, because a list mixes them.
        const rowsExtra = rowTypeSurcharge(shape.rowTypes, widget, out.items, shape.rowScalePx, pres);
        // And a factor only SOME rows have — a second line under the entry — is
        // counted over exactly those rows, not over the whole list.
        const perRow = perRowSurcharge(shape.perRow, widget, out.items, pres);
        // A two-column layout charges for the empty half of its last row.
        const billed = paddedItems(out.items, shape.columns);
        out.columns = shape.columns;
        out.requiredPx = Math.round(shape.basePx + billed * shape.perItemPx + rowsExtra.px + perRow.px);
        out.basis =
            `${shape.basePx} px + ${billed} × ${shape.perItemPx} px/${counted.item}` +
            `${billed !== out.items ? ` (${out.items} Zeilen in ${shape.columns} Spalten — die letzte Zeile ist nur halb belegt und kostet trotzdem)` : ''}` +
            `${perRow.px ? ` + ${perRow.px} px Zeilen mit Zusatz (${perRow.notes.join('; ')})` : ''}` +
            `${rowsExtra.px ? ` + ${rowsExtra.px} px je Zeilenform (${rowsExtra.notes.join('; ')})` : ''}` +
            `${shape.applied.length ? ` — ${shape.applied.join('; ')}` : ''}` +
            `${viaAlias && !own ? ` (an ${alias} gemessen)` : ''}`;
        out.applied = shape.applied;
        out.rowTypes = rowsExtra.notes;
        out.perRow = perRow.notes;
        // The „+N weitere“ footer, where maxRows cuts the list short. It used to
        // be a footnote — "not in the number, give it a row of reserve" — which
        // is advice about arithmetic the caller then has to redo. Counted here
        // instead, as one full content row: that is an upper bound (the footer is
        // a line of text, not a control), and for a height recommendation being
        // one row too generous is the harmless direction.
        out.moreRow = capped(widget) && (widget.options || {}).showMore !== false;
        if (out.moreRow) {
            out.moreRowPx = Math.round(shape.plainPerItemPx);
            out.requiredPx += out.moreRowPx;
            out.basis += ` + ${out.moreRowPx} px „+N weitere“-Zeile (als ganze Zeile gerechnet, Obergrenze)`;
        }
        out.notIncluded = counted.notIncluded;
        out.atWidthPx = counted.atWidthPx;
    } else if (viaAlias && !own) {
        // An autolist has no number of its own only because nobody has said how
        // many rows it will find. That is an ask, not a dead end — it belongs in
        // `unknown` with the rest of the answerable ones.
        // maxRows is the standing answer to this, not just items=N for one call:
        // it makes the widget's height a fact on the dashboard, not only in the
        // measurement.
        out.unknown =
            `Zeilen entstehen erst zur Laufzeit — mit items=N noch einmal fragen (dann wie ${alias} gerechnet), ` +
            'oder options.maxRows setzen: dann steht die Höhe fest und die abgeschnittenen Zeilen erscheinen ' +
            'als „+N weitere“.';
        out.requiredPx = minimum ? Math.round(minimumPx(minimum, widget && widget.type, pres)) : null;
    } else if (counted) {
        out.unknown = `Anzahl ${counted.item}n unbekannt — mit items=N noch einmal fragen.`;
        out.requiredPx = minimum ? Math.round(minimumPx(minimum, widget && widget.type, pres)) : null;
    } else if (minimum) {
        const hard = Math.round(minimumPx(minimum, widget && widget.type, pres));
        const usable = usablePx(minimum, widget && widget.type, pres);
        if (usable !== null) {
            out.hardMinPx = hard;
            out.requiredPx = Math.round(usable);
            out.usable = true;
            out.basis =
                `brauchbare Mindesthöhe: ab hier ist die Zeichenfläche ${(metrics.$meta && metrics.$meta.usablePlotPx) || 140} px hoch. ` +
                `Abgeschnitten wird erst unter ${hard} px — dazwischen zeichnet das Diagramm, ` +
                'nur ist nichts mehr ablesbar';
        } else {
            out.requiredPx = hard;
            out.basis = 'gemessene Mindesthöhe, bei der noch nichts abgeschnitten wird';
        }
        out.atWidthPx = minimum.atWidthPx;
        // A minimum has its own "what this number does not cover" list now — the
        // configuration it was measured with. Printed by the same tail line as
        // the counted types'.
        out.notIncluded = minimum.notIncluded;
    } else if (notMeasurable) {
        // Not the same thing as `unknown`, and putting both in one field made the
        // answer read wrong: `unknown` is an instruction the caller can follow
        // ("say items=N"), this is the absence of a number for the whole TYPE. In
        // the same slot as a verdict, a reason like "braucht konfigurierte Balken"
        // was read as a finding about the widget in hand — reported from the field
        // on a working energiebilanz that has its bars. Nothing here looks at the
        // widget at all.
        out.unmeasured = notMeasurable;
    } else {
        out.unmeasured = 'für diesen Typ ist keine Messung hinterlegt';
    }

    if (out.requiredPx && out.availPx) {
        const slack = out.availPx - out.requiredPx;
        out.slackPx = slack;
        out.needRows = pxToRows(out.requiredPx, grid);
        // A tile that is exactly at its minimum shows everything and has no room
        // for a second line — worth a word, not a complaint.
        out.verdict =
            slack < 0 ? 'zu klein' : slack < (grid && grid.rowHeight ? grid.rowHeight : 20) ? 'knapp' : 'passt';
    }
    return out;
}

/**
 * @param {object[]} list what measureWidget returned, one per widget
 * @param {object} input
 * @param {object} input.grid the grid geometry
 * @param {string} [input.where] the tab, for the heading
 * @param {string} [input.url] a link to look at the result
 * @param {object} [input.metrics] for the measurement date and the caveats
 * @param {object} [input.presentation] { fontScale, widgetPadding } of THIS dashboard
 * @param {object} [input.canvas] the target screen from the guidelines (canvas.js)
 * @returns {string} the text handed to the model
 */
function renderMeasure(list, input) {
    const { grid, where, url, metrics, canvas } = input || {};
    const pres = presentationOf(input);
    const head = [
        where ? `# ${where}` : '# Größen',
        `Raster: Zeilenhöhe ${grid.rowHeight} px, Spaltenbreite ${grid.snapX} px, Abstand ${grid.gap} px.`,
        `h Zeilen = h × ${grid.rowHeight} + (h − 1) × ${grid.gap} px.`,
    ];
    // The two settings the measured heights had to be re-computed for. Said
    // ALWAYS, not only when they differ from the reference: a report from the
    // field compared the answer against the real DOM and every row was out by
    // exactly the correction — the two settings had not been picked up at all,
    // and there was no way to tell from the answer, because at the reference
    // values it says nothing. Naming them makes a wrong read visible in one line.
    head.push(
        `Darstellung dieses Dashboards: Schriftskalierung ${pres.fontScale}, Innenabstand ` +
            `${pres.widgetPadding} px` +
            (isReferencePresentation(pres)
                ? ' — das ist auch die Messgrundlage, die Höhen unten stehen unverändert. Stimmt das ' +
                  'nicht mit den Einstellungen des Dashboards überein, sind alle Zahlen unten falsch ' +
                  '(Einstellungen → Layout).'
                : `. Die gemessenen Höhen (bei ${pres.refFontScale} und ${pres.refPaddingPx} px gemessen) ` +
                  'sind darauf umgerechnet.'),
    );
    if (canvas && canvas.enabled) {
        head.push(renderCanvas(canvas));
    }

    const lines = list.map((m) => {
        const size = `${m.type}, h=${m.rows ?? '?'}${m.availPx ? ` (${m.availPx} px)` : ''}`;
        if (!m.requiredPx) {
            // "nicht gemessen" first, so a type-level reason cannot be mistaken for
            // a complaint about this widget. The type is what has no number here.
            // The height class comes with it: without it all three reasons for
            // having no number read the same, and a widget that would have taken
            // any height gets resized until someone gives up.
            const why = m.unmeasured
                ? `nicht gemessen (${m.type}: ${m.unmeasured})`
                : /** @type {string} */ (m.unknown);
            return `- ${m.id} — ${size}: ${why} [${m.heightClass}: ${HEIGHT_CLASS_NOTE[m.heightClass]}]`;
        }
        const verdict =
            m.verdict === 'zu klein'
                ? `ZU KLEIN, es fehlen ${-m.slackPx} px → h=${m.needRows}`
                : m.verdict === 'knapp'
                  ? `knapp (${m.slackPx} px Luft) → h=${m.needRows} ist das Minimum`
                  : `passt (${m.slackPx} px Luft, Minimum h=${m.needRows})`;
        return (
            `- ${m.id} — ${size}: braucht ${m.requiredPx} px, ${verdict} [${m.heightClass}]` +
            `${m.basis ? `  [${m.basis}]` : ''}`
        );
    });

    const tail = [];
    // The legend for the class tag above, printed once and only for the classes
    // that actually turned up.
    const classes = [...new Set(list.map((m) => m.heightClass).filter(Boolean))];
    if (classes.length) {
        tail.push(
            `Höhenverhalten: ${classes.map((c) => `${c} = ${HEIGHT_CLASS_NOTE[c]}`).join('. ')}. ` +
                'Die Zahl oben ist bei „fills“ eine Untergrenze, bei „content“ die Höhe, die es sein muss.',
        );
    }
    const unmeasured = list.filter((m) => !m.requiredPx && m.unmeasured);
    if (unmeasured.length) {
        // Said once, plainly. Without it the reasons above still invite a second
        // look at a widget that is perfectly fine.
        tail.push(
            `${unmeasured.length} Widget(s) haben keine hinterlegte Messung. Das ist kein Befund: für diese ` +
                'Typen gibt es keine feste Höhe, die sich messen lässt — über das Widget selbst sagt es nichts.',
        );
    }
    const tooSmall = list.filter((m) => m.verdict === 'zu klein');
    if (tooSmall.length) {
        tail.push(
            `${tooSmall.length} Widget(s) sind zu klein. Höhe mit aura_update_widget anpassen — und die ` +
                'darunter liegenden Widgets mitverschieben, sonst überlappen sie.',
        );
    }
    // Every widget on its own can fit and the tab still run off the screen. This
    // is the only place that compares the STACK against the target device.
    if (canvas && canvas.enabled) {
        const below = list.filter((m) => m.bottomRow && m.bottomRow > canvas.maxRows);
        const right = list.filter((m) => m.rightCol && m.rightCol > canvas.maxCols);
        if (below.length) {
            tail.push(
                `${below.length} Widget(s) enden unterhalb der Hilfslinie (letzte sichtbare Zeile: ` +
                    `${canvas.maxRows}): ${below.map((m) => `${m.id} bis Zeile ${m.bottomRow}`).join(', ')}. ` +
                    'Auf dem Zielbildschirm muss dafür gescrollt werden — kürzen oder auf einen zweiten Tab verteilen.',
            );
        }
        if (right.length) {
            tail.push(
                `${right.length} Widget(s) reichen über die Hilfslinie hinaus (letzte sichtbare Spalte: ` +
                    `${canvas.maxCols}): ${right.map((m) => `${m.id} bis Spalte ${m.rightCol}`).join(', ')}.`,
            );
        }
    }
    // What the number does NOT contain, said out loud. Without this the answer
    // reads as if it covered the whole widget, and a list built exactly to the
    // reported minimum scrolled on the real dashboard.
    if (list.some((m) => m.moreRow)) {
        tail.push(
            'Die „+N weitere“-Zeile ist eingerechnet, wo maxRows greift — als ganze Zeile, also eher zu ' +
                'großzügig. Mit showMore: false fällt sie weg.',
        );
    }
    const notIncluded = [...new Set(list.flatMap((m) => m.notIncluded || []))];
    if (notIncluded.length) {
        tail.push(`Nicht eingerechnet: ${notIncluded.join('; ')}. Bei knapper Höhe eine Zeile Reserve geben.`);
    }
    // The per-row factors count towards this too: a layout plus a second line on
    // some of the rows is still two measurements added up.
    if (list.some((m) => (m.applied || []).length + (m.perRow || []).length > 1)) {
        tail.push(
            'Layout und Optionen sind einzeln gemessen; mehrere zusammen werden addiert — das ist eine ' +
                'Näherung, keine Messung dieser Kombination.',
        );
    }
    if (url) {
        tail.push(`Ansehen: ${url}`);
    }
    // A minimum is one measurement of the type in its default configuration —
    // unlike the counted types it has no variants, so options that add a row are
    // not in it. Said here rather than left to be discovered on the dashboard.
    if (list.some((m) => m.requiredPx && !m.applied && m.basis && /Mindesthöhe/.test(m.basis))) {
        tail.push(
            'Die Mindesthöhen gelten für die Standardkonfiguration des Typs mit einer Titelzeile. ' +
                'Zusätzliche Elemente (Filterzeile, Statistik, zweite Beschriftungszeile) kommen oben drauf.',
        );
    }
    // The one number here that is a recommendation rather than a cliff, said out
    // loud — a chart is the only widget that keeps drawing at any height.
    const usable = list.filter((m) => m.usable);
    if (usable.length) {
        tail.push(
            `${usable.length} Diagramm(e) sind an der BRAUCHBAREN Mindesthöhe gemessen, nicht an der, bei der ` +
                'etwas abgeschnitten wird: ein Diagramm zeichnet in jede Höhe, es ist nur irgendwann nicht mehr ' +
                'ablesbar. Wer die Kachel bewusst klein hält, kann darunter bleiben — bis zu ' +
                `${usable.map((m) => `${m.id}: ${m.hardMinPx} px`).join(', ')}.`,
        );
    }
    if (metrics && metrics.$meta) {
        tail.push(
            `Gemessen am ${metrics.$meta.measured} in der echten Oberfläche. Nur die Höhe: eine zu schmale ` +
                'Karte schneidet Beschriftungen ab, das steckt in diesen Zahlen nicht.',
        );
    }
    return [...head, '', ...lines, '', ...tail].join('\n');
}

/**
 * The browser's own measurement, next to the estimate.
 *
 * `list` is one entry per tab: { report, estimates }, where `report` is what the
 * frontend sent (auraConfig.readRenderReports) and `estimates` maps widget id →
 * the px measureWidget computed for the stored configuration, or null where
 * there is no number for the type.
 *
 * @param {object[]} list
 * @param {object} input
 * @param {object} [input.metrics] for the date the table was measured
 * @param {number} [input.now] for a deterministic age in tests
 * @returns {string}
 */
function renderRendered(list, input) {
    const { metrics } = input || {};
    const now = (input && input.now) || Date.now();
    const age = (ts) => {
        const min = Math.round((now - ts) / 60000);
        if (min < 1) {
            return 'gerade eben';
        }
        return min < 90 ? `vor ${min} min` : `vor ${Math.round(min / 60)} h`;
    };

    const out = [
        '# Im Browser gemessen',
        'Gerendert = die Höhe, die die Karte auf dem Bildschirm hat. Inhalt = was der Inhalt bräuchte;' +
            ' größer als gerendert heißt, dass etwas weggescrollt ist.',
        '',
    ];
    let disagreements = 0;
    for (const { report, estimates } of list) {
        const grid = report.grid || {};
        out.push(
            `## ${report.tab || report.tabId} — ${age(report.ts)}` +
                `${report.clientName ? ` von „${report.clientName}“` : ''}`,
        );
        out.push(
            `Fenster ${report.viewport.w}×${report.viewport.h} px, Schriftskalierung ` +
                `${report.presentation.fontScale}, Innenabstand ${report.presentation.widgetPadding} px, ` +
                `Zeilenhöhe ${grid.rowHeight} px, Abstand ${grid.gap} px.`,
        );
        for (const w of report.widgets || []) {
            const over = w.contentPx - w.px;
            const est = estimates ? estimates[w.id] : undefined;
            // The estimate is only worth printing where it disagrees with the
            // real thing — a table that matches needs no defending, and a line
            // per widget saying "stimmt" is what made the last answer too long
            // to read.
            let cmp = '';
            if (Number.isFinite(est) && est > 0) {
                const diff = Math.round(w.contentPx - est);
                if (Math.abs(diff) > 8) {
                    disagreements++;
                    cmp =
                        `, aura_measure schätzt ${est} px — ` +
                        `${diff > 0 ? `${diff} px zu wenig` : `${-diff} px zu viel`}`;
                }
            }
            // The row count is the number that gets written, so it is the one the
            // answer has to contain — a px figure the caller then has to convert
            // through the grid is half an answer.
            const fits = w.scrolls && grid.rowHeight ? ` → h=${pxToRows(w.contentPx, grid)}` : '';
            out.push(
                `- ${w.id} (${w.type}, h=${w.rows}): gerendert ${w.px} px` +
                    (w.scrolls
                        ? `, Inhalt ${w.contentPx} px → SCROLLT, es fehlen ${over} px${fits}`
                        : ', kein Überlauf') +
                    cmp,
            );
        }
        out.push('');
    }

    const scrolling = list.flatMap(({ report }) => (report.widgets || []).filter((w) => w.scrolls));
    if (scrolling.length) {
        out.push(
            `${scrolling.length} Widget(s) scrollen. Das ist die einzige Aussage hier, die keine Schätzung ` +
                'ist: dort ist der Inhalt wirklich abgeschnitten.',
        );
    }
    if (disagreements) {
        out.push(
            `Bei ${disagreements} Widget(s) weicht die Schätzung um mehr als 8 px ab. Im Zweifel gilt der ` +
                'Browser — die Tabelle hinter aura_measure ist eine Momentaufnahme' +
                `${metrics && metrics.$meta ? ` vom ${metrics.$meta.measured}` : ''}, diese Zahlen sind von jetzt.`,
        );
    }
    out.push(
        'Gemeldet wird nur der Tab, der im Browser offen war. Fehlt einer, den Nutzer bitten, ihn zu ' +
            'öffnen — nach etwa einer Sekunde steht die Messung hier.',
    );
    return out.join('\n');
}

module.exports = {
    HEIGHT_CLASS_NOTE,
    NO_PAD_TYPES,
    REFERENCE,
    colsToPx,
    heightClass,
    itemCount,
    measureWidget,
    pxToRows,
    renderMeasure,
    renderRendered,
    rowsToPx,
};
