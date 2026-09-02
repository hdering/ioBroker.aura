'use strict';

/**
 * Reads a finished tab and names what would make it a better dashboard.
 *
 * The recipes help when something is being built. They do nothing for the tabs
 * that already exist — and those are where the problem is visible: a row of bare
 * value tiles per room, numbers with no good or bad range, a counter shown as its
 * raw reading. A model has no eyes on the rendered page, so it cannot notice any
 * of that on its own; this turns the configuration into findings it can act on.
 *
 * Only mechanical, checkable observations. Every finding names the widgets it is
 * about and the recipe that fixes it, so it can be confirmed against the JSON
 * rather than believed. Taste stays with the user: this is a list of suggestions,
 * never an edit.
 *
 * Pure functions — widgets in, findings out. No ioBroker, no I/O.
 */

/** Widget types that show or switch exactly one datapoint. The tile-row material. */
const SINGLE_VALUE_TYPES = new Set([
    'value',
    'switch',
    'dimmer',
    'binarysensor',
    'windowcontact',
    'stateimage',
    'slider',
    'button',
]);

/** Types that report a contact-like state — the material of a status overview. */
const CONTACT_TYPES = new Set(['windowcontact', 'binarysensor']);

/** Widget types whose whole job is to print a number. */
const NUMERIC_TYPES = new Set(['value', 'gauge', 'fill', 'knob']);

/** Units that mark a rising meter: energy and volume, never a rate. */
const COUNTER_UNITS = new Set(['kwh', 'wh', 'mwh', 'kvarh', 'varh', 'm³', 'm3', 'l', 'ml', 'gal', 'ft³']);

/**
 * Units of an instantaneous reading.
 *
 * The whole point of listing them: `…consumption` in **W** is a power reading,
 * not a meter, and suggesting a delta aggregation for it is advice about a
 * different datapoint. The name said "consumption" and the old rule believed it.
 */
const RATE_UNITS = new Set([
    'w',
    'kw',
    'mw',
    'va',
    'kva',
    'var',
    'a',
    'ma',
    'v',
    'mv',
    'hz',
    '%',
    '°c',
    '°f',
    'k',
    'hpa',
    'mbar',
    'bar',
    'pa',
    'lx',
    'db',
    'ppm',
    'l/min',
    'l/h',
    'm³/h',
    'km/h',
    'm/s',
]);

/** Roles that can never be a meter reading, whatever the datapoint is called. */
const RATE_ROLES =
    /^value\.(power|current|voltage|frequency|temperature|humidity|pressure|brightness|speed|distance|level|battery|valve|blind|window|lock|default)/i;

/** Roles that say "meter" outright. */
const COUNTER_ROLES = /(counter|value\.energy|value\.water|value\.gas|meter)/i;

/** Id fragments that suggest a meter — only trusted when nothing else is known. */
const COUNTER_WORDS = /(total|counter|zaehler|zähler|meter|verbrauch|consumption|energy)/i;

/**
 * Is this widget showing a rising meter rather than a measurement?
 *
 * Evidence first, name last. A unit — from the widget or from the object —
 * settles it in both directions; a role settles it; only when neither is known
 * does the datapoint id get a vote, because a blind guess from the name is what
 * produced "Momentanleistung in W as a meter reading".
 *
 * @param {object} widget the widget
 * @param {Map<string, object>} [meta] id → object metadata (unit, role)
 * @returns {boolean} true when a delta aggregation is the better display
 */
function looksLikeCounter(widget, meta) {
    const o = opts(widget);
    const info = (meta && meta.get(String(widget.datapoint || ''))) || null;
    const unit = String(o.unit || (info && info.unit) || '')
        .trim()
        .toLowerCase();
    const role = String((info && info.role) || '');

    if (unit) {
        if (COUNTER_UNITS.has(unit)) {
            return true;
        }
        if (RATE_UNITS.has(unit)) {
            return false;
        }
    }
    if (role) {
        if (COUNTER_ROLES.test(role)) {
            return true;
        }
        if (RATE_ROLES.test(role)) {
            return false;
        }
    }
    // Nothing to go on but the name — and only when there is no unit either way.
    return !unit && !role && COUNTER_WORDS.test(String(widget.datapoint || ''));
}

/** How many single-value tiles in one tab stop being a layout and become a list. */
const TILE_ROW_LIMIT = 5;

/** How many contact tiles are worth one status overview instead. */
const CONTACT_LIMIT = 3;

/**
 * The device a datapoint belongs to: everything but the last segment.
 *
 * @param {string} id a datapoint id
 * @returns {string} the parent path, empty when there is none
 */
function parentOf(id) {
    const s = String(id || '');
    const cut = s.lastIndexOf('.');
    return cut > 0 ? s.slice(0, cut) : '';
}

function opts(widget) {
    return (widget && widget.options) || {};
}

function has(value) {
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '';
}

