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
//   4. The same trap in the RAM-only stores: hydrating aura-group-defs /
//      aura-widget-presets from ioBroker must not leave the key pending.
//   5. Seeding is retired: the type-specific built-ins only land on installations
//      that already have popup config. A fresh install gets ALWAYS_SEEDED_VIEW_IDS
//      and nothing else, and a pruned built-in never comes back.
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
            export {
                usePopupConfigStore,
                BUILTIN_VIEW_IDS,
                ALWAYS_SEEDED_VIEW_IDS,
            } from './src-vis/store/popupConfigStore.ts';
            export { isDirty, hasDirtyFlag, isPending } from './src-vis/store/persistManager.ts';
            export {
                hydrateGroupDefs,
                markGroupDefsHydrated,
                useGroupDefsStore,
            } from './src-vis/store/groupDefsStore.ts';
            export {
                hydrateWidgetPresets,
                markWidgetPresetsHydrated,
                useWidgetPresetsStore,
            } from './src-vis/store/widgetPresetsStore.ts';
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
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

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
    JSON.stringify({
        state: {
            typeDefaults: {},
            typeDefaultLayouts: {},
            views,
            deletedBuiltinIds: [],
            removedBuiltinTypeDefaults: [],
            triggers: [],
            ...extra,
        },
        version: 0,
    });

const shipped = builtinMap['../data/builtinPopups/shutter.json'];
const SHUTTER_ID = shipped.id;
const SHIPPED_VER = shipped.version ?? 1;

// Any user-created view is enough to mark an installation as "already set up",
// which is what keeps the retired built-ins flowing to it.
const CUSTOM_VIEW = { id: 'pv-1700000000000', name: 'Bestand', widgets: [], createdAt: 1700000000000 };

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
// same trap on every single client at once. Seeding needs an installation that
// already has popup config — see scenario 7 for the fresh-install side.
{
    const { mod, map } = await bootWith({ [KEY]: persistedState([CUSTOM_VIEW]) });
    const ids = mod.usePopupConfigStore.getState().views.map((v) => v.id);
    check(
        'missing built-ins were added',
        ids.length === mod.BUILTIN_VIEW_IDS.size + 1,
        `got ${ids.length}, want ${mod.BUILTIN_VIEW_IDS.size + 1}`,
    );
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
    eq('rename landed', mod.usePopupConfigStore.getState().views.find((v) => v.id === id)?.name, 'Umbenannt');
}

