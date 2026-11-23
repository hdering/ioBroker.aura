// The local IPC endpoint between Aura's daemon and the web adapter extension
// (lib/ipcEndpoint.js, #997) and the TCP fallback of the extension.
//
//   node tools/tests/web-extension-ipc.mjs
//
// The daemon side is the real Aura._startIpcServer (a Unix socket, on Windows a
// named pipe), the extension is the real lib/webExtension.js inside an express
// app standing in for the web adapter, and a stub HTTP server plays Aura's TCP
// port. Checked: the path derivation, requests and WebSockets taking the local
// socket, the same request (body included) repeated over TCP when the socket is
// gone, the socket picked up again once it is back, multihost staying on TCP,
// and the socket file removed again on close.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import net from 'node:net';

const require = createRequire(import.meta.url);
const express = require('express');
const bodyParser = require('body-parser');

// A data directory of our own - stubbed into @iobroker/adapter-core before main.js
// and lib/ipcEndpoint.js ask it for one.
const dataRoot = mkdtempSync(join(tmpdir(), 'aura-ipc-'));
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
        Adapter: class {
            constructor(options) {
                this.name = options?.name;
                this.namespace = 'aura.0';
                this.log = { info() {}, warn() {}, error() {}, debug() {} };
            }
            on() {}
        },
        getAbsoluteDefaultDataDir: () => dataRoot,
    },
};
const { Aura } = require(join(process.cwd(), 'main.js'));
const { ipcPath, removeStaleSocket, isPipe, UNIX_PATH_MAX } = require(join(process.cwd(), 'lib/ipcEndpoint.js'));
const WebExtension = require(join(process.cwd(), 'lib/webExtension.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Path derivation ──────────────────────────────────────────────────────
{
    const win = ipcPath('aura.0', 'C:\\ioBroker\\iobroker-data', 'win32');
    check('Windows: a named pipe', /^\\\\\.\\pipe\\iobroker-[0-9a-f]{8}-aura\.0$/.test(win), win);
    eq(
        'Windows: the drive letter case does not matter',
        ipcPath('aura.0', 'c:\\iobroker\\IOBROKER-DATA', 'win32'),
        win,
    );
    check(
        'Windows: another installation, another pipe',
        ipcPath('aura.0', 'D:\\other\\iobroker-data', 'win32') !== win,
    );
    check('Windows: another instance, another pipe', ipcPath('aura.1', 'C:\\ioBroker\\iobroker-data', 'win32') !== win);
    eq(
        'Linux: inside the instance data dir',
        ipcPath('aura.0', '/opt/iobroker/iobroker-data', 'linux'),
        '/opt/iobroker/iobroker-data/aura.0/aura.sock',
    );
    const long = `/${'x'.repeat(120)}/iobroker-data`;
    const short = ipcPath('aura.0', long, 'linux', '/tmp');
    check(
        'Linux: an over-long path moves to the temp dir',
        /^\/tmp\/iobroker-[0-9a-f]{8}-aura\.0\.sock$/.test(short),
        short,
    );
    check('… and fits a Unix socket', Buffer.byteLength(short) <= UNIX_PATH_MAX);
    eq('no data directory, no endpoint', ipcPath('aura.0', null, 'linux'), null);
    eq('a broken namespace, no endpoint', ipcPath('../x', '/d', 'linux'), null);
    eq('isPipe', [isPipe(win), isPipe('/a/aura.sock'), isPipe(null)], [true, false, false]);
}

// ── 2. Stale socket clean-up (Unix only - pipes vanish with their process) ──
if (process.platform !== 'win32') {
    const plain = join(dataRoot, 'not-a-socket');
    writeFileSync(plain, 'x');
    removeStaleSocket(plain);
    check('a plain file with the name is never removed', existsSync(plain));
    // A crash leaves the socket file behind: a child that listens and is killed.
    const stale = join(dataRoot, 'stale.sock');
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [
        '-e',
        `require('net').createServer().listen(${JSON.stringify(stale)}, () => console.log('up'))`,
    ]);
    await new Promise((r) => child.stdout.once('data', r));
    child.kill('SIGKILL');
    await new Promise((r) => child.once('exit', r));
    check('a killed process leaves its socket file', existsSync(stale));
    const blocked = net.createServer();
    const err = await new Promise((r) => {
        blocked.once('error', (e) => r(e.code));
        blocked.listen(stale, () => r(null));
    });
    eq('… which blocks a new listen', err, 'EADDRINUSE');
    blocked.close();
    removeStaleSocket(stale);
    check('removeStaleSocket clears it', !existsSync(stale));
}

// ── Aura: the TCP stub and the real IPC server ──────────────────────────────
const seen = [];
const handler = (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const via = req.socket.remotePort === undefined ? 'ipc' : 'tcp';
        const entry = { via, url: req.url, base: req.headers['x-aura-base'], body: Buffer.concat(chunks).toString() };
        seen.push(entry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
    });
};
const onUpgrade = (req, socket) => {
    const via = socket.remotePort === undefined ? 'ipc' : 'tcp';
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(`${via}:${d}`));
    socket.on('end', () => socket.destroy());
};
const tcp = http.createServer(handler);
tcp.on('upgrade', onUpgrade);
const tcpPort = await new Promise((r) => tcp.listen(0, '127.0.0.1', () => r(tcp.address().port)));

