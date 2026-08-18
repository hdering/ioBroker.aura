import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { subscribeDpValue, setStateDirect } from '../hooks/useIoBroker';
import { isScreenshotMode } from './persistManager';
import { NS } from '../utils/namespace';
import type { AuraMessage, MessageBroadcast, MessageSeverity, MessageTarget } from '../types';

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
 * localStorage rather than through managedStorage: `seen` and `lastSeenTs`.
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

/**
 * Which severities come back after a reload while they are still unread. Errors
 * by default: a tablet that reloads itself every few hours (or after losing the
 * connection) must not be the reason nobody ever sees the failure.
 */
export const DEFAULT_RESTORE_SEVERITIES: MessageSeverity[] = ['error'];

const ALL_SEVERITIES: MessageSeverity[] = ['info', 'success', 'warning', 'error'];

/**
 * Ids this browser session has already dealt with — shown, closed or filtered out.
 * Deliberately RAM-only, unlike `seen`: it is what stops a restored message from
 * popping straight back up after it was closed, while a reload clears it and lets
 * an unanswered message return. That is the whole point of the feature.
 */
const sessionHandled = new Set<string>();

/**
 * Does this archive entry belong back on screen after a reload? Nobody has
 * answered it yet (neither confirmed nor closed on any client), and it is either a
 * severity the admin marked as surviving a reload or one that demands a
 * confirmation — a message whose only way out is the confirm button cannot be
 * dropped by a refresh.
 */
export function survivesReload(msg: AuraMessage, severities: MessageSeverity[]): boolean {
    if (!msg || msg.read || msg.dismissed) return false;
    return msg.requireAck === true || severities.includes(msg.severity);
}

/** Forget what this session showed — the screenshot harness models a page load with it. */
export function clearSessionHandled(): void {
    sessionHandled.clear();
}

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
 * Case-insensitive match of a hand-written target name against the identifiers it
 * could plausibly mean. A `target` is usually typed into a script by hand, so slug,
 * id and display name are all accepted.
 */
export function matchesRef(want: string, ...have: (string | undefined)[]): boolean {
    const w = want.trim().toLowerCase();
    return have.some((h) => h && h.toLowerCase() === w);
}

