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

/** `…Dp`, `…DpId`, `…Datapoint`, `datapoint` — the same rule the generator uses. */
const DP_KEY = /(?:Dp|DpId|Datapoint)$|^datapoint$/;

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

module.exports = { collectDatapointRefs, datapointFindings, EXPECT, LOOSE_ID_TYPES, PLACEHOLDER };
