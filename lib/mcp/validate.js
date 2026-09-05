// Validates a widget or a tab payload against the generated widget schema.
//
// This is the reason the MCP server exists. A model that gets an option name
// wrong today gets no feedback at all: the widget renders, the option is simply
// ignored, and the user is left wondering why "showTitle: no" did nothing. Here
// the same mistake comes back as an error the model can act on.
//
// Pure functions — schema and payload in, findings out. No ioBroker, no I/O, so
// the whole rule set is testable offline.

const { datapointFindings, historyFindings } = require('./dpFit');

/**
 * A value with a placeholder is not a datapoint id.
 *
 * `{{parent}}.ACTUAL` in a row condition, `[[dp]]` in a title: both are resolved
 * per row or per state at runtime. Checked against the id list they would every
 * one of them come back as "does not exist" and refuse a correct write.
 */
const TEMPLATE = /\{\{|\[\[|\$\{/;

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
function checkValue(value, spec, schema, path, errors, ctx = {}) {
    if (value === null || value === undefined || !spec) {
        return;
    }
    const resolved = spec.ref && schema.types[spec.ref] ? { ...schema.types[spec.ref], ...spec } : spec;

    // A datapoint one level down — `statusDp` on a list entry, `datapoint` on a
    // condition clause, `latDp` on a map marker. Only the top-level ones were
    // ever checked, so a typo in a list of twelve entries produced one row that
    // silently shows nothing. Placeholders are resolved per row ({{parent}},
    // {{dp}}) and are not ids.
    if (resolved.datapoint && typeof value === 'string' && value.trim() && ctx.knownDatapoints) {
        const id = value.trim();
        if (!TEMPLATE.test(id) && !ctx.knownDatapoints.has(id)) {
            errors.push(`${path}: Datenpunkt "${id}" gibt es in dieser ioBroker-Installation nicht`);
            return;
        }
    }

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
            value.forEach((entry, i) => checkValue(entry, items, schema, `${path}[${i}]`, errors, ctx));
        }
        return;
    }

    // A discriminated union (ClickAction): the shape depends on `kind`, so the
    // right member is picked first and the value checked against THAT. Until the
    // generator expanded these, an invented kind — the thing a model reaches for
    // when it cannot find the one it wants — passed without a word.
    if (resolved.variants && value && typeof value === 'object') {
        const key = resolved.discriminator || 'kind';
        const kinds = resolved.variants.map((v) => v.value);
        const chosen = value[key];
        if (chosen === undefined) {
            errors.push(`${path}: "${key}" fehlt — erlaubt: ${kinds.join(', ')}`);
            return;
        }
        const hit = resolved.variants.find((v) => v.value === chosen);
        if (!hit) {
            const near = suggest(String(chosen), kinds);
            errors.push(
                `${path}: ${key} "${chosen}" gibt es nicht${near ? ` — meintest du "${near}"?` : ''} — ` +
                    `erlaubt: ${kinds.join(', ')}`,
            );
            return;
        }
        checkFields(value, { [key]: { type: 'string' }, ...(hit.fields || {}) }, schema, path, errors, ctx);
        return;
    }

    if (resolved.fields && value && typeof value === 'object') {
        checkFields(value, resolved.fields, schema, path, errors, ctx);
    }
}

/**
 * Required fields present, unknown fields named, every known one checked.
 *
 * A field the structure does not know goes to `ctx.onUnknownField` when the
 * caller provided one — the same rule as for an unknown option one level up, and
 * for the same reason: a list entry that still carries a field from an older
 * version is inert, not broken, and turning it into an error made the widget
 * unwritable until somebody edited a row nobody had asked about.
 */
function checkFields(value, fields, schema, path, errors, ctx) {
    for (const [key, sub] of Object.entries(fields)) {
        if (sub.required && value[key] === undefined) {
            errors.push(`${path}: "${key}" fehlt`);
        }
    }
    for (const [key, entry] of Object.entries(value)) {
        const sub = fields[key];
        if (!sub) {
            const near = suggest(key, Object.keys(fields));
            const say = `${path}: "${key}" gibt es hier nicht${near ? ` — meintest du "${near}"?` : ''}`;
            if (ctx && typeof ctx.onUnknownField === 'function') {
                ctx.onUnknownField(`${say} und bleibt wirkungslos`);
            } else {
                errors.push(say);
            }
            continue;
        }
        checkValue(entry, sub, schema, `${path}.${key}`, errors, ctx);
    }
}

/**
 * Fields on a list row that only ONE display ever reads.
 *
 * A row is drawn by its `displayType`, and every display reads its own fields.
 * Everything else on the row is dropped in silence: the widget renders, the
 * setting does nothing, and it is only visible in the browser. Reported from
 * use — `trueLabel`/`falseLabel` on a `displayType: "value"` row, which the
 * editor does not even offer there, but a written payload can carry.
 *
 * `reads` is the list of displays that DO read the fields ('auto' included where
 * the display resolves from the datapoint's role). Every row below is verified
 * against the render path (ListWidget / AutoListWidget / entryControls) — do not
 * add one without looking up who reads the field. A finding on a row that works
 * is worse than no finding at all.
 */
const ENTRY_DISPLAY_FIELDS = [
    {
        fields: ['trueLabel', 'falseLabel', 'trueIcon', 'falseIcon'],
        reads: ['switch', 'auto'],
        says:
            'die AN/AUS-Beschriftung wird dort nicht angezeigt; nur "switch" zeigt sie (und "auto" auf einem ' +
            'booleschen Datenpunkt)',
        // The badges layout evaluates the label pair itself for a boolean-ish
        // value, whatever the display says — there they are not dead.
        notForLayouts: ['minimal'],
    },
    {
        fields: ['states'],
        reads: ['states'],
        says: 'die Wertzuordnung wird dort nicht ausgewertet; nur displayType "states" liest sie',
    },
    {
        fields: [
            'presets',
            'presetsSource',
            'presetsDp',
            'presetsValueKey',
            'presetsLabelKey',
            'presetsColorKey',
            'presetsIconKey',
            'presetsImageKey',
            'presetSelect',
        ],
        reads: ['buttons', 'select'],
        says: 'die Vorgabewerte werden dort nicht gezeichnet; nur "buttons" und "select" nutzen sie',
    },
    {
        // `writable: false` is a declaration the frontend only half keeps: the
        // switch and the slider evaluate it (SwitchControl/SliderControl take it
        // as a prop, the slider prints its value instead of the bar), and the
        // `auto` path guards its own toggle. The rich controls never receive it —
        // they draw an operable field on a row declared read-only.
        //
        // `onlyFor` rather than `reads`: on a read display (value, states,
        // contact, time) the flag changes nothing and setting it is harmless
        // intent, not a mistake. It is a lie only where the row draws a control.
        fields: ['writable'],
        onlyFor: ['shutter', 'stepper', 'buttons', 'momentary', 'select', 'input', 'datepicker'],
        onlyValue: false,
        says:
            'die Zeile bleibt trotzdem bedienbar; nur "switch", "slider" und "auto" werten writable aus. ' +
            'Für eine reine Anzeige displayType "value" nehmen (oder "states"/"contact" mit Zuordnung)',
    },
];

/** A field the row does not carry at all, or carries as an empty list. */
function isUnset(value) {
    return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

/** At most six places, then a count — a sixteen-row list must stay readable. */
function places(list) {
    return list.length > 6 ? `${list.slice(0, 6).join(', ')} … (+${list.length - 6})` : list.join(', ');
}

/**
 * Options on a list row that the display chosen for that row never reads.
 *
 * Pure configuration — no schema, no ioBroker: the row says which display it is,
 * and the render path says which fields that display reads.
 */
function entryDisplayFindings(widget) {
    const out = [];
    if (widget.type !== 'list' && widget.type !== 'autolist') {
        return out;
    }
    const opts = widget.options;
    if (!opts || typeof opts !== 'object') {
        return out;
    }
    const rows = [];
    if (Array.isArray(opts.entries)) {
        opts.entries.forEach((entry, i) => {
            if (entry && typeof entry === 'object' && !entry.divider) {
                rows.push({ where: `entries[${i}]`, entry });
            }
        });
    }
    const wide = opts.entryDisplay && typeof opts.entryDisplay === 'object' ? opts.entryDisplay : null;
    // The list-wide block only applies when it names a display of its own
    // (utils/listDisplayDefaults.ts) — without one, nothing in it is read.
    if (wide && !wide.displayType) {
        out.push(
            'Option "entryDisplay" nennt keinen "displayType" — der listenweite Block wird dann gar nicht ' +
                'angewendet, die Zeilen bleiben bei ihrer eigenen Darstellung',
        );
    } else if (wide) {
        rows.push({ where: 'entryDisplay', entry: wide });
    }
    if (!rows.length) {
        return out;
    }

    const layout = widget.layout ?? 'default';
    for (const rule of ENTRY_DISPLAY_FIELDS) {
        if ((rule.notForLayouts || []).includes(layout)) {
            continue;
        }
        // Grouped by display, not one finding per row: a sixteen-row list of the
        // same mistake is one mistake.
        const perDisplay = new Map();
        for (const { where, entry } of rows) {
            const display = entry.displayType || 'auto';
            // `onlyFor` names the displays the finding applies to, `reads` the
            // ones that read the field — the inverse of the same question.
            if (rule.onlyFor ? !rule.onlyFor.includes(display) : rule.reads.includes(display)) {
                continue;
            }
            const set = rule.fields.filter((f) =>
                'onlyValue' in rule ? entry[f] === rule.onlyValue : !isUnset(entry[f]),
            );
            if (!set.length) {
                continue;
            }
            const hit = perDisplay.get(display) || { fields: new Set(), where: [] };
            set.forEach((f) => hit.fields.add(f));
            hit.where.push(where);
            perDisplay.set(display, hit);
        }
        for (const [display, hit] of perDisplay) {
            const onlyWide = hit.where.length === 1 && hit.where[0] === 'entryDisplay';
            const head = onlyWide ? 'Option "entryDisplay"' : `Option "entries" (${places(hit.where)})`;
            out.push(`${head}: ${[...hit.fields].join(' / ')} bei displayType "${display}" — ${rule.says}`);
        }
    }
    return out;
}

/**
 * Colour options a chart resolves against the DOM before painting.
 *
 * eCharts renders on a canvas, which has no CSS: `ctx.fillStyle = 'var(--accent)'`
 * is dropped (measured, the fallback inside the var() included). The widget
 * therefore resolves the value itself now (hooks/useResolvedColors.ts), so a
 * token is as right here as everywhere else — and the one thing left to check is
 * whether the token EXISTS. An unknown one resolves to nothing and the series
 * quietly takes the next palette colour instead.
 */
const TOKEN_COLOR_FIELDS = [{ type: 'echart', option: 'echartSeries', field: 'color', what: 'Serienfarbe' }];

/** Every `--token` a value refers to, the CSS fallback included. */
function tokensIn(value) {
    return typeof value === 'string' ? value.match(/--[\w-]+/g) || [] : [];
}

/**
 * Findings for a colour token this dashboard does not define.
 *
 * Needs `ctx.themeValues` (token → value here) to say anything at all — without
 * it every token is unknown, and guessing would be the false finding this check
 * is meant to prevent. Own variables from Admin → CSS/JS are invisible to the
 * check, so this stays a warning and says so.
 */
function tokenColorFindings(widget, ctx) {
    const out = [];
    const options = (widget && widget.options) || {};
    if (!ctx.themeValues || !ctx.themeValues.size) {
        return out;
    }
    // A variable the widget sets on itself counts as defined — styleOverride is
    // applied to the card, and the chart resolves at its own element.
    const own = new Set(Object.keys(options.styleOverride || {}));
    for (const rule of TOKEN_COLOR_FIELDS) {
        if (widget.type !== rule.type || !Array.isArray(options[rule.option])) {
            continue;
        }
        options[rule.option].forEach((item, i) => {
            const value = item && typeof item === 'object' ? item[rule.field] : undefined;
            const missing = tokensIn(value).filter((t) => !ctx.themeValues.get(t) && !own.has(t));
            if (!missing.length) {
                return;
            }
            out.push(
                `Option "${rule.option}[${i}].${rule.field}": ${missing.join(', ')} ist kein Token dieses ` +
                    `Dashboards — die ${rule.what} fällt dann auf die Palettenfarbe zurück. aura_theme nennt die ` +
                    'Token (eigene CSS-Variablen aus Admin → CSS/JS kennt die Prüfung nicht).',
            );
        });
    }
    return out;
}

/** Does this widget type know that option name (its own or a shared one)? */
function optionSpecFor(type, key, schema) {
    const meta = schema.widgets[type];
    return (meta && meta.options && meta.options[key]) || null;
}

/**
 * Check one widget.
 *
 * `ctx.knownDatapoints` (a Set) turns on the existence check for `datapoint` and
 * for every option the schema flagged as holding a state id. Without it those
 * are only checked for being a non-empty string.
 */
function validateWidget(widget, schema, outerCtx = {}) {
    const path = outerCtx.path ?? 'widget';
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(`${path}: ${m}`);
    const warn = (m) => warnings.push(`${path}: ${m}`);
    // An unknown key one level down is a warning like an unknown option, so the
    // nested checks need somewhere to put it that is not the error list.
    const ctx = { ...outerCtx, onUnknownField: warn };

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

    // The widget's own frame — the one level that used to pass unchecked, so a
    // `mobileOrder: "zwei"` or a stray top-level key went through in silence.
    // `groupDefs` rides along in import payloads without being part of a widget.
    const KNOWN_EXTRA = new Set(['groupDefs']);
    for (const [key, value] of Object.entries(widget)) {
        if (KNOWN_EXTRA.has(key)) {
            continue;
        }
        const spec = schema.widgetConfig[key];
        if (!spec) {
            // The commonest miss by far: an option written one level too high.
            // AURA reads it nowhere, so the write "succeeds" and nothing happens —
            // an error is the only answer that stops that being reported as done.
            if (schema.commonOptions[key] || optionSpecFor(widget.type, key, schema)) {
                err(`"${key}" gehört unter "options", nicht auf die oberste Ebene des Widgets`);
                continue;
            }
            const near = suggest(key, Object.keys(schema.widgetConfig));
            warn(`"${key}" gehört nicht zu einem Widget und wird ignoriert${near ? ` — meintest du "${near}"?` : ''}`);
            continue;
        }
        // id/type/title/datapoint and gridPos have their own, more specific checks.
        if (['id', 'type', 'title', 'datapoint', 'gridPos', 'options', 'layout'].includes(key)) {
            continue;
        }
        const frame = [];
        checkValue(value, spec, schema, `"${key}"`, frame, ctx);
        frame.forEach(err);
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
        // The screen the user drew with the guidelines (lib/mcp/canvas.js). Unlike
        // the column count below this is not derived from what happens to be
        // there — it is what the target device can show. Still a warning: the
        // chrome heights behind it are estimates, and a dashboard is allowed to
        // scroll as long as that is a decision and not an accident.
        const tooWideForScreen =
            ctx.maxCols && Number.isInteger(gp.x) && Number.isInteger(gp.w) && gp.x + gp.w > ctx.maxCols;
        if (tooWideForScreen) {
            warn(
                `gridPos.x + gridPos.w = ${gp.x + gp.w} reicht über die Hilfslinie hinaus ` +
                    `(${ctx.maxCols} Spalten passen auf den Zielbildschirm) — dort muss dann waagerecht ` +
                    'gescrollt werden.',
            );
        }
        if (ctx.maxRows && Number.isInteger(gp.y) && Number.isInteger(gp.h) && gp.y + gp.h > ctx.maxRows) {
            warn(
                `gridPos.y + gridPos.h = ${gp.y + gp.h} endet unterhalb der Hilfslinie ` +
                    `(${ctx.maxRows} Zeilen passen auf den Zielbildschirm) — dieses Widget ist erst nach dem ` +
                    'Scrollen zu sehen.',
            );
        }
        if (
            !tooWideForScreen &&
            ctx.columns &&
            Number.isInteger(gp.x) &&
            Number.isInteger(gp.w) &&
            gp.x + gp.w > ctx.columns
        ) {
            // Said only when the guidelines have not already said it, better.
            // Only a warning: the column count is derived from the widest widget
            // present, and the frontend raises the grid to fit whatever it finds
            // (effectiveCols = max(cols, minCols)). On a thin dashboard the number
            // is small by accident — refusing would block the very build-up this
            // server exists for. Too wide still costs horizontal room, hence the note.
            warn(
                `gridPos.x + gridPos.w = ${gp.x + gp.w} ist breiter als das bisher Vorhandene ` +
                    `(${ctx.columns} Spalten). Das Raster wächst mit, auf schmalen Geräten wird es eng.`,
            );
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
                    // A warning, not an error, and the difference matters more than
                    // it sounds: the rules run over the WHOLE widget, so one option
                    // that has been renamed since it was written made the widget
                    // unwritable — a pure gridPos nudge came back "liest die Option
                    // showEntryLastChange nicht" and there was no way to move the
                    // widget without also editing something the caller had not been
                    // asked about. Reported from a dashboard where 52 such leftovers
                    // (copied widgets, options dropped over several versions) locked
                    // an entire tab.
                    //
                    // Nothing is lost by letting it through: AURA ignores what it
                    // does not read, so the option was already dead before the
                    // write. A wrong TYPE on a known option stays an error, because
                    // there the widget does read the key and would get a value it
                    // cannot use.
                    const near = suggest(key, Object.keys(allowed));
                    warn(
                        `${widget.type} liest die Option "${key}" nicht — sie bleibt wirkungslos` +
                            `${near ? ` — meintest du "${near}"?` : ''}. Mit "${key}": null entfernen.`,
                    );
                    continue;
                }
                if (value === null || value === undefined) {
                    continue;
                }
                // The key is in the schema AND the widget still does not read it:
                // it reads it on some layouts only. Reported from use with
                // mediaplayer.showTitle — accepted without a word, ignored by the
                // player, and the model had no way to find out short of looking
                // at the dashboard. `onlyLayouts` in the schema names the layouts
                // where the option does something.
                if (Array.isArray(spec.onlyLayouts) && !spec.onlyLayouts.includes(widget.layout ?? 'default')) {
                    warn(
                        `${widget.type} liest "${key}" nur im Layout ${spec.onlyLayouts.map((l) => `"${l}"`).join(' oder ')}` +
                            ` — dieses Widget hat Layout "${widget.layout ?? 'default'}", die Option bleibt wirkungslos`,
                    );
                }
                // Descends into conditions, clauses, badges and the like.
                const nested = [];
                checkValue(value, spec, schema, `Option "${key}"`, nested, ctx);
                if (nested.length) {
                    nested.forEach(err);
                    continue;
                }
                // The datapoint of a flagged option is checked inside checkValue,
                // together with the nested ones and with the same exemption for
                // template placeholders.
            }
        }
    }

    // The custom layout renders whatever `customGrid` describes. Without one it
    // falls back to a 3x3 of empty cells — a blank card, with nothing anywhere
    // saying why.
    if (widget.layout === 'custom' && !opts?.customGrid) {
        warn('layout "custom" ohne "customGrid" ergibt ein leeres Widget (3×3 leere Zellen)');
    }

    // A row option the chosen display never reads. Pure configuration, so this
    // runs without a single ioBroker read — unlike the datapoint checks below.
    entryDisplayFindings(widget).forEach(warn);

    // A colour token this dashboard does not define. A warning, not an error:
    // the chart still draws (with a palette colour), and a variable defined in
    // Admin → CSS/JS is not visible from here.
    tokenColorFindings(widget, ctx).forEach(warn);

    // Group-like widgets carry their children in a separate store.
    if (['group', 'panels', 'universal'].includes(widget.type) && !opts?.defId) {
        warn(
            `${widget.type} hat keine "defId" — die Kinder liegen in aura-group-defs und müssen beim Import ` +
                'über das Feld "groupDefs" mitkommen',
        );
    }

    // Does the datapoint fit the widget? Only when the caller looked the objects
    // up — always warnings, because the object is a declaration and not the truth.
    if (ctx.datapointMeta) {
        // The chart mistake first: a series on a datapoint nobody logs draws an
        // empty frame for ever, and every other check on it passes.
        historyFindings(widget, ctx.datapointMeta, ctx.loggingInstances).forEach(warn);
        datapointFindings(widget, schema, ctx.datapointMeta).forEach(warn);
    }

    return { errors, warnings };
}

/** Two grid rectangles overlap. */
function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Pack the widgets upward the way the frontend does — a port of
 * utils/gridCompact.ts, which is itself react-grid-layout's compactType
 * 'vertical'.
 *
 * This is what makes a stored overlap invisible: outside the editor the
 * dashboard never renders the y-values it has, it renders these. So a tab can
 * look perfectly correct and still carry three overlaps in its configuration —
 * which is how a dashboard ends up unwritable over positions nobody chose.
 *
 * @param widgets the widget list, not modified
 * @returns a new list with the same widgets and their rendered y
 */
function verticalCompact(widgets) {
    const sorted = [...widgets].sort((a, b) => {
        const ga = (a && a.gridPos) || {};
        const gb = (b && b.gridPos) || {};
        return ga.y !== gb.y ? ga.y - gb.y : ga.x - gb.x;
    });
    const placed = [];
    for (const item of sorted) {
        const gp = (item && item.gridPos) || {};
        let y = 0;
        while (
            placed.some((p) => {
                const q = p.gridPos;
                return q.x < gp.x + gp.w && q.x + q.w > gp.x && q.y < y + gp.h && q.y + q.h > y;
            })
        ) {
            y++;
        }
        placed.push({ ...item, gridPos: { ...gp, y } });
    }
    return placed;
}

/** The four numbers of a gridPos as one comparable string. */
function gridPosKey(gp) {
    return gp && typeof gp === 'object' ? `${gp.x},${gp.y},${gp.w},${gp.h}` : '';
}

/**
 * The widget list a payload carries, in every shape the write tools accept —
 * `null` when it carries none (a single widget).
 *
 * Reported from use: `aura_validate` answered "widget: kein Objekt" to a bare
 * widget ARRAY and demanded an aura-tab envelope, while `aura_write_tab` took
 * that very array in the same conversation. The same input cannot be valid for
 * one tool and not an object for the other.
 */
function widgetListOf(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    if (Array.isArray(payload.widgets)) {
        return payload.widgets;
    }
    if (payload.tab && Array.isArray(payload.tab.widgets)) {
        return payload.tab.widgets;
    }
    return null;
}

/**
 * The rules that are about the RESULT rather than about one widget: every widget
 * on its own, plus the duplicate ids and the overlaps that only show up between
 * them.
 *
 * `ctx.strictIndices` limits the per-widget rules to the widgets the caller is
 * actually contributing. Adding one widget to an existing tab must not fail
 * because some widget authored three versions ago carries an option that has
 * since been renamed — that would make a grown dashboard unwritable. Position
 * checks and duplicate ids still span the whole list, because those are
 * properties of the result.
 */
function validateWidgetList(widgets, schema, ctx = {}) {
    const errors = [];
    const warnings = [];
    const strict = ctx.strictIndices ? new Set(ctx.strictIndices) : null;
    const seen = new Set();
    widgets.forEach((w, i) => {
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

    // Overlaps — outside the editor the frontend packs the widgets upward, so a
    // stored overlap is not visible on the dashboard, but in the EDITOR it is:
    // the stored y is what is drawn there, and react-grid-layout starts pushing
    // widgets around as soon as one is touched.
    //
    // `ctx.baselineWidgets` is what is stored right now. An overlap between two
    // widgets whose gridPos this write does not touch was already there and stays
    // a warning — otherwise a tab that has carried an overlap for months (three
    // of them, reported from a working Startseite) refuses every change,
    // including the one that would fix it. An overlap the write CREATES or moves
    // into stays an error.
    const baseline = new Map();
    for (const w of ctx.baselineWidgets || []) {
        if (w && typeof w.id === 'string') {
            baseline.set(w.id, gridPosKey(w.gridPos));
        }
    }
    const untouched = (box) =>
        typeof box.id === 'string' && baseline.has(box.id) && baseline.get(box.id) === gridPosKey(box.gp);

    const boxes = widgets
        .map((w, i) => ({ i, id: w?.id, gp: w?.gridPos }))
        .filter((b) => b.gp && ['x', 'y', 'w', 'h'].every((k) => Number.isInteger(b.gp[k])));
    for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
            if (!overlaps(boxes[a].gp, boxes[b].gp)) {
                continue;
            }
            const say =
                `widgets[${boxes[a].i}] ("${boxes[a].id}") und widgets[${boxes[b].i}] ("${boxes[b].id}") ` +
                'überlappen sich im Raster';
            if (untouched(boxes[a]) && untouched(boxes[b])) {
                warnings.push(
                    `${say} — das stand vorher schon so und bleibt unverändert. Im Frontend fällt es nicht ` +
                        'auf (die Widgets werden nach oben zusammengeschoben), im Editor schon. ' +
                        'aura_compact schreibt die gerenderten Positionen fest.',
                );
            } else {
                errors.push(say);
            }
        }
    }
    return { errors, warnings };
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
    // A name belongs to the import ENVELOPE. A plain `{ widgets: [...] }` is the
    // list the write tools take, and there the name comes from the target tab —
    // demanding one there would refuse what aura_write_tab accepts.
    if (payload._type === 'aura-tab' && (typeof tab.name !== 'string' || !tab.name)) {
        errors.push('Tab: "name" fehlt');
    }
    if (!Array.isArray(tab.widgets)) {
        return { errors: [...errors, 'Tab: "widgets" fehlt oder ist kein Array'], warnings };
    }

    const res = validateWidgetList(tab.widgets, schema, ctx);
    return { errors: [...errors, ...res.errors], warnings: [...warnings, ...res.warnings] };
}

/** Validate whichever of the two shapes was handed in. */
function validateAny(payload, schema, ctx = {}) {
    // A bare array is what aura_write_tab takes, so this takes it too — without
    // an envelope to check, it is the list rules and nothing else.
    if (Array.isArray(payload)) {
        return validateWidgetList(payload, schema, ctx);
    }
    const looksLikeTab = !!payload && typeof payload === 'object' && widgetListOf(payload) !== null;
    return looksLikeTab || (payload && payload._type === 'aura-tab')
        ? validateTab(payload, schema, ctx)
        : validateWidget(payload, schema, ctx);
}

module.exports = {
    allowedOptions,
    overlaps,
    verticalCompact,
    widgetListOf,
    tokenColorFindings,
    entryDisplayFindings,
    validateAny,
    validateTab,
    validateWidget,
};
