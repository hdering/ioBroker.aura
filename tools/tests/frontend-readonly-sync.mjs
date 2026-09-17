// The read-only frontend next to an admin in the SAME browser (shared localStorage).
//
//   node tools/tests/frontend-readonly-sync.mjs
//
// No dev server: stores, persistManager and configLoader are bundled with esbuild,
// ioBroker I/O is stubbed, localStorage is an in-memory map. What must hold:
//   1. A key the admin is editing (dirty flag set) keeps its storage copy AND its
//      flag when the frontend applies the remote value — the store shows remote.
//   2. A key without a flag is applied the usual way (storage updated, flag off).
//   3. loadConfigFromIoBroker(ignoreDirty) does the same for every key and does
//      not rehydrate the admin's copy back over the remote value.
//   4. In read-only mode a store write for a dirty key stays in RAM (pending) and
//      never touches storage or the flag; discardPendingRam leaves flags alone.
//   5. Without read-only mode (the admin) nothing changes: applyRaw overwrites.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';

const root = process.cwd();
const builtinDir = join(root, 'src-vis', 'data', 'builtinPopups');
const builtinMap = {};
for (const f of readdirSync(builtinDir).filter((n) => n.endsWith('.json'))) {
    builtinMap[`../data/builtinPopups/${f}`] = JSON.parse(readFileSync(join(builtinDir, f), 'utf8'));
}
const remote = new Map(); // state id → raw value the stubbed ioBroker answers with
const stubPlugin = {
    name: 'aura-test-stubs',
    setup(b) {
        b.onLoad({ filter: /popupConfigStore\.ts$/ }, () => ({
            contents: readFileSync(join(root, 'src-vis', 'store', 'popupConfigStore.ts'), 'utf8').replace(
                /const _builtinModules = import\.meta\.glob[\s\S]*?\);/,
                `const _builtinModules = ${JSON.stringify(builtinMap)};`,
            ),
            loader: 'ts',
        }));
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'stub-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /utils\/namespace$/ }, () => ({ path: 'stub-namespace', namespace: 'stub' }));
        b.onLoad({ filter: /^stub-iobroker$/, namespace: 'stub' }, () => ({
            contents: `
                export const setStateDirectAsync = async () => {};
                export const setStateDirect = () => {};
                export const getStateDirect = async (id) => {
                    const v = globalThis.__remote.get(id);
                    return v === undefined ? null : { val: v, ack: true };
                };
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
globalThis.__remote = remote;

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-frontend-readonly-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export { applyRemote, applyRaw, rehydrateOne, loadConfigFromIoBroker } from './src-vis/utils/configLoader.ts';
            export {
                hasDirtyFlag,
                isDirty,
                isPending,
                setFrontendReadOnly,
                discardPendingRam,
                discardPending,
            } from './src-vis/store/persistManager.ts';
            export { useDashboardStore } from './src-vis/store/dashboardStore.ts';
            export { useThemeStore } from './src-vis/store/themeStore.ts';
            export { hydrateGroupDefs } from './src-vis/store/groupDefsStore.ts';
            export { markWidgetPresetsHydrated } from './src-vis/store/widgetPresetsStore.ts';
        `,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    plugins: [stubPlugin],
    define: { 'import.meta.env.DEV': 'false' },
    logLevel: 'warning',
});
const bundleUrl = pathToFileURL(bundle).href;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const dashboard = (title) =>
    JSON.stringify({
        state: {
            layouts: [
                {
                    id: 'layout-default',
                    name: 'Standard',
                    slug: 'default',
                    activeSectionId: 'sec',
                    sections: [
                        {
                            id: 'sec',
                            name: 'Bereich',
                            slug: 'bereich',
                            activeTabId: 'tab1',
                            tabs: [
                                {
                                    id: 'tab1',
                                    name: 'Eins',
                                    slug: 'eins',
                                    widgets: [
                                        {
                                            id: 'w1',
                                            type: 'value',
                                            title,
                                            datapoint: 'demo.0.w1',
                                            layout: 'default',
                                            gridPos: { x: 0, y: 0, w: 10, h: 6 },
                                            options: {},
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
            activeLayoutId: 'layout-default',
            editMode: false,
        },
        version: 0,
    });
const theme = (id) =>
    JSON.stringify({
        state: {
            themeId: id,
            customVars: {},
            customVarsLight: {},
            customVarsDark: {},
            userThemes: [],
            adminThemeId: 'dark',
            followBrowser: false,
            browserDarkThemeId: 'dark',
            browserLightThemeId: 'light',
        },
        version: 0,
    });

let loadCount = 0;
async function boot(persisted) {
    const map = new Map(Object.entries(persisted));
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
    const mod = await import(`${bundleUrl}?boot=${++loadCount}`);
    mod.hydrateGroupDefs(JSON.stringify({ state: { defs: {} }, version: 0 }));
    mod.markWidgetPresetsHydrated();
    return { mod, map };
}
const titleOf = (mod) => mod.useDashboardStore.getState().layouts[0].sections[0].tabs[0].widgets[0].title;

// The admin left unsaved edits in the shared storage: title "Entwurf", flag set.
const ADMIN_COPY = dashboard('Entwurf');
const SAVED = dashboard('Gespeichert');

// ── 1 + 2: applyRemote in read-only mode ─────────────────────────────────────
{
    const { mod, map } = await boot({
        'aura-dashboard': ADMIN_COPY,
        '_aura_dirty:aura-dashboard': '1',
        'aura-theme': theme('dark'),
    });
    mod.setFrontendReadOnly(true);
    eq('boot shows the admin copy (nothing else is there yet)', titleOf(mod), 'Entwurf');
    mod.applyRemote('aura-dashboard', SAVED, true);
    eq('frontend store shows the SAVED config', titleOf(mod), 'Gespeichert');
    eq("… the admin's storage copy is untouched", map.get('aura-dashboard'), ADMIN_COPY);
    eq("… and the admin's dirty flag is still set", map.get('_aura_dirty:aura-dashboard'), '1');
    mod.applyRemote('aura-theme', theme('light'), true);
    eq('a key without a flag is written to storage', map.get('aura-theme'), theme('light'));
    // applyRemote writes; the callers rehydrate (loadConfigFromIoBroker, useConfigSync).
    mod.rehydrateOne('aura-theme');
    eq('… and shows up in the store after the rehydrate', mod.useThemeStore.getState().themeId, 'light');
    check('… flag stays off', !mod.hasDirtyFlag('aura-theme'));
}

// ── 3: the boot load with ignoreDirty ────────────────────────────────────────
{
    remote.clear();
    remote.set('aura.0.config.dashboard', SAVED);
    remote.set('aura.0.config.theme', theme('ocean'));
    const { mod, map } = await boot({
        'aura-dashboard': ADMIN_COPY,
        '_aura_dirty:aura-dashboard': '1',
        'aura-theme': theme('dark'),
    });
    mod.setFrontendReadOnly(true);
    const changed = await mod.loadConfigFromIoBroker(true, { ignoreDirty: true });
    check('load reports a change', changed);
    eq('load: store shows the saved dashboard', titleOf(mod), 'Gespeichert');
    eq("load: the admin's copy survives in storage", map.get('aura-dashboard'), ADMIN_COPY);
    eq('load: flag survives', map.get('_aura_dirty:aura-dashboard'), '1');
    eq('load: an unflagged key is updated in storage', map.get('aura-theme'), theme('ocean'));
    eq('load: … and in the store', mod.useThemeStore.getState().themeId, 'ocean');
    mod.discardPendingRam();
    eq('discardPendingRam keeps the flag', map.get('_aura_dirty:aura-dashboard'), '1');
}

// ── 4: frontend writes while the admin owns the key ──────────────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': ADMIN_COPY, '_aura_dirty:aura-dashboard': '1' });
    mod.setFrontendReadOnly(true);
    mod.applyRemote('aura-dashboard', SAVED, true);
    // A navigation write (suppressed) or an in-place edit in this tab:
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'Timer an' });
    eq('the tab shows its own change', titleOf(mod), 'Timer an');
    eq("storage still holds the admin's copy", map.get('aura-dashboard'), ADMIN_COPY);
    eq("the flag is still the admin's", map.get('_aura_dirty:aura-dashboard'), '1');
    check('the value is kept as pending for a scoped flush', mod.isPending('aura-dashboard'));
}

// ── 5: the admin (not read-only) is unchanged ────────────────────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': ADMIN_COPY });
    mod.applyRaw('aura-dashboard', SAVED);
    eq('applyRaw overwrites storage as before', map.get('aura-dashboard'), SAVED);
    mod.applyRemote('aura-dashboard', dashboard('Neu'), false);
    eq('applyRemote without read-only overwrites too', map.get('aura-dashboard'), dashboard('Neu'));
}

rmSync(bundle, { force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
