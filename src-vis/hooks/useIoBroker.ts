import { useState, useEffect, useCallback } from 'react';
import type { ioBrokerState, ObjectViewResult } from '../types';
import { version as appVersion } from '../../package.json';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { NS } from '../utils/namespace';

interface IoBrokerSocket {
    connected: boolean;
    on(event: string, callback: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    disconnect(): void;
}

// The socket library is loaded at runtime from the web adapter
// (<script src="/socket.io/socket.io.js"> in index.html) instead of being
// bundled. web serves the matching library for its configured mode — classic
// socket.io v2 or @iobroker/ws ("pure web sockets") — and BOTH expose
// globalThis.io.connect(url). Bundling socket.io-client breaks against
// pure-ws servers ('No sid found'); calling io.connect without path/transport
// options lets each library use its own correct defaults.
interface IoBrokerSocketFactory {
    connect(url: string, opts?: Record<string, unknown>): IoBrokerSocket;
}

function getIo(): IoBrokerSocketFactory | null {
    const lib = (globalThis as unknown as { io?: IoBrokerSocketFactory }).io;
    return lib && typeof lib.connect === 'function' ? lib : null;
}

let ioRetryTimer: ReturnType<typeof setTimeout> | null = null;
let ioLoadWarned = false;

/** A single line emitted by the iobroker log stream. The frontend never
 *  receives the raw `log` socket event (anonymous web users have no
 *  permission for `requireLog`); entries arrive via the aura backend
 *  `getRecentLogs` RPC, which adds the monotonically increasing `seq`. */
export interface LogEntry {
    severity: 'silly' | 'debug' | 'info' | 'warn' | 'error';
    ts: number; // unix ms
    message: string;
    from: string; // e.g. 'host.iobroker', 'shelly.0', 'admin.0'
    seq?: number;
}

// Module-level singleton
let socket: IoBrokerSocket | null = null;
const subscribers = new Map<string, Set<(state: ioBrokerState) => void>>();
const connectionListeners = new Set<(connected: boolean) => void>();

// Perf: time from (re)connect to the first live stateChange — a proxy for how
// quickly the dashboard receives usable data. Reported once per connection.
let connectPerfMark = 0;
let firstStateReported = false;

// Last-known-good state for every ID that was ever fetched or received.
// Allows useDatapoint to initialize synchronously (no null-flash on mount).
const stateCache = new Map<string, ioBrokerState>();

export function getStateFromCache(id: string): ioBrokerState | null {
    return stateCache.get(id) ?? null;
}

/** DEV-only: push a fabricated state into the cache and notify live subscribers,
 *  exactly like an inbound `stateChange` — but without any socket round-trip or
 *  write to ioBroker. Used by the screenshot harness to render widgets against
 *  controlled, side-effect-free values. Not wired up in production builds. */
export function __devInjectState(id: string, state: ioBrokerState): void {
    stateCache.set(id, state);
    subscribers.get(id)?.forEach((fn) => fn(state));
}

// DEV-only stubs for the screenshot harness. When set, the matching Direct*
// functions short-circuit with fabricated data instead of a socket round-trip —
// so history charts, adapter/script/log lists etc. render offline & side-effect
// free. Returning `undefined` from the sendTo stub means "not handled, fall
// through to the real socket". Not wired up in production builds.
let devHistoryGen: ((id: string, opts: { start: number; end: number; count?: number }) => HistoryEntry[]) | null = null;
let devObjectView: ((type: string, startkey: string, endkey: string) => ObjectViewResult | undefined) | null = null;
let devSendTo: ((target: string, command: string, payload: unknown) => unknown) | null = null;

export function __devSetHistoryGen(fn: typeof devHistoryGen): void {
    devHistoryGen = fn;
}
export function __devSetObjectView(fn: typeof devObjectView): void {
    devObjectView = fn;
}
export function __devSetSendTo(fn: typeof devSendTo): void {
    devSendTo = fn;
}

// Optimistic writes: when enabled, setState reflects the written value locally
// (cache + subscribers) immediately, instead of waiting for ioBroker to echo a
// stateChange back. Synced from the frontend setting via setOptimisticEcho().
// Some datapoints (e.g. plain 0_userdata variables with no adapter to ack them)
// never push an ack:false write back, leaving the UI stale until reload.
let optimisticEcho = true;
export function setOptimisticEcho(enabled: boolean): void {
    optimisticEcho = enabled;
}

// ioBroker rejects ID patterns that contain URL/query characters with
// "Invalid pattern on subscribe". Filter them out client-side so a stale
// URL accidentally stored in a DP-field can never crash the socket.
// NOTE: '#' is a legitimate separator in some adapters (e.g. Shelly:
// shelly.0.SHSW-25#XXXXXX#1.Relay0.Switch) and must NOT be filtered.
// NOTE: a plain space is legal in ioBroker IDs (common in hand-created
// 0_userdata.0.* objects, e.g. "...Pool.PoolPumpe Switch"), so it must NOT
// be filtered — only the URL/query characters that break the socket are.
function isValidStateId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && !/[/?&=:]/.test(id);
}

