'use strict';

/**
 * Optional web adapter extension: makes Aura reachable as `<web-port>/aura/`.
 *
 * Off unless `native.webInstance` names a web instance (Aura instance settings →
 * "Web adapter extension"). The web adapter then loads this file and Aura keeps
 * running on its own server (port 8095, unchanged) — this file only forwards
 * every request under `/aura/` to that server, HTTP and WebSocket alike. It has
 * no logic of its own on purpose: the web adapter keeps the code it loaded until
 * it restarts, so anything that could change between versions lives in main.js.
 *
 * Why at all: the ioBroker Visu App and the cloud adapter only open pages of a
 * web instance, never an adapter's own port (foxriver76/ioBroker-Visu-App#72).
 *
 * The prefix is stripped and handed over in `X-Aura-Base`, so Aura writes it back
 * into every URL it generates (main.js → requestBase). The socket connection
 * does not come through here: behind the extension the frontend uses the web
 * adapter's own socket, like every other visualisation on that port.
 */

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

const PREFIX = '/aura';
const BASE = `${PREFIX}/`;
const DEFAULT_PORT = 8095;

// Hop-by-hop headers (RFC 7230 §6.1) belong to one connection, not to the request.
const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

/**
 * `/aura`, `/aura/…`, `/aura?…` → the path Aura's own server expects, else null.
 *
 * @param {string} url the request URL (path + query)
 * @returns {string|null} `/…` below the prefix, `''` for the bare prefix, or null
 */
function stripPrefix(url) {
    if (typeof url !== 'string' || !url.startsWith(PREFIX)) {
        return null;
    }
    const rest = url.slice(PREFIX.length);
    if (rest === '' || rest[0] === '?') {
        return '';
    }
    return rest[0] === '/' ? rest : null;
}

/**
 * The body the web adapter's body-parser already consumed, serialised again.
 * The web adapter parses JSON, urlencoded and text bodies before any extension
 * sees the request, so the stream is empty by then.
 *
 * @param {object} req the express request
 * @returns {Buffer|null} the body, or null when the stream is still unread
 */
function parsedBody(req) {
    // A body-parser that read the request has drained its stream (1.x also sets
    // `_body`); anything it did not parse (multipart, binary) is still in the
    // stream and is piped through.
    const consumed = req._body || req.readableEnded || (req.complete && req.readable === false);
    if (!consumed) {
        return null;
    }
    const body = req.body;
    if (body === undefined || body === null) {
        return Buffer.alloc(0);
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    if (typeof body === 'string') {
        return Buffer.from(body, 'utf8');
    }
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
        return Buffer.from(encodeForm(body), 'utf8');
    }
    return Buffer.from(JSON.stringify(body), 'utf8');
}

/**
 * Form fields back into `a=1&b[c]=2` (the web adapter parses with `extended: true`).
 *
 * @param {object} obj the parsed fields
 * @param {string} [prefix] the key of the enclosing object
 * @returns {string} the urlencoded body
 */
function encodeForm(obj, prefix) {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}[${Array.isArray(obj) ? '' : k}]` : k;
        if (v !== null && typeof v === 'object') {
            const inner = encodeForm(v, key);
            if (inner) {
                parts.push(inner);
            }
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v === undefined || v === null ? '' : v)}`);
        }
    }
    return parts.join('&');
}

/**
 * Headers for the request to Aura: hop-by-hop ones dropped, prefix and client named.
 *
 * @param {import('node:http').IncomingMessage} req the incoming request
 * @param {boolean} secure whether the client talks HTTPS to the web adapter
 * @returns {object} the headers
 */
