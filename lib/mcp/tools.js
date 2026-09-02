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

const { renderNamedTypes, renderTypeIndex, renderTypeDetail, renderWidgetShape } = require('./render');
const { findRecipe, renderRecipe, renderRecipeIndex, RECIPES } = require('./recipes');
const { renderReview, reviewWidgets } = require('./review');
const { auditDashboard, renderAudit } = require('./audit');
const { collectDatapointRefs } = require('./dpFit');
const { measureWidget, renderMeasure } = require('./measure');
const { designCanvas, renderCanvas } = require('./canvas');
const { readThemeChoice, renderPalette, renderTheme } = require('./theme');
const { resolveBaseUrl } = require('./clientConfig');
const { validateAny, validateTab } = require('./validate');
const {
    allTabs,
    collectDefIds,
    readLoggingInstances,
    readStateMeta,
    readStateValues,
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
    cloneWidgets,
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
    hostOf,
    listBackups,
    listStateIds,
    readCanvas,
    readDashboard,
    readFrontendConfig,
    readGrid,
    readGroupDefs,
    removeNode,
    nodeMarkers,
    renameNode,
    replaceTabWidgets,
    replaceGroupDefs,
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
    'An id that exists is not yet an id that works: a control on a state with common.write false looks',
    'right everywhere and does nothing when pressed. aura_validate names those — read its warnings.',
    '',
    'Workflow for building something:',
    '1. aura_dashboard — layouts, sections, tabs, grid geometry, column width.',
    '2. aura_recipes — finished, valid widgets for the usual jobs. Start from the closest one whenever',
    '   there is one; the schema alone reliably produces bare one-value tiles.',
    '3. aura_tab on a tab the user already has — their own dashboard is the style to match.',
    '4. aura_widget_types, then aura_widget_schema for the few types you will use.',
    '5. Get the datapoint ids from the ioBroker MCP.',
    '6. aura_validate — always. A misnamed option is otherwise ignored silently and the user',
    '   is left wondering why the setting did nothing. The same goes for a setting on the wrong',
    '   display: a list row is drawn by its displayType, and everything the display does not read',
    '   is dropped without a word. Read its warnings, not only the errors:',
    '   a chart on a datapoint that no history adapter records is valid JSON and an empty chart',
    '   for ever. Charts need a LOGGED datapoint — ask the ioBroker MCP or the user, and offer',
    '   to switch recording on rather than delivering a frame with no data in it.',
    '7. aura_measure whenever you set a height for a list, table, gauge or chart. Rows are not',
    '   pixels, and a list cut off after nine of sixteen rows looks correct in the JSON. Its number',
    '   follows the layout, the options and the row displays you set (a card row is twice a default one,',
    '   a second line per entry adds half again, a contact or state chip row is taller than a value row)',
    '   — measure the widget you are about to write, not a plain one.',
    '8. aura_write_tab or aura_add_widget. Every write backs the configuration up first.',
    '',
    'Build the dashboard, not the minimum the schema accepts. A room is one list widget (autolist or',
    'list with per-row displays), not eight value tiles. A counter becomes a chart with delta',
    'aggregation, not a raw reading. A measurement with a good and a bad range gets colorThresholds, a',
    'state worth noticing gets a condition or a badge. Leaving every option at its default is a',
    'defensible way to write valid JSON and a poor way to build a dashboard — fetch the recipe instead.',
    '',
    'Structure: aura_create_tab adds a page, aura_create_section a menu entry, aura_create_layout a',
    'whole separate view with its own URL. Reach for the last one only when the user asks for a',
    'separate screen — another page inside an existing view is a tab.',
    'Popups: aura_popups, aura_popup, aura_write_popup — the views that open on a widget click.',
    'Navigation: aura_update_node sets the properties of a layout, section or tab button — icon, hidden,',
    'badges, the badge aggregate, and conditions on a tab. aura_dashboard shows which are set.',
    'Popups are not a special case: aura_add_widget, aura_update_widget, aura_copy_widget and',
    'aura_delete take a popup view wherever they take a tab, addressed by its name.',
    'Review: aura_review with no tab sweeps the whole dashboard for dead datapoints, states nothing has',
    'written to in weeks, options a widget no longer reads and duplicate ids — the answer to "why is this',
    'tile empty". Offer it for any dashboard that has grown over time.',
    'Size: aura_measure converts rows to pixels for THIS dashboard and compares them with the measured',
    'height a type needs. It also returns the URL of the tab — the only way anyone can check how it looks.',
    'Budget: aura_widget_types accepts group=control|special|layout, aura_widget_schema brief=true,',
    'options=[…] for single keys, and sharedTypes=false with aura_types to fetch a named type once',
    'instead of having it reprinted with every widget type.',
    'One widget: aura_update_widget changes it in place — in a tab, or in a group with defId. The',
    'patch is merged, so an adjustment cannot lose the options you did not mention.',
    'Groups: aura_group, aura_write_group — the children of a group, panels or universal widget',
    '(pass the defId from its options).',
    'aura_review on one tab also names what would make it better — the answer to "why does my dashboard',
    'look so bare". Offer it when the user asks about an existing tab.',
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
    'Text bindings: a datapoint written into a text shows its live value, so a value rarely needs a widget',
    'of its own. A widget title takes [[0_userdata.0.Temp]]; a marker label (badges[].label with style',
    '"label"), the HTML widget content and the value widget template take {0_userdata.0.Temp}, plus',
    '{dp} for the widget own datapoint, {id;round(0)} through operations and {{ a + b }} as an expression.',
    'gridPos is in grid cells: x/w columns, y/h rows. Widgets must not overlap.',
    'The column count in aura_dashboard is what the existing widgets use, not a hard limit — going',
    'wider warns rather than fails, because the grid grows with the content.',
    'Screen size: if the user has drawn guidelines in the editor, aura_dashboard states the target',
    'device and how many columns and rows fit on it. Build a tab to that budget — beyond it the user',
    'has to scroll. If no guidelines are set, ask what screen the dashboard is for before laying out',
    'a whole tab.',
    'A widget whose rows appear at runtime (autolist, statusoverview) has no height you can plan —',
    'set options.maxRows and it does: the rest shows up as a „+N weitere“ row instead of being cut',
    'off silently, and aura_measure can then size it.',
    'Colours: never write a hex value into a widget. aura_dashboard hands over this dashboard’s palette',
    'and aura_theme has the rest — var(--accent-green), var(--text-secondary) and so on follow the theme',
    'the user picked and their light/dark switch; a fixed colour holds up in one theme and clashes in the next.',
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
            'geometry, the column width this dashboard is designed for and the target screen the user drew ' +
            'with the guidelines (how many columns and rows fit without scrolling). Start here.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_types',
        level: 'read',
        description:
            'Every AURA widget type with label, default size and available layouts. Pick from here, then fetch ' +
            'the options of the chosen types with aura_widget_schema. Narrow it with group when you already ' +
            'know the kind of widget you need — the full list is long.',
        inputSchema: {
            type: 'object',
            properties: {
                group: { type: 'string', description: 'Only one category: control, special or layout.' },
            },
        },
    },
    {
        name: 'aura_widget_schema',
        level: 'read',
        description:
            'Full option documentation for the named widget types, plus the structure of a widget object. Ask ' +
            'only for the types you intend to use — the complete schema is large. Budget: ask for several types ' +
            'in ONE call (the shared types are then printed once), narrow with options, and set ' +
            'sharedTypes=false plus shape=false on follow-up calls — the named-type block alone is two thirds ' +
            'of the answer.',
        inputSchema: {
            type: 'object',
            properties: {
                types: { type: 'array', items: { type: 'string' }, description: 'e.g. ["switch","thermostat"]' },
                brief: {
                    type: 'boolean',
                    description: 'Names and types only, no descriptions — about a third of the size.',
                },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Only these option keys, e.g. ["entries","rowConditions"]. Omitted = all of them.',
                },
                sharedTypes: {
                    type: 'boolean',
                    description:
                        'Print the named types (Condition, CustomCell, …). Default true. False names them with ' +
                        'their size instead — fetch what you need with aura_types.',
                },
                shape: {
                    type: 'boolean',
                    description: 'Repeat the "Aufbau eines Widgets" block. Default true; false on follow-up calls.',
                },
            },
            required: ['types'],
        },
    },
    {
        name: 'aura_types',
        level: 'read',
        description:
            'The named types by name — WidgetCondition, CustomCell, StaticListEntry, ColorThreshold and the ' +
            'rest. The companion to aura_widget_schema with sharedTypes=false: fetch a type once instead of ' +
            'having it reprinted with every widget type that references it.',
        inputSchema: {
            type: 'object',
            properties: {
                names: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'e.g. ["WidgetCondition","CustomCell"] — the names from the type lines.',
                },
                brief: { type: 'boolean', description: 'Without the field descriptions.' },
            },
            required: ['names'],
        },
    },
    {
        name: 'aura_recipes',
        level: 'read',
        description:
            'Worked examples: complete, valid widgets for the jobs that come up — a room as one list ' +
            'instead of many tiles, a counter as consumption bars, a tile with colour thresholds and ' +
            'conditions, a status overview, a whole room tab. Without an id it lists what is there. Read ' +
            'the closest one before building something of that kind; it shows which options actually ' +
            'matter, which the schema alone does not.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Recipe id from the list. Omitted = the list itself.' },
            },
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
        name: 'aura_review',
        level: 'read',
        description:
            'Looks over what already exists. Two halves: style — rows of single-value tiles that belong in one ' +
            'list, numbers without a good or bad range, a meter shown as its raw reading, a tab where nothing ' +
            'reacts to anything; and health — datapoints that no longer exist, datapoints nothing has written ' +
            'to in weeks, options the widget does not read any more, settings one level too high, duplicate ' +
            'widget ids, groups whose children are gone, empty tabs. A named tab is reviewed on its own; ' +
            'without a tab (or with scope="all") it sweeps every tab, popup and group in the dashboard, which ' +
            'is where the health half earns its keep. Suggestions, not edits.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: {
                    type: 'string',
                    description: 'Tab or popup view: name, slug or id. Omitted = the whole dashboard.',
                },
                mode: {
                    type: 'string',
                    enum: ['style', 'health', 'both'],
                    description:
                        'Default: both for one tab, health for the whole dashboard (the style remarks would ' +
                        'otherwise repeat per tab).',
                },
                scope: {
                    type: 'string',
                    enum: ['tab', 'all'],
                    description:
                        'How far the health half looks. Default "tab" when a tab is named (that tab and the ' +
                        'groups it uses), "all" otherwise. Pass "all" together with a tab to get the style ' +
                        'remarks for the tab and the health sweep for the whole dashboard.',
                },
                staleDays: {
                    type: 'number',
                    description: 'How many days without a change count as stale. Default 14.',
                },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
        },
    },
    {
        name: 'aura_theme',
        level: 'read',
        description:
            'The colours of THIS dashboard as the CSS tokens a widget should use — var(--accent-green), ' +
            'var(--text-secondary) and the rest — with the value each one has in the theme the user has ' +
            'selected. Ask before you write any colour: a hard-coded hex holds up in one theme and clashes ' +
            'in the next, and the user switches light/dark.',
        inputSchema: {
            type: 'object',
            properties: {
                elements: {
                    type: 'boolean',
                    description:
                        'Also list the optional per-element tokens (switch, shutter, gauge, chips …). ' +
                        'Default true; false keeps the answer to the base palette.',
                },
            },
        },
    },
    {
        name: 'aura_measure',
        level: 'read',
        description:
            'Does the content fit in the height you gave it? Converts rows to pixels for this dashboard and ' +
            'compares them with what the widget type actually needs — measured in the real frontend, not ' +
            'estimated. Answers "do 16 list rows fit in h=14" without the arithmetic, and names a height that ' +
            'works. Takes an existing tab, or a widget/tab JSON before you write it. Run it whenever you set a ' +
            'height for a list, a table, a gauge or a chart. A list row is measured per layout, per option ' +
            '(second line, header) and per row display — a contact, a state chip or a date picker is taller ' +
            'than a value row, and a list that mixes them is summed row by row. The answer names the factors ' +
            'that are NOT in the number. With guidelines set it also names the widgets that end outside the ' +
            'target screen.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Measure the widgets of this tab or popup view.' },
                json: { type: 'string', description: 'Alternative: a widget or aura-tab payload, as a string.' },
                items: {
                    type: 'number',
                    description:
                        'Rows to assume for a type that only knows its content at runtime (autolist, status ' +
                        'overview): with 16 the answer is for 16 rows. The row display is taken from ' +
                        'options.entryDisplay, so an autolist of contacts is not measured as one of values.',
                },
                layout: { type: 'string' },
                section: { type: 'string' },
            },
        },
    },
    {
        name: 'aura_validate',
        level: 'read',
        description:
            'Checks a widget or a tab payload against the widget schema, the live datapoints and the objects ' +
            'behind them: unknown options, wrong layouts, bad gridPos, overlapping widgets, missing datapoint ' +
            'ids (nested ones included — a list entry, a chart series), a chart series on a datapoint no ' +
            'history adapter records, a slider without a range, and every CONTROL that sits on a read-only ' +
            'state — the widget itself, the rows of a list, the up/stop/down of a shutter, the channels of ' +
            'a lamp. It also names the row settings the chosen display never reads: trueLabel/falseLabel on ' +
            'a "value" row, a state mapping without displayType "states", presets outside "buttons"/"select" ' +
            '— all of them dropped in silence, visible only in the browser. Run this before every write.',
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
            'Adds one widget below the existing content of a tab or a popup view — or into a group, panels ' +
            'or universal widget when defId or widgetId names one. Validates first and refuses on any ' +
            'error. Backs up the configuration before writing.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Target tab or popup view: name, slug or id.' },
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
                toTab: { type: 'string', description: 'Target tab or popup view: name, slug or id.' },
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
                kind: {
                    type: 'string',
                    enum: ['tab', 'section', 'layout', 'popup'],
                    description: 'What to copy or move. Layouts and popups can only be copied.',
                },
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
    const ctx = Object.assign({ knownDatapoints: await listStateIds(adapter) }, extra || {});

    // The objects behind the datapoints, not just the fact that the ids exist.
    // aura_validate has looked them up for a while, the write tools never did —
    // so the one chart mistake that is invisible afterwards (a series on a
    // datapoint no history adapter records) was written without a word and drew
    // an empty frame for ever. Checking only where it is checked on demand is
    // exactly the wrong way round: building is when it can still be fixed.
    //
    // `strictIndices` bounds the lookup the same way it bounds the rules —
    // appending one widget to a grown tab must not read two hundred objects.
    const strict = extra && extra.strictIndices ? new Set(extra.strictIndices) : null;
    const refs = new Set();
    (widgets || []).forEach((widget, i) => {
        if (strict && !strict.has(i)) {
            return;
        }
        // `loose`, so the rows of a list are looked up too: a list is one widget
        // with twenty controls in it, and the schema cannot mark `entries[].id`
        // as a datapoint without refusing divider rows. An id that turns out to
        // be synthetic simply has no object and produces no finding.
        for (const ref of collectDatapointRefs(widget, schema, { loose: true })) {
            refs.add(ref.id);
        }
    });
    if (refs.size) {
        const [meta, logging] = await Promise.all([readStateMeta(adapter, refs), readLoggingInstances(adapter)]);
        ctx.datapointMeta = meta;
        ctx.loggingInstances = logging;
    }

    return validateTab({ _type: 'aura-tab', tab: { name: String(label || 'Liste'), widgets } }, schema, ctx);
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

