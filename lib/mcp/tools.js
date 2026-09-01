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
    findLayout,
    findPopupView,
    findPreset,
    findWidget,
    mergeWidget,
    findSection,
    insertLayout,
    insertSection,
    insertTab,
    readPopupViews,
    readPresets,
    reorderNodes,
    writeGroupDefs,
    writePopupViews,
    writePresets,
    cloneWidget,
    cloneSection,
    cloneTab,
    attachSection,
    attachTab,
    detachSection,
    detachTab,
    slugify,
    uniqueSlug,
    designColumns,
    findTab,
    listBackups,
    listStateIds,
    readDashboard,
    readGrid,
    readGroupDefs,
    removeNode,
    nodeMarkers,
    renameNode,
    replaceTabWidgets,
    restoreBackup,
    updateNode,
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
    'Structure: aura_create_tab adds a page, aura_create_section a menu entry, aura_create_layout a',
    'whole separate view with its own URL. Reach for the last one only when the user asks for a',
    'separate screen — another page inside an existing view is a tab.',
    'Popups: aura_popups, aura_popup, aura_write_popup — the views that open on a widget click.',
    'Navigation: aura_update_node sets the properties of a layout, section or tab button — icon, hidden,',
    'badges, the badge aggregate, and conditions on a tab. aura_dashboard shows which are set.',
    'One widget: aura_update_widget changes it in place — in a tab, or in a group with defId. The',
    'patch is merged, so an adjustment cannot lose the options you did not mention.',
    'Groups: aura_group, aura_write_group — the children of a group, panels or universal widget',
    '(pass the defId from its options).',
    'Find: aura_find locates widgets by datapoint, type or title across tabs, groups and popups —',
    'use it instead of reading every tab when you need to know where something is used.',
    'Order: aura_reorder puts layouts, sections or tabs in a new sequence — give the complete order.',
    'Reuse: aura_copy_node copies or moves a whole tab, section or layout; aura_copy_widget does the',
    'same for one widget. Copies get fresh ids, so editing the copy leaves the original alone.',
    'aura_add_widget appends into a group when you pass its defId or widgetId — no need to rewrite',
    'the whole child list with aura_write_group.',
    'Reuse: aura_presets, aura_insert_preset',
    'and aura_save_preset work with the saved widget blueprints.',
    'Undo: every change writes a backup first. aura_backups lists them, aura_restore puts one back —',
    'offer that when a change did not turn out as intended.',
    'aura_rename changes a display name and leaves the slug alone. aura_delete removes a widget, tab,',
    'section, layout or popup and takes its content with it — confirm with the user first.',
    'Both may be unavailable; the permission line at the end says what this connection allows.',
    '',
    'Conditions, badges, clickAction and the other shared settings live INSIDE options, never on the',
    'widget itself — written one level too high they are silently ignored.',
    'gridPos is in grid cells: x/w columns, y/h rows. Widgets must not overlap.',
    'The column count in aura_dashboard is what the existing widgets use, not a hard limit — going',
    'wider warns rather than fails, because the grid grows with the content.',
    'Answer the user in the language they used.',
].join('\n');

/**
 * What the endpoint is allowed to do, set in the adapter configuration.
 *
 * Escalating, not independent flags: each level includes the ones before it. The
 * order follows how hard a mistake is to undo — content can be rewritten from a
 * backup, a rename breaks nothing structural, a deletion takes the widgets with
 * it. Default is `read`, so switching MCP on grants nothing until it is raised.
 */
const LEVELS = ['read', 'write', 'rename', 'delete'];

function levelIndex(mode) {
    const i = LEVELS.indexOf(String(mode || 'read'));
    return i < 0 ? 0 : i;
}

/** The tools available at this level. */
function toolsFor(mode) {
    const max = levelIndex(mode);
    return TOOLS.filter((t) => levelIndex(t.level) <= max).map(({ level, ...tool }) => tool);
}

