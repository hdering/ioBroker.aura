/**
 * useHiddenDevices - the list rows to leave out because their device is gone (#925):
 *
 *   - `unreachable`: the device's reachability datapoint (UNREACH, available, online …,
 *     utils/deviceReach) says it does not answer. Read live, so a fairy light that is
 *     plugged in again shows up again by itself.
 *   - `aliasWithoutTarget`: an `alias.*` row whose alias points at a datapoint that does
 *     not exist (lamp moved, device deleted). Checked again every few minutes, so the
 *     row comes back once the target exists again.
 *
 * Only what is switched on is looked up; a row whose device has no reachability
 * datapoint, or whose value is unknown, is never hidden.
 */
import { useEffect, useMemo, useState } from 'react';
import { getObjectDirect, getObjectViewDirect } from './useIoBroker';
import { useTemplateStates } from './useTemplateValues';
import { aliasTargetOf, findReachDp, isUnreachable, type ReachDp } from '../utils/deviceReach';

const ALIAS_RECHECK_MS = 5 * 60 * 1000;

/** States below a prefix, per session - many rows share one device. */
const statesBelowCache = new Map<string, Promise<Array<{ id: string; role?: string }>>>();
function statesBelow(prefix: string): Promise<Array<{ id: string; role?: string }>> {
    let p = statesBelowCache.get(prefix);
    if (!p) {
        p = getObjectViewDirect('state', `${prefix}.`, `${prefix}.香`).then((res) =>
            res.rows
                .filter((r) => r.id.startsWith(`${prefix}.`))
                .map((r) => ({ id: r.id, role: r.value?.common?.role })),
        );
        statesBelowCache.set(prefix, p);
        p.catch(() => statesBelowCache.delete(prefix));
    }
    return p;
}

async function reachOf(id: string): Promise<ReachDp | undefined> {
    const parts = id.split('.');
    const parent = parts.slice(0, -1).join('.');
    const parentUp = parts.slice(0, -2).join('.');
    const own = await statesBelow(parent);
    const first = findReachDp(id, own);
    if (first || parentUp.split('.').length < 3) return first;
    // HmIP keeps UNREACH on channel 0 of the device - but only look there when the
    // grandparent really is a device, never in a folder full of other devices.
    const up = await getObjectDirect(parentUp);
    return up?.type === 'device' ? findReachDp(id, await statesBelow(parentUp)) : undefined;
}

async function aliasMissing(id: string, fresh: boolean): Promise<boolean> {
    const obj = await getObjectDirect(id, { skipCache: fresh });
    if (!obj) return false;
    const target = aliasTargetOf(obj.common);
    if (!target) return true;
    return (await getObjectDirect(target, { skipCache: fresh })) === null;
}

export function useHiddenDevices(
    ids: string[],
    opts: { unreachable?: boolean; aliasWithoutTarget?: boolean },
): Set<string> {
    const key = ids.join('\u0000');
    const { unreachable = false, aliasWithoutTarget = false } = opts;
    const [reach, setReach] = useState<Record<string, ReachDp>>({});
    const [missing, setMissing] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (!unreachable || !key) return;
        let alive = true;
        for (const id of key.split('\u0000')) {
            reachOf(id).then(
                (r) => alive && r && setReach((prev) => (prev[id]?.id === r.id ? prev : { ...prev, [id]: r })),
                () => undefined,
            );
        }
        return () => {
            alive = false;
        };
    }, [key, unreachable]);

    useEffect(() => {
        if (!aliasWithoutTarget || !key) return;
        let alive = true;
        const aliases = key.split('\u0000').filter((id) => id.startsWith('alias.'));
        const check = (fresh: boolean) =>
            Promise.all(aliases.map((id) => aliasMissing(id, fresh).then((m) => [id, m] as const))).then(
                (results) => {
                    if (!alive) return;
                    const next = new Set(results.filter(([, m]) => m).map(([id]) => id));
                    setMissing((prev) =>
                        prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next,
                    );
                },
                () => undefined,
            );
        void check(false);
        const timer = setInterval(() => void check(true), ALIAS_RECHECK_MS);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [key, aliasWithoutTarget]);

    const reachIds = useMemo(
        () => (unreachable ? [...new Set(Object.values(reach).map((r) => r.id))] : []),
        [reach, unreachable],
    );
    const reachStates = useTemplateStates(reachIds);

    return useMemo(() => {
        const hidden = new Set<string>();
        if (aliasWithoutTarget) for (const id of missing) hidden.add(id);
        if (unreachable) {
            for (const [id, r] of Object.entries(reach)) {
                if (isUnreachable(r, reachStates[r.id]?.val)) hidden.add(id);
            }
        }
        return hidden;
    }, [missing, reach, reachStates, unreachable, aliasWithoutTarget]);
}
