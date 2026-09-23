// A login from before the server-side PIN vault (#704).
//
//   node tools/tests/auth-legacy-session.mjs
//
// The old auth store persisted { pinHash, sessionActive } under the same
// localStorage key `aura-auth`. After an update that flag opened the editor
// without a token: the vault read was skipped (a protected tab showed up empty)
// and „PIN entfernen“ had nothing to send. The production build has to treat
// such a session as expired; dev keeps it, because the test harness seeds exactly
// that shape as its fake login.
//
// No dev server needed — store/authStore.ts is bundled twice with esbuild, once
// per value of import.meta.env.DEV, against an in-memory localStorage.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

async function bundle(dev) {
    const out = join(cache, `aura-auth-legacy-${dev ? 'dev' : 'prod'}-${process.pid}.mjs`);
    await build({
        stdin: {
            contents: "export * from './src-vis/store/authStore.ts';",
            resolveDir: process.cwd(),
            loader: 'ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: out,
        define: { 'import.meta.env.DEV': dev ? 'true' : 'false' },
        logLevel: 'warning',
    });
    return out;
}

const files = { prod: await bundle(false), dev: await bundle(true) };

const mem = new Map();
globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() {
        return mem.size;
    },
};
// verifyAdminSession asks the server; answer „session ok“ for any real token.
globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });

let n = 0;
/** A fresh module instance that rehydrates from `persisted`. */
async function load(mode, persisted) {
    mem.clear();
    if (persisted) mem.set('aura-auth', JSON.stringify({ state: persisted, version: 0 }));
    return import(`${pathToFileURL(files[mode]).href}?i=${n++}`);
}

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });
const snap = (m) => {
    const s = m.useAuthStore.getState();
    return { sessionActive: s.sessionActive, token: s.token, sessionExpired: s.sessionExpired };
};

// ── 1. Production: the pre-vault login is no session ──
{
    const m = await load('prod', { pinHash: 'abc123', sessionActive: true });
    const s = snap(m);
    ok('prod: legacy flag dropped on boot', s.sessionActive === false, JSON.stringify(s));
    ok('prod: login page told why', s.sessionExpired === true, JSON.stringify(s));
    ok('prod: no token handed out', m.adminToken() == null);
}
{
    // Set after boot (e.g. by some other path) — the session probe catches it too.
    const m = await load('prod', null);
    m.useAuthStore.setState({ sessionActive: true, token: null });
    const res = await m.verifyAdminSession();
    const s = snap(m);
    ok('prod: probe rejects a tokenless session', res === false && s.sessionActive === false, JSON.stringify(s));
}

// ── 2. Production: a real session survives ──
{
    const exp = Date.now() + 60 * 60 * 1000;
    const m = await load('prod', { token: 'tok', tokenExp: exp, sessionActive: true });
    ok('prod: token session kept on boot', snap(m).sessionActive === true, JSON.stringify(snap(m)));
    const res = await m.verifyAdminSession();
    ok('prod: token session passes the probe', res === true && snap(m).sessionActive === true);
}
{
    const m = await load('prod', { token: 'tok', tokenExp: Date.now() - 1000, sessionActive: true });
    ok('prod: expired token still dropped', snap(m).sessionActive === false && snap(m).sessionExpired === true);
}
{
    const m = await load('prod', null);
    ok('prod: nothing stored = logged out, not „expired“', !snap(m).sessionActive && !snap(m).sessionExpired);
}

// ── 3. Dev: the harness' fake login keeps working ──
{
    const m = await load('dev', { sessionActive: true });
    ok('dev: tokenless flag kept on boot', snap(m).sessionActive === true, JSON.stringify(snap(m)));
    const res = await m.verifyAdminSession();
    ok('dev: probe leaves the fake login alone', res === true && snap(m).sessionActive === true);
}

rmSync(files.prod, { force: true });
rmSync(files.dev, { force: true });

let failed = 0;
for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`);
    if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
