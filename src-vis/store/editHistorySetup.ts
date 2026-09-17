/**
 * Wires the synced config stores into the edit history and provides the
 * editor-side hooks (lifecycle, Ctrl+Z / Ctrl+Y). Imported by the admin layout
 * and the DEV screenshot harness only — importing this module registers the
 * stores, recording starts with `startEditHistory()`.
 */
import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import { useDashboardStore } from './dashboardStore';
import { useThemeStore } from './themeStore';
import { useGroupStore } from './groupStore';
import { useConfigStore } from './configStore';
import { useGlobalSettingsStore } from './globalSettingsStore';
import { usePopupConfigStore } from './popupConfigStore';
import { useGroupDefsStore } from './groupDefsStore';
import { useWidgetPresetsStore } from './widgetPresetsStore';
import {
    describeLayoutsChange,
    isDirty,
    withSuppressedDirty,
    type BackupChangeDetail,
    type SyncStoreKey,
} from './persistManager';
import {
    registerHistoryStore,
    startEditHistory,
    stopEditHistory,
    undo,
    redo,
    historyEntries,
    useEditHistoryStore,
    type HistoryEntry,
    type Snapshot,
} from './editHistory';

/** Every non-function field of the state except the listed ones. New store
 *  fields are covered automatically; only per-device/UI fields must be excluded. */
function snapshotOf(state: object, exclude: readonly string[]): Snapshot {
    const out: Snapshot = {};
    for (const [k, v] of Object.entries(state)) {
        if (typeof v === 'function' || exclude.includes(k)) continue;
        out[k] = v;
    }
    return out;
}

function register<T extends object>(key: SyncStoreKey, store: StoreApi<T>, exclude: readonly string[] = []): void {
    registerHistoryStore(key, {
        getSnapshot: () => snapshotOf(store.getState(), exclude),
        // Merge, never replace — the actions and excluded fields stay as they are.
        applySnapshot: (snap) => store.setState(snap as Partial<T>),
    });
}

// activeLayoutId / editMode are per-device viewing state, not config. The active
// section/tab pointers live INSIDE layouts and ride along: undoing an edit made
// on another tab shows that tab again, which is what the user is looking for.
register('aura-dashboard', useDashboardStore, ['activeLayoutId', 'editMode']);
register('aura-theme', useThemeStore, ['adminThemeId']);
register('aura-groups', useGroupStore);
register('aura-config', useConfigStore);
register('aura-global-settings', useGlobalSettingsStore);
register('aura-popup-config', usePopupConfigStore);
register('aura-group-defs', useGroupDefsStore, ['hydrated']);
register('aura-widget-presets', useWidgetPresetsStore, ['hydrated']);

// Labels are computed lazily (a full tree diff per entry) and cached per entry;
// a merge into the top entry swaps its `after`, which invalidates the cache.
const labelCache = new WeakMap<HistoryEntry, { sig: unknown[]; details: BackupChangeDetail[] }>();

/** What an entry did, in the wording of the backup list ("Widget „X“ verschoben"). */
export function describeEntry(entry: HistoryEntry): BackupChangeDetail[] {
    const cached = labelCache.get(entry);
    if (
        cached &&
        cached.sig.length === entry.changes.length &&
        cached.sig.every((s, i) => s === entry.changes[i].after)
    ) {
        return cached.details;
    }
    const details: BackupChangeDetail[] = [];
    for (const change of entry.changes) {
        if (change.key === 'aura-dashboard') {
            const d = describeLayoutsChange(change.before.layouts, change.after.layouts);
            if (d.length > 0) {
                details.push(...d);
                continue;
            }
        }
        details.push({ store: change.key, kind: 'store-changed', label: change.key });
    }
    labelCache.set(entry, { sig: entry.changes.map((c) => c.after), details });
    return details;
}

/** Text fields keep the browser's own undo; everything else (checkbox, slider,
 *  colour, buttons, the page itself) hands Ctrl+Z to the editor history. */
export function isTextEditTarget(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file'].includes(type);
    }
    return false;
}

/** Ctrl/⌘+Z undo, Ctrl/⌘+Y and Ctrl/⌘+Shift+Z redo. Returns the uninstaller. */
export function installUndoRedoShortcuts(): () => void {
    const handler = (e: KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k !== 'z' && k !== 'y') return;
        if (isTextEditTarget(e.target)) return;
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo();
        else undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
}

export function useUndoRedoShortcuts(): void {
    useEffect(() => installUndoRedoShortcuts(), []);
}

// DEV only: lets tools/tests/admin-undo-sweep.mjs read the history and the dirty
// state from the real admin (no screenshot harness there). Stripped in production.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__auraEditHistory = {
        counts: () => {
            const s = useEditHistoryStore.getState();
            return { undo: s.undoCount, redo: s.redoCount, dirty: isDirty() };
        },
        keys: () => historyEntries().undo.map((e) => e.changes.map((c) => c.key)),
        undo,
        redo,
    };
}

// ── Defaults for keys that were never persisted ──────────────────────────────
// zustand's persist writes nothing on hydration when the key is absent — it only
// re-writes after a version migration. So on a fresh install, or for a store the
// user never touched (datapoint groups, global settings), the FIRST edit reaches
// managedStorage.setItem with current === null and is taken for the init write:
// not dirty, no original to revert to. The save bar stays disarmed, "Verwerfen"
// cannot reach it, and an undo back to the starting value is not recognised as
// "saved". Writing the defaults once, suppressed, gives every later edit a real
// predecessor. Keys that ioBroker holds are overwritten by loadConfigFromIoBroker
// right after, as before.
interface SeedableStore {
    setState(partial: object): void;
}
const PERSISTED_STORES: Array<[SyncStoreKey, SeedableStore]> = [
    ['aura-dashboard', useDashboardStore],
    ['aura-theme', useThemeStore],
    ['aura-groups', useGroupStore],
    ['aura-config', useConfigStore],
    ['aura-global-settings', useGlobalSettingsStore],
    ['aura-popup-config', usePopupConfigStore],
];
const seededDefaults = new Set<string>();

export function seedMissingPersistedKeys(): void {
    for (const [key, store] of PERSISTED_STORES) {
        let current: string | null = null;
        try {
            current = localStorage.getItem(key);
        } catch {
            continue;
        }
        if (current !== null) continue;
        // An empty merge re-runs persist's setItem with the current (default) state.
        withSuppressedDirty(() => store.setState({}));
        try {
            if (localStorage.getItem(key) !== null) seededDefaults.add(key);
        } catch {
            /* quota */
        }
    }
}

/** True while the key holds only the default this admin wrote for it — not user data. */
export function wasSeededDefault(key: string): boolean {
    return seededDefaults.has(key);
}

/** Record while the editor is mounted; drop everything when it goes away. */
export function useEditHistoryLifecycle(): void {
    useEffect(() => {
        seedMissingPersistedKeys();
        startEditHistory();
        return () => stopEditHistory();
    }, []);
}
