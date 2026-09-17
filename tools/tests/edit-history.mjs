// Step-wise undo/redo in the admin editor (store snapshots, not commands).
//
//   node tools/tests/edit-history.mjs
//
// No dev server needed: the stores, persistManager and the history are bundled
// with esbuild, ioBroker I/O is stubbed and localStorage is an in-memory map — so
// the real chain runs: store action → zustand persist → managedStorage.setItem →
// recordChange, and undo → store.setState → persist → dirty bookkeeping.
//
// What must hold:
//   1. An edit becomes an entry; undo restores the value and leaves the key CLEAN
//      when it lands on the last saved value; redo makes it dirty again.
//   2. Edits of the same store inside COALESCE_MS merge (typing = one step); a
//      pause or a group boundary starts a new entry; undo seals the previous one.
//   3. Navigation (suppressed writes) is never an entry and never undone.
//   4. historyGroup() → one entry across stores; revertAll() is one undoable entry.
//   5. The save-time GC of orphaned group defs attaches to the previous entry, so
//      undoing a group widget's removal brings its children back.
//   6. Inbound sync drops only the entries of that store; reset/stop clear; the
//      first write of a fresh install and the boot hydration are not entries.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';

const root = process.cwd();

// ── Bundle ───────────────────────────────────────────────────────────────────
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
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'stub-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /utils\/namespace$/ }, () => ({ path: 'stub-namespace', namespace: 'stub' }));
        b.onLoad({ filter: /^stub-iobroker$/, namespace: 'stub' }, () => ({
            contents: `
                export const setStateDirectAsync = async () => {};
                export const setStateDirect = () => {};
                export const getStateDirect = async () => null;
                export const getStateFromCache = () => undefined;
                export const writeFileDirect = async (ns, name, data) => {
                    (globalThis.__auraFiles ??= []).push({ name, data });
                };
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
const bundle = join(cache, `aura-edit-history-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export * as history from './src-vis/store/editHistory.ts';
            export { HISTORY_LIMIT, COALESCE_MS } from './src-vis/store/editHistory.ts';
            export { isTextEditTarget, describeEntry } from './src-vis/store/editHistorySetup.ts';
            export { restoreBackupPayload } from './src-vis/utils/backupRestore.ts';
            export * as persist from './src-vis/store/editHistoryPersist.ts';
            export { diffSnapshots, applyPatch } from './src-vis/utils/refPatch.ts';
            export {
                isDirty,
                hasDirtyFlag,
                revertAll,
                saveToIoBroker,
                withSuppressedDirty,
                registerExternalConfigKey,
                markExternalDirty,
                discardPendingKey,
            } from './src-vis/store/persistManager.ts';
            export { useDashboardStore } from './src-vis/store/dashboardStore.ts';
            export { useThemeStore } from './src-vis/store/themeStore.ts';
            export { useConfigStore } from './src-vis/store/configStore.ts';
            export { useGroupStore } from './src-vis/store/groupStore.ts';
            export { usePopupConfigStore } from './src-vis/store/popupConfigStore.ts';
            export { hydrateGroupDefs, useGroupDefsStore } from './src-vis/store/groupDefsStore.ts';
            export { markWidgetPresetsHydrated } from './src-vis/store/widgetPresetsStore.ts';
            export { applyRaw } from './src-vis/utils/configLoader.ts';
        `,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    plugins: [stubPlugin],
    // Vite replaces this statically; here the DEV-only window hook must compile out.
    define: { 'import.meta.env.DEV': 'false' },
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
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// Controllable clock — coalescing is time-based.
let now = 1_700_000_000_000;
Date.now = () => now;
const tick = (ms) => {
    now += ms;
};

const widget = (id, extra = {}) => ({
    id,
    type: 'value',
    title: id,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: {},
    ...extra,
});
const dashboardPayload = (widgets, secondTabWidgets = []) =>
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
                                { id: 'tab1', name: 'Eins', slug: 'eins', widgets },
                                { id: 'tab2', name: 'Zwei', slug: 'zwei', widgets: secondTabWidgets },
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
/** Fresh in-memory localStorage + a fresh module instance (own stores, own history). */
async function boot(persisted, { seedDefaults = true } = {}) {
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
    const mod = await import(`${bundleUrl}?boot=${++loadCount}`);
    // What the admin looks like after loadConfigFromIoBroker: every synced key
    // sits in localStorage (applyRaw wrote what ioBroker holds — here the store
    // defaults), the RAM-only stores are hydrated, the history starts on that base.
    if (!seedDefaults) return { mod, map };
    for (const [key, store] of [
        ['aura-theme', mod.useThemeStore],
        ['aura-groups', mod.useGroupStore],
        ['aura-config', mod.useConfigStore],
        ['aura-popup-config', mod.usePopupConfigStore],
    ]) {
        if (map.has(key)) continue;
        // JSON.stringify drops the action functions — same shape zustand persists.
        mod.applyRaw(key, JSON.stringify({ state: store.getState(), version: 0 }));
        store.persist.rehydrate();
    }
    mod.hydrateGroupDefs(JSON.stringify({ state: { defs: {} }, version: 0 }));
    mod.markWidgetPresetsHydrated();
    mod.history.startEditHistory();
    return { mod, map };
}
const widgets = (mod) => mod.useDashboardStore.getState().layouts[0].sections[0].tabs[0].widgets;
const titleOf = (mod, id) => widgets(mod).find((w) => w.id === id)?.title;
const counts = (mod) => {
    const s = mod.history.useEditHistoryStore.getState();
    return [s.undoCount, s.redoCount];
};

// ── 1. Edit → undo (clean) → redo (dirty) ────────────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    eq('boot: nothing to undo', counts(mod), [0, 0]);
    check('boot: not dirty', !mod.isDirty());

    mod.useDashboardStore.getState().updateWidget('w1', { title: 'Neu' });
    eq('edit → one entry', counts(mod), [1, 0]);
    check('edit → dirty', mod.isDirty());

    check('undo() returns true', mod.history.undo());
    eq('undo restores the title', titleOf(mod, 'w1'), 'w1');
    eq('undo moves the entry to redo', counts(mod), [0, 1]);
    check('undo back to the saved value leaves the key CLEAN', !mod.isDirty(), 'still dirty');
    check('… and clears the persistent dirty flag', !mod.hasDirtyFlag('aura-dashboard'));

    check('redo() returns true', mod.history.redo());
    eq('redo re-applies the title', titleOf(mod, 'w1'), 'Neu');
    check('redo makes the key dirty again', mod.isDirty());
    check('undo() on an empty stack returns false', (mod.history.undo(), !mod.history.undo()));
}

// ── 2. Coalescing, pause, seal, redo cleared ─────────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    const upd = (title) => mod.useDashboardStore.getState().updateWidget('w1', { title });
    upd('N');
    tick(100);
    upd('Ne');
    tick(100);
    upd('Neu');
    eq('typing inside the window is ONE entry', counts(mod), [1, 0]);
    mod.history.undo();
    eq('… and undoing it restores the value from before the first keystroke', titleOf(mod, 'w1'), 'w1');
    mod.history.redo();

    tick(mod.COALESCE_MS + 1);
    upd('Neu2');
    eq('a pause starts a new entry', counts(mod), [2, 0]);

    mod.history.undo();
    eq('undo → redo available', counts(mod), [1, 1]);
    tick(10);
    upd('X');
    eq('a new edit after undo clears redo', counts(mod), [2, 0]);
    // The remaining older entry is sealed by the undo: 'X' must not have merged into it.
    mod.history.undo();
    eq('undo the new edit', titleOf(mod, 'w1'), 'Neu');
    mod.history.undo();
    eq('undo the older (sealed) entry separately', titleOf(mod, 'w1'), 'w1');

    // Different stores merge only within the same action (same tick); a moment
    // later they are two steps, however close.
    upd('A');
    tick(100);
    mod.useThemeStore.getState().setTheme('light');
    eq('edits in two stores 100 ms apart are two entries', counts(mod), [2, 0]);
    tick(2000);
    mod.useConfigStore.getState().updateFrontend({ headerTitle: 'Zwei' });
    tick(5);
    mod.useThemeStore.getState().setTheme('dark');
    eq('two stores written by one action are ONE entry', counts(mod), [3, 0]);
    eq(
        '… holding both keys',
        mod.history
            .peekUndo()
            .changes.map((c) => c.key)
            .sort(),
        ['aura-config', 'aura-theme'],
    );
    mod.history.undo();
    eq(
        'undo of that entry reverts both',
        [mod.useConfigStore.getState().frontend.headerTitle, mod.useThemeStore.getState().themeId],
        ['Aura', 'light'],
    );
}

// ── 3. Navigation is not an entry and is not undone ──────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')], [widget('w2')]) });
    const activeTab = () => mod.useDashboardStore.getState().layouts[0].sections[0].activeTabId;
    mod.useDashboardStore.getState().setActiveTab('tab2');
    eq('switching tabs is not an entry', counts(mod), [0, 0]);
    check('switching tabs is not dirty', !mod.isDirty());
    mod.useDashboardStore.getState().updateWidget('w2', { title: 'Zwei neu' });
    mod.history.undo();
    eq('undo of an edit made after navigating stays on the current tab', activeTab(), 'tab2');
    check('… and is clean again', !mod.isDirty());
}

// ── 4. Groups: one entry across stores; revertAll is undoable ────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    mod.history.historyGroup(() => {
        mod.useDashboardStore.getState().updateWidget('w1', { title: 'G' });
        mod.useThemeStore.getState().setTheme('light');
        mod.useConfigStore.getState().updateFrontend({ headerTitle: 'Gruppe' });
    });
    eq('group → one entry', counts(mod), [1, 0]);
    const keys = mod.history
        .peekUndo()
        .changes.map((c) => c.key)
        .sort();
    eq('… holding all three stores', keys, ['aura-config', 'aura-dashboard', 'aura-theme']);
    mod.history.undo();
    eq('undo group: title', titleOf(mod, 'w1'), 'w1');
    eq('undo group: header', mod.useConfigStore.getState().frontend.headerTitle, 'Aura');
    check('undo group: everything clean', !mod.isDirty());
    mod.history.redo();
    eq('redo group: theme', mod.useThemeStore.getState().themeId, 'light');

    // revertAll = "discard": back to saved in one entry, itself undoable.
    tick(2000);
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'R1' });
    tick(2000);
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'R2' });
    const before = counts(mod)[0];
    mod.revertAll([
        () => mod.useDashboardStore.persist.rehydrate(),
        () => mod.useThemeStore.persist.rehydrate(),
        () => mod.useGroupStore.persist.rehydrate(),
        () => mod.useConfigStore.persist.rehydrate(),
        () => mod.usePopupConfigStore.persist.rehydrate(),
    ]);
    eq('revertAll restores the saved title', titleOf(mod, 'w1'), 'w1');
    eq('revertAll restores the saved header', mod.useConfigStore.getState().frontend.headerTitle, 'Aura');
    check('revertAll leaves nothing dirty', !mod.isDirty());
    eq('revertAll is ONE entry', counts(mod)[0], before + 1);
    mod.history.undo();
    eq('undo revertAll brings the last edit back', titleOf(mod, 'w1'), 'R2');
    eq('… and the theme', mod.useThemeStore.getState().themeId, 'light');
    check('… and the keys are dirty again', mod.isDirty());
}

// ── 5. Save-time GC of group defs attaches to the removal ────────────────────
{
    const grp = widget('g1', { type: 'group', options: { defId: 'gd-1' } });
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([grp, widget('w1')]) });
    mod.hydrateGroupDefs(JSON.stringify({ state: { defs: { 'gd-1': [widget('child')] } }, version: 0 }));
    eq('hydrating group defs is not an entry', counts(mod), [0, 0]);

    mod.useDashboardStore.getState().removeWidget('g1');
    eq('removing the group widget → one entry', counts(mod), [1, 0]);
    check('def still present before save', !!mod.useGroupDefsStore.getState().defs['gd-1']);

    mod.saveToIoBroker();
    check('save GC removed the orphaned def', !mod.useGroupDefsStore.getState().defs['gd-1']);
    eq('GC did not add an entry of its own', counts(mod)[0], 1);
    const keys = mod.history
        .peekUndo()
        .changes.map((c) => c.key)
        .sort();
    eq('… it attached to the removal', keys, ['aura-dashboard', 'aura-group-defs']);

    mod.history.undo();
    check(
        'undo brings the group widget back',
        widgets(mod).some((w) => w.id === 'g1'),
    );
    eq('… WITH its children', mod.useGroupDefsStore.getState().defs['gd-1']?.length, 1);

    mod.history.redo();
    check('redo removes it again', !widgets(mod).some((w) => w.id === 'g1'));
    check('redo drops the def again', !mod.useGroupDefsStore.getState().defs['gd-1']);
}

// ── 6. Inbound sync, reset, stop, init ───────────────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'D' });
    tick(2000);
    mod.useThemeStore.getState().setTheme('light');
    eq('two entries in two stores', counts(mod), [2, 0]);

    // Another device saved the theme: applyRaw + rehydrate is what useConfigSync does.
    mod.applyRaw(
        'aura-theme',
        JSON.stringify({ state: { ...mod.useThemeStore.getState(), themeId: 'ocean' }, version: 0 }),
    );
    mod.useThemeStore.persist.rehydrate();
    mod.history.invalidateHistoryKey('aura-theme');
    eq('inbound theme drops only the theme entry', counts(mod), [1, 0]);
    eq('… and raises the notice', mod.history.useEditHistoryStore.getState().notice, 'remote');
    eq('the remote value stands', mod.useThemeStore.getState().themeId, 'ocean');
    mod.history.undo();
    eq('the dashboard entry still undoes', titleOf(mod, 'w1'), 'w1');
    eq('… without touching the remote theme', mod.useThemeStore.getState().themeId, 'ocean');

    mod.history.redo();
    mod.history.resetEditHistory();
    eq('reset clears both stacks', counts(mod), [0, 0]);
    eq('reset keeps the state', titleOf(mod, 'w1'), 'D');

    mod.history.stopEditHistory();
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'E' });
    eq('stopped: edits are not recorded', counts(mod), [0, 0]);
    check('stopped: edits still mark dirty', mod.isDirty());
}
{
    // Fresh install, nothing in localStorage at all: hydration is not an entry,
    // the first real edit is — even though managedStorage sees current === null.
    const { mod } = await boot({}, { seedDefaults: false });
    mod.hydrateGroupDefs(JSON.stringify({ state: { defs: {} }, version: 0 }));
    mod.markWidgetPresetsHydrated();
    mod.history.startEditHistory();
    eq('fresh install: hydration is not an entry', counts(mod), [0, 0]);
    mod.useDashboardStore.getState().addTab('Neu');
    eq('fresh install: first real edit is', counts(mod), [1, 0]);
    mod.history.undo();
    eq('fresh install: … and undoes', mod.useDashboardStore.getState().layouts[0].sections[0].tabs.length, 1);
}

// ── 7. Limit ─────────────────────────────────────────────────────────────────
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    for (let i = 0; i < mod.HISTORY_LIMIT + 5; i++) {
        tick(mod.COALESCE_MS + 1);
        mod.useDashboardStore.getState().updateWidget('w1', { title: `T${i}` });
    }
    eq('stack is capped', counts(mod)[0], mod.HISTORY_LIMIT);
}

// ── 8. Labels share the backup wording; restore = safety backup + one entry ──
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1'), widget('w2')]) });
    const top = () => mod.describeEntry(mod.history.peekUndo());
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'Küche' });
    eq('rename → widget-renamed', top(), [{ store: 'aura-dashboard', kind: 'widget-renamed', label: 'Küche' }]);
    tick(2000);
    mod.useDashboardStore.getState().updateWidget('w2', { gridPos: { x: 5, y: 0, w: 10, h: 6 } });
    eq('move → widget-moved', top(), [{ store: 'aura-dashboard', kind: 'widget-moved', label: 'w2' }]);
    tick(100);
    mod.useDashboardStore.getState().updateWidget('w2', { gridPos: { x: 9, y: 0, w: 10, h: 6 } });
    eq('a merged entry re-labels from its first before', top(), [
        { store: 'aura-dashboard', kind: 'widget-moved', label: 'w2' },
    ]);
    tick(2000);
    mod.history.historyGroup(() => {
        mod.useDashboardStore.getState().removeWidget('w2');
        mod.useThemeStore.getState().setTheme('light');
    });
    eq('group → one detail per store', top(), [
        { store: 'aura-dashboard', kind: 'widget-removed', label: 'w2' },
        { store: 'aura-theme', kind: 'store-changed', label: 'aura-theme' },
    ]);

    // Restore a backup payload: the current state is snapshotted first, the
    // switch is one entry and undoes in one step.
    globalThis.__auraFiles = [];
    const entriesBefore = counts(mod)[0];
    const ok = await mod.restoreBackupPayload({
        'aura-dashboard': dashboardPayload([widget('w1', { title: 'Restored' })]),
    });
    check('restore reports success', ok);
    eq('restore applied', titleOf(mod, 'w1'), 'Restored');
    eq('restore is ONE entry', counts(mod)[0], entriesBefore + 1);
    const safety = globalThis.__auraFiles.find(
        (f) => f.name.endsWith('.meta.json') && String(f.data).includes('restore-safety'),
    );
    check('a safety snapshot was written before the restore', !!safety);
    mod.history.undo();
    eq('undo restore → previous state', titleOf(mod, 'w1'), 'Küche');
    eq('… theme too', mod.useThemeStore.getState().themeId, 'light');
    eq('restore entry label', mod.describeEntry(mod.history.peekRedo())[0].kind, 'widget-renamed');
}

// ── 8b. Adapter-owned ("external") keys join the history ─────────────────────
// The message presentation defaults live in a page-level buffer, not a store;
// the page registers a history adapter and reports edits via markExternalDirty.
// Same contract as a sync store: one step per edit, undo back to the saved value
// leaves the key clean, revertAll covers it and is itself one undoable step.
{
    const { mod } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1')]) });
    const KEY = 'aura-test-external';
    const buffer = { value: { a: 1 }, saved: { a: 1 } };
    let saves = 0;
    mod.registerExternalConfigKey(KEY, {
        save: async () => {
            saves++;
            buffer.saved = buffer.value;
            return true;
        },
        revert: () => {
            buffer.value = buffer.saved;
        },
    });
    mod.history.registerHistoryStore(KEY, {
        getSnapshot: () => ({ value: buffer.value }),
        applySnapshot: (snap) => {
            buffer.value = snap.value;
            if (JSON.stringify(buffer.value) === JSON.stringify(buffer.saved)) mod.discardPendingKey(KEY);
            else mod.markExternalDirty(KEY);
        },
    });
    mod.history.resetEditHistory();
    const edit = (v) => {
        buffer.value = v;
        mod.markExternalDirty(KEY);
    };

    edit({ a: 2 });
    eq('external edit → one entry', counts(mod), [1, 0]);
    check('external edit → dirty', mod.isDirty());
    eq(
        '… the entry names the key',
        mod.history.peekUndo().changes.map((c) => c.key),
        [KEY],
    );
    eq('… label falls back to the store name', mod.describeEntry(mod.history.peekUndo()), [
        { store: KEY, kind: 'store-changed', label: KEY },
    ]);

    mod.history.undo();
    eq('undo puts the buffer back', buffer.value, { a: 1 });
    check('undo back to the saved value leaves the key clean', !mod.isDirty(), 'still dirty');
    mod.history.redo();
    eq('redo re-applies', buffer.value, { a: 2 });
    check('redo makes it dirty again', mod.isDirty());

    tick(2000);
    edit({ a: 3 });
    eq('a later edit is a second entry', counts(mod)[0], 2);
    mod.revertAll([]);
    eq('revertAll restores the saved value', buffer.value, { a: 1 });
    check('revertAll leaves it clean', !mod.isDirty());
    eq('revertAll is one entry', counts(mod)[0], 3);
    mod.history.undo();
    eq('undo revertAll brings the edit back', buffer.value, { a: 3 });
    check('… dirty again', mod.isDirty());
    eq('save handler not invoked by undo/redo', saves, 0);
}

// ── 8c. Structural patches and the history across a reload ──────────────────
{
    const { mod, map } = await boot({ 'aura-dashboard': dashboardPayload([widget('w1'), widget('w2')]) });
    const snap = () => mod.history.currentSnapshot('aura-dashboard');

    // refPatch round trip on real store snapshots: rename, move, remove, add.
    const s0 = snap();
    mod.useDashboardStore.getState().updateWidget('w1', { title: 'Neu' });
    const s1 = snap();
    tick(2000);
    mod.useDashboardStore.getState().removeWidget('w2');
    const s2 = snap();
    tick(2000);
    mod.useDashboardStore.getState().addWidget(widget('w3'));
    const s3 = snap();
    const roundTrip = (a, b) => JSON.stringify(mod.applyPatch(a, mod.diffSnapshots(a, b))) === JSON.stringify(b);
    check('patch reproduces a rename', roundTrip(s0, s1));
    check('patch reproduces a removal (array shrinks)', roundTrip(s1, s2));
    check('patch reproduces an add (array grows)', roundTrip(s2, s3));
    check('patch of identical snapshots is empty', mod.diffSnapshots(s3, s3).length === 0);
    check('rename patch is small', JSON.stringify(mod.diffSnapshots(s0, s1)).length < 400);

    // Persist: in-memory storage stands in for IndexedDB.
    const mem = { data: null, get: async () => mem.data, put: async (_ns, d) => void (mem.data = d) };
    mod.persist.configureHistoryStorage(mem);
    tick(2000);
    mod.useThemeStore.getState().setTheme('light');
    mod.persist.flushHistoryPersistence();
    await Promise.resolve();
    check('record written', !!mem.data);
    eq('record holds the four steps', mem.data.entries.length, 4);
    eq('one base per touched store', Object.keys(mem.data.base).sort(), ['aura-dashboard', 'aura-theme']);
    check('the saved dashboard rides along as original', typeof mem.data.originals['aura-dashboard'] === 'string');

    // "Reload": a fresh module instance on the localStorage the browser would
    // have — edited values plus the dirty flags — and the same storage record.
    const { mod: b } = await boot(Object.fromEntries(map));
    b.persist.configureHistoryStorage(mem);
    eq('after reload the live history is empty', counts(b), [0, 0]);
    // Navigation before the restore must not count as a difference.
    b.useDashboardStore.getState().setActiveTab('tab2');
    eq('restore succeeds', await b.persist.restorePersistedHistory(), 'restored');
    eq('all four steps are back', counts(b), [4, 0]);
    eq('a second restore does nothing', await b.persist.restorePersistedHistory(), 'skipped');
    b.history.undo();
    eq('undo after reload: theme', b.useThemeStore.getState().themeId, 'dark');
    b.history.undo();
    b.history.undo();
    b.history.undo();
    eq('undo after reload: title', titleOf(b, 'w1'), 'w1');
    check(
        'undo after reload: w2 is back',
        widgets(b).some((w) => w.id === 'w2'),
    );
    check('undo back to the saved value leaves the reloaded key clean', !b.isDirty(), 'still dirty');
    b.history.redo();
    eq('redo after reload works', titleOf(b, 'w1'), 'Neu');

    // A different state than the chain ends in (another device saved) → discard.
    const other = Object.fromEntries(map);
    other['aura-dashboard'] = other['aura-dashboard'].replace('"Neu"', '"Fremd"');
    const { mod: c } = await boot(other);
    c.persist.configureHistoryStorage(mem);
    eq('mismatching state → stale, nothing restored', await c.persist.restorePersistedHistory(), 'stale');
    eq('… history stays empty', counts(c), [0, 0]);

    // No storage → unavailable, never throws.
    const { mod: d } = await boot({});
    d.persist.configureHistoryStorage(null);
    eq('no storage → unavailable', await d.persist.restorePersistedHistory(), 'unavailable');
}

// ── 9. Shortcut target rule (pure predicate) ─────────────────────────────────
{
    const { mod } = await boot({});
    globalThis.HTMLElement = class {};
    const el = (tagName, type, editable = false) => {
        const e = new globalThis.HTMLElement();
        e.tagName = tagName;
        e.type = type;
        e.isContentEditable = editable;
        return e;
    };
    check('text input keeps native undo', mod.isTextEditTarget(el('INPUT', 'text')));
    check('number input keeps native undo', mod.isTextEditTarget(el('INPUT', 'number')));
    check('textarea keeps native undo', mod.isTextEditTarget(el('TEXTAREA', '')));
    check('contentEditable keeps native undo', mod.isTextEditTarget(el('DIV', '', true)));
    check('checkbox hands Ctrl+Z to the editor', !mod.isTextEditTarget(el('INPUT', 'checkbox')));
    check('range hands Ctrl+Z to the editor', !mod.isTextEditTarget(el('INPUT', 'range')));
    check('color hands Ctrl+Z to the editor', !mod.isTextEditTarget(el('INPUT', 'color')));
    check('button hands Ctrl+Z to the editor', !mod.isTextEditTarget(el('BUTTON', '')));
    check('no target hands Ctrl+Z to the editor', !mod.isTextEditTarget(null));
}

rmSync(bundle, { force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
