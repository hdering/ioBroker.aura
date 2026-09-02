'use strict';

/**
 * Checks a dashboard that already exists against the schema and the installation.
 *
 * aura_validate looks at a payload on its way IN. Nothing ever looked at what is
 * already there — and that is where the debris collects: a datapoint that was
 * renamed two adapter versions ago, an option that a widget stopped reading, a
 * widget id that a copy duplicated, a state that nothing has written to since
 * 2024. None of it shows up as an error anywhere. AURA ignores what it does not
 * understand, the widget renders, and the dashboard quietly shows less than it
 * claims.
 *
 * Findings, never edits, and warnings rather than errors: several of these are
 * legitimate in a specific setup. What matters is that they get NAMED, with the
 * widget and the tab, so they can be decided on.
 *
 * Pure functions. The caller does the ioBroker reads and hands in the results.
 */

const { collectDatapointRefs, datapointFindings, historyFindings } = require('./dpFit');
const { validateWidget } = require('./validate');

/** Beyond this a state has stopped being written to for practical purposes. */
const STALE_DAYS = 14;

/** How many items one finding prints before the rest is summarised. */
const MAX_ITEMS = 15;

function itemList(items, max = MAX_ITEMS) {
    return items.length > max ? `${items.slice(0, max).join('; ')} … (+${items.length - max})` : items.join('; ');
}

function days(ms) {
    return Math.floor(ms / 86400000);
}

/**
 * Look over everything that is configured.
 *
 * @param {object} input
 * @param {{where: string, widgets: object[]}[]} input.places tabs, popup views and groups
 * @param {object} input.schema the generated widget schema
 * @param {Set<string>} [input.knownDatapoints] every state id in the installation
 * @param {Map<string, object|null>} [input.stateValues] id → last value, for the liveness check
 * @param {Map<string, object>} [input.datapointMeta] id → object metadata, for the history and fit checks
 * @param {string[]} [input.loggingInstances] the logging adapters this installation has
 * @param {object} [input.defs] the group definitions, to find the broken references
 * @param {string[]} [input.orphanDefIds] group definitions no widget references any more
 * @param {number} [input.staleDays] override the liveness threshold
 * @param {number} [input.now] injected clock, for tests
 * @returns {{findings: object[], stats: object}}
 */
