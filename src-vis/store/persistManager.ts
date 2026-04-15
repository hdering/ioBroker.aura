import type { StateStorage } from 'zustand/middleware';
import { setStateDirect } from '../hooks/useIoBroker';

const IOBROKER_CONFIG_KEY = 'aura.0.config.dashboard';
const SYNC_STORE_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config'] as const;

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

/** Flush buffered writes to localStorage */
export function saveAll(): void {
  pending.forEach((val, key) => localStorage.setItem(key, val));
  pending.clear();
  notify();
}

/** Discard buffered writes and restore in-memory store state from localStorage.
 *  Pass the rehydrate functions of all managed stores. */
export function revertAll(rehydrateFns: Array<() => void>): void {
  pending.clear();
  rehydrateFns.forEach((fn) => fn());
  notify();
}

/**
 * Write all managed store blobs to ioBroker so any browser connecting to
 * the same ioBroker instance gets the current config.
 * Must be called AFTER saveAll() so localStorage is up-to-date.
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
