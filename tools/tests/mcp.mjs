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
const { designColumns, allTabs, findTab, collectDefIds, replaceTabWidgets } = require('../../lib/mcp/auraConfig.js');
const { handleMcpRequest } = require('../../lib/mcp/httpEndpoint.js');
const { baseUrl, clientConfig, hostAddresses } = require('../../lib/mcp/clientConfig.js');

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
    handleMcpRequest(req, res, { adapter, token: TOKEN, version: '9.9.9' }).catch((e) => {
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
check('all seven tools are announced with descriptions', () => {
    assert.deepEqual(tools.map((t) => t.name).sort(), [
        'aura_add_widget',
        'aura_dashboard',
        'aura_tab',
        'aura_validate',
        'aura_widget_schema',
        'aura_widget_types',
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
