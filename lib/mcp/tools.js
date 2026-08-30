'use strict';

/**
 * The AURA MCP tool surface.
 *
 * Pairs with the ioBroker MCP server: that one knows which datapoints exist, in
 * which room, on which device. This one knows what AURA can render, what the
 * dashboard looks like today, whether a proposed configuration is valid — and
 * writes it. The division of labour is stated in INSTRUCTIONS below, which the
 * client hands to the model on connect, so it does not have to be guessed.
 */

const { renderTypeIndex, renderTypeDetail, renderWidgetShape } = require('./render');
const { validateAny, validateTab } = require('./validate');
const {
    allTabs,
    collectDefIds,
    findPopupView,
    findSection,
    insertTab,
    readPopupViews,
    writeGroupDefs,
    writePopupViews,
    designColumns,
    findTab,
    listStateIds,
    readDashboard,
    readGrid,
    readGroupDefs,
    replaceTabWidgets,
    writeBackup,
    writeDashboard,
} = require('./auraConfig');

/**
 * Handed to the model on connect (the `instructions` field of `initialize`).
 * Short on purpose: it is prompt budget on every conversation.
 */
const INSTRUCTIONS = [
    'AURA is an ioBroker dashboard. These tools describe what it can render, read its current',
    'configuration and change it.',
    '',
    'BETA. Writing is new and can get things wrong. Show the user what you intend to change before',
    'you write it, prefer aura_add_widget over aura_write_tab (which discards everything else in the',
    'tab), and name the backup file from the answer so the change can be undone.',
    '',
    'REQUIREMENT: this server knows NO datapoints. The ioBroker MCP server is the only source —',
    'list_rooms, list_functions, list_devices, search_objects, get_object. If it is not connected,',
    'say so and stop rather than inventing datapoint ids: an invented id passes as a string and',
    'produces a widget that silently shows nothing.',
    'Both servers must point at the SAME ioBroker installation, or the ids will not resolve here.',
    '',
    'Workflow for building something:',
    '1. aura_dashboard — layouts, sections, tabs, grid geometry, column width.',
    '2. aura_widget_types, then aura_widget_schema for the few types you will use.',
    '3. Get the datapoint ids from the ioBroker MCP.',
    '4. aura_validate — always. A misnamed option is otherwise ignored silently and the user',
    '   is left wondering why the setting did nothing.',
    '5. aura_write_tab or aura_add_widget. Every write backs the configuration up first.',
    '',
    'Beyond tabs: aura_create_tab makes a new one, aura_popups / aura_popup / aura_write_popup handle',
    'the views that open on a widget click, and aura_group / aura_write_group edit the children of a',
    'group, panels or universal widget (pass the defId from its options).',
    '',
    'gridPos is in grid cells: x/w columns, y/h rows. Widgets must not overlap.',
    'Answer the user in the language they used.',
].join('\n');

