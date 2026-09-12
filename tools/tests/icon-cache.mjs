/**
 * lib/iconCache.js — Aura's same-origin Iconify API (#636).
 *
 * The frontend must never talk to api.iconify.design: mobile tracker blockers
 * and offline kiosks made every widget iconless. These checks pin the contract
 * the adapter now has to keep — Iconify's response shape, one upstream call per
 * unknown icon, everything afterwards from disk, and an honest failure when
 * there is neither cache nor internet.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createIconCache } = require('../../lib/iconCache.js');

let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
    if (cond) pass++;
    else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const HOME = { body: '<path d="M1 1"/>' };
const BULB = { body: '<circle cx="1" cy="1" r="1"/>' };

/** Minimal ServerResponse stand-in — collects status, headers and body. */
function fakeRes() {
    const res = {
        status: 0,
        headers: {},
        body: '',
        done: null,
        writeHead(status, headers) {
            res.status = status;
            res.headers = headers || {};
        },
        end(body) {
            res.body = body || '';
            res.done?.();
        },
    };
    res.finished = new Promise((resolve) => {
        res.done = resolve;
    });
    return res;
}

async function call(cache, url, method = 'GET') {
    const res = fakeRes();
    const handled = cache.handle({ method }, res, new URL(url, 'http://localhost'));
    if (handled) await res.finished;
    return { handled, res, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null };
}

/** Install a fetch stub; returns the list of upstream URLs it saw. */
function stubFetch(reply) {
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(String(url));
        return reply(String(url));
    };
    return calls;
}

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-icons-'));
const realFetch = globalThis.fetch;

