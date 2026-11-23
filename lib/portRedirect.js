'use strict';

/**
 * The old own port as a pure transition (#997, step 10): with the own port
 * switched off and "forward the old port" on, Aura still listens on it, but
 * only to move the devices over to `<web>/aura/`.
 *
 * - A page load gets a small hand-over page: it packs the device-local settings
 *   of this origin (localStorage, which hangs on host AND port) into the URL
 *   fragment and replaces itself with `<web>/aura/#aura-handoff=…`, where the
 *   frontend (src-vis/utils/handoff.ts) takes them over once. The device id and
 *   its token need no hand-over: their cookie (`aura-device`, path /) is per host,
 *   not per port, so it is there already.
 * - The ioBroker socket keeps being passed through (`/socket.io`, `/lib`, the
 *   pure-WS root), so a dashboard left open on the old port stays connected
 *   until its version guard reloads it - and the reload lands on the page above.
 * - Everything else - vault, proxy, files, MCP - is gone from this port: 410.
 */

/**
 * localStorage keys that belong to the device, not to the configuration (that
 * comes from the server). Caches (icons) are fetched again. Kept equal to
 * HANDOFF_KEYS in src-vis/utils/handoff.ts (checked by tools/tests/port-redirect.mjs).
 */
const HANDOFF_KEYS = [
    'aura-connection',
    'aura-admin-prefs',
    'aura-messages-seen',
    'aura-announcements',
    'aura-message-defaults',
    'aura-iframe-zoom',
    'aura-theme-mode',
    'aura-boot-colors',
    'aura-speech-claims',
    'aura-dp-picker-filters',
    'aura-dp-picker-view',
    'aura-recent-templates',
    'aura-guideline-inset',
    'aura-guidelines-hint-dismissed',
    'aura-tabsleep-hint-dismissed',
];
/** One value above this is left behind; the whole hand-over stays below MAX_TOTAL. */
const MAX_ITEM = 16 * 1024;
const MAX_TOTAL = 48 * 1024;

/** Paths of the ioBroker socket that keep being passed through. */
const PASS_PREFIXES = ['/socket.io', '/lib'];

/**
 * @param {string} pathname request path
 * @returns {boolean} whether it is the ioBroker socket (or its client script)
 */
function isSocketPath(pathname) {
    return PASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * @param {string} pathname path of a WebSocket upgrade
 * @returns {boolean} whether it is the ioBroker socket (socket.io or pure WS on the root)
 */
function isSocketUpgrade(pathname) {
    return pathname === '/' || pathname.startsWith('/socket.io/');
}

const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The hand-over page. The target host is the one the browser used for the old
 * port - the web instance runs on the same host.
 *
 * @param {{ port: number, secure: boolean, path?: string }} target the web instance
 * @returns {string} HTML
 */
function handoffPage(target) {
    const cfg = JSON.stringify({
        port: Number(target.port) || 8082,
        secure: !!target.secure,
        path: target.path || '/aura/',
        keys: HANDOFF_KEYS,
        maxItem: MAX_ITEM,
        maxTotal: MAX_TOTAL,
    }).replace(/</g, '\\u003c');
    const shown = `${target.secure ? 'https' : 'http'}://&lt;host&gt;:${Number(target.port) || 8082}${escapeHtml(target.path || '/aura/')}`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Aura has moved</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#0f172a;color:#e2e8f0}a{color:#93c5fd}main{max-width:36rem;margin:10vh auto}</style>
</head><body><main>
<h1>Aura has moved</h1>
<p>Aura is now reached through the web adapter: <a id="to" href="#">${shown}</a>.</p>
<p>Taking this device's settings along… Please update bookmarks, kiosk URLs and home screen icons to the new address.</p>
<noscript><p>Open the new address by hand: ${shown}</p></noscript>
</main>
<script>
(function () {
  var c = ${cfg};
  var to = (c.secure ? 'https:' : 'http:') + '//' + location.hostname + ':' + c.port + c.path;
  var items = {}, total = 0;
  try {
    for (var i = 0; i < c.keys.length; i++) {
      var v = localStorage.getItem(c.keys[i]);
      if (v === null || v.length > c.maxItem || total + v.length > c.maxTotal) continue;
      items[c.keys[i]] = v;
      total += v.length;
    }
  } catch (e) { /* storage blocked: nothing to take along */ }
  var json = JSON.stringify({ v: 1, from: location.origin, hash: location.hash, items: items });
  var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  var url = to + location.search + '#aura-handoff=' + b64;
  var a = document.getElementById('to');
  a.href = to + location.search + location.hash;
  a.textContent = to;
  location.replace(url);
})();
</script>
</body></html>
`;
}

/**
 * Whether the request came through a reverse proxy (or a forwarded router port)
 * instead of straight to the old port. Then `<the same host>:<web port>` - the
 * forward's target - is usually not reachable for the browser at all: the proxy
 * itself has to point at the web instance instead.
 *
 * @param {import('node:http').IncomingMessage} req the request
 * @param {number} port the old port Aura listens on
 * @returns {string} the host name the browser used, when proxied; '' otherwise
 */
function proxiedHost(req, port) {
    const h = req.headers || {};
    const host = String(h['x-forwarded-host'] || h.host || '')
        .split(',')[0]
        .trim();
    if (h['x-forwarded-host'] || h['x-forwarded-for'] || h.forwarded || h['x-real-ip']) {
        return host || 'the proxy';
    }
    if (!host || !port) {
        return '';
    }
    let used = '';
    try {
        used = new URL(`http://${host}`).port;
    } catch {
        return '';
    }
    // no port in Host = 80/443, the default of a proxy - not the old port
    return used === String(port) ? '' : host;
}

