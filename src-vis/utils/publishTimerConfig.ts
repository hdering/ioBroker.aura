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
import { setObjectDirect, setStateDirect, deleteObjectDirect } from '../hooks/useIoBroker';
import type { TimerEvent } from '../types';

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
  holidaysDp?: string;
  vacationDp?: string;
  title?: string;
}

const ensuredObjects = new Set<string>();

function ensureObjects(widgetId: string, title: string): void {
  if (ensuredObjects.has(widgetId)) return;
  setObjectDirect(timerChannelId(widgetId), {
    type: 'channel',
    common: { name: title || 'Zeitschaltuhr' },
    native: {},
  });
  setObjectDirect(timerConfigStateId(widgetId), {
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
  setObjectDirect(timerEnabledStateId(widgetId), {
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
  ensuredObjects.add(widgetId);
}

export function publishTimerConfig(widgetId: string, title: string, payload: TimerConfigPayload): void {
  ensureObjects(widgetId, title);
  setStateDirect(timerConfigStateId(widgetId), JSON.stringify(payload), false);
}

export function publishTimerEnabled(widgetId: string, title: string, enabled: boolean): void {
  ensureObjects(widgetId, title);
  setStateDirect(timerEnabledStateId(widgetId), enabled, false);
}

export async function unpublishTimer(widgetId: string): Promise<void> {
  ensuredObjects.delete(widgetId);
  await deleteObjectDirect(timerConfigStateId(widgetId));
  await deleteObjectDirect(timerEnabledStateId(widgetId));
  await deleteObjectDirect(timerChannelId(widgetId));
}
