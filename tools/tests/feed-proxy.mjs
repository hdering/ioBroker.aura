/**
 * lib/feedProxy.js — the news widget's same-origin feed fetch (#854).
 *
 *   node tools/tests/feed-proxy.mjs
 *
 * A local HTTP server plays the publisher. Checked: the bytes come back
 * untouched (Latin-1 stays Latin-1, gzip is unpacked), one upstream request per
 * TTL however many clients ask, concurrent requests share one fetch, a failed
 * refresh serves the last copy with X-Aura-Stale, redirects are followed,
 * oversized feeds and non-http URLs are refused, and the frame check reads
 * X-Frame-Options / frame-ancestors once per host.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { createFeedProxy, frameAllowed } = require('../../lib/feedProxy.js');

let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
    if (cond) pass++;
    else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const RSS =
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><title>Tagesschau</title></channel></rss>';
const latin1 = Buffer.from(RSS.replace('Tagesschau', 'Grüße'), 'latin1');

const upstream = { hits: {}, fail: false, delay: 0 };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    upstream.hits[url.pathname] = (upstream.hits[url.pathname] || 0) + 1;
    const send = () => {
        if (upstream.fail) {
            res.writeHead(500);
            res.end('down');
            return;
        }
        switch (url.pathname) {
            case '/latin1.xml':
                res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
                res.end(latin1);
                return;
            case '/gzip.xml':
                res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Encoding': 'gzip' });
                res.end(zlib.gzipSync(Buffer.from(RSS)));
                return;
            case '/moved':
                res.writeHead(301, { Location: '/latin1.xml' });
                res.end();
                return;
            case '/huge.xml':
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(Buffer.alloc(3 * 1024 * 1024, 'a'));
                return;
            case '/article-deny':
                res.writeHead(200, { 'X-Frame-Options': 'SAMEORIGIN' });
                res.end('<html></html>');
                return;
            case '/article-csp':
                res.writeHead(200, {
                    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self' https://x.de",
                });
                res.end('<html></html>');
                return;
            case '/article-head405':
                if (req.method === 'HEAD') {
                    res.writeHead(405);
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html></html>');
                return;
            default:
                res.writeHead(404);
                res.end('nope');
        }
    };
    if (upstream.delay) setTimeout(send, upstream.delay);
    else send();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
// A second host name for the same server, so the per-host frame cache can be told apart.
const ORIGIN2 = `http://localhost:${server.address().port}`;

function fakeRes() {
    const res = {
        status: 0,
        headers: {},
        body: Buffer.alloc(0),
        writeHead(status, headers) {
            res.status = status;
            res.headers = headers || {};
        },
        end(body) {
            res.body = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
            res.done();
        },
    };
    res.finished = new Promise((resolve) => (res.done = resolve));
    return res;
}

async function call(proxy, path, method = 'GET') {
    const res = fakeRes();
    const handled = proxy.handle({ method }, res, new URL(path, 'http://localhost'));
    if (handled) await res.finished;
    return { handled, res };
}

const feed = (u, ttl) => `/feed?url=${encodeURIComponent(u)}${ttl ? `&ttl=${ttl}` : ''}`;
const frame = (u) => `/feed/frame?url=${encodeURIComponent(u)}`;

// ── routing ──
{
    const p = createFeedProxy();
    check('other paths are not handled', !(await call(p, '/icons/x.json')).handled);
    check('POST is not handled', !(await call(p, feed(`${ORIGIN}/latin1.xml`), 'POST')).handled);
    const bad = await call(p, feed('file:///etc/passwd'));
    check('non-http url refused', bad.res.status === 400, String(bad.res.status));
    check('missing url refused', (await call(p, '/feed')).res.status === 400);
}

// ── bytes, cache, stale ──
{
    const p = createFeedProxy();
    const a = await call(p, feed(`${ORIGIN}/latin1.xml`));
    check('feed served', a.res.status === 200, String(a.res.status));
    check('bytes untouched (Latin-1)', a.res.body.equals(latin1));
    check('content type passed on', a.res.headers['Content-Type'] === 'application/rss+xml');
    check('fetched-at header', Number(a.res.headers['X-Aura-Fetched-At']) > 0);

    await call(p, feed(`${ORIGIN}/latin1.xml`));
    await call(p, feed(`${ORIGIN}/latin1.xml`));
    check(
        'cached within ttl: one upstream hit',
        upstream.hits['/latin1.xml'] === 1,
        String(upstream.hits['/latin1.xml']),
    );

    // ttl below the minimum is raised to 60 s - still cached
    await call(p, feed(`${ORIGIN}/latin1.xml`, 1));
    check('ttl floor of 60 s', upstream.hits['/latin1.xml'] === 1);

    // A fresh proxy with a cached copy whose ttl ran out, publisher down → stale copy
    const p2 = createFeedProxy();
    upstream.hits = {};
    await call(p2, feed(`${ORIGIN}/gzip.xml`));
    check('gzip unpacked', (await call(p2, feed(`${ORIGIN}/gzip.xml`))).res.body.toString() === RSS);
    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 3600 * 1000;
    upstream.fail = true;
    const stale = await call(p2, feed(`${ORIGIN}/gzip.xml`, 60));
    Date.now = realNow;
    upstream.fail = false;
    check('failed refresh serves last copy', stale.res.status === 200 && stale.res.body.toString() === RSS);
    check('…flagged stale', stale.res.headers['X-Aura-Stale'] === '1');
    check('refresh was attempted', upstream.hits['/gzip.xml'] === 2, String(upstream.hits['/gzip.xml']));

    upstream.fail = true;
    const down = await call(createFeedProxy(), feed(`${ORIGIN}/gzip.xml`));
    upstream.fail = false;
    check('no copy + failure → 502', down.res.status === 502, String(down.res.status));
}

// ── concurrency, redirects, size ──
{
    const p = createFeedProxy();
    upstream.hits = {};
    upstream.delay = 150;
    const all = await Promise.all([1, 2, 3, 4].map(() => call(p, feed(`${ORIGIN}/latin1.xml`))));
    upstream.delay = 0;
    check(
        'concurrent clients share one fetch',
        upstream.hits['/latin1.xml'] === 1,
        String(upstream.hits['/latin1.xml']),
    );
    check(
        '…and all get the feed',
        all.every((r) => r.res.status === 200),
    );

    const moved = await call(p, feed(`${ORIGIN}/moved`));
    check('redirect followed', moved.res.status === 200 && moved.res.body.equals(latin1));

    const huge = await call(p, feed(`${ORIGIN}/huge.xml`));
    check('oversized feed refused', huge.res.status === 502, String(huge.res.status));
}

// ── frame check ──
{
    check('no headers → embeddable', frameAllowed({}));
    check('DENY → not', !frameAllowed({ 'x-frame-options': 'DENY' }));
    check('frame-ancestors * → embeddable', frameAllowed({ 'content-security-policy': 'frame-ancestors *' }));
    check("frame-ancestors 'none' → not", !frameAllowed({ 'content-security-policy': "frame-ancestors 'none'" }));

    const p = createFeedProxy();
    const json = async (u) => JSON.parse((await call(p, frame(u))).res.body.toString());
    check('X-Frame-Options page not embeddable', (await json(`${ORIGIN}/article-deny`)).embeddable === false);
    check('frame-ancestors page not embeddable', (await json(`${ORIGIN2}/article-csp`)).embeddable === false);

    const p2 = createFeedProxy();
    upstream.hits = {};
    const ok = JSON.parse((await call(p2, frame(`${ORIGIN}/article-head405`))).res.body.toString());
    check('HEAD 405 falls back to GET', ok.embeddable === true && upstream.hits['/article-head405'] === 2);
    // Same host again (other path) → answered from the per-host cache
    await call(p2, frame(`${ORIGIN}/article-deny`));
    check('answered per host', !upstream.hits['/article-deny'], String(upstream.hits['/article-deny']));

    const dead = JSON.parse((await call(createFeedProxy(), frame('http://127.0.0.1:9/x'))).res.body.toString());
    check('unreachable → not embeddable', dead.embeddable === false);
}

server.close();
console.log(`feed-proxy: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
