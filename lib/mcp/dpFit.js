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

/** `…Dp`, `…DpId`, `…Datapoint`, `dp`, `datapoint`, `datapointId` — the generator's rule. */
const DP_KEY = /(?:Dp|DpId|Datapoint|DatapointId)$|^(dp|datapoint(Id)?)$/;

/**
 * Which field of a nested structure holds a state id, per type.
 *
 * `id` is the whole problem, and it has to be answered PER TYPE, not per key
 * name: on a list entry `id` is the datapoint, on a badge, a chip, a chart series
 * or a map marker it is a synthetic key (`b-ph-offline`, `s-tempout`) and the
 * datapoint lives in `dp` or `datapointId` next to it. Listing whole types and
 * then taking any `id`/`dp` reported 23 dead datapoints on a tab that validates
 * clean — and buried the one real finding among them.
 *
 * So: only the fields named here, and only for these types. Fields the schema
 * already marks (`dp` never needed listing — `…Dp`, `datapoint`, `datapointId`
 * carry the flag) are not repeated; this covers exactly what the flag cannot
 * reach.
 */
const LOOSE_DP_FIELDS = {
    // A list row IS its datapoint — except a separator row, which has none.
    StaticListEntry: ['id'],
    AutoListEntry: ['id'],
    // The second line of a row.
    EntrySubDp: ['id'],
    // `dp` on these is schema-flagged; their `id` is a key and must stay out.
    BadgeDef: [],
    ChipItem: [],
    CarouselItem: [],
    MediaChip: [],
    SliderAction: [],
    EChartSeriesConfig: [],
    MapMarker: [],
    MapQuickView: [],
    EnergyEntry: [],
    TrashBin: [],
};

/**
 * A separator row carries no datapoint.
 *
 * The flag is `divider: true` (isDivider in ListWidget) — checking `type` was
 * simply wrong, and every separator therefore arrived as a dead datapoint. The
 * id pattern is kept as a second net because that is what the editor generates
 * for them (`divider:1`).
 */
