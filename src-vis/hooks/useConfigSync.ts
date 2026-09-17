import { useCallback, useEffect, useRef } from 'react';
import { getStateDirect, subscribeStateDirect } from './useIoBroker';
import { useDashboardStore } from '../store/dashboardStore';
import { hydrateGroupDefs } from '../store/groupDefsStore';
import { hydrateWidgetPresets } from '../store/widgetPresetsStore';
import {
    isPending,
    isSavingRecently,
    discardPendingKey,
    hasDirtyFlag,
    IOBROKER_STATE_MAP,
    isScreenshotMode,
    type SyncStoreKey,
} from '../store/persistManager';
import { applyRemote, isRemoteRawSeen, rehydrateAll, rememberRemoteRaw } from '../utils/configLoader';
import { invalidateHistoryKey } from '../store/editHistory';

/** True when this key's storage copy belongs to an admin with unsaved edits. */
function adminOwnsStorage(key: SyncStoreKey, readOnly: boolean): boolean {
    return readOnly && key !== 'aura-group-defs' && key !== 'aura-widget-presets' && hasDirtyFlag(key);
}

/** Apply one state value received from ioBroker to localStorage + stores. */
export function applyOneState(key: SyncStoreKey, raw: string, readOnly: boolean): boolean {
    if (!raw || raw.length < 3) return false;
    // Screenshot harness owns the config — never let inbound ioBroker state
    // (subscription or poll) overwrite the seeded demo layout.
    if (isScreenshotMode()) return false;

    if (key === 'aura-group-defs') {
        hydrateGroupDefs(raw);
        return true;
    }
    if (key === 'aura-widget-presets') {
        hydrateWidgetPresets(raw);
        return true;
    }

    // Preserve in-memory navigation state (activeLayoutId / per-layout
    // activeSectionId / per-section activeTabId) for the dashboard key — it is
    // flushed directly to localStorage and must not be overwritten by a slightly
    // stale remote copy.
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
                        if (!cur) return l;
                        const sections = Array.isArray(l.sections)
                            ? (l.sections as Array<Record<string, unknown>>).map((sec) => {
                                  const curSec = cur.sections.find((cs) => cs.id === (sec as { id: string }).id);
                                  return curSec ? { ...sec, activeTabId: curSec.activeTabId } : sec;
                              })
                            : l.sections;
                        return { ...l, activeSectionId: cur.activeSectionId, sections };
                    });
                }
                parsed.state = state;
                remoteStr = JSON.stringify(parsed);
            }
        } catch {
            /* leave remoteStr unchanged */
        }
    }

    if (readOnly) {
        // The frontend: "already applied" is what this tab took over last, never
        // what storage holds — in the same browser that is the admin's copy, and
        // it equals the incoming value exactly when the admin has just saved.
        if (isRemoteRawSeen(key, raw)) return false;
        rememberRemoteRaw(key, raw);
        applyRemote(key, remoteStr, true);
        return true;
    }
    if (remoteStr === localStorage.getItem(key)) return false;
    applyRemote(key, remoteStr, readOnly);
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
                if (applyOneState(key, incoming, ignoreDirty)) {
                    // Hydrated in memory for an admin's key: storage and its flag
                    // stay the admin's; a rehydrate would put that copy back.
                    if (adminOwnsStorage(key, ignoreDirty)) return;
                    // include global settings so a live change to defaultDecimals
                    // (etc.) reaches the store, not just localStorage — otherwise
                    // it only takes effect after a reload.
                    rehydrateAll(true);
                    discardPendingKey(key);
                    // Someone else's save — undo entries for this key no longer
                    // have a base to stand on.
                    invalidateHistoryKey(key);
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
            .filter((k) => k !== 'aura-group-defs' && k !== 'aura-widget-presets')
            .filter((k) => ignoreDirty || !isPending(k));
        Promise.all(
            pollKeys.map((key) =>
                getStateDirect(IOBROKER_STATE_MAP[key]).then((state) => {
                    if (!state?.val) return null;
                    const incoming = String(state.val);
                    // Same value-aware guard as the subscribe path: only skip if this
                    // is exactly our own recent write echoing back.
                    if (isSavingRecently(key, incoming)) return null;
                    return applyOneState(key, incoming, ignoreDirty) ? key : null;
                }),
            ),
        ).then((results) => {
            const appliedKeys = results.filter(
                (k): k is Exclude<SyncStoreKey, 'aura-group-defs' | 'aura-widget-presets'> =>
                    k !== null && !adminOwnsStorage(k, ignoreDirty),
            );
            if (appliedKeys.length > 0) {
                // include global settings — see subscribe path above.
                rehydrateAll(true);
                appliedKeys.forEach((k) => discardPendingKey(k));
                appliedKeys.forEach((k) => invalidateHistoryKey(k));
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
        pollingRef.current = globalThis.setInterval(poll, 30_000);
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [connected, poll]);
}