const daemonLogs = [];
const daemon = {
    namespace: 'aura.7',
    log: {
        info: (m) => daemonLogs.push(m),
        warn: (m) => daemonLogs.push(m),
        error: (m) => daemonLogs.push(m),
        debug() {},
    },
};
const startDaemon = async () => {
    Aura.prototype._startIpcServer.call(daemon, handler, onUpgrade);
    await new Promise((r) => (daemon._ipcServer.listening ? r() : daemon._ipcServer.once('listening', r)));
    // A pipe reports `listening` at once, its listen callback (the log line) follows a tick later.
    await wait(20);
};
// The extension's agent keeps connections alive; a stopping process drops them too.
const stopDaemon = () =>
    new Promise((r) => {
        daemon._ipcServer.close(() => r());
        daemon._ipcServer.closeAllConnections();
    });
await startDaemon();
const where = ipcPath('aura.7', dataRoot);
check(
    'the daemon listens on the derived path',
    daemonLogs.some((m) => m.includes(where)),
    daemonLogs.join(' | '),
);
if (!isPipe(where)) {
    eq('the socket file is only for the ioBroker user', (statSync(where).mode & 0o777).toString(8), '600');
}

// ── The web adapter with the extension ──────────────────────────────────────
const app = express();
app.use(bodyParser.json());
const web = http.createServer(app);
web.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 418 Web\r\n\r\n'));
const extLogs = [];
const fakeAdapter = (host) => ({
    host,
    log: {
        info: (m) => extLogs.push(m),
        warn: (m) => extLogs.push(m),
        error: (m) => extLogs.push(m),
        debug: (m) => extLogs.push(m),
    },
});
const ext = new WebExtension(
    web,
    { secure: false },
    fakeAdapter('host-a'),
    { _id: 'system.adapter.aura.7', common: { host: 'host-a' }, native: { port: tcpPort } },
    app,
);
const webPort = await new Promise((r) => web.listen(0, '127.0.0.1', () => r(web.address().port)));

