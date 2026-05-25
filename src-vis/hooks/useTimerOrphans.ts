import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { isDirty, subscribeDirty } from '../store/persistManager';
import { sendToDirect } from './useIoBroker';
import { timerBackendKey } from '../utils/publishTimerConfig';
import type { WidgetConfig } from '../types';

/** Walk all widgets we know about (dashboard layouts, group definitions, popup
 *  views) and apply `visit` to each. Single source of truth for "every widget
 *  that currently exists in the app config". */
function visitAllWidgets(visit: (w: WidgetConfig) => void): void {
  const layouts = useDashboardStore.getState().layouts;
  for (const l of layouts) for (const tab of l.tabs) for (const w of tab.widgets) visit(w);
  const defs = useGroupDefsStore.getState().defs;
  for (const children of Object.values(defs)) for (const w of children) visit(w);
  const views = usePopupConfigStore.getState().views;
  for (const v of views) for (const w of v.widgets) visit(w);
}

async function fetchRemoteIds(command: 'listTimers' | 'listLists'): Promise<string[]> {
  const r = await sendToDirect<{ ok: boolean; widgetIds?: string[] }>('aura.0', command, {});
  if (r && typeof r === 'object' && 'widgetIds' in r && Array.isArray((r as { widgetIds?: string[] }).widgetIds)) {
    return (r as { widgetIds: string[] }).widgetIds;
  }
  return [];
}

export interface OrphansState {
  timer: string[];
  list: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  cleanup: () => Promise<{ ok: number; fail: number }>;
}

export function useTimerOrphans(): OrphansState {
  const [timer, setTimer] = useState<string[]>([]);
  const [list, setList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const knownTimer = new Set<string>();
      const knownList = new Set<string>();
      visitAllWidgets((w) => {
        const tKey = timerBackendKey(w);
        if (tKey) knownTimer.add(tKey);
        if (w.type === 'list' || w.type === 'autolist') knownList.add(w.id);
      });
      const [remoteTimer, remoteList] = await Promise.all([
        fetchRemoteIds('listTimers'),
        fetchRemoteIds('listLists'),
      ]);
      setTimer(remoteTimer.filter((id) => !knownTimer.has(id)));
      setList(remoteList.filter((id) => !knownList.has(id)));
    } finally {
      setLoading(false);
    }
  }, []);

  const cleanup = useCallback(async () => {
    let ok = 0;
    let fail = 0;
    const send = async (command: 'deleteTimer' | 'deleteList', widgetId: string) => {
      const r = await sendToDirect<{ ok: boolean }>('aura.0', command, { widgetId });
      if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok) ok++;
      else fail++;
    };
    for (const id of timer) await send('deleteTimer', id);
    for (const id of list)  await send('deleteList',  id);
    await refresh();
    return { ok, fail };
  }, [timer, list, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Refresh when dirty → clean transitions (user just saved).
  const wasDirtyRef = useRef(isDirty());
  useEffect(() => {
    return subscribeDirty(() => {
      const now = isDirty();
      if (wasDirtyRef.current && !now) void refresh();
      wasDirtyRef.current = now;
    });
  }, [refresh]);

  return { timer, list, loading, refresh, cleanup };
}
