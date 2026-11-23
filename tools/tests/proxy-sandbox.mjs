// Proxied pages behind the web extension run sandboxed (#997, step 5).
//
//   node tools/tests/proxy-sandbox.mjs
//
// Aura's real HTTP server (main.js startHttpServer, adapter stubbed) behind the
// real web extension in an express app, a target web site on this machine's LAN
// address (the proxy refuses loopback), and real browsers. Checked:
//  - behind /aura/ a proxied page gets `CSP: sandbox` and runs in an opaque
//    origin: no access to the shared origin's localStorage / cookies / parent;
//  - it still works: stylesheet, image, script, fetch reach the target through
//    the proxy (the `t` key admits the cross-site sub-requests), localStorage and
//    document.cookie have stand-ins, the target's cookies come back from the
//    server-side jar — and the browser's own cookies never reach the target;
//  - a cross-site request without a key is refused, a key for another origin too;
//  - on Aura's own port nothing changes (no sandbox, page shares the origin),
//    except that Aura's and web's cookies no longer go to the target.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';

const require = createRequire(import.meta.url);
const express = require('express');
const bodyParser = require('body-parser');
const { chromium, firefox, webkit } = require('playwright');
const WebExtension = require(join(process.cwd(), 'lib/webExtension.js'));

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
                this.instance = 0;
                this.log = { info() {}, warn() {}, error() {}, debug() {} };
            }
            on() {}
            // ioBroker calls the HTTP server makes on start — nothing to store here.
            async setObjectNotExistsAsync() {}
            async extendObjectAsync() {}
            async setStateAsync() {}
            async getStateAsync() {
                return null;
            }
            async getForeignObjectAsync() {
                return null;
            }
            async getForeignObjectsAsync() {
                return {};
            }
            async getObjectViewAsync() {
                return { rows: [] };
            }
            subscribeStates() {}
            subscribeForeignStates() {}
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

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};

const lanIp = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
if (!lanIp) {
    console.log('proxy-sandbox: no LAN address on this machine — skipped');
    process.exit(0);
}

const listen = (server, host = '127.0.0.1') =>
    new Promise((resolve) => server.listen(0, host, () => resolve(server.address().port)));
const freePort = async () => {
    const s = net.createServer();
    const p = await listen(s);
    await new Promise((r) => s.close(r));
    return p;
};

// ── the target web site ─────────────────────────────────────────────────────
const target = { cookies: {}, report: null };
const site = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    target.cookies[u.pathname] = req.headers.cookie || '';
    if (u.pathname === '/page') {
        res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'set-cookie': ['sid=s3cret; Path=/; HttpOnly', 'csrf=tok1; Path=/'],
            'x-frame-options': 'DENY',
        });
        res.end(`<!doctype html><html><head><link rel="stylesheet" href="/style.css"><script src="/app.js"></script></head>
<body><img id="img" src="/img.png"><script>
var r = { app: window.__app === 1 };
try { localStorage.setItem('k', 'v'); r.ls = localStorage.getItem('k'); } catch (e) { r.ls = 'throws ' + e.name; }
try { r.cookie = document.cookie; } catch (e) { r.cookie = 'throws ' + e.name; }
try { r.parentLs = parent.localStorage.getItem('aura-secret'); } catch (e) { r.parentLs = 'blocked'; }
try { r.origin = String(window.origin); } catch (e) { r.origin = '?'; }
var img = document.getElementById('img');
function done() {
  r.img = img.naturalWidth;
  r.css = getComputedStyle(document.body).marginTop;
  fetch('/api/data').then(function (x) { return x.json(); }).then(function (j) { r.fetch = j.ok; })
    .catch(function (e) { r.fetch = 'error ' + e; })
    .then(function () { return fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Custom': '1' }, body: '{}' }); })
    .then(function (x) { r.preflight = x.status; }, function (e) { r.preflight = 'error ' + e; })
    .then(function () { return fetch('/report', { method: 'POST', body: JSON.stringify(r) }); });
}
if (img.complete) done(); else { img.onload = done; img.onerror = done; }
</script></body></html>`);
        return;
    }
    if (u.pathname === '/style.css') {
        res.writeHead(200, { 'content-type': 'text/css' });
        return res.end('body{margin-top:17px}');
    }
    if (u.pathname === '/app.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        return res.end('window.__app=1;');
    }
    if (u.pathname === '/img.png') {
        // 1×1 PNG
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                'base64',
            ),
        );
    }
    if (u.pathname === '/api/data') {
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'later=2; Path=/' });
        return res.end('{"ok":true}');
    }
    if (u.pathname === '/report') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                target.report = JSON.parse(Buffer.concat(chunks).toString());
            } catch {
                target.report = { broken: true };
            }
            res.writeHead(204);
            res.end();
        });
        return;
    }
    res.writeHead(404);
    res.end();
});
const sitePort = await listen(site, lanIp);
const siteUrl = `http://${lanIp}:${sitePort}`;