const TOOLS = [
    {
        name: 'aura_dashboard',
        level: 'read',
        description:
            'Layouts, sections and tabs of the running AURA instance with their widget counts, plus the grid ' +
            'geometry and the column width this dashboard is designed for. Start here.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_types',
        level: 'read',
        description:
            'Every AURA widget type with label, default size and available layouts. Pick from here, then fetch ' +
            'the options of the chosen types with aura_widget_schema.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_schema',
        level: 'read',
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
        level: 'read',
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
        level: 'read',
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
        level: 'write',
        description:
            'Adds one widget to a tab, below the existing content — or into a group, panels or universal ' +
            'widget when defId or widgetId names one. Validates first and refuses on any error. Backs up the ' +
            'configuration before writing.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Target tab name, slug or id.' },
                widget: { type: 'string', description: 'The widget JSON, as a string.' },
                layout: { type: 'string' },
                section: { type: 'string' },
                defId: { type: 'string', description: 'Append into this group instead of a tab (options.defId).' },
                widgetId: { type: 'string', description: 'Alternative: id of the hosting group widget.' },
            },
            required: ['widget'],
        },
    },
    {
        name: 'aura_write_tab',
        level: 'write',
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
        level: 'write',
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
        name: 'aura_create_layout',
        level: 'write',
        description:
            'Creates a new layout — the top-level container, reachable under its own URL. It starts with one ' +
            'section and one tab, the way the editor creates them. Use this only when the user asks for a ' +
            'separate view (a wall tablet, a phone layout); a new page inside an existing one is a tab.',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Layout name.' } },
            required: ['name'],
        },
    },
    {
        name: 'aura_create_section',
        level: 'write',
        description:
            'Creates a new section inside a layout. Sections are the entries of the left-hand menu and hold ' +
            'tabs. It starts with one tab. Name the layout when there is more than one.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Section name.' },
                layout: { type: 'string', description: 'Layout name, slug or id.' },
            },
            required: ['name'],
        },
    },
    {
        name: 'aura_update_node',
        level: 'write',
        description:
            'Sets the properties of a layout, section or tab button: icon, hidden, and for a tab or section ' +
            'also badges and the badge aggregate — a tab additionally takes conditions. The patch is merged. ' +
            'Renaming is NOT done here, use aura_rename.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['layout', 'section', 'tab'], description: 'What to change.' },
                target: { type: 'string', description: 'Its id, or its name.' },
                patch: {
                    type: 'string',
                    description:
                        'JSON of the fields to set, e.g. {"icon":"Lightbulb","badgeAggregate":{"enabled":true}}. ' +
                        'A field set to null is removed. Unknown fields for that kind are refused with the list ' +
                        'of allowed ones.',
                },
                layout: { type: 'string', description: 'Disambiguates a section or tab name.' },
                section: { type: 'string', description: 'Disambiguates a tab name.' },
            },
            required: ['kind', 'target', 'patch'],
        },
    },
    {
        name: 'aura_reorder',
        level: 'write',
        description:
            'Puts layouts, sections or tabs into a new order. Give the COMPLETE new order by name or id — ' +
            'anything left out is refused rather than treated as a deletion.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['layout', 'section', 'tab'], description: 'What to reorder.' },
                order: { type: 'array', items: { type: 'string' }, description: 'All entries, in the wanted order.' },
                layout: { type: 'string', description: 'Which layout, for sections and tabs.' },
                section: { type: 'string', description: 'Which section, for tabs.' },
            },
            required: ['kind', 'order'],
        },
    },
    {
        name: 'aura_copy_widget',
        level: 'write',
        description:
            'Copies or moves one widget into another tab. A copy gets fresh ids — including its own group ' +
            'children, so editing the copy never changes the original.',
        inputSchema: {
            type: 'object',
            properties: {
                widgetId: { type: 'string', description: 'id of the widget.' },
                toTab: { type: 'string', description: 'Target tab name, slug or id.' },
                mode: { type: 'string', enum: ['copy', 'move'], description: 'Default "copy".' },
                layout: { type: 'string', description: 'Disambiguates the target tab.' },
                section: { type: 'string', description: 'Disambiguates the target tab.' },
            },
            required: ['widgetId', 'toTab'],
        },
    },
    {
        name: 'aura_presets',
        level: 'read',
        description:
            'Lists the saved widget blueprints from the widget designer. A preset carries a whole widget with ' +
            'its group children, ready to drop into a tab.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_insert_preset',
        level: 'write',
        description:
            'Inserts a saved preset into a tab, below the existing content, with fresh ids. Pass `datapoint` ' +
            'to re-point the blueprint at another device.',
        inputSchema: {
            type: 'object',
            properties: {
                preset: { type: 'string', description: 'Preset name or id from aura_presets.' },
                tab: { type: 'string', description: 'Target tab name, slug or id.' },
                datapoint: { type: 'string', description: 'Replaces the blueprint main datapoint.' },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
            required: ['preset', 'tab'],
        },
    },
    {
        name: 'aura_save_preset',
        level: 'write',
        description:
            'Saves an existing widget as a reusable preset, together with its group children. It then appears ' +
            'in the widget designer like any hand-made one.',
        inputSchema: {
            type: 'object',
            properties: {
                widgetId: { type: 'string', description: 'id of the widget to save.' },
                name: { type: 'string', description: 'Name for the preset.' },
                icon: { type: 'string', description: 'Optional emoji or icon name for the catalogue card.' },
            },
            required: ['widgetId', 'name'],
        },
    },
    {
        name: 'aura_backups',
        level: 'read',
        description:
            'Lists the backups this server took, newest first. One is written before every change, so there is ' +
            'always a point to go back to.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_restore',
        level: 'write',
        description:
            'Puts a backup back. Takes a snapshot of the current state first, so restoring the wrong one is ' +
            'itself undoable. Tell the user what will be lost before calling this.',
        inputSchema: {
            type: 'object',
            properties: { backup: { type: 'string', description: 'File name from aura_backups.' } },
            required: ['backup'],
        },
    },
    {
        name: 'aura_rename',
        level: 'rename',
        description:
            'Renames a layout, section, tab or popup. The slug stays as it is, so URLs, bookmarks and the ' +
            'navigate datapoints keep working — only the displayed name changes.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    enum: ['layout', 'section', 'tab', 'popup', 'preset'],
                    description: 'What to rename.',
                },
                target: { type: 'string', description: 'Its id, or its current name.' },
                name: { type: 'string', description: 'The new name.' },
                layout: { type: 'string', description: 'Disambiguates a tab or section name.' },
                section: { type: 'string', description: 'Disambiguates a tab name.' },
            },
            required: ['kind', 'target', 'name'],
        },
    },
    {
        name: 'aura_delete',
        level: 'delete',
        description:
            'Deletes a widget, tab, section, layout or popup. This takes the content with it — a tab deletes ' +
            'its widgets, a section its tabs. Backs the configuration up first and names the backup file. ' +
            'Confirm with the user before calling this.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    enum: ['widget', 'tab', 'section', 'layout', 'popup', 'preset'],
                    description: 'What to delete.',
                },
                target: { type: 'string', description: 'Its id, or its name (widget: always the id).' },
                defId: { type: 'string', description: 'For a widget inside a group: the group it belongs to.' },
                layout: { type: 'string', description: 'Disambiguates a tab or section name.' },
                section: { type: 'string', description: 'Disambiguates a tab name.' },
            },
            required: ['kind', 'target'],
        },
    },
    {
        name: 'aura_popups',
        level: 'read',
        description: 'Lists the popup views: id, name and widget count. Popups open on a widget click.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_popup',
        level: 'read',
        description: 'The widgets of one popup view as JSON, including the group definitions they reference.',
        inputSchema: {
            type: 'object',
            properties: { view: { type: 'string', description: 'Popup name or id.' } },
            required: ['view'],
        },
    },
    {
        name: 'aura_write_popup',
        level: 'write',
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
        name: 'aura_update_widget',
        level: 'write',
        description:
            'Changes ONE widget without rewriting anything around it — in a tab, or inside a group when defId ' +
            'is given. The patch is merged: options are merged key by key, and a key set to null is removed. ' +
            'Use this instead of aura_write_tab or aura_write_group for a single adjustment.',
        inputSchema: {
            type: 'object',
            properties: {
                widgetId: { type: 'string', description: 'id of the widget to change.' },
                patch: {
                    type: 'string',
                    description: 'JSON of the fields to change, e.g. {"title":"Neu","options":{"showTitle":false}}',
                },
                defId: {
                    type: 'string',
                    description: 'Search inside this group instead of the tabs (options.defId of the host widget).',
                },
                replace: {
                    type: 'boolean',
                    description: 'Treat the patch as the complete widget instead of merging it.',
                },
            },
            required: ['widgetId', 'patch'],
        },
    },
    {
        name: 'aura_find',
        level: 'read',
        description:
            'Finds widgets across all tabs, groups and popups by datapoint, type or title — including ' +
            'datapoints that sit in an option rather than in the widget datapoint. Use this instead of ' +
            'reading every tab when you need to know where something is used.',
        inputSchema: {
            type: 'object',
            properties: {
                datapoint: { type: 'string', description: 'Full or partial state id.' },
                type: { type: 'string', description: 'Exact widget type, e.g. "switch".' },
                title: { type: 'string', description: 'Part of the title.' },
                limit: { type: 'number', description: 'Maximum rows (default 100).' },
            },
        },
    },
    {
        name: 'aura_copy_node',
        level: 'write',
        description:
            'Copies or moves a whole tab, section or layout. A copy gets fresh ids for its widgets and ' +
            'group children, so editing the copy leaves the original alone. Layouts can only be copied.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['tab', 'section', 'layout'], description: 'What to copy or move.' },
                target: { type: 'string', description: 'Name, slug or id of the source.' },
                mode: { type: 'string', enum: ['copy', 'move'], description: 'Default "copy".' },
                name: { type: 'string', description: 'Name of the copy. Default: "<name> Kopie".' },
                toLayout: { type: 'string', description: 'Destination layout (for kind section, or to place a tab).' },
                toSection: { type: 'string', description: 'Destination section, for kind tab.' },
                fromLayout: { type: 'string', description: 'Source layout, when the name is ambiguous.' },
                fromSection: { type: 'string', description: 'Source section, when the name is ambiguous.' },
            },
            required: ['kind', 'target'],
        },
    },
    {
        name: 'aura_group',
        level: 'read',
        description:
            'The children of one group, panels or universal widget. Address it by the widget id, or by the ' +
            'defId from its options.',
        inputSchema: {
            type: 'object',
            properties: {
                widgetId: { type: 'string', description: 'Id of the group/panels/universal widget.' },
                defId: { type: 'string', description: 'Alternative: options.defId of that widget.' },
            },
        },
    },
    {
        name: 'aura_write_group',
        level: 'write',
        description:
            'Replaces the children of one group, panels or universal widget. Validates first and refuses on ' +
            'any error. Backs up the configuration before writing. Read it with aura_group first if you mean ' +
            'to keep anything.',
        inputSchema: {
            type: 'object',
            properties: {
                widgetId: { type: 'string', description: 'Id of the group/panels/universal widget.' },
                defId: { type: 'string', description: 'Alternative: options.defId of that widget.' },
                widgets: { type: 'string', description: 'JSON array of the children.' },
            },
            required: ['widgets'],
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

const KIND_LABEL = {
    layout: 'Layout',
    section: 'Bereich',
    tab: 'Tab',
    popup: 'Popup',
    widget: 'Widget',
    preset: 'Vorlage',
};

/**
 * Find the group a call means.
 *
 * The children of a group live under `options.defId`, not under the widget id —
 * but the id a model has in hand comes from aura_tab, and the defId is buried one
 * level down. Accepting either removes a lookup that was easy to get wrong and
 * whose failure read "Keine Gruppe mit defId undefined".
 */
async function resolveDefId(adapter, a, defs) {
    if (a.defId) {
        return defs[a.defId]
            ? { defId: a.defId }
            : { error: `Keine Gruppe mit defId "${a.defId}".\n${listDefs(defs)}` };
    }
    if (!a.widgetId) {
        return { error: `"defId" oder "widgetId" angeben — beides fehlt.\n${listDefs(defs)}` };
    }

    // The widget can sit in a tab, in a popup, or inside another group.
    const layouts = await readDashboard(adapter);
    let widget = null;
    const inTab = findWidget(layouts, a.widgetId);
    if (!inTab.error) {
        widget = inTab.tab.widgets[inTab.index];
    }
    if (!widget) {
        for (const view of await readPopupViews(adapter)) {
            widget = (view.widgets || []).find((w) => w && w.id === a.widgetId) || widget;
        }
    }
    if (!widget) {
        for (const children of Object.values(defs)) {
            widget = (children || []).find((w) => w && w.id === a.widgetId) || widget;
        }
    }
    if (!widget) {
        return { error: `Kein Widget mit der id "${a.widgetId}".` };
    }
    const defId = widget.options && widget.options.defId;
    if (!defId) {
        return {
            error:
                `Widget "${a.widgetId}" (${widget.type}) hat keine Gruppen-Kinder — ` +
                'nur group, panels und universal haben eine defId.',
        };
    }
    if (!defs[defId]) {
        return { error: `Widget "${a.widgetId}" verweist auf defId "${defId}", die es nicht gibt.\n${listDefs(defs)}` };
    }
    return { defId };
}

/**
 * The stored tab node, not the flattened view findTab returns.
 *
 * findTab answers with layoutName/sectionId alongside the tab's own fields, which
 * is what the addressing needs — but writing that object back would persist the
 * navigation context into the tab itself.
 */
function tabNode(layouts, id) {
    for (const layout of layouts || []) {
        for (const section of layout.sections || []) {
            for (const tab of section.tabs || []) {
                if (tab.id === id) {
                    return tab;
                }
            }
        }
    }
    return null;
}

/**
 * A section that lost its last tab gets a fresh empty one — same rule removeNode
 * follows, because a section with no tabs has nothing to render and no way back
 * through the UI.
 */
function refillEmptySections(layouts) {
    return (layouts || []).map((layout) => ({
        ...layout,
        sections: (layout.sections || []).map((section) => {
            if ((section.tabs || []).length) {
                return section;
            }
            const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const tab = { id: `tab-${stamp}`, name: 'Dashboard', slug: 'dashboard', widgets: [] };
            return { ...section, tabs: [tab], activeTabId: tab.id };
        }),
    }));
}

/**
 * Where inside an options object a string occurs — datapoints hide in statusDp,
 * powerDp, rows[].dp and a dozen other places, so a search that only compared
 * widget.datapoint would answer "not used" for half the dashboard.
 */
function findInOptions(value, needle, path) {
    if (typeof value === 'string') {
        return value.toLowerCase().includes(needle) ? path : '';
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const hit = findInOptions(value[i], needle, `${path}[${i}]`);
            if (hit) {
                return hit;
            }
        }
        return '';
    }
    if (value && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            const hit = findInOptions(val, needle, `${path}.${key}`);
            if (hit) {
                return hit;
            }
        }
    }
    return '';
}

