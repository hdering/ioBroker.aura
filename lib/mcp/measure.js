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

/**
 * How many content items a widget holds, where that is visible in the options.
 *
 * A static list knows its rows. An autolist does not — its rows appear at runtime
 * out of room and function — so it returns null and the caller has to be told to
 * pass a count.
 */
function itemCount(widget) {
    const o = (widget && widget.options) || {};
    if (Array.isArray(o.entries)) {
        return o.entries.length;
    }
    if (Array.isArray(o.items)) {
        return o.items.length;
    }
    return null;
}

/**
 * Measure one widget against the grid it sits on.
 *
 * @param {object} widget the widget object
 * @param {object} input
 * @param {object} input.metrics the measured metrics file, or null
 * @param {object} input.grid { rowHeight, snapX, gap }
 * @param {number} [input.items] item count, for the types that only know it at runtime
 * @returns {object} one row of the answer
 */
function measureWidget(widget, input) {
    const { metrics, grid } = input || {};
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
    };

    // An autolist builds the same rows as a static list, it just finds them at
    // runtime. With a row count from the caller the list measurement applies.
    const alias = type === 'autolist' ? 'list' : null;
    const own = (metrics && metrics.counted && metrics.counted[type]) || null;
    const viaAlias = (alias && metrics && metrics.counted && metrics.counted[alias]) || null;
    const counted = own || viaAlias;
    const minimum = metrics && metrics.minimum && metrics.minimum[type];
    const notMeasurable = metrics && metrics.notMeasurable && metrics.notMeasurable[type];

    if (counted && Number.isFinite(out.items)) {
        out.requiredPx = Math.round(counted.basePx + out.items * counted.perItemPx);
        out.basis =
            `${counted.basePx} px + ${out.items} × ${counted.perItemPx} px/${counted.item}` +
            `${viaAlias && !own ? ` (an ${alias} gemessen)` : ''}`;
        out.atWidthPx = counted.atWidthPx;
    } else if (viaAlias && !own) {
        // An autolist has no number of its own only because nobody has said how
        // many rows it will find. That is an ask, not a dead end — it belongs in
        // `unknown` with the rest of the answerable ones.
        out.unknown = `Zeilen entstehen erst zur Laufzeit — mit items=N noch einmal fragen, dann wie ${alias} gerechnet.`;
        out.requiredPx = minimum ? minimum.minPx : null;
    } else if (counted) {
        out.unknown = `Anzahl ${counted.item}n unbekannt — mit items=N noch einmal fragen.`;
        out.requiredPx = minimum ? minimum.minPx : null;
    } else if (minimum) {
        out.requiredPx = minimum.minPx;
        out.basis = 'gemessene Mindesthöhe, bei der noch nichts abgeschnitten wird';
        out.atWidthPx = minimum.atWidthPx;
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
 * @returns {string} the text handed to the model
 */
function renderMeasure(list, input) {
    const { grid, where, url, metrics } = input || {};
    const head = [
        where ? `# ${where}` : '# Größen',
        `Raster: Zeilenhöhe ${grid.rowHeight} px, Spaltenbreite ${grid.snapX} px, Abstand ${grid.gap} px.`,
        `h Zeilen = h × ${grid.rowHeight} + (h − 1) × ${grid.gap} px.`,
    ];

    const lines = list.map((m) => {
        const size = `${m.type}, h=${m.rows ?? '?'}${m.availPx ? ` (${m.availPx} px)` : ''}`;
        if (!m.requiredPx) {
            // "nicht gemessen" first, so a type-level reason cannot be mistaken for
            // a complaint about this widget. The type is what has no number here.
            return m.unmeasured
                ? `- ${m.id} — ${size}: nicht gemessen (${m.type}: ${m.unmeasured})`
                : `- ${m.id} — ${size}: ${m.unknown}`;
        }
        const verdict =
            m.verdict === 'zu klein'
                ? `ZU KLEIN, es fehlen ${-m.slackPx} px → h=${m.needRows}`
                : m.verdict === 'knapp'
                  ? `knapp (${m.slackPx} px Luft) → h=${m.needRows} ist das Minimum`
                  : `passt (${m.slackPx} px Luft, Minimum h=${m.needRows})`;
        return `- ${m.id} — ${size}: braucht ${m.requiredPx} px, ${verdict}${m.basis ? `  [${m.basis}]` : ''}`;
    });

    const tail = [];
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
    if (url) {
        tail.push(`Ansehen: ${url}`);
    }
    if (metrics && metrics.$meta) {
        tail.push(
            `Gemessen am ${metrics.$meta.measured} in der echten Oberfläche. Nur die Höhe: eine zu schmale ` +
                'Karte schneidet Beschriftungen ab, das steckt in diesen Zahlen nicht.',
        );
    }
    return [...head, '', ...lines, '', ...tail].join('\n');
}

module.exports = { colsToPx, itemCount, measureWidget, pxToRows, renderMeasure, rowsToPx };