function isDividerEntry(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return value.divider === true || /^divider[:\-_]/i.test(String(value.id || ''));
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
        // Only the fields this exact type holds a datapoint in, and nothing at all
        // on a separator row.
        const looseFields = opts.loose && typeName && !isDividerEntry(value) ? LOOSE_DP_FIELDS[typeName] || null : null;

        for (const [key, entry] of Object.entries(value)) {
            const sub = fields[key];
            const isDp =
                (sub && sub.datapoint) ||
                (looseFields && looseFields.includes(key)) ||
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
    // Brightness, colour and the on/off state all go out through this widget —
    // it was missing here, so a lamp on a read-only state passed clean.
    light: { writes: true },
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

// ── Controls that are not the widget's own datapoint ────────────────────────
// The check above only ever looked at `widget.datapoint`. A list is one widget
// with twenty controls in it, and a shutter or a lamp writes through named
// fields — none of that was looked at. A switch row on a read-only state
// (hm-rpc SWITCH_TRANSMITTER: write false) validated clean and then did nothing
// at all when pressed, which is the mistake this whole module exists to catch.

/** Row shapes that put a control on the row's own datapoint. */
const WRITING_DISPLAYS = new Set([
    'switch',
    'slider',
    'shutter',
    'stepper',
    'buttons',
    'momentary',
    'states',
    'datepicker',
    'input',
    'select',
]);

/**
 * Named fields a click or a drag writes to.
 *
 * Deliberately not "every field ending in Dp": next to each of these sits an
 * `…ActualDp` / `…ActivityDp` / `statusDp` that is read back from the device and
 * is SUPPOSED to be read-only. Warning about those would train the reader to
 * ignore the warning.
 */
const WRITING_FIELDS = new Set([
    // shutter widget
    'openDp',
    'closeDp',
    'stopDp',
    'tiltDp',
    // shutter row inside a list
    'shutterUpDp',
    'shutterDownDp',
    'shutterStopDp',
    'shutterTiltDp',
    // light widget
    'switchDp',
    'brightnessDp',
    'colorDp',
    'colorHexDp',
    'hueDp',
    'saturationDp',
    'temperatureDp',
    'effectDp',
    'rDp',
    'gDp',
    'bDp',
]);

/** A readable name for a row, for the finding. */
function entryLabel(entry, i) {
    const name = entry && (entry.label || entry.name);
    return `Zeile ${i + 1}${typeof name === 'string' && name ? ` „${name}“` : ''}`;
}

/**
 * Every datapoint this widget WRITES to beyond `widget.datapoint`.
 *
 * @param {object} widget the widget object
 * @returns {{id: string, where: string, what: string}[]}
 */
function writeRefs(widget) {
    const out = [];
    const o = (widget && widget.options) || {};
    const push = (value, where, what) => {
        if (typeof value === 'string' && value.trim() && !PLACEHOLDER.test(value)) {
            out.push({ id: value.trim(), where, what });
        }
    };

    for (const [key, value] of Object.entries(o)) {
        if (WRITING_FIELDS.has(key)) {
            push(value, key, key);
        }
    }

    if (widget && (widget.type === 'list' || widget.type === 'autolist')) {
        // A row without its own displayType follows the list-wide one; 'auto'
        // decides from the role at runtime and is left alone on purpose.
        const fallback = o.entryDisplay;
        const entries = Array.isArray(o.entries) ? o.entries : [];
        entries.forEach((entry, i) => {
            if (!entry || typeof entry !== 'object' || isDividerEntry(entry)) {
                return;
            }
            const display = entry.displayType || fallback;
            if (WRITING_DISPLAYS.has(display)) {
                push(entry.id, entryLabel(entry, i), display);
            }
            for (const [key, value] of Object.entries(entry)) {
                if (WRITING_FIELDS.has(key)) {
                    push(value, `${entryLabel(entry, i)}, ${key}`, key);
                }
            }
        });
    }
    return out;
}

/** What stays empty when nothing is logged — the sentence has to name the damage. */
const EMPTY_CHART = 'das Diagramm bleibt leer';

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
 * @returns {{id: string, path: string, instance: string|undefined, empty: string}[]} one per series
 */
function historyReads(widget) {
    const o = (widget && widget.options) || {};
    if (widget.type === 'chart') {
        const dp = typeof widget.datapoint === 'string' ? widget.datapoint.trim() : '';
        return dp ? [{ id: dp, path: 'datapoint', instance: o.historyInstance, empty: EMPTY_CHART }] : [];
    }
    // The energy balance aggregates over a window per entry — every mode but
    // `last` is a history query. `last` is served from the live state (issue #596),
    // and a bar's totalDatapoint is always read that way.
    if (widget.type === 'energiebilanz') {
        const out = [];
        (Array.isArray(o.bars) ? o.bars : []).forEach((bar, b) => {
            (bar && Array.isArray(bar.entries) ? bar.entries : []).forEach((entry, e) => {
                const mode = (entry && entry.aggregate) || 'last';
                const id = entry && typeof entry.datapointId === 'string' ? entry.datapointId.trim() : '';
                if (mode !== 'last' && id && !PLACEHOLDER.test(id)) {
                    out.push({
                        id,
                        path: `bars[${b}].entries[${e}]${entry.label ? ` „${entry.label}"` : ''} (${mode})`,
                        instance: entry.historyInstance,
                        empty: 'die Auswertung bleibt leer',
                    });
                }
            });
        });
        return out;
    }
    if (widget.type !== 'echart' || o.echartMode === 'json') {
        return [];
    }
    const series = Array.isArray(o.echartSeries) ? o.echartSeries : [];
    // Index first, filter second: the label has to name the series as it is stored,
    // or the JSON series in the middle shifts every number after it by one. The id
    // is what the config calls the series ("s1") and what aura_measure and the
    // editor both show, so it leads — the index is only the fallback.
    return series
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s && (s.source ?? 'history') === 'history' && typeof s.datapointId === 'string')
        .map(({ s, i }) => ({
            id: s.datapointId.trim(),
            path: `${s.id ? `Reihe ${s.id}` : `echartSeries[${i}]`}${s.name ? ` „${s.name}"` : ''}`,
            instance: s.historyInstance,
            empty: EMPTY_CHART,
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
 * @param {string[]} [available] the logging instances this installation actually
 *   has. A datapoint whose custom names `history.0` on a system without that
 *   instance is recorded by nobody — and a history query against it does not fail,
 *   it hangs until the client gives up.
 * @returns {string[]} warnings without a prefix
 */
function historyFindings(widget, meta, available) {
    const warnings = [];
    const installed = Array.isArray(available) ? available : null;
    for (const read of historyReads(widget)) {
        const info = meta.get(read.id);
        // No object read for this id: say nothing rather than guess. `logging`
        // missing entirely means the caller did not look — an empty array means
        // it looked and found nothing.
        if (!info || !Array.isArray(info.logging)) {
            continue;
        }
        const empty = read.empty || EMPTY_CHART;
        if (!info.logging.length) {
            warnings.push(
                `${read.path}: ${read.id} wird von keiner History-Instanz geloggt (kein aktiver ` +
                    `history./influxdb./sql.-Eintrag in common.custom) — ${empty}. Im ioBroker am Objekt die ` +
                    'Aufzeichnung einschalten oder einen geloggten Datenpunkt nehmen.' +
                    (installed && installed.length ? ` Vorhanden: ${installed.join(', ')}.` : ''),
            );
            continue;
        }
        const ghosts = installed ? info.logging.filter((i) => !installed.includes(i)) : [];
        if (ghosts.length === info.logging.length && ghosts.length) {
            warnings.push(
                `${read.path}: ${read.id} wird von keiner existierenden History-Instanz geloggt — eingetragen ist ` +
                    `${ghosts.join(', ')}, diese Instanz gibt es in dieser Installation nicht. Es wird nichts ` +
                    `aufgezeichnet, und eine History-Abfrage darauf läuft ins Leere, ${empty}.` +
                    (installed.length ? ` Vorhanden: ${installed.join(', ')}.` : ' Es ist gar keine installiert.'),
            );
            continue;
        }
        if (read.instance && !info.logging.includes(read.instance)) {
            warnings.push(
                `${read.path}: historyInstance "${read.instance}" zeichnet ${read.id} nicht auf — aktiv ist ` +
                    `${info.logging.join(', ')}. Die Abfrage geht an die falsche Instanz und liefert nichts, ` +
                    `${empty}.`,
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

    // Every other control this widget carries: the rows of a list, the up/stop/
    // down of a shutter, the channels of a lamp. A control on a read-only state
    // is not "might not be accepted" — it does nothing, silently, for ever.
    for (const ref of writeRefs(widget)) {
        const target = meta.get(ref.id);
        if (target && target.write === false) {
            warnings.push(
                `${ref.where}: "${ref.id}" ist im Objekt nur lesbar (write: false), ` +
                    `${ref.what} schreibt aber darauf — das Bedienelement tut beim Klick nichts. ` +
                    'Den schreibbaren Datenpunkt des Geräts nehmen (bei HomeMatic oft ein anderer Kanal).',
            );
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
    writeRefs,
    historyFindings,
    historyReads,
    EXPECT,
    LOOSE_DP_FIELDS,
    PLACEHOLDER,
};
