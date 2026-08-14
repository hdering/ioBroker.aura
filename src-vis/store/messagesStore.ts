import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { subscribeDpValue, setStateDirect } from '../hooks/useIoBroker';
import { isScreenshotMode } from './persistManager';
import { NS } from '../utils/namespace';
import type { AuraMessage, MessageBroadcast, MessageTarget } from '../types';

/**
 * Runtime for the message system (issue #429).
 *
 * The adapter owns the data: it normalizes every payload written to a
 * `messages.send` datapoint and publishes the result on three read-only DPs.
 * This store mirrors them and decides what this particular device shows.
 *
 *   messages.lastMessage  live delivery (also carries close markers)
 *   messages.history      the archive — feeds the widget and the catch-up pass
 *   messages.unreadCount  badge counter
 *
 * Two things are device-local and therefore persisted here, in plain
 * localStorage rather than through managedStorage: `seenIds` and `lastSeenTs`.
 * They must not travel to other clients (each device shows a message once), and
 * a synced key would show up as an unsaved config change in the admin UI.
 */

/** How many ids to remember, so a reload cannot replay old toasts. */
const SEEN_MAX = 300;

/**
 * Remember `id → ts` rather than a plain id list. A reusable id is the documented
 * way to keep a repeating notice down to one entry ("washer running" → "washer
 * done"), so the same id with a NEWER timestamp is an update and has to be shown,
 * while the same id with the same timestamp is the replay a reload would cause.
 */
function rememberSeen(seen: Record<string, number>, id: string, ts: number): Record<string, number> {
    const next = { ...seen, [id]: ts };
    const keys = Object.keys(next);
    if (keys.length <= SEEN_MAX) return next;
    // Drop the oldest entries; a device that has been up for weeks must not grow
    // this map without bound.
    const keep = keys.sort((a, b) => next[b] - next[a]).slice(0, SEEN_MAX);
    return Object.fromEntries(keep.map((k) => [k, next[k]]));
}

/** How many toasts one screen position shows before the rest queue up. */
export const DEFAULT_MAX_VISIBLE = 3;

/** Datapoints owned by the adapter. */
const DP_DEFAULTS = `${NS}.config.messageDefaults`;
const DP_LAST = `${NS}.messages.lastMessage`;
const DP_HISTORY = `${NS}.messages.history`;
const DP_UNREAD = `${NS}.messages.unreadCount`;
const DP_SEND = `${NS}.messages.send`;
const DP_ACK = `${NS}.messages.ack`;
const DP_DISMISS = `${NS}.messages.dismiss`;
const DP_CLEAR = `${NS}.messages.clear`;

/** Parse a user-supplied payload string into bool/number/string, as everywhere else. */
function parseWriteValue(raw: string | undefined): boolean | number | string {
    if (raw === undefined || raw === '') return true;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    return raw;
}

/** A close marker rather than a new message. */
function isCloseMarker(b: MessageBroadcast): b is { id: string; ts: number; dismissed: true; read: boolean } {
    return (b as { dismissed?: boolean }).dismissed === true;
}

export interface MessageScope {
    clientId: string;
    layoutId?: string;
    layoutSlug?: string;
    layoutName?: string;
    tabId?: string;
    tabSlug?: string;
    tabName?: string;
}

/**
 * Does this device show the message? Mirrors `inScope` in DpPopupTriggers, with
 * one addition: layout/tab may be given as slug, id or name, because a target is
 * usually hand-written in a script and any of the three is a fair guess.
 */
export function inMessageScope(target: MessageTarget | undefined, scope: MessageScope): boolean {
    if (!target) return true;
    if (target.clients?.length && !target.clients.includes(scope.clientId)) return false;
    const matches = (want: string, ...have: (string | undefined)[]) => {
        const w = want.trim().toLowerCase();
        return have.some((h) => h && h.toLowerCase() === w);
    };
    if (target.layout && !matches(target.layout, scope.layoutId, scope.layoutSlug, scope.layoutName)) return false;
    if (target.tab && !matches(target.tab, scope.tabId, scope.tabSlug, scope.tabName)) return false;
    return true;
}

interface MessagesState {
    // ── Device-local, persisted ──────────────────────────────────────────────
    /** Message id → the timestamp this device last showed it with. */
    seen: Record<string, number>;
    /** Newest message timestamp this device has already handled. 0 = never ran. */
    lastSeenTs: number;

    // ── Mirrors of the adapter datapoints ────────────────────────────────────
    history: AuraMessage[];
    unreadCount: number;
    /**
     * From config.messageDefaults. The only presentation default the frontend owns —
     * every other one is applied by the adapter while it normalizes the payload.
     */
    maxVisible: number;

    // ── Transient UI state ──────────────────────────────────────────────────
    /** Toasts on screen or queued, oldest first. */
    open: AuraMessage[];
    scope: MessageScope;

    setScope: (scope: MessageScope) => void;
    /** Show a message on this device unless it was already handled or out of scope. */
    ingest: (msg: AuraMessage) => void;
    /** Local-only removal — used after an auto-close, so other clients keep theirs. */
    closeLocal: (id: string) => void;
    /** Confirm: mark read everywhere, write the optional ackDp, close everywhere. */
    ack: (msg: AuraMessage) => void;
    /** Close on every client without confirming — stays unread in the archive. */
    dismiss: (id: string) => void;
    /** Run one of the message's action buttons. */
    runAction: (msg: AuraMessage, index: number) => void;
    clearAll: () => void;
    /** Write a raw payload to messages.send (admin test button, condition effect). */
    send: (payload: string) => void;
}