// ── Aura's own server ───────────────────────────────────────────────────────
const auraPort = await freePort();
const aura = main({});
aura.config = { port: auraPort, bind: '127.0.0.1' };
aura.resolveSocketBackend = async () => ({
    found: false,
    host: '127.0.0.1',
    port: 9,
    mode: 'port',
    conflicts: [],
    wanted: '',
});
aura._noteBackendResponse = () => {};
aura._startIpcServer = () => {};
await aura.startHttpServer();
await new Promise((r) => setTimeout(r, 200));

// ── the web adapter with the extension ──────────────────────────────────────
const app = express();
app.use(bodyParser.json());
const web = http.createServer(app);
new WebExtension(
    web,
    { secure: false },
    { host: 'h', log: { info() {}, warn() {}, error() {}, debug() {} } },
    { common: { host: 'h' }, native: { port: auraPort } },
    app,
);
// A page of "another visualisation" on the shared origin.
app.get('/vis/index.html', (req, res) => {
    res.set('content-type', 'text/html');
    res.end(`<!doctype html><script>localStorage.setItem('aura-secret','top');document.cookie='connect.sid=websession; Path=/';</script>
<iframe id="f" style="width:300px;height:200px"></iframe>`);
});
const webPort = await listen(web);
const webOrigin = `http://127.0.0.1:${webPort}`;

const proxyPath = (base) => `${base}proxy?url=${encodeURIComponent(`${siteUrl}/page`)}`;

async function run(name, browserType, origin, base, sandboxed) {
    let browser;
    try {
        browser = await browserType.launch();
    } catch {
        console.log(`  --   ${name}: browser not installed`);
        return;
    }
    target.report = null;
    target.cookies = {};
    const page = await browser.newPage();
    // Seed the shared origin (localStorage + web session cookie), then frame the proxy.
    await page.goto(`${webOrigin}/vis/index.html`);
    if (origin !== webOrigin) {
        await page.goto(`${origin}/`).catch(() => {});
        await page.evaluate(() => localStorage.setItem('aura-secret', 'top'));
        await page.context().addCookies([{ name: 'connect.sid', value: 'websession', url: origin }]);
        await page.setContent('<iframe id="f" style="width:300px;height:200px"></iframe>');
    }
    const headers = {};
    page.on('response', (r) => {
        if (r.url().includes('proxy?url=') && r.url().includes('%2Fpage')) headers.page = r.headers();
    });
    await page.evaluate(
        (src) => {
            document.getElementById('f').src = src;
        },
        `${origin}${proxyPath(base)}`,
    );
    for (let i = 0; i < 100 && !target.report; i++) await new Promise((r) => setTimeout(r, 100));
    const r = target.report || {};
    // The sound bridge (useIframeMute): ask, the page answers.
    const muteState = await page.evaluate(
        () =>
            new Promise((resolve) => {
                const f = document.getElementById('f');
                addEventListener('message', (e) => {
                    if (e.source === f.contentWindow && e.data && 'auraMuteState' in e.data)
                        resolve(e.data.auraMuteState);
                });
                f.contentWindow.postMessage({ auraMute: true }, '*');
                setTimeout(() => resolve('no answer'), 2000);
            }),
    );
    const csp = (headers.page && headers.page['content-security-policy']) || '';
    const tag = `${name} ${sandboxed ? '/aura/' : ':8095'}`;
    if (sandboxed) {
        check(`${tag}: page served with CSP sandbox`, /sandbox/.test(csp) && !/allow-same-origin/.test(csp), csp);
        check(`${tag}: opaque origin`, r.origin === 'null', r.origin);
        check(`${tag}: parent's localStorage out of reach`, r.parentLs === 'blocked', r.parentLs);
        check(`${tag}: localStorage stand-in works`, r.ls === 'v', r.ls);
        check(`${tag}: document.cookie shows the target's script cookie`, r.cookie === 'csrf=tok1', r.cookie);
        check(`${tag}: JSON POST with a custom header passes the preflight`, r.preflight === 200, String(r.preflight));
        check(`${tag}: sound bridge answers (no media = null)`, muteState === null, String(muteState));
    } else {
        check(`${tag}: no sandbox on Aura's own port`, !/sandbox/.test(csp), csp);
    }
    check(`${tag}: report arrived (fetch through the proxy)`, !!target.report);
    check(`${tag}: script loaded`, r.app === true);
    check(`${tag}: stylesheet applied`, r.css === '17px', r.css);
    check(`${tag}: image loaded`, r.img === 1, String(r.img));
    check(`${tag}: fetch answered`, r.fetch === true, String(r.fetch));
    const apiCookie = target.cookies['/api/data'] || '';
    check(`${tag}: web session cookie never reaches the target`, !/connect\.sid/.test(apiCookie), apiCookie);
    check(`${tag}: Aura's cookies never reach the target`, !/aura_/.test(apiCookie), apiCookie);
    if (sandboxed) {
        check(
            `${tag}: target gets its own cookies back from the jar`,
            /sid=s3cret/.test(apiCookie) && /csrf=tok1/.test(apiCookie),
            apiCookie,
        );
        const reportCookie = target.cookies['/report'] || '';
        check(`${tag}: a cookie set by a later response is kept too`, /later=2/.test(reportCookie), reportCookie);
    }
    await browser.close();
}