function forwardHeaders(req, secure) {
    const out = {};
    for (const [k, v] of Object.entries(req.headers)) {
        // HTTP/2 pseudo-headers (`:authority`, `:path`, …): the web adapter serves
        // HTTPS as HTTP/2, and node's HTTP/1 client rejects these names outright
        // (ERR_INVALID_HTTP_TOKEN).
        if (k.startsWith(':') || HOP_BY_HOP.has(k.toLowerCase()) || v === undefined) {
            continue;
        }
        out[k] = v;
    }
    // HTTP/2 names the host only in `:authority`; HTTP/1 needs a Host header.
    const host = req.headers.host || req.headers[':authority'];
    if (host) {
        out.host = host;
    }
    out['x-aura-base'] = BASE;
    const clientIp = req.socket && req.socket.remoteAddress;
    const prior = req.headers['x-forwarded-for'];
    const xff = prior ? (clientIp ? `${prior}, ${clientIp}` : String(prior)) : clientIp;
    if (xff) {
        out['x-forwarded-for'] = xff;
    }
    out['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || (secure ? 'https' : 'http');
    if (host) {
        out['x-forwarded-host'] = req.headers['x-forwarded-host'] || host;
    }
    return out;
}

/**
 * A short page instead of a hanging request when Aura's server does not answer.
 *
 * @param {import('node:http').ServerResponse} res the response to the browser
 * @param {string} target where Aura was expected, for the page
 * @param {Error} err what went wrong
 */
function unreachable(res, target, err) {
    if (res.headersSent) {
        res.end();
        return;
    }
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(
        '<!doctype html><meta charset="utf-8"><title>Aura</title>' +
            '<body style="font-family:system-ui,sans-serif;padding:2em;background:#0f172a;color:#cbd5e1">' +
            '<h2 style="margin-top:0">Aura is not reachable</h2>' +
            `<p>The web adapter forwards <code>${BASE}</code> to Aura's own server at ` +
            `<code>${target}</code>, which did not answer (${String(err && err.code ? err.code : err && err.message ? err.message : err).replace(/[<>&]/g, '')}).</p>` +
            '<p>Is the Aura instance running?</p></body>',
    );
}

/** Loaded by the web adapter; the class name has to match the file name. */
class webExtension {
    /**
     * Called by the web adapter (src/main.ts, "Start web-extension").
     *
     * @param {import('node:http').Server} server the web adapter's HTTP(S) server
     * @param {object} webSettings `{ secure, port, language, defaultUser, auth }` of the web instance
     * @param {object} adapter the web adapter instance
     * @param {object} instanceSettings the Aura instance object (`system.adapter.aura.N`)
     * @param {object} app the web adapter's express app
     */
    constructor(server, webSettings, adapter, instanceSettings, app) {
        this.adapter = adapter;
        this.server = server;
        this.secure = !!(webSettings && webSettings.secure);
        const native = (instanceSettings && instanceSettings.native) || {};
        this.port = Number(native.port) || DEFAULT_PORT;
        this.targetSecure = !!native.secure;
        this.host = '127.0.0.1';
        this.sockets = new Set();

        // Aura on another host of a multihost system: its server listens on all
        // interfaces there, so take that host's address.
        const auraHost = instanceSettings && instanceSettings.common && instanceSettings.common.host;
        this.ready = Promise.resolve();
        if (auraHost && adapter && adapter.host && auraHost !== adapter.host) {
            this.ready = this.resolveHost(auraHost);
        }

        app.use((req, res, next) => {
            const rest = stripPrefix(req.url);
            if (rest === null) {
                return next();
            }
            if (rest === '') {
                // `./assets/…` only resolves below `/aura/` with the trailing slash.
                const q = req.url.slice(PREFIX.length);
                res.writeHead(301, { Location: `${BASE}${q}` });
                res.end();
                return;
            }
            this.ready.then(() => this.forward(req, res, rest));
        });

        // WebSockets under /aura/ (the iframe proxy's `/aura/proxyws`). A
        // pure-WebSocket web instance (@iobroker/ws) answers EVERY upgrade on the
        // server, whatever the path — so the existing listeners are wrapped and
        // only see the upgrades that are not ours. unload() restores them.
        this.upgradeListeners = server.listeners('upgrade');
        server.removeAllListeners('upgrade');
        this.onUpgrade = (req, socket, head) => {
            const rest = stripPrefix(req.url);
            if (rest === null || rest === '') {
                for (const l of this.upgradeListeners) {
                    l.call(server, req, socket, head);
                }
                return;
            }
            this.ready.then(() => this.tunnel(req, socket, head, rest));
        };
        server.on('upgrade', this.onUpgrade);

        adapter.log.info(
            `aura: web extension active — ${BASE} is forwarded to ${this.targetSecure ? 'https' : 'http'}://${this.host}:${this.port}`,
        );
    }

    /**
     * Where Aura listens when it runs on another host than this web instance.
     *
     * @param {string} hostName the js-controller host Aura runs on
     */
    async resolveHost(hostName) {
        try {
            const obj = await this.adapter.getForeignObjectAsync(`system.host.${hostName}`);
            const addrs = (obj && obj.common && obj.common.address) || [];
            const pick =
                addrs.find((a) => net.isIPv4(a) && !a.startsWith('127.')) ||
                addrs.find((a) => net.isIP(a) && a !== '::1' && !a.startsWith('127.'));
            if (pick) {
                this.host = pick;
                this.adapter.log.info(`aura: web extension — Aura runs on host "${hostName}", forwarding to ${pick}`);
            }
        } catch (e) {
            this.adapter.log.warn(`aura: web extension — address of host "${hostName}" unknown (${e.message})`);
        }
    }

    /** Aura's server as a URL, for messages. */
    get target() {
        return `${this.targetSecure ? 'https' : 'http'}://${net.isIPv6(this.host) ? `[${this.host}]` : this.host}:${this.port}`;
    }

    /**
     * One HTTP request to Aura's server and its answer back.
     *
     * @param {object} req the express request
     * @param {import('node:http').ServerResponse} res the response to the browser
     * @param {string} path the URL below the prefix
     */
    forward(req, res, path) {
        try {
            const headers = forwardHeaders(req, this.secure);
            const body = parsedBody(req);
            if (body) {
                headers['content-length'] = String(body.length);
                delete headers['transfer-encoding'];
            }
            const lib = this.targetSecure ? https : http;
            const up = lib.request(
                {
                    hostname: this.host,
                    port: this.port,
                    path,
                    method: req.method,
                    headers,
                    rejectUnauthorized: false,
                },
                (upRes) => {
                    const out = {};
                    for (const [k, v] of Object.entries(upRes.headers)) {
                        if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
                            out[k] = v;
                        }
                    }
                    res.writeHead(upRes.statusCode || 502, out);
                    upRes.pipe(res);
                },
            );
            up.on('error', (e) => unreachable(res, this.target, e));
            // The browser went away (tab closed, iframe navigated): stop the upstream too.
            res.on('close', () => {
                if (!res.writableFinished) {
                    up.destroy();
                }
            });
            if (body) {
                up.end(body);
            } else {
                req.pipe(up);
            }
        } catch (e) {
            this.adapter.log.warn(`aura: web extension — forwarding ${req.url} failed: ${e.message}`);
            unreachable(res, this.target, e);
        }
    }

    /**
     * A WebSocket upgrade, tunnelled byte for byte to Aura's server.
     *
     * @param {import('node:http').IncomingMessage} req the upgrade request
     * @param {import('node:net').Socket} socket the browser's connection
     * @param {Buffer} head bytes already read past the request head
     * @param {string} path the URL below the prefix
     */
    tunnel(req, socket, head, path) {
        let up;
        let connected = false;
        const fail = () => {
            if (socket.writable) {
                socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
            }
            socket.destroy();
        };
        try {
            const headers = forwardHeaders(req, this.secure);
            // An upgrade needs exactly these two back; everything else hop-by-hop stays dropped.
            headers.connection = 'Upgrade';
            headers.upgrade = req.headers.upgrade || 'websocket';
            const lines = [`${req.method} ${path} HTTP/1.1`];
            for (const [k, v] of Object.entries(headers)) {
                for (const one of Array.isArray(v) ? v : [v]) {
                    lines.push(`${k}: ${one}`);
                }
            }
            const request = `${lines.join('\r\n')}\r\n\r\n`;
            const onConnect = () => {
                connected = true;
                up.write(request);
                if (head && head.length) {
                    up.write(head);
                }
                for (const s of [socket, up]) {
                    s.setTimeout(0);
                    s.setNoDelay(true);
                    s.setKeepAlive(true, 30000);
                }
                up.pipe(socket);
                socket.pipe(up);
            };
            up = this.targetSecure
                ? tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false }, onConnect)
                : net.connect({ host: this.host, port: this.port }, onConnect);
            this.sockets.add(up);
            this.sockets.add(socket);
            const closeBoth = () => {
                this.sockets.delete(up);
                this.sockets.delete(socket);
                socket.destroy();
                up.destroy();
            };
            up.on('error', (e) => {
                this.adapter.log.debug(`aura: web extension — WebSocket ${req.url}: ${e.message}`);
                if (!connected) {
                    fail();
                }
                closeBoth();
            });
            socket.on('error', closeBoth);
            up.on('close', closeBoth);
            socket.on('close', closeBoth);
        } catch (e) {
            this.adapter.log.warn(`aura: web extension — WebSocket ${req.url} failed: ${e.message}`);
            fail();
            if (up) {
                up.destroy();
            }
        }
    }

    /** Tile on the web adapter's start page. */
    welcomePage() {
        // The start page only shows entries with a relative `localLink`
        // (src-www/src/Intro.tsx); `link` alone is dropped.
        return {
            link: 'aura/',
            localLink: 'aura/',
            name: 'Aura',
            img: 'adapter/aura/aura.png',
            color: '#6366f1',
            order: 10,
            pro: false,
        };
    }

    /** Called by the web adapter before it stops: hand the upgrades back, close tunnels. */
    unload() {
        try {
            this.server.removeListener('upgrade', this.onUpgrade);
            for (const l of this.upgradeListeners) {
                if (!this.server.listeners('upgrade').includes(l)) {
                    this.server.on('upgrade', l);
                }
            }
        } catch {
            /* the server is going down anyway */
        }
        for (const s of this.sockets) {
            s.destroy();
        }
        this.sockets.clear();
        return Promise.resolve();
    }
}

module.exports = webExtension;
module.exports.webExtension = webExtension;
module.exports.stripPrefix = stripPrefix;
module.exports.encodeForm = encodeForm;
module.exports.forwardHeaders = forwardHeaders;
