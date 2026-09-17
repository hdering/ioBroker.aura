/**
 * Keeps the undo history across a reload of the admin.
 *
 * The live history holds object references; here every entry becomes a
 * structural patch (utils/refPatch) against the previous snapshot of its store,
 * plus one serialised base snapshot per store — the state before the first
 * recorded step. That is small enough for IndexedDB even with a 1 MB dashboard
 * (localStorage is off limits: its quota is already what keeps the group
 * children RAM-only).
 *
 * On restore the chain is replayed and its end state compared with what the
 * stores hold now (navigation pointers excluded). Any difference — a save from
 * another device, a migration, an edit the debounce did not get to write —
 * discards the whole record: undoing onto a base that no longer exists would
 * silently overwrite someone else's work. Redo is not kept; a reload is a point
 * of no return for it.
 *
 * The saved value each pending key had before its first edit rides along, so an
 * undo that lands on it after the reload disarms the save bar exactly as it does
 * within a session (persistManager's backToSaved).
 */
import { IOBROKER_STATE_MAP, getOriginal, isPending, seedOriginal } from './persistManager';
import {
    currentSnapshot,
    historyEntries,
    installHistory,
    isEditHistoryActive,
    useEditHistoryStore,
    type HistoryEntry,
    type Snapshot,
} from './editHistory';
import { applyPatch, diffSnapshots, type PatchOp } from '../utils/refPatch';
import { NS } from '../utils/namespace';

export interface PersistedChange {
    key: string;
    ops: PatchOp[];
}
export interface PersistedHistory {
    v: 1;
    ns: string;
    savedAt: number;
    /** Per store: serialised snapshot before the first entry that touches it. */
    base: Record<string, string>;
    /** Oldest first. */
    entries: Array<{ id: number; ts: number; label?: string; changes: PersistedChange[] }>;
    /** Per store: the saved value a pending key had before its first edit. */
    originals: Record<string, string | null>;
}

export interface HistoryStorage {
    get(ns: string): Promise<PersistedHistory | null>;
    put(ns: string, data: PersistedHistory | null): Promise<void>;
}

const DB_NAME = 'aura-edit-history';
const STORE_NAME = 'history';
/** Above this the record is not written — the history stays RAM-only. */
const MAX_BYTES = 25 * 1024 * 1024;
const DEBOUNCE_MS = 700;

function indexedDbStorage(): HistoryStorage | null {
    if (typeof indexedDB === 'undefined') return null;
    const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
        open().then(
            (db) =>
                new Promise<T>((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, mode);
                    const req = fn(tx.objectStore(STORE_NAME));
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                    tx.oncomplete = () => db.close();
                }),
        );
    return {
        get: (ns) => run<PersistedHistory | undefined>('readonly', (s) => s.get(ns)).then((v) => v ?? null),
        put: (ns, data) =>
            run<unknown>('readwrite', (s) => (data ? s.put(data, ns) : s.delete(ns)) as IDBRequest<unknown>).then(
                () => undefined,
            ),
    };
}

let storage: HistoryStorage | null | undefined;
function getStorage(): HistoryStorage | null {
    if (storage === undefined) storage = indexedDbStorage();
    return storage;
}
/** Tests inject an in-memory store; null disables persistence. */
export function configureHistoryStorage(s: HistoryStorage | null): void {
    storage = s;
}

const SYNC_KEYS = new Set(Object.keys(IOBROKER_STATE_MAP));

// Patches are recomputed only for entries whose `after` references changed —
// i.e. the top entry while keystrokes merge into it.
const opsCache = new WeakMap<HistoryEntry, { sig: unknown[]; changes: PersistedChange[] }>();
function changesOf(entry: HistoryEntry): PersistedChange[] {
    const cached = opsCache.get(entry);
    if (
        cached &&
        cached.sig.length === entry.changes.length &&
        cached.sig.every((s, i) => s === entry.changes[i].after)
    ) {
        return cached.changes;
    }
    const changes = entry.changes
        .filter((c) => SYNC_KEYS.has(c.key))
        .map((c) => ({ key: c.key, ops: diffSnapshots(c.before, c.after) }));
    opsCache.set(entry, { sig: entry.changes.map((c) => c.after), changes });
    return changes;
}

