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

// Track which widget IDs have already had their objects created in this session,
// so we don't re-emit setObject on every count change.
const ensuredObjects = new Set<string>();

/** Create channel + count state objects if they don't exist, then write the value. */
export function publishListCount(widgetId: string, title: string, count: number): void {
  if (!ensuredObjects.has(widgetId)) {
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
    ensuredObjects.add(widgetId);
  }
  // ack=false — frontend connections aren't permitted to write ack=true,
  // so the previous publish silently failed and the state never updated.
  setStateDirect(listCountStateId(widgetId), count, false);
}

/** Remove the widget's state + channel objects. Safe to call even if they don't exist. */
export async function unpublishList(widgetId: string): Promise<void> {
  ensuredObjects.delete(widgetId);
  await deleteObjectDirect(listCountStateId(widgetId));
  await deleteObjectDirect(listChannelId(widgetId));
}
