import type { StateStorage } from 'zustand/middleware';
import { setStateDirect, writeFileDirect, readFileDirect, readDirDirect, deleteFileDirect } from '../hooks/useIoBroker';
import { NS } from '../utils/namespace';

// Each localStorage key maps to its own ioBroker state (no more single blob).
// The {NS} prefix resolves to the running instance namespace (aura.0, aura.1…).
export const IOBROKER_STATE_MAP: Record<string, string> = {
    'aura-dashboard': `${NS}.config.dashboard`,
    'aura-theme': `${NS}.config.theme`,
    'aura-groups': `${NS}.config.groups`,
    'aura-config': `${NS}.config.app-config`,
    'aura-global-settings': `${NS}.config.global-settings`,
    'aura-group-defs': `${NS}.config.group-defs`,
    'aura-popup-config': `${NS}.config.popup-config`,
};

export type SyncStoreKey =
    | 'aura-dashboard'
    | 'aura-theme'
    | 'aura-groups'
    | 'aura-config'
    | 'aura-global-settings'
    | 'aura-group-defs'
    | 'aura-popup-config';
const SYNC_STORE_KEYS = Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[];

// File-based backup storage. Each backup is its own JSON file under the
// <ns>.backups meta namespace. Filename = ISO-Timestamp → sortable + readable.
// The meta object is created by the adapter in onReady (main.js).
const BACKUP_NAMESPACE = `${NS}.backups`;
const BACKUP_FILE_PREFIX = 'backup-';
// Legacy plain-JSON suffix (backups written before gzip) and the current
// gzip+base64 suffix. New backups are gzipped because the combined payload of
// all sync-stores grew past the socket.io frame limit (~1 MB) — an uncompressed
// writeFile of that size silently drops the websocket and the write never
// lands. Gzip shrinks ~960 KB → ~60 KB; base64 keeps it a plain text transfer.
const BACKUP_FILE_SUFFIX = '.json';
const BACKUP_FILE_SUFFIX_GZ = '.json.gz';