/** The live undo stack as a storable record; null when it would be too large. */
export function serializeHistory(): PersistedHistory | null {
    const live = [...historyEntries().undo].reverse();
    const base: Record<string, string> = {};
    const entries: PersistedHistory['entries'] = [];
    let bytes = 0;
    for (const e of live) {
        const changes = changesOf(e);
        for (const c of e.changes) {
            if (!SYNC_KEYS.has(c.key) || c.key in base) continue;
            base[c.key] = JSON.stringify(c.before);
            bytes += base[c.key].length;
        }
        for (const c of changes) bytes += JSON.stringify(c.ops).length;
        if (bytes > MAX_BYTES) return null;
        if (changes.length > 0) entries.push({ id: e.id, ts: e.ts, changes, ...(e.label ? { label: e.label } : {}) });
    }
    const originals: Record<string, string | null> = {};
    for (const key of Object.keys(base)) {
        const o = getOriginal(key);
        if (o !== undefined) originals[key] = o;
    }
    return { v: 1, ns: NS, savedAt: Date.now(), base, entries, originals };
}

// The active section/tab pointers live inside `layouts` and change with every
// click in the editor — never an entry, so the chain's end state legitimately
// differs from the store in exactly these fields.
function normalize(key: string, snap: Snapshot): string {
    if (key !== 'aura-dashboard') return JSON.stringify(snap);
    return JSON.stringify(snap, (k, v) => (k === 'activeSectionId' || k === 'activeTabId' ? undefined : v));
}

export type RestoreResult = 'restored' | 'empty' | 'stale' | 'skipped' | 'unavailable';

let restoring = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | null = null;

/**
 * Rebuild the stored history onto the current stores. Only when the live stack
 * is empty (a boot, or the reset after the config load) and only when the
 * replayed end state matches what the stores hold now.
 */
export async function restorePersistedHistory(): Promise<RestoreResult> {
    const s = getStorage();
    if (!s || !isEditHistoryActive()) return 'unavailable';
    if (historyEntries().undo.length > 0) return 'skipped';
    restoring = true;
    if (timer) {
        clearTimeout(timer);
        timer = undefined;
    }
    try {
        const data = await s.get(NS);
        if (!data || data.v !== 1 || data.ns !== NS || data.entries.length === 0) return 'empty';
        const cursor: Record<string, Snapshot> = {};
        for (const [key, raw] of Object.entries(data.base)) cursor[key] = JSON.parse(raw) as Snapshot;
        const entries: HistoryEntry[] = data.entries.map((e) => ({
            id: e.id,
            ts: e.ts,
            ...(e.label ? { label: e.label } : {}),
            changes: e.changes.map((c) => {
                const before = cursor[c.key];
                const after = applyPatch(before, c.ops) as Snapshot;
                cursor[c.key] = after;
                return { key: c.key, before, after };
            }),
        }));
        for (const key of Object.keys(cursor)) {
            const now = currentSnapshot(key);
            if (!now || normalize(key, now) !== normalize(key, cursor[key])) return 'stale';
        }
        // Still empty? Another restore or the user may have started editing meanwhile.
        if (historyEntries().undo.length > 0) return 'skipped';
        installHistory(entries);
        for (const [key, orig] of Object.entries(data.originals)) {
            if (isPending(key)) seedOriginal(key, orig);
        }
        return 'restored';
    } catch {
        return 'stale';
    } finally {
        restoring = false;
    }
}

/** Write the current stack now (debounce cancelled). */
export function flushHistoryPersistence(): void {
    if (timer) {
        clearTimeout(timer);
        timer = undefined;
    }
    if (restoring || !isEditHistoryActive()) return;
    const s = getStorage();
    if (!s) return;
    void s.put(NS, serializeHistory()).catch(() => {
        /* storage full or blocked — the history simply stays RAM-only */
    });
}

function schedule(): void {
    if (restoring || !isEditHistoryActive()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushHistoryPersistence, DEBOUNCE_MS);
}

/** Follow every history change with a debounced write; flush when the page hides. */
export function startHistoryPersistence(): void {
    if (unsubscribe) return;
    unsubscribe = useEditHistoryStore.subscribe(schedule);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flushHistoryPersistence);
}

/** Must run BEFORE stopEditHistory — the emptied stacks must not be written. */
export function stopHistoryPersistence(): void {
    unsubscribe?.();
    unsubscribe = null;
    if (timer) {
        clearTimeout(timer);
        timer = undefined;
    }
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flushHistoryPersistence);
}
