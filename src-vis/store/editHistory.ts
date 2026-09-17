/**
 * Step-wise undo/redo for the admin editor.
 *
 * Every editor input writes straight into a zustand store, and the persist
 * middleware then calls `managedStorage.setItem` synchronously — so that one
 * place already knows whether a write changed anything and whether it was a
 * user edit (navigation, hydration and the vault merge run inside
 * `withSuppressedDirty`). persistManager reports both cases here:
 * `recordChange` for a real edit, `resyncHistoryKey` for everything else.
 *
 * A history entry holds object references to the store's config part before
 * and after the edit — no serialised copies. Store states are immutable spread
 * copies, so unchanged subtrees are shared and a hundred entries cost little.
 * Undo/redo put a snapshot back through the store's own setState, so the
 * persist → dirty bookkeeping runs exactly as for a hand-made edit.
 *
 * Not a command pattern: the dashboard store alone has ~70 actions, and the
 * inverse of each would have to be maintained by hand.
 *
 * The stores register themselves in editHistorySetup.ts; this module must not
 * import any store (persistManager imports it, the stores import persistManager).
 */
import { create } from 'zustand';

/** A sync-store key (aura-dashboard, …) or an adapter-owned external key such as
 *  the message defaults — anything persistManager tracks as pending. */
export type HistoryKey = string;

export type Snapshot = Record<string, unknown>;

export interface HistoryStoreAdapter {
    /** The store's config fields. Field references are stable while nothing changed. */
    getSnapshot: () => Snapshot;
    /** Merge a snapshot back through the store's own setState. */
    applySnapshot: (snap: Snapshot) => void;
}

export interface HistoryChange {
    key: HistoryKey;
    before: Snapshot;
    after: Snapshot;
}

export interface HistoryEntry {
    id: number;
    ts: number;
    changes: HistoryChange[];
    /** Set after undo/redo so the next edit never merges into this entry. */
    sealed?: boolean;
}

/** Entries kept per stack. Structural sharing keeps this cheap; only bulk
 *  operations (import, rescale) copy a whole tree. */
export const HISTORY_LIMIT = 100;
/** Consecutive edits of the same store inside this window merge into one entry —
 *  typing a title, dragging a colour picker or a slider becomes a single step. */
export const COALESCE_MS = 800;
/** Writes to different stores this close together come from ONE user action (a
 *  control that updates two stores synchronously) — no human makes two edits in it. */
export const SAME_ACTION_MS = 40;

const adapters = new Map<HistoryKey, HistoryStoreAdapter>();
const lastAccepted = new Map<HistoryKey, Snapshot>();
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let active = false;
let restoring = false;
let groupDepth = 0;
let attachedDepth = 0;
let nextId = 1;

export type HistoryNotice = 'remote';

interface EditHistoryUi {
    undoCount: number;
    redoCount: number;
    /** Bumps on every change — a merge into the top entry included — so a list
     *  of entries re-renders even when the counts stay the same. */
    version: number;
    /** 'remote': entries were dropped because another device/client changed a store. */
    notice: HistoryNotice | null;
}

/** Small UI store so the save bar re-renders when the stacks change. */
export const useEditHistoryStore = create<EditHistoryUi>()(() => ({
    undoCount: 0,
    redoCount: 0,
    version: 0,
    notice: null,
}));

function publish(): void {
    useEditHistoryStore.setState((s) => ({
        undoCount: undoStack.length,
        redoCount: redoStack.length,
        version: s.version + 1,
    }));
}

export function registerHistoryStore(key: HistoryKey, adapter: HistoryStoreAdapter): void {
    adapters.set(key, adapter);
    if (active) lastAccepted.set(key, adapter.getSnapshot());
}

function sameSnapshot(a: Snapshot | undefined, b: Snapshot): boolean {
    if (!a) return false;
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    for (const k of ak) {
        if (!(k in b) || a[k] !== b[k]) return false;
    }
    return true;
}

