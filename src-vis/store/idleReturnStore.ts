import { create } from 'zustand';
import { getStateDirect, setStateDirect, subscribeStateDirect } from '../hooks/useIoBroker';
import { NS } from '../utils/namespace';
import { resolveDelayOverride, resolveSnooze, toDelayOverride, toSnoozeMinutes } from '../utils/idleReturn';

/**
 * Live mirror of the idle-return control datapoints (issue #638).
 *
 * Auto-return is a kiosk feature: the wall tablet comes home to its default tab
 * on its own. Standing in front of it and *wanting* to keep looking at the
 * camera page was the one case it had no answer for, because the only switch
 * lived in the admin configuration.
 *
 * Two datapoints per scope — global (`<ns>.idleReturn.*`, every device) and per
 * client (`<ns>.clients.<id>.idleReturn.*`, this device only):
 *
 *   `snoozeMinutes`  minutes the auto-return is paused for. The ADAPTER counts
 *                    this down, so a pause always ends by itself.
 *   `delay`          seconds override for this scope. -1 = use the dashboard
 *                    setting, 0 = auto-return off, > 0 = that many seconds.
 *
 * Resolution: a snooze on either scope pauses (the longer one wins), and the
 * per-client delay wins over the global one, which wins over the configuration.
 */
interface IdleReturnStore {
    /** Minutes left on the all-clients pause. */
    globalSnooze: number;
    /** Minutes left on this device's pause. */
    clientSnooze: number;
    /** All-clients delay override in seconds, or null when unset (-1). */
    globalDelay: number | null;
    /** This device's delay override in seconds, or null when unset (-1). */
    clientDelay: number | null;
    /** Client id the per-client values belong to — guards against a stale mirror. */
    clientId: string;
    /**
     * Whether the auto-return timer is currently running. Published by App (which
     * resolves the layout/section configuration) so a pause chip in the header can
     * tell "paused" from "never armed here" without resolving settings itself.
     */
    armed: boolean;
    set: (patch: Partial<IdleReturnStore>) => void;
}

export const useIdleReturnStore = create<IdleReturnStore>()((set) => ({
    globalSnooze: 0,
    clientSnooze: 0,
    globalDelay: null,
    clientDelay: null,
    clientId: '',
    armed: false,
    set: (patch) => set(patch),
}));

/** Minutes left on the effective pause (0 = auto-return armed). */
export function effectiveSnooze(s: Pick<IdleReturnStore, 'globalSnooze' | 'clientSnooze'>): number {
    return resolveSnooze(s.globalSnooze, s.clientSnooze);
}

/** Seconds override, most specific scope first; null = follow the configuration. */
export function effectiveDelayOverride(s: Pick<IdleReturnStore, 'globalDelay' | 'clientDelay'>): number | null {
    return resolveDelayOverride(s.globalDelay, s.clientDelay);
}

function dpIds(clientId: string) {
    return {
        globalSnooze: `${NS}.idleReturn.snoozeMinutes`,
        globalDelay: `${NS}.idleReturn.delay`,
        clientSnooze: `${NS}.clients.${clientId}.idleReturn.snoozeMinutes`,
        clientDelay: `${NS}.clients.${clientId}.idleReturn.delay`,
    };
}

/**
 * Subscribe the store to the four datapoints. Called once from App; returns the
 * unsubscribe. A bare subscription only yields *changes*, so each value is
 * primed once — otherwise a tablet that reloads while a pause is running would
 * arm its timer again and drive away from the tab somebody is standing at.
 */
export function syncIdleReturnDps(clientId: string): () => void {
    const ids = dpIds(clientId);
    const set = useIdleReturnStore.getState().set;
    set({ clientId, clientSnooze: 0, clientDelay: null });

    const wire = (id: string, apply: (val: unknown) => void) => {
        const unsub = subscribeStateDirect(id, (state) => apply(state?.val));
        void getStateDirect(id)
            .then((state) => {
                if (state) apply(state.val);
            })
            .catch(() => {
                /* datapoint not created yet — the adapter builds it on first contact */
            });
        return unsub;
    };

    const unsubs = [
        wire(ids.globalSnooze, (v) => set({ globalSnooze: toSnoozeMinutes(v) })),
        wire(ids.clientSnooze, (v) => set({ clientSnooze: toSnoozeMinutes(v) })),
        wire(ids.globalDelay, (v) => set({ globalDelay: toDelayOverride(v) })),
        wire(ids.clientDelay, (v) => set({ clientDelay: toDelayOverride(v) })),
    ];
    return () => unsubs.forEach((u) => u());
}

/** Pause the auto-return on THIS device for `minutes`. */
export function snoozeIdleReturn(minutes: number): void {
    const { clientId } = useIdleReturnStore.getState();
    if (!clientId) return;
    setStateDirect(dpIds(clientId).clientSnooze, Math.max(1, Math.round(minutes)));
}

/**
 * End a running pause. Clears the all-clients datapoint too when that is what is
 * holding this device: somebody tapping "resume" at the tablet means the pause
 * is over, and leaving a global snooze running would make the button look dead.
 */
export function resumeIdleReturn(): void {
    const { clientId, globalSnooze, clientSnooze } = useIdleReturnStore.getState();
    if (clientId && clientSnooze > 0) setStateDirect(dpIds(clientId).clientSnooze, 0);
    if (globalSnooze > 0) setStateDirect(dpIds(clientId).globalSnooze, 0);
}
