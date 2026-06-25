'use strict';

const utils = require('@iobroker/adapter-core');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const SunCalc = require('suncalc');

// ── Calendar fetch helper ────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15000;

function fetchUrl(url, _depth = 0) {
    if (_depth > 5) return Promise.reject(new Error('Too many redirects'));
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, val) => {
            if (!settled) {
                settled = true;
                fn(val);
            }
        };

        const target = new URL(url);
        const lib = target.protocol === 'https:' ? https : http;
        const options = {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: 'GET',
            timeout: FETCH_TIMEOUT_MS,
            headers: {
                'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
                Accept: 'text/calendar, */*',
            },
        };
        const req = lib.request(options, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                fetchUrl(res.headers.location, _depth + 1)
                    .then((v) => done(resolve, v))
                    .catch((e) => done(reject, e));
                return;
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => done(resolve, data));
        });
        req.on('timeout', () => {
            req.destroy();
            done(reject, new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`));
        });
        req.on('error', (e) => done(reject, e));
        req.end();
    });
}

// ── Proxy helpers ────────────────────────────────────────────────────────────

const STRIP_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'x-content-type-options',
    'x-xss-protection',
    'cross-origin-resource-policy',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
]);

const PROXY_TIMEOUT_MS = 15_000;

function rewriteHtml(html, baseUrl) {
    function toProxy(url) {
        if (!url) return url;
        const trimmed = url.trim();
        if (/^(data:|javascript:|blob:|mailto:|tel:|#)/.test(trimmed)) return url;
        try {
            const abs = new URL(trimmed, baseUrl).toString();
            return `/proxy?url=${encodeURIComponent(abs)}`;
        } catch {
            return url;
        }
    }

    const SKIP_RE = /(<(?:script|style)\b[^>]*>)([\s\S]*?)(<\/(?:script|style)>)/gi;

    function rewriteSegment(seg) {
        let out = seg.replace(/<base\b[^>]*>/gi, '');
        out = out.replace(
            /\b(src|href|action)(\s*=\s*)(["'])([^"']*)\3/gi,
            (_, attr, eq, q, url) => `${attr}${eq}${q}${toProxy(url)}${q}`,
        );
        out = out.replace(/<form\b([^>]*)>/gi, (match, attrs) => {
            if (/\baction\s*=/i.test(attrs)) return match;
            return `<form${attrs} action="${toProxy(baseUrl)}">`;
        });
        out = out.replace(/\bsrcset(\s*=\s*)(["'])([^"']*)\2/gi, (_, eq, q, val) => {
            const rw = val.replace(/([^,\s]+)(\s*(?:[^,]*))/g, (m, url, rest) => toProxy(url) + rest);
            return `srcset${eq}${q}${rw}${q}`;
        });
        return out;
    }

    const parts = [];
    let last = 0;
    let m;
    SKIP_RE.lastIndex = 0;
    while ((m = SKIP_RE.exec(html)) !== null) {
        parts.push(rewriteSegment(html.slice(last, m.index)));
        parts.push(rewriteSegment(m[1]) + m[2] + m[3]);
        last = m.index + m[0].length;
    }
    parts.push(rewriteSegment(html.slice(last)));
    let out = parts.join('');

    const targetOrigin = new URL(baseUrl).origin;
    const tgtNoProto = targetOrigin.replace(/^https?:/, '');
    const wsProto = targetOrigin.startsWith('https:') ? 'wss:' : 'ws:';
    const wsSnippet =
        `<script>(function(){` +
        `var tgt=${JSON.stringify(targetOrigin)},tgtNP=${JSON.stringify(tgtNoProto)},wsp=${JSON.stringify(wsProto)};` +
        `history.replaceState(history.state,'','/');` +
        `function rw(u){` +
        `try{` +
        `var s=String(u);` +
        `if(s.startsWith('/proxy'))return u;` +
        `if(s.charAt(0)==='/'&&s.charAt(1)!=='/'){` +
        `return '/proxy?url='+encodeURIComponent(tgt+s);` +
        `}` +
        `var a=new URL(s,location.href);` +
        `if((a.origin===location.origin&&!a.pathname.startsWith('/proxy'))||a.origin===tgt){` +
        `return '/proxy?url='+encodeURIComponent(tgt+a.pathname+a.search+a.hash);` +
        `}` +
        `}catch(e){}` +
        `return u;` +
        `}` +
        `var _W=window.WebSocket;` +
        `window.WebSocket=function(u,p){` +
        `try{` +
        `var a=new URL(u.replace(/^wss?:/,'https:'),location.href);` +
        `if(a.pathname==='/proxyws')return new _W(u,p);` +
        `if(a.origin===location.origin||a.origin===tgt){` +
        `u='/proxyws?url='+encodeURIComponent(wsp+tgtNP+a.pathname+(a.search||''));` +
        `}` +
        `}catch(e){}` +
        `return new _W(u,p);` +
        `};` +
        `Object.assign(window.WebSocket,_W);` +
        `var _xo=XMLHttpRequest.prototype.open;` +
        `XMLHttpRequest.prototype.open=function(){` +
        `if(arguments[1])arguments[1]=rw(String(arguments[1]));` +
        `return _xo.apply(this,arguments);` +
        `};` +
        `var _f=window.fetch;` +
        `if(_f)window.fetch=function(r,o){` +
        `if(typeof r==='string')r=rw(r);` +
        `return _f.call(window,r,o);` +
        `};` +
        `try{` +
        `var _lp=Object.getPrototypeOf(location),_hd=Object.getOwnPropertyDescriptor(_lp,'href');` +
        `if(_hd&&_hd.set)Object.defineProperty(_lp,'href',{get:_hd.get,set:function(u){_hd.set.call(this,rw(String(u)));},configurable:true});` +
        `}catch(e){}` +
        `['assign','replace'].forEach(function(m){` +
        `var o=location[m].bind(location);` +
        `try{location[m]=function(u){o(rw(u));};}catch(e){}` +
        `});` +
        `document.addEventListener('click',function(e){` +
        `if(e.defaultPrevented)return;` +
        `var el=e.target;` +
        `while(el&&el.tagName!=='A')el=el.parentElement;` +
        `if(!el)return;` +
        `var h=el.getAttribute('href');` +
        `if(!h)return;` +
        `var rh=rw(h);` +
        `if(rh!==h){e.preventDefault();location.href=rh;}` +
        `},false);` +
        `document.addEventListener('submit',function(e){` +
        `var form=e.target;` +
        `if(!form||form.tagName!=='FORM')return;` +
        `var act=form.getAttribute('action')||'';` +
        `if(act.indexOf('/proxy')===0)return;` +
        `var abs=form.action;` +
        `var rh=rw(abs);` +
        `if(rh!==abs){e.preventDefault();form.setAttribute('action',rh);form.submit();}` +
        `},true);` +
        `try{` +
        `function rwAttr(el,a){var v=el.getAttribute&&el.getAttribute(a);if(v){var r=rw(v);if(r!==v)el.setAttribute(a,r);}}` +
        `function rwTree(n){` +
        `if(n.nodeType!==1)return;` +
        `rwAttr(n,'src');` +
        `try{n.querySelectorAll('[src]').forEach(function(c){rwAttr(c,'src');});}catch(e){}` +
        `}` +
        `var _mo=new MutationObserver(function(muts){` +
        `muts.forEach(function(m){` +
        `if(m.type==='attributes'){rwAttr(m.target,m.attributeName);}` +
        `else{m.addedNodes.forEach(rwTree);}` +
        `});` +
        `});` +
        `_mo.observe(document,{attributes:true,attributeFilter:['src'],childList:true,subtree:true});` +
        `}catch(e){}` +
        `})();</script>`;

    if (/<\/head>/i.test(out)) {
        out = out.replace(/<\/head>/i, `${wsSnippet}</head>`);
    } else if (/<head>/i.test(out)) {
        out = out.replace(/<head>/i, `<head>${wsSnippet}`);
    } else {
        out = wsSnippet + out;
    }
    return out;
}

function rewriteCss(css, baseUrl) {
    function toProxy(url) {
        const trimmed = url.replace(/^['"]|['"]$/g, '').trim();
        if (!trimmed || /^(data:|#)/.test(trimmed)) return url;
        try {
            return `'${`/proxy?url=${encodeURIComponent(new URL(trimmed, baseUrl).toString())}`}'`;
        } catch {
            return url;
        }
    }
    return css.replace(/url\(([^)]*)\)/gi, (_, inner) => `url(${toProxy(inner)})`);
}

function bufferResponse(proxyRes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        proxyRes.on('data', (c) => chunks.push(c));
        proxyRes.on('end', () => resolve(Buffer.concat(chunks)));
        proxyRes.on('error', reject);
    });
}

function buildFwdHeaders(req) {
    const h = {
        Accept: req.headers['accept'] || 'text/html,*/*',
        'Accept-Language': req.headers['accept-language'] || 'en',
        'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
    };
    for (const k of ['content-type', 'content-length', 'cookie', 'x-csrftoken', 'x-requested-with']) {
        if (req.headers[k])
            h[
                k
                    .split('-')
                    .map((p) => p[0].toUpperCase() + p.slice(1))
                    .join('-')
            ] = req.headers[k];
    }
    return h;
}

function buildHeaders(incoming) {
    const out = {};
    for (const [key, val] of Object.entries(incoming)) {
        if (!STRIP_HEADERS.has(key.toLowerCase())) out[key] = val;
    }
    return out;
}

// Add/extend the X-Forwarded-* chain on requests we forward to the backend
// (web/socketio adapter). Without this the backend sees every proxied
// connection as coming from 127.0.0.1 (the aura proxy) and logs noise like
// `No sid found from ::ffff:127.0.0.1`; with it the real client IP/proto is
// preserved. Respects an upstream proxy's existing headers (e.g. nginx in
// front of aura) by appending rather than overwriting.
function applyForwardedHeaders(headers, req) {
    const prior = req.headers['x-forwarded-for'];
    const clientIp = req.socket && req.socket.remoteAddress;
    const xff = prior ? (clientIp ? `${prior}, ${clientIp}` : String(prior)) : clientIp;
    if (xff) {
        headers['X-Forwarded-For'] = xff;
        // Real client = first hop in the chain.
        headers['X-Real-IP'] = req.headers['x-real-ip'] || String(xff).split(',')[0].trim();
    }
    headers['X-Forwarded-Proto'] =
        req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
    if (req.headers['host']) headers['X-Forwarded-Host'] = req.headers['x-forwarded-host'] || req.headers['host'];
}

function proxyWebSocket(req, socket, targetWsUrl, log, sendForwardedFor = true) {
    let targetUrl;
    try {
        targetUrl = new URL(targetWsUrl);
        if (!['ws:', 'wss:'].includes(targetUrl.protocol)) throw new Error('Only ws/wss');
    } catch {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    const isSecure = targetUrl.protocol === 'wss:';
    const lib = isSecure ? https : http;
    const opts = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isSecure ? 443 : 80),
        path: targetUrl.pathname + (targetUrl.search || ''),
        method: 'GET',
        headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            Host: targetUrl.host,
            'Sec-WebSocket-Version': req.headers['sec-websocket-version'] || '13',
            'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
        },
        rejectUnauthorized: false,
    };
    if (req.headers['sec-websocket-protocol'])
        opts.headers['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol'];
    if (req.headers['cookie']) opts.headers['Cookie'] = req.headers['cookie'];
    if (sendForwardedFor) applyForwardedHeaders(opts.headers, req);

    const proxyReq = lib.request(opts);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        const lines = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}`,
        ];
        if (proxyRes.headers['sec-websocket-protocol'])
            lines.push(`Sec-WebSocket-Protocol: ${proxyRes.headers['sec-websocket-protocol']}`);
        socket.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        proxySocket.on('error', () => socket.destroy());
        socket.on('error', () => proxySocket.destroy());
    });
    proxyReq.on('error', (e) => {
        log.debug(`aura: WS proxy error for ${targetWsUrl}: ${e.message}`);
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
    });
    proxyReq.end();
}

