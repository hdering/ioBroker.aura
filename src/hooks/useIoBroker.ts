import { useState, useEffect, useCallback } from 'react';
import type { ioBrokerState, ObjectViewResult } from '../types';
import { useConnectionStore } from '../store/connectionStore';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – socket.io-client v2 hat kein ESM-Export; Vite handhabt CJS-Interop
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

// Always use same origin:
// - Dev: Vite dev server proxies /socket.io → configured ioBroker (no CORS)
// - Prod (adapter): ioBroker web adapter is same origin, serves /socket.io itself
let currentUrl = window.location.origin;

function createSocket(url: string): IoBrokerSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (io as any)(url, {
    path: '/socket.io',
    transports: ['polling'],
  }) as IoBrokerSocket;

  s.on('connect', () => {
    connectionListeners.forEach((fn) => fn(true));
    subscribers.forEach((_, id) => s.emit('subscribe', id));
  });
  s.on('disconnect', () => connectionListeners.forEach((fn) => fn(false)));
  s.on('stateChange', (...args: unknown[]) => {
    const id = args[0] as string;
    const state = args[1] as ioBrokerState;
    subscribers.get(id)?.forEach((fn) => fn(state));
  });

  return s;
}

function getSocket(): IoBrokerSocket {
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
  const storedUrl = useConnectionStore((s) => s.ioBrokerUrl);

  // In dev mode, re-notify the Vite proxy when the stored URL changes
  useEffect(() => {
    if (import.meta.env.DEV) reconnectSocket(storedUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedUrl]);

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
