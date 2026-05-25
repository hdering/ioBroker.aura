import { useState, useEffect, useCallback } from 'react';
import type { ioBrokerState, ObjectViewResult } from '../types';
import { version as appVersion } from '../../package.json';

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

// ioBroker rejects ID patterns that contain URL/query characters with
// "Invalid pattern on subscribe". Filter them out client-side so a stale
// URL accidentally stored in a DP-field can never crash the socket.
// NOTE: '#' is a legitimate separator in some adapters (e.g. Shelly:
// shelly.0.SHSW-25#XXXXXX#1.Relay0.Switch) and must NOT be filtered.
function isValidStateId(id: unknown): id is string {
  return typeof id === 'string'
    && id.length > 0
    && !/[\s\/?&=:]/.test(id);
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
    console.log(
      `%c Aura %c v${appVersion} %c connected %c ${url} `,
      'background:#6366f1;color:#fff;font-weight:bold;border-radius:3px 0 0 3px;padding:2px 6px;',
      'background:#1e293b;color:#cbd5e1;padding:2px 6px;',
      'background:#10b981;color:#fff;font-weight:bold;padding:2px 6px;',
      'background:#0f172a;color:#94a3b8;border-radius:0 3px 3px 0;padding:2px 6px;',
    );
    connectionListeners.forEach((fn) => fn(true));
    // Re-subscribe and fetch current state for all active subscriptions.
    // Drop any stale entries with invalid ID pattern (would crash backend with "Invalid pattern on subscribe").
    Array.from(subscribers.keys()).forEach((id) => {
      if (!isValidStateId(id)) {
        if (import.meta.env.DEV) console.warn('[useIoBroker] dropping stale invalid subscription on reconnect:', id);
        subscribers.delete(id);
      }
    });
    subscribers.forEach((callbacks, id) => {
      s.emit('subscribe', id);
      s.emit('getState', id, (_err: unknown, state: unknown) => {
        if (state) callbacks.forEach((fn) => fn(state as ioBrokerState));
      });
    });
  });
  s.on('disconnect', () => {
    console.log('%c Aura %c disconnected ',
      'background:#6366f1;color:#fff;font-weight:bold;border-radius:3px 0 0 3px;padding:2px 6px;',
      'background:#ef4444;color:#fff;font-weight:bold;border-radius:0 3px 3px 0;padding:2px 6px;',
    );
    connectionListeners.forEach((fn) => fn(false));
  });
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
      if (!isValidStateId(id)) {
        if (import.meta.env.DEV) console.warn('[useIoBroker] refused subscribe with invalid ID pattern:', id);
        return () => {};
      }
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

// Object cache: definitions change rarely, so we cache them for the session.
// Invalidated automatically by setObjectDirect / extendObjectDirect / deleteObjectDirect.
const objectCache = new Map<string, ioBrokerObject | null>();
const objectInflight = new Map<string, Promise<ioBrokerObject | null>>();

export function invalidateObjectCache(id?: string): void {
  if (id) { objectCache.delete(id); objectInflight.delete(id); }
  else    { objectCache.clear();    objectInflight.clear(); }
}

export function getObjectDirect(
  id: string,
  opts?: { skipCache?: boolean },
): Promise<ioBrokerObject | null> {
  if (!opts?.skipCache) {
    if (objectCache.has(id))   return Promise.resolve(objectCache.get(id) ?? null);
    const inflight = objectInflight.get(id);
    if (inflight) return inflight;
  }
  const p = new Promise<ioBrokerObject | null>((resolve) => {
    getSocket().emit('getObject', id, (_err: unknown, obj: ioBrokerObject | null) => {
      objectCache.set(id, obj ?? null);
      objectInflight.delete(id);
      resolve(obj ?? null);
    });
  });
  objectInflight.set(id, p);
  return p;
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
  if (!isValidStateId(id)) {
    if (import.meta.env.DEV) console.warn('[useIoBroker] refused subscribeStateDirect with invalid ID pattern:', id);
    return () => {};
  }
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
  invalidateObjectCache(id);
  getSocket().emit('setObject', id, obj, () => { /* ignore result */ });
}

/** Merge a partial object patch into an existing ioBroker object (used to toggle common.enabled). */
export function extendObjectDirect(id: string, patch: object): Promise<void> {
  invalidateObjectCache(id);
  return new Promise((resolve) => {
    getSocket().emit('extendObject', id, patch, () => resolve());
  });
}

/** Send a command/message to another adapter instance or host (sendTo).
 *  Resolves with the callback result, or { __timeout: true } after timeoutMs (default 30s).
 *  Permission errors come back as the string 'permissionError'. */
export function sendToDirect<T = unknown>(target: string, command: string, payload: unknown, timeoutMs = 30000): Promise<T | { __timeout: true } | string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: T | { __timeout: true } | string | null) => { if (!settled) { settled = true; resolve(v); } };
    getSocket().emit('sendTo', target, command, payload, (result: unknown) => done((result as T) ?? null));
    setTimeout(() => done({ __timeout: true }), timeoutMs);
  });
}

/** Delete an ioBroker object by ID. Returns a promise that resolves when done. */
export function deleteObjectDirect(id: string): Promise<void> {
  invalidateObjectCache(id);
  return new Promise((resolve) => {
    getSocket().emit('delObject', id, (_err: unknown) => resolve());
  });
}

// ── ioBroker Files API ────────────────────────────────────────────────────
// Files live under <adapter-namespace>/<filename> and bypass the per-state
// socket frame size limit. Used by the auto-backup system.

export interface IoBrokerFileEntry {
  file: string;
  size: number;
  isDir: boolean;
  modifiedAt: number; // unix ms, 0 if unknown
}

export function writeFileDirect(adapter: string, filename: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSocket().emit('writeFile', adapter, filename, data, (err: unknown) => {
      if (err) reject(err); else resolve();
    });
  });
}

export function readFileDirect(adapter: string, filename: string): Promise<string | null> {
  return new Promise((resolve) => {
    getSocket().emit('readFile', adapter, filename, (err: unknown, data: unknown) => {
      if (err || data == null) { resolve(null); return; }
      // ioBroker may return Buffer-like {type:'Buffer', data:[...]}, a string, or base64
      if (typeof data === 'string') resolve(data);
      else if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
        try {
          const arr = (data as { data: number[] }).data;
          resolve(new TextDecoder().decode(new Uint8Array(arr)));
        } catch { resolve(null); }
      } else { resolve(null); }
    });
  });
}

export function readDirDirect(adapter: string, path: string): Promise<IoBrokerFileEntry[]> {
  return new Promise((resolve) => {
    getSocket().emit('readDir', adapter, path, (err: unknown, files: unknown) => {
      if (err || !Array.isArray(files)) { resolve([]); return; }
      const out: IoBrokerFileEntry[] = [];
      for (const f of files as Array<Record<string, unknown>>) {
        const name = String(f.file ?? '');
        if (!name) continue;
        const stats = (f.stats as Record<string, unknown> | undefined) ?? {};
        out.push({
          file: name,
          size: Number(stats.size ?? 0),
          isDir: Boolean(f.isDir),
          modifiedAt: Number(stats.mtimeMs ?? stats.ctimeMs ?? 0),
        });
      }
      resolve(out);
    });
  });
}

export function deleteFileDirect(adapter: string, filename: string): Promise<void> {
  return new Promise((resolve) => {
    getSocket().emit('deleteFile', adapter, filename, (_err: unknown) => resolve());
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