/** Fetch multiple state IDs in parallel and warm the cache. Returns when all have resolved (or 4 s timeout). */
export function prefetchStates(ids: string[], onProgress?: (loaded: number, total: number) => void): Promise<void> {
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
    const timeout = new Promise<void>((resolve) => globalThis.setTimeout(resolve, 4000));
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
    } catch {
        /* ignore */
    }
    return window.location.origin;
}

let currentUrl = getInitialUrl();

function createSocket(url: string): IoBrokerSocket {
    const io = getIo();
    if (!io) {
        if (!ioLoadWarned) {
            ioLoadWarned = true;
            console.error(
                '[useIoBroker] socket library not loaded (/socket.io/socket.io.js) — ' +
                    'is the ioBroker web/socketio adapter reachable? Showing offline and retrying…',
            );
        }
        connectionListeners.forEach((fn) => fn(false));
        scheduleIoRetry();
        return makeStubSocket();
    }
    ioLoadWarned = false;
    // transports: websocket first, polling as fallback. The classic socket.io
    // client defaults to polling-first, which fails when the web adapter has
    // "Force web sockets" enabled (server rejects the polling handshake) — so we
    // must offer websocket first. @iobroker/ws ("pure web sockets") ignores this
    // option and uses its own pure-WS connect. We deliberately do NOT pass
    // `path` (socket.io's default /socket.io is already correct, and @iobroker/ws
    // would mishandle it — it connects at the root).
    const s = io.connect(url, { transports: ['websocket', 'polling'] });

    // A re-established connection is signalled differently depending on the
    // runtime socket library: the bundled classic socket.io-client re-fires
    // 'connect', whereas @iobroker/ws ("pure web sockets") fires 'reconnect'.
    // Register the same recovery for BOTH events and dedupe with this flag so
    // it runs once per (re)connection. Without the 'reconnect' branch the
    // connection indicator stayed "offline" and subscriptions were never
    // re-established after the first drop on a pure-ws server, until a full
    // page reload created a fresh socket.
    let connectionActive = false;
    const handleConnected = (reconnected: boolean): void => {
        if (connectionActive) return;
        connectionActive = true;
        connectPerfMark = typeof performance !== 'undefined' ? performance.now() : 0;
        firstStateReported = false;
        console.log(
            `%c Aura %c v${appVersion} %c ${reconnected ? 'reconnected' : 'connected'} %c ${url} `,
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
                if (import.meta.env.DEV)
                    console.warn('[useIoBroker] dropping stale invalid subscription on reconnect:', id);
                subscribers.delete(id);
            }
        });
        subscribers.forEach((callbacks, id) => {
            s.emit('subscribe', id);
            s.emit('getState', id, (_err: unknown, state: unknown) => {
                if (state) callbacks.forEach((fn) => fn(state as ioBrokerState));
            });
        });
    };

    s.on('connect', () => handleConnected(false));
    s.on('reconnect', () => handleConnected(true));
    s.on('disconnect', () => {
        connectionActive = false;
        console.log(
            '%c Aura %c disconnected ',
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
        // Perf: first live data after connect. Reported inline (rather than via
        // perfMetrics) to avoid an import cycle back into this module.
        if (!firstStateReported && connectPerfMark > 0 && typeof performance !== 'undefined') {
            firstStateReported = true;
            const shot = typeof window !== 'undefined' && Boolean((window as { __auraShot?: unknown }).__auraShot);
            if (!shot) {
                const dt = performance.now() - connectPerfMark;
                if (dt >= 0) {
                    void sendToDirect(NS, 'perfLog', {
                        metric: 'socketToFirstState',
                        value: Math.round(dt),
                        ts: Date.now(),
                    });
                }
            }
        }
    });

    return s;
}

