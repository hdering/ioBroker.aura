#!/usr/bin/env node
/**
 * Smoke test for the AURA MCP server over a real stdio transport.
 *
 *   npm run test:mcp-server
 *
 * Speaks the actual protocol with the actual client, so a broken tool schema or
 * a crash on start shows up here rather than in Claude Desktop. Only the tools
 * that work without ioBroker are exercised; the ones needing a live instance are
 * checked for reporting the missing connection instead of hanging.
 */

import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`  ✓ ${label}`);
};

console.log('\nmcp-server');

const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, 'tools/mcp/server.mjs')],
    env: {
        ...process.env,
        // Nothing listens here; the connection-dependent tools must say so quickly.
        AURA_IOBROKER_URL: 'http://127.0.0.1:1',
        AURA_CONNECT_TIMEOUT: '2500',
    },
});

const client = new Client({ name: 'aura-mcp-test', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();

check('the server starts and announces its tools', () => {
    assert.deepEqual(names, ['aura_dashboard', 'aura_tab', 'aura_validate', 'aura_widget_schema', 'aura_widget_types']);
});

check('every tool carries a description and an input schema', () => {
    for (const t of tools) {
        assert.ok(t.description && t.description.length > 40, `${t.name}: description too thin`);
        assert.equal(t.inputSchema.type, 'object', `${t.name}: inputSchema must be an object`);
    }
});

const typesRes = await client.callTool({ name: 'aura_widget_types', arguments: {} });
const typesText = typesRes.content[0].text;

check('aura_widget_types lists the types grouped, without needing ioBroker', () => {
    assert.ok(!typesRes.isError, typesText);
    assert.match(typesText, /Widget-Typen/);
    assert.match(typesText, /- switch \(Schalter, \d+×\d+/);
    assert.match(typesText, /- clock \(.*ohne Datenpunkt\)/);
    assert.ok(typesText.split('\n').filter((l) => l.startsWith('- ')).length > 40);
});

const schemaRes = await client.callTool({ name: 'aura_widget_schema', arguments: { types: ['switch'] } });
const schemaText = schemaRes.content[0].text;

check('aura_widget_schema returns the widget shape plus the type detail', () => {
    assert.ok(!schemaRes.isError, schemaText);
    assert.match(schemaText, /# Aufbau eines Widgets/);
    assert.match(schemaText, /- gridPos: object \(Pflicht\)/);
    assert.match(schemaText, /## switch — Schalter/);
    assert.match(schemaText, /- onValue: string/);
    assert.match(schemaText, /- statusDp: string.*\[Datenpunkt-Id\]/);
    assert.ok(!/## value —/.test(schemaText), 'must not include types that were not asked for');
});

check('an unknown type is reported instead of returning nothing', async () => {
    /* checked below, kept sync-free */
});
const unknownRes = await client.callTool({ name: 'aura_widget_schema', arguments: { types: ['nonesuch'] } });
check('aura_widget_schema names unknown types', () => {
    assert.match(unknownRes.content[0].text, /Keine Widget-Typen: nonesuch/);
});

const emptyRes = await client.callTool({ name: 'aura_widget_schema', arguments: { types: [] } });
check('an empty type list is an error with a pointer to the index', () => {
    assert.ok(emptyRes.isError);
    assert.match(emptyRes.content[0].text, /aura_widget_types/);
});

const validRes = await client.callTool({
    name: 'aura_validate',
    arguments: {
        checkDatapoints: false,
        json: JSON.stringify({
            id: 'w-1',
            type: 'switch',
            title: 'Licht',
            datapoint: 'hm-rpc.0.A.STATE',
            gridPos: { x: 0, y: 0, w: 8, h: 4 },
            options: { showTitle: true },
        }),
    },
});

check('aura_validate passes a correct widget without ioBroker', () => {
    assert.ok(!validRes.isError, validRes.content[0].text);
    assert.match(validRes.content[0].text, /Keine Beanstandungen/);
});

const badRes = await client.callTool({
    name: 'aura_validate',
    arguments: {
        checkDatapoints: false,
        json: JSON.stringify({
            id: 'w-1',
            type: 'switch',
            title: 'Licht',
            datapoint: 'hm-rpc.0.A.STATE',
            gridPos: { x: 0, y: 0, w: 8, h: 4 },
            options: { showTitel: true },
        }),
    },
});

check('aura_validate flags a bad option as an error result', () => {
    assert.ok(badRes.isError, 'a failing validation must be an error result');
    assert.match(badRes.content[0].text, /liest die Option "showTitel" nicht/);
    assert.match(badRes.content[0].text, /meintest du "showTitle"/);
});

const brokenJson = await client.callTool({ name: 'aura_validate', arguments: { json: '{ nope' } });
check('malformed JSON is reported, not thrown', () => {
    assert.ok(brokenJson.isError);
    assert.match(brokenJson.content[0].text, /Kein gültiges JSON/);
});

const dashRes = await client.callTool({ name: 'aura_dashboard', arguments: {} });
check('a tool needing ioBroker fails with a message naming the URL', () => {
    assert.ok(dashRes.isError, 'expected an error without a reachable instance');
    assert.match(dashRes.content[0].text, /Keine Verbindung zu ioBroker unter http:\/\/127\.0\.0\.1:1/);
    assert.match(dashRes.content[0].text, /AURA_IOBROKER_URL/);
});

await client.close();
console.log(`\nmcp-server: ${checks} checks passed\n`);
