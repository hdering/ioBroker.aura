#!/usr/bin/env node
/**
 * Tests the MCP endpoint the adapter serves at POST /mcp.
 *
 *   npm run test:mcp
 *
 * Two halves:
 *   1. The validation rules and config helpers, against the real widget schema.
 *      These are the reason the server exists — a misnamed option is otherwise
 *      ignored silently and nobody finds out.
 *   2. The endpoint itself, driven by the REAL @modelcontextprotocol client over
 *      HTTP. Hand-written JSON-RPC that is only ever tested against itself proves
 *      nothing; the SDK stays a devDependency purely to be the other side here.
 *
 * ioBroker is replaced by a small adapter double, so writes are verified without
 * touching an installation.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { validateWidget, validateTab, validateAny, allowedOptions } = require('../../lib/mcp/validate.js');
const {
    designColumns,
    allTabs,
    findTab,
    findWidget,
    mergeWidget,
    NODE_FIELDS,
    reorderNodes,
    updateNode,
    collectDefIds,
    replaceTabWidgets,
} = require('../../lib/mcp/auraConfig.js');
const { handleMcpRequest } = require('../../lib/mcp/httpEndpoint.js');
const { LEVELS, levelIndex, toolsFor } = require('../../lib/mcp/tools.js');
const { RECIPES, findRecipe, renderRecipe, renderRecipeIndex } = require('../../lib/mcp/recipes.js');
const { reviewWidgets, renderReview, TILE_ROW_LIMIT, CONTACT_LIMIT } = require('../../lib/mcp/review.js');
const {
    TOKEN_PLACEHOLDER,
    baseUrl,
    clientConfig,
    hostAddresses,
    maskClientConfig,
    outboundAddress,
    resolveBaseUrl,
} = require('../../lib/mcp/clientConfig.js');

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`  ✓ ${label}`);
};
const hasError = (res, re) => res.errors.some((e) => re.test(e));
const hasWarning = (res, re) => res.warnings.some((w) => re.test(w));

const OK_SWITCH = {
    id: 'w-1',
    type: 'switch',
    title: 'Deckenlicht',
    datapoint: 'hm-rpc.0.LEQ1.1.STATE',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { showTitle: true, controlMode: 'toggle' },
};

console.log('\nmcp — Regeln');

check('a correct widget passes clean', () => {
    const res = validateWidget(OK_SWITCH, schema);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.warnings, []);
});

check('an unknown widget type is named, with a suggestion', () => {
    const res = validateWidget({ ...OK_SWITCH, type: 'switsch' }, schema);
    assert.ok(hasError(res, /unbekannter Typ "switsch"/));
    assert.ok(hasError(res, /meintest du "switch"/));
});

check('an option the widget never reads is an error, not silence', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitel: true } }, schema);
    assert.ok(hasError(res, /liest die Option "showTitel" nicht/));
    assert.ok(hasError(res, /meintest du "showTitle"/));
});

check('an out-of-set enum value lists what is allowed', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { controlMode: 'switch' } }, schema);
    assert.ok(hasError(res, /Option "controlMode".*nicht erlaubt/));
    assert.ok(hasError(res, /toggle/));
});

check('a wrong value type is caught', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitle: 'ja' } }, schema);
    assert.ok(hasError(res, /Option "showTitle": string übergeben, erwartet boolean/));
});

check('an invalid layout lists the valid ones', () => {
    const res = validateWidget({ ...OK_SWITCH, layout: 'dial' }, schema);
    assert.ok(hasError(res, /layout "dial" gibt es für switch nicht/));
    assert.deepEqual(validateWidget({ ...OK_SWITCH, layout: 'compact' }, schema).errors, []);
});

check('datapoint expectations follow the widget type', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, datapoint: '' }, schema), /braucht einen Datenpunkt/));
    const clock = { id: 'c', type: 'clock', title: 'Uhr', datapoint: 'x.0.y', gridPos: { x: 0, y: 0, w: 6, h: 4 } };
    assert.ok(hasWarning(validateWidget(clock, schema), /wertet "datapoint" nicht aus/));
});

check('datapoint ids and datapoint-valued options are checked against the tree', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    assert.deepEqual(validateWidget(OK_SWITCH, schema, { knownDatapoints: known }).errors, []);
    assert.ok(
        hasError(
            validateWidget({ ...OK_SWITCH, datapoint: 'hm-rpc.0.NOPE' }, schema, { knownDatapoints: known }),
            /nicht/,
        ),
    );
    const res = validateWidget({ ...OK_SWITCH, options: { statusDp: 'erfunden.0.dp' } }, schema, {
        knownDatapoints: known,
    });
    assert.ok(hasError(res, /Option "statusDp": Datenpunkt "erfunden\.0\.dp" gibt es nicht/));
});

check('gridPos must be whole and positive', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 0, w: 8.5, h: 4 } }, schema), /ganze Zahl/));
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: -1, y: 0, w: 8, h: 4 } }, schema), /negativ/));
});

check('exceeding the column count warns instead of refusing', () => {
    // The count is inferred from the widest widget present, and the frontend
    // widens the grid to fit. Refusing would block building up a thin dashboard:
    // move its one wide widget and the "limit" shrinks with it.
    const res = validateWidget({ ...OK_SWITCH, gridPos: { x: 40, y: 0, w: 12, h: 4 } }, schema, { columns: 48 });
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /52 ist breiter als das bisher Vorhandene \(48 Spalten\)/));
});

check('an option written one level too high is an error, not a shrug', () => {
    // It would be written, ignored by AURA, and reported to the user as done.
    const res = validateWidget({ ...OK_SWITCH, conditions: [] }, schema);
    assert.ok(hasError(res, /"conditions" gehört unter "options"/));
    const own = validateWidget({ ...OK_SWITCH, controlMode: 'toggle' }, schema);
    assert.ok(hasError(own, /"controlMode" gehört unter "options"/));
    // Something nobody knows stays a warning with a suggestion.
    assert.ok(hasWarning(validateWidget({ ...OK_SWITCH, mobilOrder: 2 }, schema), /meintest du "mobileOrder"/));
});

check('a group without defId warns about its children living elsewhere', () => {
    const g = { id: 'g1', type: 'group', title: 'WZ', datapoint: '', gridPos: { x: 0, y: 0, w: 12, h: 8 } };
    assert.ok(hasWarning(validateWidget(g, schema), /aura-group-defs/));
});

check('overlaps are reported by id, adjacency is not', () => {
    const tab = (widgets) => ({ _type: 'aura-tab', tab: { name: 'T', widgets } });
    const over = tab([
        { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
        { ...OK_SWITCH, id: 'b', gridPos: { x: 4, y: 2, w: 8, h: 4 } },
    ]);
    assert.ok(hasError(validateTab(over, schema), /"a".*"b".*überlappen/));
    const side = tab([
        { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
        { ...OK_SWITCH, id: 'b', gridPos: { x: 8, y: 0, w: 8, h: 4 } },
    ]);
    assert.deepEqual(validateTab(side, schema).errors, []);
});

check('duplicate ids and a wrong envelope are caught', () => {
    const dup = {
        _type: 'aura-tab',
        tab: { name: 'T', widgets: [OK_SWITCH, { ...OK_SWITCH, gridPos: { x: 0, y: 8, w: 8, h: 4 } }] },
    };
    assert.ok(hasError(validateTab(dup, schema), /mehrfach/));
    assert.ok(hasError(validateTab({ _type: 'aura-widget', tab: { name: 'x', widgets: [] } }, schema), /_type/));
});

check('validateAny tells a widget from a tab', () => {
    assert.deepEqual(validateAny(OK_SWITCH, schema).errors, []);
    assert.ok(hasError(validateAny({ _type: 'aura-tab', tab: { name: 'x' } }, schema), /widgets/));
});

check('allowedOptions merges own and shared keys', () => {
    const opts = allowedOptions('switch', schema);
    assert.ok('onValue' in opts && 'showTitle' in opts);
});

// ── Nested validation ────────────────────────────────────────────────────────
// Reported from the field: wrong operators and effect names passed silently,
// which is exactly what the validator is for — AURA ignores what it does not
// understand, so nothing else would ever say a word.

const withConditions = (conditions) => ({ ...OK_SWITCH, options: { conditions } });

check('a misspelled operator inside a clause is caught', () => {
    const res = validateWidget(
        withConditions([
            {
                id: 'c',
                logic: 'AND',
                clauses: [{ datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: 'gleich', value: '1' }],
                style: {},
            },
        ]),
        schema,
    );
    assert.ok(hasError(res, /clauses\[0\]\.operator: "gleich" ist nicht erlaubt/));
    assert.ok(hasError(res, /==/), 'the allowed operators must be listed');
});

check('an unknown effect name is caught', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [], style: {}, effect: 'flimmern' }]),
        schema,
    );
    assert.ok(hasError(res, /effect: "flimmern" ist nicht erlaubt/));
    assert.ok(hasError(res, /none, pulse, blink, border/));
});

check('a stray field inside a condition is caught, with a suggestion', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [], style: {}, hideWidgt: true }]),
        schema,
    );
    assert.ok(hasError(res, /"hideWidgt" gibt es hier nicht/));
    assert.ok(hasError(res, /meintest du "hideWidget"/));
});

check('a wrong value for a nested union is caught', () => {
    const res = validateWidget(withConditions([{ id: 'c', logic: 'XOR', clauses: [], style: {} }]), schema);
    assert.ok(hasError(res, /logic: "XOR" ist nicht erlaubt/));
});

check('a missing required field inside a nested object is caught', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [{ operator: '==', value: '1' }], style: {} }]),
        schema,
    );
    assert.ok(hasError(res, /clauses\[0\]: "datapoint" fehlt/));
});

check('a correct condition passes all the way down', () => {
    const res = validateWidget(
        withConditions([
            {
                id: 'c',
                logic: 'OR',
                clauses: [{ datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: '>', value: '5', valueType: 'static' }],
                style: { accent: '#f00' },
                effect: 'pulse',
                hideWidget: true,
                visibilityMode: 'showOnMatch',
            },
        ]),
        schema,
    );
    assert.deepEqual(res.errors, []);
});

check('badges are checked the same way', () => {
    const bad = validateWidget({ ...OK_SWITCH, options: { badges: [{ id: 'b', size: 'riesig' }] } }, schema);
    assert.ok(hasError(bad, /size/), `expected a size complaint, got: ${bad.errors.join(' | ')}`);
});

check('an unresolved type is not used to reject valid configuration', () => {
    // Types the generator could not resolve carry no `fields`; treating that as
    // "no key is allowed" would reject perfectly good widgets.
    const unresolved = Object.entries(schema.types).filter(([, t]) => !t.fields && !t.enum && !t.tuple);
    for (const [name, t] of unresolved) {
        assert.ok(!t.fields, `${name} unexpectedly has fields`);
    }
    // A tuple-typed value on a widget that has the option: resolved, so checked.
    const dimmer = { ...OK_SWITCH, type: 'dimmer', options: { colorThresholds: [[20, '#f00']] } };
    assert.deepEqual(validateWidget(dimmer, schema).errors, []);
    // And an object type the generator could not resolve (Partial<Record<…>>):
    // its keys are unknowable here, so none of them may be rejected.
    const list = { ...OK_SWITCH, type: 'list', options: { statIcons: { sum: 'Sigma', avg: 'Divide' } } };
    assert.deepEqual(validateWidget(list, schema).errors, []);
});

// ── Type resolution ──────────────────────────────────────────────────────────

check('every type the schema references is also defined', () => {
    const refs = new Set();
    const walk = (o) => {
        if (!o || typeof o !== 'object') {
            return;
        }
        if (o.ref) {
            refs.add(o.ref);
        }
        Object.values(o).forEach(walk);
    };
    walk(schema);
    const missing = [...refs].filter((r) => !schema.types[r]);
    assert.deepEqual(missing, [], 'referenced but undefined — a consumer cannot resolve these');
});

check('the condition types are fully described, valueType included', () => {
    // Reported as missing: they were left as bare names because the resolver
    // stopped one level too early.
    for (const name of ['ConditionClause', 'ConditionStyle', 'MessageDraft', 'BadgeDef', 'BadgeSize', 'ClickAction']) {
        assert.ok(schema.types[name], `${name} must be defined`);
    }
    assert.ok(schema.types.ConditionClause.fields.valueType, 'valueType belongs to ConditionClause');
    assert.deepEqual(schema.types.ConditionClause.fields.valueType.enum, ['static', 'datapoint']);
    // BadgeSize is a mixed union: three presets or a pixel number.
    assert.deepEqual(schema.types.BadgeSize.enum, ['sm', 'md', 'lg']);
    assert.deepEqual(schema.types.BadgeSize.type, ['string', 'number']);
});

check('WidgetCondition carries no "set" field — that type is never persisted', () => {
    // ConditionSet is the derived, in-memory override WidgetFrame hands to a
    // widget; stripRenderOverrides() keeps it out of the stored config on
    // purpose, so advertising it would invite writing something that is thrown
    // away on the next save.
    assert.ok(!schema.types.WidgetCondition.fields.set, 'set must not be part of the stored shape');
});

// ── Config helpers ───────────────────────────────────────────────────────────

const LAYOUTS = [
    {
        id: 'l1',
        name: 'Wohnzimmer',
        slug: 'wohnzimmer',
        sections: [
            {
                id: 's1',
                name: 'Start',
                slug: 'start',
                tabs: [
                    { id: 't1', name: 'Licht', slug: 'licht', widgets: [{ gridPos: { x: 0, y: 0, w: 30, h: 4 } }] },
                    { id: 't2', name: 'Klima', slug: 'klima', widgets: [{ gridPos: { x: 10, y: 0, w: 34, h: 4 } }] },
                ],
            },
        ],
    },
    {
        id: 'l2',
        name: 'Tablet',
        slug: 'tablet',
        sections: [
            { id: 's2', name: 'Haupt', slug: 'haupt', tabs: [{ id: 't3', name: 'Licht', slug: 'licht', widgets: [] }] },
        ],
    },
];

check('designColumns takes the widest widget across all tabs', () => {
    assert.equal(designColumns(LAYOUTS), 44);
    assert.equal(designColumns([]), 48);
});

check('findTab refuses to guess when a name is ambiguous', () => {
    assert.ok(/mehrfach/.test(findTab(LAYOUTS, { tab: 'Licht' }).error ?? ''));
    assert.equal(findTab(LAYOUTS, { tab: 'Licht', layout: 'Tablet' }).tab.id, 't3');
    assert.equal(findTab(LAYOUTS, { tab: 'klima' }).tab.id, 't2');
    assert.ok(/Kein Tab/.test(findTab(LAYOUTS, { tab: 'Garage' }).error ?? ''));
});

check('allTabs flattens and replaceTabWidgets touches only the target tab', () => {
    assert.equal(allTabs(LAYOUTS).length, 3);
    const next = replaceTabWidgets(LAYOUTS, 't2', [{ id: 'neu' }]);
    assert.deepEqual(next[0].sections[0].tabs[1].widgets, [{ id: 'neu' }]);
    assert.deepEqual(next[0].sections[0].tabs[0].widgets, LAYOUTS[0].sections[0].tabs[0].widgets);
    assert.deepEqual(LAYOUTS[0].sections[0].tabs[1].widgets.length, 1, 'must not mutate the input');
});

check('collectDefIds follows nested group definitions', () => {
    const defs = { outer: [{ options: { defId: 'inner' } }], inner: [{ type: 'switch' }], unused: [{ type: 'value' }] };
    assert.deepEqual([...collectDefIds([{ options: { defId: 'outer' } }], defs)].sort(), ['inner', 'outer']);
});

// ── The endpoint, driven by the real MCP client ──────────────────────────────

console.log('\nmcp — Endpunkt');

const TOKEN = 'geheim-123';

/** Stands in for the ioBroker adapter: just the calls lib/mcp makes. */
function makeAdapter() {
    const states = {
        'config.dashboard': JSON.stringify({ version: 0, state: { layouts: JSON.parse(JSON.stringify(LAYOUTS)) } }),
        'config.group-defs': JSON.stringify({ version: 0, state: { defs: {} } }),
        'config.app-config': JSON.stringify({ version: 0, state: { frontend: { gridRowHeight: 20, gridGap: 10 } } }),
    };
    const files = {};
    return {
        namespace: 'aura.0',
        states,
        files,
        getStateAsync: async (id) => (states[id] === undefined ? null : { val: states[id], ack: true }),
        setStateAsync: async (id, v) => {
            states[id] = v.val;
        },
        writeFileAsync: async (_ns, name, data) => {
            files[name] = data;
        },
        readDirAsync: async () => Object.keys(files).map((file) => ({ file })),
        readFileAsync: async (_ns, name) => {
            if (files[name] === undefined) {
                throw new Error('not found');
            }
            return files[name];
        },
        getObjectViewAsync: async (_design, _type, opts) => ({
            rows: (opts.startkey || '').startsWith('alias.')
                ? [{ id: 'alias.0.licht' }]
                : [{ id: 'hm-rpc.0.LEQ1.1.STATE' }, { id: 'zigbee.0.temp' }],
        }),
    };
}