export function getSocket(): IoBrokerSocket {
    if (!socket) socket = createSocket(currentUrl);
    return socket;
}

function bounceSocket(): void {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    connectionListeners.forEach((fn) => fn(false));
    getSocket();
}

// Load-failure guard. The socket library is delivered by a separate
// <script src="/socket.io/socket.io.js"> served by the web adapter. If that
// adapter is briefly unreachable when the page loads (404 / network blip), the
// global never appears. Rather than throw — which would crash every getSocket()
// caller and white-screen the dashboard — createSocket() hands out this inert
// stub, keeps the connection indicator "offline", and schedules a retry.
function makeStubSocket(): IoBrokerSocket {
    return {
        connected: false,
        on() {},
        emit() {},
        disconnect() {},
    };
}

// Re-inject the socket-library script. The original tag in index.html does not
// re-fetch after a failed load, so simply polling for window.io would wait
// forever — we must request the script again (cache-busted) and connect once it
// arrives. Lets a dashboard left open through a web-adapter restart self-heal.
function loadSocketLib(): Promise<boolean> {
    return new Promise((resolve) => {
        if (getIo()) {
            resolve(true);
            return;
        }
        const el = document.createElement('script');
        el.src = `/socket.io/socket.io.js?_retry=${Date.now()}`;
        const done = (ok: boolean): void => {
            el.remove();
            resolve(ok && !!getIo());
        };
        el.onload = () => done(true);
        el.onerror = () => done(false);
        document.head.appendChild(el);
    });
}

function scheduleIoRetry(): void {
    if (ioRetryTimer) return;
    ioRetryTimer = setTimeout(() => {
        ioRetryTimer = null;
        void loadSocketLib().then((ok) => {
            if (ok) {
                // Library arrived — drop the stub so getSocket() builds a real one.
                socket = null;
                getSocket();
            } else {
                scheduleIoRetry();
            }
        });
    }, 1500);
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
        } catch {
            /* dev server not available */
        }
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
        return () => {
            connectionListeners.delete(setConnected);
        };
    }, []);

    const subscribe = useCallback((id: string, callback: (state: ioBrokerState) => void): (() => void) => {
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
    }, []);

    const setState = useCallback((id: string, val: boolean | number | string) => {
        getSocket().emit('setState', id, { val, ack: false });
        if (optimisticEcho) {
            const prev = stateCache.get(id);
            const ts = Date.now();
            const echo: ioBrokerState = {
                val,
                ack: false,
                ts,
                lc: prev && prev.val === val ? prev.lc : ts,
                from: prev?.from,
                q: prev?.q,
            };
            stateCache.set(id, echo);
            // Notify in a microtask so the caller's click handler finishes first
            // (keeps React batching predictable for the writing component).
            queueMicrotask(() => subscribers.get(id)?.forEach((fn) => fn(echo)));
        }
    }, []);

    const getState = useCallback((id: string): Promise<ioBrokerState | null> => {
        return new Promise((resolve) => {
            getSocket().emit('getState', id, (_err: unknown, state: ioBrokerState | null) => {
                // Mirror getStateDirect — cache the result so remounts (e.g. when a
                // widget moves between the grid and the off-screen reflow container)
                // can see the value synchronously instead of starting cold and
                // flipping back out of the reflow set. Without this the
                // useConditionStyle remount loop in issue #281 keeps the widget
                // bouncing in-place and other widgets never reflow up.
                if (state) stateCache.set(id, state);
                resolve(state);
            });
        });
    }, []);

    const getObjectView = useCallback((type: 'state' | 'channel' | 'device'): Promise<ObjectViewResult> => {
        return new Promise((resolve) => {
            getSocket().emit(
                'getObjectView',
                'system',
                type,
                { startkey: '', endkey: '\u9999' },
                (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
            );
        });
    }, []);

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
        role?: string;
        /** Value→text map for multi-state DPs (object / array / "k:v;…" string). */
        states?: Record<string, string> | string[] | string;
        custom?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
    };
}