/**
 * Does this tile carry its own meaning?
 *
 * The two rules were pulling against each other. Rule 3 asks a bare number for a
 * threshold, a condition or a badge; rule 1 then proposed to fold the tile into a
 * list row, which is exactly where that individual reaction is lost. Reported from
 * the field on a deliberate KPI row — five tiles that react one by one through
 * `conditions[].elements` (icon, title and value styled per tile). A list row
 * cannot reproduce that per row, so the suggestion asked for a worse dashboard,
 * and it asked again on every review.
 *
 * A configured tile is therefore not list material. It is not a judgement about
 * how good the configuration is — only that someone deliberately gave this one
 * tile a behaviour of its own, which is the thing a list cannot carry along.
 */
function isConfiguredTile(widget) {
    const o = opts(widget);
    return has(o.conditions) || has(o.colorThresholds) || has(o.badges) || has(o.zones) || Boolean(o.colorZones);
}

/**
 * Widget ids, capped so one finding cannot fill the answer.
 *
 * @param {string[]} ids the ids to print
 * @param {number} max how many before the rest is summarised
 * @returns {string} a comma-separated list
 */
function idList(ids, max = 12) {
    return ids.length > max ? `${ids.slice(0, max).join(', ')} … (+${ids.length - max})` : ids.join(', ');
}

/**
 * Look over one tab's widgets.
 *
 * @param {object[]} widgets the widgets of a tab, popup view or group
 * @param {Map<string, object>} [meta] id → object metadata (unit, role), so a
 *   reading is told from a meter by evidence rather than by its name
 * @returns {object[]} findings, most worthwhile first
 */
