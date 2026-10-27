'use strict';

/**
 * Same-origin feed fetch for the news widget (#854).
 *
 *     GET /feed?url=<feed url>&ttl=<seconds>
 *
 * Browsers may not read a foreign RSS/Atom feed (no CORS headers), so the
 * widget asks Aura's own server. The answer is the feed's bytes untouched —
 * the widget parses the XML itself (DOMParser) and decodes the charset from the
 * prolog, so the adapter needs no XML dependency. Every feed is cached in
 * memory for `ttl`: ten tablets showing the same feed cost the publisher one
 * request, not ten. A failed refresh serves the last good copy with
 * `X-Aura-Stale: 1`, so a short outage of the publisher does not empty the
 * widget.
 *
 *     GET /feed/frame?url=<article url>
 *
 * Whether an article page lets itself be framed (X-Frame-Options,
 * CSP frame-ancestors). The widget's `openMode: 'auto'` opens embeddable pages in
 * a popup and the others in a new tab. Answered per host, which is how news
 * sites set these headers.
 */

const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MIN_TTL_S = 60;
const DEFAULT_TTL_S = 900;
const MAX_TTL_S = 24 * 3600;
const MAX_FEEDS = 64;
const FRAME_TTL_MS = 6 * 3600 * 1000;
const MAX_FRAME_HOSTS = 256;
const USER_AGENT = 'Mozilla/5.0 (compatible; ioBroker-Aura)';

/** Parse and check a url parameter: http(s) only. */
function targetUrl(raw) {
    if (!raw) {
        return null;
    }
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
    } catch {
        return null;
    }
}

/**
 * One GET/HEAD with redirects. Resolves `{ status, headers, body, url }`; the body
 * is decompressed and capped at MAX_BYTES (more rejects). `head: true` sends a
 * HEAD request and never reads a body.
 */
function request(url, { head = false, accept = '*/*' } = {}, depth = 0) {
    if (depth > MAX_REDIRECTS) {
        return Promise.reject(new Error('Too many redirects'));
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, val) => {
            if (!settled) {
                settled = true;
                fn(val);
            }
        };
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(
            url,
            {
                method: head ? 'HEAD' : 'GET',
                timeout: FETCH_TIMEOUT_MS,
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: accept,
                    'Accept-Encoding': 'gzip, deflate, br',
                },
            },
            (res) => {
                const status = res.statusCode || 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume();
                    let next;
                    try {
                        next = new URL(res.headers.location, url);
                    } catch {
                        done(reject, new Error(`Bad redirect: ${res.headers.location}`));
                        return;
                    }
                    request(next, { head, accept }, depth + 1).then(
                        (v) => done(resolve, v),
                        (e) => done(reject, e),
                    );
                    return;
                }
                if (head) {
                    res.resume();
                    done(resolve, { status, headers: res.headers, body: Buffer.alloc(0), url });
                    return;
                }
                const enc = String(res.headers['content-encoding'] || '').toLowerCase();
                /** @type {NodeJS.ReadableStream} */
                let stream = res;
                if (enc === 'gzip' || enc === 'x-gzip') {
                    stream = res.pipe(zlib.createGunzip());
                } else if (enc === 'deflate') {
                    stream = res.pipe(zlib.createInflate());
                } else if (enc === 'br') {
                    stream = res.pipe(zlib.createBrotliDecompress());
                }
                const chunks = [];
                let size = 0;
                stream.on('data', (c) => {
                    size += c.length;
                    if (size > MAX_BYTES) {
                        req.destroy();
                        done(reject, new Error(`Feed larger than ${MAX_BYTES} bytes`));
                        return;
                    }
                    chunks.push(c);
                });
                stream.on('end', () =>
                    done(resolve, { status, headers: res.headers, body: Buffer.concat(chunks), url }),
                );
                stream.on('error', (e) => done(reject, e));
            },
        );
        req.on('timeout', () => {
            req.destroy();
            done(reject, new Error(`Timeout after ${FETCH_TIMEOUT_MS} ms`));
        });
        req.on('error', (e) => done(reject, e));
        req.end();
    });
}

/**
 * Whether response headers allow a foreign page to frame the document.
 * X-Frame-Options DENY/SAMEORIGIN and any frame-ancestors list without `*`
 * refuse — Aura's origin is a LAN address no site whitelists.
 */