const TOOLS = [
    {
        name: 'aura_dashboard',
        description:
            'Layouts, sections and tabs of the running AURA instance with their widget counts, plus the grid ' +
            'geometry and the column width this dashboard is designed for. Start here.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_types',
        description:
            'Every AURA widget type with label, default size and available layouts. Pick from here, then fetch ' +
            'the options of the chosen types with aura_widget_schema.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_schema',
        description:
            'Full option documentation for the named widget types, plus the structure of a widget object. Ask ' +
            'only for the types you intend to use — the complete schema is large.',
        inputSchema: {
            type: 'object',
            properties: {
                types: { type: 'array', items: { type: 'string' }, description: 'e.g. ["switch","thermostat"]' },
            },
            required: ['types'],
        },
    },
    {
        name: 'aura_tab',
        description:
            'The widgets of one tab as JSON, including the group definitions they reference. Use it as a ' +
            'template for style and sizing, and to find free space.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Tab name, slug or id.' },
                layout: { type: 'string', description: 'Layout name or slug, when the tab name is ambiguous.' },
                section: { type: 'string', description: 'Section name or slug, when the tab name is ambiguous.' },
            },
            required: ['tab'],
        },
    },
    {
        name: 'aura_validate',
        description:
            'Checks a widget or a tab payload against the widget schema and the live datapoints: unknown ' +
            'options, wrong layouts, bad gridPos, overlapping widgets, missing datapoint ids. Run this before ' +
            'every write.',
        inputSchema: {
            type: 'object',
            properties: {
                json: { type: 'string', description: 'The widget or aura-tab JSON, as a string.' },
                checkDatapoints: { type: 'boolean', description: 'Verify datapoint ids. Default true.' },
            },
            required: ['json'],
        },
    },
    {
        name: 'aura_add_widget',
        description:
            'Adds one widget to a tab, below the existing content. Validates first and refuses on any error. ' +
            'Backs up the configuration before writing.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Target tab name, slug or id.' },
                widget: { type: 'string', description: 'The widget JSON, as a string.' },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
            required: ['tab', 'widget'],
        },
    },
    {
        name: 'aura_write_tab',
        description:
            'Replaces the entire widget list of a tab. Validates first and refuses on any error. Backs up the ' +
            'configuration before writing. Read the tab with aura_tab first if you mean to keep anything.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Target tab name, slug or id.' },
                widgets: { type: 'string', description: 'JSON array of widgets, or an aura-tab payload, as a string.' },
                groupDefs: { type: 'string', description: 'Optional JSON object of group definitions.' },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
            required: ['tab', 'widgets'],
        },
    },
    {
        name: 'aura_create_tab',
        description:
            'Creates a new, empty tab (or one filled with widgets). Name the layout and section when the ' +
            'dashboard has more than one — a tab in the wrong section is invisible until someone goes looking.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Tab name shown in the tab bar.' },
                widgets: { type: 'string', description: 'Optional JSON array of widgets to start with.' },
                groupDefs: { type: 'string', description: 'Optional JSON object of group definitions.' },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
            required: ['name'],
        },
    },
    {
        name: 'aura_popups',
        description: 'Lists the popup views: id, name and widget count. Popups open on a widget click.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_popup',
        description: 'The widgets of one popup view as JSON, including the group definitions they reference.',
        inputSchema: {
            type: 'object',
            properties: { view: { type: 'string', description: 'Popup name or id.' } },
            required: ['view'],
        },
    },
    {
        name: 'aura_write_popup',
        description:
            'Replaces the widget list of a popup view, or creates one when `create` is set. Validates first ' +
            'and refuses on any error. Backs up the configuration before writing.',
        inputSchema: {
            type: 'object',
            properties: {
                view: { type: 'string', description: 'Popup name or id; with create:true the name of the new one.' },
                widgets: { type: 'string', description: 'JSON array of widgets.' },
                groupDefs: { type: 'string', description: 'Optional JSON object of group definitions.' },
                create: { type: 'boolean', description: 'Create a new view instead of replacing one.' },
            },
            required: ['view', 'widgets'],
        },
    },
    {
        name: 'aura_group',
        description: 'The children of one group, panels or universal widget. Pass the defId from its options.',
        inputSchema: {
            type: 'object',
            properties: { defId: { type: 'string', description: 'options.defId of the hosting widget.' } },
            required: ['defId'],
        },
    },
    {
        name: 'aura_write_group',
        description:
            'Replaces the children of one group, panels or universal widget. Validates first and refuses on ' +
            'any error. Backs up the configuration before writing. Read it with aura_group first if you mean ' +
            'to keep anything.',
        inputSchema: {
            type: 'object',
            properties: {
                defId: { type: 'string', description: 'options.defId of the hosting widget.' },
                widgets: { type: 'string', description: 'JSON array of the children.' },
            },
            required: ['defId', 'widgets'],
        },
    },
];

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const fail = (s) => ({ content: [{ type: 'text', text: s }], isError: true });

function parseJson(raw, label) {
    try {
        return { value: JSON.parse(String(raw)) };
    } catch (e) {
        return { error: `${label} ist kein gültiges JSON: ${e.message}` };
    }
}

function formatFindings(errors, warnings) {
    const parts = [];
    if (errors.length) {
        parts.push(`# ${errors.length} Fehler\n${errors.map((e) => `- ${e}`).join('\n')}`);
    }
    if (warnings.length) {
        parts.push(`# ${warnings.length} Hinweis(e)\n${warnings.map((w) => `- ${w}`).join('\n')}`);
    }
    return parts.join('\n\n');
}

const EDITOR_NOTE =
    'Offene Editor-Fenster übernehmen die Änderung automatisch; ein Editor mit ungespeicherten ' +
    'Änderungen kann sie jedoch beim nächsten Speichern überschreiben.';

const newId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const fence = (value) => `\`\`\`json\n${JSON.stringify(value, null, 1)}\n\`\`\``;

const listPopups = (views) => `Vorhanden:\n${views.map((v) => `- ${v.name} (${v.id})`).join('\n')}`;

const listDefs = (defs) => {
    const known = Object.keys(defs);
    return known.length ? `Vorhanden: ${known.join(', ')}` : 'Es sind keine Gruppen konfiguriert.';
};

