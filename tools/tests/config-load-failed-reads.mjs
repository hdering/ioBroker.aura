// #800: every group child was gone after an update. An admin that booted while
// the adapter restarted got no answer to its config reads, took that for an
// empty ioBroker, marked the RAM-only group defs as loaded and pushed this
// browser's copy back — with the group defs as `{}`.
//
//   node tools/tests/config-load-failed-reads.mjs
//
// No dev server: stores, persistManager and configLoader are bundled with esbuild,
// ioBroker I/O is stubbed (reads can be made to fail), localStorage is an
// in-memory map. What must hold:
//   1. A failed read is reported as failed, never as "empty": the load is not
//      complete and the group defs stay unloaded, so saves are refused.
//   2. ioBroker answered and holds no group defs (first-time user) → loaded empty.
//   3. ioBroker holds group defs → loaded with their children.
//   4. Malformed group defs stay unloaded — never saved over.
//   5. loadConfigUntilComplete retries until the reads answer.
//   6. Safety net: group defs empty under group widgets that point at defs are
//      not written, the rest of the save goes through, and a backup keeps the
//      value ioBroker holds instead of `{}`.
//   7. Without such group widgets an empty store is still written.
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
const remote = new Map(); // state id → raw value the stubbed ioBroker holds
const failing = new Set(); // state ids whose read fails (adapter restarting)
const writes = []; // [state id, raw] of every config write
const reads = []; // state ids read
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
                export const getStateDirect = async (id) => {
                    const v = globalThis.__remote.get(id);
                    return v === undefined ? null : { val: v, ack: true };
                };
                export const getStateChecked = async (id) => {
                    globalThis.__reads.push(id);
                    if (globalThis.__failing.has(id)) return { ok: false, state: null };
                    const v = globalThis.__remote.get(id);
                    return { ok: true, state: v === undefined ? null : { val: v, ack: true } };
                };
                export const getStateFromCache = (id) => {
                    const v = globalThis.__remote.get(id);
                    return v === undefined ? undefined : { val: v, ack: true };
                };
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
Object.assign(globalThis, { __remote: remote, __failing: failing, __writes: writes, __reads: reads });

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-config-load-failed-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export {
                loadConfigFromIoBroker,
                loadConfigUntilComplete,
                settleRamStores,
            } from './src-vis/utils/configLoader.ts';
            export { saveToIoBroker, buildBackupPayload, isPending } from './src-vis/store/persistManager.ts';
            export { useDashboardStore } from './src-vis/store/dashboardStore.ts';
            export { useGroupDefsStore, markGroupDefsHydrated } from './src-vis/store/groupDefsStore.ts';
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

const DASHBOARD_ID = 'aura.0.config.dashboard';
const DEFS_ID = 'aura.0.config.group-defs';

const dashboard = (widgets) =>
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
                            tabs: [{ id: 'tab1', name: 'Eins', slug: 'eins', widgets }],
                        },
                    ],
                },
            ],
            activeLayoutId: 'layout-default',
            editMode: false,
        },
        version: 0,
    });
const GROUP = {
    id: 'g1',
    type: 'group',
    title: 'Wohnzimmer',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 6, h: 6 },
    options: { defId: 'gd-1' },
};
const VALUE = {
    id: 'v1',
    type: 'value',
    title: 'Temperatur',
    datapoint: 'demo.0.t',
    gridPos: { x: 6, y: 0, w: 4, h: 4 },
    options: {},
};
const CHILD = {
    id: 'c1',
    type: 'dimmer',
    title: 'Deckenlampe',
    datapoint: 'demo.0.l',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    options: {},
};
const DEFS = JSON.stringify({ state: { defs: { 'gd-1': [CHILD] } }, version: 0 });
const WITH_GROUP = dashboard([GROUP, VALUE]);

let loadCount = 0;
/** Fresh module instance + storage + ioBroker for each scenario. */
async function boot({ storage = {}, held = {}, fail = [] } = {}) {
    const map = new Map(Object.entries(storage));
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
    remote.clear();
    for (const [id, v] of Object.entries(held)) remote.set(id, v);
    failing.clear();
    for (const id of fail) failing.add(id);
    writes.length = 0;
    reads.length = 0;
    const mod = await import(`${bundleUrl}?boot=${++loadCount}`);
    return { mod, map };
}
const written = (id) => writes.filter(([w]) => w === id).map(([, v]) => v);
const defsOf = (mod) => mod.useGroupDefsStore.getState().defs;
const hydrated = (mod) => mod.useGroupDefsStore.getState().hydrated;

