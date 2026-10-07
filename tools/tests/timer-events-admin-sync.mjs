// Timer events added in the frontend must survive a later edit in the admin (#758).
//
//   node tools/tests/timer-events-admin-sync.mjs
//
// No dev server: stores, persistManager, configLoader and useConfigSync's apply step
// are bundled with esbuild, ioBroker I/O is stubbed, localStorage is an in-memory map.
// Each scenario boots an admin (not read-only) on a dashboard with a timer without
// events, lets the events arrive the way they do in reality, renames the widget in
// the admin, saves, and checks what the admin wrote to aura.0.config.dashboard.
//   A. Frontend on another device: only the state change reaches the admin.
//   B. Frontend in the same browser: it wrote the events into the shared storage
//      before the state change reached the admin tab.
//   C. As B, but the frontend's dirty flag is still set (its write is unconfirmed
//      when the state change arrives) — it is not the admin's flag.
// And the guards that must stay: the admin's own unsaved edit still blocks an
// inbound value (D), and the echo of its own save is no change (E).
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
const writes = []; // [id, val] the admin sent to ioBroker
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
        b.onResolve({ filter: /(^|\/)useIoBroker$/ }, () => ({ path: 'stub-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /utils\/namespace$/ }, () => ({ path: 'stub-namespace', namespace: 'stub' }));
        b.onLoad({ filter: /^stub-iobroker$/, namespace: 'stub' }, () => ({
            contents: `
                export const setStateDirectAsync = async (id, val) => { globalThis.__writes.push([id, val]); };
                export const setStateDirect = (id, val) => { globalThis.__writes.push([id, val]); };
                export const subscribeStateDirect = () => () => {};
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
globalThis.__writes = writes;

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-timer-admin-sync-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export { rehydrateAll } from './src-vis/utils/configLoader.ts';
            export { applyOneState } from './src-vis/hooks/useConfigSync.ts';
            export { isPendingInThisTab, saveToIoBroker } from './src-vis/store/persistManager.ts';
            export { useDashboardStore } from './src-vis/store/dashboardStore.ts';
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

const EVENTS = [
    {
        id: 't_1',
        enabled: true,
        weekdays: [1, 2, 3, 4, 5],
        trigger: { kind: 'time', time: '06:30' },
    },
    {
        id: 't_2',
        enabled: true,
        weekdays: [1, 2, 3, 4, 5],
        trigger: { kind: 'time', time: '22:00' },
    },
];
const dashboard = (events) =>
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
                                            id: 'w-timer',
                                            type: 'timer',
                                            title: 'Thermostat',
                                            datapoint: '',
                                            layout: 'default',
                                            gridPos: { x: 0, y: 0, w: 10, h: 6 },
                                            options: {
                                                stateBaseId: 'aura.0.timers.t-test',
                                                targetDp: 'demo.0.thermostat',
                                                ...(events ? { events } : {}),
                                            },
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
const storeEvents = (mod) =>
    mod.useDashboardStore.getState().layouts[0].sections[0].tabs[0].widgets[0].options?.events?.length ?? 0;

/** What useConfigSync's subscription does with an incoming dashboard value. */
function deliver(mod, raw) {
    if (mod.isPendingInThisTab('aura-dashboard')) return 'skipped (pending)';
    if (mod.applyOneState('aura-dashboard', raw, false)) {
        mod.rehydrateAll(true);
        return 'applied';
    }
    return 'ignored (equals storage)';
}

async function renameAndSave(mod) {
    writes.length = 0;
    mod.useDashboardStore.getState().updateWidget('w-timer', { title: 'Thermostat Bad' });
    mod.saveToIoBroker({ backup: false });
    await new Promise((r) => setTimeout(r, 50));
    const w = writes.find(([id]) => id === 'aura.0.config.dashboard');
    if (!w) return null;
    const widget = JSON.parse(w[1]).state.layouts[0].sections[0].tabs[0].widgets[0];
    return { title: widget.title, events: widget.options?.events?.length ?? 0 };
}

const BEFORE = dashboard(undefined);
const AFTER = dashboard(EVENTS);

// ── A: frontend on another device ────────────────────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': BEFORE });
    const how = deliver(mod, AFTER);
    console.log(`  A: state change ${how}`);
    check('A: admin store holds the 2 events', storeEvents(mod) === 2, String(storeEvents(mod)));
    const saved = await renameAndSave(mod);
    check(
        'A: rename save keeps the events',
        saved?.events === 2 && saved.title === 'Thermostat Bad',
        JSON.stringify(saved),
    );
}

// ── B: frontend in the same browser (shared storage) ─────────────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': BEFORE });
    // The read-only frontend tab persists its edit to the shared storage first …
    map.set('aura-dashboard', AFTER);
    // … then its save echoes back to the admin tab.
    const how = deliver(mod, AFTER);
    console.log(`  B: state change ${how}`);
    check('B: admin store holds the 2 events', storeEvents(mod) === 2, String(storeEvents(mod)));
    const saved = await renameAndSave(mod);
    check(
        'B: rename save keeps the events',
        saved?.events === 2 && saved.title === 'Thermostat Bad',
        JSON.stringify(saved),
    );
}

// ── C: same browser, the frontend's flag still set ───────────────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': BEFORE });
    map.set('aura-dashboard', AFTER);
    map.set('_aura_dirty:aura-dashboard', '1');
    const how = deliver(mod, AFTER);
    check("C: the frontend's flag does not block the state change", how === 'applied', how);
    check('C: admin store holds the 2 events', storeEvents(mod) === 2, String(storeEvents(mod)));
    const saved = await renameAndSave(mod);
    check('C: rename save keeps the events', saved?.events === 2, JSON.stringify(saved));
}

// ── D: the admin's own unsaved edit still wins ───────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': BEFORE });
    mod.useDashboardStore.getState().updateWidget('w-timer', { title: 'Entwurf' });
    const how = deliver(mod, AFTER);
    check('D: inbound value is held back while the admin edits', how === 'skipped (pending)', how);
}

// ── D2: unsaved edits from before a reload (flag only, no RAM pending) ───────
{
    const { mod } = await boot({ 'aura-dashboard': BEFORE, '_aura_dirty:aura-dashboard': '1' });
    void storeEvents(mod); // the store hydrated the admin's copy
    const how = deliver(mod, AFTER);
    check("D2: a flag on this tab's own copy still blocks", how === 'skipped (pending)', how);
}

// ── E: the echo of the admin's own save ──────────────────────────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': BEFORE });
    await renameAndSave(mod);
    const own = map.get('aura-dashboard');
    check('E: own saved value is no change', !mod.applyOneState('aura-dashboard', own, false));
}

rmSync(bundle, { force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