/**
 * Where a widget lives, and how to write it back.
 *
 * A widget can sit in a tab, in a popup view or inside a group definition. Until
 * these were unified every tool spoke only to tabs, so changing one widget in a
 * popup meant replacing the whole view with aura_write_popup — the all-or-nothing
 * trap groups had until aura_add_widget learned to append.
 */
async function locateWidget(adapter, a) {
    const layouts = await readDashboard(adapter);
    const defs = await readGroupDefs(adapter);
    const id = a.widgetId;

    if (a.defId) {
        const list = defs[a.defId];
        if (!list) {
            return { error: `Keine Gruppe mit defId "${a.defId}".\n${listDefs(defs)}` };
        }
        const index = list.findIndex((w) => w && w.id === id);
        if (index < 0) {
            const ids = list.map((w) => (w && w.id) || '?').join(', ');
            return { error: `Kein Kind mit der id "${id}" in Gruppe ${a.defId}.\nVorhanden: ${ids}` };
        }
        return { kind: 'group', layouts, defs, defId: a.defId, list, index, label: `Gruppe ${a.defId}` };
    }

    // Every host is searched, not just the first that answers: widget ids are
    // meant to be unique but are not guaranteed to be — the editor carries a
    // deduplicator for exactly the twins that copying used to produce. Picking
    // the first match would silently edit the wrong one.
    const hits = [];
    for (const tab of allTabs(layouts)) {
        const index = (tab.widgets || []).findIndex((w) => w && w.id === id);
        if (index >= 0) {
            hits.push({
                kind: 'tab',
                layouts,
                defs,
                tab,
                list: tab.widgets,
                index,
                label: `${tab.layoutName} / ${tab.sectionName} / ${tab.name}`,
            });
        }
    }
    const views = await readPopupViews(adapter);
    for (const view of views) {
        const index = (view.widgets || []).findIndex((w) => w && w.id === id);
        if (index >= 0) {
            hits.push({
                kind: 'popup',
                layouts,
                defs,
                views,
                view,
                list: view.widgets,
                index,
                label: `Popup „${view.name}“`,
            });
        }
    }
    for (const [defId, children] of Object.entries(defs)) {
        const index = (children || []).findIndex((w) => w && w.id === id);
        if (index >= 0) {
            hits.push({ kind: 'group', layouts, defs, defId, list: children, index, label: `Gruppe ${defId}` });
        }
    }

    if (!hits.length) {
        return { error: `Kein Widget mit der id "${id}" — weder in einem Tab, einem Popup noch in einer Gruppe.` };
    }
    if (hits.length > 1) {
        return {
            error:
                `Die id "${id}" gibt es mehrfach:\n${hits.map((h) => `- ${h.label}`).join('\n')}\n` +
                'Für ein Gruppen-Kind die defId mitgeben; sonst zuerst eine der Dubletten umbenennen.',
        };
    }
    return hits[0];
}

