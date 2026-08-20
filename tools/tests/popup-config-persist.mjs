// Regression test for the popup config that silently rolled back (forum report:
// "one popup deleted, another one back to a state from weeks ago").
//
//   node tools/tests/popup-config-persist.mjs
//
// No dev server needed: the popup store is bundled with esbuild, `import.meta.glob`
// for the shipped built-ins is resolved at build time and ioBroker I/O is stubbed,
// so the whole persist path runs against an in-memory localStorage.
//
// What must hold:
//   1. ensureBuiltins() runs on every rehydrate. It is a local, code-derived
//      normalisation and must NOT set the _dirty flag — dirty means "this device
//      has unsaved edits", which makes loadConfigFromIoBroker skip the pull for
//      aura-popup-config and makes the next save push this device's frozen copy
//      over everyone else's popups.
//   2. A real user edit must still set the flag (the suppression must not leak).
//   3. A built-in the user customised survives a shipped-version bump instead of
//      being reset to the shipped content.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';

const root = process.cwd();

// ── Bundle ───────────────────────────────────────────────────────────────────
// popupConfigStore reads its built-ins via import.meta.glob (a Vite feature).
// Inline the same JSON files so the bundle sees exactly what the app ships.
const builtinDir = join(root, 'src-vis', 'data', 'builtinPopups');
const builtinMap = {};
for (const f of readdirSync(builtinDir).filter((n) => n.endsWith('.json'))) {
    builtinMap[`../data/builtinPopups/${f}`] = JSON.parse(readFileSync(join(builtinDir, f), 'utf8'));
}