function addChange(entry: HistoryEntry, key: HistoryKey, before: Snapshot, after: Snapshot): void {
    const existing = entry.changes.find((c) => c.key === key);
    if (existing) existing.after = after;
    else entry.changes.push({ key, before, after });
}

function push(entry: HistoryEntry): void {
    redoStack = [];
    undoStack.push(entry);
    if (undoStack.length > HISTORY_LIMIT) undoStack.splice(0, undoStack.length - HISTORY_LIMIT);
    publish();
}

function attachToTop(changes: HistoryChange[]): void {
    const top = undoStack[undoStack.length - 1];
    // Nothing to attach to → not undoable, which is right: there is no user
    // action this side effect belongs to.
    if (!top) return;
    changes.forEach((c) => addChange(top, c.key, c.before, c.after));
    publish();
}

/**
 * A store's persisted value changed through a user edit. Called by
 * persistManager (managedStorage.setItem / markDirty) — never directly.
 */
export function recordChange(key: HistoryKey): void {
    if (!active) return;
    const adapter = adapters.get(key);
    if (!adapter) return;
    const after = adapter.getSnapshot();
    if (restoring) {
        lastAccepted.set(key, after);
        return;
    }
    // Inside a group the entry is built when the group closes.
    if (groupDepth > 0) return;
    const before = lastAccepted.get(key);
    lastAccepted.set(key, after);
    if (!before || sameSnapshot(before, after)) return;
    if (attachedDepth > 0) {
        attachToTop([{ key, before, after }]);
        return;
    }
    const now = Date.now();
    const top = undoStack[undoStack.length - 1];
    if (top && !top.sealed) {
        // One user action that writes several stores — a grid setting that lives on
        // the layout AND in the frontend config — arrives as separate setItem calls
        // in the same tick. One step, not two.
        if (now - top.ts < SAME_ACTION_MS) {
            addChange(top, key, before, after);
            top.ts = now;
            redoStack = [];
            publish();
            return;
        }
        if (now - top.ts < COALESCE_MS && top.changes.length === 1 && top.changes[0].key === key) {
            top.changes[0].after = after;
            top.ts = now;
            redoStack = [];
            publish();
            return;
        }
    }
    push({ id: nextId++, ts: now, changes: [{ key, before, after }] });
}

/**
 * The store changed without a user edit (navigation, hydration, inbound sync,
 * vault merge): take the new state as the base for the next entry. Otherwise
 * the next undo would also roll back what came in from outside.
 */
export function resyncHistoryKey(key: HistoryKey): void {
    if (!active || groupDepth > 0) return;
    const adapter = adapters.get(key);
    if (adapter) lastAccepted.set(key, adapter.getSnapshot());
}

/**
 * Everything `fn` changes — across any number of stores — becomes ONE entry.
 * Also the way to record a change that bypasses managedStorage (a rehydrate
 * from localStorage): the group compares every store on close.
 */
export function historyGroup<T>(fn: () => T): T {
    if (!active) return fn();
    groupDepth++;
    try {
        return fn();
    } finally {
        groupDepth--;
        if (groupDepth === 0) closeGroup();
    }
}

function closeGroup(): void {
    const changes: HistoryChange[] = [];
    adapters.forEach((adapter, key) => {
        const after = adapter.getSnapshot();
        const before = lastAccepted.get(key);
        lastAccepted.set(key, after);
        if (before && !sameSnapshot(before, after)) changes.push({ key, before, after });
    });
    if (restoring || changes.length === 0) return;
    if (attachedDepth > 0) {
        attachToTop(changes);
        return;
    }
    push({ id: nextId++, ts: Date.now(), changes });
}

/**
 * Changes inside `fn` are folded into the previous entry instead of forming
 * their own. For side effects that follow from an earlier user action — the
 * save-time GC of orphaned group definitions: undoing the widget removal must
 * bring the group's children back with it, not leave a dangling defId.
 */
