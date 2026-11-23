'use strict';

/**
 * The HTTP surface of Aura's server-side security: admin login + section/tab PIN
 * unlock, all verified here on the adapter host (scrypt) so no secret is checked
 * in the browser. Isolated from main.js (it needs only a vault + a logger) so
 * tools/tests/security-api.mjs can drive it over a real http.Server.
 *
 * The vault argument is a { load(), save(data) } pair (see VaultFile). `data`
 * shape: { version, serverSecret, admin:{salt,hash}|null, sections:{key:{...}} }.
 *
 * `restoreView(key, content)` is the one thing that needs more than the vault: it
 * writes a payload back into `config.dashboard` (main.js owns the state). Left out
 * — as in the unit test — a removal only forgets the vault entry. `onCodesChanged()`
 * likewise refreshes the config after a named PIN got a new code.
 *
 * Admin session (#997, step 5): besides the Bearer token in the answer, a login
 * sets an HttpOnly cookie (`cookieName`, one per instance). Behind the web
 * extension Aura shares its origin with every other page of the web adapter, and
 * a token in localStorage would be readable by all of them; the frontend now
 * keeps the token only in memory and lets the cookie carry the session across a
 * reload. The cookie counts only with the `X-Aura-Request` header — a custom
 * header a foreign page cannot send without a CORS preflight nobody answers, so
 * a form or a sandboxed proxied page (WebKit sends even SameSite=Strict cookies
 * from those) cannot ride on it.
 */

const crypto = require('node:crypto');
const { hashSecret, verifySecret, signToken, verifyToken } = require('./authCore');
const { setRelease } = require('../mcp/protectedView');
const { saveCode, codeUsers } = require('./dashboardVault');

const ADMIN_TTL_MS = 8 * 60 * 60 * 1000; // admin session ≈ a working day
/** Request header the frontend sends with every security API call (CSRF guard for the cookie). */
const REQUEST_HEADER = 'x-aura-request';
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // a view unlock outlives it; pinRelock re-locks anyway

/**
 * A short fingerprint of a view's current PIN, carried in its unlock grant. A new
 * code (or salt) changes it, so a grant for the old PIN stops reading the content.
 * Derived from the scrypt hash, never the hash itself — the token body is readable
 * by the client.
 */
function pinFingerprint(sec) {
    return crypto
        .createHash('sha256')
        .update(`${sec.salt || ''}:${sec.hash || ''}`)
        .digest('base64url')
        .slice(0, 16);
}