// ── Socket.io backend auto-detection ────────────────────────────────────────

const SOCKET_BACKEND_WILDCARDS = new Set(['0.0.0.0', '::', '::0', '']);

function pickSocketBackend(objectsMap, socketPort) {
    const fallback = { host: '127.0.0.1', secure: false, pureWs: false, source: null, found: false, conflicts: [] };
    const port = Number(socketPort);
    if (!Number.isFinite(port) || port <= 0) return fallback;
    const candidates = [];
    for (const [id, obj] of Object.entries(objectsMap || {})) {
        const name = obj?.common?.name;
        if (name !== 'web' && name !== 'socketio') continue;
        if (!obj.common?.enabled) continue;
        const native = obj.native || {};
        if (Number(native.port) !== port) continue;
        candidates.push({ id, native });
    }
    if (!candidates.length) return fallback;
    candidates.sort((a, b) => a.id.localeCompare(b.id));
    const pick = candidates[0];
    const bind = String(pick.native.bind || '').trim();
    const host = SOCKET_BACKEND_WILDCARDS.has(bind) ? '127.0.0.1' : bind;
    const secure = !!pick.native.secure;
    // Socket transport mode of the web/socketio instance:
    //  - usePureWebSockets (@iobroker/ws): the client connects at the root path
    //    (/?sid=) and the server only accepts the connection as a trusted session
    //    when it appears to come from localhost. Forwarding X-Forwarded-For makes
    //    the backend see the real remote IP, drop the trust, and log
    //    "No sid found" on every keepalive ping — so we must NOT forward it.
    //  - classic socket.io (default) / forceWebSockets: engine.io establishes the
    //    session inline during the handshake, independent of the source IP, so
    //    X-Forwarded-For is safe and gives honest backend logs.
    const pureWs = !!pick.native.usePureWebSockets;
    return {
        host,
        secure,
        pureWs,
        source: pick.id,
        found: true,
        conflicts: candidates.slice(1).map((c) => c.id),
    };
}

function formatHostPort(host, port) {
    return host && host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

// ── Static file serving ──────────────────────────────────────────────────────

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'text/xml; charset=utf-8',
    '.zip': 'application/zip',
};

const WWW_DIR = path.join(__dirname, 'www');

function serveStatic(pathname, res, host, isSecure, socketUrlOverride, namespace) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const abs = path.join(WWW_DIR, rel);
    if (!abs.startsWith(WWW_DIR)) {
        res.writeHead(403);
        res.end();
        return;
    }

    const serveIndex = (data) => {
        let socketUrl;
        if (socketUrlOverride) {
            socketUrl = socketUrlOverride;
        } else {
            const proto = isSecure ? 'https' : 'http';
            socketUrl = `${proto}://${host || 'localhost'}`;
        }
        const ns = namespace || 'aura.0';
        const injection = `<script>window.__AURA_SOCKET_URL__=${JSON.stringify(socketUrl)};window.__AURA_NAMESPACE__=${JSON.stringify(ns)}</script>`;
        const html = data.toString('utf8').replace('</head>', `${injection}</head>`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html, 'utf8');
    };

    fs.readFile(abs, (err, data) => {
        if (err) {
            // Only serve SPA fallback for extension-less paths (React Router navigation).
            // Asset requests (.js, .css, …) that are missing are real 404s — returning
            // index.html would cause the browser to reject them due to wrong MIME type.
            if (path.extname(pathname)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            fs.readFile(path.join(WWW_DIR, 'index.html'), (err2, idx) => {
                if (err2) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                serveIndex(idx);
            });
            return;
        }
        if (rel === 'index.html') {
            serveIndex(data);
            return;
        }
        const ct = MIME_TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
    });
}

// ── Adapter ──────────────────────────────────────────────────────────────────