try {
    for (const [name, bt] of [
        ['chromium', chromium],
        ['firefox', firefox],
        ['webkit', webkit],
    ]) {
        await run(name, bt, webOrigin, '/aura/', true);
    }
    await run('chromium', chromium, `http://127.0.0.1:${auraPort}`, '/', false);

    // ── the guard, without a browser ─────────────────────────────────────────
    const get = (url, headers = {}) =>
        new Promise((resolve) => {
            http.get(url, { headers }, (res) => {
                res.resume();
                resolve({ status: res.statusCode, headers: res.headers });
            }).on('error', () => resolve({ status: 0, headers: {} }));
        });
    const cross = { 'sec-fetch-site': 'cross-site' };
    let res = await get(`${webOrigin}${proxyPath('/aura/')}`, cross);
    check('cross-site without key: refused', res.status === 403, String(res.status));
    res = await get(`${webOrigin}${proxyPath('/aura/')}`);
    check(
        'same-origin without key: allowed, gets a jar cookie',
        res.status === 200 && /aura_pj=/.test(String(res.headers['set-cookie'])),
        String(res.status),
    );
    const jarId = aura._proxyJar.newJarId();
    const goodKey = aura._proxyJar.key(jarId, siteUrl);
    res = await get(`${webOrigin}${proxyPath('/aura/')}&t=${goodKey}`, cross);
    check('cross-site with key: allowed', res.status === 200, String(res.status));
    const otherKey = aura._proxyJar.key(jarId, 'http://192.0.2.1');
    res = await get(`${webOrigin}${proxyPath('/aura/')}&t=${otherKey}`, cross);
    check('cross-site with a key for another origin: refused', res.status === 403, String(res.status));
    res = await get(`${webOrigin}${proxyPath('/aura/')}&t=${jarId}.AAAAAAAAAAAAAAAAAAAAAA`, cross);
    check('cross-site with a forged key: refused', res.status === 403, String(res.status));
    res = await get(`${webOrigin}/aura/fs/roots`, cross);
    check('/fs from a sandboxed page (cross-site): refused', res.status === 403, String(res.status));
    res = await get(`http://127.0.0.1:${auraPort}${proxyPath('/')}`, {
        cookie: 'connect.sid=x; aura_admin_0=y; own=1',
    });
    check(
        ':8095: browser cookies minus Aura/web reach the target',
        target.cookies['/page'] === 'own=1',
        target.cookies['/page'],
    );
    check(':8095: no jar, Set-Cookie passes through', /sid=s3cret/.test(String(res.headers['set-cookie'])));
} finally {
    aura._httpServer?.close();
    web.close();
    site.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nproxy-sandbox: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
