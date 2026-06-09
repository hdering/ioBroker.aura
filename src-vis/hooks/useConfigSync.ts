import { useCallback, useEffect, useRef } from 'react';
import { getStateDirect, subscribeStateDirect } from './useIoBroker';
import { useDashboardStore } from '../store/dashboardStore';
import { hydrateGroupDefs } from '../store/groupDefsStore';
import {
    isPending,
    isSavingRecently,
    discardPendingKey,
    IOBROKER_STATE_MAP,
    type SyncStoreKey,
} from '../store/persistManager';
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
        } catch {
            /* leave remoteStr unchanged */
        }
    }

    if (remoteStr === localStorage.getItem(key)) return false;
    applyRaw(key, remoteStr);
    return true;
}

/**
 * Subscribes to each config state individually and polls every 30 s as fallback.
 * Each key is gated independently (per-key dirty + per-key isSavingRecently),
 * so an unrelated dirty key in this tab no longer blocks pushes for other keys.
 *
 * `ignoreDirty: true` disables the dirty guard entirely — used by the read-only
 * frontend, where local "dirty" comes only from navigation state and remote
 * should always win.
 */
export function useConfigSync(
    connected: boolean,
    configLoaded: React.MutableRefObject<boolean>,
    opts: { ignoreDirty?: boolean } = {},
): void {
    const ignoreDirty = opts.ignoreDirty ?? false;

    // 1. Subscribe to each state — immediate push on stateChange
    useEffect(() => {
        const unsubs = (Object.entries(IOBROKER_STATE_MAP) as [SyncStoreKey, string][]).map(([key, stateId]) =>
            subscribeStateDirect(stateId, (state) => {
                if (!state?.val || !configLoaded.current) return;
                if (!ignoreDirty && isPending(key)) return;
                const incoming = String(state.val);
                // Suppress only the byte-identical echo of our own recent write —
                // a different value within the TTL is a concurrent write from
                // another tab/device and MUST be applied (otherwise editing a
                // widget in one tab right after saving in another tab loses the
                // change because it falls inside the 5 s window).
                if (isSavingRecently(key, incoming)) return;
                if (applyOneState(key, incoming)) {
                    rehydrateAll(false);
                    discardPendingKey(key);
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
        if (!configLoaded.current) return;
        const pollKeys = (Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[])
            .filter((k) => k !== 'aura-group-defs')
            .filter((k) => ignoreDirty || !isPending(k));
        Promise.all(
            pollKeys.map((key) =>
                getStateDirect(IOBROKER_STATE_MAP[key]).then((state) => {
                    if (!state?.val) return null;
                    const incoming = String(state.val);
                    // Same value-aware guard as the subscribe path: only skip if this
                    // is exactly our own recent write echoing back.
                    if (isSavingRecently(key, incoming)) return null;
                    return applyOneState(key, incoming) ? key : null;
                }),
            ),
        ).then((results) => {
            const appliedKeys = results.filter((k): k is Exclude<SyncStoreKey, 'aura-group-defs'> => k !== null);
            if (appliedKeys.length > 0) {
                rehydrateAll(false);
                appliedKeys.forEach((k) => discardPendingKey(k));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (!connected) {
            pollingRef.current = null;
            return;
        }
        pollingRef.current = setInterval(poll, 30_000);
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [connected, poll]);
}
