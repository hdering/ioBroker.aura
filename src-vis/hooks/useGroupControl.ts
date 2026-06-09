/**
 * useGroupControl — turns a list of GroupTarget into an aggregate state plus a
 * single toggle action that writes all targets at once. Shared by the static
 * list, dynamic list and group widgets (see utils/groupTargets).
 *
 * Why this is more than `aggregateState(targets)`:
 * Some ioBroker setups never push a `stateChange` back for the dashboard's own
 * `ack:false` write — e.g. plain `0_userdata.0` variables that have no adapter
 * to acknowledge them. The host widget's live subscription (and therefore the
 * `parentAggregate` derived from `targets`) then stays stale until a manual
 * reload, even though the value did change server-side. To stay correct we:
 *   1. show the intended state optimistically the moment the user clicks, and
 *   2. confirm it with an explicit `getState` read shortly after the write,
 * dropping the override as soon as the subscription-driven `parentAggregate`
 * actually moves (so genuine external changes still win).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIoBroker } from './useIoBroker';
import { isActiveVal, type GroupTarget } from '../utils/groupTargets';

export type GroupAggregate = 'on' | 'off' | 'mixed' | 'none';

export function aggregateState(targets: GroupTarget[]): GroupAggregate {
    if (targets.length === 0) return 'none';
    const on = targets.reduce((n, t) => n + (t.active ? 1 : 0), 0);
    if (on === 0) return 'off';
    if (on === targets.length) return 'on';
    return 'mixed';
}

export function useGroupControl(targets: GroupTarget[]) {
    const { setState, getState } = useIoBroker();
    const parentAggregate = useMemo(() => aggregateState(targets), [targets]);
    const activeCount = useMemo(() => targets.reduce((n, t) => n + (t.active ? 1 : 0), 0), [targets]);

    const [override, setOverride] = useState<GroupAggregate | null>(null);
    const prevParent = useRef(parentAggregate);
    useEffect(() => {
        // Live subscription moved on its own → trust it and drop the override.
        if (parentAggregate !== prevParent.current) {
            prevParent.current = parentAggregate;
            setOverride(null);
        }
    }, [parentAggregate]);

    const aggregate = override ?? parentAggregate;

    // off / mixed → turn everything on; on → turn everything off (HomeKit-style).
    const toggleAll = () => {
        if (targets.length === 0) return;
        const turnOn = aggregate !== 'on';
        setOverride(turnOn ? 'on' : 'off');
        const ids = targets.map((t) => t.id);
        for (const t of targets) {
            setState(t.id, turnOn ? t.onWrite : t.offWrite);
        }
        // Confirm via getState — a live stateChange push may never arrive.
        setTimeout(() => {
            Promise.all(ids.map((id) => getState(id))).then((states) => {
                const on = states.reduce((n, s) => n + (isActiveVal(s?.val ?? null) ? 1 : 0), 0);
                setOverride(on === 0 ? 'off' : on === states.length ? 'on' : 'mixed');
            });
        }, 700);
    };

    return { aggregate, toggleAll, activeCount, total: targets.length };
}