/** Kinds that live in the dashboard tree and are addressed through locateNode. */
const STRUCTURAL_KINDS = ['layout', 'section', 'tab'];
const DELETE_KINDS = ['widget', 'tab', 'section', 'layout', 'popup', 'preset'];
const RENAME_KINDS = ['layout', 'section', 'tab', 'popup', 'preset'];

/**
 * A kind outside the enum used to fall through to the tab branch, which then
 * answered "Kein Tab ... gefunden" and listed tabs — an answer about the wrong
 * question entirely.
 */
function unknownKind(kind, allowed) {
    return `"kind": "${kind}" gibt es hier nicht. Erlaubt: ${allowed.join(', ')}.`;
}

/** The saved blueprints, for the "which are there" half of an error message. */
function listPresets(presets) {
    return presets.length
        ? `Vorhanden:\n${presets.map((p) => `- ${p.name} (${p.id})`).join('\n')}`
        : 'Es sind keine Vorlagen gespeichert.';
}

/**
 * Resolve a layout/section/tab by id or name for rename and delete, and describe
 * what it contains — a deletion that takes tabs and widgets with it should say so
 * in the answer rather than leave the user to find out.
 */
function locateNode(layouts, a) {
    if (a.kind === 'layout') {
        const found = findLayout(layouts, a.target);
        if (found.error) {
            return { error: `${found.error}\nVorhanden:\n${layouts.map((l) => `- ${l.name}`).join('\n')}` };
        }
        const sections = found.layout.sections || [];
        const tabs = sections.reduce((n, s) => n + (s.tabs || []).length, 0);
        return {
            id: found.layout.id,
            name: found.layout.name,
            slug: found.layout.slug,
            contains: `${sections.length} Bereich(en) und ${tabs} Tab(s)`,
        };
    }
    if (a.kind === 'section') {
        const found = findSection(layouts, { layout: a.layout, section: a.target });
        if (found.error) {
            return { error: found.error };
        }
        const tabs = found.section.tabs || [];
        const widgets = tabs.reduce((n, t) => n + (t.widgets || []).length, 0);
        return {
            id: found.section.id,
            name: found.section.name,
            slug: found.section.slug,
            contains: `${tabs.length} Tab(s) und ${widgets} Widget(s)`,
        };
    }
    const found = findTab(layouts, { tab: a.target, layout: a.layout, section: a.section });
    if (found.error) {
        const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
        return { error: `${found.error}\nVorhanden:\n${names.join('\n')}` };
    }
    return {
        id: found.tab.id,
        name: found.tab.name,
        slug: found.tab.slug,
        contains: `${found.tab.widgets.length} Widget(s)`,
    };
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
                return text(
                    `${adapter.namespace} hat noch keine Layouts konfiguriert. Mit aura_create_layout anfangen.`,
                );
            }
            const cols = designColumns(layouts);
            const rows = [];
            for (const layout of layouts) {
                for (const section of layout.sections || []) {
                    const secMarks = nodeMarkers(section);
                    rows.push(
                        `- ${layout.name} / ${section.name}` +
                            (secMarks.length ? ` [Bereichsmenü: ${secMarks.join(', ')}]` : ''),
                    );
                    for (const tab of section.tabs || []) {
                        const marks = nodeMarkers(tab);
                        rows.push(
                            `  · ${tab.name} — ${(tab.widgets || []).length} Widget(s)` +
                                (marks.length ? ` [Tab-Button: ${marks.join(', ')}]` : ''),
                        );
                    }
                }
            }
            return text(
                [
                    `# Dashboard ${adapter.namespace}`,
                    '',
                    `Raster: Zeilenhöhe ${grid.rowHeight} px, Spaltenbreite ${grid.snapX} px, Abstand ${grid.gap} px.`,
                    `Die vorhandenen Widgets nutzen ${cols} Spalten — daran halten, damit das Dashboard überall ` +
                        'gleich breit bleibt. Das Raster wächst mit, breiter ist also erlaubt und wird nur angemerkt.',
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
            const suffix = `\n\n${note}${vctx.columns ? ` Vorhandene Breite: ${vctx.columns} Spalten.` : ''}`;
            return errors.length ? fail(body + suffix) : text(body + suffix);
        }

        case 'aura_add_widget':
        case 'aura_write_tab': {
            // Appending a single child to a group. Without this the only way in was
            // aura_write_group, which replaces the whole list — twelve tiles had to
            // be written back flawlessly to add a thirteenth.
            if (name === 'aura_add_widget' && (a.defId || a.widgetId)) {
                const defs = await readGroupDefs(adapter);
                const which = await resolveDefId(adapter, a, defs);
                if (which.error) {
                    return fail(which.error);
                }
                const parsed = parseJson(a.widget, 'widget');
                if (parsed.error) {
                    return fail(parsed.error);
                }
                const children = defs[which.defId] || [];
                const child = parsed.value;
                if (child && child.gridPos && !Number.isInteger(child.gridPos.y)) {
                    child.gridPos.y = nextFreeRow(children);
                }
                const nextChildren = children.concat([child]);
                // The group has its own grid, so no dashboard column bound here.
                const check = await validateWidgets(adapter, schema, nextChildren, `Gruppe ${which.defId}`, {
                    strictIndices: [nextChildren.length - 1],
                });
                if (check.errors.length) {
                    return fail(
                        `Nicht geschrieben — die Gruppe wäre fehlerhaft.\n\n` +
                            formatFindings(check.errors, check.warnings),
                    );
                }
                const backup = await writeBackup(adapter);
                await writeGroupDefs(adapter, { [which.defId]: nextChildren });
                return text(
                    [
                        `Widget "${child && child.id}" an Gruppe ${which.defId} angehängt ` +
                            `(${nextChildren.length} Kind(er)).`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                        ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                    ].join('\n'),
                );
            }

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
                return fail(
                    layouts.length
                        ? `${where.error}\nVorhanden:\n${[...new Set(all)].join('\n')}`
                        : `${where.error} Es gibt noch kein Layout — mit aura_create_layout anfangen.`,
                );
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

        case 'aura_create_layout': {
            if (typeof a.name !== 'string' || !a.name.trim()) {
                return fail('"name" fehlt.');
            }
            const layouts = await readDashboard(adapter);
            const backup = await writeBackup(adapter);
            const next = insertLayout(layouts, a.name.trim());
            await writeDashboard(adapter, next.layouts);
            return text(
                [
                    `Layout „${next.layout.name}“ angelegt (slug "${next.layout.slug}"), mit dem Bereich ` +
                        `„${next.section.name}“ und einem Tab „${next.section.tabs[0].name}“.`,
                    `Erreichbar unter /#/view/${next.layout.slug}`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_create_section': {
            if (typeof a.name !== 'string' || !a.name.trim()) {
                return fail('"name" fehlt.');
            }
            const layouts = await readDashboard(adapter);
            let target;
            if (a.layout) {
                const found = findLayout(layouts, a.layout);
                if (found.error) {
                    return fail(`${found.error}\nVorhanden:\n${layouts.map((l) => `- ${l.name}`).join('\n')}`);
                }
                target = found.layout;
            } else if (layouts.length === 1) {
                target = layouts[0];
            } else {
                return fail(
                    `Es gibt ${layouts.length} Layouts — mit "layout" angeben, in welches.\n` +
                        layouts.map((l) => `- ${l.name}`).join('\n'),
                );
            }

            const backup = await writeBackup(adapter);
            const next = insertSection(layouts, target.id, a.name.trim());
            await writeDashboard(adapter, next.layouts);
            return text(
                [
                    `Bereich „${next.section.name}“ in Layout „${target.name}“ angelegt ` +
                        `(slug "${next.section.slug}"), mit einem Tab „${next.section.tabs[0].name}“.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_update_node': {
            const parsed = parseJson(a.patch, 'patch');
            if (parsed.error) {
                return fail(parsed.error);
            }
            if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
                return fail('"patch" muss ein Objekt sein.');
            }
            const layouts = await readDashboard(adapter);
            const located = locateNode(layouts, a);
            if (located.error) {
                return fail(located.error);
            }
            const updated = updateNode(layouts, a.kind, located.id, parsed.value);
            if (updated.error) {
                return fail(updated.error);
            }
            const backup = await writeBackup(adapter);
            await writeDashboard(adapter, updated.layouts);
            return text(
                [
                    `${KIND_LABEL[a.kind]} „${located.name}“ geändert: ${Object.keys(parsed.value).join(', ')}.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_reorder': {
            if (!Array.isArray(a.order) || !a.order.length) {
                return fail('"order" muss die vollständige neue Reihenfolge enthalten.');
            }
            const layouts = await readDashboard(adapter);

            if (a.kind === 'layout') {
                const res = reorderNodes(layouts, a.order, 'Layouts');
                if (res.error) {
                    return fail(res.error);
                }
                const backup = await writeBackup(adapter);
                await writeDashboard(adapter, res.ordered);
                return text(
                    [
                        `Layouts neu sortiert: ${res.ordered.map((l) => l.name).join(' → ')}.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'section') {
                const found = findLayout(layouts, a.layout || (layouts.length === 1 ? layouts[0].id : undefined));
                if (found.error) {
                    return fail(`${found.error}\nMit "layout" angeben, welches gemeint ist.`);
                }
                const res = reorderNodes(found.layout.sections || [], a.order, 'Bereiche');
                if (res.error) {
                    return fail(res.error);
                }
                const backup = await writeBackup(adapter);
                await writeDashboard(
                    adapter,
                    layouts.map((l) => (l.id === found.layout.id ? { ...l, sections: res.ordered } : l)),
                );
                return text(
                    [
                        `Bereiche in „${found.layout.name}“ neu sortiert: ${res.ordered.map((s) => s.name).join(' → ')}.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind !== 'tab') {
                return fail(unknownKind(a.kind, ['layout', 'section', 'tab']));
            }
            const where = findSection(layouts, { layout: a.layout, section: a.section });
            if (where.error) {
                return fail(where.error);
            }
            const res = reorderNodes(where.section.tabs || [], a.order, 'Tabs');
            if (res.error) {
                return fail(res.error);
            }
            const backup = await writeBackup(adapter);
            await writeDashboard(
                adapter,
                layouts.map((l) => ({
                    ...l,
                    sections: (l.sections || []).map((s) =>
                        s.id === where.section.id ? { ...s, tabs: res.ordered } : s,
                    ),
                })),
            );
            return text(
                [
                    `Tabs in „${where.layout.name} / ${where.section.name}“ neu sortiert: ` +
                        `${res.ordered.map((t) => t.name).join(' → ')}.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_copy_widget': {
            const layouts = await readDashboard(adapter);
            const source = findWidget(layouts, a.widgetId);
            if (source.error) {
                return fail(source.error);
            }
            const target = findTab(layouts, { tab: a.toTab, layout: a.layout, section: a.section });
            if (target.error) {
                const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${target.error}\nVorhanden:\n${names.join('\n')}`);
            }
            const move = a.mode === 'move';
            if (target.tab.id === source.tab.id) {
                return fail(`Das Widget liegt bereits in „${target.tab.name}“.`);
            }

            const defs = await readGroupDefs(adapter);
            const original = source.tab.widgets[source.index];
            const newDefs = {};
            const placed = move
                ? { ...original }
                : cloneWidget(original, defs, newDefs, Math.random().toString(36).slice(2, 6));
            placed.gridPos = { ...placed.gridPos, x: 0, y: nextFreeRow(target.tab.widgets) };

            const nextTarget = target.tab.widgets.concat([placed]);
            const check = await validateWidgets(adapter, schema, nextTarget, target.tab.name, {
                columns: designColumns(layouts),
                strictIndices: [nextTarget.length - 1],
            });
            if (check.errors.length) {
                return fail(
                    `Nicht ${move ? 'verschoben' : 'kopiert'}.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            let next = replaceTabWidgets(layouts, target.tab.id, nextTarget);
            if (move) {
                next = replaceTabWidgets(
                    next,
                    source.tab.id,
                    source.tab.widgets.filter((w) => w.id !== a.widgetId),
                );
            }
            await writeDashboard(adapter, next, Object.keys(newDefs).length ? newDefs : null);
            return text(
                [
                    `Widget "${a.widgetId}" ${move ? 'verschoben' : `kopiert als "${placed.id}"`} nach ` +
                        `${target.tab.layoutName} / ${target.tab.sectionName} / ${target.tab.name}.` +
                        (Object.keys(newDefs).length
                            ? ' Die Gruppen-Kinder wurden mitkopiert und haben eigene Ids.'
                            : ''),
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_presets': {
            const presets = await readPresets(adapter);
            if (!presets.length) {
                return text('Keine Widget-Vorlagen gespeichert.');
            }
            const rows = presets.map(
                (p) =>
                    `- ${p.name} (id ${p.id}) — ${p.widget && p.widget.type}` +
                    `${p.category ? `, ${p.category}` : ''}` +
                    `${p.groupDefs && Object.keys(p.groupDefs).length ? ', mit Gruppen-Kindern' : ''}`,
            );
            return text(`# Widget-Vorlagen (${presets.length})\n${rows.join('\n')}`);
        }

        case 'aura_insert_preset': {
            const presets = await readPresets(adapter);
            const found = findPreset(presets, a.preset);
            if (found.error) {
                return fail(`${found.error}\nVorhanden:\n${presets.map((p) => `- ${p.name} (${p.id})`).join('\n')}`);
            }
            const layouts = await readDashboard(adapter);
            const target = findTab(layouts, { tab: a.tab, layout: a.layout, section: a.section });
            if (target.error) {
                const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${target.error}\nVorhanden:\n${names.join('\n')}`);
            }

            // Fresh ids all the way down, or a second insert of the same preset
            // would share children with the first.
            const suffix = Math.random().toString(36).slice(2, 6);
            const newDefs = {};
            const widget = cloneWidget(found.preset.widget, found.preset.groupDefs || {}, newDefs, suffix);
            widget.id = `w-${Date.now()}-${suffix}`;
            if (typeof a.datapoint === 'string' && a.datapoint) {
                widget.datapoint = a.datapoint;
            }
            widget.gridPos = { ...widget.gridPos, x: 0, y: nextFreeRow(target.tab.widgets) };

            const nextWidgets = target.tab.widgets.concat([widget]);
            const check = await validateWidgets(adapter, schema, nextWidgets, target.tab.name, {
                columns: designColumns(layouts),
                strictIndices: [nextWidgets.length - 1],
            });
            if (check.errors.length) {
                return fail(`Nicht eingefügt.\n\n${formatFindings(check.errors, check.warnings)}`);
            }

            const backup = await writeBackup(adapter);
            await writeDashboard(
                adapter,
                replaceTabWidgets(layouts, target.tab.id, nextWidgets),
                Object.keys(newDefs).length ? newDefs : null,
            );
            return text(
                [
                    `Vorlage „${found.preset.name}“ als "${widget.id}" in ` +
                        `${target.tab.layoutName} / ${target.tab.sectionName} / ${target.tab.name} eingefügt.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_save_preset': {
            if (typeof a.name !== 'string' || !a.name.trim()) {
                return fail('"name" fehlt.');
            }
            const layouts = await readDashboard(adapter);
            const found = findWidget(layouts, a.widgetId);
            if (found.error) {
                return fail(found.error);
            }
            const defs = await readGroupDefs(adapter);
            const widget = found.tab.widgets[found.index];
            const used = collectDefIds([widget], defs);
            const groupDefs = {};
            for (const id of used) {
                groupDefs[id] = defs[id];
            }

            const presets = await readPresets(adapter);
            const preset = {
                id: newId('preset'),
                name: a.name.trim(),
                widget: JSON.parse(JSON.stringify(widget)),
                createdAt: Date.now(),
            };
            if (a.icon) {
                preset.icon = a.icon;
            }
            if (used.size) {
                preset.groupDefs = groupDefs;
            }
            const backup = await writeBackup(adapter);
            await writePresets(adapter, presets.concat([preset]));
            return text(
                [
                    `Vorlage „${preset.name}“ aus Widget "${a.widgetId}" gespeichert` +
                        `${used.size ? ` (mit ${used.size} Gruppen-Definition(en))` : ''}.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                ].join('\n'),
            );
        }

        case 'aura_backups': {
            const names = await listBackups(adapter);
            if (!names.length) {
                return text('Noch keine Sicherungen — es wurde über den MCP noch nichts geändert.');
            }
            const rows = names.slice(0, 30).map((n) => {
                // mcp-2026-08-31T09-14-22-812Z.json → readable again
                const stamp = n.slice(4, -5).replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2');
                return `- ${n}  (${stamp.replace('T', ' ')})`;
            });
            return text(
                `# Sicherungen (${names.length})\n${rows.join('\n')}` +
                    (names.length > 30 ? `\n… und ${names.length - 30} ältere` : ''),
            );
        }

        case 'aura_restore': {
            const res = await restoreBackup(adapter, a.backup);
            if (res.error) {
                const names = await listBackups(adapter);
                return fail(
                    `${res.error}\nVorhanden:\n${names
                        .slice(0, 10)
                        .map((n) => `- ${n}`)
                        .join('\n')}`,
                );
            }
            return text(
                [
                    `Sicherung "${a.backup}" zurückgespielt (${res.written.join(', ')}).`,
                    `Der Stand davor liegt als ${adapter.namespace}.backups/${res.safety}.`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_rename': {
            if (typeof a.name !== 'string' || !a.name.trim()) {
                return fail('"name" fehlt.');
            }
            const name = a.name.trim();

            if (a.kind === 'popup') {
                const views = await readPopupViews(adapter);
                const found = findPopupView(views, a.target);
                if (found.error) {
                    return fail(`${found.error}\n${listPopups(views)}`);
                }
                const backup = await writeBackup(adapter);
                await writePopupViews(
                    adapter,
                    // A renamed built-in must be flagged too, or the rename is undone
                    // by ensureBuiltins() on the next frontend start.
                    views.map((v) => (v.id === found.view.id ? { ...v, name, userEdited: true } : v)),
                );
                return text(
                    [
                        `Popup „${found.view.name}“ heißt jetzt „${name}“.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'preset') {
                const presets = await readPresets(adapter);
                const found = findPreset(presets, a.target);
                if (found.error) {
                    return fail(`${found.error}\n${listPresets(presets)}`);
                }
                const backup = await writeBackup(adapter);
                await writePresets(
                    adapter,
                    presets.map((x) => (x.id === found.preset.id ? { ...x, name } : x)),
                );
                return text(
                    [
                        `Vorlage „${found.preset.name}“ heißt jetzt „${name}“.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    ].join('\n'),
                );
            }
            if (!STRUCTURAL_KINDS.includes(a.kind)) {
                return fail(unknownKind(a.kind, RENAME_KINDS));
            }

            const layouts = await readDashboard(adapter);
            const located = locateNode(layouts, a);
            if (located.error) {
                return fail(located.error);
            }
            const renamed = renameNode(layouts, a.kind, located.id, name);
            if (renamed.error) {
                return fail(renamed.error);
            }
            const backup = await writeBackup(adapter);
            await writeDashboard(adapter, renamed.layouts);
            return text(
                [
                    `${KIND_LABEL[a.kind]} „${located.name}“ heißt jetzt „${name}“. Der slug bleibt "${located.slug}", ` +
                        'damit Links und Navigations-Datenpunkte weiter funktionieren.',
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                ].join('\n'),
            );
        }

        case 'aura_delete': {
            if (a.kind === 'popup') {
                const views = await readPopupViews(adapter);
                const found = findPopupView(views, a.target);
                if (found.error) {
                    return fail(`${found.error}\n${listPopups(views)}`);
                }
                const backup = await writeBackup(adapter);
                await writePopupViews(
                    adapter,
                    views.filter((v) => v.id !== found.view.id),
                );
                return text(
                    [
                        `Popup „${found.view.name}“ gelöscht (${(found.view.widgets || []).length} Widget(s)).`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'widget') {
                const layouts = await readDashboard(adapter);
                const defs = await readGroupDefs(adapter);
                if (a.defId) {
                    const children = defs[a.defId];
                    if (!children) {
                        return fail(`Keine Gruppe mit defId "${a.defId}".\n${listDefs(defs)}`);
                    }
                    if (!children.some((w) => w && w.id === a.target)) {
                        const ids = children.map((w) => (w && w.id) || '?').join(', ');
                        return fail(`Kein Kind mit der id "${a.target}" in Gruppe ${a.defId}.\nVorhanden: ${ids}`);
                    }
                    const backup = await writeBackup(adapter);
                    await writeGroupDefs(adapter, { [a.defId]: children.filter((w) => w.id !== a.target) });
                    return text(
                        [
                            `Widget "${a.target}" aus Gruppe ${a.defId} gelöscht.`,
                            `Sicherung: ${adapter.namespace}.backups/${backup}`,
                            EDITOR_NOTE,
                        ].join('\n'),
                    );
                }
                const found = findWidget(layouts, a.target);
                if (found.error) {
                    return fail(`${found.error}\nFür ein Gruppen-Kind die defId der Gruppe mitgeben.`);
                }
                const backup = await writeBackup(adapter);
                const nextList = found.tab.widgets.filter((w) => w.id !== a.target);
                await writeDashboard(adapter, replaceTabWidgets(layouts, found.tab.id, nextList));
                return text(
                    [
                        `Widget "${a.target}" aus ${found.tab.layoutName} / ${found.tab.sectionName} / ` +
                            `${found.tab.name} gelöscht.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'preset') {
                const presets = await readPresets(adapter);
                const found = findPreset(presets, a.target);
                if (found.error) {
                    return fail(`${found.error}\n${listPresets(presets)}`);
                }
                const backup = await writeBackup(adapter);
                await writePresets(
                    adapter,
                    presets.filter((x) => x.id !== found.preset.id),
                );
                return text(
                    [
                        `Vorlage „${found.preset.name}“ gelöscht.`,
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    ].join('\n'),
                );
            }
            if (!STRUCTURAL_KINDS.includes(a.kind)) {
                return fail(unknownKind(a.kind, DELETE_KINDS));
            }

            const layouts = await readDashboard(adapter);
            const located = locateNode(layouts, a);
            if (located.error) {
                return fail(located.error);
            }
            const removed = removeNode(layouts, a.kind, located.id);
            if (removed.error) {
                return fail(removed.error);
            }
            const backup = await writeBackup(adapter);
            await writeDashboard(adapter, removed.layouts);
            return text(
                [
                    `${KIND_LABEL[a.kind]} „${located.name}“ gelöscht — mit ${located.contains}.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
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

        case 'aura_update_widget': {
            const parsed = parseJson(a.patch, 'patch');
            if (parsed.error) {
                return fail(parsed.error);
            }
            if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
                return fail('"patch" muss ein Objekt sein.');
            }

            const layouts = await readDashboard(adapter);
            const defs = await readGroupDefs(adapter);
            const inGroup = typeof a.defId === 'string' && a.defId;

            let list;
            let index;
            let hostTab = null;
            if (inGroup) {
                if (!defs[a.defId]) {
                    return fail(`Keine Gruppe mit defId "${a.defId}".\n${listDefs(defs)}`);
                }
                list = defs[a.defId];
                index = list.findIndex((w) => w && w.id === a.widgetId);
                if (index < 0) {
                    const ids = list.map((w) => (w && w.id) || '?').join(', ');
                    return fail(`Kein Kind mit der id "${a.widgetId}" in Gruppe ${a.defId}.\nVorhanden: ${ids}`);
                }
            } else {
                const found = findWidget(layouts, a.widgetId);
                if (found.error) {
                    return fail(`${found.error}\nFür ein Gruppen-Kind die defId der Gruppe mitgeben.`);
                }
                list = found.tab.widgets;
                index = found.index;
                hostTab = found.tab;
            }

            const before = list[index];
            const after = a.replace ? parsed.value : mergeWidget(before, parsed.value);
            // The id stays the caller's responsibility only insofar as it must still
            // identify this widget; silently renaming it would orphan every reference.
            if (after.id !== before.id) {
                return fail(`Die id darf sich nicht ändern ("${before.id}" → "${after.id}").`);
            }
            const nextList = list.map((w, i) => (i === index ? after : w));

            // Only the changed widget gets the full rules; its neighbours are not
            // the caller's doing. Overlaps still count across the whole list.
            const knownDatapoints = await listStateIds(adapter);
            const { errors, warnings } = validateTab(
                { _type: 'aura-tab', tab: { name: inGroup ? `Gruppe ${a.defId}` : hostTab.name, widgets: nextList } },
                schema,
                {
                    knownDatapoints,
                    strictIndices: [index],
                    ...(inGroup ? {} : { columns: designColumns(layouts) }),
                },
            );
            if (errors.length) {
                return fail(`Nicht geändert.\n\n${formatFindings(errors, warnings)}`);
            }

            const backup = await writeBackup(adapter);
            if (inGroup) {
                await writeGroupDefs(adapter, { [a.defId]: nextList });
            } else {
                await writeDashboard(adapter, replaceTabWidgets(layouts, hostTab.id, nextList));
            }
            const where = inGroup
                ? `Gruppe ${a.defId}`
                : `${hostTab.layoutName} / ${hostTab.sectionName} / ${hostTab.name}`;
            const changed = Object.keys(parsed.value).join(', ');
            return text(
                [
                    `Widget "${a.widgetId}" in ${where} geändert (${a.replace ? 'ersetzt' : `Felder: ${changed}`}).`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(warnings.length ? ['', formatFindings([], warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_group': {
            const defs = await readGroupDefs(adapter);
            const which = await resolveDefId(adapter, a, defs);
            if (which.error) {
                return fail(which.error);
            }
            const children = defs[which.defId];
            return text(`Gruppe ${which.defId} — ${children.length} Kind(er)\n${fence(children)}`);
        }

        case 'aura_write_group': {
            const list = readWidgetList(a.widgets, null, true);
            if (list.error) {
                return fail(list.error);
            }
            const defs = await readGroupDefs(adapter);
            const which = await resolveDefId(adapter, a, defs);
            if (which.error) {
                return fail(which.error);
            }
            const defId = which.defId;

            // Children sit in the group's own grid, not the dashboard's.
            const check = await validateWidgets(adapter, schema, list.widgets, `Gruppe ${defId}`, {});
            if (check.errors.length) {
                return fail(
                    `Nicht geschrieben — die Gruppe wäre fehlerhaft.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            await writeGroupDefs(adapter, { [defId]: list.widgets });
            return text(
                [
                    `Gruppe ${defId}: ${list.widgets.length} Kind(er) geschrieben.`,
                    `Sicherung: ${adapter.namespace}.backups/${backup}`,
                    EDITOR_NOTE,
                    ...(check.warnings.length ? ['', formatFindings([], check.warnings)] : []),
                ].join('\n'),
            );
        }

        case 'aura_find': {
            const needles = {
                datapoint: typeof a.datapoint === 'string' ? a.datapoint.trim().toLowerCase() : '',
                type: typeof a.type === 'string' ? a.type.trim().toLowerCase() : '',
                title: typeof a.title === 'string' ? a.title.trim().toLowerCase() : '',
            };
            if (!needles.datapoint && !needles.type && !needles.title) {
                return fail('Mindestens eines von "datapoint", "type" oder "title" angeben.');
            }
            const layouts = await readDashboard(adapter);
            const defs = await readGroupDefs(adapter);
            const views = await readPopupViews(adapter);
            const hits = [];

            const scan = (widget, where) => {
                if (!widget || typeof widget !== 'object') {
                    return;
                }
                const type = String(widget.type || '').toLowerCase();
                const title = String(widget.title || '').toLowerCase();
                const dp = String(widget.datapoint || '').toLowerCase();
                if (needles.type && type !== needles.type) {
                    return;
                }
                if (needles.title && !title.includes(needles.title)) {
                    return;
                }
                let via = '';
                if (needles.datapoint) {
                    if (dp.includes(needles.datapoint)) {
                        via = 'datapoint';
                    } else {
                        // A datapoint is just as often in an option (statusDp,
                        // powerDp, rows[].dp …) — a search that only looked at
                        // widget.datapoint would report "not used" for half of them.
                        via = findInOptions(widget.options, needles.datapoint, 'options');
                        if (!via) {
                            return;
                        }
                    }
                }
                hits.push(
                    `- ${widget.id} (${widget.type}) „${widget.title || ''}“ — ${where}` +
                        (via && via !== 'datapoint' ? ` · Treffer in ${via}` : '') +
                        (widget.datapoint ? ` · ${widget.datapoint}` : ''),
                );
            };

            for (const tab of allTabs(layouts)) {
                for (const w of tab.widgets || []) {
                    scan(w, `${tab.layoutName} / ${tab.sectionName} / ${tab.name}`);
                }
            }
            for (const [defId, children] of Object.entries(defs)) {
                for (const w of children || []) {
                    scan(w, `Gruppe ${defId}`);
                }
            }
            for (const view of views) {
                for (const w of view.widgets || []) {
                    scan(w, `Popup „${view.name}“`);
                }
            }

            if (!hits.length) {
                return text('Keine Treffer.');
            }
            const limit = Number.isInteger(a.limit) && a.limit > 0 ? a.limit : 100;
            const shown = hits.slice(0, limit);
            return text(
                `# ${hits.length} Treffer\n${shown.join('\n')}` +
                    (hits.length > shown.length ? `\n… ${hits.length - shown.length} weitere` : ''),
            );
        }

        case 'aura_copy_node': {
            const move = a.mode === 'move';
            const layouts = await readDashboard(adapter);
            const defs = await readGroupDefs(adapter);
            const suffix = Math.random().toString(36).slice(2, 6);
            const newDefs = {};

            if (a.kind === 'tab') {
                const source = findTab(layouts, { tab: a.target, layout: a.fromLayout, section: a.fromSection });
                if (source.error) {
                    const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                    return fail(`${source.error}\nVorhanden:\n${names.join('\n')}`);
                }
                const dest = findSection(layouts, { layout: a.toLayout, section: a.toSection });
                if (dest.error) {
                    return fail(`${dest.error}\nZiel mit "toLayout" und "toSection" angeben.`);
                }
                if (dest.section.id === source.tab.sectionId) {
                    return fail(`Der Tab liegt bereits in „${dest.layout.name} / ${dest.section.name}“.`);
                }
                const node = tabNode(layouts, source.tab.id);

                const taken = (dest.section.tabs || []).map((t) => t.slug);
                const backup = await writeBackup(adapter);
                let next;
                let label;
                if (move) {
                    next = attachTab(detachTab(layouts, node.id), dest.section.id, {
                        ...node,
                        slug: uniqueSlug(node.slug, taken),
                    });
                    next = refillEmptySections(next);
                    label = `Tab „${source.tab.name}“ verschoben nach`;
                } else {
                    const copy = cloneTab(node, defs, newDefs, suffix, taken, a.name || `${node.name} Kopie`);
                    next = attachTab(layouts, dest.section.id, copy);
                    label = `Tab „${source.tab.name}“ kopiert als „${copy.name}“ nach`;
                }
                await writeDashboard(adapter, next, Object.keys(newDefs).length ? newDefs : null);
                return text(
                    [
                        `${label} ${dest.layout.name} / ${dest.section.name}.` +
                            (Object.keys(newDefs).length ? ' Gruppen-Kinder wurden mitkopiert.' : ''),
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'section') {
                const source = findSection(layouts, { section: a.target, layout: a.fromLayout });
                if (source.error) {
                    return fail(source.error);
                }
                const dest = findLayout(layouts, a.toLayout);
                if (dest.error) {
                    return fail(`${dest.error}\nZiel-Layout mit "toLayout" angeben.`);
                }
                if (move && dest.layout.id === source.layout.id) {
                    return fail(`Der Bereich liegt bereits in „${dest.layout.name}“.`);
                }
                if (move && (source.layout.sections || []).length < 2) {
                    return fail(
                        `„${source.layout.name}“ hätte danach keinen Bereich mehr. Erst einen zweiten anlegen.`,
                    );
                }

                const taken = (dest.layout.sections || []).map((x) => x.slug);
                const backup = await writeBackup(adapter);
                let next;
                let label;
                if (move) {
                    next = attachSection(detachSection(layouts, source.section.id), dest.layout.id, {
                        ...source.section,
                        slug: uniqueSlug(source.section.slug, taken),
                    });
                    label = `Bereich „${source.section.name}“ verschoben nach`;
                } else {
                    const copy = cloneSection(
                        source.section,
                        defs,
                        newDefs,
                        suffix,
                        taken,
                        a.name || `${source.section.name} Kopie`,
                    );
                    next = attachSection(layouts, dest.layout.id, copy);
                    label = `Bereich „${source.section.name}“ kopiert als „${copy.name}“ nach`;
                }
                await writeDashboard(adapter, next, Object.keys(newDefs).length ? newDefs : null);
                return text(
                    [
                        `${label} „${dest.layout.name}“ (${(source.section.tabs || []).length} Tab(s)).` +
                            (Object.keys(newDefs).length ? ' Gruppen-Kinder wurden mitkopiert.' : ''),
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            if (a.kind === 'layout') {
                if (move) {
                    return fail('Ein Layout hat kein übergeordnetes Element — für die Reihenfolge aura_reorder.');
                }
                const source = findLayout(layouts, a.target);
                if (source.error) {
                    return fail(source.error);
                }
                const name = (a.name || `${source.layout.name} Kopie`).trim();
                const sections = [];
                for (const sec of source.layout.sections || []) {
                    sections.push(
                        cloneSection(
                            sec,
                            defs,
                            newDefs,
                            suffix,
                            sections.map((x) => x.slug),
                        ),
                    );
                }
                const copy = {
                    id: `layout-${Date.now()}-${suffix}`,
                    name,
                    slug: uniqueSlug(
                        slugify(name),
                        layouts.map((l) => l.slug),
                    ),
                    sections,
                    activeSectionId: sections.length ? sections[0].id : undefined,
                };
                const backup = await writeBackup(adapter);
                await writeDashboard(adapter, layouts.concat([copy]), Object.keys(newDefs).length ? newDefs : null);
                return text(
                    [
                        `Layout „${source.layout.name}“ kopiert als „${name}“ (slug "${copy.slug}", ` +
                            `${sections.length} Bereich(e)).` +
                            (Object.keys(newDefs).length ? ' Gruppen-Kinder wurden mitkopiert.' : ''),
                        `Sicherung: ${adapter.namespace}.backups/${backup}`,
                        EDITOR_NOTE,
                    ].join('\n'),
                );
            }

            return fail(unknownKind(a.kind, ['tab', 'section', 'layout']));
        }

        default:
            return fail(`Unbekanntes Werkzeug: ${name}`);
    }
}

module.exports = { INSTRUCTIONS, LEVELS, TOOLS, callTool, levelIndex, toolsFor };
