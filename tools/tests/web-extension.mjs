// The optional web adapter extension (lib/webExtension.js) and the base-path
// handling it relies on in main.js.
//
//   node tools/tests/web-extension.mjs
//
// A real express app with the web adapter's body parsers stands in for the web
// adapter, a stub HTTP server for Aura's own server. Checked: every route under
// /aura/ arrives at Aura without the prefix and with X-Aura-Base, bodies the web
// adapter already parsed arrive intact, WebSockets are tunnelled while every
// other upgrade still reaches the web adapter's own listener (pure-ws instances
// answer all of them), a stopped Aura gives 502 instead of a hanging request,
// and main.js writes the prefix back into index.html and proxied pages.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import http from 'node:http';
import net from 'node:net';

const require = createRequire(import.meta.url);
const express = require('express');
const bodyParser = require('body-parser');
const WebExtension = require(join(process.cwd(), 'lib/webExtension.js'));

// Stub @iobroker/adapter-core before main.js pulls it in (same trick as webfs-adapter-files.mjs).
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
    },
};
const main = require(join(process.cwd(), 'main.js'));

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

const listen = (server) =>
    new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

// ── Stub of Aura's own server ───────────────────────────────────────────────
const seen = [];
const aura = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const entry = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: Buffer.concat(chunks).toString(),
        };
        seen.push(entry);
        if (req.url.startsWith('/redirect')) {
            res.writeHead(302, { Location: '/aura/proxy?url=x' });
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-From': 'aura' });
        res.end(JSON.stringify(entry));
    });
});
aura.on('upgrade', (req, socket) => {
    seen.push({ upgrade: true, url: req.url, headers: req.headers });
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(`echo:${d}`));
    // http.Server sockets are half-open: without this the tunnel's far end lingers.
    socket.on('end', () => socket.destroy());
});
const auraPort = await listen(aura);

// ── Stand-in for the web adapter ────────────────────────────────────────────
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.text());
const web = http.createServer(app);
// What a pure-WebSocket web instance does: claim every upgrade, whatever the path.
const ownUpgrades = [];
web.on('upgrade', (req, socket) => {
    ownUpgrades.push(req.url);
    socket.end('HTTP/1.1 418 Web Adapter Socket\r\n\r\n');
});
const logs = [];
const fakeAdapter = {
    host: 'host-a',
    log: {
        info: (m) => logs.push(m),
        warn: (m) => logs.push(m),
        error: (m) => logs.push(m),
        debug() {},
    },
};
const ext = new WebExtension(
    web,
    { secure: false, port: 0 },
    fakeAdapter,
    { common: { host: 'host-a' }, native: { port: auraPort, secure: false } },
    app,
);
// The web adapter's static files come after the extensions.
app.use((req, res) => {
    res.writeHead(404, { 'X-From': 'web-static' });
    res.end('static');
});
const webPort = await listen(web);

function request(path, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: webPort, path, method, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
                resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }),
            );
        });
        req.on('error', reject);
        req.end(body);
    });
}

