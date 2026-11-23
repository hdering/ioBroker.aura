// The old own port as a forward only (#997, step 10).
//
//   node tools/tests/port-redirect.mjs
//
// main.js's real startHttpServer with the adapter stubbed, own port off and
// "forward the old port" on: the old port answers a page load with the
// hand-over page and nothing else of Aura (vault, files, MCP, proxy); the
// ioBroker socket is still passed through. Then in chromium, firefox and webkit:
// a device with settings on the old origin opens it, lands on the new origin
// (same host, the web instance's port) under /aura/ with its route and query,
// and src-vis/utils/handoff.ts (bundled as it is) has taken over the device
// settings - only what was missing, never the connection URL, and not from a
// foreign page.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const require = createRequire(import.meta.url);
const dataRoot = fs.mkdtempSync(join(os.tmpdir(), 'aura-redirect-'));

let objects = {};
const logs = [];
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
        getAbsoluteDefaultDataDir: () => dataRoot,
        getAbsoluteInstanceDataDir: (a) => join(dataRoot, a.namespace),
        Adapter: class {
            constructor(options) {
                this.name = options?.name;
                this.namespace = 'aura.0';
                this.instance = 0;
                this.host = 'host-a';
                const push = (lvl) => (m) => logs.push(`${lvl}: ${m}`);
                this.log = { info: push('info'), warn: push('warn'), error: push('error'), debug() {} };
            }
            on() {}
            async setObjectNotExistsAsync() {}
            async extendObjectAsync() {}
            async setStateAsync() {}
            setState() {}
            async getStateAsync() {
                return null;
            }
            async getForeignObjectAsync(id) {
                return objects[id] ? { ...objects[id], _id: id } : null;
            }
            async getForeignObjectsAsync(pattern) {
                const re = new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`);
                return Object.fromEntries(
                    Object.entries(objects)
                        .filter(([id]) => re.test(id))
                        .map(([id, o]) => [id, { ...o, _id: id }]),
                );
            }
            setTimeout(fn, ms) {
                return setTimeout(fn, ms);
            }
            clearTimeout(t) {
                clearTimeout(t);
            }
            setInterval(fn, ms) {
                return setInterval(fn, ms);
            }
            clearInterval(t) {
                clearInterval(t);
            }
        },
    },
};
const main = require(join(process.cwd(), 'main.js'));
const portRedirect = require(join(process.cwd(), 'lib/portRedirect.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const freePort = () =>
    new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const p = s.address().port;
            s.close(() => resolve(p));
        });
    });
const get = (port, path, headers = {}) =>
    new Promise((resolve) => {
        http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () =>
                resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), body }),
            );
        }).on('error', (e) => resolve({ status: e.code, body: '' }));
    });
const upgrade = (port, path) =>
    new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1', () =>
            s.write(
                `GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
            ),
        );
        let got = '';
        s.on('data', (c) => (got += c));
        s.on('close', () => resolve(got));
        s.on('error', () => resolve(got));
        setTimeout(() => s.destroy(), 1500);
    });

// ── 0. both lists of keys are the same ───────────────────────────────────────
{
    const ts = fs.readFileSync(join(process.cwd(), 'src-vis/utils/handoff.ts'), 'utf8');
    const block = ts.match(/export const HANDOFF_KEYS = \[([\s\S]*?)\]/)?.[1] || '';
    const tsKeys = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    check(
        'the frontend takes over exactly the keys the old port hands over',
        JSON.stringify(tsKeys) === JSON.stringify(portRedirect.HANDOFF_KEYS),
        `${tsKeys} / ${portRedirect.HANDOFF_KEYS}`,
    );
    check(
        '…never the admin session or a cache',
        !portRedirect.HANDOFF_KEYS.some((k) => /auth|icons|superadmin/.test(k)),
    );
}

// ── the new origin: same host, the web instance's port, /aura/ ───────────────
const bundle = await build({
    entryPoints: [join(process.cwd(), 'src-vis/utils/handoff.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
});
const handoffJs = bundle.outputFiles[0].text;
const webPort = await freePort();
const web = http
    .createServer((req, res) => {
        if (req.url.startsWith('/aura/handoff.js')) {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            res.end(handoffJs);
            return;
        }
        if (req.url.startsWith('/aura/')) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<!doctype html><title>new</title><script src="/aura/handoff.js"></script>');
            return;
        }
        res.writeHead(404);
        res.end();
    })
    .listen(webPort, '127.0.0.1');
// a foreign page on another host name, linking to the new origin with a hand-over
const foreignPort = await freePort();
const foreign = http
    .createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><a id="go">go</a>');
    })
    .listen(foreignPort, '127.0.0.1');

