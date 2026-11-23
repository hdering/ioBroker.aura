'use strict';

/**
 * Cookie jar and capability keys for `/proxy` behind the web adapter extension
 * (#997, step 5).
 *
 * Under `<web>/aura/` Aura shares its origin with vis, vis-2, the web adapter's
 * login session and everything else on that port. A page fetched through
 * `/proxy` would run in that origin, so main.js serves it with
 * `Content-Security-Policy: sandbox` (no `allow-same-origin`): its scripts get an
 * opaque origin, no cookies, no localStorage, no web session.
 *
 * Two things the browser did for such a page now happen here:
 *
 *  - **Cookies.** Requests from a sandboxed document carry no (Chromium) or
 *    arbitrary (Firefox: Lax, WebKit: all) cookies, so the target's session would
 *    get lost — or the browser's cookies for the ioBroker host would leak to it.
 *    The target's `Set-Cookie` lands in a server-side jar instead, and the
 *    request to the target gets the jar's cookies, never the browser's.
 *  - **Who may use the proxy.** Every sub-request of a sandboxed page is
 *    `Sec-Fetch-Site: cross-site` and Chromium sends no Referer, which is exactly
 *    what a foreign web page abusing a visitor's browser looks like. URLs the
 *    rewriter hands out therefore carry `t=<jar>.<mac>`, an HMAC over the jar and
 *    the target origin with a secret that never leaves this process. A valid key
 *    lets a cross-site request through, for that origin only.
 *
 * Both live in memory: an adapter restart logs the pages out (they log in again)
 * and invalidates the keys (the iframe reloads with a fresh one).
 */

const crypto = require('node:crypto');

const MAX_JARS = 500;
const MAX_COOKIES_PER_JAR = 300;
const JAR_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `http(s)://host[:port]` of a proxy target, ws/wss mapped to http/https.
 */
function targetOrigin(url) {
    const u = url instanceof URL ? url : new URL(String(url));
    const proto = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return `${proto}//${u.host}`;
}

/**
 * RFC 6265 default-path: the directory of the request path.
 */
function defaultPath(pathname) {
    if (!pathname || pathname[0] !== '/') {
        return '/';
    }
    const i = pathname.lastIndexOf('/');
    return i <= 0 ? '/' : pathname.slice(0, i);
}

function pathMatches(cookiePath, reqPath) {
    if (reqPath === cookiePath) {
        return true;
    }
    if (!reqPath.startsWith(cookiePath)) {
        return false;
    }
    return cookiePath.endsWith('/') || reqPath[cookiePath.length] === '/';
}

function domainMatches(cookie, host) {
    if (cookie.hostOnly) {
        return host === cookie.domain;
    }
    return host === cookie.domain || host.endsWith(`.${cookie.domain}`);
}

/**
 * Parse one `Set-Cookie` header value for a response from `url`.
 *
 * @param {string} header raw header value
 * @param {URL} url the URL the response came from
 * @param {number} [nowMs] the clock (the jar passes its own)
 * @returns {{name:string,value:string,domain:string,hostOnly:boolean,path:string,secure:boolean,httpOnly:boolean,expires:number|null}|null} null = rejected
 */
function parseSetCookie(header, url, nowMs = Date.now()) {
    const parts = String(header).split(';');
    const first = parts.shift() || '';
    const eq = first.indexOf('=');
    if (eq <= 0) {
        return null;
    }
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) {
        return null;
    }
    const host = url.hostname.toLowerCase();
    const cookie = {
        name,
        value,
        domain: host,
        hostOnly: true,
        path: defaultPath(url.pathname),
        secure: false,
        httpOnly: false,
        expires: null,
    };
    let maxAge = null;
    for (const raw of parts) {
        const i = raw.indexOf('=');
        const key = (i < 0 ? raw : raw.slice(0, i)).trim().toLowerCase();
        const val = i < 0 ? '' : raw.slice(i + 1).trim();
        if (key === 'domain' && val) {
            const d = val.replace(/^\./, '').toLowerCase();
            // A cookie for another site is not the target's to set.
            if (host !== d && !host.endsWith(`.${d}`)) {
                return null;
            }
            cookie.domain = d;
            cookie.hostOnly = false;
        } else if (key === 'path' && val.startsWith('/')) {
            cookie.path = val;
        } else if (key === 'secure') {
            cookie.secure = true;
        } else if (key === 'httponly') {
            cookie.httpOnly = true;
        } else if (key === 'max-age' && /^-?\d+$/.test(val)) {
            maxAge = Number(val);
        } else if (key === 'expires' && val) {
            const t = Date.parse(val);
            if (!Number.isNaN(t)) {
                cookie.expires = t;
            }
        }
    }
    if (maxAge !== null) {
        cookie.expires = nowMs + maxAge * 1000;
    }
    return cookie;
}

/**
 * @param {{secret?: Buffer, now?: () => number}} [opts] secret and clock (tests)
 */
