/**
 * useGroupControl — turns a list of GroupTarget into an aggregate state plus a
 * single toggle action that writes all targets at once. Shared by the static
 * list, dynamic list and group widgets (see utils/groupTargets).
 */
import { useMemo } from 'react';
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
    const aggregate = useMemo(() => aggregateState(targets), [targets]);
    const activeCount = useMemo(() => targets.reduce((n, t) => n + (t.active ? 1 : 0), 0), [targets]);

    // off / mixed → turn everything on; on → turn everything off (HomeKit-style).
    const toggleAll = () => {
        const turnOn = aggregate !== 'on';
        for (const t of targets) {
            setState(t.id, turnOn ? t.onWrite : t.offWrite);
        }
    };

    return { aggregate, toggleAll, activeCount, total: targets.length };
}