let adapter = makeAdapter();
const server = http.createServer((req, res) => {
    handleMcpRequest(req, res, { adapter, token: TOKEN, mode: 'delete', version: '9.9.9' }).catch((e) => {
        res.writeHead(500);
        res.end(String(e.message));
    });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/mcp`;

// Auth first — everything else is pointless if this is wrong.
const noToken = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
});
check('a request without a token is rejected with 401', () => {
    assert.equal(noToken.status, 401);
});

const wrongToken = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer falsch' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
});
check('a wrong token is rejected too', () => {
    assert.equal(wrongToken.status, 401);
});

const noConfiguredToken = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: '', version: '1' }).catch(() => {});
    });
    s.listen(0, '127.0.0.1', async () => {
        const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, { method: 'POST', body: '{}' });
        const body = await r.json();
        s.close();
        resolve({ status: r.status, body });
    });
});
check('enabled without a configured token serves nothing and says why', () => {
    assert.equal(noConfiguredToken.status, 503);
    assert.match(noConfiguredToken.body.error, /kein Token gesetzt/);
});

const client = new Client({ name: 'aura-test', version: '1.0.0' }, { capabilities: {} });
await client.connect(
    new StreamableHTTPClientTransport(new URL(base), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
);

check('the real MCP client completes the handshake', () => {
    const v = client.getServerVersion();
    assert.equal(v.name, 'aura');
    assert.equal(v.version, '9.9.9');
});

check('the instructions tell the model where datapoints come from', () => {
    const ins = client.getInstructions();
    assert.match(ins, /ioBroker MCP server/);
    assert.match(ins, /SAME ioBroker installation/);
    assert.match(ins, /aura_validate/);
});

const { tools } = await client.listTools();
check('all twenty-eight tools are announced with descriptions', () => {
    assert.deepEqual(tools.map((t) => t.name).sort(), [
        'aura_add_widget',
        'aura_backups',
        'aura_copy_node',
        'aura_copy_widget',
        'aura_create_layout',
        'aura_create_section',
        'aura_create_tab',
        'aura_dashboard',
        'aura_delete',
        'aura_find',
        'aura_group',
        'aura_insert_preset',
        'aura_popup',
        'aura_popups',
        'aura_presets',
        'aura_recipes',
        'aura_rename',
        'aura_reorder',
        'aura_restore',
        'aura_review',
        'aura_save_preset',
        'aura_tab',
        'aura_update_node',
        'aura_update_widget',
        'aura_validate',
        'aura_widget_schema',
        'aura_widget_types',
        'aura_write_group',
        'aura_write_popup',
        'aura_write_tab',
    ]);
    for (const t of tools) {
        assert.ok(t.description && t.description.length > 40, `${t.name}: description too thin`);
    }
});

const dash = await client.callTool({ name: 'aura_dashboard', arguments: {} });
check('aura_dashboard reports tabs, grid and the design width', () => {
    const t = dash.content[0].text;
    // Nested since the section line carries its own markers.
    assert.match(t, /- Wohnzimmer \/ Start/);
    assert.match(t, /· Licht — 1 Widget/);
    assert.match(t, /Die vorhandenen Widgets nutzen 44 Spalten/);
    assert.match(t, /Zeilenhöhe 20 px/);
});

const badReorderKind = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'popup', order: ['Details'] },
});
check('reorder names an unknown kind instead of hunting for a tab', () => {
    assert.ok(badReorderKind.isError);
    assert.match(badReorderKind.content[0].text, /"kind": "popup" gibt es hier nicht/);
});

const ambiguous = await client.callTool({ name: 'aura_tab', arguments: { tab: 'Licht' } });
check('an ambiguous tab name lists the candidates instead of guessing', () => {
    assert.ok(ambiguous.isError);
    assert.match(ambiguous.content[0].text, /gibt es mehrfach/);
});

const tabRes = await client.callTool({ name: 'aura_tab', arguments: { tab: 'Klima' } });
check('aura_tab returns the aura-tab payload', () => {
    assert.match(tabRes.content[0].text, /"_type": "aura-tab"/);
});

const schemaRes = await client.callTool({ name: 'aura_widget_schema', arguments: { types: ['switch'] } });
check('aura_widget_schema documents only what was asked for', () => {
    const t = schemaRes.content[0].text;
    assert.match(t, /## switch — Schalter/);
    assert.match(t, /- statusDp: string.*\[Datenpunkt-Id\]/);
    assert.ok(!/## value —/.test(t));
});

const tileRow = (n, over = {}) =>
    Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        type: 'value',
        title: `T${i}`,
        datapoint: `hm-rpc.0.DEV${i}.1.TEMP`,
        gridPos: { x: 0, y: i, w: 4, h: 3 },
        options: {},
        ...over,
    }));

const ids = (findings, id) => findings.find((f) => f.id === id);

check('a row of single-value tiles is reported, a handful is not', () => {
    // Three lamps are a layout. Ten are a list nobody wants to maintain — that is
    // the difference the threshold encodes, and it must not fire below it.
    assert.ok(!ids(reviewWidgets(tileRow(TILE_ROW_LIMIT - 1)), 'tile-row'));
    const found = ids(reviewWidgets(tileRow(TILE_ROW_LIMIT)), 'tile-row');
    assert.ok(found, 'the tile row was not reported');
    assert.equal(found.widgets.length, TILE_ROW_LIMIT);
    assert.ok(found.recipe);
});

check('a number without a good or bad range is reported, one with is not', () => {
    assert.ok(ids(reviewWidgets(tileRow(1)), 'value-without-meaning'));
    const withThresholds = tileRow(1, { options: { colorThresholds: [[20, '#fff']] } });
    assert.ok(!ids(reviewWidgets(withThresholds), 'value-without-meaning'));
    const withCondition = tileRow(1, { options: { conditions: [{ id: 'c', logic: 'AND', clauses: [], style: {} }] } });
    assert.ok(!ids(reviewWidgets(withCondition), 'value-without-meaning'));
});

check('a meter is spotted by its unit and by its id', () => {
    const byUnit = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'x.0.reading', options: { unit: 'kWh', colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(ids(byUnit, 'counter-as-reading'));
    const byId = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'shelly.0.emeter.total', options: { colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(ids(byId, 'counter-as-reading'));
    const plain = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'x.0.temp', options: { unit: '°C', colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(!ids(plain, 'counter-as-reading'));
});

check('contact tiles are only reported while no status overview is there', () => {
    const contacts = Array.from({ length: CONTACT_LIMIT }, (_, i) => ({
        id: `c${i}`,
        type: 'windowcontact',
        datapoint: `hm.0.W${i}.STATE`,
        options: {},
    }));
    assert.ok(ids(reviewWidgets(contacts), 'contacts-without-overview'));
    const withOverview = [...contacts, { id: 'ov', type: 'statusoverview', datapoint: '', options: {} }];
    assert.ok(!ids(reviewWidgets(withOverview), 'contacts-without-overview'));
});

check('a bar series without aggregate is reported, an aggregated one is not', () => {
    const raw = [{ id: 'e', type: 'echart', datapoint: 'x.0.c', options: { echartSeries: [{ chartType: 'bar' }] } }];
    assert.ok(ids(reviewWidgets(raw), 'bars-without-aggregate'));
    const delta = [
        {
            id: 'e',
            type: 'echart',
            datapoint: 'x.0.c',
            options: { echartSeries: [{ chartType: 'bar', aggregate: 'delta' }] },
        },
    ];
    assert.ok(!ids(reviewWidgets(delta), 'bars-without-aggregate'));
});

check('a list without row rules or a second line is reported', () => {
    const flat = [{ id: 'l', type: 'autolist', datapoint: '', options: {} }];
    assert.ok(ids(reviewWidgets(flat), 'list-without-depth'));
    const deep = [{ id: 'l', type: 'autolist', datapoint: '', options: { subDpTemplate: [{ id: '{{parent}}.B' }] } }];
    assert.ok(!ids(reviewWidgets(deep), 'list-without-depth'));
});

check('the "nothing reacts" remark does not pile onto a finding that already said it', () => {
    // Every value tile already got "no good or bad range"; repeating it as a tab
    // remark would be the same complaint twice.
    assert.ok(!ids(reviewWidgets(tileRow(6)), 'nothing-reacts'));
    const shutters = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        type: 'shutter',
        datapoint: `x.0.S${i}.LEVEL`,
        options: {},
    }));
    assert.ok(ids(reviewWidgets(shutters), 'nothing-reacts'));
});

check('a tab with nothing to complain about gets no invented findings', () => {
    const good = [
        {
            id: 'l',
            type: 'autolist',
            datapoint: '',
            options: { rowConditions: [{ id: 'r', clauses: [] }] },
        },
    ];
    const findings = reviewWidgets(good);
    assert.deepEqual(findings, [], `unexpected: ${findings.map((f) => f.id).join(', ')}`);
    assert.match(renderReview(findings, 'Tab'), /Nichts gefunden/);
});

check('every finding points at a recipe that exists', () => {
    const mixed = [
        ...tileRow(6),
        { id: 'th', type: 'thermostat', datapoint: 'x.0.SET', options: {} },
        { id: 'li', type: 'list', datapoint: '', options: {} },
    ];
    const findings = reviewWidgets(mixed);
    assert.ok(findings.length >= 3, `expected several findings, got ${findings.length}`);
    for (const f of findings) {
        assert.ok(findRecipe(f.recipe), `${f.id} points at unknown recipe "${f.recipe}"`);
    }
});

check('every recipe validates against the real widget schema', () => {
    // The whole point of shipping examples is that they are copied. One with a
    // misspelled option teaches the mistake to every model that reads it, and the
    // schema moves under them — a renamed option has to fail here, not in a user's
    // dashboard.
    for (const recipe of RECIPES) {
        for (const widget of recipe.widgets) {
            const { errors, warnings } = validateWidget(widget, schema, {});
            assert.deepEqual(errors, [], `${recipe.id}/${widget.id}: ${errors.join(' | ')}`);
            assert.deepEqual(warnings, [], `${recipe.id}/${widget.id}: ${warnings.join(' | ')}`);
        }
    }
});

check('a recipe carries no datapoint id that could pass for a real one', () => {
    // A plausible id gets written verbatim and produces a widget that silently
    // shows nothing — the exact failure the instructions warn about. Every id in a
    // recipe must be a placeholder, empty, or a per-row template.
    const ok = (v) => v === '' || /^%[^%\s]+%$/.test(v) || v.startsWith('{{') || v.startsWith('divider:');
    const walk = (node, where) => {
        if (Array.isArray(node)) {
            node.forEach((n) => walk(n, where));
            return;
        }
        if (!node || typeof node !== 'object') {
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'string' && (key === 'datapoint' || key === 'datapointId' || key.endsWith('Dp'))) {
                assert.ok(ok(value), `${where}: ${key} = "${value}" is not a placeholder`);
            }
            walk(value, where);
        }
    };
    for (const recipe of RECIPES) {
        walk(recipe.widgets, recipe.id);
        // Entry ids of a static list ARE the datapoint, so they fall under the same rule.
        for (const widget of recipe.widgets) {
            for (const entry of widget.options?.entries ?? []) {
                assert.ok(ok(entry.id), `${recipe.id}: entry id "${entry.id}" is not a placeholder`);
            }
        }
    }
});

check('the recipe index lists every recipe and the ids are unique', () => {
    const index = renderRecipeIndex();
    const ids = RECIPES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate recipe id');
    for (const id of ids) {
        assert.ok(index.includes(id), `${id} missing from the index`);
        assert.ok(findRecipe(id.toUpperCase()), `${id} not found case-insensitively`);
    }
    assert.equal(findRecipe('gibtsnicht'), null);
});

check('a rendered recipe hands over parseable JSON and names its placeholders', () => {
    const BLANK = String.fromCharCode(10, 10);
    for (const recipe of RECIPES) {
        const rendered = renderRecipe(recipe);
        const start = rendered.indexOf('## JSON') + '## JSON'.length + 1;
        const json = rendered.slice(start, rendered.indexOf(BLANK, start));
        const parsed = JSON.parse(json);
        const widgets = Array.isArray(parsed) ? parsed : [parsed];
        assert.equal(widgets.length, recipe.widgets.length, `${recipe.id}: widget count`);
        assert.ok(rendered.includes('aura_validate'), `${recipe.id}: does not send the model to the validator`);
        if (json.match(/%[^%\s]+%/g)) {
            assert.ok(rendered.includes('Vor dem Schreiben ersetzen'), `${recipe.id}: placeholders unannounced`);
        }
    }
});

const recipeIndex = await client.callTool({ name: 'aura_recipes', arguments: {} });
check('aura_recipes without an id lists the recipes', () => {
    const t = recipeIndex.content[0].text;
    assert.match(t, /# Rezepte \(\d+\)/);
    assert.match(t, /- raum-liste —/);
    assert.ok(!/"gridPos"/.test(t), 'the index must stay an index, not a dump of every recipe');
});

const recipeOne = await client.callTool({ name: 'aura_recipes', arguments: { id: 'raum-liste' } });
check('aura_recipes returns the full widget for one id', () => {
    const t = recipeOne.content[0].text;
    assert.match(t, /"type": "autolist"/);
    assert.match(t, /rowConditions/);
    assert.match(t, /Vor dem Schreiben ersetzen/);
});

const recipeUnknown = await client.callTool({ name: 'aura_recipes', arguments: { id: 'kachelwand' } });
check('an unknown recipe id lists the ones there are', () => {
    assert.ok(recipeUnknown.isError);
    assert.match(recipeUnknown.content[0].text, /Kein Rezept "kachelwand"/);
    assert.match(recipeUnknown.content[0].text, /raum-liste/);
});

const reviewRes = await client.callTool({ name: 'aura_review', arguments: { tab: 'Klima' } });
check('aura_review reports on a real tab and points at recipes', () => {
    const t = reviewRes.content[0].text;
    assert.match(t, /Klima/);
    assert.ok(
        /aura_recipes mit id=/.test(t) || /Nichts gefunden/.test(t),
        `unexpected review output:
${t}`,
    );
});

const reviewUnknown = await client.callTool({ name: 'aura_review', arguments: { tab: 'Gibtsnicht' } });
check('aura_review names the tabs there are instead of guessing', () => {
    assert.ok(reviewUnknown.isError);
    assert.match(reviewUnknown.content[0].text, /Vorhanden:/);
});

const badValidate = await client.callTool({
    name: 'aura_validate',
    arguments: { json: JSON.stringify({ ...OK_SWITCH, options: { showTitel: true } }) },
});
check('aura_validate reports a bad option and checks live datapoints', () => {
    assert.ok(badValidate.isError);
    assert.match(badValidate.content[0].text, /liest die Option "showTitel" nicht/);
    assert.match(badValidate.content[0].text, /3 Datenpunkte gegengeprüft/);
});

// ── Writing ──────────────────────────────────────────────────────────────────

const refused = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Klima', widget: JSON.stringify({ ...OK_SWITCH, datapoint: 'gibt.es.nicht' }) },
});
check('a widget with an invented datapoint is refused, and nothing is written', () => {
    assert.ok(refused.isError);
    assert.match(refused.content[0].text, /Nicht geschrieben/);
    assert.equal(Object.keys(adapter.files).length, 0, 'a refused write must not leave a backup');
    assert.match(adapter.states['config.dashboard'], /"t2"/);
    assert.ok(!adapter.states['config.dashboard'].includes('gibt.es.nicht'));
});

const overlapping = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Klima',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'neu', gridPos: { x: 10, y: 0, w: 8, h: 4 } }),
    },
});
check('a widget overlapping what is already there is refused', () => {
    assert.ok(overlapping.isError);
    assert.match(overlapping.content[0].text, /überlappen/);
});

const added = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Klima', widget: JSON.stringify({ ...OK_SWITCH, id: 'neu', gridPos: { x: 0, w: 8, h: 4 } }) },
});
check('a valid widget is appended below the existing content', () => {
    assert.ok(!added.isError, added.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts[0].sections[0].tabs[1];
    assert.equal(klima.widgets.length, 2);
    assert.equal(klima.widgets[1].id, 'neu');
    assert.equal(klima.widgets[1].gridPos.y, 4, 'must be placed below the existing widget, not on top of it');
});

check('the write is backed up first and the answer says where', () => {
    const names = Object.keys(adapter.files);
    assert.equal(names.length, 1);
    assert.match(names[0], /^mcp-.*\.json$/);
    assert.match(added.content[0].text, /Sicherung: aura\.0\.backups\/mcp-/);
    const backup = JSON.parse(adapter.files[names[0]]);
    assert.ok(backup.dashboard.includes('"t2"'), 'the backup must hold the PREVIOUS dashboard');
    assert.ok(!backup.dashboard.includes('"neu"'), 'the backup must predate the change');
});

check('the answer warns about an editor with unsaved changes', () => {
    assert.match(added.content[0].text, /ungespeicherten/);
});

const written = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([{ ...OK_SWITCH, id: 'nur-dieses', gridPos: { x: 0, y: 0, w: 8, h: 4 } }]),
    },
});
check('aura_write_tab replaces the whole widget list', () => {
    assert.ok(!written.isError, written.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.deepEqual(
        layouts[0].sections[0].tabs[1].widgets.map((w) => w.id),
        ['nur-dieses'],
    );
    assert.equal(layouts[0].sections[0].tabs[0].widgets.length, 1, 'the other tab must be untouched');
});

check('group definitions are written alongside, before the widgets that use them', () => {
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs, {}, 'nothing to write here yet');
});

const withDefs = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([
            {
                id: 'g',
                type: 'group',
                title: 'WZ',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { defId: 'd1' },
            },
        ]),
        groupDefs: JSON.stringify({ d1: [{ id: 'kind', type: 'switch' }] }),
    },
});
check('a group widget carries its children into config.group-defs', () => {
    assert.ok(!withDefs.isError, withDefs.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1, [{ id: 'kind', type: 'switch' }]);
});

// ── Creating tabs ────────────────────────────────────────────────────────────

const ambiguousSection = await client.callTool({ name: 'aura_create_tab', arguments: { name: 'Garten' } });
check('creating a tab refuses to guess the section when several exist', () => {
    assert.ok(ambiguousSection.isError);
    assert.match(ambiguousSection.content[0].text, /Mehrere Bereiche möglich/);
});

const created = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Garten', layout: 'Tablet', section: 'Haupt' },
});
check('a tab is created in the named section, with a slug', () => {
    assert.ok(!created.isError, created.content[0].text);
    assert.match(created.content[0].text, /Tab „Garten“ angelegt in Tablet \/ Haupt/);
    assert.match(created.content[0].text, /slug "garten"/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tabs = layouts[1].sections[0].tabs;
    assert.equal(tabs.length, 2);
    assert.equal(tabs[1].name, 'Garten');
    assert.deepEqual(tabs[1].widgets, []);
});

const created2 = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Garten', layout: 'Tablet', section: 'Haupt' },
});
check('a second tab of the same name gets a distinct slug', () => {
    assert.ok(!created2.isError, created2.content[0].text);
    assert.match(created2.content[0].text, /slug "garten-2"/);
});

const createdBad = await client.callTool({
    name: 'aura_create_tab',
    arguments: {
        name: 'Kaputt',
        layout: 'Tablet',
        section: 'Haupt',
        widgets: JSON.stringify([{ ...OK_SWITCH, datapoint: 'gibt.es.nicht' }]),
    },
});
check('a tab whose widgets do not validate is not created at all', () => {
    assert.ok(createdBad.isError);
    assert.match(createdBad.content[0].text, /Nicht angelegt/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.ok(!JSON.stringify(layouts).includes('Kaputt'), 'a refused creation must leave no tab behind');
});

// ── Layouts and sections ─────────────────────────────────────────────────────

const layoutCreated = await client.callTool({ name: 'aura_create_layout', arguments: { name: 'Küche' } });
check('a layout is created with one section and one tab', () => {
    assert.ok(!layoutCreated.isError, layoutCreated.content[0].text);
    assert.match(layoutCreated.content[0].text, /Layout „Küche“ angelegt \(slug "kueche"\)/);
    assert.match(layoutCreated.content[0].text, /\/#\/view\/kueche/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const made = layouts[layouts.length - 1];
    assert.equal(made.name, 'Küche');
    // An empty shell has nothing to render and no activeTabId to point at.
    assert.equal(made.sections.length, 1);
    assert.equal(made.sections[0].tabs.length, 1);
    assert.equal(made.activeSectionId, made.sections[0].id);
    assert.equal(made.sections[0].activeTabId, made.sections[0].tabs[0].id);
});

check('the umlaut is transliterated in the slug, as the frontend does', () => {
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[layouts.length - 1].slug, 'kueche');
});

const sectionNoLayout = await client.callTool({ name: 'aura_create_section', arguments: { name: 'Oben' } });
check('creating a section asks which layout when there are several', () => {
    assert.ok(sectionNoLayout.isError);
    assert.match(sectionNoLayout.content[0].text, /mit "layout" angeben/);
});

const sectionCreated = await client.callTool({
    name: 'aura_create_section',
    arguments: { name: 'Oben', layout: 'Küche' },
});
check('a section is created in the named layout, with one tab', () => {
    assert.ok(!sectionCreated.isError, sectionCreated.content[0].text);
    assert.match(sectionCreated.content[0].text, /Bereich „Oben“ in Layout „Küche“ angelegt/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const kueche = layouts.find((l) => l.name === 'Küche');
    assert.equal(kueche.sections.length, 2);
    assert.equal(kueche.sections[1].name, 'Oben');
    assert.equal(kueche.sections[1].tabs.length, 1);
});

const sectionUnknown = await client.callTool({
    name: 'aura_create_section',
    arguments: { name: 'X', layout: 'gibtsnicht' },
});
check('an unknown layout lists the existing ones', () => {
    assert.ok(sectionUnknown.isError);
    assert.match(sectionUnknown.content[0].text, /Kein Layout "gibtsnicht"/);
    assert.match(sectionUnknown.content[0].text, /- Küche/);
});

const tabInNewSection = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Herd', layout: 'Küche', section: 'Oben' },
});
check('a tab can be created in the freshly made section', () => {
    assert.ok(!tabInNewSection.isError, tabInNewSection.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const oben = layouts.find((l) => l.name === 'Küche').sections.find((s) => s.name === 'Oben');
    assert.deepEqual(
        oben.tabs.map((t) => t.name),
        ['Dashboard', 'Herd'],
    );
});

check('creating structure leaves the other layouts untouched', () => {
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[0].name, 'Wohnzimmer');
    assert.equal(layouts[0].sections[0].tabs.length, 2, 'the first layout must keep its tabs');
});

// ── Popups ───────────────────────────────────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: {
        typeDefaults: { switch: 'builtin-switch' },
        views: [
            { id: 'builtin-switch', name: 'Schalter', widgets: [], version: 3 },
            { id: 'view-eigen', name: 'Eigenes', widgets: [{ ...OK_SWITCH, id: 'p1' }] },
        ],
    },
});

const popupList = await client.callTool({ name: 'aura_popups', arguments: {} });
check('aura_popups lists the views with their widget counts', () => {
    assert.match(popupList.content[0].text, /- Schalter \(id builtin-switch\) — 0 Widget/);
    assert.match(popupList.content[0].text, /- Eigenes \(id view-eigen\) — 1 Widget/);
});

const popupRead = await client.callTool({ name: 'aura_popup', arguments: { view: 'Eigenes' } });
check('aura_popup returns the widgets of one view', () => {
    assert.ok(!popupRead.isError, popupRead.content[0].text);
    assert.match(popupRead.content[0].text, /"id": "p1"/);
});

const popupMissing = await client.callTool({ name: 'aura_popup', arguments: { view: 'gibtsnicht' } });
check('an unknown popup lists what is there', () => {
    assert.ok(popupMissing.isError);
    assert.match(popupMissing.content[0].text, /Vorhanden:/);
    assert.match(popupMissing.content[0].text, /Schalter/);
});

const popupWritten = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'builtin-switch', widgets: JSON.stringify([{ ...OK_SWITCH, id: 'neu-im-popup' }]) },
});
check('editing a built-in popup flags it as user-edited', () => {
    assert.ok(!popupWritten.isError, popupWritten.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const builtin = views.find((v) => v.id === 'builtin-switch');
    assert.equal(builtin.widgets[0].id, 'neu-im-popup');
    // Without the flag, ensureBuiltins() discards the change on the next start.
    assert.equal(builtin.userEdited, true);
});

check('the other keys of the popup state survive the write', () => {
    const state = JSON.parse(adapter.states['config.popup-config']).state;
    assert.deepEqual(state.typeDefaults, { switch: 'builtin-switch' });
    assert.equal(state.views.length, 2);
});

const popupCreated = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Frisch', create: true, widgets: JSON.stringify([{ ...OK_SWITCH, id: 'f1' }]) },
});
check('a popup can be created with create:true', () => {
    assert.ok(!popupCreated.isError, popupCreated.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.length, 3);
    assert.equal(views[2].name, 'Frisch');
    assert.match(views[2].id, /^view-/);
});

const popupBad = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Eigenes', widgets: JSON.stringify([{ ...OK_SWITCH, options: { showTitel: true } }]) },
});
check('a popup with a bad option is refused and the view is untouched', () => {
    assert.ok(popupBad.isError);
    assert.match(popupBad.content[0].text, /showTitel/);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.find((v) => v.name === 'Eigenes').widgets[0].id, 'p1');
});

// ── Groups ───────────────────────────────────────────────────────────────────

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: { defs: { d1: [{ ...OK_SWITCH, id: 'kind-1' }] }, hydrated: true },
});

const groupRead = await client.callTool({ name: 'aura_group', arguments: { defId: 'd1' } });
check('aura_group returns the children of a group', () => {
    assert.ok(!groupRead.isError, groupRead.content[0].text);
    assert.match(groupRead.content[0].text, /1 Kind\(er\)/);
    assert.match(groupRead.content[0].text, /"id": "kind-1"/);
});

const groupMissing = await client.callTool({ name: 'aura_group', arguments: { defId: 'gibtsnicht' } });
check('an unknown defId lists the known ones', () => {
    assert.ok(groupMissing.isError);
    assert.match(groupMissing.content[0].text, /Vorhanden: d1/);
});

const groupWritten = await client.callTool({
    name: 'aura_write_group',
    arguments: {
        defId: 'd1',
        widgets: JSON.stringify([
            { ...OK_SWITCH, id: 'kind-a' },
            { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
        ]),
    },
});
check('aura_write_group replaces the children', () => {
    assert.ok(!groupWritten.isError, groupWritten.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a', 'kind-b'],
    );
});

const groupBad = await client.callTool({
    name: 'aura_write_group',
    arguments: { defId: 'd1', widgets: JSON.stringify([{ ...OK_SWITCH, id: 'x', layout: 'dial' }]) },
});
check('a group whose children do not validate is left alone', () => {
    assert.ok(groupBad.isError);
    assert.match(groupBad.content[0].text, /layout "dial"/);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a', 'kind-b'],
    );
});

check('the backup covers all three config states, not just the dashboard', () => {
    const names = Object.keys(adapter.files).sort();
    const last = JSON.parse(adapter.files[names[names.length - 1]]);
    assert.ok('dashboard' in last, 'dashboard missing from the backup');
    assert.ok('group-defs' in last, 'group-defs missing from the backup');
    assert.ok('popup-config' in last, 'popup-config missing from the backup — a popup edit would be unrecoverable');
});

// ── Changing one widget ──────────────────────────────────────────────────────

check('mergeWidget merges options and removes a key set to null', () => {
    const before = { id: 'a', title: 'Alt', layout: 'card', options: { showTitle: true, icon: 'X' } };
    const after = mergeWidget(before, { title: 'Neu', options: { icon: null, iconSize: 20 } });
    assert.deepEqual(after, {
        id: 'a',
        title: 'Neu',
        layout: 'card',
        // The options the caller did not mention have to survive; losing them is
        // the whole failure mode this tool exists to prevent.
        options: { showTitle: true, iconSize: 20 },
    });
    assert.deepEqual(mergeWidget(before, { layout: null }).layout, undefined);
    assert.deepEqual(before.options, { showTitle: true, icon: 'X' }, 'the input must not be mutated');
});

check('findWidget reports the tab, and refuses on a duplicated id', () => {
    const found = findWidget(LAYOUTS, 'w-dup');
    assert.ok(/Kein Widget/.test(found.error ?? ''));
    const dupes = [
        {
            id: 'l',
            name: 'L',
            sections: [
                {
                    id: 's',
                    name: 'S',
                    tabs: [
                        { id: 't1', name: 'Eins', widgets: [{ id: 'w-dup' }] },
                        { id: 't2', name: 'Zwei', widgets: [{ id: 'w-dup' }] },
                    ],
                },
            ],
        },
    ];
    assert.ok(/kommt mehrfach vor/.test(findWidget(dupes, 'w-dup').error ?? ''));
});

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: {
        defs: {
            d1: [
                { ...OK_SWITCH, id: 'kind-a', title: 'Kind A', options: { showTitle: true, iconSize: 24 } },
                { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
            ],
        },
        hydrated: true,
    },
});

const groupPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ title: 'Umbenannt' }) },
});
check('one child of a group is changed without touching its siblings', () => {
    assert.ok(!groupPatched.isError, groupPatched.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.equal(defs.d1.length, 2);
    assert.equal(defs.d1[0].title, 'Umbenannt');
    // The options nobody mentioned must still be there.
    assert.deepEqual(defs.d1[0].options, { showTitle: true, iconSize: 24 });
    assert.equal(defs.d1[1].id, 'kind-b', 'the sibling must be untouched');
});

const groupPatchOptions = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        defId: 'd1',
        widgetId: 'kind-a',
        patch: JSON.stringify({ options: { iconSize: 32, showTitle: null } }),
    },
});
check('an option can be changed and another removed in one call', () => {
    assert.ok(!groupPatchOptions.isError, groupPatchOptions.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1[0].options, { iconSize: 32 });
});

const groupUnknownChild = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'gibtsnicht', patch: JSON.stringify({ title: 'X' }) },
});
check('an unknown child lists the ids that exist', () => {
    assert.ok(groupUnknownChild.isError);
    assert.match(groupUnknownChild.content[0].text, /kind-a, kind-b/);
});

const patchInvalid = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ options: { showTitel: true } }) },
});
check('a patch that introduces a bad option is refused and nothing changes', () => {
    assert.ok(patchInvalid.isError);
    assert.match(patchInvalid.content[0].text, /showTitel/);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1[0].options, { iconSize: 32 });
});

const idChange = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ id: 'anders' }) },
});
check('the id cannot be changed, because references would be orphaned', () => {
    assert.ok(idChange.isError);
    assert.match(idChange.content[0].text, /id darf sich nicht ändern/);
});

// Do not rely on what earlier tests left in the tab — put the target there.
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Klima',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'im-tab', title: 'Vorher', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});

const tabPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'im-tab', patch: JSON.stringify({ title: 'Im Tab geändert' }) },
});
check('a widget in a tab is found without naming the tab', () => {
    assert.ok(!tabPatched.isError, tabPatched.content[0].text);
    assert.match(tabPatched.content[0].text, /Wohnzimmer \/ Start \/ Klima/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts[0].sections[0].tabs[1];
    assert.equal(klima.widgets.find((w) => w.id === 'im-tab').title, 'Im Tab geändert');
});

const replaced = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        widgetId: 'im-tab',
        replace: true,
        patch: JSON.stringify({ ...OK_SWITCH, id: 'im-tab', title: 'Ganz neu', gridPos: { x: 0, y: 8, w: 8, h: 4 } }),
    },
});
check('replace:true swaps the whole widget instead of merging', () => {
    assert.ok(!replaced.isError, replaced.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const w = layouts[0].sections[0].tabs[1].widgets.find((x) => x.id === 'im-tab');
    assert.equal(w.title, 'Ganz neu');
    assert.deepEqual(w.options, OK_SWITCH.options);
});

const missingWidget = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'nirgendwo', patch: JSON.stringify({ title: 'X' }) },
});
check('a widget that exists nowhere says where it was looked for', () => {
    // Group children and popup widgets are found without being told where they
    // are, so the old advice ("pass the defId") would now be wrong.
    assert.ok(missingWidget.isError);
    assert.match(missingWidget.content[0].text, /weder in einem Tab, einem Popup noch in einer Gruppe/);
});

// ── Permission levels ────────────────────────────────────────────────────────

check('the token is kept out of the instance object handed to browsers', () => {
    // The password field type only masks the input in the admin UI. Without
    // protectedNative the value sits in native, and the frontend reads that
    // object on every start (App.tsx fetches system.adapter.aura.*), so every
    // browser on the network would receive the token in clear text.
    const ioPack = JSON.parse(fs.readFileSync(path.join(ROOT, 'io-package.json'), 'utf8'));
    const protectedNative = ioPack.common.protectedNative || [];
    assert.ok(protectedNative.includes('mcpToken'), 'mcpToken must be protected');
    // The generated client block carries the same token a second time.
    assert.ok(protectedNative.includes('mcpClientConfig'), 'mcpClientConfig must be protected too');
});

check('the levels escalate and an unknown value falls back to read', () => {
    assert.deepEqual(LEVELS, ['read', 'write', 'rename', 'delete']);
    assert.equal(levelIndex('read'), 0);
    assert.equal(levelIndex('delete'), 3);
    // An unrecognised or missing setting must never widen permissions.
    assert.equal(levelIndex('quatsch'), 0);
    assert.equal(levelIndex(undefined), 0);
});

check('each level offers strictly more tools, and read offers no writer', () => {
    const counts = LEVELS.map((l) => toolsFor(l).length);
    for (let i = 1; i < counts.length; i++) {
        assert.ok(counts[i] > counts[i - 1], `${LEVELS[i]} must offer more than ${LEVELS[i - 1]}`);
    }
    const readTools = toolsFor('read').map((t) => t.name);
    for (const name of readTools) {
        assert.ok(!/^aura_(write|create|add|update|delete|rename)/.test(name), `${name} must not be a read tool`);
    }
    assert.ok(!toolsFor('rename').some((t) => t.name === 'aura_delete'));
    assert.ok(toolsFor('delete').some((t) => t.name === 'aura_delete'));
});

check('the level is not leaked into the advertised tool schema', () => {
    for (const t of toolsFor('delete')) {
        assert.ok(!('level' in t), `${t.name} still carries its level`);
    }
});

/** Talk to the endpoint at a given permission level. */
async function atLevel(mode, body) {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: TOKEN, mode, version: '1' }).catch(() => {});
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
    });
    const json = await r.json();
    s.close();
    return json;
}

const listedRead = await atLevel('read', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
check('tools/list at read advertises no writing tool', () => {
    const names = listedRead.result.tools.map((t) => t.name);
    assert.ok(names.includes('aura_dashboard'));
    assert.ok(!names.includes('aura_write_tab'));
    assert.ok(!names.includes('aura_delete'));
});

const refusedWrite = await atLevel('read', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'aura_write_tab', arguments: { tab: 'Klima', widgets: '[]' } },
});
check('a cached client calling a forbidden tool is refused, naming the setting', () => {
    // The list is filtered, but a client may still hold an older copy.
    assert.equal(refusedWrite.result.isError, true);
    assert.match(refusedWrite.result.content[0].text, /braucht die Berechtigung "write"/);
    assert.match(refusedWrite.result.content[0].text, /eingestellt ist "read"/);
    assert.match(refusedWrite.result.content[0].text, /Adapter-Konfiguration/);
});

const refusedDelete = await atLevel('rename', {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'aura_delete', arguments: { kind: 'tab', target: 'Klima' } },
});
check('rename does not include delete', () => {
    assert.equal(refusedDelete.result.isError, true);
    assert.match(refusedDelete.result.content[0].text, /braucht die Berechtigung "delete"/);
});

const initRead = await atLevel('read', {
    jsonrpc: '2.0',
    id: 4,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
});
check('the instructions tell the model which level it is on', () => {
    assert.match(initRead.result.instructions, /Permission: read only/);
});

const initDelete = await atLevel('delete', {
    jsonrpc: '2.0',
    id: 5,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
});
check('at delete the model is told to ask before removing anything', () => {
    assert.match(initDelete.result.instructions, /Permission: delete/);
    assert.match(initDelete.result.instructions, /Ask the user before deleting/);
});

// ── Navigation properties: conditions, badges, aggregate ─────────────────────

check('each kind advertises exactly the fields it really has', () => {
    // A tab button carries conditions, a section menu entry does not, and a layout
    // has neither badges nor an aggregate. Getting this wrong means the value is
    // stored and silently ignored.
    assert.deepEqual(NODE_FIELDS.layout, ['icon', 'hidden', 'defaultSectionId', 'settings']);
    assert.deepEqual(NODE_FIELDS.section, ['icon', 'hidden', 'defaultTabId', 'badges', 'badgeAggregate', 'settings']);
    assert.deepEqual(NODE_FIELDS.tab, [
        'icon',
        'hideLabel',
        'disabled',
        'hidden',
        'conditions',
        'badges',
        'badgeAggregate',
    ]);
});

check('a field the kind does not have is refused, with the list of allowed ones', () => {
    const onSection = updateNode(LAYOUTS, 'section', 's1', { conditions: [] });
    assert.match(onSection.error, /Ein section kennt "conditions" nicht/);
    assert.match(onSection.error, /badges, badgeAggregate/);
    assert.match(updateNode(LAYOUTS, 'layout', 'l1', { badges: [] }).error, /Ein layout kennt "badges" nicht/);
});

check('renaming cannot sneak in through a property patch', () => {
    // Otherwise the write level would bypass the rename permission entirely.
    const res = updateNode(LAYOUTS, 'tab', 't1', { name: 'Anders' });
    assert.match(res.error, /kennt "name" nicht/);
    assert.match(res.error, /aura_rename/);
});

check('updateNode merges, removes on null, and does not mutate the input', () => {
    const withBoth = updateNode(LAYOUTS, 'tab', 't1', {
        icon: 'Lightbulb',
        badgeAggregate: { enabled: true, corner: 'tr' },
    });
    const tab = withBoth.layouts[0].sections[0].tabs[0];
    assert.equal(tab.icon, 'Lightbulb');
    assert.deepEqual(tab.badgeAggregate, { enabled: true, corner: 'tr' });
    // A second patch keeps the corner it did not mention.
    const merged = updateNode(withBoth.layouts, 'tab', 't1', { badgeAggregate: { enabled: false } });
    assert.deepEqual(merged.layouts[0].sections[0].tabs[0].badgeAggregate, { enabled: false, corner: 'tr' });
    const cleared = updateNode(withBoth.layouts, 'tab', 't1', { icon: null });
    assert.equal(cleared.layouts[0].sections[0].tabs[0].icon, undefined);
    assert.equal(LAYOUTS[0].sections[0].tabs[0].icon, undefined, 'the input must not be mutated');
});

const nodeUpdated = await client.callTool({
    name: 'aura_update_node',
    arguments: {
        kind: 'tab',
        target: 'Licht',
        layout: 'Wohnzimmer',
        patch: JSON.stringify({
            icon: 'Lightbulb',
            conditions: [{ id: 'c1', datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: '==', value: 'true' }],
            badgeAggregate: { enabled: true },
        }),
    },
});
check('a tab button takes an icon, conditions and the aggregate through the endpoint', () => {
    assert.ok(!nodeUpdated.isError, nodeUpdated.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tab = layouts[0].sections[0].tabs.find((t) => t.name === 'Licht');
    assert.equal(tab.icon, 'Lightbulb');
    assert.equal(tab.conditions.length, 1);
    assert.equal(tab.badgeAggregate.enabled, true);
    // The widgets on the tab are untouched by a button change.
    assert.equal(tab.widgets.length, 1);
});

const sectionUpdated = await client.callTool({
    name: 'aura_update_node',
    arguments: {
        kind: 'section',
        target: 'Start',
        layout: 'Wohnzimmer',
        patch: JSON.stringify({ icon: 'Home', badges: [{ id: 'b1' }] }),
    },
});
check('a section menu entry takes an icon and badges', () => {
    assert.ok(!sectionUpdated.isError, sectionUpdated.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[0].sections[0].icon, 'Home');
    assert.equal(layouts[0].sections[0].badges.length, 1);
});

const sectionCondition = await client.callTool({
    name: 'aura_update_node',
    arguments: { kind: 'section', target: 'Start', layout: 'Wohnzimmer', patch: JSON.stringify({ conditions: [] }) },
});
check('the endpoint refuses conditions on a section instead of storing dead config', () => {
    assert.ok(sectionCondition.isError);
    assert.match(sectionCondition.content[0].text, /kennt "conditions" nicht/);
});

const overview = await client.callTool({ name: 'aura_dashboard', arguments: {} });
check('aura_dashboard shows what is set on the buttons', () => {
    const t = overview.content[0].text;
    assert.match(t, /Bereichsmenü: Icon, 1 Marker/);
    assert.match(t, /Tab-Button: Icon, 1 Bedingung\(en\), Aggregat-Anzahl/);
});

// ── Renaming ─────────────────────────────────────────────────────────────────

const renamed = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'tab', target: 'Klima', name: 'Raumklima' },
});
check('a tab is renamed and keeps its slug', () => {
    assert.ok(!renamed.isError, renamed.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tab = layouts[0].sections[0].tabs[1];
    assert.equal(tab.name, 'Raumklima');
    // Changing the slug would break bookmarks and the navigate datapoints.
    assert.equal(tab.slug, 'klima');
    assert.match(renamed.content[0].text, /slug bleibt "klima"/);
});

const renamedLayout = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'layout', target: 'Tablet', name: 'Wandtablet' },
});
check('a layout is renamed and keeps its slug too', () => {
    assert.ok(!renamedLayout.isError, renamedLayout.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const l = layouts.find((x) => x.name === 'Wandtablet');
    assert.equal(l.slug, 'tablet');
});

// ── Deleting ─────────────────────────────────────────────────────────────────

const deletedTab = await client.callTool({ name: 'aura_delete', arguments: { kind: 'tab', target: 'Raumklima' } });
check('deleting a tab says how much content went with it', () => {
    assert.ok(!deletedTab.isError, deletedTab.content[0].text);
    assert.match(deletedTab.content[0].text, /Widget\(s\)/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.ok(!layouts[0].sections[0].tabs.some((t) => t.name === 'Raumklima'));
});

const onlySection = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'section', target: 'Start', layout: 'Wohnzimmer' },
});
check('the only section of a layout cannot be deleted', () => {
    assert.ok(onlySection.isError);
    assert.match(onlySection.content[0].text, /nur diesen einen Bereich/);
});

// The group needs a host widget, or the prune that follows every delete drops
// its children as orphans — which is exactly what it is there for.
adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: {
        defs: {
            d1: [
                { ...OK_SWITCH, id: 'kind-a' },
                { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
            ],
        },
        hydrated: true,
    },
});
const anyTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
const host = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: anyTab.id,
        widget: JSON.stringify({
            id: 'wirt-d1',
            type: 'group',
            title: 'Wirt',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'd1' },
        }),
    },
});
assert.ok(!host.isError, host.content[0].text);
const deletedWidgetInGroup = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'widget', target: 'kind-b', defId: 'd1' },
});
check('a single child can be deleted out of a group', () => {
    assert.ok(!deletedWidgetInGroup.isError, deletedWidgetInGroup.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a'],
    );
});

const deletedPopup = await client.callTool({ name: 'aura_delete', arguments: { kind: 'popup', target: 'Frisch' } });
check('a popup can be deleted', () => {
    assert.ok(!deletedPopup.isError, deletedPopup.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.ok(!views.some((v) => v.name === 'Frisch'));
});

check('every deletion left a backup behind', () => {
    const names = Object.keys(adapter.files);
    assert.ok(names.length >= 4, `expected several backups, got ${names.length}`);
});

// ── Custom layout ────────────────────────────────────────────────────────────
// 27 of 55 types offer layout "custom", and customGrid used to be an untyped {}:
// no guidance, no validation, and CustomGridView falls back to nine empty cells.

check('a custom grid is described down to the cell type', () => {
    assert.equal(schema.commonOptions.customGrid.ref, 'CustomGridDef');
    const def = schema.types.CustomGridDef.fields;
    assert.ok(def.cols.required && def.rows.required);
    assert.equal(def.cells.items.ref, 'CustomCell');
    assert.ok(schema.types.CustomCell.fields.type, 'a cell needs its type described');
    assert.ok(schema.types.CustomCellType.enum.includes('value'));
});

check('a broken custom grid is caught, cell by cell', () => {
    const w = (customGrid) => ({ ...OK_SWITCH, layout: 'custom', options: { customGrid } });
    assert.ok(hasError(validateWidget(w({ unsinn: true }), schema), /"cols" fehlt/));
    assert.ok(
        hasError(validateWidget(w({ cols: 1, rows: 1, cells: [{ type: 'blubb' }] }), schema), /cells\[0\]\.type/),
    );
    assert.deepEqual(
        validateWidget(w({ cols: 2, rows: 1, cells: [{ type: 'title', align: 'left' }, { type: 'value' }] }), schema)
            .errors,
        [],
    );
});

check('layout "custom" without a grid is flagged as the empty widget it produces', () => {
    const res = validateWidget({ ...OK_SWITCH, layout: 'custom' }, schema);
    assert.deepEqual(res.errors, [], 'it is valid, just pointless');
    assert.ok(hasWarning(res, /ohne "customGrid" ergibt ein leeres Widget/));
});

// ── Backups ──────────────────────────────────────────────────────────────────

const backupList = await client.callTool({ name: 'aura_backups', arguments: {} });
check('aura_backups lists what earlier writes left behind', () => {
    assert.ok(!backupList.isError, backupList.content[0].text);
    assert.match(backupList.content[0].text, /# Sicherungen \(\d+\)/);
    assert.match(backupList.content[0].text, /- mcp-.*\.json/);
});

const beforeRestore = JSON.parse(adapter.states['config.dashboard']);
const firstBackup = Object.keys(adapter.files).sort()[0];
const restored = await client.callTool({ name: 'aura_restore', arguments: { backup: firstBackup } });

check('restoring puts the earlier state back', () => {
    assert.ok(!restored.isError, restored.content[0].text);
    const expected = JSON.parse(JSON.parse(adapter.files[firstBackup]).dashboard);
    assert.deepEqual(JSON.parse(adapter.states['config.dashboard']), expected);
    assert.notDeepEqual(JSON.parse(adapter.states['config.dashboard']), beforeRestore, 'nothing would have changed');
});

check('the state before the restore is itself kept', () => {
    // Restoring the wrong backup must not be a one-way door.
    assert.match(restored.content[0].text, /Der Stand davor liegt als aura\.0\.backups\/mcp-/);
    const safety = restored.content[0].text.match(/backups\/(mcp-[\w.-]+\.json)/)[1];
    assert.deepEqual(JSON.parse(JSON.parse(adapter.files[safety]).dashboard), beforeRestore);
});

const badName = await client.callTool({ name: 'aura_restore', arguments: { backup: '../../etc/passwd' } });
check('only this server own backup names are accepted', () => {
    // The name reaches readFile, so it must not be able to walk out of the folder.
    assert.ok(badName.isError);
    assert.match(badName.content[0].text, /kein Sicherungsname/);
});

adapter.files['mcp-fremd.json'] = JSON.stringify({ _type: 'etwas-anderes', dashboard: '{}' });
const foreign = await client.callTool({ name: 'aura_restore', arguments: { backup: 'mcp-fremd.json' } });
check('a file that is not one of our backups is refused', () => {
    assert.ok(foreign.isError);
    assert.match(foreign.content[0].text, /keine Sicherung dieses Servers/);
});

adapter.files['mcp-alt.json'] = JSON.stringify({
    _type: 'aura-mcp-backup',
    _ts: 1,
    dashboard: JSON.stringify({ version: 0, state: { layouts: [] } }),
    // An older backup, taken before popups were covered.
    'popup-config': null,
});
const popupsBefore = adapter.states['config.popup-config'];
const partial = await client.callTool({ name: 'aura_restore', arguments: { backup: 'mcp-alt.json' } });
check('an older backup does not wipe what it never held', () => {
    assert.ok(!partial.isError, partial.content[0].text);
    // Writing null over the live popups would turn a restore into a second accident.
    assert.equal(adapter.states['config.popup-config'], popupsBefore);
    assert.match(partial.content[0].text, /\(dashboard\)/);
});

// ── The widget frame itself ──────────────────────────────────────────────────
// The one level that used to pass unchecked.

check('a wrongly typed frame field is caught', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, mobileOrder: 'zwei' }, schema), /"mobileOrder": string/));
    assert.deepEqual(validateWidget({ ...OK_SWITCH, mobileOrder: 2 }, schema).errors, []);
});

check('a stray top-level key is a warning, not a rejection', () => {
    // AURA ignores it rather than breaking, so an error would be too harsh —
    // but staying silent is how a typo survives forever.
    const res = validateWidget({ ...OK_SWITCH, mobilOrder: 2 }, schema);
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /"mobilOrder" gehört nicht zu einem Widget/));
    assert.ok(hasWarning(res, /meintest du "mobileOrder"/));
});

check('groupDefs may ride along without being flagged', () => {
    // Import payloads carry it next to the widget; it is not part of one.
    assert.deepEqual(validateWidget({ ...OK_SWITCH, groupDefs: { d1: [] } }, schema).warnings, []);
});

// ── Reordering ───────────────────────────────────────────────────────────────

check('reorderNodes demands the complete set', () => {
    const list = [
        { id: 'a', name: 'Eins', slug: 'eins' },
        { id: 'b', name: 'Zwei', slug: 'zwei' },
    ];
    // Omission must not read as deletion.
    assert.match(reorderNodes(list, ['Eins'], 'Tabs').error, /es fehlen: "Zwei"/);
    assert.match(reorderNodes(list, ['Eins', 'Drei'], 'Tabs').error, /"Drei" gibt es .* nicht/);
    assert.match(reorderNodes(list, ['Eins', 'Eins'], 'Tabs').error, /mehrfach/);
    assert.deepEqual(
        reorderNodes(list, ['Zwei', 'eins'], 'Tabs').ordered.map((x) => x.id),
        ['b', 'a'],
    );
});

// Earlier blocks renamed and deleted their way through the fixture, so this one
// builds what it needs instead of inheriting it.
await client.callTool({ name: 'aura_create_layout', arguments: { name: 'Werkbank' } });
await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Eins', layout: 'Werkbank', section: 'Standard' },
});
await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Zwei', layout: 'Werkbank', section: 'Standard' },
});

const reordered = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'tab', layout: 'Werkbank', section: 'Standard', order: ['Zwei', 'Eins', 'Dashboard'] },
});
check('tabs are reordered through the endpoint', () => {
    assert.ok(!reordered.isError, reordered.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.deepEqual(
        wb.sections[0].tabs.map((t) => t.name),
        ['Zwei', 'Eins', 'Dashboard'],
    );
});

const reorderIncomplete = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'tab', layout: 'Werkbank', section: 'Standard', order: ['Eins'] },
});
check('an incomplete order is refused rather than dropping a tab', () => {
    assert.ok(reorderIncomplete.isError);
    assert.match(reorderIncomplete.content[0].text, /muss alle Tabs enthalten/);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.equal(wb.sections[0].tabs.length, 3, 'nothing may have been dropped');
});

const layoutNames = JSON.parse(adapter.states['config.dashboard']).state.layouts.map((l) => l.name);
const wantOrder = [...layoutNames].reverse();
const reorderLayouts = await client.callTool({ name: 'aura_reorder', arguments: { kind: 'layout', order: wantOrder } });
check('layouts are reordered too', () => {
    assert.ok(!reorderLayouts.isError, reorderLayouts.content[0].text);
    assert.deepEqual(
        JSON.parse(adapter.states['config.dashboard']).state.layouts.map((l) => l.name),
        wantOrder,
    );
});

// ── Copy and move ────────────────────────────────────────────────────────────

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: { defs: { dg: [{ ...OK_SWITCH, id: 'kind' }] }, hydrated: true },
});
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Eins',
        layout: 'Werkbank',
        widget: JSON.stringify({
            id: 'quelle',
            type: 'group',
            title: 'Gruppe',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'dg' },
        }),
    },
});

const copied = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Zwei', layout: 'Werkbank' },
});
check('a copied group gets its own children, not a shared reference', () => {
    assert.ok(!copied.isError, copied.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const wz = layouts.find((l) => l.name === 'Werkbank').sections[0];
    const klima = wz.tabs.find((t) => t.name === 'Zwei');
    const copy = klima.widgets.find((w) => w.id !== 'quelle' && w.type === 'group');
    assert.ok(copy, 'the copy must be in the target tab');
    // Sharing the defId would make editing the copy change the original.
    assert.notEqual(copy.options.defId, 'dg');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[copy.options.defId], 'the copied children must exist under the new id');
    assert.ok(defs.dg, 'the original children must be untouched');
    assert.match(copied.content[0].text, /Gruppen-Kinder wurden mitkopiert/);
});

const sameTab = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Eins', layout: 'Werkbank' },
});
check('copying into the tab it already sits in is refused', () => {
    assert.ok(sameTab.isError);
    assert.match(sameTab.content[0].text, /liegt bereits/);
});

const moved = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Zwei', layout: 'Werkbank', mode: 'move' },
});
check('a move takes the widget out of the source tab', () => {
    assert.ok(!moved.isError, moved.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const wz = layouts.find((l) => l.name === 'Werkbank').sections[0];
    assert.ok(!wz.tabs.find((t) => t.name === 'Eins').widgets.some((w) => w.id === 'quelle'));
    assert.ok(wz.tabs.find((t) => t.name === 'Zwei').widgets.some((w) => w.id === 'quelle'));
});

// ── Presets ──────────────────────────────────────────────────────────────────

const noPresets = await client.callTool({ name: 'aura_presets', arguments: {} });
check('an empty preset store says so', () => {
    assert.match(noPresets.content[0].text, /Keine Widget-Vorlagen/);
});

const saved = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'quelle', name: 'Meine Gruppe', icon: '🏠' },
});
check('a widget is saved as a preset, with its group children', () => {
    assert.ok(!saved.isError, saved.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.equal(presets.length, 1);
    assert.equal(presets[0].name, 'Meine Gruppe');
    assert.equal(presets[0].icon, '🏠');
    // Without the children the blueprint would insert an empty group.
    assert.ok(presets[0].groupDefs && Object.keys(presets[0].groupDefs).length);
    assert.match(saved.content[0].text, /mit 1 Gruppen-Definition/);
});

const inserted = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Eins', layout: 'Werkbank' },
});
check('a preset is inserted with fresh ids', () => {
    assert.ok(!inserted.isError, inserted.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const licht = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Eins');
    const made = licht.widgets.find((w) => w.type === 'group');
    assert.ok(made && made.id.startsWith('w-'), 'a new id, not the blueprint one');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[made.options.defId], 'its children must have been registered');
});

const insertedTwice = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Eins', layout: 'Werkbank' },
});
check('inserting the same preset twice does not make them share children', () => {
    assert.ok(!insertedTwice.isError, insertedTwice.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const licht = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Eins');
    const groups = licht.widgets.filter((w) => w.type === 'group');
    assert.equal(groups.length, 2);
    assert.notEqual(groups[0].options.defId, groups[1].options.defId);
    assert.notEqual(groups[0].id, groups[1].id);
});

const repointed = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Zwei', layout: 'Werkbank', datapoint: 'zigbee.0.temp' },
});
check('a preset can be re-pointed at another datapoint on insert', () => {
    assert.ok(!repointed.isError, repointed.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Zwei');
    const made = klima.widgets.filter((w) => w.type === 'group').pop();
    assert.equal(made.datapoint, 'zigbee.0.temp');
});

const unknownPreset = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'gibtsnicht', tab: 'Eins', layout: 'Werkbank' },
});
check('an unknown preset lists what is there', () => {
    assert.ok(unknownPreset.isError);
    assert.match(unknownPreset.content[0].text, /Meine Gruppe/);
});

const beforePresets = adapter.states['config.widget-presets'];
const savedSecond = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'quelle', name: 'Zweite' },
});
const restoredPresets = await client.callTool({
    name: 'aura_restore',
    arguments: { backup: savedSecond.content[0].text.match(/mcp-[\w.-]+\.json/)[0] },
});
check('a preset write is covered by the backup it announces', () => {
    // Presets are a fourth writable state; leaving them out of the snapshot would
    // make the "Sicherung: ..." line a promise the restore cannot keep.
    assert.ok(!restoredPresets.isError, restoredPresets.content[0].text);
    assert.equal(adapter.states['config.widget-presets'], beforePresets);
});

// ── Vorlagen löschen und umbenennen, und was bei falscher Art passiert ───────

const badKind = await client.callTool({ name: 'aura_delete', arguments: { kind: 'quatsch', target: 'x' } });
check('an unknown kind is named as such instead of being read as a tab', () => {
    // It used to fall through to the tab branch and answer "Kein Tab ... gefunden"
    // with a list of tabs — an answer to a question nobody asked.
    assert.ok(badKind.isError);
    assert.match(badKind.content[0].text, /"kind": "quatsch" gibt es hier nicht/);
    assert.match(badKind.content[0].text, /preset/);
});

await client.callTool({ name: 'aura_save_preset', arguments: { widgetId: 'quelle', name: 'Zum Umbenennen' } });
const renamedPreset = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'preset', target: 'Zum Umbenennen', name: 'Neuer Name' },
});
check('a preset can be renamed', () => {
    assert.ok(!renamedPreset.isError, renamedPreset.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.ok(presets.some((p) => p.name === 'Neuer Name'));
});

const deletedPreset = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'preset', target: 'Neuer Name' },
});
check('a preset can be deleted', () => {
    assert.ok(!deletedPreset.isError, deletedPreset.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.ok(!presets.some((p) => p.name === 'Neuer Name'));
});

const missingPreset = await client.callTool({ name: 'aura_delete', arguments: { kind: 'preset', target: 'nix' } });
check('deleting an unknown preset says what there is', () => {
    assert.ok(missingPreset.isError);
    assert.match(missingPreset.content[0].text, /Vorhanden:|keine Vorlagen/);
});

// ── Eine Gruppe über die Widget-Id ansprechen ────────────────────────────────

const byWidgetId = await client.callTool({ name: 'aura_group', arguments: { widgetId: 'quelle' } });
check('a group can be addressed by the id of its widget', () => {
    // The defId sits in options; the id a model has in hand comes from aura_tab.
    assert.ok(!byWidgetId.isError, byWidgetId.content[0].text);
    assert.match(byWidgetId.content[0].text, /Kind\(er\)/);
});

const noAddress = await client.callTool({ name: 'aura_group', arguments: {} });
check('neither defId nor widgetId names both parameters', () => {
    assert.ok(noAddress.isError);
    assert.match(noAddress.content[0].text, /"defId" oder "widgetId" angeben/);
});

await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Eins',
        layout: 'Werkbank',
        widget: JSON.stringify({
            id: 'schlicht',
            type: 'value',
            title: 'Schlicht',
            datapoint: 'zigbee.0.temp',
            gridPos: { x: 0, w: 6, h: 4 },
            options: {},
        }),
    },
});
const notAGroup = await client.callTool({ name: 'aura_group', arguments: { widgetId: 'schlicht' } });
check('a widget without children says so instead of reporting a missing defId', () => {
    assert.ok(notAGroup.isError);
    assert.match(notAGroup.content[0].text, /hat keine Gruppen-Kinder/);
});

// ── Ein einzelnes Kind anhängen ──────────────────────────────────────────────

const beforeChildren = JSON.parse(adapter.states['config.group-defs']).state.defs;
const beforeCount = Object.values(beforeChildren)[0].length;
const appended = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        widgetId: 'quelle',
        widget: JSON.stringify({
            id: 'kind-neu',
            type: 'value',
            title: 'Neu',
            datapoint: 'zigbee.0.temp',
            gridPos: { x: 0, y: 20, w: 6, h: 4 },
            options: {},
        }),
    },
});
check('a single child is appended without rewriting the whole group', () => {
    assert.ok(!appended.isError, appended.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    const children = Object.values(defs).find((list) => list.some((w) => w.id === 'kind-neu'));
    assert.ok(children, 'the new child must be in the group');
    assert.equal(children.length, beforeCount + 1, 'and the existing ones must still be there');
});

// ── Tabs, Bereiche und Layouts kopieren und verschieben ──────────────────────

await client.callTool({ name: 'aura_create_section', arguments: { name: 'Zweitbereich', layout: 'Werkbank' } });

const copiedTab = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'tab', target: 'Eins', fromLayout: 'Werkbank', toLayout: 'Werkbank', toSection: 'Zweitbereich' },
});
check('a copied tab brings its widgets and its own group children', () => {
    assert.ok(!copiedTab.isError, copiedTab.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    const zweit = wb.sections.find((s) => s.name === 'Zweitbereich');
    const copy = zweit.tabs.find((t) => t.name === 'Eins Kopie');
    assert.ok(copy, 'the copy must exist under its new name');
    const source = wb.sections[0].tabs.find((t) => t.name === 'Eins');
    assert.equal(copy.widgets.length, source.widgets.length);
    // Fresh ids, or the click-action picker would mark both twins.
    assert.ok(!copy.widgets.some((w) => source.widgets.some((s) => s.id === w.id)));
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    for (const w of copy.widgets.filter((x) => x.options && x.options.defId)) {
        assert.ok(defs[w.options.defId], `children of ${w.id} must exist`);
        assert.ok(!source.widgets.some((s) => s.options && s.options.defId === w.options.defId));
    }
});

const movedTab = await client.callTool({
    name: 'aura_copy_node',
    arguments: {
        kind: 'tab',
        target: 'Eins Kopie',
        mode: 'move',
        fromLayout: 'Werkbank',
        toLayout: 'Werkbank',
        toSection: 'Standard',
    },
});
check('a moved tab keeps its ids and leaves the source section', () => {
    assert.ok(!movedTab.isError, movedTab.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.ok(!wb.sections.find((s) => s.name === 'Zweitbereich').tabs.some((t) => t.name === 'Eins Kopie'));
    assert.ok(wb.sections.find((s) => s.name === 'Standard').tabs.some((t) => t.name === 'Eins Kopie'));
});

const emptied = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
check('a section emptied by a move gets a fresh tab', () => {
    // A section with no tabs renders nothing and cannot be filled through the UI.
    assert.equal(emptied.sections.find((s) => s.name === 'Zweitbereich').tabs.length, 1);
});

const sameSection = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'tab', target: 'Eins', fromLayout: 'Werkbank', toLayout: 'Werkbank', toSection: 'Standard' },
});
check('a tab can be duplicated where it already is', () => {
    // "Duplicate this tab" is the commonest copy wish; only a MOVE to the place
    // it already occupies is pointless.
    assert.ok(!sameSection.isError, sameSection.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    const std = wb.sections.find((s) => s.name === 'Standard');
    assert.ok(std.tabs.some((t) => t.name === 'Eins Kopie'));
});

const moveToItself = await client.callTool({
    name: 'aura_copy_node',
    arguments: {
        kind: 'tab',
        target: 'Eins',
        mode: 'move',
        fromLayout: 'Werkbank',
        toLayout: 'Werkbank',
        toSection: 'Standard',
    },
});
check('moving it there is still refused', () => {
    assert.ok(moveToItself.isError);
    assert.match(moveToItself.content[0].text, /liegt bereits/);
});

const copiedLayout = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'layout', target: 'Werkbank', name: 'Werkbank Zwilling' },
});
check('a whole layout can be copied', () => {
    assert.ok(!copiedLayout.isError, copiedLayout.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const twin = layouts.find((l) => l.name === 'Werkbank Zwilling');
    const source = layouts.find((l) => l.name === 'Werkbank');
    assert.ok(twin);
    assert.equal(twin.sections.length, source.sections.length);
    assert.notEqual(twin.slug, source.slug);
});

const movedLayout = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'layout', target: 'Werkbank', mode: 'move' },
});
check('moving a layout is refused with the tool that does mean something', () => {
    assert.ok(movedLayout.isError);
    assert.match(movedLayout.content[0].text, /aura_reorder/);
});

// ── Suchen ───────────────────────────────────────────────────────────────────

const foundByDp = await client.callTool({ name: 'aura_find', arguments: { datapoint: 'zigbee.0.temp' } });
check('aura_find reports where a datapoint is used, options included', () => {
    assert.ok(!foundByDp.isError, foundByDp.content[0].text);
    assert.match(foundByDp.content[0].text, /Treffer/);
    assert.match(foundByDp.content[0].text, /kind-neu/, 'group children must be searched too');
});

const foundNothing = await client.callTool({ name: 'aura_find', arguments: { datapoint: 'gibt.es.nicht' } });
check('a search without hits says so plainly', () => {
    assert.match(foundNothing.content[0].text, /Keine Treffer/);
});

const noNeedle = await client.callTool({ name: 'aura_find', arguments: {} });
check('a search without a criterion is refused rather than dumping everything', () => {
    assert.ok(noNeedle.isError);
    assert.match(noNeedle.content[0].text, /Mindestens eines/);
});

// ── Popups sind kein Sonderfall mehr ─────────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: { views: [{ id: 'v-test', name: 'Detailfenster', widgets: [{ ...OK_SWITCH, id: 'pw-1' }] }] },
});

const popupPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'pw-1', patch: JSON.stringify({ title: 'Umbenannt' }) },
});
check('a widget inside a popup can be changed in place', () => {
    // It used to mean replacing the whole view with aura_write_popup.
    assert.ok(!popupPatched.isError, popupPatched.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.find((v) => v.id === 'v-test').widgets[0].title, 'Umbenannt');
});

const popupAppended = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Detailfenster',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'pw-2', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('a popup takes a new widget wherever a tab would', () => {
    assert.ok(!popupAppended.isError, popupAppended.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    assert.deepEqual(
        view.widgets.map((w) => w.id),
        ['pw-1', 'pw-2'],
    );
});

const popupRefused = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Detailfenster',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'pw-3', datapoint: 'gibt.es.nicht', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('and is refused on the same grounds, in its own words', () => {
    assert.ok(popupRefused.isError);
    assert.match(popupRefused.content[0].text, /das Popup wäre fehlerhaft/);
});

const copiedToPopup = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Detailfenster' },
});
check('a group widget can be copied into a popup, children and all', () => {
    assert.ok(!copiedToPopup.isError, copiedToPopup.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    const copy = view.widgets.find((w) => w.type === 'group');
    assert.ok(copy, 'the copy must be in the popup');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[copy.options.defId], 'with children of its own');
});

const deletedInPopup = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'widget', target: 'pw-2' },
});
check('a single popup widget can be deleted', () => {
    assert.ok(!deletedInPopup.isError, deletedInPopup.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    assert.ok(!view.widgets.some((w) => w.id === 'pw-2'));
});

// ── replace ohne mitgeschickte id ────────────────────────────────────────────

const replacedWhole = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        widgetId: 'pw-1',
        replace: true,
        patch: JSON.stringify({
            type: 'switch',
            title: 'Ganz neu',
            datapoint: OK_SWITCH.datapoint,
            gridPos: { x: 0, y: 0, w: 8, h: 4 },
            options: {},
        }),
    },
});
check('replace keeps the id when the patch leaves it out', () => {
    // It used to answer 'Die id darf sich nicht aendern ("pw-1" -> "undefined")'
    // without saying that the id had to be carried along.
    assert.ok(!replacedWhole.isError, replacedWhole.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    const w = view.widgets.find((x) => x.id === 'pw-1');
    assert.equal(w.title, 'Ganz neu');
    assert.equal(w.options.showTitle, undefined, 'replace must not keep the old options');
});

// ── Verwaiste Gruppen-Definitionen ───────────────────────────────────────────

const orphanTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: orphanTab.id,
        widget: JSON.stringify({
            id: 'g-weg',
            type: 'group',
            title: 'Geht weg',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'd-weg' },
        }),
        groupDefs: JSON.stringify({ 'd-weg': [{ ...OK_SWITCH, id: 'weg-kind' }] }),
    },
});
check('the group definition is there while its widget is', () => {
    assert.ok(JSON.parse(adapter.states['config.group-defs']).state.defs['d-weg']);
});

const droppedWith = await client.callTool({ name: 'aura_delete', arguments: { kind: 'widget', target: 'g-weg' } });
check('deleting a group widget takes its children with it', () => {
    assert.ok(!droppedWith.isError, droppedWith.content[0].text);
    assert.ok(!JSON.parse(adapter.states['config.group-defs']).state.defs['d-weg']);
    assert.match(droppedWith.content[0].text, /verwaiste Gruppen-Definition/);
});

check('a definition still in use is never collected', () => {
    // The prune runs after every delete; a def a popup or another tab still
    // references must survive it.
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const used = views.find((v) => v.id === 'v-test').widgets.find((w) => w.type === 'group');
    assert.ok(defs[used.options.defId], 'the popup copy keeps its children');
});

// ── Was die Antworten kosten ─────────────────────────────────────────────────

const allTypes = await client.callTool({ name: 'aura_widget_types', arguments: {} });
const oneGroup = await client.callTool({ name: 'aura_widget_types', arguments: { group: 'control' } });
check('the type index can be narrowed to one category', () => {
    assert.ok(oneGroup.content[0].text.length < allTypes.content[0].text.length / 1.5);
    assert.match(oneGroup.content[0].text, /## Steuerung/);
    assert.ok(!/## Layout/.test(oneGroup.content[0].text));
});

const unknownGroup = await client.callTool({ name: 'aura_widget_types', arguments: { group: 'quatsch' } });
check('an unknown category lists the real ones', () => {
    assert.match(unknownGroup.content[0].text, /control \(Steuerung/);
});

const longSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['switch', 'thermostat'] },
});
const briefSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['switch', 'thermostat'], brief: true },
});
check('brief=true drops the prose but keeps names and types', () => {
    const b = briefSchema.content[0].text;
    assert.ok(
        b.length < longSchema.content[0].text.length * 0.7,
        `${b.length} vs ${longSchema.content[0].text.length}`,
    );
    assert.match(b, /- controlMode: /);
    assert.match(b, /WidgetCondition = \{/, 'the referenced types must still be defined');
    assert.ok(!/Vor dem Schalten eine Rückfrage/.test(b), 'descriptions are what goes');
});

// ── Zwei Schreibvorgänge gleichzeitig ────────────────────────────────────────

{
    // The suite's double answers in the same microtask, which hides the race
    // entirely. Real ioBroker states do not, so this one takes its time.
    const slow = makeAdapter();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const inner = { get: slow.getStateAsync, set: slow.setStateAsync };
    slow.getStateAsync = async (id) => {
        await wait(3);
        return inner.get(id);
    };
    slow.setStateAsync = async (id, v) => {
        await wait(3);
        return inner.set(id, v);
    };
    const raceServer = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter: slow, token: TOKEN, mode: 'delete', version: '1' }).catch(() => {});
    });
    await new Promise((r) => raceServer.listen(0, '127.0.0.1', r));
    const raceClient = new Client({ name: 'race', version: '1' }, { capabilities: {} });
    await raceClient.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${raceServer.address().port}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
    );
    const add = (id) =>
        raceClient.callTool({
            name: 'aura_add_widget',
            arguments: {
                tab: 'Klima',
                widget: JSON.stringify({ ...OK_SWITCH, id, gridPos: { x: 0, w: 8, h: 4 } }),
            },
        });
    const parallel = await Promise.all([add('par-a'), add('par-b'), add('par-c')]);

    check('three parallel writes all arrive', () => {
        // Unqueued they read the same dashboard, the last write wins, and every
        // answer still reports success: the assistant is told it added three
        // widgets and added one.
        assert.ok(
            parallel.every((r) => !r.isError),
            parallel.map((r) => r.content[0].text).join(' | '),
        );
        const tab = allTabs(JSON.parse(slow.states['config.dashboard']).state.layouts).find((t) => t.name === 'Klima');
        const ids = tab.widgets.map((w) => w.id);
        for (const id of ['par-a', 'par-b', 'par-c']) {
            assert.ok(ids.includes(id), `${id} fehlt — ${ids.join(', ')}`);
        }
    });

    const reads = await Promise.all([
        raceClient.callTool({ name: 'aura_dashboard', arguments: {} }),
        raceClient.callTool({ name: 'aura_widget_types', arguments: { group: 'layout' } }),
    ]);
    check('reads are not held up by the write queue', () => {
        assert.ok(reads.every((r) => !r.isError));
    });
    await raceClient.close();
    raceServer.close();
}

// ── Mehrdeutigkeit statt stiller Treffer ─────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: { views: [{ id: 'v-amb', name: 'Zwilling', widgets: [{ ...OK_SWITCH, id: 'zwilling-id' }] }] },
});
const hostTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: hostTab.id,
        widget: JSON.stringify({ ...OK_SWITCH, id: 'zwilling-id', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});

const ambiguousId = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'zwilling-id', patch: JSON.stringify({ title: 'X' }) },
});
check('one id in two places is refused, with both places named', () => {
    // Ids are meant to be unique but are not guaranteed to be — the editor has a
    // deduplicator for the twins copying used to produce. First-match-wins would
    // edit whichever the search happened to reach first.
    assert.ok(ambiguousId.isError);
    assert.match(ambiguousId.content[0].text, /gibt es mehrfach/);
    assert.match(ambiguousId.content[0].text, /Popup „Zwilling“/);
});

const twinTab = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Zwilling', layout: 'Werkbank', section: 'Standard' },
});
assert.ok(!twinTab.isError, twinTab.content[0].text);
const ambiguousName = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Zwilling', widget: JSON.stringify({ ...OK_SWITCH, id: 'egal', gridPos: { x: 0, w: 8, h: 4 } }) },
});
check('a name that is both a tab and a popup asks which one', () => {
    assert.ok(ambiguousName.isError);
    assert.match(ambiguousName.content[0].text, /als Tab .* und als Popup/);
    assert.match(ambiguousName.content[0].text, /Die Id angeben/);
});

const byPopupId = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'v-amb',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'per-id', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('and the id settles it', () => {
    assert.ok(!byPopupId.isError, byPopupId.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-amb');
    assert.ok(view.widgets.some((w) => w.id === 'per-id'));
});

// ── Vorlagen aus Popup und Gruppe ────────────────────────────────────────────

const presetFromPopup = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'per-id', name: 'Aus dem Popup' },
});
check('a widget in a popup can be saved as a template', () => {
    // aura_save_preset only ever looked in tabs.
    assert.ok(!presetFromPopup.isError, presetFromPopup.content[0].text);
});

const intoGroup = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Aus dem Popup', widgetId: 'quelle' },
});
check('a template can be inserted into a group', () => {
    assert.ok(!intoGroup.isError, intoGroup.content[0].text);
    assert.match(intoGroup.content[0].text, /Gruppe /);
});

// ── Popup-Ansichten kopieren, Namen eindeutig halten ─────────────────────────

const copiedView = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'popup', target: 'Zwilling', name: 'Zwilling Zwei' },
});
check('a popup view can be copied, children and all', () => {
    assert.ok(!copiedView.isError, copiedView.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const copy = views.find((v) => v.name === 'Zwilling Zwei');
    assert.ok(copy, 'the copy must exist');
    const source = views.find((v) => v.id === 'v-amb');
    assert.equal(copy.widgets.length, source.widgets.length);
    assert.ok(!copy.widgets.some((w) => source.widgets.some((s) => s.id === w.id)), 'fresh ids');
});

const movedView = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'popup', target: 'Zwilling', mode: 'move' },
});
check('moving a popup is refused — there is nothing to move it into', () => {
    assert.ok(movedView.isError);
    assert.match(movedView.content[0].text, /verschieben ergibt hier nichts/);
});

const duplicateName = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Zwilling', create: true, widgets: '[]' },
});
check('a second popup of the same name is refused', () => {
    // Two views of one name make every later lookup ambiguous, and the first
    // found would silently win from then on.
    assert.ok(duplicateName.isError);
    assert.match(duplicateName.content[0].text, /gibt schon eine Ansicht/);
});

// ── Token generation (the button in the adapter config) ──────────────────────

const { randomBytes } = await import('node:crypto');
const genToken = () => randomBytes(16).toString('hex');

check('the client block is valid JSON and carries the token', () => {
    const token = genToken();
    const parsed = JSON.parse(clientConfig({ port: 8095, interfaces: {} }, token));
    assert.equal(parsed.mcpServers.aura.type, 'http');
    assert.equal(parsed.mcpServers.aura.headers.Authorization, `Bearer ${token}`);
    assert.match(parsed.mcpServers.aura.url, /\/mcp$/);
});

check('a configured base URL wins and loses its trailing slash', () => {
    assert.equal(baseUrl({ customUrl: 'https://aura.example.org/', port: 8095 }), 'https://aura.example.org');
    assert.equal(baseUrl({ customUrl: 'https://aura.example.org//' }), 'https://aura.example.org');
});

check('without a base URL the host LAN address and the live protocol are used', () => {
    const ifaces = {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        eth0: [{ address: '192.168.188.140', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ port: 8095, interfaces: ifaces }), 'http://192.168.188.140:8095');
    assert.equal(baseUrl({ port: 8095, https: true, interfaces: ifaces }), 'https://192.168.188.140:8095');
});

check('an explicit host address wins over the interface list', () => {
    // A machine with VMware has 192.168.171.1 (host-only) AND the real LAN address;
    // both are private, so the interface list alone cannot tell them apart.
    const ifaces = {
        vmnet1: [{ address: '192.168.171.1', family: 'IPv4', internal: false }],
        wlan: [{ address: '192.168.188.235', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ interfaces: ifaces }), 'http://192.168.171.1:8095');
    assert.equal(baseUrl({ interfaces: ifaces, hostIp: '192.168.188.235' }), 'http://192.168.188.235:8095');
});

check('a LAN address is preferred over a VPN or container interface', () => {
    // Docker's bridge comes first alphabetically and would otherwise win.
    const ifaces = {
        br0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
        eth0: [{ address: '192.168.188.140', family: 'IPv4', internal: false }],
        tun0: [{ address: '100.64.0.3', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ interfaces: ifaces }), 'http://172.17.0.1:8095');
    const noPrivate = { tun0: [{ address: '100.64.0.3', family: 'IPv4', internal: false }] };
    assert.equal(baseUrl({ interfaces: noPrivate }), 'http://100.64.0.3:8095');
});

check('numeric IPv4 family and IPv6 are handled', () => {
    const ifaces = {
        eth0: [
            { address: 'fe80::1', family: 'IPv6', internal: false },
            { address: '10.0.0.5', family: 4, internal: false },
        ],
    };
    assert.deepEqual(hostAddresses(ifaces), ['10.0.0.5']);
});

check('with no usable address a visible placeholder is left in', () => {
    assert.equal(
        baseUrl({ interfaces: { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] } }),
        'http://<ioBroker-IP>:8095',
    );
});

const routed = await outboundAddress();
check('the routing table yields a usable address on a networked host', () => {
    // No packet is sent; connect() only makes the kernel pick a source address.
    // A host with no route at all legitimately answers null — hence the fallback.
    assert.ok(routed === null || /^\d+\.\d+\.\d+\.\d+$/.test(routed), `unexpected: ${routed}`);
    if (routed) {
        assert.ok(!routed.startsWith('127.'), 'the loopback address would be useless in the client block');
    }
});

check('resolveBaseUrl still honours a configured base URL without asking the network', async () => {
    assert.equal(await resolveBaseUrl({ customUrl: 'https://aura.example.org/' }), 'https://aura.example.org');
});

check('the stored block loses its token, and says where to get it', () => {
    const full = clientConfig({ customUrl: 'http://192.168.188.140:8095' }, 'abcdef0123456789abcdef0123456789');
    const masked = maskClientConfig(full);
    assert.ok(!masked.includes('abcdef0123456789abcdef0123456789'), 'the token must be gone');
    assert.ok(masked.includes(TOKEN_PLACEHOLDER), 'the placeholder must point at the field above');
    // Still pasteable: the URL is the part that is tedious to work out by hand.
    assert.equal(JSON.parse(masked).mcpServers.aura.url, 'http://192.168.188.140:8095/mcp');
});

check('masking is idempotent, so it cannot restart the adapter in a loop', () => {
    const masked = maskClientConfig(clientConfig({ customUrl: 'http://x:1' }, 'tok'));
    // null means "nothing to do" — the caller skips the write, so no object change.
    assert.equal(maskClientConfig(masked), null);
    assert.equal(maskClientConfig(''), null);
    assert.equal(maskClientConfig(undefined), null);
});

check('a generated token is 32 hex chars and never repeats', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const t = genToken();
        assert.match(t, /^[0-9a-f]{32}$/, `unexpected shape: ${t}`);
        assert.ok(!seen.has(t), 'a repeat means the generator is not random');
        seen.add(t);
    }
});

const fresh = genToken();
const askWith = async (token) => {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: fresh, version: '1' }).catch(() => {});
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    s.close();
    return r.status;
};
const okStatus = await askWith(fresh);
// One character off, and same length — the comparison must not shortcut on it.
const nearMiss = await askWith(fresh.slice(0, -1) + (fresh.endsWith('a') ? 'b' : 'a'));
const truncated = await askWith(fresh.slice(0, -1));
check('a valid token is accepted, a near-miss and a truncation are not', () => {
    assert.equal(okStatus, 200);
    assert.equal(nearMiss, 401);
    assert.equal(truncated, 401);
});

await client.close();
server.close();
console.log(`\nmcp: ${checks} checks passed\n`);
