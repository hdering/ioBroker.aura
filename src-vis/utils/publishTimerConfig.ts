/**
 * Publish Zeitschaltuhr (timer) configuration to ioBroker states under
 * aura.0.timers.<widgetId>.*  so the adapter's backend scheduler can read and
 * fire the configured events.
 *
 * Two states per widget:
 *   - config  (string, JSON-serialized { events, holidaysDp?, vacationDp? })
 *   - enabled (boolean, master switch)
 *
 * The adapter pre-creates aura.0.timers as a channel; the per-widget channel +
 * states are created on-demand here. The adapter subscribes to timers.* and
 * rebuilds its in-memory schedule whenever a state changes.
 */
import {
    setStateConfirmed,
    getSocket,
    sendToDirect,
    getDisconnectedSince,
    onDisconnectedSinceChange,
    devWritesBlocked,
} from '../hooks/useIoBroker';
import type { TimerEvent } from '../types';
import { NS } from './namespace';

/** Promise wrapper around setObject so callers can await object creation
 *  before writing the corresponding state — otherwise iobroker logs
 *  "State has no existing object" warnings. */
function setObjectAsync(id: string, obj: object): Promise<void> {
    if (devWritesBlocked()) return Promise.resolve();
    return new Promise((resolve) => {
        getSocket().emit('setObject', id, obj, () => resolve());
    });
}

const NAMESPACE = `${NS}.timers`;

export function timerChannelId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}`;
}

export function timerConfigStateId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}.config`;
}