const oldPort = await freePort();
objects = {
    'system.adapter.web.0': {
        type: 'instance',
        common: { host: 'host-a', enabled: true },
        native: { port: webPort, secure: false },
    },
};
const aura = main({});
aura.config = { bind: '127.0.0.1', port: oldPort, ownPort: false, portRedirect: true, webInstance: 'web.0' };
aura.resolveSocketBackend = async () => ({ found: false, host: '127.0.0.1', port: 9, mode: 'port', conflicts: [] });
aura._noteBackendResponse = () => {};
aura.runBackendCheck = async () => {};

try {
    await aura.startHttpServer();
    await new Promise((r) => setTimeout(r, 300));

    // ── 1. the old port only forwards ───────────────────────────────────────
    check('the old port listens', aura._httpServer?.listening === true && aura._portRedirect === true);
    check('…marked as without an own port (links, MCP block)', aura._noOwnPort === true);
    check(
        '…the log says it is only a transition',
        logs.some((l) => l.includes(`old port ${oldPort} only forwards`)),
    );
    const page = await get(oldPort, '/?client=kitchen', { Accept: 'text/html' });
    check(
        'a page load gets the hand-over page',
        page.status === 200 && page.body.includes('aura-handoff='),
        page.status,
    );
    check('…pointing at the web instance', page.body.includes(`"port":${webPort}`));
    const visits = logs.filter((l) => l.includes('still opened the old port')).length;
    await get(oldPort, '/', { Accept: 'text/html' });
    check(
        '…the log names the device once (not every load)',
        visits === 1 && logs.filter((l) => l.includes('still opened the old port')).length === 1,
    );
    // through a reverse proxy the forward's target (<host>:<web port>) is not reachable
    for (const [label, headers] of [
        ['Host without the old port (nginx, NPM)', { Host: 'aura.example.com' }],
        ['X-Forwarded-For with the direct Host', { Host: `127.0.0.1:${oldPort}`, 'X-Forwarded-For': '203.0.113.5' }],
    ]) {
        const r = await get(oldPort, '/', { Accept: 'text/html', ...headers });
        check(
            `proxied (${label}): no forward, the page says what to change`,
            r.status === 200 &&
                !r.body.includes('aura-handoff=') &&
                !r.body.includes('location.replace') &&
                r.body.includes('reverse proxy') &&
                r.body.includes(`:${webPort}`) &&
                r.body.includes('$request_uri'),
            r.body.slice(0, 200),
        );
    }
    const proxyWarns = logs.filter((l) => l.startsWith('warn:') && l.includes('through a reverse proxy'));
    await get(oldPort, '/', { Accept: 'text/html', Host: 'aura.example.com' });
    check(
        '…a warning in the log naming the host, once per host',
        proxyWarns.length === 2 &&
            proxyWarns[0].includes('aura.example.com') &&
            logs.filter((l) => l.includes('through a reverse proxy')).length === 2,
        JSON.stringify(proxyWarns),
    );
    check(
        'a router port forward (other external port) counts as proxied too',
        portRedirect.proxiedHost({ headers: { host: 'home.example.net:18095' } }, oldPort) ===
            'home.example.net:18095' &&
            portRedirect.proxiedHost({ headers: { host: `192.168.1.10:${oldPort}` } }, oldPort) === '',
    );
    for (const path of [
        '/api/aura/admin/status',
        '/fs/roots',
        '/proxy?url=http://127.0.0.1/',
        '/feed',
        '/assets/x.js',
    ]) {
        const r = await get(oldPort, path);
        check(`${path}: gone (410)`, r.status === 410, r.status);
    }
    const mcp = await get(oldPort, '/mcp');
    check(
        '/mcp: 410 with the new address as a JSON-RPC error',
        mcp.status === 410 && /moved to .*:\d+\/aura\/mcp/.test(JSON.parse(mcp.body).error.message),
        mcp.body,
    );
    const sock = await get(oldPort, '/socket.io/socket.io.js');
    check('the ioBroker socket is still passed through (not 410)', sock.status !== 410, sock.status);
    check('a proxy WebSocket is refused', (await upgrade(oldPort, '/proxyws?url=ws://127.0.0.1:9/')) === '');

    // ── 2. the hand-over in real browsers ───────────────────────────────────
    const oldOrigin = `http://127.0.0.1:${oldPort}`;
    const seed = {
        'aura-connection': JSON.stringify({
            state: { ioBrokerUrl: 'http://evil.example:8084', clientName: 'Kitchen', deviceToken: 'abcdef0123456789' },
            version: 0,
        }),
        'aura-admin-prefs': JSON.stringify({ state: { x: 1 } }),
        'aura-iframe-zoom': '{"a":1.5}',
        'aura-auth': '{"state":{"sessionActive":true}}',
        'aura-icons-v1': 'x'.repeat(1000),
        'aura-dp-picker-view': 'old',
    };
    for (const [name, type] of [
        ['chromium', chromium],
        ['firefox', firefox],
        ['webkit', webkit],
    ]) {
        const browser = await type.launch();
        try {
            const ctx = await browser.newContext();
            await ctx.addInitScript(
                ({ origin, items }) => {
                    if (location.origin === origin && !sessionStorage.getItem('seeded')) {
                        for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
                        sessionStorage.setItem('seeded', '1');
                    }
                },
                { origin: oldOrigin, items: seed },
            );
            const p = await ctx.newPage();
            // the new origin already knows one key: it must stay
            await p.goto(`http://127.0.0.1:${webPort}/aura/`);
            await p.evaluate(() => localStorage.setItem('aura-dp-picker-view', 'new'));
            await p.goto(`${oldOrigin}/?client=kitchen#/tab/lights`);
            await p.waitForURL(`http://127.0.0.1:${webPort}/aura/**`, { timeout: 10000 });
            await p.waitForFunction(() => !location.hash.startsWith('#aura-handoff='), null, { timeout: 5000 });
            const got = await p.evaluate(() => ({
                url: location.pathname + location.search + location.hash,
                conn: localStorage.getItem('aura-connection'),
                prefs: localStorage.getItem('aura-admin-prefs'),
                zoom: localStorage.getItem('aura-iframe-zoom'),
                auth: localStorage.getItem('aura-auth'),
                icons: localStorage.getItem('aura-icons-v1'),
                view: localStorage.getItem('aura-dp-picker-view'),
            }));
            const conn = JSON.parse(got.conn || '{}');
            check(
                `${name}: lands on /aura/ with query and route`,
                got.url === '/aura/?client=kitchen#/tab/lights',
                got.url,
            );
            check(
                `${name}: device settings taken over`,
                conn.state?.clientName === 'Kitchen' &&
                    got.prefs === seed['aura-admin-prefs'] &&
                    got.zoom === '{"a":1.5}',
                JSON.stringify(got),
            );
            check(`${name}: …never the connection URL`, conn.state && !('ioBrokerUrl' in conn.state), got.conn);
            check(`${name}: …nor the admin session or a cache`, got.auth === null && got.icons === null);
            check(`${name}: …and nothing already set here is overwritten`, got.view === 'new', got.view);

            // a foreign page linking to the new origin with a forged hand-over
            const forged = Buffer.from(
                JSON.stringify({ v: 1, from: oldOrigin, hash: '#/x', items: { 'aura-message-defaults': 'forged' } }),
            ).toString('base64url');
            const q = await ctx.newPage();
            await q.goto(`http://localhost:${foreignPort}/`);
            await q.evaluate((href) => {
                const a = document.getElementById('go');
                a.href = href;
                a.click();
            }, `http://127.0.0.1:${webPort}/aura/#aura-handoff=${forged}`);
            await q.waitForURL(`http://127.0.0.1:${webPort}/aura/**`, { timeout: 10000 });
            await q.waitForFunction(() => !location.hash.startsWith('#aura-handoff='), null, { timeout: 5000 });
            const forgedVal = await q.evaluate(() => localStorage.getItem('aura-message-defaults'));
            check(`${name}: a hand-over from a foreign page is ignored`, forgedVal === null, forgedVal);
        } finally {
            await browser.close();
        }
    }
} finally {
    await new Promise((r) => (aura._httpServer ? aura._httpServer.close(() => r()) : r()));
    aura._httpServer?.closeAllConnections?.();
    await new Promise((r) => (aura._ipcServer ? aura._ipcServer.close(() => r()) : r()));
    web.close();
    foreign.close();
    fs.rmSync(dataRoot, { recursive: true, force: true });
}

const failed = results.filter((r) => !r).length;
console.log(`\nport-redirect: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