function frameAllowed(headers) {
    const xfo = String(headers['x-frame-options'] || '')
        .trim()
        .toLowerCase();
    if (xfo === 'deny' || xfo === 'sameorigin' || xfo.startsWith('allow-from')) {
        return false;
    }
    const csp = [].concat(headers['content-security-policy'] || []).join(';');
    const m = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp);
    if (m) {
        const sources = m[1].trim().split(/\s+/);
        if (!sources.includes('*')) {
            return false;
        }
    }
    return true;
}

/**
 * @param {{ log?: { debug?: (msg: string) => void } }} [opts] logger (adapter log or console)
 */
function createFeedProxy(opts = {}) {
    const log = opts.log || {};
    /** @type {Map<string, { body: Buffer, type: string, fetchedAt: number }>} */
    const cache = new Map();
    /** @type {Map<string, Promise<{ body: Buffer, type: string, fetchedAt: number }>>} */
    const inflight = new Map();
    /** @type {Map<string, { ok: boolean, at: number }>} */
    const frames = new Map();

    function remember(map, key, val, max) {
        map.delete(key);
        map.set(key, val);
        while (map.size > max) {
            map.delete(map.keys().next().value);
        }
    }

    function fetchFeed(url) {
        const key = url.href;
        let p = inflight.get(key);
        if (p) {
            return p;
        }
        p = request(url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' })
            .then((r) => {
                if (r.status < 200 || r.status >= 300) {
                    throw new Error(`HTTP ${r.status}`);
                }
                const entry = {
                    body: r.body,
                    type: String(r.headers['content-type'] || 'application/xml'),
                    fetchedAt: Date.now(),
                };
                remember(cache, key, entry, MAX_FEEDS);
                return entry;
            })
            .finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    }

    function send(res, entry, stale) {
        res.writeHead(200, {
            'Content-Type': entry.type,
            'Cache-Control': 'no-store',
            'X-Aura-Fetched-At': String(entry.fetchedAt),
            ...(stale ? { 'X-Aura-Stale': '1' } : {}),
        });
        res.end(entry.body);
    }

    function handleFeed(res, parsedUrl) {
        const url = targetUrl(parsedUrl.searchParams.get('url'));
        if (!url) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Missing or invalid url (http/https only)');
            return;
        }
        const ttlS = Math.min(
            MAX_TTL_S,
            Math.max(MIN_TTL_S, Number(parsedUrl.searchParams.get('ttl')) || DEFAULT_TTL_S),
        );
        const hit = cache.get(url.href);
        if (hit && Date.now() - hit.fetchedAt < ttlS * 1000) {
            send(res, hit, false);
            return;
        }
        fetchFeed(url).then(
            (entry) => send(res, entry, false),
            (err) => {
                log.debug?.(`aura: feed ${url.href} failed — ${err.message}`);
                if (hit) {
                    send(res, hit, true);
                    return;
                }
                res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(String(err.message || err));
            },
        );
    }

    function handleFrame(res, parsedUrl) {
        const sendJson = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(body));
        };
        const url = targetUrl(parsedUrl.searchParams.get('url'));
        if (!url) {
            return sendJson(400, { error: 'Missing or invalid url' });
        }
        const known = frames.get(url.host);
        if (known && Date.now() - known.at < FRAME_TTL_MS) {
            return sendJson(200, { embeddable: known.ok });
        }
        // Some servers answer HEAD with 405 or without the headers - then a GET,
        // whose body is never read past the cap.
        request(url, { head: true })
            .then((r) => (r.status === 405 || r.status === 501 ? request(url) : r))
            .then(
                (r) => {
                    const ok = r.status < 400 && frameAllowed(r.headers);
                    remember(frames, url.host, { ok, at: Date.now() }, MAX_FRAME_HOSTS);
                    sendJson(200, { embeddable: ok });
                },
                // Unreachable from the server: let the browser try a new tab.
                () => sendJson(200, { embeddable: false }),
            );
    }

    /** True when the request was a feed request and has been answered. */
    function handle(req, res, parsedUrl) {
        if (req.method !== 'GET') {
            return false;
        }
        if (parsedUrl.pathname === '/feed') {
            handleFeed(res, parsedUrl);
            return true;
        }
        if (parsedUrl.pathname === '/feed/frame') {
            handleFrame(res, parsedUrl);
            return true;
        }
        return false;
    }

    return { handle };
}

module.exports = { createFeedProxy, frameAllowed };