// ── 1: every read fails (adapter restarting) ─────────────────────────────────
{
    const { mod } = await boot({
        storage: { 'aura-dashboard': WITH_GROUP },
        held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: DEFS },
        fail: [DASHBOARD_ID, DEFS_ID, 'aura.0.config.theme', 'aura.0.config.global-settings'],
    });
    const result = await mod.loadConfigFromIoBroker(true);
    check('failed reads: load is not complete', !result.complete);
    check('… the group defs are reported as failed', result.failedKeys.includes('aura-group-defs'));
    check('… and not as present', !result.presentKeys.includes('aura-group-defs'));
    mod.settleRamStores(result);
    check('… the group defs stay unloaded', !hydrated(mod));
    check('… a bootstrap save is refused', mod.saveToIoBroker({ all: true }) === false);
    eq('… and writes nothing', writes.length, 0);
}

// ── 2: ioBroker answered, holds no group defs (first-time user) ───────────────
{
    const { mod } = await boot({ held: { [DASHBOARD_ID]: dashboard([VALUE]) } });
    const result = await mod.loadConfigFromIoBroker(true);
    check('empty defs: load is complete', result.complete);
    mod.settleRamStores(result);
    check('… the group defs count as loaded', hydrated(mod));
    eq('… and are empty', defsOf(mod), {});
}

// ── 3: ioBroker holds group defs ─────────────────────────────────────────────
{
    const { mod } = await boot({ held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: DEFS } });
    const result = await mod.loadConfigFromIoBroker(true);
    mod.settleRamStores(result);
    check('stored defs: loaded', hydrated(mod));
    eq('… with their children', Object.keys(defsOf(mod)), ['gd-1']);
}

// ── 4: malformed group defs ──────────────────────────────────────────────────
{
    const { mod } = await boot({ held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: '{"state":{"defs":' } });
    const result = await mod.loadConfigFromIoBroker(true);
    mod.settleRamStores(result);
    check('malformed defs: stay unloaded (never saved over)', !hydrated(mod));
}

// ── 5: retry until the adapter answers ───────────────────────────────────────
{
    const { mod } = await boot({
        held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: DEFS },
        fail: [DEFS_ID],
    });
    let attempts = 0;
    const origPush = reads.push.bind(reads);
    reads.push = (id) => {
        // Logged before the stub checks `failing`: the 3rd read is the first answered.
        if (id === DEFS_ID && ++attempts === 3) failing.delete(DEFS_ID);
        return origPush(id);
    };
    const result = await mod.loadConfigUntilComplete(true, {}, { attempts: 5, delayMs: 1 });
    reads.push = origPush;
    check('retry: ends complete', result.complete);
    eq('… after three reads of the group defs', reads.filter((id) => id === DEFS_ID).length, 3);
    check('… and the group defs are loaded', hydrated(mod) && Object.keys(defsOf(mod)).length === 1);
}
{
    const { mod } = await boot({ held: { [DEFS_ID]: DEFS }, fail: [DEFS_ID] });
    const result = await mod.loadConfigUntilComplete(true, {}, { attempts: 3, delayMs: 1 });
    check('retry exhausted: incomplete', !result.complete);
    eq('… after the configured attempts', reads.filter((id) => id === DEFS_ID).length, 3);
    check('… group defs still unloaded', !hydrated(mod));
}

// ── 6: safety net against writing an emptied store ───────────────────────────
{
    // The state the old boot path produced: defs read failed, flag forced anyway.
    const { mod } = await boot({
        held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: DEFS },
        fail: [DEFS_ID],
    });
    await mod.loadConfigFromIoBroker(true);
    mod.markGroupDefsHydrated();
    eq('loss state: defs empty under a live group', defsOf(mod), {});
    const backup = mod.buildBackupPayload();
    eq('… a backup keeps what ioBroker holds', backup['aura-group-defs'], DEFS);
    check('… the save itself goes through', mod.saveToIoBroker({ all: true }) === true);
    eq('… but the group defs are not written', written(DEFS_ID), []);
    check('… the dashboard is', written(DASHBOARD_ID).length === 1);
    check('… and the defs key is not left pending', !mod.isPending('aura-group-defs'));
}
{
    // Removing the last child keeps the def as [] — that is an edit, not a loss.
    const { mod } = await boot({ held: { [DASHBOARD_ID]: WITH_GROUP, [DEFS_ID]: DEFS } });
    mod.settleRamStores(await mod.loadConfigFromIoBroker(true));
    mod.useGroupDefsStore.getState().setDef('gd-1', []);
    mod.saveToIoBroker();
    eq('emptied group: its def is written as []', JSON.parse(written(DEFS_ID)[0] ?? 'null')?.state.defs, {
        'gd-1': [],
    });
}

// ── 7: no group widgets → an empty store is still written ────────────────────
{
    const { mod } = await boot({ held: { [DASHBOARD_ID]: dashboard([VALUE]) } });
    mod.settleRamStores(await mod.loadConfigFromIoBroker(true));
    mod.saveToIoBroker({ all: true });
    eq('no groups: empty defs are written', written(DEFS_ID), [JSON.stringify({ state: { defs: {} }, version: 0 })]);
}

rmSync(bundle, { force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