// ── gzip helpers (browser-native CompressionStream, base64 transport) ──────────
async function gzipToBase64(text: string): Promise<string> {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    const CHUNK = 0x8000; // chunk to avoid String.fromCharCode arg-count overflow
    for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

async function gunzipFromBase64(b64: string): Promise<string> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

/** Read a backup file and return its decoded JSON text, transparently
 *  decompressing the gzip+base64 format. Legacy plain-.json backups pass through. */
async function readBackupText(filename: string): Promise<string | null> {
    const raw = await readFileDirect(BACKUP_NAMESPACE, filename);
    if (raw == null) return null;
    if (filename.endsWith(BACKUP_FILE_SUFFIX_GZ)) {
        try {
            return await gunzipFromBase64(raw);
        } catch (err) {
            console.warn(`[aura backup] could not decompress ${filename}`, err);
            return null;
        }
    }
    return raw;
}

export const BACKUP_TS_KEY = '_ts';
// List of sync-store keys actually written in the save that produced this
// backup. Older backups predate this field → treated as empty (unknown).
export const BACKUP_CHANGED_KEY = '_changed';
// Structured, human-readable change descriptors (e.g. a moved widget). Only
// populated when a before-value is available (RAM original, same session).
export const BACKUP_DETAILS_KEY = '_details';

// One semantic change in a save. `label` is filled when exactly one entity of
// this kind changed; `count` when several were aggregated. The UI translates
// `kind` and interpolates label/count.
export interface BackupChangeDetail {
    store: string; // sync-store key, e.g. 'aura-dashboard'
    kind: string; // 'widget-moved' | 'tab-renamed' | 'store-changed' | …
    label?: string;
    count?: number;
}

function tsToFilename(ts: string): string {
    return `${BACKUP_FILE_PREFIX}${ts.replace(/[:.]/g, '-')}${BACKUP_FILE_SUFFIX_GZ}`;
}

export function isBackupFile(name: string): boolean {
    return (
        name.startsWith(BACKUP_FILE_PREFIX) &&
        (name.endsWith(BACKUP_FILE_SUFFIX_GZ) || name.endsWith(BACKUP_FILE_SUFFIX))
    );
}

// Persistent flag in localStorage marking a key as having unsaved edits.
// Survives F5 so loadConfigFromIoBroker can avoid overwriting unsaved work.
const DIRTY_PREFIX = '_aura_dirty:';
const dirtyFlagKey = (key: string) => DIRTY_PREFIX + key;

export function hasDirtyFlag(key: string): boolean {
    try {
        return localStorage.getItem(dirtyFlagKey(key)) === '1';
    } catch {
        return false;
    }
}
function setDirtyFlag(key: string): void {
    try {
        localStorage.setItem(dirtyFlagKey(key), '1');
    } catch {
        /* quota */
    }
}
function clearDirtyFlag(key: string): void {
    try {
        localStorage.removeItem(dirtyFlagKey(key));
    } catch {
        /* ignore */
    }
}
export { clearDirtyFlag };

let maxBackups = 5;
export function configureBackup(opts: { maxBackups: number }): void {
    maxBackups = Math.max(1, Math.min(20, opts.maxBackups));
}

// In-session edit tracker. pending = key → new value; originals = key → pre-edit
// value (for revert). Both are RAM-only; the _dirty flag in localStorage is the
// cross-session signal.
const pending = new Map<string, string>();
const originals = new Map<string, string | null>();
const subscribers = new Set<() => void>();

// External in-memory storage providers (e.g. aura-group-defs which skips localStorage).
const externalReaders = new Map<string, () => string | null>();
export function registerExternalReader(key: string, reader: () => string | null): void {
    externalReaders.set(key, reader);
}

// Pre-save hooks run at the very start of saveToIoBroker (after the hydration
// guard, before any key is serialised) so they can mutate stores and have the
// result land in this same save — e.g. GC orphaned group defs so they don't
// accumulate in the persisted aura-group-defs blob.
const preSaveHooks = new Set<() => void>();
export function registerPreSaveHook(fn: () => void): void {
    preSaveHooks.add(fn);
}
function runPreSaveHooks(): void {
    preSaveHooks.forEach((fn) => {
        try {
            fn();
        } catch (e) {
            console.warn('[persistManager] pre-save hook failed', e);
        }
    });
}

/** True when group-defs is safe to persist: either no RAM-only reader is
 *  registered, or the reader (serialise) currently returns data — i.e. the
 *  store has hydrated from ioBroker. When false, a save/backup would silently
 *  drop every group / panels child (serialise refuses while unhydrated), so
 *  callers must refuse to write rather than produce an incomplete snapshot. */
export function groupDefsReadyForSave(): boolean {
    const reader = externalReaders.get('aura-group-defs');
    return !reader || reader() != null;
}

/** Mark a key as dirty without buffering a value — used by RAM-only stores
 *  that provide their data via registerExternalReader at save time. */
export function markDirty(key: string): void {
    pending.set(key, '\x00'); // sentinel — replaced by externalReader at save time
    setDirtyFlag(key);
    notify();
}

// Navigation-only writes (e.g. activeTabId / activeLayoutId) update localStorage
// but must NOT mark the key dirty — switching tabs is per-device viewing state,
// not a config edit the user expects to "save" or "revert".
let suppressDirtyDepth = 0;
export function withSuppressedDirty<T>(fn: () => T): T {
    suppressDirtyDepth++;
    try {
        return fn();
    } finally {
        suppressDirtyDepth--;
    }
}

// Screenshot harness: when on, every persistence side-effect is disabled —
// managedStorage never marks a key dirty and saveToIoBroker is a no-op. This
// guarantees the documentation screenshot runs cannot write anything back to
// the (real) ioBroker instance the dev server proxies to.
let screenshotMode = false;
export function setScreenshotMode(on: boolean): void {
    screenshotMode = on;
}
export function isScreenshotMode(): boolean {
    return screenshotMode;
}

function notify() {
    subscribers.forEach((fn) => fn());
}

export function subscribeDirty(fn: () => void): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

/** True if any key has unsaved edits (in-session OR carried over from a previous session). */
export function isDirty(): boolean {
    if (pending.size > 0) return true;
    for (const key of SYNC_STORE_KEYS) {
        if (hasDirtyFlag(key)) return true;
    }
    return false;
}

/** Per-key dirty check — used by useConfigSync to gate inbound stateChange echoes. */
export function isPending(key: string): boolean {
    return pending.has(key) || hasDirtyFlag(key);
}

// Tracks the value we last wrote per key, with a TTL. The echo guard suppresses
// inbound stateChange iff (a) we wrote recently AND (b) the inbound value is
// byte-identical to what we wrote — i.e. it is actually our own echo, not a
// concurrent write from another tab/device that just happens to fall inside
// the 5 s window.
const savedAtMap = new Map<string, { ts: number; value: string }>();
const SAVED_TTL_MS = 5000;
/** Per-key recency check — suppresses the echo of our own ioBroker write only
 *  when the inbound value matches what we wrote. Callers that have the inbound
 *  raw value SHOULD pass it as `incomingValue`; otherwise the check falls back
 *  to a pure TTL gate (kept for the no-arg poll-fallback path). */
export function isSavingRecently(key?: string, incomingValue?: string): boolean {
    if (key) {
        const entry = savedAtMap.get(key);
        if (!entry) return false;
        if (Date.now() - entry.ts >= SAVED_TTL_MS) {
            savedAtMap.delete(key);
            return false;
        }
        if (incomingValue !== undefined && incomingValue !== entry.value) return false;
        return true;
    }
    for (const entry of savedAtMap.values()) {
        if (Date.now() - entry.ts < SAVED_TTL_MS) return true;
    }
    return false;
}

/** No-op: managedStorage.setItem now writes to localStorage immediately. */
export function flushKey(_key: string): void {
    notify();
}

/** No-op: managedStorage.setItem now writes to localStorage immediately. */
export function saveAll(): void {
    notify();
}

export function discardPending(): void {
    pending.clear();
    originals.clear();
    for (const key of SYNC_STORE_KEYS) clearDirtyFlag(key);
    notify();
}

export function discardPendingKey(key: string): void {
    pending.delete(key);
    originals.delete(key);
    clearDirtyFlag(key);
    notify();
}

export function revertAll(rehydrateFns: Array<() => void>): void {
    // Restore each pending key to its pre-edit value, if we still have the
    // original (originals is RAM-only; F5 wipes it). Then clear dirty flags.
    originals.forEach((orig, key) => {
        try {
            if (orig === null) localStorage.removeItem(key);
            else localStorage.setItem(key, orig);
        } catch {
            /* quota */
        }
        clearDirtyFlag(key);
    });
    // Also clear any dirty flag we don't have an original for (cross-session
    // unsaved edits) — revert intent is "back to last-saved", which is whatever
    // ioBroker still has; next loadConfigFromIoBroker will pull it.
    for (const key of SYNC_STORE_KEYS) clearDirtyFlag(key);
    pending.clear();
    originals.clear();
    rehydrateFns.forEach((fn) => fn());
    notify();
}

/** Read raw value for a key: externalReader (if registered) → pending → localStorage */
function getRaw(key: SyncStoreKey): string | null {
    const external = externalReaders.get(key)?.();
    if (external !== undefined && external !== null) return external;
    const p = pending.get(key);
    if (p && p !== '\x00') return p;
    return localStorage.getItem(key) ?? null;
}

function buildBackupEntry(): Record<string, unknown> {
    const entry: Record<string, unknown> = { [BACKUP_TS_KEY]: new Date().toISOString() };
    SYNC_STORE_KEYS.forEach((key) => {
        const val = getRaw(key);
        if (val !== null) entry[key] = val;
    });
    return entry;
}

/** Public snapshot of all sync stores in the auto-backup payload shape.
 *  Used by the manual "download backup" button so its files match the auto-backup
 *  format and can be restored through applyBackupPayload. */
export function buildBackupPayload(): Record<string, unknown> {
    return buildBackupEntry();
}

// ── Change detail diffing ─────────────────────────────────────────────────────
// Minimal structural shapes for the dashboard store payload. Kept local (not
// imported from dashboardStore) to avoid a module cycle; only the fields we
// diff are typed.
interface WidgetLite {
    id?: string;
    type?: string;
    title?: string;
    datapoint?: string;
    gridPos?: { x?: number; y?: number; w?: number; h?: number };
    options?: { echartSeries?: unknown[] } & Record<string, unknown>;
}
interface TabLite {
    id?: string;
    name?: string;
    widgets?: WidgetLite[];
}
interface LayoutLite {
    id?: string;
    name?: string;
    tabs?: TabLite[];
}

type RawChange = { kind: string; label?: string };

function parseLayouts(raw: string): LayoutLite[] | null {
    try {
        const obj = JSON.parse(raw) as { state?: { layouts?: unknown } };
        const layouts = obj?.state?.layouts;
        return Array.isArray(layouts) ? (layouts as LayoutLite[]) : null;
    } catch {
        return null;
    }
}

function widgetLabel(w: WidgetLite): string {
    return (w.title && w.title.trim()) || w.type || 'Widget';
}

function gridChanged(a?: WidgetLite['gridPos'], b?: WidgetLite['gridPos']): boolean {
    return a?.x !== b?.x || a?.y !== b?.y || a?.w !== b?.w || a?.h !== b?.h;
}

// True when anything other than gridPos differs (title, datapoint, options…).
function widgetEdited(a: WidgetLite, b: WidgetLite): boolean {
    return JSON.stringify({ ...a, gridPos: undefined }) !== JSON.stringify({ ...b, gridPos: undefined });
}

// Scan all option keys (except echartSeries, handled with nicer wording) for
// array values whose length changed → a list item was added/removed. Type-
// agnostic, so any widget that stores a list in options benefits with no rule.
function optionArrayDelta(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
): { added: boolean; removed: boolean } {
    const bo = before ?? {};
    const ao = after ?? {};
    let added = false;
    let removed = false;
    new Set([...Object.keys(bo), ...Object.keys(ao)]).forEach((k) => {
        if (k === 'echartSeries') return;
        const bv = bo[k];
        const av = ao[k];
        if (Array.isArray(bv) && Array.isArray(av) && bv.length !== av.length) {
            if (av.length > bv.length) added = true;
            else removed = true;
        }
    });
    return { added, removed };
}

function diffWidgets(before: WidgetLite[], after: WidgetLite[], out: RawChange[]): void {
    const beforeById = new Map(before.filter((w) => w.id).map((w) => [w.id, w]));
    const afterById = new Map(after.filter((w) => w.id).map((w) => [w.id, w]));
    after.forEach((w) => {
        if (w.id && !beforeById.has(w.id)) out.push({ kind: 'widget-added', label: widgetLabel(w) });
    });
    before.forEach((w) => {
        if (w.id && !afterById.has(w.id)) out.push({ kind: 'widget-removed', label: widgetLabel(w) });
    });
    after.forEach((wa) => {
        const wb = wa.id ? beforeById.get(wa.id) : undefined;
        if (!wb) return;
        if (gridChanged(wb.gridPos, wa.gridPos)) out.push({ kind: 'widget-moved', label: widgetLabel(wa) });
        if (!widgetEdited(wb, wa)) return; // only gridPos changed (or nothing)
        const label = widgetLabel(wa);
        let specific = false;
        if ((wb.datapoint ?? '') !== (wa.datapoint ?? '')) {
            out.push({ kind: 'widget-dp', label });
            specific = true;
        }
        if ((wb.title ?? '') !== (wa.title ?? '')) {
            out.push({ kind: 'widget-renamed', label });
            specific = true;
        }
        // EChart series live in options.echartSeries — a length change means a
        // series was added/removed (reordering/editing falls through to generic).
        const sb = Array.isArray(wb.options?.echartSeries) ? wb.options!.echartSeries!.length : -1;
        const sa = Array.isArray(wa.options?.echartSeries) ? wa.options!.echartSeries!.length : -1;
        if (sb !== -1 && sa !== -1 && sb !== sa) {
            out.push({ kind: sa > sb ? 'series-added' : 'series-removed', label });
            specific = true;
        }
        // Generic: any OTHER array-valued option whose length changed means a
        // list item was added/removed. Works for every widget type (autolist
        // entries, table columns, conditions, media sources…) with no per-type
        // rule — echartSeries is excluded above as it has nicer wording.
        const delta = optionArrayDelta(wb.options, wa.options);
        if (delta.added) {
            out.push({ kind: 'widget-item-added', label });
            specific = true;
        }
        if (delta.removed) {
            out.push({ kind: 'widget-item-removed', label });
            specific = true;
        }
        // Anything else (scalar options, mobileOrder, type) → generic.
        if (!specific) out.push({ kind: 'widget-edited', label });
    });
}

function diffTabs(before: TabLite[], after: TabLite[], out: RawChange[]): void {
    const beforeById = new Map(before.filter((t) => t.id).map((t) => [t.id, t]));
    const afterById = new Map(after.filter((t) => t.id).map((t) => [t.id, t]));
    after.forEach((t) => {
        if (t.id && !beforeById.has(t.id)) out.push({ kind: 'tab-added', label: t.name });
    });
    before.forEach((t) => {
        if (t.id && !afterById.has(t.id)) out.push({ kind: 'tab-removed', label: t.name });
    });
    after.forEach((ta) => {
        const tb = ta.id ? beforeById.get(ta.id) : undefined;
        if (!tb) return;
        if (ta.name !== tb.name) out.push({ kind: 'tab-renamed', label: ta.name });
        diffWidgets(tb.widgets ?? [], ta.widgets ?? [], out);
    });
}

function diffDashboard(beforeRaw: string, afterRaw: string): RawChange[] {
    const before = parseLayouts(beforeRaw);
    const after = parseLayouts(afterRaw);
    if (!before || !after) return [];
    const out: RawChange[] = [];
    const beforeById = new Map(before.filter((l) => l.id).map((l) => [l.id, l]));
    const afterById = new Map(after.filter((l) => l.id).map((l) => [l.id, l]));
    after.forEach((l) => {
        if (l.id && !beforeById.has(l.id)) out.push({ kind: 'layout-added', label: l.name });
    });
    before.forEach((l) => {
        if (l.id && !afterById.has(l.id)) out.push({ kind: 'layout-removed', label: l.name });
    });
    after.forEach((la) => {
        const lb = la.id ? beforeById.get(la.id) : undefined;
        if (!lb) return;
        if (la.name !== lb.name) out.push({ kind: 'layout-renamed', label: la.name });
        diffTabs(lb.tabs ?? [], la.tabs ?? [], out);
    });
    return out;
}

// Collapse raw changes per kind: one entity → keep its label; several → count.
function aggregate(store: string, raw: RawChange[]): BackupChangeDetail[] {
    const byKind = new Map<string, RawChange[]>();
    raw.forEach((r) => {
        const list = byKind.get(r.kind);
        if (list) list.push(r);
        else byKind.set(r.kind, [r]);
    });
    const out: BackupChangeDetail[] = [];
    byKind.forEach((list, kind) => {
        if (list.length === 1) out.push({ store, kind, label: list[0].label });
        else out.push({ store, kind, count: list.length });
    });
    return out;
}

// Produce change details for one saved key. `before === undefined` means no
// pre-save value is available (e.g. after F5) → coarse store-level fallback.
function summarizeKeyChange(key: SyncStoreKey, before: string | null | undefined, after: string): BackupChangeDetail[] {
    if (key === 'aura-dashboard' && typeof before === 'string') {
        const details = aggregate(key, diffDashboard(before, after));
        if (details.length > 0) return details;
    }
    return [{ store: key, kind: 'store-changed', label: key }];
}

async function pruneOldBackups(): Promise<number> {
    const files = await readDirDirect(BACKUP_NAMESPACE, '');
    const backupFiles = files
        .filter((f) => !f.isDir && isBackupFile(f.file))
        // Filename is ISO-timestamp → newest sorts last alphabetically, reverse it.
        .sort((a, b) => b.file.localeCompare(a.file));
    if (backupFiles.length <= maxBackups) return 0;
    const toDelete = backupFiles.slice(maxBackups);
    for (const f of toDelete) {
        await deleteFileDirect(BACKUP_NAMESPACE, f.file);
    }
    return toDelete.length;
}

async function writeBackup(changedKeys: SyncStoreKey[] = [], details: BackupChangeDetail[] = []): Promise<void> {
    try {
        const entry = buildBackupEntry();
        entry[BACKUP_CHANGED_KEY] = changedKeys;
        entry[BACKUP_DETAILS_KEY] = details;
        const ts = String(entry[BACKUP_TS_KEY]);
        const filename = tsToFilename(ts);
        const payload = JSON.stringify(entry);
        // Gzip+base64 before writing — a raw ~1 MB writeFile exceeds the socket.io
        // frame limit and drops the connection without acknowledging the write.
        const compressed = await gzipToBase64(payload);
        console.info(
            `[aura backup] writing ${BACKUP_NAMESPACE}/${filename} (${payload.length} → ${compressed.length} bytes gzip+base64)`,
        );
        await writeFileDirect(BACKUP_NAMESPACE, filename, compressed);
        console.info('[aura backup] write acknowledged');
        const pruned = await pruneOldBackups();
        if (pruned > 0) console.info(`[aura backup] pruned ${pruned} old backup file(s) (cap ${maxBackups})`);
    } catch (err) {
        console.error('[aura backup] write failed', err);
    }
}

export interface BackupFileEntry {
    ts: string;
    filename: string;
    size: number;
    // Sync-store keys written in the save that produced this backup. Empty for
    // backups created before the field existed (→ UI shows nothing extra).
    changed: string[];
    // Structured per-entity changes (moved widget, renamed tab…). Empty for
    // pre-Stufe-2 backups → UI falls back to the coarse `changed` labels.
    details: BackupChangeDetail[];
}

// Reads each backup's payload to extract its _changed list (cap ≤ 20 small
// files). Payloads are otherwise fetched on demand in loadBackupPayload.
export async function listBackupFiles(): Promise<BackupFileEntry[]> {
    const files = await readDirDirect(BACKUP_NAMESPACE, '');
    const backupFiles = files
        .filter((f) => !f.isDir && isBackupFile(f.file))
        .sort((a, b) => b.file.localeCompare(a.file));
    return Promise.all(
        backupFiles.map(async (f) => {
            const suffix = f.file.endsWith(BACKUP_FILE_SUFFIX_GZ) ? BACKUP_FILE_SUFFIX_GZ : BACKUP_FILE_SUFFIX;
            const stem = f.file.slice(BACKUP_FILE_PREFIX.length, -suffix.length);
            // Reverse tsToFilename: 2026-05-17T14-23-11-456Z → 2026-05-17T14:23:11.456Z
            const ts = stem.replace(
                /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
                '$1-$2-$3T$4:$5:$6.$7Z',
            );
            let changed: string[] = [];
            let details: BackupChangeDetail[] = [];
            try {
                const raw = await readBackupText(f.file);
                if (raw) {
                    const parsed = JSON.parse(raw) as Record<string, unknown>;
                    const c = parsed[BACKUP_CHANGED_KEY];
                    if (Array.isArray(c)) changed = c.filter((x): x is string => typeof x === 'string');
                    const d = parsed[BACKUP_DETAILS_KEY];
                    if (Array.isArray(d)) {
                        details = d.filter(
                            (x): x is BackupChangeDetail =>
                                !!x && typeof x === 'object' && typeof (x as BackupChangeDetail).kind === 'string',
                        );
                    }
                }
            } catch {
                /* unreadable/old backup — leave changed/details empty */
            }
            return { ts, filename: f.file, size: f.size, changed, details };
        }),
    );
}

export async function loadBackupPayload(filename: string): Promise<Record<string, unknown> | null> {
    const raw = await readBackupText(filename);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
        console.warn(`[aura backup] could not parse ${filename}`, err);
        return null;
    }
}

