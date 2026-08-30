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
    collectDefIds,
    replaceTabWidgets,
} = require('../../lib/mcp/auraConfig.js');
const { handleMcpRequest } = require('../../lib/mcp/httpEndpoint.js');
const { LEVELS, levelIndex, toolsFor } = require('../../lib/mcp/tools.js');
const {
    baseUrl,
    clientConfig,
    hostAddresses,
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

check('gridPos must be whole, positive and inside the column bound', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 0, w: 8.5, h: 4 } }, schema), /ganze Zahl/));
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: -1, y: 0, w: 8, h: 4 } }, schema), /negativ/));
    const res = validateWidget({ ...OK_SWITCH, gridPos: { x: 40, y: 0, w: 12, h: 4 } }, schema, { columns: 48 });
    assert.ok(hasError(res, /52 überschreitet die 48 Spalten/));
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
check('all eighteen tools are announced with descriptions', () => {
    assert.deepEqual(tools.map((t) => t.name).sort(), [
        'aura_add_widget',
        'aura_create_layout',
        'aura_create_section',
        'aura_create_tab',
        'aura_dashboard',
        'aura_delete',
        'aura_group',
        'aura_popup',
        'aura_popups',
        'aura_rename',
        'aura_tab',
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
    assert.match(t, /Wohnzimmer \/ Start \/ Licht — 1 Widget/);
    assert.match(t, /Entworfen für 44 Spalten/);
    assert.match(t, /Zeilenhöhe 20 px/);
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
check('a widget that exists nowhere points at the defId route', () => {
    assert.ok(missingWidget.isError);
    assert.match(missingWidget.content[0].text, /defId der Gruppe mitgeben/);
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