/** Write a changed widget list back to wherever it came from. */
async function writeHost(adapter, host, nextList, groupDefs) {
    if (host.kind === 'tab') {
        await writeDashboard(adapter, replaceTabWidgets(host.layouts, host.tab.id, nextList), groupDefs || null);
        return;
    }
    if (host.kind === 'popup') {
        if (groupDefs) {
            await writeGroupDefs(adapter, groupDefs);
        }
        await writePopupViews(
            adapter,
            host.views.map((v) => (v.id === host.view.id ? { ...v, widgets: nextList } : v)),
        );
        return;
    }
    await writeGroupDefs(adapter, Object.assign({}, groupDefs || {}, { [host.defId]: nextList }));
}

/**
 * Resolve a target named in `a[key]`: a tab, or a popup view of that name.
 *
 * Popups and tabs are addressed the same way on purpose — a model that was told
 * "put it in Details" should not have to know which of the two Details is.
 */
async function resolveTargetHost(adapter, layouts, a, key) {
    const needle = a[key];
    const found = findTab(layouts, { tab: needle, layout: a.layout, section: a.section });
    const views = await readPopupViews(adapter);
    const view = findPopupView(views, needle);

    // Both answer to the same name since popups became addressable the way tabs
    // are. Choosing one quietly is how a widget lands somewhere nobody looks.
    if (!found.error && !view.error) {
        return {
            error:
                `„${needle}“ gibt es als Tab (${found.tab.layoutName} / ${found.tab.sectionName}) und als Popup. ` +
                `Die Id angeben: Tab "${found.tab.id}" oder Popup "${view.view.id}".`,
        };
    }
    if (!found.error) {
        return {
            kind: 'tab',
            layouts,
            tab: found.tab,
            list: found.tab.widgets || [],
            label: `${found.tab.layoutName} / ${found.tab.sectionName} / ${found.tab.name}`,
        };
    }
    if (!view.error) {
        return {
            kind: 'popup',
            layouts,
            views,
            view: view.view,
            list: view.view.widgets || [],
            label: `Popup „${view.view.name}“`,
        };
    }
    const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
    const popupNames = views.map((v) => `- Popup ${v.name}`);
    return { error: `${found.error}\nVorhanden:\n${names.concat(popupNames).join('\n')}` };
}