/** Value of cookie `name` in a request, or null. */
function readCookie(req, name) {
    const raw = (req && req.headers && req.headers.cookie) || '';
    for (const part of String(raw).split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return null;
}

/** Did the request come over TLS (directly or as the web extension / a reverse proxy says)? */
function isSecureRequest(req) {
    if (req.socket && /** @type {any} */ (req.socket).encrypted) return true;
    const p = req.headers && req.headers['x-forwarded-proto'];
    return String(Array.isArray(p) ? p[0] : p || '')
        .toLowerCase()
        .startsWith('https');
}

function createSecurityApi({ vault, log, restoreView, onCodesChanged, cookieName = 'aura_admin' }) {
    const noop = () => {};
    const logger = log || { info: noop, warn: noop, error: noop };
    // Per-bucket failed-attempt counters for the online brute-force lockout.
    const attempts = new Map();

    function rateLimit(bucket) {
        const rec = attempts.get(bucket);
        if (rec && rec.until > Date.now()) {
            return { blocked: true, retryAfter: Math.ceil((rec.until - Date.now()) / 1000) };
        }
        return { blocked: false, retryAfter: 0 };
    }

    function recordAttempt(bucket, ok) {
        if (ok) {
            attempts.delete(bucket);
            return;
        }
        const rec = attempts.get(bucket) || { count: 0, until: 0 };
        rec.count++;
        if (rec.count >= 5) {
            // 5 free tries, then 5s → 15s → 60s → 300s (capped). A 4-digit PIN takes
            // days to walk under this — the online defence the short code lacks.
            const steps = [5, 15, 60, 300];
            rec.until = Date.now() + steps[Math.min(rec.count - 5, steps.length - 1)] * 1000;
        }
        attempts.set(bucket, rec);
    }

    function readJsonBody(req, maxBytes = 512 * 1024) {
        return new Promise((resolve) => {
            let size = 0;
            const chunks = [];
            req.on('data', (c) => {
                size += c.length;
                if (size > maxBytes) {
                    req.destroy();
                    resolve({});
                    return;
                }
                chunks.push(c);
            });
            req.on('end', () => {
                if (!chunks.length) return resolve({});
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch {
                    resolve({});
                }
            });
            req.on('error', () => resolve({}));
        });
    }

    /**
     * The admin payload of a valid Bearer token — or of the session cookie when
     * the request carries the X-Aura-Request header — else `null`.
     */
    function adminPayload(req, data) {
        const h = (req.headers && req.headers['authorization']) || '';
        const m = /^Bearer\s+(.+)$/i.exec(h);
        let token = m ? m[1].trim() : null;
        if (!token && req.headers && req.headers[REQUEST_HEADER]) token = readCookie(req, cookieName);
        if (!token) return null;
        const payload = verifyToken(token, data.serverSecret);
        return payload && payload.role === 'admin' ? payload : null;
    }

    /**
     * Set-Cookie for an admin session (`maxAgeMs` 0 = delete). Path `/`: the
     * cookie must also reach Aura behind a reverse proxy sub-path, and the proxy
     * never hands it on to a target (lib/proxyJar.js).
     */
    function sessionCookie(req, token, maxAgeMs) {
        const secure = isSecureRequest(req) ? '; Secure' : '';
        return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
    }

    /** A fresh admin session: token + expiry for the answer, cookie for the browser. */
    function newSession(req, data, extra = {}) {
        const token = signToken({ role: 'admin' }, data.serverSecret, ADMIN_TTL_MS);
        return {
            body: { ...extra, token, exp: Date.now() + ADMIN_TTL_MS },
            headers: { 'Set-Cookie': sessionCookie(req, token, ADMIN_TTL_MS) },
        };
    }

    function adminAuthed(req, data) {
        return !!adminPayload(req, data);
    }

    async function handle(req, res, parsedUrl) {
        const send = (code, obj, headers = {}) => {
            if (!res.headersSent) {
                res.writeHead(code, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...headers,
                });
            }
            res.end(JSON.stringify(obj));
        };
        const sendSession = (/** @type {{body: object, headers: object}} */ s) => send(200, s.body, s.headers);

        const route = parsedUrl.pathname.slice('/api/aura/'.length).replace(/\/+$/, '');
        const method = req.method || 'GET';
        const data = vault.load();

        // GET /admin/status — is an admin password set yet? (drives first-run setup)
        if (route === 'admin/status' && method === 'GET') {
            return send(200, { configured: !!(data.admin && data.admin.hash) });
        }

        // POST /admin/setup {password} — first run only, before any password exists.
        if (route === 'admin/setup' && method === 'POST') {
            if (data.admin && data.admin.hash) return send(409, { error: 'already configured' });
            const body = await readJsonBody(req);
            const password = String((body && body.password) || '');
            if (password.length < 4) return send(400, { error: 'password too short' });
            data.admin = hashSecret(password);
            vault.save(data);
            logger.info('aura: admin password configured (first run)');
            return sendSession(newSession(req, data));
        }

        // POST /admin/login {password}
        if (route === 'admin/login' && method === 'POST') {
            const rl = rateLimit('admin:login');
            if (rl.blocked) return send(429, { error: 'too many attempts', retryAfter: rl.retryAfter });
            const body = await readJsonBody(req);
            const password = String((body && body.password) || '');
            if (!data.admin || !data.admin.hash || !verifySecret(password, data.admin.salt, data.admin.hash)) {
                recordAttempt('admin:login', false);
                return send(401, { error: 'invalid password' });
            }
            recordAttempt('admin:login', true);
            return sendSession(newSession(req, data));
        }

        // POST /admin/logout — drop the session cookie. The token itself stays
        // valid until it expires (it is stateless); the frontend forgets it.
        if (route === 'admin/logout' && method === 'POST') {
            return send(200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
        }

        // GET /admin/session — Bearer admin. Is this session still valid?
        //
        // The frontend keeps the token in localStorage, so it survives long past the
        // 8 h the server honours it. Without this probe an expired session still
        // looked logged in and every admin call failed with a misleading message
        // (“wrong PIN” on the password change, #632); the editor asks on mount and
        // when the tab comes back, and bounces to the login page on a 401.
        if (route === 'admin/session' && method === 'GET') {
            const payload = adminPayload(req, data);
            if (!payload) return send(401, { error: 'unauthorized' });
            return send(200, { ok: true, exp: payload.exp });
        }

        // POST /admin/change {newPassword} — Bearer admin.
        if (route === 'admin/change' && method === 'POST') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const body = await readJsonBody(req);
            const newPassword = String((body && body.newPassword) || '');
            if (newPassword.length < 4) return send(400, { error: 'password too short' });
            data.admin = hashSecret(newPassword);
            vault.save(data);
            // A fresh token with the change: whoever just set the password should not
            // be thrown out minutes later because the old session was nearly up.
            return sendSession(newSession(req, data, { ok: true }));
        }

        // GET /vault — Bearer admin. Protected content + metadata for the editor.
        // Never returns a PIN (only a scrypt hash is stored); the editor keeps an
        // unchanged PIN with the KEEP sentinel instead.
        if (route === 'vault' && method === 'GET') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const out = {};
            for (const [key, s] of Object.entries(data.sections || {})) {
                out[key] = {
                    scope: s.scope,
                    name: s.name,
                    pinRelock: s.pinRelock,
                    // Whether this view is released for MCP editing, so the editor
                    // can draw the switch in the state it is really in.
                    mcpWrite: s.mcpWrite === true,
                    // The named PIN this view uses — no secret, only its id.
                    code: s.code,
                    content: s.content,
                };
            }
            return send(200, { sections: out });
        }

        // GET /vault/codes — Bearer admin. The named PINs (name + digit count, never
        // the code) and which view uses which, for the „Zugriffsschutz“ overview.
        if (route === 'vault/codes' && method === 'GET') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const codes = {};
            for (const [id, c] of Object.entries(data.codes || {})) codes[id] = { name: c.name, len: c.len };
            const views = {};
            for (const [key, s] of Object.entries(data.sections || {})) if (s && s.code) views[key] = s.code;
            return send(200, { codes, views });
        }

        // POST /vault/codes {id?, name, pin?} — Bearer admin. Create a named PIN, or
        // rename / re-key one. A new code reaches every view that uses it at once;
        // `onCodesChanged` then refreshes the keypad digit counts in the config.
        if (route === 'vault/codes' && method === 'POST') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const body = await readJsonBody(req);
            const res = saveCode(data, {
                id: body && body.id ? String(body.id) : undefined,
                name: body && body.name,
                pin: body && body.pin,
            });
            if (res.error) return send(res.error === 'unknown code' ? 404 : 400, res);
            vault.save(data);
            // A fresh PIN has no views yet — only a re-keyed one changes digit counts.
            if (body && body.id && body.pin && onCodesChanged) {
                try {
                    await onCodesChanged();
                } catch (e) {
                    logger.warn(`aura: PIN vault — digit counts not refreshed: ${e.message}`);
                }
            }
            const c = data.codes[res.id];
            return send(200, { id: res.id, name: c.name, len: c.len });
        }

        // POST /vault/codes/delete {id} — Bearer admin. Only an unused PIN may go: a
        // view still pointing at it would silently keep a code nobody can see.
        if (route === 'vault/codes/delete' && method === 'POST') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const body = await readJsonBody(req);
            const id = String((body && body.id) || '');
            if (!data.codes || !data.codes[id]) return send(200, { id, removed: false });
            const users = codeUsers(data, id);
            if (users.length) return send(409, { error: 'in use', users });
            delete data.codes[id];
            vault.save(data);
            return send(200, { id, removed: true });
        }

        // POST /vault/mcp {key, enabled} — Bearer admin. The release the AI server
        // needs to change a protected view („Über MCP bearbeitbar“ in the editor).
        //
        // Admin-only and stored in the vault on purpose: config.dashboard is
        // writable by any connected socket client, so a release kept there would be
        // one that anybody could grant themselves. The PIN is not involved — the
        // point of this switch is that nobody has to type it into a chat.
        if (route === 'vault/mcp' && method === 'POST') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const body = await readJsonBody(req);
            const key = String((body && body.key) || '');
            const enabled = !!(body && body.enabled);
            const res = setRelease(vault, key, enabled);
            if (res.error) return send(404, res);
            logger.info(`aura: MCP release for ${key} ${enabled ? 'granted' : 'revoked'}`);
            return send(200, res);
        }

        // POST /vault/remove {key} — Bearer admin. „PIN entfernen“ in the editor:
        // put the view's content back into config.dashboard and forget the entry.
        //
        // Both halves in one step, on purpose. The content exists only here and in
        // the stub's place in the state, so a client that merely dropped the entry
        // would need a save to land the content — and a discarded edit in between
        // would take it with it. The answer carries the payload so the editor can
        // mirror the same result without waiting for the state to come back.
        // Idempotent: a key the vault does not know answers 200 with removed:false.
        if (route === 'vault/remove' && method === 'POST') {
            if (!adminAuthed(req, data)) return send(401, { error: 'unauthorized' });
            const body = await readJsonBody(req);
            const key = String((body && body.key) || '');
            if (!key) return send(400, { error: 'key required' });
            const entry = data.sections && data.sections[key];
            if (!entry) return send(200, { key, removed: false });
            let restored = false;
            if (restoreView) {
                try {
                    restored = await restoreView(key, entry.content);
                } catch (e) {
                    // The state write failed — keep the entry, it is the only copy.
                    logger.warn(`aura: PIN vault — ${key} not released: ${e.message}`);
                    return send(500, { error: 'restore failed' });
                }
            }
            delete data.sections[key];
            vault.save(data);
            logger.info(`aura: PIN vault — ${key} forgotten (PIN removed in the editor)`);
            return send(200, { key, removed: true, restored, scope: entry.scope, content: entry.content });
        }

        // POST /pin/unlock {key, pin} — verify the code server-side, hand back the
        // protected content and a signed unlock grant. Rate-limited per view.
        if (route === 'pin/unlock' && method === 'POST') {
            const body = await readJsonBody(req);
            const key = String((body && body.key) || '');
            const pin = String((body && body.pin) || '');
            const bucket = `unlock:${key}`;
            const rl = rateLimit(bucket);
            if (rl.blocked) return send(429, { error: 'too many attempts', retryAfter: rl.retryAfter });
            const sec = (data.sections || {})[key];
            if (!sec || !verifySecret(pin, sec.salt, sec.hash)) {
                recordAttempt(bucket, false);
                return send(401, { error: 'invalid pin' });
            }
            recordAttempt(bucket, true);
            return send(200, {
                key,
                content: sec.content,
                pinRelock: sec.pinRelock,
                unlockToken: signToken({ key, v: pinFingerprint(sec) }, data.serverSecret, UNLOCK_TTL_MS),
                exp: Date.now() + UNLOCK_TTL_MS,
            });
        }

        // POST /pin/content {key} + Bearer unlockToken — the view's CURRENT content
        // for a viewer who already unlocked it. The frontend keeps what /pin/unlock
        // handed out; without this, a change written into the vault (MCP, another
        // editor) only showed after a reload. 401 = no valid grant for this key and
        // PIN (expired, forged, PIN changed); 404 = the vault no longer holds it.
        if (route === 'pin/content' && method === 'POST') {
            const body = await readJsonBody(req);
            const key = String((body && body.key) || '');
            const h = (req.headers && req.headers['authorization']) || '';
            const m = /^Bearer\s+(.+)$/i.exec(h);
            const grant = m ? verifyToken(m[1].trim(), data.serverSecret) : null;
            if (!key || !grant || grant.key !== key) return send(401, { error: 'unauthorized' });
            const sec = (data.sections || {})[key];
            if (!sec) return send(404, { error: 'unknown view' });
            if (grant.v !== pinFingerprint(sec)) return send(401, { error: 'unauthorized' });
            return send(200, { key, content: sec.content, pinRelock: sec.pinRelock });
        }

        return send(404, { error: 'unknown endpoint' });
    }

    return { handle, attempts };
}

module.exports = { createSecurityApi, ADMIN_TTL_MS, UNLOCK_TTL_MS, REQUEST_HEADER };
