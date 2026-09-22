import { useEffect, useState, useMemo } from 'react';
import { useIoBroker, getStateFromCache, subscribeDpValue, getStateDirect } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import type { ioBrokerState } from '../types';

type Primitive = boolean | number | string | null;

/** A subscribed reference: its value plus the two timestamps bindings can address
 *  through the `.ts` / `.lc` suffixes. */
export interface TemplateState {
    val: Primitive;
    /** Last update, epoch ms — 0 while the state has not arrived yet. */
    ts: number;
    /** Last *change*, epoch ms. */
    lc: number;
}

/** Coerce a resolved datapoint value into a template-safe primitive. */
function coerce(val: unknown): Primitive {
    if (val === null || val === undefined) return null;
    const t = typeof val;
    if (t === 'boolean' || t === 'number' || t === 'string') return val as Primitive;
    try {
        return JSON.stringify(val);
    } catch {
        return null;
    }
}

function toTemplateState(val: unknown, state: ioBrokerState | null | undefined): TemplateState {
    return { val: coerce(val), ts: state?.ts ?? 0, lc: state?.lc ?? 0 };
}

/**
 * Subscribe to an arbitrary list of datapoint refs (each may carry a `?<jsonPath>`
 * suffix) and return a live map of `ref → {val, ts, lc}`. Non-hook counterpart of
 * useDatapoint, but for the dynamic set of extra datapoints referenced by a
 * template. Refs are joined into a stable key so the effect only re-subscribes when
 * the actual set changes.
 *
 * The timestamps ride along with the value, so `{id.lc;date(HH:mm)}` costs no extra
 * subscription — the binding layer only ever collects base refs.
 */
export function useTemplateStates(refs: string[]): Record<string, TemplateState> {
    const { connected } = useIoBroker();
    const key = refs.join('\u0000');
    const [states, setStates] = useState<Record<string, TemplateState>>({});

    useEffect(() => {
        const list = key ? key.split('\u0000') : [];
        if (!list.length) return;

        // Seed from the prefetch cache so the template renders real values immediately.
        // Deliberately BEFORE the `connected` guard: the cache may already hold the
        // value (prefetch, another consumer, the screenshot harness), and waiting for
        // the socket would show a placeholder for a value that is right there — the
        // same order useDatapoint has always used.
        setStates((prev) => {
            const next = { ...prev };
            for (const ref of list) {
                const { id, path } = splitDpRef(ref);
                const cached = getStateFromCache(id);
                if (cached) next[ref] = toTemplateState(resolveDpValue(cached.val, path), cached);
            }
            return next;
        });

        if (!connected) return;

        const unsubs = list.map((ref) => {
            const { id, path } = splitDpRef(ref);
            if (!getStateFromCache(id)) {
                getStateDirect(id).then((state) => {
                    if (state) {
                        setStates((prev) => ({
                            ...prev,
                            [ref]: toTemplateState(resolveDpValue(state.val, path), state),
                        }));
                    }
                });
            }
            return subscribeDpValue(ref, (val: ioBrokerState['val'], state: ioBrokerState) => {
                setStates((prev) => ({ ...prev, [ref]: toTemplateState(val, state) }));
            });
        });

        return () => unsubs.forEach((u) => u());
    }, [key, connected]);

    return useMemo(() => states, [states]);
}

/** Value-only view of useTemplateStates — the shape every list widget already uses. */
export function useTemplateValues(refs: string[]): Record<string, Primitive> {
    const states = useTemplateStates(refs);
    return useMemo(() => Object.fromEntries(Object.entries(states).map(([ref, s]) => [ref, s.val])), [states]);
}
