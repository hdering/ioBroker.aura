/**
 * Publish the Countdown widget's configuration to ioBroker states under
 * aura.0.countdowns.<key>.* and send it commands (#675).
 *
 * The adapter (lib/countdowns.js) runs the countdown: it reads `config`, acts on
 * `cmd` and reports back through `state`, `endTs`, `remainingMs`, `durationMs`.
 * Mirrors publishTimerConfig.ts — the per-widget channel and states are created
 * on demand here, deletes and renames go through the adapter via sendTo so they
 * run with the adapter's permissions.
 */
import { setStateDirect, getSocket, sendToDirect } from '../hooks/useIoBroker';
import { NS } from './namespace';

function setObjectAsync(id: string, obj: object): Promise<void> {
    const socket = getSocket();
    // Offline (or the screenshot harness): the emit callback would never fire and
    // the publish would hang forever. Resolve right away — the state write that
    // follows is dropped or captured downstream, and the widget republishes as
    // soon as the socket connects (see CountdownWidget).
    if (!socket.connected) return Promise.resolve();
    return new Promise((resolve) => {
        socket.emit('setObject', id, obj, () => resolve());
    });
}

const NAMESPACE = `${NS}.countdowns`;

export type CountdownStateKey = 'config' | 'cmd' | 'state' | 'endTs' | 'remainingMs' | 'durationMs';

export function countdownChannelId(key: string): string {
    return `${NAMESPACE}.${key}`;
}

export function countdownStateId(key: string, sub: CountdownStateKey): string {
    return `${NAMESPACE}.${key}.${sub}`;
}

/** What the adapter reads from `config`. Kept flat and JSON-serialisable. */
export interface CountdownConfigPayload {
    durationSec: number;
    targetDp?: string;
    valueOnEnd?: string;
    valueOnStart?: string;
    stopWritesEnd?: boolean;
    publishRemaining?: boolean;
    title?: string;
}

// Same definitions as COUNTDOWN_STATE_DEFS in lib/countdowns.js.
const STATE_DEFS: Record<CountdownStateKey, Record<string, unknown>> = {
    config: { type: 'string', role: 'json', read: true, write: true, def: '' },
    cmd: { type: 'string', role: 'text', read: true, write: true, def: '' },
    state: { type: 'string', role: 'text', read: true, write: false, def: 'idle' },
    endTs: { type: 'number', role: 'date', read: true, write: false, def: 0 },
    remainingMs: { type: 'number', role: 'value.interval', unit: 'ms', read: true, write: false, def: 0 },
    durationMs: { type: 'number', role: 'value.interval', unit: 'ms', read: true, write: false, def: 0 },
};

const ensurePromises = new Map<string, Promise<void>>();

function ensureObjects(key: string, title: string): Promise<void> {
    const existing = ensurePromises.get(key);
    if (existing) return existing;
    const name = title || 'Countdown';
    const p = (async () => {
        await setObjectAsync(countdownChannelId(key), { type: 'channel', common: { name }, native: {} });
        for (const [sub, def] of Object.entries(STATE_DEFS) as [CountdownStateKey, Record<string, unknown>][]) {
            await setObjectAsync(countdownStateId(key, sub), {
                type: 'state',
                common: { name: `${name} — ${sub}`, ...def },
                native: {},
            });
        }
    })();
    ensurePromises.set(key, p);
    return p;
}

export function publishCountdownConfig(key: string, title: string, payload: CountdownConfigPayload): void {
    void ensureObjects(key, title).then(() => {
        setStateDirect(countdownStateId(key, 'config'), JSON.stringify(payload), false);
    });
}

/** Write a command (start, pause, resume, toggle, stop, end, +N, -N, =N). */
export function sendCountdownCmd(key: string, cmd: string): void {
    setStateDirect(countdownStateId(key, 'cmd'), cmd, false);
}

export async function unpublishCountdown(key: string): Promise<void> {
    ensurePromises.delete(key);
    const result = await sendToDirect<{ ok: boolean; error?: string }>(NS, 'deleteCountdown', { widgetId: key });
    console.info('[aura-countdown] deleteCountdown result', key, result);
}

/** Backend key (last segment of stateBaseId) of a countdown widget, or null. */
export function countdownBackendKey(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): string | null {
    if (!widget || widget.type !== 'countdown') return null;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return null;
    const seg = stateBaseId.split('.').pop();
    return seg || null;
}

/** Cleanup backend DPs for a widget about to be deleted. No-op for other types. */
export function unpublishCountdownForWidget(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    const key = countdownBackendKey(widget);
    if (key) void unpublishCountdown(key);
}

const lastRenameSent = new Map<string, string>();
export function renameCountdownForWidget(
    widget: { type?: string; title?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    const key = countdownBackendKey(widget);
    if (!key) return;
    const title = widget?.title || 'Countdown';
    if (lastRenameSent.get(key) === title) return;
    lastRenameSent.set(key, title);
    void sendToDirect(NS, 'renameCountdown', { widgetId: key, title });
}

export function renameAllCountdowns(
    widgets: Array<{ type?: string; title?: string; options?: Record<string, unknown> }>,
): void {
    for (const w of widgets) renameCountdownForWidget(w);
}