function upgrade(path) {
    return new Promise((resolve) => {
        const sock = net.connect(webPort, '127.0.0.1', () => {
            sock.write(
                `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${webPort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
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
            if (buf.includes('echo:ping') || (!buf.startsWith('HTTP/1.1 101') && buf.includes('\r\n\r\n'))) {
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

// ── 1. Routing ───────────────────────────────────────────────────────────────
{
    const r = await request('/aura');
    eq('/aura redirects to /aura/', [r.status, r.headers.location], [301, '/aura/']);
    const q = await request('/aura?x=1');
    eq('the query survives the redirect', q.headers.location, '/aura/?x=1');
    const other = await request('/aurafoo');
    eq('/aurafoo is not ours', other.headers['x-from'], 'web-static');
    const vis = await request('/vis/index.html');
    eq('other web paths stay with the web adapter', vis.headers['x-from'], 'web-static');
}

// ── 2. HTTP forwarding ───────────────────────────────────────────────────────
{
    const r = await request('/aura/fs/roots?x=1', { headers: { Cookie: 'a=b' } });
    const s = JSON.parse(r.body);
    eq('GET arrives without the prefix', s.url, '/fs/roots?x=1');
    eq('the prefix is named in X-Aura-Base', s.headers['x-aura-base'], '/aura/');
    check('the client is named in X-Forwarded-For', !!s.headers['x-forwarded-for']);
    eq('the original host is kept for X-Forwarded-Host', s.headers['x-forwarded-host'], `127.0.0.1:${webPort}`);
    eq('cookies pass', s.headers.cookie, 'a=b');
    eq("Aura's response headers pass", r.headers['x-from'], 'aura');
    const root = JSON.parse((await request('/aura/')).body);
    eq("/aura/ is Aura's root", root.url, '/');

    const json = JSON.parse(
        (
            await request('/aura/api/aura/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'x y', n: 1 }),
            })
        ).body,
    );
    eq('a JSON body the web adapter parsed arrives intact', JSON.parse(json.body), { password: 'x y', n: 1 });
    eq('… with a matching Content-Length', Number(json.headers['content-length']), json.body.length);

    const form = JSON.parse(
        (
            await request('/aura/proxy?url=http%3A%2F%2Fx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'user=a%20b&csrf=1&list[]=1&list[]=2',
            })
        ).body,
    );
    eq('a form body arrives as a form', new URLSearchParams(form.body).get('user'), 'a b');
    eq('… nested fields included', new URLSearchParams(form.body).getAll('list[]'), ['1', '2']);

    const text = JSON.parse(
        (
            await request('/aura/api/aura/x', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: 'hello',
            })
        ).body,
    );
    eq('a text body arrives intact', text.body, 'hello');

    const bin = JSON.parse(
        (
            await request('/aura/api/aura/bin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: 'raw-bytes',
            })
        ).body,
    );
    eq('an unparsed body is streamed through', bin.body, 'raw-bytes');

    const redir = await request('/aura/redirect');
    eq(
        "Aura's redirects reach the browser unchanged",
        [redir.status, redir.headers.location],
        [302, '/aura/proxy?url=x'],
    );
}

// ── 3. WebSockets ────────────────────────────────────────────────────────────
{
    const before = seen.length;
    const ours = await upgrade('/aura/proxyws?url=ws%3A%2F%2Fx');
    check('an upgrade under /aura/ is tunnelled to Aura', ours.startsWith('HTTP/1.1 101'), ours.slice(0, 60));
    check('… and carries data both ways', ours.includes('echo:ping'), ours);
    const up = seen.slice(before).find((e) => e.upgrade);
    eq('… without the prefix', up?.url, '/proxyws?url=ws%3A%2F%2Fx');
    eq('… with X-Aura-Base', up?.headers['x-aura-base'], '/aura/');
    eq("the web adapter's socket did not see it", ownUpgrades.includes('/aura/proxyws?url=ws%3A%2F%2Fx'), false);

    const root = await upgrade('/?sid=1');
    check("a root upgrade still reaches the web adapter's socket", root.includes('418'), root.slice(0, 60));
    eq('… exactly once', ownUpgrades.filter((u) => u === '/?sid=1').length, 1);
}

// ── 4. Aura not running ──────────────────────────────────────────────────────
{
    const closed = new Promise((r) => aura.close(r));
    aura.closeAllConnections();
    await closed;
    const r = await request('/aura/');
    eq('a stopped Aura answers 502', r.status, 502);
    check('… with a page that says so', /not reachable/.test(r.body));
    const ws = await upgrade('/aura/proxyws?url=x');
    check('a WebSocket to a stopped Aura gets 502', ws.startsWith('HTTP/1.1 502'), ws.slice(0, 60));
    const vis = await request('/vis/index.html');
    eq('the web adapter keeps serving', vis.headers['x-from'], 'web-static');
}

// ── 5. Lifecycle ─────────────────────────────────────────────────────────────
{
    eq('start page tile', ext.welcomePage().link, 'aura/');
    // The web adapter's start page drops entries without a relative localLink.
    eq('start page tile: localLink (else the start page hides it)', ext.welcomePage().localLink, 'aura/');
    check(
        'the start is logged with the target',
        logs.some((l) => l.includes(`127.0.0.1:${auraPort}`)),
    );
    await ext.unload();
    const listeners = web.listeners('upgrade');
    eq('unload restores the original upgrade listener', listeners.length, 1);
    eq('exports the class under its file name (web adapter lookup)', typeof WebExtension.webExtension, 'function');
    eq(
        'stripPrefix',
        [
            WebExtension.stripPrefix('/aura'),
            WebExtension.stripPrefix('/aura/x'),
            WebExtension.stripPrefix('/aurax'),
            WebExtension.stripPrefix('/x'),
        ],
        ['', '/x', null, null],
    );
}

// ── 5b. HTTP/2 (the web adapter serves HTTPS as HTTP/2) ──────────────────────
{
    const h = WebExtension.forwardHeaders(
        {
            headers: {
                ':method': 'GET',
                ':path': '/aura/',
                ':authority': '192.168.188.140:8082',
                ':scheme': 'https',
                cookie: 'a=b',
            },
            socket: { remoteAddress: '192.168.1.5' },
        },
        true,
    );
    eq(
        'HTTP/2: no pseudo-headers forwarded',
        Object.keys(h).filter((k) => k.startsWith(':')),
        [],
    );
    eq('HTTP/2: Host taken from :authority', h.host, '192.168.188.140:8082');
    eq('HTTP/2: X-Forwarded-Host too', h['x-forwarded-host'], '192.168.188.140:8082');
    eq('HTTP/2: proto https', h['x-forwarded-proto'], 'https');
    let thrown = null;
    for (const k of Object.keys(h)) {
        try {
            http.validateHeaderName(k);
        } catch (e) {
            thrown = e.code;
        }
    }
    eq('HTTP/2: every header name valid for HTTP/1', thrown, null);
}

// ── 6. Multihost: Aura on another host ───────────────────────────────────────
{
    const app2 = express();
    const web2 = http.createServer(app2);
    const ext2 = new WebExtension(
        web2,
        { secure: false },
        {
            ...fakeAdapter,
            host: 'host-a',
            getForeignObjectAsync: async (id) =>
                id === 'system.host.host-b'
                    ? { common: { address: ['127.0.0.1', '::1', '192.168.5.7', 'fe80::1'] } }
                    : null,
        },
        { common: { host: 'host-b' }, native: { port: 8095 } },
        app2,
    );
    await ext2.ready;
    eq("Aura on another host: forwards to that host's address", ext2.host, '192.168.5.7');
    await ext2.unload();
}

// ── 7. main.js: the prefix written back ──────────────────────────────────────
{
    const { requestBase, rewriteHtml, rewriteCss, serveStatic } = main;
    eq('requestBase: header', requestBase({ headers: { 'x-aura-base': '/aura/' } }), '/aura/');
    eq('requestBase: none', requestBase({ headers: {} }), '/');
    eq(
        'requestBase: rejects anything but plain segments',
        requestBase({ headers: { 'x-aura-base': '/a"><script>/' } }),
        '/',
    );
    eq('requestBase: rejects a missing slash', requestBase({ headers: { 'x-aura-base': '/aura' } }), '/');

    const page = '<html><head></head><body><a href="/x">x</a><img src="pic.png"></body></html>';
    const at = rewriteHtml(page, 'http://cam.local/index.html', '/aura/');
    check(
        'proxied page: links point below /aura/proxy',
        at.includes('href="/aura/proxy?url=http%3A%2F%2Fcam.local%2Fx"'),
        at,
    );
    check(
        'proxied page: the interceptor knows the prefix',
        at.includes('pp="/aura/proxy"') && at.includes('pw="/aura/proxyws"'),
    );
    check('proxied page: no bare /proxy left', !/'\/proxy/.test(at));
    const root = rewriteHtml(page, 'http://cam.local/index.html');
    check('proxied page on port 8095 unchanged', root.includes('href="/proxy?url=') && root.includes('pp="/proxy"'));
    eq(
        'proxied CSS',
        rewriteCss('a{background:url(b.png)}', 'http://cam.local/c.css', '/aura/'),
        "a{background:url('/aura/proxy?url=http%3A%2F%2Fcam.local%2Fb.png')}",
    );

    const serve = (base) =>
        new Promise((resolve) => {
            const res = {
                writeHead(status, headers) {
                    this.status = status;
                    this.headers = headers;
                },
                end(body) {
                    resolve({ status: this.status, body: String(body) });
                },
            };
            serveStatic('/', res, '192.168.1.2:8095', false, '', 'aura.1', base);
        });
    const direct = await serve('/');
    check(
        'index.html on port 8095: socket URL injected',
        direct.body.includes('window.__AURA_SOCKET_URL__="http://192.168.1.2:8095"'),
    );
    check('… and no base', !direct.body.includes('__AURA_BASE__'));
    const behind = await serve('/aura/');
    check('index.html behind the extension: base injected', behind.body.includes('window.__AURA_BASE__="/aura/"'));
    check('… no socket URL (the web adapter socket is used)', !behind.body.includes('__AURA_SOCKET_URL__'));
    check('… namespace still injected', behind.body.includes('window.__AURA_NAMESPACE__="aura.1"'));
}

web.close();
web.closeAllConnections?.();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
