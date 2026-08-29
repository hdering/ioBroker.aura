#!/usr/bin/env node
/**
 * Raw protocol test for the hand-written JSON-RPC layer.
 *
 *   npm run test:mcp-protocol
 *
 * mcp-server.mjs proves the server works with the real SDK client. This one
 * covers what a well-behaved client never does, and what therefore breaks
 * silently in a hand-rolled transport: a message split across two chunks, three
 * messages in one chunk, a malformed line, an unknown method, and a notification
 * that must NOT be answered — replying to notifications/initialized is enough to
 * make strict clients drop the connection.
 *
 * Talks to the server over a plain pipe, no SDK involved.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`  ✓ ${label}`);
};

console.log('\nmcp-protocol');

const child = spawn(process.execPath, [path.join(ROOT, 'tools/mcp/server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AURA_IOBROKER_URL: 'http://127.0.0.1:1', AURA_CONNECT_TIMEOUT: '2000' },
});

const messages = [];
const waiters = [];
let stdoutBuffer = '';
let stderrText = '';

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    let nl;
    while ((nl = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, nl).trim();
        stdoutBuffer = stdoutBuffer.slice(nl + 1);
        if (!line) {
            continue;
        }
        const msg = JSON.parse(line); // a non-JSON line here is itself the bug
        messages.push(msg);
        waiters.splice(0).forEach((w) => w());
    }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => {
    stderrText += c;
});

/** Wait until a message matching `pred` has arrived. */
function until(pred, label, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs);
        const attempt = () => {
            const hit = messages.find(pred);
            if (hit) {
                clearTimeout(timer);
                resolve(hit);
            } else {
                waiters.push(attempt);
            }
        };
        attempt();
    });
}

const write = (s) => child.stdin.write(s);
const rpc = (id, method, params) => `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;

// ── 1. A request split across two chunks ─────────────────────────────────────
const initLine = rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 't', version: '1' },
});
write(initLine.slice(0, 20));
await new Promise((r) => setTimeout(r, 60));
write(initLine.slice(20));

const init = await until((m) => m.id === 1, 'initialize');
check('a request split across two chunks is reassembled', () => {
    assert.equal(init.jsonrpc, '2.0');
    assert.ok(init.result, JSON.stringify(init));
});

check('the client protocol version is echoed when supported', () => {
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal(init.result.serverInfo.name, 'aura');
});

// ── 2. Notification + three requests in ONE chunk ────────────────────────────
write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n` +
        rpc(2, 'ping', {}) +
        rpc(3, 'tools/list', {}) +
        rpc(4, 'nonexistent/method', {}),
);

const listed = await until((m) => m.id === 3, 'tools/list');
check('several messages in one chunk are all handled', () => {
    assert.ok(
        messages.some((m) => m.id === 2 && m.result),
        'ping unanswered',
    );
    assert.equal(listed.result.tools.length, 5);
});

check('a notification is never answered', () => {
    assert.ok(
        !messages.some((m) => (m.id === undefined || m.id === null ? m.result !== undefined : false)),
        'a notification produced a result',
    );
});

const unknown = await until((m) => m.id === 4, 'unknown method');
check('an unknown method returns JSON-RPC -32601', () => {
    assert.equal(unknown.error.code, -32601);
    assert.match(unknown.error.message, /Unbekannte Methode/);
});

// ── 3. A malformed line must not kill the server ─────────────────────────────
write('das ist kein json\n');
const parseErr = await until((m) => m.error?.code === -32700, 'parse error');
check('a malformed line answers -32700 and the server stays up', () => {
    assert.equal(parseErr.id, null);
});

write(rpc(5, 'tools/call', { name: 'aura_widget_types', arguments: {} }));
const stillAlive = await until((m) => m.id === 5, 'call after parse error');
check('requests after a parse error are still served', () => {
    assert.ok(!stillAlive.result.isError);
    assert.match(stillAlive.result.content[0].text, /Widget-Typen/);
});

// ── 4. Tool errors are results, protocol errors are errors ───────────────────
write(rpc(6, 'tools/call', { name: 'gibtesnicht', arguments: {} }));
const badTool = await until((m) => m.id === 6, 'unknown tool');
check('an unknown TOOL is a JSON-RPC error, a failing tool is not', () => {
    assert.equal(badTool.error.code, -32601);
});

write(rpc(7, 'tools/call', { name: 'aura_validate', arguments: { json: '{ kaputt', checkDatapoints: false } }));
const toolFail = await until((m) => m.id === 7, 'failing tool');
check('a failing tool returns isError, not a JSON-RPC error', () => {
    assert.ok(toolFail.result, 'expected a result, got an error envelope');
    assert.equal(toolFail.result.isError, true);
    assert.match(toolFail.result.content[0].text, /Kein gültiges JSON/);
});

// ── 5. stdout stays protocol-only ────────────────────────────────────────────
check('nothing but JSON-RPC reached stdout', () => {
    assert.equal(stdoutBuffer.trim(), '', `unparsed remainder on stdout: ${stdoutBuffer}`);
    assert.ok(messages.length >= 7);
});

child.stdin.end();
child.kill();

// ── 6. The stdout guard actually redirects ───────────────────────────────────
// Deterministic, unlike waiting for a dependency to happen to log: run a
// console.log AFTER importing the guard and see which stream it lands on.
const guarded = spawnSync(
    process.execPath,
    [
        '--input-type=module',
        '-e',
        `import ${JSON.stringify(pathToFileURL(path.join(ROOT, 'tools/mcp/stdio-guard.mjs')).href)};` +
            `console.log('MARKER'); console.warn('WARNMARKER');`,
    ],
    { encoding: 'utf8' },
);

check('console.log inside the server goes to stderr, never to stdout', () => {
    assert.equal(guarded.stdout.trim(), '', `stdout must stay empty, got: ${guarded.stdout}`);
    assert.match(guarded.stderr, /MARKER/);
});

// ── 7. The shipped server stays dependency-light ─────────────────────────────
// This is the whole reason for the hand-written protocol layer: the MCP SDK would
// have pulled 95 packages into an adapter that never runs them. An accidental
// import would undo that silently, so the boundary is a test.
const IMPORT_SPEC = /import\s+(?:[^;']*?from\s+)?'([^']+)'/g;
const shipped = fs
    .readdirSync(path.join(ROOT, 'tools/mcp'))
    .filter((f) => f.endsWith('.mjs'))
    .flatMap((f) => [...fs.readFileSync(path.join(ROOT, 'tools/mcp', f), 'utf8').matchAll(IMPORT_SPEC)])
    .map((m) => m[1])
    .filter((spec) => !spec.startsWith('.') && !spec.startsWith('node:'));

check('the shipped MCP server depends on @iobroker/ws and nothing else', () => {
    assert.deepEqual([...new Set(shipped)].sort(), ['@iobroker/ws']);
});

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('the dependency is declared and the SDK stays out of the runtime', () => {
    assert.ok(pkg.dependencies['@iobroker/ws'], '@iobroker/ws must be a runtime dependency');
    assert.ok(!pkg.dependencies['@modelcontextprotocol/sdk'], 'the SDK must not be a runtime dependency');
    assert.ok(pkg.devDependencies['@modelcontextprotocol/sdk'], 'the SDK is needed for the client-side test');
    assert.ok(pkg.files.includes('tools/mcp/'), 'the server must ship with the adapter');
    assert.ok(pkg.files.includes('public/ai/'), 'the schema must ship with the adapter');
});

console.log(`\nmcp-protocol: ${checks} checks passed\n`);