export const useMessagesStore = create<MessagesState>()(
    persist(
        (set, get) => ({
            seen: {},
            lastSeenTs: 0,
            history: [],
            unreadCount: 0,
            maxVisible: DEFAULT_MAX_VISIBLE,
            open: [],
            scope: { clientId: '' },

            setScope: (scope) => set({ scope }),

            ingest: (msg) => {
                const s = get();
                if (!msg?.id || !Number.isFinite(msg.ts)) return;
                // Already handled at this timestamp — a reload, or the same message
                // reaching us twice (live broadcast plus the history catch-up).
                const seenTs = s.seen[msg.id];
                if (seenTs !== undefined && msg.ts <= seenTs) return;
                if (msg.dismissed) return;

                const handled = {
                    seen: rememberSeen(s.seen, msg.id, msg.ts),
                    lastSeenTs: Math.max(s.lastSeenTs, msg.ts),
                };
                if (!inMessageScope(msg.target, s.scope)) {
                    // Out of scope still counts as handled: switching to that tab
                    // later must not make an old notice pop up retroactively.
                    set(handled);
                    return;
                }
                set({
                    // A repeated id replaces its predecessor instead of stacking.
                    open: [...s.open.filter((m) => m.id !== msg.id), msg],
                    ...handled,
                });
            },

            closeLocal: (id) => set((s) => ({ open: id === '*' ? [] : s.open.filter((m) => m.id !== id) })),

            ack: (msg) => {
                if (isScreenshotMode()) return;
                if (msg.ackDp) setStateDirect(msg.ackDp, parseWriteValue(msg.ackValue));
                setStateDirect(DP_ACK, msg.id);
                get().closeLocal(msg.id);
            },

            dismiss: (id) => {
                if (isScreenshotMode()) return;
                setStateDirect(DP_DISMISS, id);
                get().closeLocal(id);
            },

            runAction: (msg, index) => {
                const action = msg.actions?.[index];
                if (!action || isScreenshotMode()) return;
                setStateDirect(action.dp, parseWriteValue(action.value));
                // A button press is an answer, so it confirms the message too.
                if (action.close) get().ack(msg);
            },

            clearAll: () => {
                if (isScreenshotMode()) return;
                setStateDirect(DP_CLEAR, true);
                set({ open: [] });
            },

            send: (payload) => {
                if (isScreenshotMode()) return;
                setStateDirect(DP_SEND, payload);
            },
        }),
        {
            name: 'aura-messages-seen',
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({ seen: s.seen, lastSeenTs: s.lastSeenTs }) as MessagesState,
        },
    ),
);

// ── Runtime ──────────────────────────────────────────────────────────────────

// The screenshot harness runs against a real instance, so a message arriving
// mid-shot would corrupt a documentation image. Off by default there;
// `__auraShot.messages(true)` re-arms it for the tests that exercise this path.
// Writes stay blocked either way (see the isScreenshotMode guards above).
let devForced = false;
export function __devForceMessages(on: boolean): void {
    devForced = on;
}

/**
 * Subscribe to the three adapter datapoints. Mounted once by ToastLayer.
 *
 * Both value streams treat their first delivery as a baseline: subscribeDpValue
 * primes with the current value, so firing on it would replay the last message on
 * every page load. The catch-up pass over `history` is what covers a device that
 * was offline — it re-delivers everything newer than `lastSeenTs`, which is why
 * missing a live broadcast is not lossy.
 */
export function startMessagesRuntime(): () => void {
    if (isScreenshotMode() && !devForced) return () => {};

    const store = useMessagesStore;
    let lastPrimed = false;
    let historyPrimed = false;

    const unsubs = [
        subscribeDpValue(DP_LAST, (value) => {
            const raw = typeof value === 'string' ? value.trim() : '';
            if (!raw) return;
            let payload: MessageBroadcast;
            try {
                payload = JSON.parse(raw) as MessageBroadcast;
            } catch {
                console.warn('[aura] messages: lastMessage is not valid JSON', raw);
                return;
            }
            if (isCloseMarker(payload)) {
                // Always honoured, including on the priming delivery: closing a
                // toast this device does not have is a harmless no-op.
                store.getState().closeLocal(payload.id);
                return;
            }
            if (!lastPrimed) {
                lastPrimed = true;
                return;
            }
            store.getState().ingest(payload);
        }),

        subscribeDpValue(DP_HISTORY, (value) => {
            const raw = typeof value === 'string' ? value.trim() : '';
            let list: AuraMessage[] = [];
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) list = parsed as AuraMessage[];
                } catch {
                    console.warn('[aura] messages: history is not valid JSON');
                }
            }
            store.setState({ history: list });

            const { lastSeenTs, ingest } = store.getState();
            if (!historyPrimed) {
                historyPrimed = true;
                // A device that has never run must not replay the whole archive.
                if (lastSeenTs === 0) {
                    store.setState({ lastSeenTs: Date.now() });
                    return;
                }
            }
            // Catch-up, oldest first so the toast stack ends up in send order.
            for (const msg of [...list].reverse()) {
                if (msg && msg.ts > lastSeenTs) ingest(msg);
            }
        }),

        subscribeDpValue(DP_UNREAD, (value) => {
            const n = Number(value);
            store.setState({ unreadCount: Number.isFinite(n) && n > 0 ? n : 0 });
        }),

        subscribeDpValue(DP_DEFAULTS, (value) => {
            const raw = typeof value === 'string' ? value.trim() : '';
            let n = NaN;
            if (raw) {
                try {
                    n = Number((JSON.parse(raw) as { maxVisible?: unknown }).maxVisible);
                } catch {
                    /* the adapter logs the parse failure; fall back silently */
                }
            }
            store.setState({ maxVisible: Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : DEFAULT_MAX_VISIBLE });
        }),
    ];

    return () => unsubs.forEach((u) => u());
}