try {
    // ── 1. cold start: one upstream call, Iconify response shape back ─────────
    {
        const calls = stubFetch(() => ok({ prefix: 'lucide', icons: { home: HOME }, width: 24, height: 24 }));
        const cache = createIconCache({ dir, log: { warn() {} } });
        const { handled, res, json } = await call(cache, '/icons/lucide.json?icons=home');
        check('cold: route claimed', handled === true);
        check('cold: 200', res.status === 200, `got ${res.status}`);
        check('cold: json content type', /application\/json/.test(res.headers['Content-Type'] || ''));
        check('cold: one upstream call', calls.length === 1, `got ${calls.length}: ${calls.join(' ')}`);
        check(
            'cold: upstream is the public API',
            (calls[0] || '').startsWith('https://api.iconify.design/lucide.json'),
        );
        check('cold: icon body returned', json?.icons?.home?.body === HOME.body);
        check('cold: set defaults carried', json?.width === 24 && json?.height === 24);
        check('cold: nothing missing', Array.isArray(json?.not_found) && json.not_found.length === 0);
        check('cold: cacheable', /max-age=604800/.test(res.headers['Cache-Control'] || ''));
    }

    // ── 2. the cache file is on disk and is enough on its own ─────────────────
    {
        const file = path.join(dir, 'icons', 'lucide.json');
        // persist() writes asynchronously — give the queued write a tick.
        for (let i = 0; i < 50 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 10));
        check('disk: cache file written', fs.existsSync(file));
        const stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        check('disk: icon stored', stored?.icons?.home?.body === HOME.body);

        // A brand-new instance reads that file and must not touch the network.
        const calls = stubFetch(() => {
            throw new Error('must not be called');
        });
        const cache = createIconCache({ dir, log: { warn() {} } });
        const { res, json } = await call(cache, '/icons/lucide.json?icons=home');
        check('warm: served from disk', res.status === 200 && json?.icons?.home?.body === HOME.body);
        check('warm: no upstream call', calls.length === 0, `got ${calls.length}`);
    }

    // ── 3. an unknown name is reported once and not re-fetched ────────────────
    {
        const calls = stubFetch(() => ok({ prefix: 'lucide', icons: {}, not_found: ['definitely-not-an-icon'] }));
        const cache = createIconCache({ dir, log: { warn() {} } });
        const url = '/icons/lucide.json?icons=definitely-not-an-icon';
        const first = await call(cache, url);
        check('missing: reported as not_found', first.json?.not_found?.includes('definitely-not-an-icon'));
        check(
            'missing: answer expires after a minute',
            /max-age=60/.test(first.res.headers['Cache-Control'] || ''),
            first.res.headers['Cache-Control'],
        );
        const second = await call(cache, url);
        check('missing: still reported', second.json?.not_found?.includes('definitely-not-an-icon'));
        check('missing: upstream asked only once', calls.length === 1, `got ${calls.length}`);
    }

    // ── 4. aliases resolve to their parent icon ───────────────────────────────
    {
        stubFetch(() =>
            ok({
                prefix: 'mdi',
                icons: { 'light-bulb': BULB },
                aliases: { bulb: { parent: 'light-bulb' } },
                width: 24,
                height: 24,
            }),
        );
        const cache = createIconCache({ dir, log: { warn() {} } });
        const { json } = await call(cache, '/icons/mdi.json?icons=bulb');
        check('alias: alias entry returned', json?.aliases?.bulb?.parent === 'light-bulb');
        check('alias: parent icon included', json?.icons?.['light-bulb']?.body === BULB.body);
        check('alias: not reported missing', (json?.not_found || []).length === 0);
    }

    // ── 5. no cache and no internet → 503, so the widget shows its fallback ───
    {
        stubFetch(() => {
            throw new Error('ENOTFOUND api.iconify.design');
        });
        const cache = createIconCache({ dir: path.join(dir, 'empty'), log: { warn() {} } });
        const { res } = await call(cache, '/icons/lucide.json?icons=zap');
        check('offline: 503', res.status === 503, `got ${res.status}`);
        check('offline: not stored by the browser', /no-store/.test(res.headers['Cache-Control'] || ''));
    }

    // ── 6. offline but cached → the cached half is still served ───────────────
    {
        stubFetch(() => {
            throw new Error('offline');
        });
        const cache = createIconCache({ dir, log: { warn() {} } });
        const { res, json } = await call(cache, '/icons/lucide.json?icons=home,zap');
        check('offline+cache: 200', res.status === 200, `got ${res.status}`);
        check('offline+cache: cached icon served', json?.icons?.home?.body === HOME.body);
        check('offline+cache: rest reported missing', json?.not_found?.includes('zap'));
    }

    // ── 7. upstream is never reachable when it is switched off ────────────────
    {
        const calls = stubFetch(() => ok({ prefix: 'lucide', icons: { zap: HOME } }));
        const cache = createIconCache({ dir, log: { warn() {} }, upstream: false });
        const { res, json } = await call(cache, '/icons/lucide.json?icons=home,zap');
        check('no-upstream: 200 from cache', res.status === 200 && json?.icons?.home?.body === HOME.body);
        check('no-upstream: missing stays missing', json?.not_found?.includes('zap'));
        check('no-upstream: no network', calls.length === 0, `got ${calls.length}`);
    }

    // ── 8. the icon picker's search is relayed, cached and never fatal ────────
    {
        const calls = stubFetch(() => ok({ icons: ['mdi:garage', 'mdi:garage-open'], total: 2 }));
        const cache = createIconCache({ dir, log: { warn() {} } });
        const first = await call(cache, '/icons/search?query=garage&limit=200');
        check('search: 200', first.res.status === 200, `got ${first.res.status}`);
        check('search: results relayed', first.json?.icons?.includes('mdi:garage'));
        check('search: upstream is the public catalogue', (calls[0] || '').includes('/search?query=garage'));
        await call(cache, '/icons/search?query=garage&limit=200');
        check('search: repeat served from memory', calls.length === 1, `got ${calls.length}`);
        check('search: one-letter query rejected', (await call(cache, '/icons/search?query=a')).res.status === 400);

        stubFetch(() => {
            throw new Error('offline');
        });
        const offline = createIconCache({ dir, log: { warn() {} } });
        const dead = await call(offline, '/icons/search?query=nothinghere');
        check('search: offline yields an empty list, not an error', dead.res.status === 200);
        check('search: empty list', Array.isArray(dead.json?.icons) && dead.json.icons.length === 0);
    }

    // ── 9. input validation and routing ───────────────────────────────────────
    {
        const cache = createIconCache({ dir, log: { warn() {} } });
        stubFetch(() => {
            throw new Error('must not be called');
        });
        check('route: foreign path ignored', (await call(cache, '/assets/index.js')).handled === false);
        check('route: index.html ignored', (await call(cache, '/')).handled === false);
        check('reject: no icons param', (await call(cache, '/icons/lucide.json')).res.status === 400);
        check(
            'reject: path traversal in prefix',
            (await call(cache, '/icons/..%2f..%2fetc.json?icons=a')).res.status === 400,
        );
        check('reject: bad icon name', (await call(cache, '/icons/lucide.json?icons=a,../b')).res.status === 400);
        check('reject: uppercase name', (await call(cache, '/icons/lucide.json?icons=Home')).res.status === 400);
        const tooMany = Array.from({ length: 200 }, (_, i) => `i${i}`).join(',');
        check('reject: too many names', (await call(cache, `/icons/lucide.json?icons=${tooMany}`)).res.status === 400);
        check('reject: POST', (await call(cache, '/icons/lucide.json?icons=home', 'POST')).res.status === 405);
    }
} finally {
    globalThis.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`icon-cache: ${pass} checks passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
