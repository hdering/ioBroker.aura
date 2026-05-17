import type { StateStorage } from 'zustand/middleware';
import {
  setStateDirect, getStateDirect,
  writeFileDirect, readFileDirect, readDirDirect, deleteFileDirect,
} from '../hooks/useIoBroker';

// Each localStorage key maps to its own ioBroker state (no more single blob).
// aura.0 prefix is consistent with the rest of the codebase.
export const IOBROKER_STATE_MAP = {
  'aura-dashboard':       'aura.0.config.dashboard',
  'aura-theme':           'aura.0.config.theme',
  'aura-groups':          'aura.0.config.groups',
  'aura-config':          'aura.0.config.app-config',
  'aura-global-settings': 'aura.0.config.global-settings',
  'aura-group-defs':      'aura.0.config.group-defs',
  'aura-popup-config':    'aura.0.config.popup-config',
} as const;

export type SyncStoreKey = keyof typeof IOBROKER_STATE_MAP;
const SYNC_STORE_KEYS = Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[];

// Legacy single-state DP. Kept for one-time migration; new backups go to files.
const IOBROKER_BACKUP_KEY = 'aura.0.config.dashboard_backup';

// File-based backup storage. Each backup is its own JSON file under the
// aura.0.backups meta namespace. Filename = ISO-Timestamp → sortable + readable.
// The meta object is created by the adapter in onReady (main.js).
const BACKUP_NAMESPACE = 'aura.0.backups';
const BACKUP_FILE_PREFIX = 'backup-';
const BACKUP_FILE_SUFFIX = '.json';

export const BACKUP_TS_KEY = '_ts';

function tsToFilename(ts: string): string {
  return `${BACKUP_FILE_PREFIX}${ts.replace(/[:.]/g, '-')}${BACKUP_FILE_SUFFIX}`;
}

export function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX);
}

// Persistent flag in localStorage marking a key as having unsaved edits.
// Survives F5 so loadConfigFromIoBroker can avoid overwriting unsaved work.
const DIRTY_PREFIX = '_aura_dirty:';
const dirtyFlagKey = (key: string) => DIRTY_PREFIX + key;

export function hasDirtyFlag(key: string): boolean {
  try { return localStorage.getItem(dirtyFlagKey(key)) === '1'; } catch { return false; }
}
function setDirtyFlag(key: string): void {
  try { localStorage.setItem(dirtyFlagKey(key), '1'); } catch { /* quota */ }
}
function clearDirtyFlag(key: string): void {
  try { localStorage.removeItem(dirtyFlagKey(key)); } catch { /* ignore */ }
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
  try { return fn(); } finally { suppressDirtyDepth--; }
}

function notify() { subscribers.forEach((fn) => fn()); }

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

const savedAtMap = new Map<string, number>();
/** Per-key recency check — narrowly suppresses the echo of our own ioBroker write. */
export function isSavingRecently(key?: string): boolean {
  if (key) return Date.now() - (savedAtMap.get(key) ?? 0) < 5000;
  for (const t of savedAtMap.values()) {
    if (Date.now() - t < 5000) return true;
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
    } catch { /* quota */ }
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
    if (key !== 'aura-group-defs') entry[key] = getRaw(key);
  });
  return entry;
}

// One-time migration from the legacy single-state backup blob to per-file
// backups. Runs at most once per page load (guarded by legacyMigrationDone)
// and is invoked from writeBackup and loadBackupFiles. Idempotent: if the
// legacy state is empty, returns immediately.
let legacyMigrationDone = false;
export async function migrateLegacyBackupState(): Promise<void> {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;
  try {
    const state = await getStateDirect(IOBROKER_BACKUP_KEY);
    if (!state?.val) return;
    const raw = String(state.val);
    if (raw.length < 3) return;
    let entries: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed.backups)) entries = parsed.backups as Array<Record<string, unknown>>;
      else if (parsed[BACKUP_TS_KEY]) entries = [parsed];
    } catch {
      console.warn('[aura backup] legacy state unparseable – skipping migration');
      return;
    }
    if (entries.length === 0) return;
    console.info(`[aura backup] migrating ${entries.length} entries from legacy state to files`);
    for (const e of entries) {
      const ts = String(e[BACKUP_TS_KEY] ?? new Date().toISOString());
      const filename = tsToFilename(ts);
      try {
        await writeFileDirect(BACKUP_NAMESPACE, filename, JSON.stringify(e));
      } catch (writeErr) {
        console.warn(`[aura backup] could not migrate entry ${ts}`, writeErr);
      }
    }
    // Clear legacy state – frees ~1-2 MB in ioBroker objectsDB.
    setStateDirect(IOBROKER_BACKUP_KEY, '', true);
    console.info('[aura backup] legacy state cleared');
  } catch (err) {
    console.warn('[aura backup] legacy migration failed', err);
  }
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

async function writeBackup(): Promise<void> {
  try {
    await migrateLegacyBackupState();
    const entry = buildBackupEntry();
    const ts = String(entry[BACKUP_TS_KEY]);
    const filename = tsToFilename(ts);
    const payload = JSON.stringify(entry);
    console.info(`[aura backup] writing ${BACKUP_NAMESPACE}/${filename} (${payload.length} bytes)`);
    await writeFileDirect(BACKUP_NAMESPACE, filename, payload);
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
}

// Returns metadata only — payloads are fetched on demand in loadBackupPayload.
export async function listBackupFiles(): Promise<BackupFileEntry[]> {
  await migrateLegacyBackupState();
  const files = await readDirDirect(BACKUP_NAMESPACE, '');
  return files
    .filter((f) => !f.isDir && isBackupFile(f.file))
    .sort((a, b) => b.file.localeCompare(a.file))
    .map((f) => {
      const stem = f.file.slice(BACKUP_FILE_PREFIX.length, -BACKUP_FILE_SUFFIX.length);
      // Reverse tsToFilename: 2026-05-17T14-23-11-456Z → 2026-05-17T14:23:11.456Z
      const ts = stem.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1-$2-$3T$4:$5:$6.$7Z');
      return { ts, filename: f.file, size: f.size };
    });
}

export async function loadBackupPayload(filename: string): Promise<Record<string, unknown> | null> {
  const raw = await readFileDirect(BACKUP_NAMESPACE, filename);
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch (err) {
    console.warn(`[aura backup] could not parse ${filename}`, err);
    return null;
  }
}

/**
 * Write store(s) to ioBroker. By default only writes keys that are dirty
 * (Fix 3 — avoids cross-browser overwrites from unrelated saves). Pass
 * `all: true` for the initial bootstrap that seeds an empty ioBroker.
 */
export function saveToIoBroker({ backup = true, all = false }: { backup?: boolean; all?: boolean } = {}): void {
  const now = Date.now();
  const targetKeys: SyncStoreKey[] = all
    ? SYNC_STORE_KEYS
    : SYNC_STORE_KEYS.filter(isPending);

  targetKeys.forEach((key) => {
    const raw = getRaw(key);
    if (raw) {
      setStateDirect(IOBROKER_STATE_MAP[key], raw);
      savedAtMap.set(key, now);
      clearDirtyFlag(key);
    }
    pending.delete(key);
  });
  originals.clear();
  notify();
  if (backup) void writeBackup();
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
    const suppress = suppressDirtyDepth > 0;
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
    try { localStorage.removeItem(name); } catch { /* ignore */ }
    clearDirtyFlag(name);
    pending.delete(name);
    originals.delete(name);
    notify();
  },
};