/**
 * Accept either a plain widget array or a whole aura-tab payload, and merge in
 * group definitions from either place. `arrayOnly` refuses the envelope, for the
 * callers where a tab payload would be meaningless (popup, group children).
 */
function readWidgetList(rawWidgets, rawDefs, arrayOnly) {
    let widgets = [];
    let groupDefs = null;
    if (rawWidgets) {
        const parsed = parseJson(rawWidgets, 'widgets');
        if (parsed.error) {
            return { error: parsed.error };
        }
        const v = parsed.value;
        if (Array.isArray(v)) {
            widgets = v;
        } else if (!arrayOnly && v && v.tab && Array.isArray(v.tab.widgets)) {
            widgets = v.tab.widgets;
            if (v.groupDefs) {
                groupDefs = v.groupDefs;
            }
        } else {
            return {
                error: arrayOnly
                    ? '"widgets" muss ein Array von Widgets sein.'
                    : '"widgets" muss ein Array von Widgets oder eine aura-tab-Struktur sein.',
            };
        }
    }
    if (rawDefs) {
        const parsed = parseJson(rawDefs, 'groupDefs');
        if (parsed.error) {
            return { error: parsed.error };
        }
        groupDefs = Object.assign({}, groupDefs, parsed.value);
    }
    return { widgets, groupDefs };
}

/** The group definitions a widget list references, or null when it references none. */
async function withGroupDefs(adapter, widgets) {
    const defs = await readGroupDefs(adapter);
    const used = collectDefIds(widgets, defs);
    if (!used.size) {
        return null;
    }
    const out = {};
    for (const id of used) {
        out[id] = defs[id];
    }
    return out;
}

/** Validate a widget list that is not a dashboard tab (popup, group, new tab). */
async function validateWidgets(adapter, schema, widgets, label, extra) {
    const knownDatapoints = await listStateIds(adapter);
    return validateTab(
        { _type: 'aura-tab', tab: { name: String(label || 'Liste'), widgets } },
        schema,
        Object.assign({ knownDatapoints }, extra || {}),
    );
}

/** Lowest free row in a tab, so an added widget lands below what is there. */
function nextFreeRow(widgets) {
    let bottom = 0;
    for (const w of widgets || []) {
        const gp = w && w.gridPos;
        if (gp && Number.isInteger(gp.y) && Number.isInteger(gp.h)) {
            bottom = Math.max(bottom, gp.y + gp.h);
        }
    }
    return bottom;
}

/**
 * @param {object} ctx
 * @param {object} ctx.adapter ioBroker adapter instance
 * @param {object} ctx.schema the generated widget schema
 */