function auditDashboard(input) {
    const {
        places = [],
        schema,
        knownDatapoints = null,
        stateValues = null,
        datapointMeta = null,
        defs = null,
        staleDays = STALE_DAYS,
        now = Date.now(),
    } = input || {};

    const findings = [];
    const add = (id, what, why, items) => {
        if (items.length) {
            findings.push({ id, what, why, items });
        }
    };

    const dead = [];
    const stale = [];
    const empty = [];
    const ignoredOptions = [];
    const misplaced = [];
    const brokenGroups = [];
    const noHistory = [];
    const badFit = [];
    const emptyPlaces = [];
    const idOwners = new Map();
    const duplicates = [];
    let widgetCount = 0;
    let dpCount = 0;

    for (const place of places) {
        const widgets = Array.isArray(place.widgets) ? place.widgets.filter((w) => w && typeof w === 'object') : [];
        if (!widgets.length) {
            emptyPlaces.push(place.where);
            continue;
        }
        for (const widget of widgets) {
            widgetCount++;
            const at = `${place.where} / ${widget.id || widget.type}`;

            // Duplicate ids across the whole dashboard: two widgets sharing an id
            // share their runtime state, and a click action pointing at one hits
            // both (issue #606 was exactly this).
            const owner = idOwners.get(widget.id);
            if (widget.id && owner) {
                duplicates.push(`"${widget.id}" in ${owner} und ${place.where}`);
            } else if (widget.id) {
                idOwners.set(widget.id, place.where);
            }

            // Options the widget does not read. The validator already knows the
            // rule; what it lacked was ever being pointed at what is stored.
            const res = validateWidget(widget, schema, { path: at });
            for (const message of res.errors) {
                if (/liest die Option/.test(message)) {
                    ignoredOptions.push(message);
                } else if (/gehört unter "options"/.test(message)) {
                    misplaced.push(message);
                }
            }

            if (datapointMeta) {
                // A chart on a datapoint nobody logs is the finding that looks
                // least like a mistake: the id exists, the type is right, the
                // options are spelled correctly, and the frame stays empty.
                historyFindings(widget, datapointMeta, input.loggingInstances).forEach((m) =>
                    noHistory.push(`${at}: ${m}`),
                );
                datapointFindings(widget, schema, datapointMeta).forEach((m) => badFit.push(`${at}: ${m}`));
            }

            if (['group', 'panels', 'universal'].includes(widget.type) && defs) {
                const defId = widget.options && widget.options.defId;
                if (defId && !defs[defId]) {
                    brokenGroups.push(`${at}: defId "${defId}" ist nicht gespeichert`);
                }
            }

            // Datapoints, loosely collected: a list entry's `id` is a state id,
            // and a review that misses those misses most of a grown dashboard.
            const refs = collectDatapointRefs(widget, schema, { loose: true });
            for (const ref of refs) {
                dpCount++;
                if (knownDatapoints && !knownDatapoints.has(ref.id)) {
                    dead.push(`${at} → "${ref.id}" (${ref.path})`);
                    continue;
                }
                if (!stateValues || !stateValues.has(ref.id)) {
                    continue;
                }
                const state = stateValues.get(ref.id);
                if (!state || state.val === null || state.val === undefined) {
                    empty.push(`${at} → "${ref.id}"`);
                } else if (state.ts && now - state.ts > staleDays * 86400000) {
                    stale.push(`${at} → "${ref.id}" (${days(now - state.ts)} Tage)`);
                }
            }
        }
    }

    add(
        'dead-datapoints',
        `${dead.length} Verweis(e) auf Datenpunkte, die es nicht gibt`,
        'Das Widget rendert, zeigt aber nichts an und meldet nichts. Meist ein umbenannter oder entfernter ' +
            'Adapter-Datenpunkt. Über den ioBroker-MCP den neuen Namen suchen und mit aura_update_widget setzen.',
        dead,
    );
    add(
        'empty-datapoints',
        `${empty.length} Datenpunkt(e) ohne Wert`,
        'Der Datenpunkt existiert, hat aber null — angelegt und nie beschrieben. Auf dem Dashboard bleibt die ' +
            'Stelle leer.',
        empty,
    );
    add(
        'stale-datapoints',
        `${stale.length} Datenpunkt(e) seit über ${staleDays} Tagen unverändert`,
        'Der wahrscheinlichste Fall in einem gewachsenen Dashboard: mehrere Generationen von Datenpunkten für ' +
            'dasselbe Gerät, und das Widget hängt an der alten. Vor dem Umstellen mit dem Nutzer klären — ein ' +
            'Zählerstand oder eine Konfiguration darf sich auch monatelang nicht ändern.',
        stale,
    );
    add(
        'no-history',
        `${noHistory.length} Diagramm-Datenpunkt(e) ohne Aufzeichnung`,
        'Für den Datenpunkt ist kein History-Adapter aktiv (oder die eingestellte Instanz zeichnet ihn nicht ' +
            'auf). Das Diagramm bleibt dauerhaft leer und meldet nichts — alles andere an der Konfiguration ' +
            'ist in Ordnung, deshalb findet man es sonst nicht.',
        noHistory,
    );
    add(
        'datapoint-mismatch',
        `${badFit.length} Datenpunkt(e), die nicht zum Widget passen`,
        'Schalter auf einem nur lesbaren State, Zahl-Widget auf einem Text, Regler ohne min/max: bedienbar ' +
            'aussehend und wirkungslos.',
        badFit,
    );
    add(
        'ignored-options',
        `${ignoredOptions.length} Option(en), die das Widget nicht liest`,
        'Steht in der Konfiguration, wird beim Rendern verworfen. Die Einstellung wirkt also nicht — und hat ' +
            'vermutlich einmal gewirkt, unter einem anderen Namen. Der Vorschlag in der Meldung nennt den ' +
            'nächstliegenden gültigen Namen.',
        ignoredOptions,
    );
    add(
        'misplaced-options',
        `${misplaced.length} Einstellung(en) eine Ebene zu hoch`,
        'conditions, badges, clickAction und die anderen gemeinsamen Einstellungen gehören unter "options". ' +
            'Direkt auf dem Widget liest sie niemand.',
        misplaced,
    );
    add(
        'duplicate-ids',
        `${duplicates.length} doppelte Widget-Id(s)`,
        'Zwei Widgets mit derselben Id teilen ihren Laufzeit-Zustand, und eine Klickaktion auf die Id trifft ' +
            'beide. Entsteht beim Kopieren. aura_copy_widget vergibt frische Ids.',
        duplicates,
    );
    add(
        'broken-groups',
        `${brokenGroups.length} Gruppe(n) ohne gespeicherte Kinder`,
        'Die defId zeigt auf eine Definition, die nicht in aura-group-defs liegt — die Gruppe rendert leer. ' +
            'Typisch nach einem Import ohne "groupDefs" oder einer Wiederherstellung aus einer Sicherung ohne ' +
            'den Schlüssel.',
        brokenGroups,
    );
    add(
        'empty-places',
        `${emptyPlaces.length} Tab(s)/Ansicht(en) ohne Widgets`,
        'Steht im Menü, zeigt eine leere Seite.',
        emptyPlaces,
    );

    if (Array.isArray(input.orphanDefIds)) {
        // Handed in rather than worked out here: the reference walk lives in
        // auraConfig (collectDefIds), where it already follows groups nested in
        // groups. A second, shallower copy of it here would report live
        // definitions as orphans.
        add(
            'orphan-groups',
            `${input.orphanDefIds.length} Gruppen-Definition(en), die kein Widget mehr benutzt`,
            'Reste gelöschter Gruppen-Widgets. Sie kosten nur Platz in der Konfiguration; der nächste Schreibzugriff ' +
                'räumt sie von selbst auf.',
            input.orphanDefIds,
        );
    }

    return {
        findings,
        stats: { places: places.length, widgets: widgetCount, datapoints: dpCount },
    };
}

