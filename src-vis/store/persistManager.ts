import type { StateStorage } from 'zustand/middleware';
import { setStateDirect, getStateDirect } from '../hooks/useIoBroker';

// Each localStorage key maps to its own ioBroker state (no more single blob).
// aura.0 prefix is consistent with the rest of the codebase.
export const IOBROKER_STATE_MAP = {
  'aura-dashboard':       'aura.0.config.dashboard',
  'aura-theme':           'aura.0.config.theme',
  'aura-groups':          'aura.0.config.groups',
  'aura-config':          'aura.0.config.app-config',
  'aura-global-settings': 'aura.0.config.global-settings',
  'aura-group-defs':      'aura.0.config.group-defs',
} as const;

export type SyncStoreKey = keyof typeof IOBROKER_STATE_MAP;
const SYNC_STORE_KEYS = Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[];

const IOBROKER_BACKUP_KEY = 'aura.0.config.dashboard_backup';

export const BACKUP_TS_KEY = '_ts';

let maxBackups = 5;
export function configureBackup(opts: { maxBackups: number }): void {
  maxBackups = Math.max(1, Math.min(20, opts.maxBackups));
}

const pending = new Map<string, string>();
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
  notify();
}

function notify() { subscribers.forEach((fn) => fn()); }

export function subscribeDirty(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function isDirty(): boolean { return pending.size > 0; }

let savedAt = 0;
export function isSavingRecently(): boolean { return Date.now() - savedAt < 5000; }

export function flushKey(key: string): void {
  const value = pending.get(key);
  if (value !== undefined) {
    try { localStorage.setItem(key, value); }
    catch { console.warn('[persistManager] localStorage quota exceeded for key:', key); }
    pending.delete(key);
    notify();
  }
}

export function saveAll(): void {
  pending.forEach((val, key) => {
    try { localStorage.setItem(key, val); pending.delete(key); }
    catch { console.warn('[persistManager] localStorage quota exceeded for key:', key, '— will sync to ioBroker only'); }
  });
  notify();
}

export function discardPending(): void {
  pending.clear();
  notify();
}

export function revertAll(rehydrateFns: Array<() => void>): void {
  pending.clear();
  rehydrateFns.forEach((fn) => fn());
  notify();
}

/** Read raw value for a key: externalReader (if registered) → pending → localStorage */
function getRaw(key: SyncStoreKey): string | null {
  // externalReaders always have the live in-memory value — prefer over pending sentinel
  const external = externalReaders.get(key)?.();
  if (external !== undefined && external !== null) return external;
  const p = pending.get(key);
  if (p && p !== '\x00') return p;
  return localStorage.getItem(key) ?? null;
}

async function writeBackup(): Promise<void> {
  try {
    const state = await getStateDirect(IOBROKER_BACKUP_KEY);
    let backups: Array<Record<string, unknown>> = [];
    if (state?.val) {
      const raw = String(state.val);
      if (raw.length < 500_000) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (Array.isArray(parsed.backups)) {
            backups = (parsed.backups as Array<Record<string, unknown>>).map((e) => {
              const { 'aura-group-defs': _gd, ...rest } = e;
              return rest;
            });
          } else if (parsed[BACKUP_TS_KEY]) {
            const { 'aura-group-defs': _gd, ...rest } = parsed;
            backups = [rest];
          }
        } catch { /* start fresh */ }
      }
    }
    // Collect current values for backup (exclude group-defs — too large)
    const entry: Record<string, unknown> = { [BACKUP_TS_KEY]: new Date().toISOString() };
    SYNC_STORE_KEYS.forEach((key) => {
      if (key !== 'aura-group-defs') entry[key] = getRaw(key);
    });
    backups = [entry, ...backups].slice(0, maxBackups);
    setStateDirect(IOBROKER_BACKUP_KEY, JSON.stringify({ backups }), true);
  } catch { /* socket not connected – silently skip */ }
}

/** Write each store to its own ioBroker state. */
export function saveToIoBroker({ backup = true }: { backup?: boolean } = {}): void {
  savedAt = Date.now();
  SYNC_STORE_KEYS.forEach((key) => {
    const raw = getRaw(key);
    if (raw) setStateDirect(IOBROKER_STATE_MAP[key], raw);
  });
  // Clear pending after writing
  SYNC_STORE_KEYS.forEach((key) => { if (pending.has(key)) { pending.delete(key); } });
  notify();
  if (backup) void writeBackup();
}

export const managedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    if (localStorage.getItem(name) === value) { pending.delete(name); return; }
    pending.set(name, value);
    notify();
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    pending.delete(name);
    notify();
  },
};