/**
 * The grid a tab sits on, as validation context: how wide it is already authored
 * AND how much room the target screen actually has.
 *
 * The second half is the user's own statement of intent — the guidelines they
 * drew in the editor (lib/mcp/canvas.js). Without it the height was never
 * checked at all and a generated tab could end below the bottom edge of the
 * device it was built for.
 *
 * @param {object} adapter
 * @param {Array} layouts
 * @param {string|object} where a tab id, or { layout, section, tabCount }
 */
async function tabGridCtx(adapter, layouts, where) {
    let host = where && typeof where === 'object' ? where : {};
    if (typeof where === 'string' && where) {
        // An id from an already resolved host — or whatever the caller typed, in
        // which case a name and a slug resolve too. Anything that resolves to
        // nothing falls back to the global settings, which is the right answer
        // for "no particular tab".
        host = hostOf(layouts, where);
        if (!host.section) {
            const byName = findTab(layouts, { tab: where });
            if (!byName.error) {
                host = hostOf(layouts, byName.tab.id);
            }
        }
    }
    const canvas = await readCanvas(adapter, host);
    return {
        columns: designColumns(layouts),
        ...(canvas.enabled ? { maxCols: canvas.maxCols, maxRows: canvas.maxRows, canvas } : {}),
    };
}

/**
 * Drop group definitions nothing references any more.
 *
 * Deleting a group widget used to leave its children behind in
 * `config.group-defs`. The frontend collects them before its next save
 * (gcGroupDefs), so this is about not leaving the store in a state that only
 * looks right after someone opens the editor.
 */
