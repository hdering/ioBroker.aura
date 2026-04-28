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
                // Allow self-signed certs on local network
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

                const resHeaders = buildHeaders(proxyRes.headers);
                res.writeHead(proxyRes.statusCode || 200, resHeaders);
                proxyRes.pipe(res, { end: true });
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
