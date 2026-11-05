/**
 * useDpRange — `common.min` / `common.max` of a datapoint, read at runtime.
 *
 * `utils/dpScale.ts` copies a datapoint's range into the options once, when the
 * widget is created. That cannot serve a widget whose datapoint is only known
 * when it renders — a shared popup with `{{parent}}.TEMPERATURE` drives a
 * different lamp on every open, each with its own range (#923). Widgets that
 * leave a bound empty take it from here instead.
 *
 * The object comes from `getObjectDirect`, which caches per id, so a list that
 * opens the same popup for every row asks the socket once per lamp.
 */
import { useEffect, useState } from 'react';
import { getObjectDirect } from './useIoBroker';
import { baseDpId } from '../utils/dpRef';

export interface DpRange {
    min: number;
    max: number;
}

function finite(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** The range an object declares, or null when it declares none usable. */
export function rangeOfCommon(common: unknown): DpRange | null {
    const c = (common ?? {}) as { min?: unknown; max?: unknown };
    const min = finite(c.min);
    const max = finite(c.max);
    // Same rule as dpScale: both ends, and an actual range — min 0 / max 0 says nothing.
    if (min === undefined || max === undefined || max <= min) return null;
    return { min, max };
}

/** Range of `dpRef` (a JSON-path suffix is ignored); null while loading, for no id or no range. */
export function useDpRange(dpRef: string | undefined | null): DpRange | null {
    // An unresolved popup placeholder ({{parent}}.X in the editor) names no object yet.
    const raw = baseDpId(dpRef);
    const id = raw.includes('{{') ? '' : raw;
    const [state, setState] = useState<{ id: string; range: DpRange | null }>({ id: '', range: null });

    useEffect(() => {
        if (!id) return;
        let alive = true;
        getObjectDirect(id)
            .then((obj) => {
                if (alive) setState({ id, range: rangeOfCommon(obj?.common) });
            })
            .catch(() => {
                if (alive) setState({ id, range: null });
            });
        return () => {
            alive = false;
        };
    }, [id]);

    // A range fetched for the previous id must not linger after the id changed.
    return id && state.id === id ? state.range : null;
}
