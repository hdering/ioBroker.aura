import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { isDirty, subscribeDirty } from '../store/persistManager';
import { sendToDirect } from './useIoBroker';
import { listTimerIds, timerBackendKey } from '../utils/publishTimerConfig';
import type { WidgetConfig } from '../types';

function collectKnownTimerKeys(): Set<string> {
  const out = new Set<string>();
  const visit = (w: WidgetConfig) => {
    const key = timerBackendKey(w);
    if (key) out.add(key);
  };

  const layouts = useDashboardStore.getState().layouts;
  for (const l of layouts) for (const tab of l.tabs) for (const w of tab.widgets) visit(w);

  const defs = useGroupDefsStore.getState().defs;
  for (const children of Object.values(defs)) for (const w of children) visit(w);

  const views = usePopupConfigStore.getState().views;
  for (const v of views) for (const w of v.widgets) visit(w);

  return out;
}

export interface TimerOrphansState {
  orphans: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  cleanup: () => Promise<{ ok: number; fail: number }>;
}

export function useTimerOrphans(): TimerOrphansState {
  const [orphans, setOrphans] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const remote = await listTimerIds();
      const known = collectKnownTimerKeys();
      setOrphans(remote.filter((id) => !known.has(id)));
    } finally {
      setLoading(false);
    }
  }, []);

  const cleanup = useCallback(async () => {
    let ok = 0;
    let fail = 0;
    for (const widgetId of orphans) {
      const r = await sendToDirect<{ ok: boolean }>('aura.0', 'deleteTimer', { widgetId });
      if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok) ok++;
      else fail++;
    }
    await refresh();
    return { ok, fail };
  }, [orphans, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Refresh when dirty → clean transitions (i.e. user just saved).
  const wasDirtyRef = useRef(isDirty());
  useEffect(() => {
    return subscribeDirty(() => {
      const now = isDirty();
      if (wasDirtyRef.current && !now) void refresh();
      wasDirtyRef.current = now;
    });
  }, [refresh]);

  return { orphans, loading, refresh, cleanup };
}