/**
 * Write store(s) to ioBroker. By default only writes keys that are dirty
 * (Fix 3 — avoids cross-browser overwrites from unrelated saves). Pass
 * `all: true` for the initial bootstrap that seeds an empty ioBroker.
 */
export function saveToIoBroker({ backup = true, all = false }: { backup?: boolean; all?: boolean } = {}): boolean {
    // Screenshot harness active → never write to the real ioBroker instance.
    if (screenshotMode) return false;
    // Refuse to write while group-defs is unhydrated — otherwise this save (and
    // its backup) would omit every group / panels child and a later restore
    // would bring them back empty.
    if (!groupDefsReadyForSave()) {
        console.warn(
            '[persistManager] saveToIoBroker aborted — aura-group-defs not hydrated; refusing to write incomplete config/backup',
        );
        return false;
    }
    // Let registered hooks (e.g. group-def GC) tidy stores before we snapshot, so
    // their changes are part of this save and the dirty keys they touch are picked
    // up by the targetKeys computation below.
    runPreSaveHooks();
    const now = Date.now();
    const targetKeys: SyncStoreKey[] = all ? SYNC_STORE_KEYS : SYNC_STORE_KEYS.filter(isPending);

    const changedKeys: SyncStoreKey[] = [];
    const details: BackupChangeDetail[] = [];
    targetKeys.forEach((key) => {
        const raw = getRaw(key);
        if (raw) {
            // Pre-save value (RAM only) for diffing; undefined → no before available.
            const before = originals.has(key) ? originals.get(key) : undefined;
            // ack=true: these are owned config-storage blobs (current values), not
            // pending commands, so they should land acknowledged rather than as an
            // unconfirmed client write that no adapter ever acks.
            setStateDirect(IOBROKER_STATE_MAP[key], raw, true);
            savedAtMap.set(key, { ts: now, value: raw });
            clearDirtyFlag(key);
            changedKeys.push(key);
            details.push(...summarizeKeyChange(key, before, raw));
        }
        pending.delete(key);
    });
    originals.clear();
    notify();
    if (backup) void writeBackup(changedKeys, details);
    return true;
}

