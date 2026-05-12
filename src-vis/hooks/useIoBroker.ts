import { useState, useEffect, useCallback } from 'react';
import type { ioBrokerState, ObjectViewResult } from '../types';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – socket.io-client v2 hat kein ESM-Export
import io from 'socket.io-client';

interface IoBrokerSocket {
  connected: boolean;
  on(event: string, callback: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  disconnect(): void;
}

// Module-level singleton
let socket: IoBrokerSocket | null = null;
const subscribers = new Map<string, Set<(state: ioBrokerState) => void>>();
const connectionListeners = new Set<(connected: boolean) => void>();

// Last-known-good state for every ID that was ever fetched or received.
// Allows useDatapoint to initialize synchronously (no null-flash on mount).
const stateCache = new Map<string, ioBrokerState>();

export function getStateFromCache(id: string): ioBrokerState | null {
  return stateCache.get(id) ?? null;
}

/** Fetch multiple state IDs in parallel and warm the cache. Returns when all have resolved (or 4 s timeout). */
export function prefetchStates(
  ids: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))].filter((id) => !stateCache.has(id));
  if (unique.length === 0) return Promise.resolve();
  let loaded = 0;
  const total = unique.length;
  const fetches = unique.map(
    (id) =>
      new Promise<void>((resolve) => {
        getSocket().emit('getState', id, (_err: unknown, state: ioBrokerState | null) => {
          if (state) stateCache.set(id, state);
          onProgress?.(++loaded, total);
          resolve();
        });
      }),
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
  return Promise.race([Promise.all(fetches).then(() => undefined), timeout]);
}

// Determine initial socket URL:
// - Dev: Vite dev server proxies /socket.io → configured ioBroker (no CORS), use same origin
// - Prod: injected by aura server as window.__AURA_SOCKET_URL__, or persisted in localStorage
function getInitialUrl(): string {
  if (import.meta.env.DEV) return window.location.origin;
  // Injected by the aura HTTP server into index.html — points to iobroker.web socket port
  const injected = (window as unknown as Record<string, unknown>)['__AURA_SOCKET_URL__'];
  if (injected && typeof injected === 'string') return injected;
  try {
    const stored = localStorage.getItem('aura-connection');
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { ioBrokerUrl?: string } };
      const storedUrl = parsed.state?.ioBrokerUrl;
      if (storedUrl) {
        try {
          const u = new URL(storedUrl);
          if (window.location.protocol === 'https:' && u.protocol === 'http:') {
            return window.location.origin;
          }
          return u.origin;
        } catch {
          return storedUrl;
        }
      }
    }
  } catch { /* ignore */ }
  return window.location.origin;
}

let currentUrl = getInitialUrl();

function createSocket(url: string): IoBrokerSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (io as any)(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  }) as IoBrokerSocket;

  s.on('connect', () => {
    connectionListeners.forEach((fn) => fn(true));
    // Re-subscribe and fetch current state for all active subscriptions
    subscribers.forEach((callbacks, id) => {
      s.emit('subscribe', id);
      s.emit('getState', id, (_err: unknown, state: unknown) => {
        if (state) callbacks.forEach((fn) => fn(state as ioBrokerState));
      });
    });
  });
  s.on('disconnect', () => connectionListeners.forEach((fn) => fn(false)));
  s.on('stateChange', (...args: unknown[]) => {
    const id = args[0] as string;
    const state = args[1] as ioBrokerState;
    if (state) stateCache.set(id, state);
    subscribers.get(id)?.forEach((fn) => fn(state));
  });

  return s;
}

export function getSocket(): IoBrokerSocket {
  if (!socket) socket = createSocket(currentUrl);
  return socket;
}

function bounceSocket(): void {
  if (socket) { socket.disconnect(); socket = null; }
  connectionListeners.forEach((fn) => fn(false));
  getSocket();
}

/** Update the ioBroker target and reconnect.
 *  In dev: notifies the Vite proxy plugin to change its target (no CORS restart needed).
 *  In prod: reconnects directly to the new URL. */
export async function reconnectSocket(newUrl: string): Promise<void> {
  if (import.meta.env.DEV) {
    try {
      await fetch('/api/dev/set-iobroker-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      });
    } catch { /* dev server not available */ }
    // Socket still connects to same origin; proxy now routes to new target
    bounceSocket();
  } else {
    currentUrl = newUrl;
    bounceSocket();
  }
}

export function useIoBroker() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    setConnected(getSocket().connected);
    connectionListeners.add(setConnected);
    return () => { connectionListeners.delete(setConnected); };
  }, []);

  const subscribe = useCallback(
    (id: string, callback: (state: ioBrokerState) => void): (() => void) => {
      if (!subscribers.has(id)) {
        subscribers.set(id, new Set());
        getSocket().emit('subscribe', id);
      }
      subscribers.get(id)!.add(callback);
      return () => {
        const subs = subscribers.get(id);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) {
            subscribers.delete(id);
            getSocket().emit('unsubscribe', id);
          }
        }
      };
    },
    [],
  );

  const setState = useCallback((id: string, val: boolean | number | string) => {
    getSocket().emit('setState', id, { val, ack: false });
  }, []);

  const getState = useCallback((id: string): Promise<ioBrokerState | null> => {
    return new Promise((resolve) => {
      getSocket().emit('getState', id, (_err: unknown, state: ioBrokerState | null) => resolve(state));
    });
  }, []);

  const getObjectView = useCallback(
    (type: 'state' | 'channel' | 'device'): Promise<ObjectViewResult> => {
      return new Promise((resolve) => {
        getSocket().emit(
          'getObjectView', 'system', type,
          { startkey: '', endkey: '\u9999' },
          (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
        );
      });
    },
    [],
  );

  return { connected, subscribe, setState, getState, getObjectView };
}