/**
 * The page for a device that reached the old port through a reverse proxy: no
 * forward (it would point at a port the proxy does not pass), but what to change.
 * Once the proxy points at the web instance, this very address shows Aura under
 * /aura/ - same origin, so the browser keeps its settings without a hand-over.
 *
 * @param {{ port: number, secure: boolean }} target the web instance
 * @param {string} host the host name the browser used
 * @returns {string} HTML
 */
function proxyNoticePage(target, host) {
    const web = `${target.secure ? 'https' : 'http'}://&lt;ioBroker-IP&gt;:${Number(target.port) || 8082}`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Aura has moved</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#0f172a;color:#e2e8f0}a{color:#93c5fd}main{max-width:40rem;margin:10vh auto}code{background:#1e293b;padding:1px 4px;border-radius:3px}</style>
</head><body><main>
<h1>Aura has moved into the web adapter</h1>
<p><b>${escapeHtml(host)}</b> reaches Aura's old port through a reverse proxy. Aura now runs in the web adapter, so the proxy has to point there instead:</p>
<ul>
<li>Target: <code>${web}</code> - the web instance, not port 8095</li>
<li>Forward the <b>whole host</b>, not only <code>/aura/</code>, with WebSockets on</li>
<li>Optional redirect from <code>/</code> to <code>/aura/</code> only with <code>if ($request_uri = "/")</code>, never <code>location = /</code></li>
</ul>
<p>Then open <code>/aura/</code> on this address. Settings of this device stay, the address keeps its origin.</p>
<p><a href="https://hdering.github.io/ioBroker.aura/anleitungen/reverse-proxy">Reverse proxy examples (NPM, nginx, Caddy)</a></p>
</main></body></html>
`;
}

/**
 * The request handler of the old port in transition mode.
 *
 * @param {object} p parameters
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} p.full Aura's full handler, for the socket paths
 * @param {() => Promise<{ port: number, secure: boolean } | null>} p.target the web instance (port, HTTPS)
 * @param {number} [p.port] the old port, to tell a proxied request from a direct one
 * @param {(ip: string, proxied: string) => void} [p.onVisit] a device still came over the old port (proxied = host name, when through a proxy)
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} handler
 */
function createMovedHandler({ full, target, port, onVisit }) {
    return (req, res) => {
        let pathname = '/';
        try {
            pathname = new URL(req.url || '/', 'http://localhost').pathname;
        } catch {
            res.writeHead(400);
            res.end();
            return;
        }
        if (isSocketPath(pathname)) {
            full(req, res);
            return;
        }
        Promise.resolve(target())
            .catch(() => null)
            .then((t) => {
                const where = t ? `${t.secure ? 'https' : 'http'}://<host>:${t.port}/aura/` : '<web>/aura/';
                if (pathname === '/mcp') {
                    res.writeHead(410, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store',
                    });
                    res.end(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id: null,
                            error: {
                                code: -32000,
                                message: `Aura's MCP endpoint has moved to ${where}mcp - copy the client configuration from the Aura instance settings again.`,
                            },
                        }),
                    );
                    return;
                }
                const page = req.method === 'GET' || req.method === 'HEAD';
                const accept = String(req.headers.accept || '');
                // a browser loading a page says so; fetches of the old app (JSON, files) do not
                const navigation =
                    page && (accept.includes('text/html') || req.headers['sec-fetch-mode'] === 'navigate');
                if (navigation && t) {
                    const proxied = proxiedHost(req, Number(port) || 0);
                    onVisit?.(String(req.socket?.remoteAddress || '').replace(/^::ffff:/, ''), proxied);
                    const body = proxied ? proxyNoticePage(t, proxied) : handoffPage({ ...t, path: '/aura/' });
                    res.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-store',
                        'Referrer-Policy': 'origin',
                        'X-Content-Type-Options': 'nosniff',
                    });
                    res.end(req.method === 'HEAD' ? undefined : body);
                    return;
                }
                res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(`Aura has moved to ${where}`);
            });
    };
}

module.exports = {
    HANDOFF_KEYS,
    MAX_ITEM,
    MAX_TOTAL,
    handoffPage,
    proxyNoticePage,
    proxiedHost,
    createMovedHandler,
    isSocketPath,
    isSocketUpgrade,
};