class Aura extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'aura' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this._httpServer = null;
    }

    // State-based calendar fetch: frontend writes {id, url, ttl?} to calendar.request,
    // adapter checks calendar.cache first, falls back to fetching, writes
    // {id, content|error} to calendar.response.
    async onStateChange(id, state) {
        // Client-side error report (timeout after all retries exhausted)
        if (id.endsWith('calendar.clientError') && state && !state.ack && state.val) {
            this.log.warn(`[calendar] client error: ${String(state.val)}`);
            return;
        }

        // Timer widget config/enabled — frontend writes ack=false, ingest into schedule map
        if (id.startsWith(`${this.namespace}.timers.`) && state) {
            this._ingestTimerState(id, state.val);
            return;
        }

        // Client register relay: frontend writes {clientId, name} → adapter creates object tree
        if (id.endsWith('clients.register') && state && !state.ack && state.val) {
            let reg;
            try {
                reg = JSON.parse(String(state.val));
            } catch {
                await this.setStateAsync('clients.register', '', true);
                return;
            }
            if (!reg.clientId) {
                await this.setStateAsync('clients.register', '', true);
                return;
            }

            const cId = String(reg.clientId);
            const displayName = reg.name ? String(reg.name) : cId.slice(0, 8);

            await this.setObjectNotExistsAsync(`clients.${cId}`, {
                type: 'channel',
                common: { name: displayName },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.info`, {
                type: 'channel',
                common: { name: 'Info' },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.info.name`, {
                type: 'state',
                common: {
                    name: 'Client Name',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: displayName,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.info.lastSeen`, {
                type: 'state',
                common: { name: 'Last Seen', type: 'number', role: 'date', read: true, write: true, def: 0 },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.navigate`, {
                type: 'channel',
                common: { name: 'Navigation' },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.navigate.url`, {
                type: 'state',
                common: { name: 'Navigate', type: 'string', role: 'url', read: true, write: true, def: '' },
                native: {},
            });
            await this.setObjectNotExistsAsync(`clients.${cId}.navigate.target`, {
                type: 'state',
                common: {
                    name: 'Navigate to view/tab (select)',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: '',
                    states: {},
                },
                native: {},
            });
            // Populate the freshly-created selector with the current view/tab list.
            await this._syncNavigateTargets();

            await this.setStateAsync(`clients.${cId}.info.name`, { val: displayName, ack: true });
            await this.setStateAsync(`clients.${cId}.info.lastSeen`, { val: Date.now(), ack: true });

            this.log.info(`[clients] registered: ${cId} (${displayName})`);
            await this.setStateAsync('clients.register', '', true);
            return;
        }

        // Client delete relay: frontend writes clientId → adapter deletes all child objects explicitly
        if (id.endsWith('clients.deleteRequest') && state && !state.ack && state.val) {
            const clientId = String(state.val).trim();
            if (clientId) {
                const base = `${this.namespace}.clients.${clientId}`;
                const toDelete = [
                    `${base}.info.name`,
                    `${base}.info.lastSeen`,
                    `${base}.info`,
                    `${base}.navigate.url`,
                    `${base}.navigate.target`,
                    `${base}.navigate`,
                    base,
                ];
                this.log.info(`[clients] deleting client: ${base}`);
                for (const objId of toDelete) {
                    try {
                        await this.delForeignObjectAsync(objId);
                    } catch {
                        /* ignore missing */
                    }
                }
                this.log.info(`[clients] deleted: ${base}`);
            }
            await this.setStateAsync('clients.deleteRequest', '', true);
            return;
        }

        // Navigate selector → relay the chosen "<viewSlug>/<tabSlug>" to the
        // matching navigate.url DP (global or per-client). The frontend already
        // subscribes to navigate.url and resolves it to an in-app route.
        if (id.endsWith('.navigate.target') && state && !state.ack && state.val) {
            const target = String(state.val).trim();
            const urlDp = id.replace(/\.navigate\.target$/, '.navigate.url');
            if (target) await this.setForeignStateAsync(urlDp, { val: target, ack: false });
            // Reset the selector so the same entry can be picked again.
            await this.setForeignStateAsync(id, { val: '', ack: true });
            return;
        }

        // Dashboard config changed → rebuild the navigate selector dropdowns.
        if (id.endsWith('.config.dashboard') && state) {
            await this._syncNavigateTargets();
            return;
        }

        if (!id.endsWith('calendar.request') || !state || state.ack || !state.val) return;
        let req;
        try {
            req = JSON.parse(String(state.val));
        } catch {
            return;
        }
        if (!req.url || !req.id) return;

        const ttlMs = (typeof req.ttl === 'number' && req.ttl > 0 ? req.ttl : 900) * 1000;
        const now = Date.now();

        let cache = {};
        try {
            const cs = await this.getStateAsync('calendar.cache');
            if (cs?.val) cache = JSON.parse(String(cs.val));
        } catch {
            /* start with empty cache on parse error */
        }

        const hit = cache[req.url];
        if (hit && typeof hit.fetchedAt === 'number' && now - hit.fetchedAt < ttlMs) {
            this.log.debug(`[calendar] cache hit: url=${req.url} age=${Math.round((now - hit.fetchedAt) / 1000)}s`);
            await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content: hit.content }), true);
            return;
        }

        this.log.info(`[calendar] fetch request id=${req.id} url=${req.url}`);
        try {
            const content = await fetchUrl(req.url);
            this.log.info(`[calendar] fetch ok: ${content.length} bytes (id=${req.id})`);
            cache[req.url] = { content, fetchedAt: now };
            await this.setStateAsync('calendar.cache', JSON.stringify(cache), true);
            await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content }), true);
        } catch (err) {
            this.log.error(`[calendar] fetch error (id=${req.id}): ${String(err)}`);
            if (hit?.content) {
                this.log.warn(`[calendar] serving stale cache for url=${req.url}`);
                await this.setStateAsync(
                    'calendar.response',
                    JSON.stringify({ id: req.id, content: hit.content }),
                    true,
                );
            } else {
                await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, error: String(err) }), true);
            }
        }
    }

    // Called when a timer-widget state OBJECT appears, changes, or is deleted.
    // Pairs with subscribeObjects('timers.*') in onReady — the moment a freshly
    // copied/created widget's state object lands, we read its current value and
    // ingest it. Without this, the scheduler would only see the widget on next
    // adapter restart. Deletes are handled symmetrically to keep _timerState in
    // sync with what actually exists on disk.
    async onObjectChange(id, obj) {
        if (!id.startsWith(`${this.namespace}.timers.`)) return;
        const m = id.match(/^.+\.timers\.([^.]+)\.(config|enabled)$/);
        if (!m) return;
        const widgetId = m[1];
        const kind = m[2];

        if (obj && obj.type === 'state') {
            try {
                const localId = id.slice(this.namespace.length + 1);
                const st = await this.getStateAsync(localId);
                // Treat a missing value the same as the initial-scan path: ingest with
                // null/'' so the entry exists but stays inert until a real value lands.
                this._ingestTimerState(id, st ? st.val : kind === 'enabled' ? true : '');
            } catch (e) {
                this.log.warn(`[timers] objectChange ingest failed (${id}): ${e.message}`);
            }
            return;
        }

        if (!obj) {
            // Object deleted — drop the widget entry if both halves are gone.
            const entry = this._timerState.get(widgetId);
            if (!entry) return;
            if (kind === 'config') entry.payload = null;
            else if (kind === 'enabled') entry.enabled = true;
            if (entry.payload === null) this._timerState.delete(widgetId);
            else this._timerState.set(widgetId, entry);
        }
    }

    async resolveSocketBackend(socketPort) {
        let objs;
        try {
            objs = await this.getForeignObjectsAsync('system.adapter.*', 'instance');
        } catch (e) {
            this.log.warn(`aura: socket backend auto-detect failed (${e.message}) — falling back to 127.0.0.1`);
            return { host: '127.0.0.1', secure: false, source: null, found: false, conflicts: [] };
        }
        return pickSocketBackend(objs, socketPort);
    }

    async startHttpServer() {
        const port = this.config.port || 8095;
        const socketPort = this.config.socketPort || 8082;
        const useHttps = !!this.config.secure;

        const backend = await this.resolveSocketBackend(socketPort);
        const socketHost = backend.host;
        const socketSecure = backend.found ? backend.secure : !!this.config.socketSecure;
        const socketHostPort = formatHostPort(socketHost, socketPort);
        // Only forward X-Forwarded-For to the socket backend for engine.io modes
        // (classic socket.io / forceWebSockets), which establish the session inline.
        // For usePureWebSockets the backend relies on the connection looking like
        // localhost; forwarding the real IP breaks the session ("No sid found" on
        // every ping). When no backend was detected, stay conservative and don't
        // forward (works for every mode, just logs localhost). See pickSocketBackend.
        const socketSendForwardedFor = backend.found && !backend.pureWs;
        if (backend.found) {
            const proto = socketSecure ? 'https' : 'http';
            const mode = backend.pureWs ? 'pure-ws (iobroker.ws)' : 'socket.io';
            const extra = backend.conflicts.length ? ` (other matches ignored: ${backend.conflicts.join(', ')})` : '';
            this.log.info(
                `aura: socket.io backend ${proto}://${socketHostPort} (via ${backend.source}, ${mode}, X-Forwarded-For ${socketSendForwardedFor ? 'on' : 'off'})${extra}`,
            );
        } else {
            this.log.warn(
                `aura: no enabled web/socketio instance found with port ${socketPort} — proxying to ${socketHostPort}`,
            );
        }

        // ── File-system helpers ──────────────────────────────────────────────────
        const fsRootsConfig = Array.isArray(this.config.fsRoots)
            ? this.config.fsRoots
                  .filter((r) => r && r.path)
                  .map((r) => ({ label: String(r.label || r.path), path: path.resolve(String(r.path)) }))
            : [];

        const resolveSafePath = (rawPath) => {
            const abs = path.resolve(rawPath);
            const ok = fsRootsConfig.some((r) => abs === r.path || abs.startsWith(r.path + path.sep));
            if (!ok) throw Object.assign(new Error('path outside allowed roots'), { statusCode: 403 });
            return abs;
        };

        const handler = (req, res) => {
            let parsedUrl;
            try {
                parsedUrl = new URL(req.url, 'http://localhost');
            } catch {
                res.writeHead(400);
                res.end();
                return;
            }
            const { pathname } = parsedUrl;

            if (pathname === '/proxy') {
                const urlParam = parsedUrl.searchParams.get('url');
                if (!urlParam) {
                    res.writeHead(400);
                    res.end('Missing url parameter');
                    return;
                }

                let targetUrl;
                try {
                    targetUrl = new URL(urlParam);
                    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Only http/https allowed');
                } catch (e) {
                    res.writeHead(400);
                    res.end(`Invalid proxy URL: ${e.message}`);
                    return;
                }

                const lib = targetUrl.protocol === 'https:' ? https : http;
                const fwdHeaders = buildFwdHeaders(req);
                fwdHeaders['Referer'] = `${targetUrl.origin}/`;

                const reqOptions = {
                    hostname: targetUrl.hostname,
                    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                    path: targetUrl.pathname + targetUrl.search,
                    method: req.method,
                    timeout: PROXY_TIMEOUT_MS,
                    headers: fwdHeaders,
                    rejectUnauthorized: false,
                };

                const proxyReq = lib.request(reqOptions, (proxyRes) => {
                    if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
                        const absLocation = new URL(proxyRes.headers.location, targetUrl.toString()).toString();
                        const rh = buildHeaders(proxyRes.headers);
                        rh['location'] = `/proxy?url=${encodeURIComponent(absLocation)}`;
                        res.writeHead(proxyRes.statusCode, rh);
                        res.end();
                        return;
                    }

                    const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
                    const isHtml = ct.includes('text/html');
                    const isCss = ct.includes('text/css');

                    if (isHtml || isCss) {
                        const resHeaders = buildHeaders(proxyRes.headers);
                        delete resHeaders['content-length'];
                        bufferResponse(proxyRes)
                            .then((buf) => {
                                const charset = (ct.match(/charset=([^\s;]+)/) || [])[1] || 'utf-8';
                                const enc = charset.toLowerCase() === 'utf-8' ? 'utf8' : 'latin1';
                                let text = buf.toString(enc);
                                text = isHtml
                                    ? rewriteHtml(text, targetUrl.toString())
                                    : rewriteCss(text, targetUrl.toString());
                                res.writeHead(proxyRes.statusCode || 200, resHeaders);
                                res.end(text, enc);
                            })
                            .catch((e) => {
                                if (!res.headersSent) res.writeHead(502);
                                res.end(`Proxy rewrite error: ${e.message}`);
                            });
                    } else {
                        res.writeHead(proxyRes.statusCode || 200, buildHeaders(proxyRes.headers));
                        proxyRes.pipe(res, { end: true });
                    }
                });

                proxyReq.on('timeout', () => {
                    proxyReq.destroy();
                    if (!res.headersSent) {
                        res.writeHead(504);
                        res.end('Proxy timeout');
                    }
                });
                proxyReq.on('error', (e) => {
                    if (!res.headersSent) {
                        res.writeHead(502);
                        res.end(`Proxy error: ${e.message}`);
                    }
                });
                req.pipe(proxyReq, { end: true });
                return;
            }

            // ── File-system routes ────────────────────────────────────────────────
            if (pathname.startsWith('/fs/')) {
                const fsPath = parsedUrl.searchParams.get('path') || '';

                if (pathname === '/fs/roots') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(fsRootsConfig));
                    return;
                }

                if (pathname === '/fs/list') {
                    if (!fsPath) {
                        res.writeHead(400);
                        res.end('Missing path parameter');
                        return;
                    }
                    let abs;
                    try {
                        abs = resolveSafePath(fsPath);
                    } catch (e) {
                        res.writeHead(e.statusCode || 500);
                        res.end(e.message);
                        return;
                    }
                    fs.readdir(abs, { withFileTypes: true }, (err, entries) => {
                        if (err) {
                            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
                            res.end(err.message);
                            return;
                        }
                        const items = entries.map((ent) => {
                            let size = null,
                                mtime = null,
                                mime = null;
                            if (!ent.isDirectory()) {
                                try {
                                    const st = fs.statSync(path.join(abs, ent.name));
                                    size = st.size;
                                    mtime = st.mtimeMs;
                                } catch {
                                    /* ignore */
                                }
                                const rawMime =
                                    MIME_TYPES[path.extname(ent.name).toLowerCase()] || 'application/octet-stream';
                                mime = rawMime.split(';')[0].trim();
                            }
                            return { name: ent.name, isDir: ent.isDirectory(), size, mtime, mime };
                        });
                        items.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
                        const parent = fsRootsConfig.some((r) => r.path === abs) ? null : path.dirname(abs);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ path: abs, parent, entries: items }));
                    });
                    return;
                }

                if (pathname === '/fs/read') {
                    if (!fsPath) {
                        res.writeHead(400);
                        res.end('Missing path parameter');
                        return;
                    }
                    let abs;
                    try {
                        abs = resolveSafePath(fsPath);
                    } catch (e) {
                        res.writeHead(e.statusCode || 500);
                        res.end(e.message);
                        return;
                    }
                    const streamFile = (finalPath) => {
                        const ct = MIME_TYPES[path.extname(finalPath).toLowerCase()] || 'application/octet-stream';
                        const stream = fs.createReadStream(finalPath);
                        stream.on('open', () => {
                            res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=30' });
                            stream.pipe(res);
                        });
                        stream.on('error', (e) => {
                            if (!res.headersSent) {
                                res.writeHead(e.code === 'ENOENT' ? 404 : 500);
                                res.end(e.message);
                            }
                        });
                    };
                    fs.lstat(abs, (err, lstat) => {
                        if (err) {
                            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
                            res.end(err.message);
                            return;
                        }
                        if (lstat.isDirectory()) {
                            res.writeHead(400);
                            res.end('path is a directory');
                            return;
                        }
                        if (lstat.isSymbolicLink()) {
                            fs.realpath(abs, (err2, real) => {
                                if (err2) {
                                    res.writeHead(500);
                                    res.end(err2.message);
                                    return;
                                }
                                const ok = fsRootsConfig.some(
                                    (r) => real === r.path || real.startsWith(r.path + path.sep),
                                );
                                if (!ok) {
                                    res.writeHead(403);
                                    res.end('symlink outside whitelist');
                                    return;
                                }
                                streamFile(real);
                            });
                        } else {
                            streamFile(abs);
                        }
                    });
                    return;
                }

                res.writeHead(404);
                res.end('Unknown fs endpoint');
                return;
            }

            const webAdapterPrefixes = ['/socket.io', '/echarts', '/lib'];
            if (webAdapterPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
                const socketLib = socketSecure ? https : http;
                const fwdHeaders = { ...req.headers, host: socketHostPort };
                if (socketSendForwardedFor) applyForwardedHeaders(fwdHeaders, req);
                const proxyReq = socketLib.request(
                    {
                        hostname: socketHost,
                        port: socketPort,
                        path: req.url,
                        method: req.method,
                        headers: fwdHeaders,
                        timeout: 30000,
                        rejectUnauthorized: false,
                    },
                    (proxyRes) => {
                        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                        proxyRes.pipe(res, { end: true });
                    },
                );
                proxyReq.on('timeout', () => {
                    proxyReq.destroy();
                    if (!res.headersSent) {
                        res.writeHead(504);
                        res.end('Proxy timeout');
                    }
                });
                proxyReq.on('error', (e) => {
                    if (!res.headersSent) {
                        res.writeHead(502);
                        res.end(`Proxy error: ${e.message}`);
                    }
                });
                req.pipe(proxyReq, { end: true });
                return;
            }

            const isSecure = req.socket.encrypted === true || req.headers['x-forwarded-proto'] === 'https';
            serveStatic(pathname, res, req.headers.host, isSecure, this.config.socketUrl || '', this.namespace);
        };

        let server;
        let httpsActive = false;
        if (useHttps) {
            try {
                if (!this.config.certPublic || !this.config.certPrivate) {
                    throw new Error('certPublic and certPrivate must be selected in adapter config');
                }
                this.log.debug(
                    `aura: loading certificates — public="${this.config.certPublic}" private="${this.config.certPrivate}" chained="${this.config.certChained || ''}"`,
                );
                let certificates;
                let rawResult;
                if (typeof this.getCertificatesAsync === 'function') {
                    rawResult = await this.getCertificatesAsync(
                        this.config.certPublic,
                        this.config.certPrivate,
                        this.config.certChained || '',
                    );
                    this.log.debug(
                        `aura: getCertificatesAsync raw result keys: ${Object.keys(rawResult || {}).join(', ')}`,
                    );
                    // Some adapter-core versions resolve with [certificates, letsEncrypt] array
                    if (Array.isArray(rawResult)) {
                        certificates = rawResult[0];
                    } else {
                        certificates = rawResult?.certificates ?? rawResult;
                    }
                } else {
                    certificates = await new Promise((resolve, reject) => {
                        this.getCertificates(
                            this.config.certPublic,
                            this.config.certPrivate,
                            this.config.certChained || '',
                            (err, certs) => (err ? reject(err) : resolve(certs)),
                        );
                    });
                }
                this.log.debug(
                    `aura: certificates object keys: ${Object.keys(certificates || {}).join(', ')} | key=${certificates?.key ? `present (${String(certificates.key).length} chars)` : 'MISSING'} cert=${certificates?.cert ? `present (${String(certificates.cert).length} chars)` : 'MISSING'}`,
                );
                if (!certificates?.key || !certificates?.cert) {
                    throw new Error(
                        `certificates loaded but key/cert are empty (got keys: ${Object.keys(certificates || {}).join(', ') || 'none'})`,
                    );
                }
                server = https.createServer(certificates, handler);
                httpsActive = true;
            } catch (e) {
                this.log.error(`aura: HTTPS startup failed (${e.message}) — falling back to HTTP`);
                server = http.createServer(handler);
            }
        } else {
            server = http.createServer(handler);
        }

        server.on('upgrade', (req, socket, _head) => {
            let parsedUrl;
            try {
                parsedUrl = new URL(req.url, 'http://localhost');
            } catch {
                return;
            }
            const isClassicSocketIo = parsedUrl.pathname.startsWith('/socket.io/');
            const isPureWs = parsedUrl.pathname === '/';
            if (isClassicSocketIo || isPureWs) {
                const wsScheme = socketSecure ? 'wss' : 'ws';
                let targetReqUrl = req.url;
                // Pure web sockets (@iobroker/ws): the server (ioBroker.ws.server)
                // closes any root WS upgrade that arrives without a non-empty `sid`
                // query param ("No sid found" → 501 invalid sid → close after 500ms →
                // the client reconnects every ~5s). The client always sends
                // ?sid=<Date.now()>, but a reverse proxy in front of aura can drop or
                // empty the query on the root path. Guarantee a sid so the connection
                // is accepted; the server only requires it to be non-empty (auth
                // setups use the session cookie regardless). Classic socket.io is
                // untouched — its sid is issued by the engine.io handshake under
                // /socket.io/.
                let injected = false;
                if (isPureWs && !parsedUrl.searchParams.get('sid')) {
                    const sid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
                    const base = req.url.split('?')[0] || '/';
                    const rest = parsedUrl.search
                        ? parsedUrl.search.replace(/^\?/, '').replace(/(^|&)sid=([^&]*)/, '')
                        : '';
                    const extra = rest.replace(/^&/, '');
                    targetReqUrl = `${base}?sid=${sid}${extra ? `&${extra}` : ''}`;
                    injected = true;
                }
                // Diagnostic (debug-level): shows what the backend actually receives
                // for each WS upgrade — useful when chasing "No sid found" / protocol
                // mismatches. Enable the adapter's debug log level to see it.
                this.log.debug(
                    `aura: WS upgrade in="${req.url}" pure=${isPureWs} sid="${parsedUrl.searchParams.get('sid') ?? ''}" injected=${injected} -> "${targetReqUrl}"`,
                );
                proxyWebSocket(
                    req,
                    socket,
                    `${wsScheme}://${socketHostPort}${targetReqUrl}`,
                    this.log,
                    socketSendForwardedFor,
                );
                return;
            }
            if (parsedUrl.pathname !== '/proxyws') return;
            const targetWsUrl = parsedUrl.searchParams.get('url');
            if (!targetWsUrl) {
                socket.destroy();
                return;
            }
            proxyWebSocket(req, socket, targetWsUrl, this.log);
        });

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                this.log.error(
                    `aura: port ${port} is already in use — another aura instance or service is listening on this port. Change "Port" in the instance configuration to a free value (default 8095) and restart.`,
                );
                this.setState('info.connection', false, true);
            } else {
                this.log.error(`aura: server error: ${e.message}`);
            }
        });

        server.listen(port, () =>
            this.log.info(`aura: ${httpsActive ? 'HTTPS' : 'HTTP'} server listening on port ${port}`),
        );
        this._httpServer = server;
    }

    // Build the common.states map for the navigate selector from the persisted
    // dashboard config. Key = "<viewSlug>/<tabSlug>", value = "View / Tab".
    // Disabled tabs are skipped (they are hidden in the frontend anyway).
    _buildNavigateStates(dashboardRaw) {
        const states = {};
        try {
            const parsed = JSON.parse(dashboardRaw);
            const layouts = parsed && parsed.state && parsed.state.layouts;
            if (!Array.isArray(layouts)) return states;
            for (const layout of layouts) {
                const viewSlug = layout && layout.slug;
                if (!viewSlug || !Array.isArray(layout.tabs)) continue;
                const viewName = layout.name || viewSlug;
                for (const tab of layout.tabs) {
                    if (!tab || tab.disabled) continue;
                    const tabSlug = tab.slug || tab.id;
                    if (!tabSlug) continue;
                    states[`${viewSlug}/${tabSlug}`] = `${viewName} / ${tab.name || tabSlug}`;
                }
            }
        } catch {
            /* malformed config → empty dropdown */
        }
        return states;
    }

    // Refresh the common.states of every navigate.target selector (global + each
    // client) from the current dashboard config. Cheap to call on startup, on a
    // dashboard config change, and after a new client registers.
    // Replace common.states fully (extendObject deep-merges and would keep stale
    // keys for views/tabs that were deleted or renamed). No-op if unchanged.
    async _setTargetStates(objId, states) {
        const obj = await this.getObjectAsync(objId);
        if (!obj || obj.type !== 'state') return;
        obj.common = obj.common || {};
        // Repair the role on objects created before the fix: role 'value' rejects
        // a writable string (E1009/E1011). The selector is a writable text DP.
        const roleWrong = obj.common.role !== 'text';
        const statesChanged = JSON.stringify(obj.common.states) !== JSON.stringify(states);
        if (!roleWrong && !statesChanged) return;
        obj.common.role = 'text';
        obj.common.states = states;
        await this.setObjectAsync(objId, obj);
    }

    async _syncNavigateTargets() {
        try {
            const st = await this.getStateAsync('config.dashboard');
            const raw = st && st.val ? String(st.val) : '';
            const states = this._buildNavigateStates(raw);
            await this._setTargetStates('navigate.target', states);
            // Enumerate clients via their navigate.url DP (exists for every
            // client) so we can also create the navigate.target selector for
            // clients that registered before this DP existed.
            const view = await this.getObjectViewAsync('system', 'state', {
                startkey: `${this.namespace}.clients.`,
                endkey: `${this.namespace}.clients.￿`,
            });
            for (const row of (view && view.rows) || []) {
                if (!row.id.endsWith('.navigate.url')) continue;
                const rel = row.id.slice(this.namespace.length + 1).replace(/\.navigate\.url$/, '.navigate.target');
                try {
                    await this.setObjectNotExistsAsync(rel, {
                        type: 'state',
                        common: {
                            name: 'Navigate to view/tab (select)',
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: true,
                            def: '',
                            states: {},
                        },
                        native: {},
                    });
                    await this._setTargetStates(rel, states);
                } catch {
                    /* ignore a client object that vanished mid-sync */
                }
            }
        } catch (e) {
            this.log.warn(`[navigate] sync targets failed: ${e.message}`);
        }
    }

    async onReady() {
        this.log.info('aura adapter started');

        await this.setObjectNotExistsAsync('config', {
            type: 'channel',
            common: { name: 'Configuration' },
            native: {},
        });
        await this.setObjectNotExistsAsync('navigate', { type: 'channel', common: { name: 'Navigation' }, native: {} });
        await this.setObjectNotExistsAsync('calendar', {
            type: 'channel',
            common: { name: 'Calendar fetch relay' },
            native: {},
        });
        await this.setObjectNotExistsAsync('logs', {
            type: 'channel',
            common: { name: 'Adapter log stream (for AdapterLogsWidget)' },
            native: {},
        });
        await this.setObjectNotExistsAsync('logs.latest', {
            type: 'state',
            common: {
                name: 'Latest log entry (JSON)',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('admin', { type: 'channel', common: { name: 'Admin access' }, native: {} });
        await this.setObjectNotExistsAsync('clients', {
            type: 'channel',
            common: { name: 'Connected clients' },
            native: {},
        });
        await this.setObjectNotExistsAsync('lists', {
            type: 'channel',
            common: { name: 'List widget exports' },
            native: {},
        });
        await this.setObjectNotExistsAsync('timers', {
            type: 'channel',
            common: { name: 'Zeitschaltuhren (timer widgets)' },
            native: {},
        });

        await this.setObjectNotExistsAsync('config.dashboard', {
            type: 'state',
            common: {
                name: 'Dashboard configuration',
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '{"widgets":[]}',
            },
            native: {},
        });

        // ── Theme mode DPs ───────────────────────────────────────────────────
        // Independent control: frontend (tablets/users) and admin (editor) each
        // have their own DP so scheduling one doesn't affect the other.
        //
        // Migration runs BEFORE the channel is created because
        // setObjectNotExistsAsync would no-op on an existing state object of the
        // same id (legacy v0.9.161/0.9.162 left config.themeMode as a state).
        this.log.info('[themeMode] init: starting DP setup');
        let themeModeSeed = null;
        try {
            const seedFrom = async (legacyId) => {
                const legacy = await this.getObjectAsync(legacyId);
                if (!legacy) {
                    this.log.info(`[themeMode] legacy '${legacyId}': not found`);
                    return null;
                }
                this.log.info(
                    `[themeMode] legacy '${legacyId}': found, type=${legacy.type}, common.type=${legacy.common && legacy.common.type}`,
                );
                if (legacy.type !== 'state') {
                    this.log.info(`[themeMode] legacy '${legacyId}': not a state — leaving as is`);
                    return null;
                }
                const cur = await this.getStateAsync(legacyId);
                this.log.info(`[themeMode] legacy '${legacyId}': current val=${cur && JSON.stringify(cur.val)}`);
                await this.delObjectAsync(legacyId);
                this.log.info(`[themeMode] legacy '${legacyId}': deleted`);
                const v = cur && cur.val;
                if (v === 'dark' || v === 'light') return v;
                if (v === true) return 'dark';
                if (v === false) return 'light';
                return null;
            };
            themeModeSeed = (await seedFrom('config.darkMode')) ?? (await seedFrom('config.themeMode'));
            this.log.info(`[themeMode] migration seed = ${JSON.stringify(themeModeSeed)}`);
        } catch (e) {
            this.log.warn(`[themeMode] legacy cleanup threw: ${e && e.stack ? e.stack : e}`);
        }

        // Pre-creation snapshot — what does each id currently look like?
        for (const id of ['config.themeMode', 'config.themeMode.frontend', 'config.themeMode.adminUi']) {
            try {
                const obj = await this.getObjectAsync(id);
                this.log.info(
                    `[themeMode] pre-create '${id}': ${obj ? `exists (type=${obj.type}, common.type=${obj.common && obj.common.type})` : 'does NOT exist'}`,
                );
            } catch (e) {
                this.log.warn(`[themeMode] pre-create getObject '${id}' threw: ${e && e.message ? e.message : e}`);
            }
        }

        try {
            this.log.info('[themeMode] creating channel config.themeMode');
            await this.setObjectNotExistsAsync('config.themeMode', {
                type: 'channel',
                common: { name: 'Theme mode overrides (frontend & admin independently)' },
                native: {},
            });
        } catch (e) {
            this.log.error(`[themeMode] create channel threw: ${e && e.stack ? e.stack : e}`);
        }

        for (const [subId, label] of [
            ['config.themeMode.frontend', 'Frontend'],
            ['config.themeMode.adminUi', 'Admin'],
        ]) {
            const common = {
                name: `${label} theme mode ('dark'|'light'|''); empty = no override`,
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
                states: { dark: 'dark', light: 'light' },
            };
            try {
                // Use extendObjectAsync (upsert) rather than setObjectNotExistsAsync:
                // setObjectNotExists skips the DB write when the objects cache reports
                // the id as existing, which can leave a phantom (cache says exists, DB
                // empty → Objects browser shows the DP missing while post-create logs
                // 'exists'). extendObject always issues a write, so the DP is guaranteed
                // to persist, and it folds in the stale-role ('level.mode.color') fix.
                this.log.info(`[themeMode] upserting state ${subId}`);
                await this.extendObjectAsync(subId, { type: 'state', common, native: {} });
            } catch (e) {
                this.log.error(`[themeMode] create/migrate ${subId} threw: ${e && e.stack ? e.stack : e}`);
            }
        }

        // One-time migration: the admin override used to live at
        // 'config.themeMode.admin', but ioBroker's Admin Objects tree hides any
        // id ending in '.admin' in non-expert mode (objectBrowserUtils filter),
        // so the DP was effectively invisible. Move its value to the renamed,
        // always-visible 'config.themeMode.adminUi' and drop the old object.
        try {
            const legacyAdmin = await this.getObjectAsync('config.themeMode.admin');
            if (legacyAdmin) {
                const cur = await this.getStateAsync('config.themeMode.admin');
                const v = cur && (cur.val === 'dark' || cur.val === 'light') ? cur.val : '';
                if (v) {
                    this.log.info(`[themeMode] migrating config.themeMode.admin → adminUi (val='${v}')`);
                    await this.setStateAsync('config.themeMode.adminUi', v, true);
                }
                await this.delObjectAsync('config.themeMode.admin');
                this.log.info('[themeMode] removed legacy hidden config.themeMode.admin');
            }
        } catch (e) {
            this.log.warn(`[themeMode] admin→adminUi migration threw: ${e && e.stack ? e.stack : e}`);
        }

        // Post-creation snapshot — did each id end up existing?
        for (const id of ['config.themeMode', 'config.themeMode.frontend', 'config.themeMode.adminUi']) {
            try {
                const obj = await this.getObjectAsync(id);
                this.log.info(
                    `[themeMode] post-create '${id}': ${obj ? `exists (type=${obj.type}, common.type=${obj.common && obj.common.type})` : 'STILL MISSING'}`,
                );
            } catch (e) {
                this.log.warn(`[themeMode] post-create getObject '${id}' threw: ${e && e.message ? e.message : e}`);
            }
        }

        if (themeModeSeed) {
            try {
                this.log.info(`[themeMode] seeding frontend with '${themeModeSeed}'`);
                await this.setStateAsync('config.themeMode.frontend', themeModeSeed, true);
            } catch (e) {
                this.log.warn(`[themeMode] frontend seed threw: ${e && e.stack ? e.stack : e}`);
            }
            try {
                this.log.info(`[themeMode] seeding admin with '${themeModeSeed}'`);
                await this.setStateAsync('config.themeMode.adminUi', themeModeSeed, true);
            } catch (e) {
                this.log.warn(`[themeMode] admin seed threw: ${e && e.stack ? e.stack : e}`);
            }
        }
        this.log.info('[themeMode] init: done');

        const configStates = [
            { id: 'config.theme', name: 'Theme configuration' },
            { id: 'config.groups', name: 'Group configuration' },
            { id: 'config.app-config', name: 'App configuration' },
            { id: 'config.global-settings', name: 'Global settings' },
            { id: 'config.group-defs', name: 'Group widget definitions' },
            { id: 'config.popup-config', name: 'Popup configuration' },
        ];
        for (const s of configStates) {
            await this.setObjectNotExistsAsync(s.id, {
                type: 'state',
                common: { name: s.name, type: 'string', role: 'json', read: true, write: true, def: '' },
                native: {},
            });
        }

        // Clean up the legacy single-state backup blob on instances that still
        // have it (backups now live as files under <ns>.backups).
        try {
            await this.delObjectAsync('config.dashboard_backup');
        } catch {
            /* object may not exist – ignore */
        }

        // Meta namespace for auto-backup files (aura.0.backups). Required for
        // ioBroker writeFile/readFile under that path. Each backup is a JSON
        // file inside this meta object.
        await this.setObjectNotExistsAsync('backups', {
            type: 'meta',
            common: { name: 'Auto-backup files', type: 'meta.user' },
            native: {},
        });

        await this.setObjectNotExistsAsync('navigate.url', {
            type: 'state',
            common: {
                name: 'Navigate to URL or tab slug',
                type: 'string',
                role: 'url',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });

        // Combined view/tab selector. common.states is kept in sync with the
        // dashboard config (_syncNavigateTargets) so it offers a dropdown of all
        // view/tab combinations. Writing a key relays "<viewSlug>/<tabSlug>" to
        // navigate.url, which the frontend resolves to an in-app route.
        await this.setObjectNotExistsAsync('navigate.target', {
            type: 'state',
            common: {
                name: 'Navigate to view/tab (select)',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
                states: {},
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('calendar.cache', {
            type: 'state',
            common: {
                name: 'Calendar fetch cache (JSON: {url: {content, fetchedAt}})',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '{}',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('calendar.request', {
            type: 'state',
            common: {
                name: 'Calendar fetch request (JSON: {id, url})',
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('calendar.response', {
            type: 'state',
            common: {
                name: 'Calendar fetch response (JSON: {id, content|error})',
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('calendar.clientError', {
            type: 'state',
            common: {
                name: 'Calendar client error (written by frontend after all retries failed)',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('admin.pinHash', {
            type: 'state',
            common: {
                name: 'Admin PIN hash (FNV-1a, managed by frontend)',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('clients.deleteRequest', {
            type: 'state',
            common: {
                name: 'Client delete request (write clientId to delete that client tree)',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('clients.register', {
            type: 'state',
            common: {
                name: 'Client register relay (write JSON {clientId, name} to create client object tree)',
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });

        this.subscribeStates('calendar.request');
        this.subscribeStates('calendar.clientError');
        this.subscribeStates('clients.deleteRequest');
        this.subscribeStates('clients.register');

        // Navigate selector: relay target selections and keep dropdowns in sync
        // with the dashboard config (views/tabs added, renamed or removed).
        this.subscribeStates('navigate.target');
        this.subscribeStates('clients.*.navigate.target');
        this.subscribeStates('config.dashboard');
        await this._syncNavigateTargets();

        // ── Timer widget scheduler ─────────────────────────────────────────────
        // Subscribe to per-widget config/enabled DPs and run a tick to evaluate
        // due triggers. The frontend (TimerWidget) writes config as JSON to
        // aura.<inst>.timers.<widgetId>.config and master state to .enabled.
        this.subscribeStates('timers.*');
        // Also watch for new timer state OBJECTS — when a fresh widget is created
        // (especially as a copy of an existing one) the frontend calls setObject for
        // aura.0.timers.<UUID>.{config,enabled} before writing the value. Some
        // backends do not deliver the very first setState through the pattern
        // subscription installed at startup, so the new widget would only get
        // picked up on the next adapter restart. The object-change handler ingests
        // the current value as soon as the object appears, so the scheduler sees
        // the widget within seconds instead of requiring a restart.
        this.subscribeObjects('timers.*');
        this._timerState = new Map(); // widgetId → { enabled, payload }
        this._timerFired = new Set(); // dedupe key → true (cleared at midnight)
        this._timerLastDay = this._currentDayKey();
        await this._loadAstroLocation();
        try {
            const existing = await this.getStatesAsync(`${this.namespace}.timers.*`);
            for (const [fullId, st] of Object.entries(existing || {})) {
                if (!st) continue;
                this._ingestTimerState(fullId, st.val);
            }
            this.log.info(`[timers] loaded ${this._timerState.size} timer widget(s)`);
        } catch (e) {
            this.log.warn(`[timers] initial scan failed: ${e.message}`);
        }
        const tickSec = Math.max(5, Math.min(600, Number(this.config.timerTickSeconds) || 30));
        this._timerTickMs = tickSec * 1000;
        this._timerInterval = this.setInterval(
            () => this._timerTick().catch((e) => this.log.warn(`[timers] tick error: ${e.message}`)),
            this._timerTickMs,
        );
        this.log.info(`[timers] scheduler tick = ${tickSec}s`);

        // ── Live log relay for AdapterLogsWidget ───────────────────────────────────
        // The iobroker.web socket exposed to the frontend cannot deliver `requireLog`
        // events to anonymous users, so we collect logs here. The widget polls
        // `getRecentLogs(sinceSeq)` through sendTo and receives only the delta.
        this._logBuffer = [];
        this._logSeq = 0;
        this._logBufferLimit = 500;
        const pushLog = (entry) => {
            if (!entry) return;
            this._logSeq = (this._logSeq + 1) | 0;
            const enriched = {
                seq: this._logSeq,
                severity: entry.severity || 'info',
                ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
                message: String(entry.message ?? ''),
                from: String(entry.from ?? ''),
            };
            this._logBuffer.push(enriched);
            if (this._logBuffer.length > this._logBufferLimit) {
                this._logBuffer.splice(0, this._logBuffer.length - this._logBufferLimit);
            }
        };
        try {
            // js-controller forwards every system log via the 'log' event on the
            // adapter event emitter as long as requireLog(true) is active.
            // Register listener first so we never miss an entry between
            // requireLog() returning and the first incoming forward.
            this.on('log', pushLog);
            if (typeof this.requireLog === 'function') {
                this.requireLog(true);
            } else {
                this.log.warn('[adapter-logs] requireLog method not available on this js-controller version');
            }
            // Seed entry so the widget shows immediate confirmation that the relay
            // is active even on a quiet system.
            pushLog({
                severity: 'info',
                ts: Date.now(),
                message: 'Aura log relay activated (requireLog=true).',
                from: this.namespace,
            });
            this.log.info('[adapter-logs] requireLog active — relay ready');
        } catch (e) {
            this.log.warn(`[adapter-logs] requireLog failed: ${e?.message ?? e}`);
        }

        // Update localLinks to point to the aura HTTP server port
        {
            const base = this.config.customUrl ? this.config.customUrl.replace(/\/+$/, '') : null;
            const port = this.config.port || 8095;
            const langs = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
            const makeName = (v) => Object.fromEntries(langs.map((l) => [l, v]));

            const frontendLink = base ? `${base}/` : `%protocol%://%ip%:${port}/`;
            const backendLink = base ? `${base}/#/admin` : `%protocol%://%ip%:${port}/#/admin`;
            const wantLinks = {
                frontend: { link: frontendLink, name: makeName('Aura Frontend') },
                backend: { link: backendLink, name: makeName('Aura Backend') },
            };
            try {
                const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                if (obj) {
                    let changed = false;
                    const curLinks = obj.common.localLinks || {};
                    if (
                        curLinks?.frontend?.link !== wantLinks.frontend.link ||
                        curLinks?.backend?.link !== wantLinks.backend.link
                    ) {
                        obj.common.localLinks = wantLinks;
                        changed = true;
                        this.log.info(`localLinks updated to port ${port}${base ? ` (custom URL: ${base})` : ''}`);
                    }
                    // Migration: clear legacy webInstance so iobroker.web stops tracking aura
                    if (obj.native?.webInstance !== undefined) {
                        delete obj.native.webInstance;
                        changed = true;
                        this.log.info(
                            'aura: cleared legacy webInstance — iobroker.web will no longer restart on aura stop',
                        );
                    }
                    if (changed) {
                        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                    }
                }
            } catch (e) {
                this.log.warn(`Could not update instance object: ${e.message}`);
            }
        }

        await this.startHttpServer();
        this.setState('info.connection', true, true);
        this.log.info('aura ready');
    }

    // ── Timer scheduler helpers ──────────────────────────────────────────────

    _currentDayKey(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /**
     * Parse a state value coming from one of the timers.* DPs and update the
     * in-memory schedule map. Called both during initial scan and on state changes.
     */
    _ingestTimerState(fullId, val) {
        // fullId: aura.<inst>.timers.<widgetId>.{config|enabled}
        const m = fullId.match(/^.+\.timers\.([^.]+)\.(config|enabled)$/);
        if (!m) return;
        const widgetId = m[1];
        const kind = m[2];
        const entry = this._timerState.get(widgetId) || { enabled: true, payload: null };
        if (kind === 'enabled') {
            entry.enabled = val === true || val === 'true' || val === 1 || val === '1';
        } else if (kind === 'config') {
            if (val == null || val === '') {
                entry.payload = null;
            } else {
                try {
                    entry.payload = typeof val === 'string' ? JSON.parse(val) : val;
                } catch (e) {
                    this.log.warn(`[timers] config parse error (${widgetId}): ${e.message}`);
                    entry.payload = null;
                }
            }
            // NOTE: we deliberately do NOT call _syncTimerName here. TimerWidget
            // republishes the config state on every keystroke while mounted, so a
            // rename-on-ingest would spam the object DB. Title sync happens only on
            // explicit save via the renameTimer onMessage handler.
        }
        this._timerState.set(widgetId, entry);
    }

    async _syncTimerName(widgetId, title) {
        const base = `timers.${widgetId}`;
        const ch = await this.getObjectAsync(base);
        if (!ch) return;
        const want = title || 'Zeitschaltuhr';
        if (ch.common?.name === want) return;
        await this.extendObjectAsync(base, { common: { name: want } });
        await this.extendObjectAsync(`${base}.config`, { common: { name: `${want} — config` } });
        await this.extendObjectAsync(`${base}.enabled`, { common: { name: `${want} — enabled` } });
        this.log.info(`[timers] renamed ${this.namespace}.${base} → "${want}"`);
    }

    async _resolveSpecialDays(dp) {
        if (!dp) return new Set();
        try {
            const st = await this.getForeignStateAsync(dp);
            if (!st || st.val == null) return new Set();
            const arr = typeof st.val === 'string' ? JSON.parse(st.val) : st.val;
            return new Set(Array.isArray(arr) ? arr.map(String) : []);
        } catch {
            return new Set();
        }
    }

    _weekdayMatches(weekdays, date) {
        if (!Array.isArray(weekdays) || weekdays.length === 0) return false;
        const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return weekdays.includes(map[date.getDay()]);
    }

    _parseValue(raw) {
        if (typeof raw !== 'string') return raw;
        const s = raw.trim();
        if (s === '') return '';
        if (s.toLowerCase() === 'true') return true;
        if (s.toLowerCase() === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
        return s;
    }

    _astroPattern(event) {
        // Map our event names to SunCalc.getTimes() result keys.
        if (event === 'sunrise') return 'sunrise';
        if (event === 'sunset') return 'sunset';
        if (event === 'dawn') return 'dawn';
        if (event === 'dusk') return 'dusk';
        if (event === 'solarNoon') return 'solarNoon';
        return 'sunset';
    }

    /**
     * Load latitude/longitude from system.config once at scheduler startup and
     * cache them for astro calculations. We do NOT rely on the host's
     * this.getAstroDate(): that method is provided by js-controller at runtime
     * and is absent on some hosts ("this.getAstroDate is not a function"), so we
     * compute sun times locally with the bundled `suncalc` dependency instead.
     * Missing coordinates leave the cache undefined → astro events are skipped.
     */
    async _loadAstroLocation() {
        this._astroLat = undefined;
        this._astroLon = undefined;
        try {
            const sys = await this.getForeignObjectAsync('system.config');
            const lat = Number(sys && sys.common && sys.common.latitude);
            const lon = Number(sys && sys.common && sys.common.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                this._astroLat = lat;
                this._astroLon = lon;
                this.log.info(`[timers] astro location ${lat}, ${lon}`);
            } else {
                this.log.warn('[timers] no latitude/longitude in system.config — astro timer events will not fire');
            }
        } catch (e) {
            this.log.warn(`[timers] could not read system.config for astro: ${e.message}`);
        }
    }

    /**
     * Compute the astro Date for the given event on the day of `date`, applying
     * an optional offset in minutes. Returns null when coordinates are missing
     * or SunCalc cannot resolve the event (e.g. polar day/night → Invalid Date).
     */
    _computeAstroDate(event, date, offsetMin) {
        if (!Number.isFinite(this._astroLat) || !Number.isFinite(this._astroLon)) return null;
        const times = SunCalc.getTimes(date, this._astroLat, this._astroLon);
        const base = times[this._astroPattern(event)];
        if (!(base instanceof Date) || Number.isNaN(base.getTime())) return null;
        return new Date(base.getTime() + (Number(offsetMin) || 0) * 60000);
    }

    async _filterPasses(ev, date, holidays, vacation) {
        const dayKey = this._currentDayKey(date);
        if (ev.filter === 'all-days') return true;
        if (ev.filter === 'no-special') return !holidays.has(dayKey) && !vacation.has(dayKey);
        if (ev.filter === 'only-holidays') return holidays.has(dayKey);
        if (ev.filter === 'only-vacation') return vacation.has(dayKey);
        if (ev.filter === 'blocked') {
            const minNow = date.getHours() * 60 + date.getMinutes();
            const from = Number.isFinite(ev.blockFromMin) ? ev.blockFromMin : 0;
            const to = Number.isFinite(ev.blockToMin) ? ev.blockToMin : 0;
            // window may wrap midnight if from > to
            const inWindow = from <= to ? minNow >= from && minNow < to : minNow >= from || minNow < to;
            return !inWindow;
        }
        return true;
    }

    async _writeTarget(targetDp, baseValue, ev, override) {
        if (!targetDp) return;
        const val = override !== undefined ? override : this._parseValue(baseValue);
        try {
            await this.setForeignStateAsync(targetDp, val, false);
            this.log.info(`[timers] fired ${ev.label || ev.id}: ${targetDp} ← ${JSON.stringify(val)}`);
        } catch (e) {
            this.log.warn(`[timers] write failed (${targetDp}): ${e.message}`);
        }
    }

    /**
     * One-shot disable for 'once' events — write back the updated config with
     * the event flipped to enabled=false so it doesn't fire again after restart.
     */
    async _disableOnceEvent(widgetId, eventId) {
        const entry = this._timerState.get(widgetId);
        if (!entry || !entry.payload || !Array.isArray(entry.payload.events)) return;
        const next = {
            ...entry.payload,
            events: entry.payload.events.map((e) => (e.id === eventId ? { ...e, enabled: false } : e)),
        };
        entry.payload = next;
        this._timerState.set(widgetId, entry);
        try {
            await this.setStateAsync(`timers.${widgetId}.config`, JSON.stringify(next), false);
        } catch (e) {
            this.log.warn(`[timers] could not persist disabled 'once' event: ${e.message}`);
        }
    }

    async _timerTick() {
        const now = new Date();
        const dayKey = this._currentDayKey(now);
        if (dayKey !== this._timerLastDay) {
            this._timerFired.clear();
            this._timerLastDay = dayKey;
        }
        const windowMs = this._timerTickMs;
        const winStart = now.getTime() - windowMs;

        for (const [widgetId, entry] of this._timerState.entries()) {
            if (!entry.enabled) continue;
            const payload = entry.payload;
            if (!payload || !Array.isArray(payload.events)) continue;
            const targetDp = payload.targetDp;
            if (!targetDp) continue; // admin hasn't configured the target yet
            const widgetBaseValue = payload.value != null ? payload.value : 'true';
            const allowEventValue = payload.allowEventValue === true;

            const holidays = await this._resolveSpecialDays(payload.holidaysDp);
            const vacation = await this._resolveSpecialDays(payload.vacationDp);

            for (const ev of payload.events) {
                if (!ev || !ev.enabled) continue;

                // Determine candidate fire times for today (or absolute for once/range)
                const candidates = []; // [{ ts, key, invert? }]

                if (ev.trigger.kind === 'time') {
                    if (!this._weekdayMatches(ev.weekdays, now)) continue;
                    const ts = new Date(now);
                    ts.setHours(ev.trigger.hour, ev.trigger.minute, 0, 0);
                    candidates.push({ ts: ts.getTime(), key: `${widgetId}:${ev.id}:${dayKey}:time` });
                } else if (ev.trigger.kind === 'astro') {
                    if (!this._weekdayMatches(ev.weekdays, now)) continue;
                    let astroDate;
                    try {
                        astroDate = this._computeAstroDate(ev.trigger.event, now, ev.trigger.offsetMin || 0);
                    } catch (e) {
                        this.log.warn(`[timers] astro failed (${ev.trigger.event}): ${e.message}`);
                        continue;
                    }
                    if (!astroDate) continue;
                    candidates.push({ ts: astroDate.getTime(), key: `${widgetId}:${ev.id}:${dayKey}:astro` });
                } else if (ev.trigger.kind === 'once') {
                    const ts = Date.parse(ev.trigger.iso);
                    if (!Number.isFinite(ts)) continue;
                    candidates.push({ ts, key: `${widgetId}:${ev.id}:once`, isOnce: true });
                } else if (ev.trigger.kind === 'range') {
                    const fts = Date.parse(ev.trigger.fromIso);
                    const tts = Date.parse(ev.trigger.toIso);
                    if (Number.isFinite(fts)) candidates.push({ ts: fts, key: `${widgetId}:${ev.id}:range:start` });
                    if (Number.isFinite(tts))
                        candidates.push({ ts: tts, key: `${widgetId}:${ev.id}:range:end`, invert: true });
                }

                for (const c of candidates) {
                    if (c.ts < winStart || c.ts > now.getTime()) continue;
                    if (this._timerFired.has(c.key)) continue;
                    if (!(await this._filterPasses(ev, now, holidays, vacation))) continue;

                    // Per-event override only honored when admin opted in; empty string falls back too.
                    const evValue =
                        allowEventValue && typeof ev.value === 'string' && ev.value !== '' ? ev.value : null;
                    const baseValue = evValue != null ? evValue : widgetBaseValue;

                    let writeVal;
                    if (c.invert) {
                        const v = this._parseValue(baseValue);
                        writeVal = typeof v === 'boolean' ? !v : typeof v === 'number' ? 0 : '';
                    }
                    await this._writeTarget(targetDp, baseValue, ev, writeVal);
                    this._timerFired.add(c.key);

                    if (c.isOnce) {
                        await this._disableOnceEvent(widgetId, ev.id);
                    }
                }
            }
        }
    }

    // ── onMessage: frontend → backend RPC (adapter-status widget) ───────────────
    // Frontend calls sendTo('aura.0', 'upgradeAdapter' | 'restartAdapter', payload, cb).
    // We acknowledge via this.sendTo(msg.from, msg.command, result, msg.callback).
    async onMessage(msg) {
        if (!msg || !msg.command) return;
        const reply = (result) => {
            if (msg.callback && msg.from) this.sendTo(msg.from, msg.command, result, msg.callback);
        };

        try {
            if (msg.command === 'auraPing') {
                // Connectivity check from frontend: tells widget the new handler is actually running.
                let version = '';
                try {
                    version = require('./package.json').version;
                } catch {
                    /* ignore */
                }
                reply({ ok: true, version, namespace: this.namespace });
                return;
            }

            if (msg.command === 'restartAdapter') {
                const id = String(msg.message?.id || '').trim();
                if (!id || !/^[a-z0-9_-]+\.\d+$/i.test(id)) {
                    reply({ ok: false, error: `Invalid instance id: ${id}` });
                    return;
                }
                const objId = `system.adapter.${id}`;
                const obj = await this.getForeignObjectAsync(objId);
                if (!obj) {
                    reply({ ok: false, error: `Object not found: ${objId}` });
                    return;
                }
                // Toggle common.enabled: false → 600ms → true forces controller to restart.
                const wasEnabled = obj.common?.enabled === true;
                await this.extendForeignObjectAsync(objId, { common: { enabled: false } });
                await new Promise((r) => this.setTimeout(r, 600));
                await this.extendForeignObjectAsync(objId, { common: { enabled: true } });
                this.log.info(`[adapter-status] restart ${id} (was ${wasEnabled ? 'enabled' : 'disabled'})`);
                reply({ ok: true });
                return;
            }

            if (msg.command === 'listTimers' || msg.command === 'listLists') {
                const ns = msg.command === 'listTimers' ? 'timers' : 'lists';
                try {
                    const channels = await this.getChannelsOfAsync(ns);
                    const prefix = `${this.namespace}.${ns}.`;
                    const items = (channels || [])
                        .filter((c) => (c?._id || '').startsWith(prefix))
                        .map((c) => ({ id: c._id.slice(prefix.length), name: c?.common?.name || '' }))
                        .filter((it) => it.id && !it.id.includes('.'));
                    // Legacy field kept for older frontends that only consume the IDs.
                    reply({ ok: true, items, widgetIds: items.map((it) => it.id) });
                } catch (e) {
                    reply({ ok: false, error: e?.message || String(e) });
                }
                return;
            }

            if (msg.command === 'checkDps') {
                const ids = Array.isArray(msg.message?.ids)
                    ? msg.message.ids.filter((id) => typeof id === 'string' && id)
                    : [];
                const missing = [];
                await Promise.all(
                    ids.map(async (id) => {
                        try {
                            const obj = await this.getForeignObjectAsync(id);
                            if (!obj) missing.push(id);
                        } catch {
                            missing.push(id);
                        }
                    }),
                );
                reply({ ok: true, missing });
                return;
            }

            if (msg.command === 'deleteList') {
                const widgetId = String(msg.message?.widgetId || '').trim();
                if (!widgetId) {
                    reply({ ok: false, error: `Invalid widgetId: ${widgetId}` });
                    return;
                }
                const base = `lists.${widgetId}`;
                const results = {};
                try {
                    await this.delObjectAsync(`${base}.count`);
                    results.count = 'ok';
                } catch (e) {
                    results.count = e?.message || String(e);
                }
                try {
                    await this.delObjectAsync(base);
                    results.channel = 'ok';
                } catch (e) {
                    results.channel = e?.message || String(e);
                }
                this.log.info(`[lists] deleteList ${this.namespace}.${base} → ${JSON.stringify(results)}`);
                reply({ ok: true, results });
                return;
            }

            if (msg.command === 'renameTimer') {
                const widgetId = String(msg.message?.widgetId || '').trim();
                const title = String(msg.message?.title || '');
                if (!widgetId || !/^[a-zA-Z0-9_-]+$/.test(widgetId)) {
                    reply({ ok: false, error: `Invalid widgetId: ${widgetId}` });
                    return;
                }
                try {
                    await this._syncTimerName(widgetId, title);
                    reply({ ok: true });
                } catch (e) {
                    reply({ ok: false, error: e?.message || String(e) });
                }
                return;
            }

            if (msg.command === 'deleteTimer') {
                const widgetId = String(msg.message?.widgetId || '').trim();
                if (!widgetId || !/^[a-zA-Z0-9_-]+$/.test(widgetId)) {
                    reply({ ok: false, error: `Invalid widgetId: ${widgetId}` });
                    return;
                }
                const base = `${this.namespace}.timers.${widgetId}`;
                const localBase = `timers.${widgetId}`;
                const results = {};
                for (const sub of ['config', 'enabled']) {
                    try {
                        await this.delObjectAsync(`${localBase}.${sub}`);
                        results[sub] = 'ok';
                    } catch (e) {
                        results[sub] = e?.message || String(e);
                    }
                }
                try {
                    await this.delObjectAsync(localBase);
                    results.channel = 'ok';
                } catch (e) {
                    results.channel = e?.message || String(e);
                }
                this._timerState.delete(widgetId);
                this.log.info(`[timers] deleteTimer ${base} → ${JSON.stringify(results)}`);
                reply({ ok: true, results });
                return;
            }

            if (msg.command === 'getRecentLogs') {
                const sinceSeq = Number(msg.message?.sinceSeq) || 0;
                const buf = this._logBuffer || [];
                // Optional comma-separated instance filter. Tokens may be either
                // an adapter name ("aura", "admin") matching every instance of it,
                // or a full instance id ("aura.0", "admin.1") matching exactly.
                const rawInstances = msg.message?.instances;
                const tokens = (Array.isArray(rawInstances) ? rawInstances : String(rawInstances ?? '').split(','))
                    .map((t) => String(t).trim().toLowerCase())
                    .filter(Boolean);
                const matchesInstance = (from) => {
                    if (tokens.length === 0) return true;
                    const src = String(from ?? '').toLowerCase();
                    const adapter = src.includes('.') ? src.slice(0, src.indexOf('.')) : src;
                    return tokens.some((tok) => (tok.includes('.') ? src === tok : adapter === tok));
                };
                let entries = sinceSeq > 0 ? buf.filter((e) => e.seq > sinceSeq) : buf.slice();
                if (tokens.length > 0) entries = entries.filter((e) => matchesInstance(e.from));
                reply({ ok: true, entries, latestSeq: this._logSeq || 0 });
                return;
            }

            if (msg.command === 'setScriptEnabled') {
                const id = String(msg.message?.id || '').trim();
                const enabled = !!msg.message?.enabled;
                if (!id || !id.startsWith('script.js.')) {
                    reply({ ok: false, error: `Invalid script id: ${id}` });
                    return;
                }
                const obj = await this.getForeignObjectAsync(id);
                if (!obj || obj.type !== 'script') {
                    reply({ ok: false, error: `Script not found: ${id}` });
                    return;
                }
                await this.extendForeignObjectAsync(id, { common: { enabled } });
                this.log.info(`[script-status] ${enabled ? 'start' : 'stop'} ${id}`);
                reply({ ok: true });
                return;
            }

            if (msg.command === 'upgradeAdapter') {
                const name = String(msg.message?.name || '').trim();
                if (!name || !/^[a-z0-9_-]+$/i.test(name)) {
                    reply({ ok: false, error: `Invalid adapter name: ${name}` });
                    return;
                }
                // Find a host that runs this adapter (use the first instance's common.host).
                const instances = await this.getObjectViewAsync('system', 'instance', {
                    startkey: `system.adapter.${name}.`,
                    endkey: `system.adapter.${name}.香`,
                });
                const host = instances?.rows?.[0]?.value?.common?.host;
                if (!host) {
                    reply({ ok: false, error: `No host found for adapter ${name}` });
                    return;
                }

                const execId = Date.now();
                const hostTarget = `system.host.${host}`;
                const out = [];
                const err = [];
                let exitCode = null;

                // Forward host cmdStdout / cmdStderr / cmdExit back to caller (one final reply on exit).
                const onSubMsg = (subMsg) => {
                    if (!subMsg || subMsg.message?.id !== execId) return;
                    if (subMsg.command === 'cmdStdout') out.push(String(subMsg.message.data ?? ''));
                    else if (subMsg.command === 'cmdStderr') err.push(String(subMsg.message.data ?? ''));
                    else if (subMsg.command === 'cmdExit') {
                        if (exitCode !== null) return; // host fires cmdExit twice — keep only first
                        exitCode = subMsg.message.data;
                        this.removeListener('message', onSubMsg);
                        this.log.info(`[adapter-status] upgrade ${name} exit ${exitCode}`);
                        reply({ ok: exitCode === 0, exitCode, stdout: out.join('\n'), stderr: err.join('\n') });
                    }
                };
                this.on('message', onSubMsg);

                // Safety timeout — if host never responds (unlikely), tell the frontend.
                this.setTimeout(
                    () => {
                        if (exitCode === null) {
                            this.removeListener('message', onSubMsg);
                            this.log.warn(`[adapter-status] upgrade ${name} timeout (no cmdExit from ${hostTarget})`);
                            reply({ ok: false, error: 'timeout', stdout: out.join('\n'), stderr: err.join('\n') });
                        }
                    },
                    5 * 60 * 1000,
                );

                this.log.info(`[adapter-status] upgrade ${name} via ${hostTarget}`);
                this.sendToHost(host, 'cmdExec', { data: `upgrade ${name}`, id: execId });
                return;
            }
        } catch (e) {
            this.log.error(`[adapter-status] ${msg.command} failed: ${e?.message ?? e}`);
            reply({ ok: false, error: e?.message ?? String(e) });
        }
    }

    onUnload(callback) {
        try {
            try {
                this.requireLog(false);
            } catch {
                /* ignore */
            }
            if (this._timerInterval) {
                this.clearInterval(this._timerInterval);
                this._timerInterval = null;
            }
            if (this._httpServer) {
                this._httpServer.close(() => callback());
            } else {
                callback();
            }
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new Aura(options);
} else {
    new Aura();
}
