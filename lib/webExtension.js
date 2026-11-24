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
 * On the same host it talks to Aura over a local socket / named pipe instead of
 * the port (lib/ipcEndpoint.js, #997) and falls back to TCP whenever that does
 * not answer - older Aura, Aura on another host, Aura not started yet.
 *
 * Why at all: the ioBroker Visu App and the cloud adapter only open pages of a
 * web instance, never an adapter's own port (foxriver76/ioBroker-Visu-App#72).
 *
 * The prefix is stripped and handed over in `X-Aura-Base`, so Aura writes it back
 * into every URL it generates (main.js → requestBase). The socket connection
 * does not come through here: behind the extension the frontend uses the web
 * adapter's own socket, like every other visualisation on that port.
 *
 * `/aura/mcp` is the one path that does not need web's login: an AI client has
 * its MCP token, not a web account. See publicRoutes().
 */

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { listenAddress, isLoopbackOnly, ownPortNumber } = require('./serverBind');
const { ipcPath, defaultDataRoot } = require('./ipcEndpoint');

const PREFIX = '/aura';
const BASE = `${PREFIX}/`;
/**
 * The extension that holds /aura/ on a web server. Two Aura instances on one web
 * instance would both mount it: HTTP went to the first, WebSocket upgrades to the
 * last - so the second one stays off and says so (#997). On the server object,
 * not in this module: web may load the module again on a hot reload.
 */
const OWNER = Symbol.for('iobroker.aura.webExtension.owner');
/** Aura's server is local: a request idle this long (no bytes either way) is given up. */
const FORWARD_IDLE_TIMEOUT_MS = 120000;
/** Connecting a WebSocket tunnel to Aura's server; the open tunnel has no timeout. */
const TUNNEL_CONNECT_TIMEOUT_MS = 15000;
/** The local socket answered: use it this long before asking again. */
const IPC_OK_TTL_MS = 30000;
/** The local socket did not answer: TCP for this long, then try the socket again. */
const IPC_RETRY_MS = 10000;
/** A local socket that does not accept within this time is treated as missing. */
const IPC_PROBE_TIMEOUT_MS = 1000;

/**
 * The shared React of ioBroker web components (`@iobroker/web-components`). A
 * component's module imports it relative to itself, so under `<web>/aura/` it is
 * asked from web as `/lib/esm/react-19.js` - which web only serves from 9.2.0 on.
 * Before that every React component failed with "Failed to fetch dynamically
 * imported module" (forum, web 8.0.0); Aura's own server has the files.
 */
const REACT_ESM = /^\/lib\/esm\/react-1[89]\.js(?:\?|$)/;
const WEB_HAS_REACT = [9, 2, 0];
/** Marks a React request this extension forwarded: Aura must not hand it back to web (a loop) */
const REACT_FALLBACK_HEADER = 'x-aura-react-fallback';

/**
 * Whether a version is older than a minimum - `8.0.0` < `9.2.0`. A pre-release
 * counts as its release.
 *
 * @param {string} version e.g. `8.0.0` or `9.2.0-alpha.1`
 * @param {number[]} min `[major, minor, patch]`
 * @returns {boolean|null} null when the version cannot be read
 */
function versionBelow(version, min) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
    if (!m) {
        return null;
    }
    for (let i = 0; i < 3; i++) {
        const d = Number(m[i + 1]) - min[i];
        if (d) {
            return d < 0;
        }
    }
    return false;
}

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
 * @param {NodeJS.ErrnoException} err what went wrong
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
        // The web adapter (newer than 9.3.0) may stop this object and start a new
        // one with changed settings instead of restarting itself: unload() hands
        // the upgrades back and closes the tunnels, and web takes the routes and
        // the public paths back by itself.
        this.supportsHotReload = true;
        this.adapter = adapter;
        this.server = server;
        this.secure = !!(webSettings && webSettings.secure);
        const native = (instanceSettings && instanceSettings.native) || {};
        this.port = ownPortNumber(native);
        this.targetSecure = !!native.secure;
        this.mcpEnabled = !!native.mcpEnabled;
        // Aura listens on every interface unless `native.bind` names one
        // (lib/serverBind.js) - then exactly there.
        const bindAddr = listenAddress(native.bind);
        this.host = bindAddr && bindAddr !== 'localhost' ? bindAddr : '127.0.0.1';
        this.sockets = new Set();

        // The local socket of the Aura daemon (lib/ipcEndpoint.js, #997), preferred
        // over the TCP port while it answers. Only on the same host - a multihost
        // setup keeps TCP.
        const instanceId = String((instanceSettings && instanceSettings._id) || '');
        const namespace = instanceId.startsWith('system.adapter.') ? instanceId.slice('system.adapter.'.length) : '';
        const auraHost = instanceSettings && instanceSettings.common && instanceSettings.common.host;
        const sameHost = !auraHost || !adapter || !adapter.host || auraHost === adapter.host;
        /** @type {string|null} */
        this.ipcPath = sameHost && namespace ? ipcPath(namespace, defaultDataRoot()) : null;
        /** @type {{ok: boolean, until: number}|null} */
        this.ipcState = null;
        /** @type {Promise<boolean>|null} */
        this.ipcProbe = null;
        /** @type {boolean|null} what was logged last, so a switch is logged once */
        this.ipcLogged = null;
        this.namespace = namespace;
        /** @type {string} the Aura instance that already holds /aura/ here, when not this one */
        this.shadowedBy = '';
        this.active = false;
        if (!this.claim(server, adapter)) {
            // nothing mounted, nothing intercepted - not even the MCP route
            this.mcpEnabled = false;
            return;
        }

        // Aura on another host of a multihost system: its server listens on all
        // interfaces there, so take that host's address.
        this.ready = Promise.resolve();
        if (!sameHost) {
            if (isLoopbackOnly(native.bind)) {
                adapter.log.warn(
                    `aura: web extension — Aura on host "${auraHost}" only listens on ${bindAddr}, this web instance on "${adapter.host}" cannot reach it; pick a web instance on "${auraHost}" or let Aura listen on all interfaces`,
                );
            } else if (!bindAddr) {
                this.ready = this.resolveHost(auraHost);
            }
        }

        // web before 9.2.0 has no shared React for web components: Aura's server answers
        // it. Not on a newer web (its own copy), nor when the version is unknown.
        const webVersion = (adapter && (adapter.version || (adapter.common && adapter.common.version))) || '';
        this.serveReact = versionBelow(webVersion, WEB_HAS_REACT) === true;

        app.use((req, res, next) => {
            if (
                this.serveReact &&
                (req.method === 'GET' || req.method === 'HEAD') &&
                REACT_ESM.test(req.url || '') &&
                !req.headers[REACT_FALLBACK_HEADER]
            ) {
                this.forward(req, res, req.url, { [REACT_FALLBACK_HEADER]: '1' });
                return;
            }
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
            this.forward(req, res, rest);
        });

        // WebSockets under /aura/ (the iframe proxy's `/aura/proxyws`). The web
        // adapter's socket server - on a pure-WebSocket instance @iobroker/ws -
        // answers EVERY upgrade, whatever the path, and every listener of an event
        // is called. So ours are taken out of `emit` before any listener sees
        // them, and the listeners of the server stay exactly as they are: other
        // extensions look at them (victron-cerbo destroys an upgrade when its
        // fallback is the only listener left, which closed every socket connection
        // of web right after the handshake while Aura held the listeners itself),
        // and socket.io's own dispatch stays untouched (#784).
        const emit = server.emit;
        this.serverEmit = emit;
        this.active = true;
        this.interceptedEmit = (event, ...args) => {
            if (event === 'upgrade' && this.active) {
                const [req, socket, head] = args;
                const rest = stripPrefix(req && req.url);
                if (rest !== null && rest !== '') {
                    this.tunnel(req, socket, head, rest);
                    return true;
                }
            }
            return emit.apply(server, [event, ...args]);
        };
        server.emit = /** @type {any} */ (this.interceptedEmit);
        // Node.js only emits `upgrade` while somebody listens to it. A web instance
        // always has its socket server; without one, close the upgrades that are
        // not ours instead of leaving them open.
        /** @type {((req: http.IncomingMessage, socket: import('node:stream').Duplex) => void) | null} */
        this.onUpgrade = null;
        if (server.listenerCount('upgrade') === 0) {
            this.onUpgrade = (_req, socket) => {
                if (server.listenerCount('upgrade') === 1) {
                    socket.destroy();
                }
            };
            server.on('upgrade', this.onUpgrade);
        }

        adapter.log.info(
            `aura: web extension active — ${BASE} is forwarded to ${this.ipcPath ? `the local socket ${this.ipcPath}, else to ` : ''}${this.targetSecure ? 'https' : 'http'}://${this.host}:${this.port}`,
        );
        if (this.serveReact) {
            adapter.log.info(
                `aura: web extension — web ${webVersion} has no /lib/esm/react-19.js (from 9.2.0 on), Aura serves it for web components`,
            );
        }
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
     * The local socket while it answers, else null (= TCP). Asks the socket at
     * most every IPC_OK_TTL_MS, after a failure not before IPC_RETRY_MS: Aura
     * started after web, or restarted, is picked up without restarting web.
     *
     * @returns {Promise<string|null>} the socket path, or null for TCP
     */
    async route() {
        if (!this.ipcPath) {
            return null;
        }
        const st = this.ipcState;
        if (st && Date.now() < st.until) {
            return st.ok ? this.ipcPath : null;
        }
        if (!this.ipcProbe) {
            const where = this.ipcPath;
            this.ipcProbe = new Promise((resolve) => {
                const s = net.connect({ path: where });
                const done = (ok) => {
                    s.destroy();
                    resolve(ok);
                };
                s.setTimeout(IPC_PROBE_TIMEOUT_MS, () => done(false));
                s.once('connect', () => done(true));
                s.once('error', () => done(false));
            }).then((ok) => {
                this.ipcProbe = null;
                this.noteIpc(ok);
                return ok;
            });
        }
        return (await this.ipcProbe) ? this.ipcPath : null;
    }

    /**
     * Remembers whether the local socket answers, and logs a change once.
     *
     * @param {boolean} ok whether it answered
     * @param {string} [why] what failed, for the log
     */
    noteIpc(ok, why) {
        this.ipcState = { ok, until: Date.now() + (ok ? IPC_OK_TTL_MS : IPC_RETRY_MS) };
        if (this.ipcLogged === ok) {
            return;
        }
        // First answer = no news unless it is the socket; the fallback itself is normal
        // (older Aura, Aura not started yet) and only worth a debug line.
        if (ok) {
            this.adapter.log.info(`aura: web extension — forwarding over the local socket ${this.ipcPath}`);
        } else {
            const msg = `aura: web extension — local socket ${this.ipcPath} not available${why ? ` (${why})` : ''}, forwarding to ${this.target}`;
            if (this.ipcLogged === true) {
                this.adapter.log.info(msg);
            } else {
                this.adapter.log.debug(msg);
            }
        }
        this.ipcLogged = ok;
    }

    /**
     * One HTTP request to Aura's server and its answer back.
     *
     * @param {object} req the express request
     * @param {import('node:http').ServerResponse} res the response to the browser
     * @param {string} path the URL below the prefix
     * @param {object} [extra] headers added to the request
     */
    forward(req, res, path, extra) {
        this.ready.then(() => this.route()).then((ipc) => this.send(req, res, path, extra, ipc));
    }

    /**
     * forward() over one transport. Over the local socket the request body is
     * only piped once the connection stands, so a socket that is gone (Aura
     * stopped, restarting) costs nothing: the same request goes out over TCP.
     *
     * @param {object} req the express request
     * @param {import('node:http').ServerResponse} res the response to the browser
     * @param {string} path the URL below the prefix
     * @param {object|undefined} extra headers added to the request
     * @param {string|null} ipc the local socket, or null for TCP
     */
    send(req, res, path, extra, ipc) {
        try {
            const headers = { ...forwardHeaders(req, this.secure), ...extra };
            const body = parsedBody(req);
            if (body) {
                headers['content-length'] = String(body.length);
                delete headers['transfer-encoding'];
            }
            // The local socket is plain HTTP: it never leaves this machine.
            const lib = !ipc && this.targetSecure ? https : http;
            const target = ipc
                ? { socketPath: ipc }
                : { hostname: this.host, port: this.port, rejectUnauthorized: false };
            let connected = !ipc;
            const up = lib.request(
                {
                    ...target,
                    path,
                    method: req.method,
                    headers,
                    timeout: FORWARD_IDLE_TIMEOUT_MS,
                },
                (upRes) => {
                    /** @type {import('node:http').OutgoingHttpHeaders} */
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
            up.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
                if (ipc && !connected && !res.headersSent && !res.destroyed) {
                    this.noteIpc(false, e.code || e.message);
                    this.send(req, res, path, extra, null);
                    return;
                }
                unreachable(res, this.target, e);
            });
            up.on('timeout', () => up.destroy(new Error(`no answer within ${FORWARD_IDLE_TIMEOUT_MS} ms`)));
            // The browser went away (tab closed, iframe navigated): stop the upstream too.
            res.on('close', () => {
                if (!res.writableFinished) {
                    up.destroy();
                }
            });
            const start = () => {
                connected = true;
                if (body) {
                    up.end(body);
                } else {
                    req.pipe(up);
                }
            };
            if (connected) {
                start();
            } else {
                // A kept-alive socket of the agent is connected already.
                up.once('socket', (s) => (s.connecting ? s.once('connect', start) : start()));
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
        this.ready.then(() => this.route()).then((ipc) => this.open(req, socket, head, path, ipc));
    }

    /**
     * tunnel() over one transport. A local socket that does not connect hands
     * the browser's connection - nothing written to it yet - on to TCP.
     *
     * @param {import('node:http').IncomingMessage} req the upgrade request
     * @param {import('node:net').Socket} socket the browser's connection
     * @param {Buffer} head bytes already read past the request head
     * @param {string} path the URL below the prefix
     * @param {string|null} ipc the local socket, or null for TCP
     */
    open(req, socket, head, path, ipc) {
        let up;
        let connected = false;
        let handedOver = false;
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
            if (ipc) {
                up = net.connect({ path: ipc }, onConnect);
            } else if (this.targetSecure) {
                up = tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false }, onConnect);
            } else {
                up = net.connect({ host: this.host, port: this.port }, onConnect);
            }
            // Socket timeout is cleared in onConnect; until then a silent target is dropped.
            up.setTimeout(TUNNEL_CONNECT_TIMEOUT_MS, () => {
                if (!connected) {
                    up.destroy(new Error(`no connection within ${TUNNEL_CONNECT_TIMEOUT_MS} ms`));
                }
            });
            this.sockets.add(up);
            this.sockets.add(socket);
            const closeBoth = () => {
                this.sockets.delete(up);
                up.destroy();
                if (handedOver) {
                    return;
                }
                this.sockets.delete(socket);
                socket.destroy();
            };
            up.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
                if (ipc && !connected && !handedOver) {
                    handedOver = true;
                    socket.removeListener('error', closeBoth);
                    socket.removeListener('close', closeBoth);
                    closeBoth();
                    this.noteIpc(false, e.code || e.message);
                    this.open(req, socket, head, path, null);
                    return;
                }
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

    /**
     * Paths the web adapter hands over in front of its own login (web newer than
     * 9.2.0 asks for them once, right after the constructor; older versions never
     * do, and `/aura/mcp` then stays behind the login like every other path).
     *
     * `/aura/mcp` authenticates with Aura's MCP token. An AI client has no web
     * account, and with authentication switched on in the web instance its OAuth2
     * layer answered that token with 401 before the request ever got here. Only
     * while MCP is enabled: switching it rewrites the instance object, and the web
     * instance starts this extension again (or restarts itself) and asks again.
     *
     * The request arrives as it came in, its body unread — forward() pipes it.
     *
     * @returns {{path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}[]} the paths and their handler
     */
    publicRoutes() {
        if (!this.mcpEnabled) {
            return [];
        }
        return [
            {
                path: `${PREFIX}/mcp`,
                handler: (req, res) => {
                    const rest = stripPrefix(req.url) || '/mcp';
                    this.forward(req, res, rest);
                },
            },
        ];
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

    /**
     * Takes /aura/ on this web server, unless another Aura instance holds it.
     * The same instance again (a hot reload before the old one unloaded) takes over.
     *
     * @param {any} server the web adapter's http(s) server
     * @param {any} adapter the web adapter instance
     * @returns {boolean} whether this extension serves /aura/
     */
    claim(server, adapter) {
        const owner = server && server[OWNER];
        // without an instance id (old web) there is nothing to tell apart
        const other = owner && owner !== this && owner.active && owner.namespace && this.namespace;
        if (other && owner.namespace !== this.namespace) {
            this.shadowedBy = owner.namespace;
            const me = this.namespace || 'this Aura instance';
            adapter.log.warn(
                `aura: web extension of ${me} stays off — ${BASE} on this web instance is already served by ${owner.namespace}. A web instance serves one Aura instance: choose another web instance for ${me} (or none, then it opens its own port)`,
            );
            return false;
        }
        if (server) {
            server[OWNER] = this;
        }
        return true;
    }

    /** Called by the web adapter before it stops: hand the upgrades back, close tunnels. */
    unload() {
        if (this.server && this.server[OWNER] === this) {
            delete this.server[OWNER];
        }
        // Wrapped again by somebody else in the meantime: putting the old `emit`
        // back would cut them off, so ours only stops taking upgrades.
        this.active = false;
        try {
            if (this.server.emit === this.interceptedEmit) {
                this.server.emit = this.serverEmit;
            }
            if (this.onUpgrade) {
                this.server.removeListener('upgrade', this.onUpgrade);
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
module.exports.versionBelow = versionBelow;
module.exports.REACT_FALLBACK_HEADER = REACT_FALLBACK_HEADER;