function reviewWidgets(widgets, meta) {
    const list = Array.isArray(widgets) ? widgets.filter((w) => w && typeof w === 'object') : [];
    const findings = [];
    const add = (id, what, why, recipe, affected) =>
        findings.push({ id, what, why, recipe, widgets: (affected || []).map((w) => w.id) });

    if (!list.length) {
        return findings;
    }

    // 1. A row of single-value tiles. Three lamps are a layout; ten are a list
    //    nobody wants to maintain — and a list widget picks up new devices itself.
    //    Only the PLAIN ones count: a tile with its own thresholds or conditions is
    //    a KPI, and folding it into a list row would throw that away. See
    //    isConfiguredTile.
    const tiles = list.filter((w) => SINGLE_VALUE_TYPES.has(w.type));
    const plainTiles = tiles.filter((w) => !isConfiguredTile(w));
    const configured = tiles.length - plainTiles.length;
    if (plainTiles.length >= TILE_ROW_LIMIT) {
        const devices = new Set(plainTiles.map((w) => parentOf(w.datapoint)).filter(Boolean));
        add(
            'tile-row',
            `${plainTiles.length} Einzelkacheln für je einen Datenpunkt`,
            [
                'Das ist der Fall, für den es die Listen-Widgets gibt: eine autolist übernimmt sie aus Raum und',
                `Gewerk und nimmt neue Geräte von selbst auf, eine list bildet dieselben ${plainTiles.length}`,
                'Zeilen mit je eigenem Bedienelement ab.',
                ...(devices.size > 1 ? [`Betroffen sind ${devices.size} Geräte.`] : []),
                ...(configured
                    ? [
                          `${configured} weitere Kachel(n) haben eigene Schwellen oder Bedingungen und sind`,
                          'ausgenommen — die reagieren einzeln, das kann eine Listenzeile nicht.',
                      ]
                    : []),
            ].join(' '),
            plainTiles.length > 8 ? 'raum-liste' : 'geraete-liste',
            plainTiles,
        );
    }

    // 2. Contact tiles. What the user wants to know is "ist noch was offen?", and
    //    that is one widget, not one per window.
    const contacts = list.filter((w) => CONTACT_TYPES.has(w.type));
    if (contacts.length >= CONTACT_LIMIT && !list.some((w) => w.type === 'statusoverview')) {
        add(
            'contacts-without-overview',
            `${contacts.length} einzelne Kontakt-Kacheln, keine Statusübersicht`,
            'Die Statusübersicht findet Fenster, Türen, leere Batterien und offline-Geräte selbst und meldet ' +
                'ausdrücklich, wenn nichts ansteht — die Einzelkacheln zeigen dagegen die ganze Zeit "zu".',
            'status',
            contacts,
        );
    }

    // 3. A number with no good and no bad. The value is readable; whether it is
    //    fine is not, and that is the whole reason it is on a dashboard.
    const flatNumbers = list.filter(
        (w) =>
            NUMERIC_TYPES.has(w.type) &&
            !has(opts(w).colorThresholds) &&
            !has(opts(w).conditions) &&
            !has(opts(w).badges) &&
            !has(opts(w).zones) &&
            !opts(w).colorZones,
    );
    if (flatNumbers.length) {
        add(
            'value-without-meaning',
            `${flatNumbers.length} Zahl${flatNumbers.length === 1 ? '' : 'en'} ohne guten oder schlechten Bereich`,
            'Weder colorThresholds noch eine condition noch ein badge: die Kachel zeigt den Wert, sagt aber ' +
                'nicht, ob er in Ordnung ist. Genau dafür steht sie auf dem Dashboard.',
            'wert-kachel',
            flatNumbers,
        );
    }

    // 4. A meter printed as its reading. "Stromzähler: 48213 kWh" tells nobody
    //    anything; the consumption per day does.
    const counters = list.filter((w) => w.type === 'value' && looksLikeCounter(w, meta));
    if (counters.length) {
        add(
            'counter-as-reading',
            `${counters.length} Zählerstand statt Verbrauch`,
            'Ein steigender Zähler als nackte Zahl ist nicht ablesbar. Als echart mit aggregate "delta" wird ' +
                'daraus der Verbrauch je Tag, Monat oder Jahr.',
            'verbrauch',
            counters,
        );
    }

    // 5. Bar series without an aggregation. The bars then show the reading at the
    //    bucket edge, which for a counter is the same wrong number as above.
    const rawBars = list.filter(
        (w) =>
            w.type === 'echart' &&
            Array.isArray(opts(w).echartSeries) &&
            opts(w).echartSeries.some((s) => s && s.chartType === 'bar' && !s.aggregate),
    );
    if (rawBars.length) {
        add(
            'bars-without-aggregate',
            'Balkenreihe ohne aggregate',
            'Ohne aggregate zeigt ein Balken den Messwert am Bucket-Rand. Für einen Zähler ist "delta" ' +
                'gemeint, für eine Messreihe "average", "max" oder "min".',
            'verbrauch',
            rawBars,
        );
    }

    // 6. A thermostat that cannot say how warm it actually is.
    const blindThermostats = list.filter((w) => w.type === 'thermostat' && !opts(w).actualDatapoint);
    if (blindThermostats.length) {
        add(
            'thermostat-without-actual',
            'Thermostat ohne Ist-Temperatur',
            'Ohne actualDatapoint zeigt das Widget nur den Sollwert — ob geheizt wird, steht nirgends.',
            'heizung',
            blindThermostats,
        );
    }

    // 7. A list that is a list of names. The second line and the row rules are
    //    what make it worth more than the tiles it replaced.
    const flatLists = list.filter(
        (w) =>
            (w.type === 'autolist' || w.type === 'list') &&
            !has(opts(w).rowConditions) &&
            !has(opts(w).subDpTemplate) &&
            !(opts(w).entries || []).some((e) => has(e && e.subDps) || has(e && e.conditions)),
    );
    if (flatLists.length) {
        add(
            'list-without-depth',
            'Liste ohne Zeilenregeln und ohne zweite Zeile',
            'rowConditions färbt oder tauscht das Icon je Zeile, subDpTemplate hängt an jede Zeile einen ' +
                'zweiten Wert (Batterie, Verbrauch, letzte Änderung). Ohne beides ist die Liste eine Namensliste.',
            'raum-liste',
            flatLists,
        );
    }

    // 8. Nothing in the whole tab reacts to anything. Reported last and only once:
    //    it is a remark about the tab, not about a widget.
    const reactive = list.filter((w) => has(opts(w).conditions) || has(opts(w).badges) || has(opts(w).rowConditions));
    if (!reactive.length && list.length >= 3 && !findings.some((f) => f.id === 'value-without-meaning')) {
        add(
            'nothing-reacts',
            'Kein einziges Widget im Tab reagiert auf einen Zustand',
            'Weder conditions noch badges: der Tab sieht bei Alarm genauso aus wie im Normalfall. Eine ' +
                'einzige Regel auf dem Widget, das wirklich zählt, ändert das.',
            'wert-kachel',
            [],
        );
    }

    return findings;
}

/**
 * @param {object[]} findings what reviewWidgets returned
 * @param {string} where the tab this is about, for the heading
 * @returns {string} the text handed to the model
 */
function renderReview(findings, where) {
    if (!findings.length) {
        return (
            `# ${where}\nNichts gefunden, was sich mechanisch beanstanden ließe: die Zahlen haben Bereiche, ` +
            'die Listen haben Tiefe, die Diagramme aggregieren. Alles Weitere ist Geschmack und gehört dem Nutzer.'
        );
    }
    const blocks = findings.map((f, i) =>
        [
            `## ${i + 1}. ${f.what}`,
            f.why,
            `Rezept: aura_recipes mit id=${f.recipe}`,
            ...(f.widgets.length ? [`Betroffen: ${idList(f.widgets)}`] : []),
        ].join('\n'),
    );
    return [
        `# ${where} — ${findings.length} Beobachtung${findings.length === 1 ? '' : 'en'}`,
        '',
        'Vorschläge, keine Aufträge. Dem Nutzer zeigen, was davon er will, und nur das ändern — mit',
        'aura_update_widget, damit die übrigen Optionen erhalten bleiben.',
        '',
        blocks.join('\n\n'),
    ].join('\n');
}

module.exports = { looksLikeCounter, renderReview, reviewWidgets, CONTACT_LIMIT, TILE_ROW_LIMIT };
