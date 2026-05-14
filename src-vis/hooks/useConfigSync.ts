import { useCallback, useEffect, useRef } from 'react';
import { getStateDirect, subscribeStateDirect } from './useIoBroker';
import { useDashboardStore } from '../store/dashboardStore';
import { hydrateGroupDefs } from '../store/groupDefsStore';
import { isDirty, isSavingRecently, discardPending, IOBROKER_STATE_MAP, type SyncStoreKey } from '../store/persistManager';
import { applyRaw, rehydrateAll } from '../utils/configLoader';

/** Apply one state value received from ioBroker to localStorage + stores. */
function applyOneState(key: SyncStoreKey, raw: string): boolean {
  if (!raw || raw.length < 3) return false;

  if (key === 'aura-group-defs') {
    hydrateGroupDefs(raw);
    return true;
  }

  // Preserve in-memory activeTabId/activeLayoutId for the dashboard key —
  // navigation state is flushed directly to localStorage and must not be
  // overwritten by a slightly stale remote copy.
  let remoteStr = raw;
  if (key === 'aura-dashboard') {
    try {
      const parsed = JSON.parse(remoteStr) as Record<string, unknown>;
      const current = useDashboardStore.getState();
      if (parsed.state && typeof parsed.state === 'object') {
        const state = parsed.state as Record<string, unknown>;
        state.activeLayoutId = current.activeLayoutId;
        if (Array.isArray(state.layouts)) {
          state.layouts = (state.layouts as Array<Record<string, unknown>>).map((l) => {
            const cur = current.layouts.find((cl) => cl.id === (l as { id: string }).id);
            return cur ? { ...l, activeTabId: cur.activeTabId } : l;
          });
        }
        parsed.state = state;
        remoteStr = JSON.stringify(parsed);
      }
    } catch { /* leave remoteStr unchanged */ }
  }

  if (remoteStr === localStorage.getItem(key)) return false;
  applyRaw(key, remoteStr);
  return true;
}

/**
 * Subscribes to each config state individually and polls every 30 s as fallback.
 * With separate ioBroker states, each store reacts only to its own state change
 * — no parsing of a large blob on every update.
 */
export function useConfigSync(connected: boolean, configLoaded: React.MutableRefObject<boolean>): void {

  // 1. Subscribe to each state — immediate push on stateChange
  useEffect(() => {
    const unsubs = (Object.entries(IOBROKER_STATE_MAP) as [SyncStoreKey, string][]).map(
      ([key, stateId]) =>
        subscribeStateDirect(stateId, (state) => {
          if (!state?.val || !configLoaded.current) return;
          if (isDirty() || isSavingRecently()) return;
          if (applyOneState(key, String(state.val))) {
            rehydrateAll(false);
            discardPending();
          }
        }),
    );
    return () => unsubs.forEach((u) => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Polling every 30 s — fallback for HTTPS/proxy setups.
  //    group-defs excluded from polling (large, RAM-only, subscription is sufficient).
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const poll = useCallback(() => {
    if (!configLoaded.current || isDirty() || isSavingRecently()) return;
    const pollKeys = (Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[]).filter((k) => k !== 'aura-group-defs');
    Promise.all(
      pollKeys.map((key) =>
        getStateDirect(IOBROKER_STATE_MAP[key]).then((state) => {
          if (!state?.val) return false;
          return applyOneState(key, String(state.val));
        }),
      ),
    ).then((results) => {
      if (results.some(Boolean)) { rehydrateAll(false); discardPending(); }
    });
  }, []);

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!connected) { pollingRef.current = null; return; }
    pollingRef.current = setInterval(poll, 30_000);
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [connected, poll]);
}
