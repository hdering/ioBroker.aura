'use strict';

/**
 * Does this datapoint fit the widget that was pointed at it?
 *
 * The validator checks that an option EXISTS and that a datapoint id exists. It
 * never looked at what the datapoint actually is, so the two mistakes that cost
 * the most were invisible: a switch on a read-only state (the button does
 * nothing, for good), and a slider on a state with no range (it snaps to 0-100
 * and writes values the device rejects). Both pass every other check.
 *
 * Everything here is a WARNING, never an error. The ioBroker object is a
 * declaration, not the truth: adapters mislabel `write`, plenty of installations
 * switch with 0/1 numbers, and a range can legitimately live in the widget
 * instead of the object. A refused write would be worse than the mistake.
 *
 * Pure functions — widget, schema and a metadata map in, findings out.
 */

/** Values carrying a template placeholder are resolved per row, not ids. */
const PLACEHOLDER = /\{\{|\[\[|\$\{/;

/** `…Dp`, `…DpId`, `…Datapoint`, `datapoint`, `datapointId` — the generator's rule. */
const DP_KEY = /(?:Dp|DpId|Datapoint|DatapointId)$|^datapoint(Id)?$/;

/**
 * Keys that hold a state id inside a nested structure without being marked in
 * the schema. `id` is the whole problem: on a list entry, a chip, a carousel
 * item or a chart series it is a state id, and on a condition, a filter preset
 * or a timer event it is a synthetic key. The type name decides, so the
 * combination is what is listed — a guess by key name alone would report every
 * condition rule as a dead datapoint.
 */
const LOOSE_ID_TYPES = new Set([
    'StaticListEntry',
    'AutoListEntry',
    'EntrySubDp',
    'CarouselItem',
    'ChipItem',
    'MediaChip',
    'BadgeDef',
    'SliderAction',
    'EChartSeriesConfig',
    'MapMarker',
    'MapQuickView',
    'EnergyEntry',
    'TrashBin',
]);

function isDividerEntry(value) {
    return !!value && typeof value === 'object' && value.type === 'divider';
}

/**
 * Every datapoint id a widget points at, with the path it sits on.
 *
 * @param {object} widget the widget object
 * @param {object} schema the generated widget schema
 * @param {object} [opts]
 * @param {boolean} [opts.loose] also follow the `id`/`dp` keys of the list-like
 *   types, which the schema cannot mark without refusing valid divider rows.
 *   For advisory use (aura_review), not for a write gate.
 * @returns {{id: string, path: string}[]} one entry per reference, duplicates kept
 */
function collectDatapointRefs(widget, schema, opts = {}) {
    const out = [];
    const push = (value, path) => {
        if (typeof value === 'string' && value.trim() && !PLACEHOLDER.test(value)) {
            out.push({ id: value.trim(), path });
        }
    };

    if (widget && typeof widget.datapoint === 'string') {
        push(widget.datapoint, 'datapoint');
    }

    const seen = new Set();

    const walk = (value, spec, path, depth) => {
        if (!value || depth > 6) {
            return;
        }
        const resolved = spec && spec.ref && schema.types[spec.ref] ? { ...schema.types[spec.ref], ...spec } : spec;
        const typeName = spec && spec.ref ? spec.ref : null;

        if (Array.isArray(value)) {
            const items = (resolved && resolved.items) || null;
            value.forEach((entry, i) => walk(entry, items, `${path}[${i}]`, depth + 1));
            return;
        }
        if (typeof value !== 'object') {
            return;
        }
        if (seen.has(value)) {
            return;
        }
        seen.add(value);

        const fields = (resolved && resolved.fields) || {};
        const looseIds = opts.loose && typeName && LOOSE_ID_TYPES.has(typeName) && !isDividerEntry(value);

        for (const [key, entry] of Object.entries(value)) {
            const sub = fields[key];
            const isDp =
                (sub && sub.datapoint) ||
                (looseIds && (key === 'id' || key === 'dp')) ||
                (opts.loose && DP_KEY.test(key));
            if (isDp && typeof entry === 'string') {
                push(entry, `${path}.${key}`);
                continue;
            }
            walk(entry, sub, `${path}.${key}`, depth + 1);
        }
    };

    const widgetOptions = (widget && widget.options) || {};
    const allowed = optionSpecs(widget && widget.type, schema);
    for (const [key, value] of Object.entries(widgetOptions)) {
        const spec = allowed[key];
        if (spec && spec.datapoint && typeof value === 'string') {
            push(value, `options.${key}`);
            continue;
        }
        walk(value, spec, `options.${key}`, 0);
    }
    return out;
}

/** Own plus shared option specs for a type — a local copy to keep this module free of validate. */
function optionSpecs(type, schema) {
    const w = schema.widgets[type];
    if (!w) {
        return {};
    }
    const out = { ...w.options };
    for (const key of w.commonOptions) {
        if (schema.commonOptions[key]) {
            out[key] = schema.commonOptions[key];
        }
    }
    return out;
}

/**
 * What a widget does with its own datapoint.
 *
 * Hand-maintained because the schema cannot know it: `addMode` says whether a
 * datapoint is needed, not whether the widget writes to it or expects a number.
 * Only types where the answer is unambiguous are listed — a missing entry means
 * no check, which is the right default for a table that has to stay true.
 */
const EXPECT = {
    switch: { writes: true, wants: 'boolean' },
    dimmer: { writes: true, wants: 'number', range: true },
    slider: { writes: true, wants: 'number', range: true },
    knob: { writes: true, wants: 'number', range: true },
    shutter: { writes: true, wants: 'number', range: true },
    thermostat: { writes: true, wants: 'number' },
    input: { writes: true },
    enum: { writes: true, states: true },
    datepicker: { writes: true },
    binarysensor: { wants: 'boolean' },
    windowcontact: { wants: 'boolean' },
    gauge: { wants: 'number', range: true },
    fill: { wants: 'number', range: true },
    chart: { wants: 'number' },
    echart: { wants: 'number' },
    climate: { wants: 'number' },
};

/**
 * Every datapoint a widget will ask the history for, and under which instance.
 *
 * The simple chart reads its own datapoint; an eCharts widget reads one per
 * series, and only where that series takes its data from the history at all —
 * the JSON mode reads the value of the datapoint itself and needs no logging,
 * so warning there would be wrong. `echartMode: 'json'` overrides every series,
 * exactly as the widget does it (sourceOf in EChartWidget).
 *
 * @param {object} widget the widget object
 * @returns {{id: string, path: string, instance: string|undefined}[]} one per series
 */
function historyReads(widget) {
    const o = (widget && widget.options) || {};
    if (widget.type === 'chart') {
        const dp = typeof widget.datapoint === 'string' ? widget.datapoint.trim() : '';
        return dp ? [{ id: dp, path: 'datapoint', instance: o.historyInstance }] : [];
    }
    if (widget.type !== 'echart' || o.echartMode === 'json') {
        return [];
    }
    const series = Array.isArray(o.echartSeries) ? o.echartSeries : [];
    // Index first, filter second: the path has to name the series as it is stored,
    // or the JSON series in the middle shifts every number after it by one.
    return series
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s && (s.source ?? 'history') === 'history' && typeof s.datapointId === 'string')
        .map(({ s, i }) => ({
            id: s.datapointId.trim(),
            path: `echartSeries[${i}]${s.name ? ` „${s.name}"` : ''}`,
            instance: s.historyInstance,
        }))
        .filter((r) => r.id && !PLACEHOLDER.test(r.id));
}

/**
 * The chart mistake nothing catches: a datapoint that is not logged.
 *
 * Every other check passes — the id exists, the type is a number, the options are
 * spelled right — and the chart draws an empty frame for ever, because no history
 * adapter was ever switched on for that state. It is the single most common reason
 * for "my chart stays empty", and it is invisible in the configuration.
 *
 * @param {object} widget the widget object
 * @param {Map<string, object>} meta id → metadata including `logging`
 * @returns {string[]} warnings without a prefix
 */
function historyFindings(widget, meta) {
    const warnings = [];
    for (const read of historyReads(widget)) {
        const info = meta.get(read.id);
        // No object read for this id: say nothing rather than guess. `logging`
        // missing entirely means the caller did not look — an empty array means
        // it looked and found nothing.
        if (!info || !Array.isArray(info.logging)) {
            continue;
        }
        if (!info.logging.length) {
            warnings.push(
                `${read.path}: für "${read.id}" ist kein History-Adapter aktiviert (kein history./influxdb./sql.-` +
                    'Eintrag in common.custom) — das Diagramm bleibt dauerhaft leer. Im ioBroker am Objekt die ' +
                    'Aufzeichnung einschalten, oder einen Datenpunkt nehmen, der geloggt wird.',
            );
            continue;
        }
        if (read.instance && !info.logging.includes(read.instance)) {
            warnings.push(
                `${read.path}: historyInstance "${read.instance}" zeichnet "${read.id}" nicht auf — aktiv ist ` +
                    `${info.logging.join(', ')}. Die Abfrage geht an die falsche Instanz und liefert nichts.`,
            );
        }
    }
    return warnings;
}

/** The range a widget carries itself, so a missing one on the object is fine. */
function hasOwnRange(o) {
    return o.min !== undefined || o.max !== undefined || o.minValue !== undefined || o.maxValue !== undefined;
}

/** A switch that maps its own values does not need a boolean state. */
function mapsValues(o) {
    return o.onValue !== undefined || o.offValue !== undefined || o.valueMap !== undefined;
}

/**
 * Compare a widget against the objects behind its datapoints.
 *
 * @param {object} widget the widget object
 * @param {object} schema the generated widget schema
 * @param {Map<string, object>} meta id → { type, role, write, min, max, unit, states }
 * @returns {string[]} warnings without a prefix — the caller names the widget
 */
function datapointFindings(widget, schema, meta) {
    const warnings = [];
    if (!widget || !meta || !meta.size) {
        return warnings;
    }
    const o = (widget.options && typeof widget.options === 'object' ? widget.options : {}) || {};
    const dp = typeof widget.datapoint === 'string' ? widget.datapoint.trim() : '';
    const info = dp ? meta.get(dp) : null;
    const expect = EXPECT[widget.type];

    if (info && expect) {
        if (expect.writes && info.write === false) {
            warnings.push(
                `"${dp}" ist im Objekt als nur lesbar geführt (write: false) — ${widget.type} schreibt ` +
                    'darauf. Wenn das Gerät den Wert nicht annimmt, ist das der Grund.',
            );
        }
        if (expect.wants && info.type && info.type !== expect.wants && info.type !== 'mixed') {
            const excuse = expect.wants === 'boolean' && mapsValues(o);
            if (!excuse) {
                warnings.push(
                    `${widget.type} erwartet ${expect.wants}, "${dp}" ist ${info.type}` +
                        (expect.wants === 'boolean'
                            ? ' — bei 0/1-Datenpunkten onValue/offValue setzen.'
                            : ' — der Wert wird als Text behandelt und rechnet nicht.'),
                );
            }
        }
        if (expect.range && info.min === undefined && info.max === undefined && !hasOwnRange(o)) {
            warnings.push(
                `"${dp}" hat im Objekt kein min/max und das Widget auch nicht — ${widget.type} nimmt ` +
                    'dann 0-100 an und schreibt womöglich Werte, die das Gerät ablehnt.',
            );
        }
        if (expect.states && info.states && typeof info.states === 'object') {
            const known = Object.keys(info.states).map((k) => String(k));
            const configured = Array.isArray(o.entries) ? o.entries : [];
            const strays = configured
                .map((e) => (e && e.value !== undefined ? String(e.value) : null))
                .filter((v) => v !== null && !known.includes(v));
            if (strays.length) {
                warnings.push(
                    `die Werte ${strays.join(', ')} stehen nicht in den states von "${dp}" ` +
                        `(vorhanden: ${known.join(', ')}).`,
                );
            }
        }
    }

    // Presets write a value straight to the datapoint, so a string preset on a
    // numeric state is a button that fails at the moment it is pressed.
    const presets = Array.isArray(o.presets) ? o.presets : [];
    if (info && info.type && presets.length) {
        const bad = presets.filter((p) => {
            const v = p && typeof p === 'object' ? p.value : p;
            return v !== undefined && v !== null && typeof v !== info.type;
        });
        if (bad.length) {
            warnings.push(`${bad.length} Preset-Wert(e) sind nicht ${info.type}, "${dp}" ist aber ${info.type}.`);
        }
    }

    return warnings;
}

module.exports = {
    collectDatapointRefs,
    datapointFindings,
    historyFindings,
    historyReads,
    EXPECT,
    LOOSE_ID_TYPES,
    PLACEHOLDER,
};
