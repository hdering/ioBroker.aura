/**
 * useGroupControl — turns a list of GroupTarget into an aggregate state plus a
 * single toggle action that writes all targets at once. Shared by the static
 * list, dynamic list and group widgets (see utils/groupTargets).
 *
 * Clicking writes to every target, but the live values arrive back one DP at a
 * time over the socket. To give the master switch instant feedback we show the
 * intended state optimistically and reconcile once the real aggregate agrees
 * (or after a short grace period, so one unresponsive DP can't pin the switch).
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker } from './useIoBroker';
import type { GroupTarget } from '../utils/groupTargets';

export type GroupAggregate = 'on' | 'off' | 'mixed' | 'none';

export function aggregateState(targets: GroupTarget[]): GroupAggregate {
    if (targets.length === 0) return 'none';
    const on = targets.reduce((n, t) => n + (t.active ? 1 : 0), 0);
    if (on === 0) return 'off';
    if (on === targets.length) return 'on';
    return 'mixed';
}

export function useGroupControl(targets: GroupTarget[]) {
    const { setState } = useIoBroker();
    const realAggregate = useMemo(() => aggregateState(targets), [targets]);
    const activeCount = useMemo(() => targets.reduce((n, t) => n + (t.active ? 1 : 0), 0), [targets]);

    // Optimistic override: true = "all on" pending, false = "all off" pending.
    const [pendingOn, setPendingOn] = useState<boolean | null>(null);
    useEffect(() => {
        if (pendingOn === null) return;
        if ((pendingOn && realAggregate === 'on') || (!pendingOn && realAggregate === 'off')) {
            setPendingOn(null);
            return;
        }
        const timer = setTimeout(() => setPendingOn(null), 5000);
        return () => clearTimeout(timer);
    }, [pendingOn, realAggregate]);

    const aggregate: GroupAggregate = pendingOn === null ? realAggregate : pendingOn ? 'on' : 'off';

    // off / mixed → turn everything on; on → turn everything off (HomeKit-style).
    const toggleAll = () => {
        const turnOn = aggregate !== 'on';
        setPendingOn(turnOn);
        for (const t of targets) {
            setState(t.id, turnOn ? t.onWrite : t.offWrite);
        }
    };

    return { aggregate, toggleAll, activeCount, total: targets.length };
}
