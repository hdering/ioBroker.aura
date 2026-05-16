/**
 * Publish list-widget data to ioBroker states under aura.0.lists.<widgetId>.*
 *
 * The adapter pre-creates aura.0.lists as a channel; the widget creates the
 * per-widget channel + state objects on-demand and updates the value.
 */
import { setObjectDirect, setStateDirect, deleteObjectDirect } from '../hooks/useIoBroker';

const NAMESPACE = 'aura.0.lists';

export function listChannelId(widgetId: string): string {
  return `${NAMESPACE}.${widgetId}`;
}

export function listCountStateId(widgetId: string): string {
  return `${NAMESPACE}.${widgetId}.count`;
}

/** Create channel + count state objects if they don't exist, then write the value. */
export function publishListCount(widgetId: string, title: string, count: number): void {
  setObjectDirect(listChannelId(widgetId), {
    type: 'channel',
    common: { name: title || 'List widget' },
    native: {},
  });
  setObjectDirect(listCountStateId(widgetId), {
    type: 'state',
    common: { name: `${title || 'List widget'} — count`, type: 'number', role: 'value', read: true, write: false, def: 0 },
    native: {},
  });
  setStateDirect(listCountStateId(widgetId), count, true);
}

/** Remove the widget's state + channel objects. Safe to call even if they don't exist. */
export async function unpublishList(widgetId: string): Promise<void> {
  await deleteObjectDirect(listCountStateId(widgetId));
  await deleteObjectDirect(listChannelId(widgetId));
}
