import type { StateStorage } from 'zustand/middleware';
import { setStateDirect, getStateDirect } from '../hooks/useIoBroker';

const IOBROKER_CONFIG_KEY = 'aura.0.config.dashboard';
const IOBROKER_BACKUP_KEY = 'aura.0.config.dashboard_backup';
const SYNC_STORE_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config', 'aura-global-settings', 'aura-group-defs'] as const;

export const BACKUP_TS_KEY = '_ts';

// Configurable max number of backups to keep (default 5, set by AdminLayout on mount)
let maxBackups = 5;

/** Call once on admin startup to sync the user-configured backup count. */
export function configureBackup(opts: { maxBackups: number }): void {
  maxBackups = Math.max(1, Math.min(20, opts.maxBackups));
}

// All writes from managed stores go here instead of directly to localStorage
const pending = new Map<string, string>();
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

export function subscribeDirty(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function isDirty(): boolean {
  return pending.size > 0;
}

/** Immediately commit one key from pending to localStorage without leaving it dirty. */
export function flushKey(key: string): void {
  const value = pending.get(key);
  if (value !== undefined) {
    localStorage.setItem(key, value);
    pending.delete(key);
    notify();
  }
}

/** Flush buffered writes to localStorage */
export function saveAll(): void {
  const errors: string[] = [];
  pending.forEach((val, key) => {
    try {
      localStorage.setItem(key, val);
    } catch {
      errors.push(key);
      console.error('[persistManager] localStorage quota exceeded for key:', key);
    }
  });
  pending.clear();
  notify();
  if (errors.length > 0) {
    throw new Error(`localStorage quota exceeded for: ${errors.join(', ')}`);
  }
}

/** Discard buffered writes and restore in-memory store state from localStorage.
 *  Pass the rehydrate functions of all managed stores. */
export function revertAll(rehydrateFns: Array<() => void>): void {
  pending.clear();
  rehydrateFns.forEach((fn) => fn());
  notify();
}

/** Read the current backup list from ioBroker, prepend a new entry, trim to
 *  maxBackups, and write back.  Runs fire-and-forget — errors are silenced. */
async function writeBackup(payload: Record<string, unknown>): Promise<void> {
  try {
    const state = await getStateDirect(IOBROKER_BACKUP_KEY);
    let backups: Array<Record<string, unknown>> = [];
    if (state?.val) {
      try {
        const parsed = JSON.parse(String(state.val)) as Record<string, unknown>;
        if (Array.isArray(parsed.backups)) {
          // Current multi-backup format
          backups = parsed.backups as Array<Record<string, unknown>>;
        } else if (parsed[BACKUP_TS_KEY]) {
          // Old single-backup format – migrate to list
          backups = [parsed];
        }
      } catch { /* start fresh */ }
    }
    const entry = { [BACKUP_TS_KEY]: new Date().toISOString(), ...payload };
    backups = [entry, ...backups].slice(0, maxBackups);
    setStateDirect(IOBROKER_BACKUP_KEY, JSON.stringify({ backups }));
  } catch { /* socket not connected – silently skip */ }
}

/**
 * Write all managed store blobs to ioBroker so any browser connecting to
 * the same ioBroker instance gets the current config.
 * Must be called AFTER saveAll() so localStorage is up-to-date.
 * Also appends a timestamped entry to the rolling backup list.
 */
export function saveToIoBroker(): void {
  const payload: Record<string, unknown> = {};
  SYNC_STORE_KEYS.forEach((key) => {
    const raw = localStorage.getItem(key);
    try { payload[key] = raw ? JSON.parse(raw) : null; }
    catch { payload[key] = raw; }
  });
  try {
    setStateDirect(IOBROKER_CONFIG_KEY, JSON.stringify(payload, null, 2));
    void writeBackup(payload);
  } catch { /* socket not yet connected – silently skip */ }
}

/** Custom Zustand storage: reads directly from localStorage, writes to buffer */
export const managedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    // If the serialized value is identical to what's already in localStorage
    // (e.g. during store hydration / default-field merges), don't mark as dirty.
    if (localStorage.getItem(name) === value) {
      pending.delete(name);
      return;
    }
    pending.set(name, value);
    notify();
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    pending.delete(name);
    notify();
  },
};
