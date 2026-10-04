// The built frontend (www/) in both ways in: directly from Aura's own server and
// as <web-port>/aura/ behind the web adapter extension.
//
//   npm run build && node tools/tests/web-extension-e2e.mjs
//
// Aura's server is played by main.js's own serveStatic/requestBase (index.html
// with its injections, the assets from www/), the web adapter by an express app
// with lib/webExtension.js loaded. Neither runs an ioBroker, so the dashboard
// stays offline — what is checked is that the page boots, that every asset and
// lazily loaded chunk comes from below the right prefix, and that the requests
// the app makes to Aura's own routes (/icons, /api/aura, …) never land on the
// web adapter's root.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const express = require('express');
const bodyParser = require('body-parser');
const WebExtension = require(join(process.cwd(), 'lib/webExtension.js'));

const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
        Adapter: class {
            constructor() {
                this.log = { info() {}, warn() {}, error() {}, debug() {} };
            }
            on() {}
        },
    },
};
const { serveStatic, requestBase } = require(join(process.cwd(), 'main.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const listen = (server) =>
    new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

// Aura's own routes the app may call while booting; answered empty here.
const AURA_ROUTES = /^\/(icons|adapter-icons|api|fs|proxy|webfs|socket\.io)(\/|\?|$)/;

const auraSeen = [];
const aura = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    auraSeen.push({ path: url.pathname, base: requestBase(req) });
    if (AURA_ROUTES.test(url.pathname)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
    }
    serveStatic(url.pathname, res, req.headers.host, false, '', 'aura.0', requestBase(req));
});
const auraPort = await listen(aura);

const webRoot = [];
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
app.use((req, res) => {
    webRoot.push(new URL(req.url, 'http://x').pathname);
    res.writeHead(404);
    res.end();
});
const webPort = await listen(web);

const browser = await chromium.launch();

async function visit(label, url, expectBase) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const responses = [];
    page.on('response', (r) => responses.push({ url: new URL(r.url()), status: r.status() }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load' });
    // Let the app mount and pull its first lazy chunks.
    await page
        .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, {
            timeout: 15000,
        })
        .catch(() => {});
    await page.waitForTimeout(2500);
    // The admin is a separate lazy chunk set — open it to load more of them.
    await page.evaluate(() => {
        location.hash = '#/admin';
    });
    await page.waitForTimeout(2500);

    const base = await page.evaluate(() => window.__AURA_BASE__ ?? null);
    check(`${label}: __AURA_BASE__`, base === expectBase, String(base));
    const mounted = await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
    check(`${label}: the app mounted`, mounted);
    const assets = responses.filter((r) => r.url.pathname.includes('/assets/'));
    const prefix = expectBase ?? '/';
    check(`${label}: assets were loaded`, assets.length > 5, String(assets.length));
    const wrong = assets.filter((r) => !r.url.pathname.startsWith(`${prefix}assets/`) || r.status !== 200);
    check(
        `${label}: every asset from ${prefix}assets/ with 200`,
        wrong.length === 0,
        wrong.map((r) => `${r.status} ${r.url.pathname}`).join(', '),
    );
    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
    return responses;
}

// ── 1. Directly from Aura's server ──────────────────────────────────────────
{
    auraSeen.length = 0;
    await visit('port 8095', `http://127.0.0.1:${auraPort}/`, null);
    check(
        'port 8095: nothing claimed a prefix',
        auraSeen.every((s) => s.base === '/'),
    );
}

// ── 2. Behind the web adapter extension ─────────────────────────────────────
{
    auraSeen.length = 0;
    webRoot.length = 0;
    const responses = await visit('behind the extension', `http://127.0.0.1:${webPort}/aura/`, '/aura/');
    check(
        'behind the extension: every request reached Aura with the prefix',
        auraSeen.every((s) => s.base === '/aura/'),
    );
    // Only the socket library and its connection belong to the web adapter itself.
    const strays = webRoot.filter((p) => !p.startsWith('/socket.io/'));
    check('behind the extension: nothing else went to the web adapter root', strays.length === 0, strays.join(', '));
    const auraRoutes = responses.filter((r) => /\/(icons|adapter-icons|api\/aura|fs)\//.test(r.url.pathname));
    check('behind the extension: the app did call Aura routes', auraRoutes.length > 0, 'none seen');
    const unprefixed = auraRoutes.filter((r) => !r.url.pathname.startsWith('/aura/'));
    check(
        "behind the extension: Aura's own routes are called below /aura/",
        unprefixed.length === 0,
        unprefixed.map((r) => r.url.pathname).join(', '),
    );
    const bare = await new Promise((resolve) =>
        http.get({ host: '127.0.0.1', port: webPort, path: '/aura' }, (r) => resolve(r)),
    );
    check(
        'behind the extension: /aura redirects to /aura/',
        bare.statusCode === 301 && bare.headers.location === '/aura/',
    );
}

// ── 3. Aura stopped: the web adapter serves the uploaded www/ copy itself ──────
// Without the extension the web adapter answers /aura/ from the file storage —
// the same files, but no server injects anything. The app must not start half
// (dashboard from the cache, no data) but say what is wrong, and reload once
// Aura answers again.
{
    let auraUp = false;
    const wwwDir = join(process.cwd(), 'www');
    const storage = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        if (!url.pathname.startsWith('/aura/')) {
            res.writeHead(404);
            res.end();
            return;
        }
        const rel = url.pathname.slice('/aura/'.length) || 'index.html';
        if (auraUp && rel === 'index.html') {
            serveStatic('/', res, req.headers.host, false, '', 'aura.0', '/aura/');
            return;
        }
        fs.readFile(join(wwwDir, rel), (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end();
                return;
            }
            const ct = rel.endsWith('.js') ? 'application/javascript' : rel.endsWith('.css') ? 'text/css' : 'text/html';
            res.writeHead(200, { 'Content-Type': ct });
            res.end(data);
        });
    });
    const storagePort = await listen(storage);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const calls = [];
    page.on('request', (r) => calls.push(new URL(r.url()).pathname));
    await page.goto(`http://127.0.0.1:${storagePort}/aura/`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
        text: document.getElementById('aura-boot-text')?.textContent ?? '',
        detail: document.getElementById('aura-boot-diag')?.hidden === false,
        mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
        blocked: window.__auraBootBlocked === true,
    }));
    check(
        'without Aura: the splash says Aura is not running',
        /Aura (läuft nicht|is not running)/.test(state.text),
        state.text,
    );
    check('without Aura: the explanation is shown', state.detail);
    check('without Aura: the app did not start', !state.mounted && state.blocked, JSON.stringify(state));
    const appCalls = calls.filter((p) => /\/(icons|api|fs|adapter-icons)\//.test(p));
    check('without Aura: no app requests', appCalls.length === 0, appCalls.join(', '));
    auraUp = true;
    await page
        .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, {
            timeout: 20000,
        })
        .catch(() => {});
    const back = await page.evaluate(() => ({
        mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
        base: window.__AURA_BASE__ ?? null,
    }));
    check(
        'Aura back: the page reloads by itself and starts',
        back.mounted && back.base === '/aura/',
        JSON.stringify(back),
    );
    await ctx.close();
    storage.close();
    storage.closeAllConnections();
}

await browser.close();
web.close();
web.closeAllConnections();
aura.close();
aura.closeAllConnections();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
