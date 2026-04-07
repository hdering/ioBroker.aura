import type { StateStorage } from 'zustand/middleware';

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

/** Custom Zustand storage: reads directly from localStorage, writes to buffer */
export const managedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    pending.set(name, value);
    notify();
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    pending.delete(name);
    notify();
  },
};
