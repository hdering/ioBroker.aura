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

// Determine initial socket URL:
// - Dev: Vite dev server proxies /socket.io → configured ioBroker (no CORS), use same origin
// - Prod: read persisted ioBroker URL from localStorage (set by connectionStore)
function getInitialUrl(): string {
  if (import.meta.env.DEV) return window.location.origin;
  try {
    const stored = localStorage.getItem('aura-connection');
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { ioBrokerUrl?: string } };
      const storedUrl = parsed.state?.ioBrokerUrl;
      if (storedUrl) {
        try {
          const u = new URL(storedUrl);
          // Only use stored URL when it won't cause mixed-content errors:
          // HTTPS page → HTTP socket.io would be blocked by the browser.
          // Fall back to same-origin so the connection goes through the
          // same web adapter (or reverse proxy) that served the page.
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
  // Default: same origin as the page (web adapter serves socket.io on same port,
  // works for both HTTP and HTTPS without mixed-content issues)
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
    getSocket().emit('getState', id, (_err: unknown, state: ioBrokerState | null) => resolve(state ?? null));
  });
}

/** Set a state value without a React hook. */
export function setStateDirect(id: string, val: boolean | number | string): void {
  getSocket().emit('setState', id, { val, ack: false });
}

/** Create or update an ioBroker object definition without a React hook. */
export function setObjectDirect(id: string, obj: object): void {
  getSocket().emit('setObject', id, obj, () => { /* ignore result */ });
}

// Standalone-Funktion – kein Hook, kein Reconnect-Seiteneffekt
export function getObjectViewDirect(
  type: 'state' | 'channel' | 'device' | 'enum',
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
