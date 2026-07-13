import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { isDirty, subscribeDirty, isScreenshotMode } from '../store/persistManager';
import { sendToDirect } from './useIoBroker';
import { timerBackendKey } from '../utils/publishTimerConfig';
import { NS } from '../utils/namespace';
import type { WidgetConfig } from '../types';

/** Walk all widgets we know about (dashboard layouts, group definitions, popup
 *  views) and apply `visit` to each. Single source of truth for "every widget
 *  that currently exists in the app config". */
function visitAllWidgets(visit: (w: WidgetConfig) => void): void {
    const layouts = useDashboardStore.getState().layouts;
    for (const l of layouts)
        for (const sec of l.sections) for (const tab of sec.tabs) for (const w of tab.widgets) visit(w);
    const defs = useGroupDefsStore.getState().defs;
    for (const children of Object.values(defs)) for (const w of children) visit(w);
    const views = usePopupConfigStore.getState().views;
    for (const v of views) for (const w of v.widgets) visit(w);
}

export interface OrphanItem {
    id: string;
    name: string;
}

async function fetchRemoteItems(command: 'listTimers' | 'listLists'): Promise<OrphanItem[]> {
    const r = await sendToDirect<{ ok: boolean; items?: OrphanItem[]; widgetIds?: string[] }>(NS, command, {});
    if (r && typeof r === 'object') {
        const items = (r as { items?: OrphanItem[] }).items;
        if (Array.isArray(items))
            return items.map((it) => ({ id: String(it.id || ''), name: String(it.name || '') })).filter((it) => it.id);
        // Backward compatibility: older adapter only returned widgetIds.
        const ids = (r as { widgetIds?: string[] }).widgetIds;
        if (Array.isArray(ids)) return ids.map((id) => ({ id: String(id), name: '' }));
    }
    return [];
}

export interface OrphansState {
    timer: OrphanItem[];
    list: OrphanItem[];
    loading: boolean;
    refresh: () => Promise<void>;
    cleanup: () => Promise<{ ok: number; fail: number }>;
}

export function useTimerOrphans(): OrphansState {
    const [timer, setTimer] = useState<OrphanItem[]>([]);
    const [list, setList] = useState<OrphanItem[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (isScreenshotMode()) {
            setTimer([]);
            setList([]);
            return;
        }
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
                fetchRemoteItems('listTimers'),
                fetchRemoteItems('listLists'),
            ]);
            setTimer(remoteTimer.filter((it) => !knownTimer.has(it.id)));
            setList(remoteList.filter((it) => !knownList.has(it.id)));
        } finally {
            setLoading(false);
        }
    }, []);

    const cleanup = useCallback(async () => {
        let ok = 0;
        let fail = 0;
        const send = async (command: 'deleteTimer' | 'deleteList', widgetId: string) => {
            const r = await sendToDirect<{ ok: boolean }>(NS, command, { widgetId });
            if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok) ok++;
            else fail++;
        };
        for (const it of timer) await send('deleteTimer', it.id);
        for (const it of list) await send('deleteList', it.id);
        await refresh();
        return { ok, fail };
    }, [timer, list, refresh]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

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