/**
 * @param {object} result what auditDashboard returned
 * @param {string} scope what was looked at, for the heading
 * @returns {string} the text handed to the model
 */
function renderAudit(result, scope) {
    const { findings, stats } = result;
    // "in 8 Tabs" was wrong whenever group definitions were part of it — and it
    // read as if the review had quietly looked at the whole dashboard.
    const head =
        `${stats.widgets} Widget(s) an ${stats.places} Stelle(n) — Tabs, Popup-Ansichten und Gruppen —, ` +
        `${stats.datapoints} Datenpunkt-Verweis(e) geprüft.`;
    if (!findings.length) {
        return `# ${scope} — nichts zu beanstanden\n${head}`;
    }
    const blocks = findings.map((f, i) =>
        [`## ${i + 1}. ${f.what}`, f.why, `Betroffen: ${itemList(f.items)}`].join('\n'),
    );
    return [
        `# ${scope} — ${findings.length} Befund(e)`,
        head,
        '',
        'Dem Nutzer zeigen, nicht selbst entscheiden: ein toter Datenpunkt kann ein umbenanntes Gerät sein, ' +
            'ein unveränderter Zählerstand ist normal. Änderungen mit aura_update_widget, damit die übrigen ' +
            'Optionen erhalten bleiben.',
        '',
        blocks.join('\n\n'),
    ].join('\n');
}

module.exports = { auditDashboard, renderAudit, MAX_ITEMS, STALE_DAYS };