// Object cache: definitions change rarely, so we cache them for the session.
// Invalidated automatically by setObjectDirect / extendObjectDirect / deleteObjectDirect.
const objectCache = new Map<string, ioBrokerObject | null>();
const objectInflight = new Map<string, Promise<ioBrokerObject | null>>();

export function invalidateObjectCache(id?: string): void {
    if (id) {
        objectCache.delete(id);
        objectInflight.delete(id);
    } else {
        objectCache.clear();
        objectInflight.clear();
    }
}

export function getObjectDirect(id: string, opts?: { skipCache?: boolean }): Promise<ioBrokerObject | null> {
    if (!opts?.skipCache) {
        if (objectCache.has(id)) return Promise.resolve(objectCache.get(id) ?? null);
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
export interface HistoryEntry {
    ts: number;
    val: number | boolean | string | null;
    ack?: boolean;
    q?: number;
}

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
    if (devHistoryGen) {
        return Promise.resolve(
            devHistoryGen(id, { start: opts.start, end: opts.end ?? Date.now(), count: opts.count }),
        );
    }
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
        if (import.meta.env.DEV)
            console.warn('[useIoBroker] refused subscribeStateDirect with invalid ID pattern:', id);
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

/**
 * Subscribe to a datapoint reference that may carry a JSON-path suffix
 * (`<stateId>?<path>`). The socket subscription always runs against the bare
 * state ID; the callback receives the value addressed by the path (or the raw
 * value when the ref has no path). Non-hook counterpart to useDatapoint, used
 * by the direct subscribers that render a user-configured datapoint value.
 */
export function subscribeDpValue(
    ref: string,
    callback: (value: ioBrokerState['val'], state: ioBrokerState) => void,
): () => void {
    const { id, path } = splitDpRef(ref);
    return subscribeStateDirect(id, (state) => {
        callback(resolveDpValue(state?.val, path) as ioBrokerState['val'], state);
    });
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

/** Promise variant of setStateDirect: resolves once the server acks the write.
 * Use when the next step (e.g. a page reload) would otherwise race the buffered
 * websocket frame before it flushes. */
export function setStateDirectAsync(id: string, val: boolean | number | string, ack = false): Promise<void> {
    return new Promise((resolve) => {
        getSocket().emit('setState', id, { val, ack }, () => resolve());
    });
}

/** Create or update an ioBroker object definition without a React hook. */
export function setObjectDirect(id: string, obj: object): void {
    invalidateObjectCache(id);
    getSocket().emit('setObject', id, obj, () => {
        /* ignore result */
    });
}

/** Merge a partial object patch into an existing ioBroker object (used to toggle common.enabled). */
export function extendObjectDirect(id: string, patch: object): Promise<void> {
    invalidateObjectCache(id);
    return new Promise((resolve) => {
        getSocket().emit('extendObject', id, patch, () => resolve());
    });
}

// Optional sink for backend round-trip timing. Wired from perfBreakdown when
// performance tracking is enabled in the adapter config; left null otherwise so
// sendToDirect stays zero-overhead by default.
let backendTimingSink: ((command: string, ms: number) => void) | null = null;
export function setBackendTimingSink(fn: ((command: string, ms: number) => void) | null): void {
    backendTimingSink = fn;
}

/** Send a command/message to another adapter instance or host (sendTo).
 *  Resolves with the callback result, or { __timeout: true } after timeoutMs (default 30s).
 *  Permission errors come back as the string 'permissionError'. */
export function sendToDirect<T = unknown>(
    target: string,
    command: string,
    payload: unknown,
    timeoutMs = 30000,
): Promise<T | { __timeout: true } | string | null> {
    if (devSendTo) {
        const handled = devSendTo(target, command, payload);
        if (handled !== undefined) return Promise.resolve((handled as T) ?? null);
    }
    const t0 = backendTimingSink ? performance.now() : 0;
    return new Promise((resolve) => {
        let settled = false;
        const done = (v: T | { __timeout: true } | string | null) => {
            if (!settled) {
                settled = true;
                resolve(v);
            }
        };
        getSocket().emit('sendTo', target, command, payload, (result: unknown) => {
            // Measure only real callback returns — a timeout would report the
            // full timeoutMs and skew the numbers. Don't record the perf command
            // itself (would be self-referential noise).
            if (backendTimingSink && command !== 'perfBreakdown' && command !== 'perfLog') {
                backendTimingSink(command, performance.now() - t0);
            }
            done((result as T) ?? null);
        });
        globalThis.setTimeout(() => done({ __timeout: true }), timeoutMs);
    });
}

/** Delete an ioBroker object by ID. Returns a promise that resolves when done.
 *  NOTE: the web socket silently drops delObject for non-admin sessions — the
 *  callback never fires, so this promise hangs. Callers that need guaranteed
 *  deletion should route via sendTo→adapter onMessage instead. */
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
            if (err) reject(err);
            else resolve();
        });
    });
}

