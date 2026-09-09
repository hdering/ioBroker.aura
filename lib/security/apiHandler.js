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
 * — as in the unit test — a removal only forgets the vault entry.
 */

const { hashSecret, verifySecret, signToken, verifyToken } = require('./authCore');
const { setRelease } = require('../mcp/protectedView');

const ADMIN_TTL_MS = 8 * 60 * 60 * 1000; // admin session ≈ a working day
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // a view unlock outlives it; pinRelock re-locks anyway

function createSecurityApi({ vault, log, restoreView }) {
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

    /** The admin payload of a valid Bearer token, or `null` (missing/forged/expired). */
    function adminPayload(req, data) {
        const h = (req.headers && req.headers['authorization']) || '';
        const m = /^Bearer\s+(.+)$/i.exec(h);
        if (!m) return null;
        const payload = verifyToken(m[1].trim(), data.serverSecret);
        return payload && payload.role === 'admin' ? payload : null;
    }

    function adminAuthed(req, data) {
        return !!adminPayload(req, data);
    }

    async function handle(req, res, parsedUrl) {
        const send = (code, obj) => {
            if (!res.headersSent) {
                res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            }
            res.end(JSON.stringify(obj));
        };

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
            return send(200, {
                token: signToken({ role: 'admin' }, data.serverSecret, ADMIN_TTL_MS),
                exp: Date.now() + ADMIN_TTL_MS,
            });
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
            return send(200, {
                token: signToken({ role: 'admin' }, data.serverSecret, ADMIN_TTL_MS),
                exp: Date.now() + ADMIN_TTL_MS,
            });
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
            return send(200, {
                ok: true,
                token: signToken({ role: 'admin' }, data.serverSecret, ADMIN_TTL_MS),
                exp: Date.now() + ADMIN_TTL_MS,
            });
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
                    content: s.content,
                };
            }
            return send(200, { sections: out });
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
                unlockToken: signToken({ key }, data.serverSecret, UNLOCK_TTL_MS),
                exp: Date.now() + UNLOCK_TTL_MS,
            });
        }

        return send(404, { error: 'unknown endpoint' });
    }

    return { handle, attempts };
}

module.exports = { createSecurityApi, ADMIN_TTL_MS, UNLOCK_TTL_MS };