export function timerEnabledStateId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}.enabled`;
}

export interface TimerConfigPayload {
    events: TimerEvent[];
    targetDp?: string; // widget-level: where to write when an event fires
    extraTargetDps?: string[]; // further DPs written with the same value (#774)
    value?: string; // widget-level: what to write (parsed bool/number/string)
    allowEventValue?: boolean; // when true, backend honors per-event ev.value overrides
    holidaysDp?: string;
    vacationDp?: string;
    holidaysValue?: string; // exception value while holidaysDp marks today (#757)
    vacationValue?: string; // exception value while vacationDp marks today (#757)
    title?: string;
}

/** widgetId → pending object-creation promise. While the promise is unresolved,
 *  any state writes wait on it so they hit ioBroker after the object exists. */
const ensurePromises = new Map<string, Promise<void>>();

function ensureObjects(widgetId: string, title: string): Promise<void> {
    const existing = ensurePromises.get(widgetId);
    if (existing) return existing;
    const p = (async () => {
        await setObjectAsync(timerChannelId(widgetId), {
            type: 'channel',
            common: { name: title || 'Zeitschaltuhr' },
            native: {},
        });
        await setObjectAsync(timerConfigStateId(widgetId), {
            type: 'state',
            common: {
                name: `${title || 'Zeitschaltuhr'} — config`,
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await setObjectAsync(timerEnabledStateId(widgetId), {
            type: 'state',
            common: {
                name: `${title || 'Zeitschaltuhr'} — enabled`,
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
    })();
    ensurePromises.set(widgetId, p);
    return p;
}

/** Writes the server has not confirmed yet, keyed by state id → the retry.
 *  A timer saved while the socket reconnects (tablet back from standby) was lost:
 *  the client drops the emit without a callback, TimerWidget already counted it
 *  as published, and the adapter kept the old schedule (#778). Re-sent on the
 *  next connect; a confirmed write leaves the map, so a tab that was merely
 *  offline never overwrites a newer edit made on another device meanwhile. */
const unconfirmed = new Map<string, () => void>();
let wasConnected = getDisconnectedSince() === null;
// Before the very first connect the client queues emits itself — retry only after a drop.
let everConnected = wasConnected;
onDisconnectedSinceChange(() => {
    const connected = getDisconnectedSince() === null;
    if (connected && !wasConnected && everConnected && unconfirmed.size > 0) {
        const retries = [...unconfirmed.values()];
        // The object creation may hang on a dropped setObject as well — start over.
        ensurePromises.clear();
        retries.forEach((retry) => retry());
    }
    wasConnected = connected;
    if (connected) everConnected = true;
});

function publishState(widgetId: string, title: string, stateId: string, val: string | boolean): void {
    const attempt = (): void => {
        void ensureObjects(widgetId, title)
            .then(() => setStateConfirmed(stateId, val, false))
            .then((ok) => {
                if (ok && unconfirmed.get(stateId) === attempt) unconfirmed.delete(stateId);
            });
    };
    unconfirmed.set(stateId, attempt);
    attempt();
}

export function publishTimerConfig(widgetId: string, title: string, payload: TimerConfigPayload): void {
    publishState(widgetId, title, timerConfigStateId(widgetId), JSON.stringify(payload));
}

export function publishTimerEnabled(widgetId: string, title: string, enabled: boolean): void {
    publishState(widgetId, title, timerEnabledStateId(widgetId), enabled);
}

export async function unpublishTimer(widgetId: string): Promise<void> {
    ensurePromises.delete(widgetId);
    unconfirmed.delete(timerConfigStateId(widgetId));
    unconfirmed.delete(timerEnabledStateId(widgetId));
    // delObject over the web socket is permission-gated and silently dropped for
    // non-admin users. Route the cleanup through the adapter via sendTo so it
    // runs as the adapter instance (full permissions).
    const result = await sendToDirect<{ ok: boolean; error?: string; results?: Record<string, string> }>(
        NS,
        'deleteTimer',
        { widgetId },
    );
    console.info('[aura-timer] deleteTimer result', widgetId, result);
}

/** Cleanup backend DPs for a widget about to be deleted. Safe to call for any
 *  widget type — only acts on type==='timer' with a stamped stateBaseId. */
export function unpublishTimerForWidget(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    if (!widget || widget.type !== 'timer') return;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return;
    const backendKey = stateBaseId.split('.').pop();
    if (!backendKey) return;
    void unpublishTimer(backendKey);
    // Per-device schedules of a shared popup / device card timer (#778).
    void listTimerIds().then((ids) => {
        for (const id of ids) if (timerInstanceBase(id) === backendKey && id !== backendKey) void unpublishTimer(id);
    });
}

// ── Shared templates (#778) ──────────────────────────────────────────────────
// A timer inside a popup view or a device card is ONE stored widget rendered for
// many devices. Each resolved target gets its own backend schedule under
// <base>_<hash>; the events stay with the template until edited for a device.

/** FNV-1a, base36 — short, stable, safe in an object id. */
function hashKey(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

/** Backend key of one device's schedule. Base keys (UUID / t-…) contain no '_'. */
export function timerInstanceBackendKey(baseKey: string, instanceKey: string): string {
    return `${baseKey}_${hashKey(instanceKey)}`;
}

/** Base key a backend key belongs to — itself for a plain timer. */
export function timerInstanceBase(backendKey: string): string {
    return backendKey.split('_')[0];
}

/** Which device a templated timer runs for: its resolved targets. Null while a
 *  `{{…}}` token is unresolved — such a schedule could only write to nowhere. */
export function timerInstanceKey(targets: string[]): string | null {
    if (targets.length === 0 || targets.some((t) => t.includes('{{'))) return null;
    return targets.join('|');
}

/** Before #778 a shared template published ONE schedule under its base key, which
 *  wrote to whichever device was opened last. Removed once its per-device
 *  schedules take over; checked once per base key and page session. */
const droppedShared = new Set<string>();
let remoteTimerIds: Promise<string[]> | null = null;
export function dropSharedTemplateTimer(baseKey: string): void {
    if (droppedShared.has(baseKey)) return;
    droppedShared.add(baseKey);
    remoteTimerIds ??= listTimerIds();
    void remoteTimerIds.then((ids) => {
        if (ids.includes(baseKey)) void unpublishTimer(baseKey);
    });
}

/** Push a title change to ioBroker for a timer widget. Runs via sendTo so the
 *  adapter does the extendObject under full permissions. Caller is responsible
 *  for triggering this at the right moment (typically on an explicit save) —
 *  the AdminWidgets InlineEditForm calls onUpdate per keystroke, so calling
 *  this from there would spam the adapter. No-op for non-timer widgets /
 *  widgets without stateBaseId / when the title matches the last sent value. */
const lastRenameSent = new Map<string, string>();
export function renameTimerForWidget(
    widget: { type?: string; title?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    if (!widget || widget.type !== 'timer') return;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return;
    const backendKey = stateBaseId.split('.').pop();
    if (!backendKey) return;
    const title = widget.title || 'Zeitschaltuhr';
    if (lastRenameSent.get(backendKey) === title) return;
    lastRenameSent.set(backendKey, title);
    void sendToDirect(NS, 'renameTimer', { widgetId: backendKey, title });
}

/** Walk a list of widgets and push rename for every timer. Cheap thanks to the
 *  lastRenameSent cache + the adapter's no-op-if-name-matches check. */
export function renameAllTimers(
    widgets: Array<{ type?: string; title?: string; options?: Record<string, unknown> }>,
): void {
    for (const w of widgets) renameTimerForWidget(w);
}

/** Ask the adapter which widgetIds currently have an aura.0.timers.<id>
 *  channel in ioBroker. Used by the orphan detector on the Übersicht page. */
export async function listTimerIds(): Promise<string[]> {
    const r = await sendToDirect<{ ok: boolean; widgetIds?: string[] }>(NS, 'listTimers', {});
    if (r && typeof r === 'object' && 'widgetIds' in r && Array.isArray((r as { widgetIds?: string[] }).widgetIds)) {
        return (r as { widgetIds: string[] }).widgetIds;
    }
    return [];
}

/** Extract the backendKey segment from a widget's stateBaseId, or null. */
export function timerBackendKey(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): string | null {
    if (!widget || widget.type !== 'timer') return null;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return null;
    const seg = stateBaseId.split('.').pop();
    return seg || null;
}