export function readFileDirect(adapter: string, filename: string): Promise<string | null> {
    return new Promise((resolve) => {
        getSocket().emit('readFile', adapter, filename, (err: unknown, data: unknown) => {
            if (err || data == null) {
                resolve(null);
                return;
            }
            // ioBroker classifies files by extension; binary types (e.g. .gz) come
            // back not as a string but as raw bytes, whose exact shape depends on the
            // host's storage backend / js-controller version: a string, a Buffer-like
            // {type:'Buffer', data:[...]}, an ArrayBuffer, or a typed-array view. Decode
            // every shape to text — returning null here surfaces as "backup has no data".
            try {
                if (typeof data === 'string') {
                    resolve(data);
                } else if (data instanceof ArrayBuffer) {
                    resolve(new TextDecoder().decode(new Uint8Array(data)));
                } else if (ArrayBuffer.isView(data)) {
                    resolve(new TextDecoder().decode(data as ArrayBufferView));
                } else if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
                    const arr = (data as { data: number[] }).data;
                    resolve(new TextDecoder().decode(new Uint8Array(arr)));
                } else {
                    resolve(null);
                }
            } catch {
                resolve(null);
            }
        });
    });
}

export function readDirDirect(adapter: string, path: string): Promise<IoBrokerFileEntry[]> {
    return new Promise((resolve) => {
        getSocket().emit('readDir', adapter, path, (err: unknown, files: unknown) => {
            if (err || !Array.isArray(files)) {
                resolve([]);
                return;
            }
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
    } catch {
        /* ignore */
    }
    return window.location.origin;
}

// Standalone-Funktion – kein Hook, kein Reconnect-Seiteneffekt
export function getObjectListDirect(startkey: string, endkey: string): Promise<ObjectViewResult> {
    return new Promise((resolve) => {
        getSocket().emit(
            'getObjectList',
            { startkey, endkey, include_docs: true },
            (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
        );
    });
}

export function getObjectViewDirect(
    type: 'state' | 'channel' | 'device' | 'enum' | 'instance' | 'chart' | 'folder' | 'script',
    startkey = '',
    endkey = '\u9999',
): Promise<ObjectViewResult> {
    if (devObjectView) {
        const handled = devObjectView(type, startkey, endkey);
        if (handled !== undefined) return Promise.resolve(handled);
    }
    return new Promise((resolve) => {
        getSocket().emit(
            'getObjectView',
            'system',
            type,
            { startkey, endkey },
            (_err: unknown, result: ObjectViewResult) => resolve(result ?? { rows: [] }),
        );
    });
}
