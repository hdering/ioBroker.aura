// Verifies that a device keeps its client id (#620).
//
//   node tools/tests/client-id-stability.mjs
//
// The id used to be a fingerprint that included navigator.userAgent and was
// deliberately NOT persisted. Every browser update therefore handed the device a
// new id: a fresh, nameless entry under aura.0.clients.*, while the named one it
// had before stayed behind as a duplicate. Edge ships its full four-part version
// in the UA and updates every few days, which is exactly the reported rhythm.
//
// The checks below pin the three parts of the fix:
//   - the fingerprint ignores the user agent, so a browser update changes nothing
//   - the id is anchored in localStorage once pinned and survives everything after
//   - ?client=<name> pins a speaking id, and both sides sanitise it the same way
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);

// The store pulls in the socket layer only to reconnect on a URL change.
const stubPlugin = {
    name: 'aura-iobroker-fake',
    setup(b) {
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'fake-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /hooks\/useDatapointList$/ }, () => ({ path: 'fake-dplist', namespace: 'stub' }));
        b.onLoad({ filter: /^fake-iobroker$/, namespace: 'stub' }, () => ({
            contents: `export const reconnectSocket = () => {};`,
            loader: 'js',
        }));
        b.onLoad({ filter: /^fake-dplist$/, namespace: 'stub' }, () => ({
            contents: `export const invalidateDatapointCache = () => {};`,
            loader: 'js',
        }));
    },
};

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-client-id-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export { useConnectionStore, sanitizeClientId, legacyFingerprintId, isFingerprintClientId } from './src-vis/store/connectionStore.ts';
        `,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    define: { 'import.meta.env.DEV': 'false' },
    plugins: [stubPlugin],
    logLevel: 'warning',
});

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── A browser session: fresh globals, optionally a carried-over localStorage ──
const UA_EDGE_140 =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.66';
const UA_EDGE_141 =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.57';

let loadCount = 0;
async function session({ ua = UA_EDGE_140, search = '', storage = new Map(), width = 1920, height = 1080 } = {}) {
    globalThis.localStorage = {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
        clear: () => storage.clear(),
        key: (i) => [...storage.keys()][i] ?? null,
        get length() {
            return storage.size;
        },
    };
    // node >= 21 ships a getter-only globalThis.navigator - redefine it outright.
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: ua, language: 'de-DE', hardwareConcurrency: 8 },
        configurable: true,
        writable: true,
    });
    globalThis.screen = { width, height, colorDepth: 24 };
    globalThis.window = { location: { protocol: 'http:', hostname: 'iobroker', origin: 'http://iobroker', search } };
    const mod = await import(`${pathToFileURL(bundle).href}?boot=${++loadCount}`);
    // Captured now: the next session replaces the globals this reads from.
    return { store: mod.useConnectionStore, mod, storage, legacyId: mod.legacyFingerprintId() };
}

// ── 1. A browser update must not change the id ───────────────────────────────
{
    const a = await session({ ua: UA_EDGE_140 });
    const b = await session({ ua: UA_EDGE_141 });
    eq('browser update keeps the fingerprint', b.store.getState().clientId, a.store.getState().clientId);

    // …which is precisely what the old fingerprint did NOT do.
    check('the legacy fingerprint did change on a browser update', a.legacyId !== b.legacyId);
}

// ── 2. Once pinned, the id is anchored in localStorage ───────────────────────
{
    const first = await session();
    const id = first.store.getState().clientId;
    check('a fresh device is not pinned yet', first.store.getState().clientIdPinned === false);
    check('an unpinned id is not persisted', !String(first.storage.get('aura-connection') ?? '').includes(id));

    first.store.getState().pinClientId(id);
    check('pinning persists the id', String(first.storage.get('aura-connection') ?? '').includes(id));

    // Same storage, different browser AND a different screen: the id must not move.
    const later = await session({ ua: UA_EDGE_141, storage: first.storage, width: 1536, height: 864 });
    eq('a pinned id survives UA and resolution changes', later.store.getState().clientId, id);
    check('a rehydrated id stays pinned', later.store.getState().clientIdPinned === true);
}

// ── 3. A resolution change still moves an UNPINNED id ────────────────────────
// Not a regression: the fingerprint is only the seed for a device that has never
// connected. The App pins it on first contact, which is what check 2 covers.
{
    const a = await session({ width: 1920, height: 1080 });
    const b = await session({ width: 1536, height: 864 });
    check('the seed still separates different screens', a.store.getState().clientId !== b.store.getState().clientId);
}

// ── 4. ?client=<name> pins a speaking id ─────────────────────────────────────
{
    const s = await session({ search: '?client=Wohnzimmer%20Tablet' });
    eq('URL parameter pins a speaking id', s.store.getState().clientId, 'wohnzimmer-tablet');
    check('URL parameter pins', s.store.getState().clientIdPinned === true);
    check('URL parameter is persisted', String(s.storage.get('aura-connection') ?? '').includes('wohnzimmer-tablet'));

    // Reload without the parameter → the pinned id stays.
    const again = await session({ storage: s.storage });
    eq('the pinned id survives a reload without the parameter', again.store.getState().clientId, 'wohnzimmer-tablet');
}

// ── 4b. Identical devices: a stable token per browser, and a way off the shared id (#844)
{
    const flur = await session();
    const wohnzimmer = await session();
    const id = flur.store.getState().clientId;
    eq('identical hardware yields the same fingerprint', wohnzimmer.store.getState().clientId, id);
    check(
        'each browser gets its own device token',
        flur.store.getState().deviceToken !== wohnzimmer.store.getState().deviceToken,
    );
    check(
        'the token is persisted from the first start',
        String(flur.storage.get('aura-connection') ?? '').includes(flur.store.getState().deviceToken),
    );
    const reload = await session({ storage: flur.storage });
    eq('the token survives a reload', reload.store.getState().deviceToken, flur.store.getState().deviceToken);

    check('a fingerprint id is recognised', flur.mod.isFingerprintClientId(id));
    const fresh = wohnzimmer.store.getState().splitClientId();
    check('splitting leaves the shared id', fresh !== id && /^[0-9a-f]{16}$/.test(fresh));
    check('the split id is pinned', wohnzimmer.store.getState().clientIdPinned === true);
    check('the split id is no fingerprint, so it never splits again', !wohnzimmer.mod.isFingerprintClientId(fresh));
    check('a speaking id is never split', !flur.mod.isFingerprintClientId('wohnzimmer-tablet'));
}

// ── 5. Frontend and adapter sanitise identically ─────────────────────────────
{
    const { mod } = await session();
    const corePath = require.resolve('@iobroker/adapter-core');
    require.cache[corePath] = {
        id: corePath,
        filename: corePath,
        loaded: true,
        exports: {
            Adapter: class {
                constructor() {}
                on() {}
            },
        },
    };
    const adapterSanitize = require(join(root, 'main.js')).sanitizeClientId;
    const cases = [
        'Wohnzimmer Tablet',
        '  Kitchen_TV  ',
        'a1b2c3d4e5f60718',
        'foo.bar',
        '../../system.adapter',
        '---',
        '',
        'register',
        'deleteRequest',
        'x'.repeat(80),
    ];
    const mismatches = cases.filter((c) => mod.sanitizeClientId(c) !== adapterSanitize(c));
    check(
        'sanitizeClientId matches between src-vis and main.js',
        mismatches.length === 0,
        `differs for ${JSON.stringify(mismatches)}`,
    );
    eq('speaking id', mod.sanitizeClientId('Wohnzimmer Tablet'), 'wohnzimmer-tablet');
    eq('dots cannot nest the tree', mod.sanitizeClientId('foo.bar'), 'foo-bar');
    eq('relay names are reserved', mod.sanitizeClientId('register'), '');
    eq('an empty id falls back to the fingerprint', mod.sanitizeClientId('---'), '');
}

rmSync(bundle, { force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