export const managedStorage: StateStorage = {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
        const current = localStorage.getItem(name);
        if (current === value) {
            // No-op write (e.g. Zustand re-persisting the same state after rehydrate).
            // While suppressing dirty (navigation write), don't disturb existing pending
            // state — there may be unsaved real edits that must remain pending.
            if (suppressDirtyDepth === 0) {
                pending.delete(name);
                originals.delete(name);
                clearDirtyFlag(name);
            }
            notify();
            return;
        }
        // current === null means this is the very first write to this key —
        // i.e. Zustand persist initializing defaults on a fresh install. Do NOT
        // mark dirty for that, otherwise a new device with empty localStorage
        // would see _dirty=1 on every store and refuse to load remote config.
        const isInit = current === null;
        const suppress = suppressDirtyDepth > 0 || screenshotMode;
        try {
            localStorage.setItem(name, value);
            if (!isInit && !suppress) setDirtyFlag(name);
        } catch {
            console.warn('[persistManager] localStorage quota exceeded for key:', name);
        }
        if (!isInit && !suppress) {
            if (!pending.has(name)) originals.set(name, current);
            pending.set(name, value);
        }
        notify();
    },
    removeItem: (name) => {
        try {
            localStorage.removeItem(name);
        } catch {
            /* ignore */
        }
        clearDirtyFlag(name);
        pending.delete(name);
        originals.delete(name);
        notify();
    },
};
