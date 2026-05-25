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
import { setStateDirect, getSocket, sendToDirect } from '../hooks/useIoBroker';
import type { TimerEvent } from '../types';

/** Promise wrapper around setObject so callers can await object creation
 *  before writing the corresponding state — otherwise iobroker logs
 *  "State has no existing object" warnings. */
function setObjectAsync(id: string, obj: object): Promise<void> {
  return new Promise((resolve) => {
    getSocket().emit('setObject', id, obj, () => resolve());
  });
}

const NAMESPACE = 'aura.0.timers';

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
  targetDp?: string;       // widget-level: where to write when an event fires
  value?: string;          // widget-level: what to write (parsed bool/number/string)
  allowEventValue?: boolean; // when true, backend honors per-event ev.value overrides
  holidaysDp?: string;
  vacationDp?: string;
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

export function publishTimerConfig(widgetId: string, title: string, payload: TimerConfigPayload): void {
  void ensureObjects(widgetId, title).then(() => {
    setStateDirect(timerConfigStateId(widgetId), JSON.stringify(payload), false);
  });
}

export function publishTimerEnabled(widgetId: string, title: string, enabled: boolean): void {
  void ensureObjects(widgetId, title).then(() => {
    setStateDirect(timerEnabledStateId(widgetId), enabled, false);
  });
}

export async function unpublishTimer(widgetId: string): Promise<void> {
  ensurePromises.delete(widgetId);
  // delObject over the web socket is permission-gated and silently dropped for
  // non-admin users. Route the cleanup through the adapter via sendTo so it
  // runs as the adapter instance (full permissions).
  const result = await sendToDirect<{ ok: boolean; error?: string; results?: Record<string, string> }>(
    'aura.0', 'deleteTimer', { widgetId },
  );
  console.info('[aura-timer] deleteTimer result', widgetId, result);
}

/** Cleanup backend DPs for a widget about to be deleted. Safe to call for any
 *  widget type — only acts on type==='timer' with a stamped stateBaseId. */
export function unpublishTimerForWidget(widget: { type?: string; options?: Record<string, unknown> } | null | undefined): void {
  if (!widget || widget.type !== 'timer') return;
  const stateBaseId = widget.options?.stateBaseId;
  if (typeof stateBaseId !== 'string') return;
  const backendKey = stateBaseId.split('.').pop();
  if (!backendKey) return;
  void unpublishTimer(backendKey);
}