async function callTool(name, args, ctx) {
    const { adapter, schema } = ctx;
    const a = args || {};

    switch (name) {
        case 'aura_widget_types':
            return text(
                `AURA ${(schema.$meta && schema.$meta.auraVersion) || ''} — ` +
                    `${Object.keys(schema.widgets).length} Widget-Typen\n\n${renderTypeIndex(schema)}`,
            );

        case 'aura_widget_schema': {
            const types = Array.isArray(a.types) ? a.types : [];
            if (!types.length) {
                return fail('Keine Typen angegeben. aura_widget_types listet die verfügbaren.');
            }
            return text(`# Aufbau eines Widgets\n${renderWidgetShape(schema)}\n\n${renderTypeDetail(types, schema)}`);
        }

        case 'aura_dashboard': {
            const [layouts, grid] = await Promise.all([readDashboard(adapter), readGrid(adapter)]);
            if (!layouts.length) {
                return text(`${adapter.namespace} hat noch keine Layouts konfiguriert.`);
            }
            const cols = designColumns(layouts);
            const rows = allTabs(layouts).map(
                (t) =>
                    `- ${t.layoutName} / ${t.sectionName} / ${t.name} — ${t.widgets.length} Widget(s)` +
                    `${t.disabled ? ', deaktiviert' : ''}`,
            );
            return text(
                [
                    `# Dashboard ${adapter.namespace}`,
                    '',
                    `Raster: Zeilenhöhe ${grid.rowHeight} px, Spaltenbreite ${grid.snapX} px, Abstand ${grid.gap} px.`,
                    `Entworfen für ${cols} Spalten — x + w eines Widgets darf ${cols} nicht überschreiten.`,
                    '',
                    '# Tabs',
                    ...rows,
                ].join('\n'),
            );
        }

        case 'aura_tab': {
            const layouts = await readDashboard(adapter);
            const found = findTab(layouts, a);
            if (found.error) {
                const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${found.error}\nVorhanden:\n${names.join('\n')}`);
            }
            const defs = await readGroupDefs(adapter);
            const used = collectDefIds(found.tab.widgets, defs);
            const groupDefs = {};
            for (const id of used) {
                groupDefs[id] = defs[id];
            }
            const payload = {
                _type: 'aura-tab',
                _version: 1,
                grid: await readGrid(adapter),
                tab: { name: found.tab.name, widgets: found.tab.widgets },
            };
            if (used.size) {
                payload.groupDefs = groupDefs;
            }
            return text(
                `${found.tab.layoutName} / ${found.tab.sectionName} / ${found.tab.name}\n` +
                    '```json\n' +
                    `${JSON.stringify(payload, null, 1)}\n` +
                    '```',
            );
        }

        case 'aura_validate': {
            const parsed = parseJson(a.json, 'Die Eingabe');
            if (parsed.error) {
                return fail(parsed.error);
            }
            const vctx = {};
            let note = 'Datenpunkte nicht geprüft.';
            if (a.checkDatapoints !== false) {
                vctx.knownDatapoints = await listStateIds(adapter);
                note = `${vctx.knownDatapoints.size} Datenpunkte gegengeprüft.`;
            }
            const layouts = await readDashboard(adapter);
            if (layouts.length) {
                vctx.columns = designColumns(layouts);
            }
            const { errors, warnings } = validateAny(parsed.value, schema, vctx);
            const body = formatFindings(errors, warnings) || 'Keine Beanstandungen.';
            const suffix = `\n\n${note}${vctx.columns ? ` Spaltengrenze ${vctx.columns}.` : ''}`;
            return errors.length ? fail(body + suffix) : text(body + suffix);
        }

        case 'aura_add_widget':
        case 'aura_write_tab': {
            const layouts = await readDashboard(adapter);
            const found = findTab(layouts, a);
            if (found.error) {
                const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${found.error}\nVorhanden:\n${names.join('\n')}`);
            }

            let widgets;
            let groupDefs = null;
            // Which widgets the caller is contributing: only those get the full
            // per-widget rules. See validateTab's strictIndices.
            let strictIndices = null;
            if (name === 'aura_add_widget') {
                const parsed = parseJson(a.widget, 'widget');
                if (parsed.error) {
                    return fail(parsed.error);
                }
                const w = parsed.value;
                // Place it below existing content unless the caller positioned it.
                if (w && w.gridPos && !Number.isInteger(w.gridPos.y)) {
                    w.gridPos.y = nextFreeRow(found.tab.widgets);
                }
                widgets = found.tab.widgets.concat([w]);
                strictIndices = [widgets.length - 1];
            } else {
                const list = readWidgetList(a.widgets, a.groupDefs);
                if (list.error) {
                    return fail(list.error);
                }
                widgets = list.widgets;
                groupDefs = list.groupDefs;
            }
            if (name === 'aura_add_widget' && a.groupDefs) {
                const parsed = parseJson(a.groupDefs, 'groupDefs');
                if (parsed.error) {
                    return fail(parsed.error);
                }
                groupDefs = Object.assign({}, groupDefs, parsed.value);
            }

            // Validate the resulting tab as a whole: overlaps and duplicate ids only
            // show up against the widgets that are already there.
            const knownDatapoints = await listStateIds(adapter);
            const { errors, warnings } = validateTab(
                { _type: 'aura-tab', tab: { name: found.tab.name, widgets } },
                schema,
                { knownDatapoints, columns: designColumns(layouts), strictIndices },
            );
            if (errors.length) {
                return fail(`Nicht geschrieben — der Tab wäre fehlerhaft.\n\n${formatFindings(errors, warnings)}`);
            }

            const backup = await writeBackup(adapter);
            await writeDashboard(adapter, replaceTabWidgets(layouts, found.tab.id, widgets), groupDefs);

            const lines = [
                `${found.tab.layoutName} / ${found.tab.sectionName} / ${found.tab.name}: ` +
                    `${widgets.length} Widget(s) geschrieben.`,
                `Sicherung: ${adapter.namespace}.backups/${backup}`,
                'Offene Editor-Fenster übernehmen die Änderung automatisch; ein Editor mit ungespeicherten ' +
                    'Änderungen kann sie jedoch beim nächsten Speichern überschreiben.',
            ];
            if (warnings.length) {
                lines.push('', formatFindings([], warnings));
            }
            return text(lines.join('\n'));
        }

        case 'aura_create_tab': {
            const layouts = await readDashboard(adapter);
            const where = findSection(layouts, a);
            if (where.error) {
                const all = allTabs(layouts).map((t) => `- ${t.layoutName} / ${t.sectionName}`);
                return fail(`${where.error}\nVorhanden:\n${[...new Set(all)].join('\n')}`);
            }
            if (typeof a.name !== 'string' || !a.name.trim()) {
                return fail('"name" fehlt.');
            }

            const list = readWidgetList(a.widgets, a.groupDefs);
            if (list.error) {
                return fail(list.error);
            }

            const check = await validateWidgets(adapter, schema, list.widgets, a.name, {
                columns: designColumns(layouts),
            });
            if (check.errors.length) {
                return fail(
                    `Nicht angelegt — der Tab wäre fehlerhaft.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            const next = insertTab(layouts, where.section.id, a.name.trim(), list.widgets);
            await writeDashboard(adapter, next.layouts, list.groupDefs);
            return text(
                [
                    `Tab „${next.tab.name}“ angelegt in ${where.layout.name} / ${where.section.name} ` +
                        `(slug "${next.tab.slug}", ${list.widgets.length} Widget(s)).`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_popups': {
            const views = await readPopupViews(adapter);
            if (!views.length) {
                return text('Keine Popup-Ansichten konfiguriert.');
            }
            const rows = views.map((v) => `- ${v.name} (id ${v.id}) — ${(v.widgets || []).length} Widget(s)`);
            return text(`# Popups (${views.length})\n${rows.join('\n')}`);
        }

        case 'aura_popup': {
            const views = await readPopupViews(adapter);
            const found = findPopupView(views, a.view);
            if (found.error) {
                return fail(`${found.error}\n${listPopups(views)}`);
            }
            const payload = { name: found.view.name, id: found.view.id, widgets: found.view.widgets || [] };
            const defs = await withGroupDefs(adapter, payload.widgets);
            if (defs) {
                payload.groupDefs = defs;
            }
            return text(`Popup „${found.view.name}“\n${fence(payload)}`);
        }

        case 'aura_write_popup': {
            const list = readWidgetList(a.widgets, a.groupDefs, true);
            if (list.error) {
                return fail(list.error);
            }
            const views = await readPopupViews(adapter);
            let target = null;
            if (!a.create) {
                const found = findPopupView(views, a.view);
                if (found.error) {
                    return fail(`${found.error}\n${listPopups(views)}\nZum Anlegen create:true mitgeben.`);
                }
                target = found.view;
            }

            // A popup has its own grid, so the dashboard's column bound does not apply.
            const check = await validateWidgets(adapter, schema, list.widgets, a.view, {});
            if (check.errors.length) {
                return fail(
                    `Nicht geschrieben — das Popup wäre fehlerhaft.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            const name = target ? target.name : String(a.view);
            const nextViews = target
                ? // Editing a built-in must flag it, or ensureBuiltins() discards the
                  // change on the next frontend start. The flag is meaningless on a
                  // custom view, so setting it unconditionally is safe.
                  views.map((v) => (v.id === target.id ? { ...v, widgets: list.widgets, userEdited: true } : v))
                : views.concat([{ id: newId('view'), name, widgets: list.widgets, createdAt: Date.now() }]);
            if (list.groupDefs) {
                await writeGroupDefs(adapter, list.groupDefs);
            }
            await writePopupViews(adapter, nextViews);
            return text(
                [
                    `Popup „${name}“ ${target ? 'geschrieben' : 'angelegt'}: ${list.widgets.length} Widget(s).`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_group': {
            const defs = await readGroupDefs(adapter);
            const children = defs[a.defId];
            if (!children) {
                return fail(`Keine Gruppe mit defId "${a.defId}".\n${listDefs(defs)}`);
            }
            return text(`Gruppe ${a.defId} — ${children.length} Kind(er)\n${fence(children)}`);
        }

        case 'aura_write_group': {
            const list = readWidgetList(a.widgets, null, true);
            if (list.error) {
                return fail(list.error);
            }
            const defs = await readGroupDefs(adapter);
            if (!defs[a.defId]) {
                return fail(
                    `Keine Gruppe mit defId "${a.defId}" — aura_group listet die vorhandenen.\n${listDefs(defs)}`,
                );
            }

            // Children sit in the group's own grid, not the dashboard's.
            const check = await validateWidgets(adapter, schema, list.widgets, `Gruppe ${a.defId}`, {});
            if (check.errors.length) {
                return fail(
                    `Nicht geschrieben — die Gruppe wäre fehlerhaft.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            await writeGroupDefs(adapter, { [a.defId]: list.widgets });
            return text(
                [
                    `Gruppe ${a.defId}: ${list.widgets.length} Kind(er) geschrieben.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        default:
            return fail(`Unbekanntes Werkzeug: ${name}`);
    }
}

module.exports = { INSTRUCTIONS, TOOLS, callTool };