// ── Object metadata ───────────────────────────────────────────────────────────
export interface ioBrokerObject {
  _id: string;
  type: string;
  common: {
    name: string | Record<string, string>;
    type?: string;
    unit?: string;
    write?: boolean;
    custom?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
  };
}

export function getObjectDirect(id: string): Promise<ioBrokerObject | null> {
  return new Promise((resolve) => {
    getSocket().emit('getObject', id, (_err: unknown, obj: ioBrokerObject | null) =>
      resolve(obj ?? null),
    );
  });
}

// ── History adapter ────────────────────────────────────────────────────────────
export interface HistoryEntry { ts: number; val: number | boolean | string | null; ack?: boolean; q?: number; }

export function getHistoryDirect(
  id: string,
  opts: {
    instance: string;
    start: number;
    end?: number;
    step?: number;
    count?: number;
    aggregate?: 'none' | 'average' | 'min' | 'max' | 'minmax' | 'total' | 'count' | 'first' | 'last';
  },
): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    getSocket().emit(
      'getHistory',
      id,
      {
        instance: opts.instance,
        start: opts.start,
        end: opts.end ?? Date.now(),
        count: opts.count ?? 1000,
        step: opts.step ?? null,
        aggregate: opts.aggregate ?? 'average',
        from: false,
        ack: false,
        q: false,
        addID: false,
        ignoreNull: false,
      },
      (_err: unknown, result: HistoryEntry[] | undefined) => resolve(result ?? []),
    );
  });
}

// ── Direct state subscription (non-hook) ──────────────────────────────────────
/** Subscribe to a datapoint without a React hook. Returns an unsubscribe function. */
export function subscribeStateDirect(id: string, callback: (state: ioBrokerState) => void): () => void {
  if (!id) return () => {};
  if (!subscribers.has(id)) {
    subscribers.set(id, new Set());
    getSocket().emit('subscribe', id);
  }
  subscribers.get(id)!.add(callback);
  return () => {
    const subs = subscribers.get(id);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        subscribers.delete(id);
        getSocket().emit('unsubscribe', id);
      }
    }
  };
}

/** Get the current state of a datapoint without a React hook. */
export function getStateDirect(id: string): Promise<ioBrokerState | null> {
  return new Promise((resolve) => {
    getSocket().emit('getState', id, (_err: unknown, state: ioBrokerState | null) => {
      if (state) stateCache.set(id, state);
      resolve(state ?? null);
    });
  });
}

/** Set a state value without a React hook. */
export function setStateDirect(id: string, val: boolean | number | string, ack = false): void {
  getSocket().emit('setState', id, { val, ack });
}

/** Create or update an ioBroker object definition without a React hook. */
export function setObjectDirect(id: string, obj: object): void {
  getSocket().emit('setObject', id, obj, () => { /* ignore result */ });
}

/** Delete an ioBroker object by ID. Returns a promise that resolves when done. */
export function deleteObjectDirect(id: string): Promise<void> {
  return new Promise((resolve) => {
    getSocket().emit('delObject', id, (_err: unknown) => resolve());
  });
}

/** Returns the configured customUrl from the aura adapter instance, or window.location.origin. */
export async function getAuraBaseUrl(): Promise<string> {
  try {
    const result = await getObjectViewDirect('instance', 'system.adapter.aura.', 'system.adapter.aura.香');
    const row = result.rows[0];
    if (row) {
      const native = (row.value as unknown as { native?: { customUrl?: string } }).native;
      if (native?.customUrl) return native.customUrl.replace(/\/+$/, '');
    }
  } catch { /* ignore */ }
  return window.location.origin;
}

// Standalone-Funktion – kein Hook, kein Reconnect-Seiteneffekt
export function getObjectListDirect(
  startkey: string,
  endkey: string,
): Promise<ObjectViewResult> {
  return new Promise((resolve) => {
    getSocket().emit(
      'getObjectList',
      { startkey, endkey, include_docs: true },
      (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
    );
  });
}

export function getObjectViewDirect(
  type: 'state' | 'channel' | 'device' | 'enum' | 'instance' | 'chart' | 'folder',
  startkey = '',
  endkey = '\u9999',
): Promise<ObjectViewResult> {
  return new Promise((resolve) => {
    getSocket().emit(
      'getObjectView', 'system', type,
      { startkey, endkey },
      (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
    );
  });
}