const stubPlugin = {
    name: 'aura-test-stubs',
    setup(b) {
        b.onLoad({ filter: /popupConfigStore\.ts$/ }, () => {
            const src = readFileSync(join(root, 'src-vis', 'store', 'popupConfigStore.ts'), 'utf8').replace(
                /const _builtinModules = import\.meta\.glob[\s\S]*?\);/,
                `const _builtinModules = ${JSON.stringify(builtinMap)};`,
            );
            return { contents: src, loader: 'ts' };
        });
        // persistManager talks to ioBroker and derives the instance namespace from
        // the URL — neither exists here, and the test never writes to a backend.
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'stub-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /utils\/namespace$/ }, () => ({ path: 'stub-namespace', namespace: 'stub' }));
        b.onLoad({ filter: /^stub-iobroker$/, namespace: 'stub' }, () => ({
            contents: `
                export const setStateDirectAsync = async () => {};
                export const setStateDirect = () => {};
                export const getStateDirect = async () => null;
                export const getStateFromCache = () => undefined;
                export const writeFileDirect = async () => {};
                export const readFileDirect = async () => null;
                export const readDirDirect = async () => [];
                export const deleteFileDirect = async () => {};
            `,
            loader: 'js',
        }));
        b.onLoad({ filter: /^stub-namespace$/, namespace: 'stub' }, () => ({
            contents: `export const NS = 'aura.0';`,
            loader: 'js',
        }));
    },
};

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-popup-persist-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export { usePopupConfigStore, BUILTIN_VIEW_IDS } from './src-vis/store/popupConfigStore.ts';
            export { isDirty, hasDirtyFlag } from './src-vis/store/persistManager.ts';
        `,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    plugins: [stubPlugin],
    logLevel: 'warning',
});
const bundleUrl = pathToFileURL(bundle).href;

// ── Harness ──────────────────────────────────────────────────────────────────
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const KEY = 'aura-popup-config';
const DIRTY = `_aura_dirty:${KEY}`;

/** Fresh in-memory localStorage + a fresh module instance of the store. */
let loadCount = 0;
async function bootWith(persisted) {
    const map = new Map(Object.entries(persisted ?? {}));
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        clear: () => map.clear(),
        key: (i) => [...map.keys()][i] ?? null,
        get length() {
            return map.size;
        },
    };
    // A distinct URL per boot: Node caches ESM by full URL, so the query string
    // gives every scenario its own store instance (and its own hydration).
    const mod = await import(`${bundleUrl}?boot=${++loadCount}`);
    return { mod, map };
}

/** The persisted zustand payload shape for aura-popup-config. */
const persistedState = (views, extra = {}) =>
    JSON.stringify({ state: { typeDefaults: {}, typeDefaultLayouts: {}, views, deletedBuiltinIds: [], removedBuiltinTypeDefaults: [], triggers: [], ...extra }, version: 0 });

const shipped = builtinMap['../data/builtinPopups/shutter.json'];
const SHUTTER_ID = shipped.id;
const SHIPPED_VER = shipped.version ?? 1;

// ── 1. A version bump on a shipped built-in must not mark the device dirty ────
// This is the bug: shutter.json went 1 → 2, so every client migrated its stored
// copy on the next load and thereby claimed "unsaved edits" — after which it
// stopped pulling the popup config and pushed its own copy back instead.
{
    const stale = { ...shipped, version: SHIPPED_VER - 1, widgets: [] };
    const { mod, map } = await bootWith({ [KEY]: persistedState([stale]) });
    const view = mod.usePopupConfigStore.getState().views.find((v) => v.id === SHUTTER_ID);
    eq('migration ran (version bumped to the shipped one)', view?.version, SHIPPED_VER);
    eq('migration pulled the shipped widgets', view?.widgets.length, shipped.widgets.length);
    check('migration did NOT set the dirty flag', map.get(DIRTY) === undefined, `flag = ${map.get(DIRTY)}`);
    check('migration did NOT leave the store dirty', mod.isDirty() === false);
    check('hasDirtyFlag agrees', mod.hasDirtyFlag(KEY) === false);
}

// ── 2. Adding a newly shipped built-in must not mark the device dirty either ──
// A release that ships a new built-in (datapoint.json, #524) otherwise arms the
// same trap on every single client at once.
{
    const { mod, map } = await bootWith({ [KEY]: persistedState([]) });
    const ids = mod.usePopupConfigStore.getState().views.map((v) => v.id);
    check('missing built-ins were added', ids.length === mod.BUILTIN_VIEW_IDS.size, `got ${ids.length}`);
    check('adding built-ins did NOT set the dirty flag', map.get(DIRTY) === undefined, `flag = ${map.get(DIRTY)}`);
    check('adding built-ins did NOT leave the store dirty', mod.isDirty() === false);
}

// ── 3. A real user edit must still mark the store dirty ───────────────────────
// Guards against over-suppression: if this regressed, edits would never reach
// ioBroker at all.
{
    const { mod, map } = await bootWith({ [KEY]: persistedState([]) });
    check('clean before the edit', map.get(DIRTY) === undefined);
    const id = mod.usePopupConfigStore.getState().addView('Testpopup');
    check('addView marks the store dirty', map.get(DIRTY) === '1', `flag = ${map.get(DIRTY)}`);
    check('isDirty() after addView', mod.isDirty() === true);
    mod.usePopupConfigStore.getState().updateViewName(id, 'Umbenannt');
    eq(
        'rename landed',
        mod.usePopupConfigStore.getState().views.find((v) => v.id === id)?.name,
        'Umbenannt',
    );
}

// ── 4. Editing a built-in flags it, and the flag protects it from the bump ────
{
    const { mod } = await bootWith({ [KEY]: persistedState([]) });
    const st = () => mod.usePopupConfigStore.getState();
    st().updateViewName(SHUTTER_ID, 'Mein Rollladen');
    const edited = st().views.find((v) => v.id === SHUTTER_ID);
    check('editing a built-in sets userEdited', edited?.userEdited === true);
    check('editing a custom view does not set userEdited', (() => {
        const id = st().addView('Custom');
        return st().views.find((v) => v.id === id)?.userEdited === undefined;
    })());
}

// ── 5. A customised built-in survives a shipped-version bump ──────────────────
// Before the fix the migration was "code wins, local edits are discarded", so an
// update silently threw the user's version of the built-in away.
{
    const mine = {
        ...shipped,
        version: SHIPPED_VER - 1,
        userEdited: true,
        name: 'Mein Rollladen',
        widgets: [{ id: 'w1', type: 'value', title: 'nur meins', datapoint: 'x', gridPos: { x: 0, y: 0, w: 1, h: 1 }, options: {} }],
    };
    const { mod, map } = await bootWith({ [KEY]: persistedState([mine]) });
    const view = mod.usePopupConfigStore.getState().views.find((v) => v.id === SHUTTER_ID);
    eq('customised built-in keeps its name', view?.name, 'Mein Rollladen');
    eq('customised built-in keeps its widgets', view?.widgets.length, 1);
    eq('version marker moves up so the migration stops retrying', view?.version, SHIPPED_VER);
    check('still not dirty', map.get(DIRTY) === undefined, `flag = ${map.get(DIRTY)}`);

    // "Reset" is the deliberate way to get the shipped content back.
    mod.usePopupConfigStore.getState().resetBuiltin(SHUTTER_ID);
    const after = mod.usePopupConfigStore.getState().views.find((v) => v.id === SHUTTER_ID);
    eq('reset pulls the shipped widgets', after?.widgets.length, shipped.widgets.length);
    check('reset clears userEdited', after?.userEdited === undefined);
}

rmSync(bundle, { force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