function createProxyJar(opts = {}) {
    const secret = opts.secret || crypto.randomBytes(32);
    const now = opts.now || Date.now;
    const jars = new Map();

    const mac = (text) => crypto.createHmac('sha256', secret).update(text).digest('base64url').slice(0, 22);
    const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(id);

    function newJarId() {
        return crypto.randomBytes(16).toString('base64url');
    }

    /**
     * `<jar>.<mac>` for the browser cookie that names this browser's jar.
     */
    function jarCookieValue(jarId) {
        return `${jarId}.${mac(`jar|${jarId}`)}`;
    }

    /**
     * The jar id from that cookie value, or null when it is not one of ours.
     */
    function jarFromCookieValue(value) {
        const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(String(value || ''));
        return m && safeEqual(m[2], mac(`jar|${m[1]}`)) ? m[1] : null;
    }

    /**
     * Capability key for requests from a page of this jar to `origin`.
     */
    function key(jarId, origin) {
        return `${jarId}.${mac(`key|${jarId}|${origin}`)}`;
    }

    /**
     * The jar a key grants for `origin`, or null (missing, forged, other origin).
     */
    function verifyKey(t, origin) {
        const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(String(t || ''));
        return m && safeEqual(m[2], mac(`key|${m[1]}|${origin}`)) ? m[1] : null;
    }

    function jar(jarId, create) {
        let j = jars.get(jarId);
        if (!j && create) {
            if (jars.size >= MAX_JARS) {
                prune(true);
            }
            j = { seen: now(), cookies: new Map() };
            jars.set(jarId, j);
        }
        if (j) {
            j.seen = now();
        }
        return j || null;
    }

    function prune(force) {
        const limit = now() - JAR_IDLE_MS;
        for (const [id, j] of jars) {
            if (j.seen < limit) {
                jars.delete(id);
            }
        }
        if (force && jars.size >= MAX_JARS) {
            // Oldest first — Map keeps insertion order, `seen` refreshes on use.
            const oldest = [...jars.entries()].sort((a, b) => a[1].seen - b[1].seen);
            for (const [id] of oldest.slice(0, Math.ceil(MAX_JARS / 10))) {
                jars.delete(id);
            }
        }
    }

    /**
     * Keep the target's cookies from a response.
     *
     * @param {string} jarId the browser's jar
     * @param {URL} url the URL that answered
     * @param {string|string[]|undefined} setCookie the response's Set-Cookie header(s)
     */
    function store(jarId, url, setCookie) {
        if (!validId(jarId) || !setCookie) {
            return;
        }
        const list = Array.isArray(setCookie) ? setCookie : [setCookie];
        const j = jar(jarId, true);
        if (!j) {
            return;
        }
        for (const header of list) {
            const c = parseSetCookie(header, url, now());
            if (!c) {
                continue;
            }
            const id = `${c.domain}|${c.path}|${c.name}`;
            if (c.expires !== null && c.expires <= now()) {
                j.cookies.delete(id);
                continue;
            }
            if (!j.cookies.has(id) && j.cookies.size >= MAX_COOKIES_PER_JAR) {
                continue;
            }
            j.cookies.set(id, c);
        }
    }

    /**
     * The cookies of `jarId` that a request to `url` carries (all or script-visible only).
     */
    function matching(jarId, url, scriptOnly) {
        const j = validId(jarId) ? jar(jarId, false) : null;
        if (!j) {
            return [];
        }
        const host = url.hostname.toLowerCase();
        const secure = url.protocol === 'https:' || url.protocol === 'wss:';
        const out = [];
        for (const [id, c] of j.cookies) {
            if (c.expires !== null && c.expires <= now()) {
                j.cookies.delete(id);
                continue;
            }
            if (!domainMatches(c, host) || !pathMatches(c.path, url.pathname || '/')) {
                continue;
            }
            if (c.secure && !secure) {
                continue;
            }
            if (scriptOnly && c.httpOnly) {
                continue;
            }
            out.push(c);
        }
        // Longer paths first, as browsers do.
        out.sort((a, b) => b.path.length - a.path.length);
        return out;
    }

    /**
     * `Cookie` header for a request to `url`, or '' when the jar has none.
     */
    function header(jarId, url) {
        return matching(jarId, url, false)
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');
    }

    /**
     * What `document.cookie` of a page from `url` reads (no HttpOnly cookies).
     */
    function scriptCookies(jarId, url) {
        return matching(jarId, url, true)
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');
    }

    return {
        newJarId,
        jarCookieValue,
        jarFromCookieValue,
        key,
        verifyKey,
        store,
        header,
        scriptCookies,
        size: () => jars.size,
    };
}

/**
 * Read one cookie from a request's `Cookie` header.
 */
function readCookie(req, name) {
    const raw = (req && req.headers && req.headers.cookie) || '';
    for (const part of String(raw).split(';')) {
        const i = part.indexOf('=');
        if (i < 0) {
            continue;
        }
        if (part.slice(0, i).trim() === name) {
            return part.slice(i + 1).trim();
        }
    }
    return null;
}

/**
 * A browser `Cookie` header without the cookies that belong to Aura or the web
 * adapter on this host — what may go on to a proxy target on Aura's own port,
 * where proxied pages still use the browser's cookie store.
 *
 * Cookies ignore the port: a browser sends the web adapter's login session
 * (`connect.sid`) and Aura's admin cookie to :8095 as well, and from there the
 * proxy handed them to whatever site it fetched.
 */
function foreignCookies(raw) {
    return String(raw || '')
        .split(';')
        .map((p) => p.trim())
        .filter((p) => {
            const name = p.split('=')[0].trim();
            return name && name !== 'connect.sid' && name !== 'io' && !/^aura[-_.]/i.test(name);
        })
        .join('; ');
}

module.exports = { createProxyJar, parseSetCookie, readCookie, foreignCookies, targetOrigin };