function request(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
        const headers = body ? { 'Content-Type': 'application/json' } : {};
        const req = http.request({ host: '127.0.0.1', port: webPort, path, method, headers, agent: false }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString();
                let json = null;
                try {
                    json = JSON.parse(text);
                } catch {
                    /* the 502 page */
                }
                resolve({ status: res.statusCode, json, text });
            });
        });
        req.on('error', reject);
        req.end(body);
    });
}
function upgrade(path) {
    return new Promise((resolve) => {
        const sock = net.connect(webPort, '127.0.0.1', () => {
            sock.write(
                `GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
                    'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
            );
        });
        let buf = '';
        let pinged = false;
        sock.on('data', (d) => {
            buf += d.toString();
            if (buf.includes('101 Switching') && !pinged) {
                pinged = true;
                sock.write('ping');
            }
            if (/(ipc|tcp):ping/.test(buf) || (!buf.startsWith('HTTP/1.1 101') && buf.includes('\r\n\r\n'))) {
                sock.destroy();
                resolve(buf);
            }
        });
        sock.on('close', () => resolve(buf));
        sock.on('error', () => resolve(buf));
        setTimeout(() => {
            sock.destroy();
            resolve(buf);
        }, 3000);
    });
}
const viaOf = (buf) => (/(ipc|tcp):ping/.exec(buf) || [])[1] || null;

// ── 3. The local socket is preferred ────────────────────────────────────────
{
    eq('the extension derives the same path', ext.ipcPath, where);
    const r = await request('/aura/fs/roots?x=1');
    eq('GET goes over the local socket', r.json?.via, 'ipc');
    eq('… without the prefix', r.json?.url, '/fs/roots?x=1');
    eq('… with X-Aura-Base', r.json?.base, '/aura/');
    const p = await request('/aura/api/aura/login', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    eq('POST with a parsed body over the local socket', [p.json?.via, p.json?.body], ['ipc', '{"a":1}']);
    eq('WebSocket over the local socket', viaOf(await upgrade('/aura/proxyws?url=ws://x')), 'ipc');
    check(
        'the switch to the socket is logged',
        extLogs.some((m) => m.includes('forwarding over the local socket')),
    );
}

// ── 4. Socket gone while the extension still trusts it → TCP ────────────────
{
    await stopDaemon();
    if (!isPipe(where)) {
        check('closing the daemon removes the socket file', !existsSync(where));
    }
    eq('the extension still has the socket as fine', ext.ipcState?.ok, true);
    const p = await request('/aura/api/aura/login', { method: 'POST', body: JSON.stringify({ b: 2 }) });
    eq(
        'the same POST is repeated over TCP, body intact',
        [p.status, p.json?.via, p.json?.body],
        [200, 'tcp', '{"b":2}'],
    );
    eq('the socket is now marked as missing', ext.ipcState?.ok, false);
    eq('GET meanwhile goes straight to TCP', (await request('/aura/x')).json?.via, 'tcp');
    ext.ipcState = { ok: true, until: Date.now() + 60000 };
    eq('a WebSocket is handed over to TCP', viaOf(await upgrade('/aura/proxyws?url=ws://x')), 'tcp');
    check(
        'the fallback is logged',
        extLogs.some((m) => m.includes('not available')),
    );
}

// ── 5. Aura back → the socket is picked up again ────────────────────────────
{
    await startDaemon();
    eq('within the retry period still TCP', (await request('/aura/x')).json?.via, 'tcp');
    ext.ipcState.until = 0;
    eq('after it the socket again', (await request('/aura/x')).json?.via, 'ipc');
}

// ── 6. No local socket at all ───────────────────────────────────────────────
{
    const app2 = express();
    const web2 = http.createServer(app2);
    const multi = new WebExtension(
        web2,
        { secure: false },
        fakeAdapter('host-b'),
        { _id: 'system.adapter.aura.7', common: { host: 'host-a' }, native: { port: tcpPort } },
        app2,
    );
    eq('Aura on another host: no local socket', multi.ipcPath, null);
    const old = new WebExtension(
        web2,
        { secure: false },
        fakeAdapter('host-a'),
        { common: { host: 'host-a' }, native: { port: tcpPort } },
        app2,
    );
    eq('no instance id: no local socket', old.ipcPath, null);
    eq('route() then is TCP', await old.route(), null);
}

// ── 7. Two Aura instances on one web instance (#997) ────────────────────────
// Both would mount /aura/: HTTP went to the first, upgrades to the last. The
// second one stays off and says so in the web log.
{
    const app3 = express();
    const web3 = http.createServer(app3);
    const emitBefore = web3.emit;
    const first = new WebExtension(
        web3,
        { secure: false },
        fakeAdapter('host-a'),
        { _id: 'system.adapter.aura.7', common: { host: 'host-a' }, native: { port: tcpPort } },
        app3,
    );
    const emitFirst = web3.emit;
    const layers = app3._router?.stack?.length ?? app3.router?.stack?.length;
    extLogs.length = 0;
    const second = new WebExtension(
        web3,
        { secure: false },
        fakeAdapter('host-a'),
        { _id: 'system.adapter.aura.8', common: { host: 'host-a' }, native: { port: tcpPort, mcpEnabled: true } },
        app3,
    );
    eq('first one takes /aura/', emitFirst !== emitBefore && first.active, true);
    eq('second one stays off', second.shadowedBy, 'aura.7');
    eq('…takes no upgrades', web3.emit === emitFirst && !second.active, true);
    eq('…mounts no route', app3._router?.stack?.length ?? app3.router?.stack?.length, layers);
    eq('…offers no MCP route', second.publicRoutes().length, 0);
    eq(
        '…and says so in the web log',
        extLogs.some((m) => m.includes('aura.8 stays off') && m.includes('aura.7')),
        true,
    );
    second.unload();
    first.unload();
    const again = new WebExtension(
        web3,
        { secure: false },
        fakeAdapter('host-a'),
        { _id: 'system.adapter.aura.8', common: { host: 'host-a' }, native: { port: tcpPort } },
        app3,
    );
    eq('after the first one unloaded the other one takes it', again.shadowedBy === '' && again.active, true);
    const reload = new WebExtension(
        web3,
        { secure: false },
        fakeAdapter('host-a'),
        { _id: 'system.adapter.aura.8', common: { host: 'host-a' }, native: { port: tcpPort } },
        app3,
    );
    eq('a hot reload of the same instance takes over', reload.shadowedBy === '' && reload.active, true);
    reload.unload();
    again.unload();
}

ext.unload();
await stopDaemon();
web.close();
web.closeAllConnections?.();
tcp.close();
tcp.closeAllConnections?.();
try {
    rmSync(dataRoot, { recursive: true, force: true });
} catch {
    /* Windows may still hold it */
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
