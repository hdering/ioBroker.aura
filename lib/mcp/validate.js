// Validates a widget or a tab payload against the generated widget schema.
//
// This is the reason the MCP server exists. A model that gets an option name
// wrong today gets no feedback at all: the widget renders, the option is simply
// ignored, and the user is left wondering why "showTitle: no" did nothing. Here
// the same mistake comes back as an error the model can act on.
//
// Pure functions — schema and payload in, findings out. No ioBroker, no I/O, so
// the whole rule set is testable offline.

/** Levenshtein distance, capped: only used to suggest a near-miss option name. */
function distance(a, b) {
    if (Math.abs(a.length - b.length) > 4) {
        return 99;
    }
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length];
}

/** The closest known name, when it is close enough to be worth naming. */
function suggest(name, candidates) {
    let best = null;
    let bestD = 3;
    const lower = name.toLowerCase();
    for (const c of candidates) {
        const d = distance(lower, c.toLowerCase());
        if (d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return best;
}

/** Every option key a widget of this type accepts, own plus shared. */
function allowedOptions(type, schema) {
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

function typeMatches(value, spec) {
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    for (const t of types) {
        if (t === 'string' && typeof value === 'string') return true;
        if (t === 'number' && typeof value === 'number') return true;
        if (t === 'boolean' && typeof value === 'boolean') return true;
        if (t === 'array' && Array.isArray(value)) return true;
        if (t === 'object' && value && typeof value === 'object' && !Array.isArray(value)) return true;
        if (!t) return true; // schema could not determine a type — accept anything
    }
    return false;
}

/**
 * Check one value against its spec, following refs into nested structures.
 *
 * The flat check that used to live here only looked at the top level of
 * `options`. A condition with a misspelled operator, an unknown effect name or a
 * stray field inside `clauses` sailed straight through — precisely what the
 * validator exists to catch, and invisible afterwards because AURA ignores what
 * it does not understand.
 *
 * Only structures the schema actually describes are checked. A type it could not
 * resolve carries no `fields`, and an unknown-key rule there would reject
 * perfectly good configuration.
 */
function checkValue(value, spec, schema, path, errors) {
    if (value === null || value === undefined || !spec) {
        return;
    }
    const resolved = spec.ref && schema.types[spec.ref] ? { ...schema.types[spec.ref], ...spec } : spec;

    if (resolved.enum) {
        // A mixed union ('sm' | 'md' | number) constrains only its string half.
        const stringOnly = !Array.isArray(resolved.type) || resolved.type.length === 1;
        if ((stringOnly || typeof value === 'string') && !resolved.enum.includes(value)) {
            errors.push(`${path}: "${value}" ist nicht erlaubt — erlaubt: ${resolved.enum.join(', ')}`);
            return;
        }
        if (stringOnly) {
            return;
        }
    }

    if (!typeMatches(value, resolved)) {
        const want = Array.isArray(resolved.type) ? resolved.type.join('|') : resolved.type;
        errors.push(`${path}: ${Array.isArray(value) ? 'array' : typeof value} übergeben, erwartet ${want}`);
        return;
    }

    if (Array.isArray(value)) {
        const items = resolved.items || (spec.ref && schema.types[spec.ref] ? schema.types[spec.ref].items : null);
        if (items) {
            value.forEach((entry, i) => checkValue(entry, items, schema, `${path}[${i}]`, errors));
        }
        return;
    }

    const fields = resolved.fields;
    if (fields && value && typeof value === 'object') {
        for (const [key, sub] of Object.entries(fields)) {
            if (sub.required && value[key] === undefined) {
                errors.push(`${path}: "${key}" fehlt`);
            }
        }
        for (const [key, entry] of Object.entries(value)) {
            const sub = fields[key];
            if (!sub) {
                const near = suggest(key, Object.keys(fields));
                errors.push(`${path}: "${key}" gibt es hier nicht${near ? ` — meintest du "${near}"?` : ''}`);
                continue;
            }
            checkValue(entry, sub, schema, `${path}.${key}`, errors);
        }
    }
}

/**
 * Check one widget.
 *
 * `ctx.knownDatapoints` (a Set) turns on the existence check for `datapoint` and
 * for every option the schema flagged as holding a state id. Without it those
 * are only checked for being a non-empty string.
 */
function validateWidget(widget, schema, ctx = {}) {
    const path = ctx.path ?? 'widget';
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(`${path}: ${m}`);
    const warn = (m) => warnings.push(`${path}: ${m}`);

    if (!widget || typeof widget !== 'object' || Array.isArray(widget)) {
        return { errors: [`${path}: kein Objekt`], warnings: [] };
    }

    for (const field of ['id', 'type', 'title']) {
        if (typeof widget[field] !== 'string' || !widget[field]) {
            err(`"${field}" fehlt oder ist kein nicht-leerer String`);
        }
    }
    if (typeof widget.datapoint !== 'string') {
        err('"datapoint" fehlt (Leerstring bei Typen ohne Datenpunkt)');
    }

    const meta = schema.widgets[widget.type];
    if (!meta) {
        const near = suggest(String(widget.type ?? ''), Object.keys(schema.widgets));
        err(`unbekannter Typ "${widget.type}"${near ? ` — meintest du "${near}"?` : ''}`);
        return { errors, warnings };
    }

    // gridPos
    const gp = widget.gridPos;
    if (!gp || typeof gp !== 'object') {
        err('"gridPos" fehlt');
    } else {
        for (const k of ['x', 'y', 'w', 'h']) {
            const v = gp[k];
            if (typeof v !== 'number' || !Number.isInteger(v)) {
                err(`gridPos.${k} muss eine ganze Zahl sein`);
            }
        }
        if (Number.isInteger(gp.x) && gp.x < 0) err('gridPos.x darf nicht negativ sein');
        if (Number.isInteger(gp.y) && gp.y < 0) err('gridPos.y darf nicht negativ sein');
        if (Number.isInteger(gp.w) && gp.w < 1) err('gridPos.w muss mindestens 1 sein');
        if (Number.isInteger(gp.h) && gp.h < 1) err('gridPos.h muss mindestens 1 sein');
        if (ctx.columns && Number.isInteger(gp.x) && Number.isInteger(gp.w) && gp.x + gp.w > ctx.columns) {
            err(`gridPos.x + gridPos.w = ${gp.x + gp.w} überschreitet die ${ctx.columns} Spalten des Dashboards`);
        }
    }

    // layout
    if (widget.layout !== undefined) {
        if (!meta.layouts.includes(widget.layout)) {
            err(`layout "${widget.layout}" gibt es für ${widget.type} nicht — erlaubt: ${meta.layouts.join(', ')}`);
        }
    }

    // datapoint vs. addMode
    const dp = typeof widget.datapoint === 'string' ? widget.datapoint.trim() : '';
    if (meta.addMode === 'datapoint' && !dp) {
        err(`${widget.type} braucht einen Datenpunkt, "datapoint" ist leer`);
    }
    if (meta.addMode === 'free' && dp) {
        warn(`${widget.type} wertet "datapoint" nicht aus — "${dp}" bleibt wirkungslos`);
    }
    if (dp && ctx.knownDatapoints && !ctx.knownDatapoints.has(dp)) {
        err(`Datenpunkt "${dp}" gibt es in dieser ioBroker-Installation nicht`);
    }

    // options
    const allowed = allowedOptions(widget.type, schema);
    const opts = widget.options;
    if (opts !== undefined) {
        if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
            err('"options" muss ein Objekt sein');
        } else {
            for (const [key, value] of Object.entries(opts)) {
                const spec = allowed[key];
                if (!spec) {
                    const near = suggest(key, Object.keys(allowed));
                    err(
                        `${widget.type} liest die Option "${key}" nicht` + `${near ? ` — meintest du "${near}"?` : ''}`,
                    );
                    continue;
                }
                if (value === null || value === undefined) {
                    continue;
                }
                // Descends into conditions, clauses, badges and the like.
                const nested = [];
                checkValue(value, spec, schema, `Option "${key}"`, nested);
                if (nested.length) {
                    nested.forEach(err);
                    continue;
                }
                if (spec.datapoint && typeof value === 'string' && value.trim()) {
                    if (ctx.knownDatapoints && !ctx.knownDatapoints.has(value.trim())) {
                        err(`Option "${key}": Datenpunkt "${value}" gibt es nicht`);
                    }
                }
            }
        }
    }

    // Group-like widgets carry their children in a separate store.
    if (['group', 'panels', 'universal'].includes(widget.type) && !opts?.defId) {
        warn(
            `${widget.type} hat keine "defId" — die Kinder liegen in aura-group-defs und müssen beim Import ` +
                'über das Feld "groupDefs" mitkommen',
        );
    }

    return { errors, warnings };
}

/** Two grid rectangles overlap. */
function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Check a whole tab payload — either the `aura-tab` envelope the import dialog
 * expects, or a bare `{ name, widgets }`.
 *
 * `ctx.strictIndices` limits the per-widget rules to the widgets the caller is
 * actually contributing. Adding one widget to an existing tab must not fail
 * because some widget authored three versions ago carries an option that has
 * since been renamed — that would make a grown dashboard unwritable. Position
 * checks (overlaps) and duplicate ids still span the whole tab, because those
 * are properties of the result, not of one widget.
 */
function validateTab(payload, schema, ctx = {}) {
    const errors = [];
    const warnings = [];

    if (!payload || typeof payload !== 'object') {
        return { errors: ['Tab: kein Objekt'], warnings: [] };
    }
    const tab = payload.tab ?? payload;
    if (payload._type !== undefined && payload._type !== 'aura-tab') {
        errors.push(`Tab: "_type" ist "${payload._type}", erwartet "aura-tab"`);
    }
    if (typeof tab.name !== 'string' || !tab.name) {
        errors.push('Tab: "name" fehlt');
    }
    if (!Array.isArray(tab.widgets)) {
        return { errors: [...errors, 'Tab: "widgets" fehlt oder ist kein Array'], warnings };
    }

    const strict = ctx.strictIndices ? new Set(ctx.strictIndices) : null;
    const seen = new Set();
    tab.widgets.forEach((w, i) => {
        if (!strict || strict.has(i)) {
            const res = validateWidget(w, schema, { ...ctx, path: `widgets[${i}]` });
            errors.push(...res.errors);
            warnings.push(...res.warnings);
        }
        if (typeof w?.id === 'string') {
            if (seen.has(w.id)) {
                errors.push(`widgets[${i}]: id "${w.id}" kommt mehrfach vor`);
            }
            seen.add(w.id);
        }
    });

    // Overlaps — react-grid-layout would silently push widgets around.
    const boxes = tab.widgets
        .map((w, i) => ({ i, id: w?.id, gp: w?.gridPos }))
        .filter((b) => b.gp && ['x', 'y', 'w', 'h'].every((k) => Number.isInteger(b.gp[k])));
    for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
            if (overlaps(boxes[a].gp, boxes[b].gp)) {
                errors.push(
                    `widgets[${boxes[a].i}] ("${boxes[a].id}") und widgets[${boxes[b].i}] ("${boxes[b].id}") ` +
                        'überlappen sich im Raster',
                );
            }
        }
    }

    return { errors, warnings };
}

/** Validate whichever of the two shapes was handed in. */
function validateAny(payload, schema, ctx = {}) {
    const looksLikeTab =
        payload && typeof payload === 'object' && (payload._type === 'aura-tab' || Array.isArray(payload.widgets));
    return looksLikeTab ? validateTab(payload, schema, ctx) : validateWidget(payload, schema, ctx);
}

module.exports = { allowedOptions, validateAny, validateTab, validateWidget };
