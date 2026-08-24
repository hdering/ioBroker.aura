import { useEffect, useMemo, useRef, useState } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import {
    EMPTY_ROW_COND,
    evalRowRules,
    resolveRuleRefs,
    ruleForeignRefs,
    type RowCondResult,
} from '../utils/rowConditions';
import type { ElementConditionRule } from '../types';

/**
 * Conditional formatting for many elements at once — the rows of a list and the
 * datapoints of their second line (issue #572).
 *
 * Deliberately ONE hook for the whole list rather than one per row: a dynamic list
 * routinely holds 100 rows, and a hook each would mean 100 effects re-running on
 * every re-render. Here the foreign datapoints of all rows are collected once,
 * deduplicated and subscribed in a single effect.
 *
 * Each element's own value is passed in — both list widgets already subscribe their
 * entries, so re-subscribing them here would double the traffic for nothing.
 *
 * Cosmetic only: a brief mismatch on the first paint, before the foreign values
 * arrive, is acceptable. None of useConditionStyle's pessimistic hide machinery is
 * needed (that one guards against a widget flickering in and out of the grid).
 */

export interface ElementCondInput {
    /** Key of this element in the returned map (entry id, or `${entryId}#${subDp}`). */
    key: string;
    /** The element's own datapoint — resolves both `{dp}` and `{{parent}}`. */
    dp: string;
    /** The element's live value. */
    value: unknown;
    /** List-wide rules first, element-specific ones after — later wins per field. */
    rules?: ElementConditionRule[];
}

const EMPTY_MAP: Map<string, RowCondResult> = new Map();

export function useElementConditionStyles(items: ElementCondInput[]): Map<string, RowCondResult> {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [, setTick] = useState(0);

    const hasRules = items.some((it) => it.rules?.length);

    // Templates are resolved per element: the same `{{parent}}.UNREACH` rule points at
    // a different datapoint in every row.
    //
    // Deliberately rules only, no values. The memo key cannot include the values —
    // they change on every datapoint event, which is the whole point — and caching a
    // value alongside the rules would freeze each element at the value it had when
    // its rule set was last built. The live values are read from `items` below, by
    // index: both arrays are built from the same source in the same order.
    const resolved = useMemo(
        () => (hasRules ? items.map((it) => ({ dp: it.dp, rules: resolveRuleRefs(it.rules, it.dp) })) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasRules, JSON.stringify(items.map((it) => [it.key, it.dp, it.rules]))],
    );

    const refsKey = useMemo(
        () => [...new Set(resolved.flatMap((r) => ruleForeignRefs(r.rules, r.dp)))].join('|'),
        [resolved],
    );

    useEffect(() => {
        if (!refsKey) return;
        let cancelled = false;
        const unsubs = refsKey.split('|').map((ref) => {
            const { id, path } = splitDpRef(ref);
            const cached = getStateFromCache(id);
            if (cached !== null) valuesRef.current.set(ref, resolveDpValue(cached.val, path));
            getState(id).then((state) => {
                if (cancelled) return;
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                setTick((t) => t + 1);
            });
            return subscribe(id, (state) => {
                if (cancelled) return;
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                setTick((t) => t + 1);
            });
        });
        return () => {
            cancelled = true;
            unsubs.forEach((fn) => fn());
        };
    }, [refsKey, subscribe, getState]);

    if (!hasRules) return EMPTY_MAP;

    const out = new Map<string, RowCondResult>();
    for (let i = 0; i < resolved.length; i++) {
        const { dp, rules } = resolved[i];
        if (!rules.length) continue;
        const item = items[i];
        if (!item || item.key === undefined) continue;
        const res = evalRowRules(rules, dp, item.value, valuesRef.current);
        if (res !== EMPTY_ROW_COND) out.set(item.key, res);
    }
    return out;
}
