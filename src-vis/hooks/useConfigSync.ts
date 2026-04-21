import { useCallback, useEffect, useRef } from 'react';
import { getStateDirect, subscribeStateDirect } from './useIoBroker';
import { useDashboardStore } from '../store/dashboardStore';
import { useThemeStore } from '../store/themeStore';
import { useGroupStore } from '../store/groupStore';
import { useConfigStore } from '../store/configStore';
import { isDirty } from '../store/persistManager';

const IOBROKER_CONFIG_KEY = 'aura.0.config.dashboard';
const SYNC_STORE_KEYS = ['aura-dashboard', 'aura-theme', 'aura-groups', 'aura-config'] as const;

/**
 * Subscribes to aura.0.config.dashboard and polls every 10 s.
 * Rehydrates all stores when the remote value differs from localStorage.
 * Safe to call in both the frontend App and the admin AdminLayout.
 *
 * @param connected  Current socket connected state (from useIoBroker).
 * @param configLoaded  Ref that is set to true once the initial ioBroker
 *                      config has been loaded (prevents processing before
 *                      the first load completes).
 */
export function useConfigSync(connected: boolean, configLoaded: React.MutableRefObject<boolean>): void {
  const applyRemoteConfigRaw = useCallback((raw: string) => {
    // Don't overwrite pending local changes – user is still editing
    if (isDirty()) return;
    try {
      const remote = JSON.parse(raw) as Record<string, unknown>;
      let changed = false;
      SYNC_STORE_KEYS.forEach((key) => {
        const remoteVal = remote[key];
        if (!remoteVal) return;
        const remoteStr = typeof remoteVal === 'string' ? remoteVal : JSON.stringify(remoteVal);
        if (remoteStr && remoteStr !== localStorage.getItem(key)) {
          localStorage.setItem(key, remoteStr);
          changed = true;
        }
      });
      if (changed) {
        useDashboardStore.persist.rehydrate();
        useThemeStore.persist.rehydrate();
        useGroupStore.persist.rehydrate();
        useConfigStore.persist.rehydrate();
      }
    } catch { /* ignore malformed JSON */ }
  }, []);

  // 1. Subscription – immediate push when stateChange arrives
  useEffect(() => {
    return subscribeStateDirect(IOBROKER_CONFIG_KEY, (state) => {
      if (!state?.val || !configLoaded.current) return;
      applyRemoteConfigRaw(String(state.val));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Polling every 10 s – fallback for HTTPS/proxy setups where push
  //    events may not arrive reliably
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!connected) { pollingRef.current = null; return; }
    pollingRef.current = setInterval(() => {
      if (!configLoaded.current) return;
      void getStateDirect(IOBROKER_CONFIG_KEY).then((state) => {
        if (state?.val) applyRemoteConfigRaw(String(state.val));
      });
    }, 10_000);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [connected, applyRemoteConfigRaw]); // eslint-disable-line react-hooks/exhaustive-deps -- configLoaded is a ref, intentionally excluded
}