async function pruneGroupDefs(adapter) {
    const [defs, layouts, views] = await Promise.all([
        readGroupDefs(adapter),
        readDashboard(adapter),
        readPopupViews(adapter),
    ]);
    const ids = Object.keys(defs);
    if (!ids.length) {
        return 0;
    }
    // Same safety net the frontend keeps: never garbage-collect against an empty
    // host set, or a half-loaded state would erase every definition.
    if (!layouts.length && !views.length) {
        return 0;
    }
    const referenced = new Set();
    for (const tab of allTabs(layouts)) {
        for (const id of collectDefIds(tab.widgets || [], defs)) {
            referenced.add(id);
        }
    }
    for (const view of views) {
        for (const id of collectDefIds(view.widgets || [], defs)) {
            referenced.add(id);
        }
    }
    const orphans = ids.filter((id) => !referenced.has(id));
    if (!orphans.length) {
        return 0;
    }
    const kept = {};
    for (const id of ids) {
        if (referenced.has(id)) {
            kept[id] = defs[id];
        }
    }
    await replaceGroupDefs(adapter, kept);
    return orphans.length;
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

/**
 * The address of a tab in the browser.
 *
 * The one thing this server cannot do is look at the result: a truncated label, a
 * squeezed dial or a list that runs over are invisible in the configuration. A
 * link is the honest substitute — the user opens it and sees in a second what no
 * amount of validation can tell them.
 *
 * @param {object} adapter ioBroker adapter instance
 * @param {object} tab a tab as allTabs returns it (carries the slugs)
 * @returns {Promise<string|undefined>} the URL, or undefined when the host is unknown
 */
async function tabUrl(adapter, tab) {
    if (!tab || !tab.slug) {
        return undefined;
    }
    try {
        const base = await resolveBaseUrl({
            port: (adapter.config && adapter.config.port) || 8095,
            https: !!(adapter.config && adapter.config.secure),
        });
        const parts = [`view/${tab.layoutSlug || ''}`];
        if (tab.sectionSlug) {
            parts.push(`s/${tab.sectionSlug}`);
        }
        parts.push(`tab/${tab.slug}`);
        return `${base}/#/${parts.join('/')}`;
    } catch {
        return undefined;
    }
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
 * One write at a time, per adapter instance.
 *
 * Every write is read-modify-write across two or three ioBroker states. Two of
 * them in flight at once both read the same dashboard and the second write wins
 * — and because each validated fine on its own base, BOTH answers said it had
 * worked. An assistant that fires two tool calls in parallel (they do) was told
 * it had added two widgets and had added one.
 *
 * Reads stay unqueued: they cannot lose anything, and a long listing should not
 * hold up an edit.
 */
const writeQueues = new Map();

function serializeWrites(adapter, run) {
    const key = (adapter && adapter.namespace) || 'aura';
    const previous = writeQueues.get(key) || Promise.resolve();
    // Run after the previous one whether it succeeded or failed — a refused write
    // must not block the queue.
    const result = previous.then(run, run);
    writeQueues.set(
        key,
        result.then(
            () => {},
            () => {},
        ),
    );
    return result;
}

/** Does this tool change anything? Read-only ones skip the queue. */
function isWriteTool(name) {
    const tool = TOOLS.find((t) => t.name === name);
    return !!tool && tool.level !== 'read';
}

/**
 * @param {string} name tool name
 * @param {object} args tool arguments
 * @param {object} ctx
 * @param {object} ctx.adapter ioBroker adapter instance
 * @param {object} ctx.schema the generated widget schema
 */
async function callTool(name, args, ctx) {
    return isWriteTool(name) ? serializeWrites(ctx.adapter, () => runTool(name, args, ctx)) : runTool(name, args, ctx);
}

async function runTool(name, args, ctx) {
    const { adapter, schema } = ctx;
    const a = args || {};

    switch (name) {
        case 'aura_widget_types':
            return text(
                `AURA ${(schema.$meta && schema.$meta.auraVersion) || ''} — ` +
                    `${Object.keys(schema.widgets).length} Widget-Typen\n\n${renderTypeIndex(schema, a.group)}`,
            );

        case 'aura_widget_schema': {
            const types = Array.isArray(a.types) ? a.types : [];
            if (!types.length) {
                return fail('Keine Typen angegeben. aura_widget_types listet die verfügbaren.');
            }
            const detail = renderTypeDetail(types, schema, a.brief, {
                sharedTypes: a.sharedTypes,
                only: a.options,
            });
            const shape = a.shape === false ? '' : `# Aufbau eines Widgets\n${renderWidgetShape(schema, a.brief)}\n\n`;
            return text(`${shape}${detail}`);
        }

        case 'aura_types': {
            const names = Array.isArray(a.names) ? a.names.filter((n) => typeof n === 'string') : [];
            if (!names.length) {
                const all = Object.keys(schema.types).sort().join(', ');
                return fail(`Keine Namen angegeben. Vorhanden: ${all}.`);
            }
            return text(renderNamedTypes(names, schema, a.brief));
        }

        case 'aura_dashboard': {
            const [layouts, frontend, logging, themeChoice] = await Promise.all([
                readDashboard(adapter),
                readFrontendConfig(adapter),
                // Nothing anywhere named the available history adapters, so an
                // instance for a chart had to be guessed — and a query against one
                // that does not exist hangs instead of failing.
                readLoggingInstances(adapter),
                // Colours were being invented as hex values because nothing ever
                // named the tokens. The palette belongs where the model starts.
                readThemeChoice(adapter),
            ]);
            if (!layouts.length) {
                return text(
                    `${adapter.namespace} hat noch keine Layouts konfiguriert. Mit aura_create_layout anfangen.`,
                );
            }
            const cols = designColumns(layouts);
            // Grid and guidelines are overridable per layout and per section, so
            // the budget is stated once for the first one and only repeated where
            // a section actually has a different amount of room.
            const canvasOf = (layout, section) =>
                designCanvas({ frontend, layout, section, tabCount: ((section && section.tabs) || []).length });
            const firstSection = (layouts[0] && (layouts[0].sections || [])[0]) || null;
            const baseCanvas = canvasOf(layouts[0], firstSection);
            const grid = baseCanvas.grid;
            const rows = [];
            for (const layout of layouts) {
                for (const section of layout.sections || []) {
                    const secMarks = nodeMarkers(section);
                    const cv = canvasOf(layout, section);
                    const differs =
                        cv.enabled &&
                        baseCanvas.enabled &&
                        (cv.maxCols !== baseCanvas.maxCols || cv.maxRows !== baseCanvas.maxRows);
                    rows.push(
                        `- ${layout.name} / ${section.name}` +
                            (secMarks.length ? ` [Bereichsmenü: ${secMarks.join(', ')}]` : '') +
                            (differs ? ` [Platz hier: ${cv.maxCols} Spalten × ${cv.maxRows} Zeilen]` : ''),
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
                    renderCanvas(baseCanvas),
                    `Die vorhandenen Widgets nutzen ${cols} Spalten — daran halten, damit das Dashboard überall ` +
                        'gleich breit bleibt. Das Raster wächst mit, breiter ist also erlaubt und wird nur angemerkt.',
                    renderPalette(ctx.themeTokens, themeChoice),
                    logging === null
                        ? ''
                        : logging.length
                          ? `History-Adapter für Diagramme: ${logging.join(', ')}. Ein Diagramm braucht einen ` +
                            'Datenpunkt, der bei einer dieser Instanzen aufgezeichnet wird (aura_validate sagt es).'
                          : 'Es ist KEIN History-Adapter installiert (history/influxdb/sql) — Diagramme über die ' +
                            'History bleiben leer, bis einer eingerichtet ist.',
                    '',
                    '# Tabs',
                    ...rows,
                ].join('\n'),
            );
        }

        case 'aura_recipes': {
            if (!a.id) {
                return text(renderRecipeIndex());
            }
            const recipe = findRecipe(a.id);
            if (!recipe) {
                return fail(`Kein Rezept "${a.id}". Vorhanden: ${RECIPES.map((r) => r.id).join(', ')}.`);
            }
            return text(renderRecipe(recipe));
        }

        case 'aura_tab': {
            const layouts = await readDashboard(adapter);
            const found = findTab(layouts, a);
            if (found.error) {
                const names = allTabs(layouts).map((t) => `- ${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${found.error}\nVorhanden:\n${names.join('\n')}\nPopups liest aura_popup.`);
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

        case 'aura_review': {
            const mode = ['style', 'health', 'both'].includes(a.mode) ? a.mode : a.tab ? 'both' : 'health';
            // Named explicitly, defaulted from what was asked for: a tab means that
            // tab. The health half used to widen to the whole dashboard behind the
            // caller's back — useful, but nobody asked for the shutter groups of
            // three other tabs, and the count in the answer then described something
            // else entirely.
            const scopeArg = ['tab', 'all'].includes(a.scope) ? a.scope : a.tab ? 'tab' : 'all';
            if (scopeArg === 'tab' && !a.tab) {
                return fail('scope "tab" braucht "tab". Ohne Tab ist der Umfang das ganze Dashboard (scope "all").');
            }
            const layouts = await readDashboard(adapter);

            // Without a tab the style half would be a wall of the same four remarks
            // per tab, so the whole-dashboard sweep is the health check — the one
            // that gets more useful the bigger the dashboard.
            let places;
            let scope;
            let styleWidgets = null;
            let tabDefIds = null;
            if (a.tab) {
                const found = await resolveTargetHost(adapter, layouts, a, 'tab');
                if (found.error) {
                    return fail(found.error);
                }
                styleWidgets = found.list;
                if (scopeArg === 'tab') {
                    places = [{ where: found.label, widgets: found.list }];
                    scope = `${found.label} (nur dieser Tab)`;
                    tabDefIds = found.list;
                }
            }
            if (!places) {
                const views = await readPopupViews(adapter);
                places = [
                    ...allTabs(layouts).map((t) => ({
                        where: `${t.layoutName} / ${t.sectionName} / ${t.name}`,
                        widgets: t.widgets || [],
                    })),
                    ...views.map((v) => ({ where: `Popup „${v.name}“`, widgets: v.widgets || [] })),
                ];
                scope = `${adapter.namespace} — alle Tabs und Popups`;
            }

            const parts = [];

            // The objects behind the datapoints in scope, read once for both halves.
            // The style half needs them too: telling a meter reading from a power
            // reading is a question about unit and role, and going by the datapoint
            // NAME reported a momentary 240 W as a meter standing at 240.
            const styleRefs = new Set();
            for (const place of places) {
                for (const widget of place.widgets || []) {
                    for (const ref of collectDatapointRefs(widget, schema, { loose: true })) {
                        styleRefs.add(ref.id);
                    }
                }
            }
            const styleMeta = styleRefs.size ? await readStateMeta(adapter, styleRefs) : new Map();

            if (mode === 'style' || mode === 'both') {
                if (!styleWidgets) {
                    // Per tab, so a finding still names where it belongs.
                    for (const place of places) {
                        const findings = reviewWidgets(place.widgets, styleMeta);
                        if (findings.length) {
                            parts.push(renderReview(findings, place.where));
                        }
                    }
                    if (!parts.length) {
                        parts.push(renderReview([], scope));
                    }
                } else {
                    parts.push(renderReview(reviewWidgets(styleWidgets, styleMeta), scope));
                }
            }

            if (mode === 'health' || mode === 'both') {
                // The children of a group live in their own store and are just as
                // invisible to every other check — an option a group child stopped
                // reading is exactly as silent as one in a tab.
                const defs = await readGroupDefs(adapter);
                // Only the groups in scope. collectDefIds follows groups nested in
                // groups, so a tab brings its own children and nothing else — the
                // whole reason a tab review reported ten places instead of one.
                const inScope = tabDefIds ? collectDefIds(tabDefIds, defs) : new Set(Object.keys(defs));
                const groupPlaces = [...inScope].map((defId) => ({
                    where: `Gruppe ${defId}`,
                    widgets: Array.isArray(defs[defId]) ? defs[defId] : defs[defId] && defs[defId].widgets,
                }));
                const all = [...places, ...groupPlaces.filter((p) => Array.isArray(p.widgets))];

                const refs = new Set();
                for (const place of all) {
                    for (const widget of place.widgets || []) {
                        for (const ref of collectDatapointRefs(widget, schema, { loose: true })) {
                            refs.add(ref.id);
                        }
                    }
                }
                // Only what the style pass has not already read: the group children
                // add datapoints, the tabs do not.
                const missing = [...refs].filter((id) => !styleMeta.has(id));
                const [knownDatapoints, stateValues, extraMeta, loggingInstances] = await Promise.all([
                    listStateIds(adapter),
                    readStateValues(adapter, refs),
                    // The objects too, for the history check and the fit check — that
                    // is what answers "why is this chart empty".
                    missing.length ? readStateMeta(adapter, missing) : new Map(),
                    readLoggingInstances(adapter),
                ]);
                const datapointMeta = new Map([...styleMeta, ...extraMeta]);
                // Orphans are a property of the whole dashboard: within one tab every
                // other tab's definitions would look unreferenced. Reported only for
                // a full sweep.
                let orphanDefIds;
                if (scopeArg === 'all' && layouts.length) {
                    const referencedDefs = new Set();
                    for (const place of places) {
                        for (const id of collectDefIds(place.widgets || [], defs)) {
                            referencedDefs.add(id);
                        }
                    }
                    orphanDefIds = Object.keys(defs).filter((id) => !referencedDefs.has(id));
                }

                parts.push(
                    renderAudit(
                        auditDashboard({
                            places: all,
                            schema,
                            knownDatapoints,
                            stateValues,
                            datapointMeta,
                            loggingInstances,
                            defs,
                            orphanDefIds,
                            staleDays: Number.isFinite(a.staleDays) ? a.staleDays : undefined,
                        }),
                        scope,
                    ),
                );
            }

            return text(parts.join('\n\n---\n\n'));
        }

        case 'aura_theme': {
            const choice = await readThemeChoice(adapter);
            return text(renderTheme(ctx.themeTokens, choice, { elements: a.elements !== false }));
        }

        case 'aura_measure': {
            let widgets;
            let where;
            let url;
            // The target screen belongs to the tab, so it is only known once the
            // tab is; a payload measured on its own gets the global settings.
            let canvas = await readCanvas(adapter, {});
            if (a.json) {
                const parsed = parseJson(a.json, 'Die Eingabe');
                if (parsed.error) {
                    return fail(parsed.error);
                }
                const value = parsed.value;
                widgets = Array.isArray(value?.tab?.widgets)
                    ? value.tab.widgets
                    : Array.isArray(value?.widgets)
                      ? value.widgets
                      : Array.isArray(value)
                        ? value
                        : [value];
            } else if (a.tab) {
                const layouts = await readDashboard(adapter);
                const found = await resolveTargetHost(adapter, layouts, a, 'tab');
                if (found.error) {
                    return fail(found.error);
                }
                widgets = found.list;
                where = found.label;
                url = found.kind === 'tab' ? await tabUrl(adapter, found.tab) : undefined;
                if (found.kind === 'tab') {
                    canvas = await readCanvas(adapter, hostOf(layouts, found.tab.id));
                } else {
                    // A popup floats over the dashboard in its own frame — the
                    // screen guidelines say nothing about it.
                    canvas = { enabled: false, grid: canvas.grid };
                }
            } else {
                return fail('Entweder "tab" oder "json" angeben.');
            }
            if (!widgets.length) {
                return text(`${where || 'Die Eingabe'} enthält keine Widgets.`);
            }
            const grid = canvas.grid;
            const rows = widgets.map((w) => measureWidget(w, { metrics: ctx.metrics, grid, items: a.items }));
            return text(renderMeasure(rows, { grid, where, url, metrics: ctx.metrics, canvas }));
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
                // What the datapoints ARE, not just that they exist: a switch on a
                // read-only state and a slider on a state without min/max pass every
                // other check and then do nothing on the finished dashboard. Only the
                // ids the payload actually names are looked up.
                const widgets = Array.isArray(parsed.value?.tab?.widgets)
                    ? parsed.value.tab.widgets
                    : Array.isArray(parsed.value?.widgets)
                      ? parsed.value.widgets
                      : [parsed.value];
                const refs = new Set();
                for (const widget of widgets) {
                    // loose: the rows of a list carry their datapoint in `id`.
                    for (const ref of collectDatapointRefs(widget, schema, { loose: true })) {
                        refs.add(ref.id);
                    }
                }
                if (refs.size) {
                    const [meta, logging] = await Promise.all([
                        readStateMeta(adapter, refs),
                        readLoggingInstances(adapter),
                    ]);
                    vctx.datapointMeta = meta;
                    vctx.loggingInstances = logging;
                    note += ` ${meta.size} Objekt(e) gelesen.`;
                }
            }
            const layouts = await readDashboard(adapter);
            if (layouts.length) {
                // Nothing is written here, so no tab is named: the budget comes
                // from the tab the caller mentions, else from the global settings.
                Object.assign(vctx, await tabGridCtx(adapter, layouts, a.tab || {}));
            }
            const { errors, warnings } = validateAny(parsed.value, schema, vctx);
            const body = formatFindings(errors, warnings) || 'Keine Beanstandungen.';
            const suffix =
                `\n\n${note}${vctx.columns ? ` Vorhandene Breite: ${vctx.columns} Spalten.` : ''}` +
                (vctx.canvas ? ` ${renderCanvas(vctx.canvas)}` : '');
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
            const found = await resolveTargetHost(adapter, layouts, a, 'tab');
            if (found.error) {
                return fail(found.error);
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
                    w.gridPos.y = nextFreeRow(found.list);
                }
                widgets = found.list.concat([w]);
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
            // show up against the widgets that are already there. Through
            // validateWidgets, so the objects behind the datapoints are read here
            // too — an unlogged chart series is otherwise written without a word.
            const { errors, warnings } = await validateWidgets(adapter, schema, widgets, found.label, {
                // A popup has its own grid, so the dashboard width does not apply.
                ...(found.kind === 'tab' ? await tabGridCtx(adapter, layouts, found.tab && found.tab.id) : {}),
                ...(strictIndices ? { strictIndices } : {}),
            });
            if (errors.length) {
                return fail(
                    `Nicht geschrieben — ${found.kind === 'popup' ? 'das Popup' : 'der Tab'} wäre fehlerhaft.` +
                        `\n\n${formatFindings(errors, warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            await writeHost(adapter, found, widgets, groupDefs);
            const dropped = name === 'aura_write_tab' ? await pruneGroupDefs(adapter) : 0;

            const lines = [
                `${found.label}: ${widgets.length} Widget(s) geschrieben.` +
                    (dropped ? ` ${dropped} verwaiste Gruppen-Definition(en) entfernt.` : ''),
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

            const check = await validateWidgets(
                adapter,
                schema,
                list.widgets,
                a.name,
                // The tab does not exist yet, so its host is named directly — and it
                // is one tab more than the section has now, which can bring the tab
                // bar in and cost a row.
                await tabGridCtx(adapter, layouts, {
                    layout: where.layout,
                    section: where.section,
                    tabCount: ((where.section && where.section.tabs) || []).length + 1,
                }),
            );
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
            const source = await locateWidget(adapter, { widgetId: a.widgetId });
            if (source.error) {
                return fail(source.error);
            }
            const target = await resolveTargetHost(adapter, layouts, a, 'toTab');
            if (target.error) {
                return fail(target.error);
            }
            const move = a.mode === 'move';
            if (target.label === source.label) {
                return fail(`Das Widget liegt bereits in „${target.label}“.`);
            }

            const defs = await readGroupDefs(adapter);
            const original = source.list[source.index];
            const newDefs = {};
            const placed = move
                ? { ...original }
                : cloneWidget(original, defs, newDefs, Math.random().toString(36).slice(2, 6));
            placed.gridPos = { ...placed.gridPos, x: 0, y: nextFreeRow(target.list) };

            const nextTarget = target.list.concat([placed]);
            const check = await validateWidgets(adapter, schema, nextTarget, target.label, {
                ...(target.kind === 'tab' ? await tabGridCtx(adapter, layouts, target.tab && target.tab.id) : {}),
                strictIndices: [nextTarget.length - 1],
            });
            if (check.errors.length) {
                return fail(
                    `Nicht ${move ? 'verschoben' : 'kopiert'}.\n\n${formatFindings(check.errors, check.warnings)}`,
                );
            }

            const backup = await writeBackup(adapter);
            if (move) {
                // Out of the source first: a move keeps the id, so writing the target
                // first would leave the same id in two places and the removal could
                // no longer tell them apart. Re-resolve in between, because the two
                // hosts may live in the same state.
                await writeHost(
                    adapter,
                    source,
                    source.list.filter((w) => w && w.id !== a.widgetId),
                );
                const fresh = await readDashboard(adapter);
                const again = await resolveTargetHost(adapter, fresh, a, 'toTab');
                if (again.error) {
                    return fail(again.error);
                }
                await writeHost(adapter, again, again.list.concat([placed]));
            } else {
                await writeHost(adapter, target, nextTarget, Object.keys(newDefs).length ? newDefs : null);
            }
            return text(
                [
                    `Widget "${a.widgetId}" ${move ? 'verschoben' : `kopiert als "${placed.id}"`} nach ` +
                        `${target.label}.` +
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
            let target;
            if (a.defId || a.widgetId) {
                // Into a group: same addressing aura_add_widget uses.
                const defs = await readGroupDefs(adapter);
                const which = await resolveDefId(adapter, a, defs);
                if (which.error) {
                    return fail(which.error);
                }
                target = {
                    kind: 'group',
                    layouts,
                    defs,
                    defId: which.defId,
                    list: defs[which.defId] || [],
                    label: `Gruppe ${which.defId}`,
                };
            } else {
                target = await resolveTargetHost(adapter, layouts, a, 'tab');
                if (target.error) {
                    return fail(target.error);
                }
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
            widget.gridPos = { ...widget.gridPos, x: 0, y: nextFreeRow(target.list) };

            const nextWidgets = target.list.concat([widget]);
            const check = await validateWidgets(adapter, schema, nextWidgets, target.label, {
                ...(target.kind === 'tab' ? await tabGridCtx(adapter, layouts, target.tab && target.tab.id) : {}),
                strictIndices: [nextWidgets.length - 1],
            });
            if (check.errors.length) {
                return fail(`Nicht eingefügt.\n\n${formatFindings(check.errors, check.warnings)}`);
            }

            const backup = await writeBackup(adapter);
            await writeHost(adapter, target, nextWidgets, Object.keys(newDefs).length ? newDefs : null);
            return text(
                [
                    `Vorlage „${found.preset.name}“ als "${widget.id}" in ` + `${target.label} eingefügt.`,
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
            const found = await locateWidget(adapter, a);
            if (found.error) {
                return fail(found.error);
            }
            const defs = found.defs;
            const widget = found.list[found.index];
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
                const host = await locateWidget(adapter, { widgetId: a.target, defId: a.defId });
                if (host.error) {
                    return fail(host.error);
                }
                const backup = await writeBackup(adapter);
                await writeHost(
                    adapter,
                    host,
                    host.list.filter((w) => w && w.id !== a.target),
                );
                // A deleted group widget leaves its children behind otherwise.
                const dropped = await pruneGroupDefs(adapter);
                return text(
                    [
                        `Widget "${a.target}" aus ${host.label} gelöscht.` +
                            (dropped ? ` ${dropped} verwaiste Gruppen-Definition(en) mit entfernt.` : ''),
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
            const dropped = await pruneGroupDefs(adapter);
            return text(
                [
                    `${KIND_LABEL[a.kind]} „${located.name}“ gelöscht — mit ${located.contains}.` +
                        (dropped ? ` ${dropped} verwaiste Gruppen-Definition(en) mit entfernt.` : ''),
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
            if (a.create && views.some((v) => (v.name || '').toLowerCase() === String(a.view || '').toLowerCase())) {
                // Two views of one name make every later lookup by name ambiguous,
                // and the first one found would silently win from then on.
                return fail(
                    `Es gibt schon eine Ansicht „${a.view}“. Einen anderen Namen wählen, oder ohne create:true ` +
                        'die vorhandene überschreiben.',
                );
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

            const host = await locateWidget(adapter, a);
            if (host.error) {
                return fail(host.error);
            }
            const list = host.list;
            const index = host.index;
            const before = list[index];

            // replace:true means "this object, whole". Demanding the id back was a
            // trap: a patch that left it out got "Die id darf sich nicht aendern
            // (w-1 -> undefined)" and no hint that it had to be carried along.
            const after = a.replace
                ? Object.assign({ id: before.id }, parsed.value)
                : mergeWidget(before, parsed.value);
            // Renaming it silently would orphan every reference to it.
            if (after.id !== before.id) {
                return fail(`Die id darf sich nicht ändern ("${before.id}" → "${after.id}").`);
            }
            const nextList = list.map((w, i) => (i === index ? after : w));

            // Only the changed widget gets the full rules; its neighbours are not
            // the caller's doing. Overlaps still count across the whole list.
            const { errors, warnings } = await validateWidgets(adapter, schema, nextList, host.label, {
                strictIndices: [index],
                // Tabs share the dashboard grid; groups and popups have their own.
                ...(host.kind === 'tab' ? await tabGridCtx(adapter, host.layouts, host.tab && host.tab.id) : {}),
            });
            if (errors.length) {
                return fail(`Nicht geändert.\n\n${formatFindings(errors, warnings)}`);
            }

            const backup = await writeBackup(adapter);
            await writeHost(adapter, host, nextList);
            const changed = Object.keys(parsed.value).join(', ');
            return text(
                [
                    `Widget "${a.widgetId}" in ${host.label} geändert (${a.replace ? 'ersetzt' : `Felder: ${changed}`}).`,
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
                // Nur fuers Verschieben sinnlos — ein Duplikat im selben Bereich ist
                // der haeufigste Kopierwunsch ueberhaupt.
                if (move && dest.section.id === source.tab.sectionId) {
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

            if (a.kind === 'popup') {
                if (move) {
                    return fail('Eine Popup-Ansicht hat kein übergeordnetes Element — verschieben ergibt hier nichts.');
                }
                const views = await readPopupViews(adapter);
                const src = findPopupView(views, a.target);
                if (src.error) {
                    return fail(`${src.error}\n${listPopups(views)}`);
                }
                const wanted = (a.name || `${src.view.name} Kopie`).trim();
                if (views.some((v) => (v.name || '').toLowerCase() === wanted.toLowerCase())) {
                    return fail(`Es gibt schon eine Ansicht „${wanted}“ — mit "name" einen anderen wählen.`);
                }
                const copy = {
                    id: `view-${Date.now()}-${suffix}`,
                    name: wanted,
                    widgets: cloneWidgets(src.view.widgets || [], defs, newDefs, suffix),
                    userEdited: true,
                };
                const backup = await writeBackup(adapter);
                if (Object.keys(newDefs).length) {
                    await writeGroupDefs(adapter, newDefs);
                }
                await writePopupViews(adapter, views.concat([copy]));
                return text(
                    [
                        `Popup „${src.view.name}“ kopiert als „${copy.name}“ (${copy.widgets.length} Widget(s)).` +
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

            return fail(unknownKind(a.kind, ['tab', 'section', 'layout', 'popup']));
        }

        default:
            return fail(`Unbekanntes Werkzeug: ${name}`);
    }
}

module.exports = { INSTRUCTIONS, LEVELS, TOOLS, callTool, levelIndex, toolsFor };