/** Does this device show the message? Mirrors `inScope` in DpPopupTriggers. */
export function inMessageScope(target: MessageTarget | undefined, scope: MessageScope): boolean {
    if (!target) return true;
    if (target.clients?.length && !target.clients.includes(scope.clientId)) return false;
    if (target.layout && !matchesRef(target.layout, scope.layoutId, scope.layoutSlug, scope.layoutName)) return false;
    if (target.tab && !matchesRef(target.tab, scope.tabId, scope.tabSlug, scope.tabName)) return false;
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
     * From config.messageDefaults. The only presentation defaults the frontend owns —
     * every other one is applied by the adapter while it normalizes the payload.
     */
    maxVisible: number;
    /** Severities that reappear after a reload as long as they are unanswered. */
    restoreSeverities: MessageSeverity[];

    // ── Transient UI state ──────────────────────────────────────────────────
    /** Toasts on screen or queued, oldest first. */
    open: AuraMessage[];
    scope: MessageScope;

    /**
     * A toast layer is mounted and this view is a display surface. Without one
     * nothing may be ingested: a message reaching a view that cannot show it would
     * still be marked as handled, and the dashboard would never see it (the admin
     * area holds a runtime lease for its history list, so this really happens).
     */
    displayActive: boolean;

    setScope: (scope: MessageScope) => void;
    setDisplayActive: (active: boolean) => void;
    /**
     * Show a message on this device unless it was already handled or out of scope.
     * `force` is the reload restore: it ignores `seen`, because having shown the
     * message before the refresh is exactly the situation it exists for.
     */
    ingest: (msg: AuraMessage, force?: boolean) => void;
    /** Local-only removal — used after an auto-close, so other clients keep theirs. */
    closeLocal: (id: string) => void;
    /**
     * The close button. A message that survives a reload has to close everywhere,
     * otherwise the next refresh would just bring it back on this very device.
     */
    closeByUser: (msg: AuraMessage) => void;
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

/** Payloads `send()` swallowed because screenshot mode blocks the write. */
const devSentPayloads: string[] = [];
export function __devSentMessages(): string[] {
    return [...devSentPayloads];
}
export function __devClearSentMessages(): void {
    devSentPayloads.length = 0;
}

export const useMessagesStore = create<MessagesState>()(
    persist(
        (set, get) => ({
            seen: {},
            lastSeenTs: 0,
            history: [],
            unreadCount: 0,
            maxVisible: DEFAULT_MAX_VISIBLE,
            restoreSeverities: DEFAULT_RESTORE_SEVERITIES,
            open: [],
            scope: { clientId: '' },
            displayActive: false,

            setScope: (scope) => set({ scope }),
            setDisplayActive: (displayActive) => set({ displayActive }),

            ingest: (msg, force) => {
                const s = get();
                if (!msg?.id || !Number.isFinite(msg.ts)) return;
                if (!s.displayActive) return;
                // Already handled at this timestamp — a reload, or the same message
                // reaching us twice (live broadcast plus the history catch-up).
                const seenTs = s.seen[msg.id];
                if (!force && seenTs !== undefined && msg.ts <= seenTs) return;
                if (msg.dismissed) return;
                sessionHandled.add(msg.id);

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

            closeLocal: (id) => {
                const s = get();
                if (id === '*') s.open.forEach((m) => sessionHandled.add(m.id));
                else sessionHandled.add(id);
                set({ open: id === '*' ? [] : s.open.filter((m) => m.id !== id) });
            },

            closeByUser: (msg) => {
                const s = get();
                // Closing it here is the answer the archive was waiting for, so it
                // goes out to every client and is remembered server-side.
                if (survivesReload(msg, s.restoreSeverities)) s.dismiss(msg.id);
                s.closeLocal(msg.id);
            },

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
                // Screenshot mode never writes to the real instance; record instead,
                // so a test can assert what *would* have been sent.
                if (isScreenshotMode()) {
                    devSentPayloads.push(payload);
                    return;
                }
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

// Reference-counted so several consumers can ask for it: the ToastLayer always
// does, and the Meldungen widget / admin page need the history even where no
// toast layer is mounted (widget editor, admin). The subscriptions exist once.
let runtimeUsers = 0;
let runtimeStop: (() => void) | null = null;

/**
 * Subscribe to the adapter datapoints for as long as at least one caller holds
 * the returned release function.
 *
 * Both value streams treat their first delivery as a baseline: subscribeDpValue
 * primes with the current value, so firing on it would replay the last message on
 * every page load. The catch-up pass over `history` is what covers a device that
 * was offline — it re-delivers everything newer than `lastSeenTs`, which is why
 * missing a live broadcast is not lossy.
 */
export function startMessagesRuntime(): () => void {
    if (isScreenshotMode() && !devForced) return () => {};

    runtimeUsers += 1;
    if (runtimeUsers === 1) runtimeStop = openSubscriptions();
    return () => {
        runtimeUsers -= 1;
        if (runtimeUsers === 0) {
            runtimeStop?.();
            runtimeStop = null;
        }
    };
}

/**
 * Put unanswered messages back on screen after a page load.
 *
 * The archive — not this device — is the authority on what is still open, so a
 * refresh, a nightly reload or a reconnect no longer loses an error nobody has
 * dealt with. `sessionHandled` is what keeps it to once per page load: a message
 * closed here stays closed until the next reload, and a message that was answered
 * on any client is `read`/`dismissed` in the archive and never comes back at all.
 */
function restoreUnanswered(oldestFirst: AuraMessage[]): void {
    const { restoreSeverities, ingest } = useMessagesStore.getState();
    for (const msg of oldestFirst) {
        if (!msg || sessionHandled.has(msg.id)) continue;
        if (survivesReload(msg, restoreSeverities)) ingest(msg, true);
    }
}

/**
 * The archive arrived. Mirrors it, delivers what this device missed and restores
 * what is still unanswered. Exported so the screenshot harness can drive the same
 * path the subscription does — the reload behaviour is only testable from here.
 *
 * `firstDelivery` marks the priming value subscribeDpValue hands over right after
 * subscribing: on it, a device that has never run must not replay the archive.
 */
export function applyMessageHistory(list: AuraMessage[], firstDelivery: boolean): void {
    const store = useMessagesStore;
    store.setState({ history: list });

    const { lastSeenTs, ingest } = store.getState();
    // Oldest first in both passes, so the toast stack ends up in send order.
    const oldestFirst = [...list].reverse();
    if (firstDelivery && lastSeenTs === 0) {
        store.setState({ lastSeenTs: Date.now() });
        // Everything except what is still waiting for an answer (see below).
        restoreUnanswered(oldestFirst);
        return;
    }
    // Catch-up for the time this device was away.
    for (const msg of oldestFirst) {
        if (msg && msg.ts > lastSeenTs) ingest(msg);
    }
    restoreUnanswered(oldestFirst);
}

function openSubscriptions(): () => void {
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
            const first = !historyPrimed;
            historyPrimed = true;
            applyMessageHistory(list, first);
        }),

        subscribeDpValue(DP_UNREAD, (value) => {
            const n = Number(value);
            store.setState({ unreadCount: Number.isFinite(n) && n > 0 ? n : 0 });
        }),

        subscribeDpValue(DP_DEFAULTS, (value) => {
            const raw = typeof value === 'string' ? value.trim() : '';
            let n = NaN;
            let restore: MessageSeverity[] | null = null;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw) as { maxVisible?: unknown; restoreSeverities?: unknown };
                    n = Number(parsed.maxVisible);
                    if (Array.isArray(parsed.restoreSeverities)) {
                        restore = parsed.restoreSeverities.filter((sev): sev is MessageSeverity =>
                            ALL_SEVERITIES.includes(sev as MessageSeverity),
                        );
                    }
                } catch {
                    /* the adapter logs the parse failure; fall back silently */
                }
            }
            store.setState({
                maxVisible: Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : DEFAULT_MAX_VISIBLE,
                restoreSeverities: restore ?? DEFAULT_RESTORE_SEVERITIES,
            });
        }),
    ];

    return () => unsubs.forEach((u) => u());
}