// ── 4. Editing a built-in flags it, and the flag protects it from the bump ────
{
    const { mod } = await bootWith({ [KEY]: persistedState([CUSTOM_VIEW]) });
    const st = () => mod.usePopupConfigStore.getState();
    st().updateViewName(SHUTTER_ID, 'Mein Rollladen');
    const edited = st().views.find((v) => v.id === SHUTTER_ID);
    check('editing a built-in sets userEdited', edited?.userEdited === true);
    check(
        'editing a custom view does not set userEdited',
        (() => {
            const id = st().addView('Custom');
            return st().views.find((v) => v.id === id)?.userEdited === undefined;
        })(),
    );
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
        widgets: [
            {
                id: 'w1',
                type: 'value',
                title: 'nur meins',
                datapoint: 'x',
                gridPos: { x: 0, y: 0, w: 1, h: 1 },
                options: {},
            },
        ],
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

// ── 6. The RAM-only stores must not go pending on inbound hydration ──────────
// aura-group-defs / aura-widget-presets mark dirty from a plain subscribe(),
// which fires for applyRaw's hydration too. That left both keys pending after
// every boot: useConfigSync's isPending gate then dropped their inbound sync for
// the rest of the session, and the admin's bootstrap save rewrote both keys —
// burning a backup slot — on every single open.
{
    const { mod } = await bootWith({ [KEY]: persistedState([]) });
    const defs = JSON.stringify({ state: { defs: { 'gd-1': [] } }, version: 0 });
    mod.hydrateGroupDefs(defs);
    eq('group-defs hydration landed', Object.keys(mod.useGroupDefsStore.getState().defs).length, 1);
    check('group-defs hydration leaves the key clean', mod.isPending('aura-group-defs') === false);

    mod.hydrateWidgetPresets(JSON.stringify({ state: { presets: [] }, version: 0 }));
    mod.markWidgetPresetsHydrated();
    mod.markGroupDefsHydrated();
    check('widget-presets hydration leaves the key clean', mod.isPending('aura-widget-presets') === false);
    check('markHydrated does not dirty either key', mod.isDirty() === false);

    // A real edit must still arm the save bar.
    mod.useGroupDefsStore.getState().setDef('gd-2', []);
    check('a real group-def edit still marks the key pending', mod.isPending('aura-group-defs') === true);
    mod.useWidgetPresetsStore.getState().addPreset({ id: 'p1', name: 'x' });
    check('a real preset edit still marks the key pending', mod.isPending('aura-widget-presets') === true);
}

// ── 7. Fresh install: the retired built-ins are not seeded ───────────────────
// The type-specific views (dimmer, thermostat, …) were never configured by anyone
// — they just appeared. New installations no longer get them, nor their type
// assignments; only the row-click fallback still ships everywhere.
{
    const { mod, map } = await bootWith({});
    const st = () => mod.usePopupConfigStore.getState();
    const ids = st().views.map((v) => v.id);
    check(
        'fresh install only gets the always-seeded built-ins',
        ids.length === mod.ALWAYS_SEEDED_VIEW_IDS.size && ids.every((id) => mod.ALWAYS_SEEDED_VIEW_IDS.has(id)),
        `got ${JSON.stringify(ids)}`,
    );
    eq('fresh install gets no type defaults', Object.keys(st().typeDefaults).length, 0);
    check('seeding nothing did NOT set the dirty flag', map.get(DIRTY) === undefined, `flag = ${map.get(DIRTY)}`);

    // The empty boot state before the ioBroker pull reads as "fresh" too — the
    // moment the real payload arrives it must seed like an existing setup again,
    // otherwise a device that boots first would drop everyone's built-ins.
    const { mod: mod2 } = await bootWith({ [KEY]: persistedState([CUSTOM_VIEW]) });
    check(
        'the pull rehydrating a real payload seeds again',
        mod2.usePopupConfigStore.getState().views.length === mod2.BUILTIN_VIEW_IDS.size + 1,
    );
}

// ── 8. An existing installation keeps its built-ins and gets the assignments ──
{
    const { mod } = await bootWith({ [KEY]: persistedState([CUSTOM_VIEW]) });
    const { typeDefaults, views } = mod.usePopupConfigStore.getState();
    eq('dimmer keeps its type default', typeDefaults.dimmer, 'pv-builtin-dimmer');
    check('the dimmer view is there', views.some((v) => v.id === 'pv-builtin-dimmer'));
}

// ── 9. '— keine View —' survives a reload ────────────────────────────────────
// Seeding read the assignment as falsy rather than absent, so an explicit "no
// popup for this type" was overwritten with the built-in on the next rehydrate.
{
    const { mod } = await bootWith({
        [KEY]: persistedState([CUSTOM_VIEW], { typeDefaults: { dimmer: '' } }),
    });
    eq('an explicit empty type default is not re-seeded', mod.usePopupConfigStore.getState().typeDefaults.dimmer, '');
}

// ── 10. Pruning a built-in is permanent ──────────────────────────────────────
// The cleanup in Admin → Popups drops the views nothing references. Seeding must
// not put them straight back on the next load.
{
    const { mod, map } = await bootWith({ [KEY]: persistedState([CUSTOM_VIEW]) });
    mod.usePopupConfigStore.getState().pruneBuiltins(['pv-builtin-dimmer', 'pv-builtin-switch']);
    const after = mod.usePopupConfigStore.getState();
    check('pruned views are gone', !after.views.some((v) => v.id === 'pv-builtin-dimmer'));
    check('pruned type defaults are gone', !('dimmer' in after.typeDefaults));
    check('pruned ids are remembered', after.deletedBuiltinIds.includes('pv-builtin-dimmer'));

    // Same payload, next boot: ensureBuiltins must respect deletedBuiltinIds.
    const raw = map.get(KEY);
    const { mod: mod2 } = await bootWith({ [KEY]: raw });
    check(
        'a pruned built-in stays gone after a reload',
        !mod2.usePopupConfigStore.getState().views.some((v) => v.id === 'pv-builtin-dimmer'),
    );
    check(
        'pruning does not take the always-seeded view with it',
        mod2.usePopupConfigStore.getState().views.some((v) => v.id === 'pv-builtin-datapoint'),
    );
}

rmSync(bundle, { force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
