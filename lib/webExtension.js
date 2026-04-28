'use strict';

const http  = require('node:http');
const https = require('node:https');

// Headers that prevent iframe embedding — stripped from proxy responses
const STRIP_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'x-content-type-options',
    'x-xss-protection',
    'cross-origin-resource-policy',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
]);

const TIMEOUT_MS = 15_000;
// Proxy path prefix used to detect same-origin WS URLs constructed by apps
const PROXY_PATH = '/aura/proxy';

// ── HTML / CSS rewriting ──────────────────────────────────────────────────────

function rewriteHtml(html, baseUrl) {
    const targetOrigin = new URL(baseUrl).origin;

    function toProxy(url) {
        if (!url) return url;
        const trimmed = url.trim();
        if (/^(data:|javascript:|blob:|mailto:|tel:|#)/.test(trimmed)) return url;
        try {
            const abs = new URL(trimmed, baseUrl).toString();
            return '/aura/proxy?url=' + encodeURIComponent(abs);
        } catch { return url; }
    }

    // Remove any existing <base> tag to avoid conflicts
    let out = html.replace(/<base\b[^>]*>/gi, '');

    // Rewrite src=, href=, action= attributes
    out = out.replace(
        /\b(src|href|action)(\s*=\s*)(["'])([^"']*)\3/gi,
        (_, attr, eq, q, url) => `${attr}${eq}${q}${toProxy(url)}${q}`,
    );
    // Rewrite srcset (comma-separated url [descriptor] list)
    out = out.replace(
        /\bsrcset(\s*=\s*)(["'])([^"']*)\2/gi,
        (_, eq, q, val) => {
            const rw = val.replace(/([^,\s]+)(\s*(?:[^,]*))/g, (m, url, rest) => toProxy(url) + rest);
            return `srcset${eq}${q}${rw}${q}`;
        },
    );

    // Inject interceptors for WebSocket, XHR and fetch so any same-origin
    // request made by the app's JS is routed back through /aura/proxy.
    const tgtNoProto = targetOrigin.replace(/^https?:/, '');  // e.g. //192.168.188.22:8000
    const wsProto    = targetOrigin.startsWith('https:') ? 'wss:' : 'ws:';
    const wsSnippet  = `<script>(function(){` +
        `var tgt=${JSON.stringify(targetOrigin)},tgtNP=${JSON.stringify(tgtNoProto)},wsp=${JSON.stringify(wsProto)};` +
        // Reset URL to '/' so SPA routers (Angular, Vue, React) see '/' as the
        // current path instead of '/aura/proxy' and don't show a 404 route.
        `history.replaceState(history.state,'','/');` +
        // rw(url): rewrite same-origin non-/aura/ requests and target-origin
        // requests to go through /aura/proxy.
        `function rw(u){` +
            `try{` +
                `var a=new URL(u,location.href);` +
                `if((a.origin===location.origin&&!a.pathname.startsWith('/aura/'))||a.origin===tgt){` +
                    `return '/aura/proxy?url='+encodeURIComponent(tgt+a.pathname+a.search+a.hash);` +
                `}` +
            `}catch(e){}` +
            `return u;` +
        `}` +
        // WebSocket: catch any same-origin or target-origin WS and route to
        // /aura/proxyws. Works after SPA pushState (no longer relies on the
        // /aura/proxy prefix being present in the path).
        `var _W=window.WebSocket;` +
        `window.WebSocket=function(u,p){` +
            `try{` +
                `var a=new URL(u.replace(/^wss?:/,'https:'),location.href);` +
                `if(a.pathname==='/aura/proxyws')return new _W(u,p);` + // already proxied
                `if(a.origin===location.origin||a.origin===tgt){` +
                    `u='/aura/proxyws?url='+encodeURIComponent(wsp+tgtNP+a.pathname+(a.search||''));` +
                `}` +
            `}catch(e){}` +
            `return new _W(u,p);` +
        `};` +
        `Object.assign(window.WebSocket,_W);` +
        // XHR
        `var _xo=XMLHttpRequest.prototype.open;` +
        `XMLHttpRequest.prototype.open=function(){` +
            `if(arguments[1])arguments[1]=rw(String(arguments[1]));` +
            `return _xo.apply(this,arguments);` +
        `};` +
        // fetch
        `var _f=window.fetch;` +
        `if(_f)window.fetch=function(r,o){` +
            `if(typeof r==='string')r=rw(r);` +
            `return _f.call(window,r,o);` +
        `};` +
        `})();</script>`;

    // Inject before </head> or at the very start
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
            return `'${'/aura/proxy?url=' + encodeURIComponent(new URL(trimmed, baseUrl).toString())}'`;
        } catch { return url; }
    }
    return css.replace(/url\(([^)]*)\)/gi, (_, inner) => `url(${toProxy(inner)})`);
}

function bufferResponse(proxyRes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => resolve(Buffer.concat(chunks)));
        proxyRes.on('error', reject);
    });
}

// ── HTTP proxy ────────────────────────────────────────────────────────────────