export function historyAttached<T>(fn: () => T): T {
    attachedDepth++;
    try {
        return fn();
    } finally {
        attachedDepth--;
    }
}

function apply(entry: HistoryEntry, side: 'before' | 'after'): void {
    restoring = true;
    try {
        const changes = side === 'before' ? [...entry.changes].reverse() : entry.changes;
        for (const c of changes) {
            const adapter = adapters.get(c.key);
            if (!adapter) continue;
            adapter.applySnapshot(c[side]);
            lastAccepted.set(c.key, adapter.getSnapshot());
        }
    } finally {
        restoring = false;
    }
}

function sealTop(): void {
    const top = undoStack[undoStack.length - 1];
    if (top) top.sealed = true;
}

export function undo(): boolean {
    const entry = undoStack.pop();
    if (!entry) return false;
    apply(entry, 'before');
    entry.sealed = true;
    redoStack.push(entry);
    sealTop();
    publish();
    return true;
}

export function redo(): boolean {
    const entry = redoStack.pop();
    if (!entry) return false;
    apply(entry, 'after');
    entry.sealed = true;
    undoStack.push(entry);
    publish();
    return true;
}

export function canUndo(): boolean {
    return undoStack.length > 0;
}

export function canRedo(): boolean {
    return redoStack.length > 0;
}

export function peekUndo(): HistoryEntry | undefined {
    return undoStack[undoStack.length - 1];
}

export function peekRedo(): HistoryEntry | undefined {
    return redoStack[redoStack.length - 1];
}

/** Both stacks, newest first — for a history list. */
export function historyEntries(): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
    return { undo: [...undoStack].reverse(), redo: [...redoStack].reverse() };
}

/** A registered store's current config snapshot (persistence, tests). */
export function currentSnapshot(key: HistoryKey): Snapshot | undefined {
    return adapters.get(key)?.getSnapshot();
}

/**
 * Replace the undo stack with entries rebuilt from storage (oldest first); redo
 * is cleared. The entries come sealed so the next edit starts a step of its own,
 * and the stores' current state becomes the base for it.
 */
export function installHistory(entries: HistoryEntry[]): void {
    undoStack = entries.slice(-HISTORY_LIMIT).map((e) => ({ ...e, sealed: true }));
    redoStack = [];
    for (const e of undoStack) nextId = Math.max(nextId, e.id + 1);
    adapters.forEach((adapter, key) => lastAccepted.set(key, adapter.getSnapshot()));
    publish();
}

/** Forget every entry and take the current stores as the new base — after the
 *  boot load, and whenever the whole config was replaced from outside. */
export function resetEditHistory(): void {
    undoStack = [];
    redoStack = [];
    adapters.forEach((adapter, key) => lastAccepted.set(key, adapter.getSnapshot()));
    publish();
}

/**
 * Another device/client wrote this store (inbound sync). Entries touching the
 * key are dropped — undoing across someone else's save is undefined and would
 * overwrite their work on the next save — and the key is re-based.
 */
export function invalidateHistoryKey(key: HistoryKey): void {
    if (!active) return;
    const adapter = adapters.get(key);
    if (adapter) lastAccepted.set(key, adapter.getSnapshot());
    const keep = (e: HistoryEntry) => !e.changes.some((c) => c.key === key);
    const total = undoStack.length + redoStack.length;
    undoStack = undoStack.filter(keep);
    redoStack = redoStack.filter(keep);
    if (undoStack.length + redoStack.length !== total) useEditHistoryStore.setState({ notice: 'remote' });
    publish();
}

export function clearHistoryNotice(): void {
    useEditHistoryStore.setState({ notice: null });
}

/** Recording is on only while the admin editor is mounted — the frontend uses
 *  the same stores (timer schedule, auto-list sync) and must not keep a history. */
export function startEditHistory(): void {
    active = true;
    resetEditHistory();
}

export function stopEditHistory(): void {
    active = false;
    undoStack = [];
    redoStack = [];
    publish();
}

export function isEditHistoryActive(): boolean {
    return active;
}
