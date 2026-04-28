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

// Rewrite all src/href/action/srcset attributes in HTML so relative and
// absolute URLs belonging to the proxied origin are routed through our proxy.
function rewriteHtml(html, baseUrl) {
    function toProxy(url) {
        if (!url) return url;
        const trimmed = url.trim();
        if (/^(data:|javascript:|blob:|mailto:|tel:|#)/.test(trimmed)) return url;
        try {
            const abs = new URL(trimmed, baseUrl).toString();
            return '/aura/proxy?url=' + encodeURIComponent(abs);
        } catch { return url; }
    }

    // Remove any existing <base> tag to avoid conflicts with our rewrites
    let out = html.replace(/<base\b[^>]*>/gi, '');

    // Rewrite quoted attribute values: src="…" href="…" action="…" srcset="…"
    // srcset can contain a comma-separated list of "url [descriptor]" entries
    out = out.replace(
        /\b(src|href|action)(\s*=\s*)(["'])([^"']*)\3/gi,
        (_, attr, eq, q, url) => `${attr}${eq}${q}${toProxy(url)}${q}`,
    );
    out = out.replace(
        /\bsrcset(\s*=\s*)(["'])([^"']*)\2/gi,
        (_, eq, q, val) => {
            const rewritten = val.replace(/([^,\s]+)(\s*(?:[^,]*))/g, (m, url, rest) => toProxy(url) + rest);
            return `srcset${eq}${q}${rewritten}${q}`;
        },
    );

    return out;
}

// Rewrite url() references in CSS so assets also route through the proxy.
function rewriteCss(css, baseUrl) {
    function toProxy(url) {
        const trimmed = url.replace(/^['"]|['"]$/g, '').trim();
        if (!trimmed || /^(data:|#)/.test(trimmed)) return url;
        try {
            const abs = new URL(trimmed, baseUrl).toString();
            return `'${'/aura/proxy?url=' + encodeURIComponent(abs)}'`;
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

class webExtension {
    constructor(server, webSettings, adapter, instanceSettings, app) {
        app.all('/aura/proxy', (req, res) => {
            const urlParam = req.query && req.query.url;
            if (!urlParam || typeof urlParam !== 'string') {
                res.status(400).send('Missing url parameter');
                return;
            }

            let targetUrl;
            try {
                targetUrl = new URL(urlParam);
                if (!['http:', 'https:'].includes(targetUrl.protocol)) {
                    throw new Error('Only http/https allowed');
                }
            } catch (e) {
                res.status(400).send(`Invalid proxy URL: ${e.message}`);
                return;
            }

            const lib = targetUrl.protocol === 'https:' ? https : http;
            const fwdHeaders = {
                'Accept': req.headers['accept'] || 'text/html,*/*',
                'Accept-Language': req.headers['accept-language'] || 'en',
                'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
            };
            if (req.headers['content-type'])   fwdHeaders['Content-Type']   = req.headers['content-type'];
            if (req.headers['content-length'])  fwdHeaders['Content-Length'] = req.headers['content-length'];
            if (req.headers['cookie'])          fwdHeaders['Cookie']         = req.headers['cookie'];

            const reqOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: req.method,
                timeout: TIMEOUT_MS,
                headers: fwdHeaders,
                rejectUnauthorized: false,
            };

            const proxyReq = lib.request(reqOptions, (proxyRes) => {
                // Rewrite redirects through the proxy
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
                    // Content-Length will be wrong after rewriting — remove it
                    delete resHeaders['content-length'];
                    bufferResponse(proxyRes).then(buf => {
                        const charset = (ct.match(/charset=([^\s;]+)/) || [])[1] || 'utf-8';
                        let text = buf.toString(charset === 'utf-8' ? 'utf8' : 'latin1');
                        text = isHtml
                            ? rewriteHtml(text, targetUrl.toString())
                            : rewriteCss(text, targetUrl.toString());
                        res.writeHead(proxyRes.statusCode || 200, resHeaders);
                        res.end(text, charset === 'utf-8' ? 'utf8' : 'latin1');
                    }).catch(e => {
                        if (!res.headersSent) res.status(502).send(`Proxy rewrite error: ${e.message}`);
                    });
                } else {
                    const resHeaders = buildHeaders(proxyRes.headers);
                    res.writeHead(proxyRes.statusCode || 200, resHeaders);
                    proxyRes.pipe(res, { end: true });
                }
            });

            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                if (!res.headersSent) res.status(504).send('Proxy timeout');
            });
            proxyReq.on('error', e => {
                if (!res.headersSent) res.status(502).send(`Proxy error: ${e.message}`);
            });
            req.pipe(proxyReq, { end: true });
        });

        adapter.log.info('aura: proxy route /aura/proxy registered');
    }
}

function buildHeaders(incoming) {
    const out = {};
    for (const [key, val] of Object.entries(incoming)) {
        if (!STRIP_HEADERS.has(key.toLowerCase())) out[key] = val;
    }
    return out;
}

module.exports = webExtension;