function buildFwdHeaders(req) {
    const h = {
        'Accept':          req.headers['accept']          || 'text/html,*/*',
        'Accept-Language': req.headers['accept-language'] || 'en',
        'User-Agent':      'Mozilla/5.0 (ioBroker-Aura)',
    };
    // Forward relevant client headers
    for (const k of ['content-type', 'content-length', 'cookie',
                      'x-csrftoken', 'x-requested-with']) {
        if (req.headers[k]) h[k.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('-')] = req.headers[k];
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

// ── WebSocket proxy ───────────────────────────────────────────────────────────

function proxyWebSocket(req, socket, targetWsUrl, adapter) {
    let targetUrl;
    try {
        targetUrl = new URL(targetWsUrl);
        if (!['ws:', 'wss:'].includes(targetUrl.protocol)) throw new Error('Only ws/wss');
    } catch (e) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    const isSecure = targetUrl.protocol === 'wss:';
    const lib = isSecure ? https : http;
    const opts = {
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (isSecure ? 443 : 80),
        path:     targetUrl.pathname + (targetUrl.search || ''),
        method:   'GET',
        headers:  {
            Connection:             'Upgrade',
            Upgrade:                'websocket',
            Host:                   targetUrl.host,
            'Sec-WebSocket-Version': req.headers['sec-websocket-version'] || '13',
            'Sec-WebSocket-Key':     req.headers['sec-websocket-key'],
        },
        rejectUnauthorized: false,
    };
    if (req.headers['sec-websocket-protocol']) {
        opts.headers['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol'];
    }
    if (req.headers['cookie']) opts.headers['Cookie'] = req.headers['cookie'];

    const proxyReq = lib.request(opts);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        const lines = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}`,
        ];
        if (proxyRes.headers['sec-websocket-protocol']) {
            lines.push(`Sec-WebSocket-Protocol: ${proxyRes.headers['sec-websocket-protocol']}`);
        }
        socket.write(lines.join('\r\n') + '\r\n\r\n');
        if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        proxySocket.on('error', () => socket.destroy());
        socket.on('error',      () => proxySocket.destroy());
    });
    proxyReq.on('error', e => {
        adapter.log.debug(`aura: WS proxy error for ${targetWsUrl}: ${e.message}`);
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
    });
    proxyReq.end();
}

// ── Extension entry point ─────────────────────────────────────────────────────

class webExtension {
    constructor(server, webSettings, adapter, instanceSettings, app) {

        // ── HTTP(S) proxy ─────────────────────────────────────────────────────
        app.all('/aura/proxy', (req, res) => {
            const urlParam = req.query && req.query.url;
            if (!urlParam || typeof urlParam !== 'string') {
                res.status(400).send('Missing url parameter');
                return;
            }

            let targetUrl;
            try {
                targetUrl = new URL(urlParam);
                if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Only http/https allowed');
            } catch (e) {
                res.status(400).send(`Invalid proxy URL: ${e.message}`);
                return;
            }

            const lib = targetUrl.protocol === 'https:' ? https : http;
            const fwdHeaders = buildFwdHeaders(req);
            // Override Referer to the target origin so Django CSRF passes
            fwdHeaders['Referer'] = targetUrl.origin + '/';

            const reqOptions = {
                hostname: targetUrl.hostname,
                port:     targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path:     targetUrl.pathname + targetUrl.search,
                method:   req.method,
                timeout:  TIMEOUT_MS,
                headers:  fwdHeaders,
                rejectUnauthorized: false,
            };

            const proxyReq = lib.request(reqOptions, (proxyRes) => {
                if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
                    const absLocation = new URL(proxyRes.headers.location, targetUrl.toString()).toString();
                    const rh = buildHeaders(proxyRes.headers);
                    rh['location'] = `/aura/proxy?url=${encodeURIComponent(absLocation)}`;
                    res.writeHead(proxyRes.statusCode, rh);
                    res.end();
                    return;
                }

                const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
                const isHtml = ct.includes('text/html');
                const isCss  = ct.includes('text/css');

                if (isHtml || isCss) {
                    const resHeaders = buildHeaders(proxyRes.headers);
                    delete resHeaders['content-length'];
                    bufferResponse(proxyRes).then(buf => {
                        const charset = (ct.match(/charset=([^\s;]+)/) || [])[1] || 'utf-8';
                        const enc = charset.toLowerCase() === 'utf-8' ? 'utf8' : 'latin1';
                        let text = buf.toString(enc);
                        text = isHtml
                            ? rewriteHtml(text, targetUrl.toString())
                            : rewriteCss(text, targetUrl.toString());
                        res.writeHead(proxyRes.statusCode || 200, resHeaders);
                        res.end(text, enc);
                    }).catch(e => {
                        if (!res.headersSent) res.status(502).send(`Proxy rewrite error: ${e.message}`);
                    });
                } else {
                    const resHeaders = buildHeaders(proxyRes.headers);
                    res.writeHead(proxyRes.statusCode || 200, resHeaders);
                    proxyRes.pipe(res, { end: true });
                }
            });

            proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).send('Proxy timeout'); });
            proxyReq.on('error',   e  => { if (!res.headersSent) res.status(502).send(`Proxy error: ${e.message}`); });
            req.pipe(proxyReq, { end: true });
        });

        // ── WebSocket proxy ───────────────────────────────────────────────────
        server.on('upgrade', (req, socket, head) => {
            let parsedUrl;
            try { parsedUrl = new URL(req.url, 'http://localhost'); } catch { return; }
            if (parsedUrl.pathname !== '/aura/proxyws') return;

            const targetWsUrl = parsedUrl.searchParams.get('url');
            if (!targetWsUrl) { socket.destroy(); return; }

            proxyWebSocket(req, socket, targetWsUrl, adapter);
        });

        adapter.log.info('aura: proxy routes /aura/proxy and /aura/proxyws registered');
    }
}

module.exports = webExtension;
