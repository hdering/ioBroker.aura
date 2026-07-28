import { useEffect, useRef, useState } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { evaluateClause } from '../utils/conditionEval';
import type { CustomCell, CellConditionRule } from '../types';

// Per-cell conditional formatting for the Universal Widget's custom grid.
//
// Each value-bearing cell already subscribes to its own DP and passes the live
// value in as `ownValue`. This hook additionally subscribes to any *foreign* DPs
// referenced by the rule clauses (so a cell can react to another datapoint, e.g.
// colour a value red while an alarm DP is true), evaluates every rule with the
// shared evaluateClause() engine and merges the effects of all matching rules
// (later rule wins per field). Cosmetic only — a brief mismatch on first paint
// before foreign values arrive is acceptable, so none of useConditionStyle's
// pessimistic hide/reflow machinery is needed here.

export interface CellCondResult {
    color?: string;
    bg?: string;
    bold?: boolean;
    italic?: boolean;
    icon?: string;
    hide?: boolean;
}

const EMPTY: CellCondResult = {};

/** Clause DP refs that are NOT the cell's own value and must be subscribed. */
function foreignRefs(rules: CellConditionRule[], ownDp: string): string[] {
    const set = new Set<string>();
    for (const rule of rules) {
        for (const cl of rule.clauses ?? []) {
            if (cl.datapoint && cl.datapoint !== ownDp) set.add(cl.datapoint);
            if (cl.valueType === 'datapoint' && cl.value && cl.value !== ownDp) set.add(cl.value);
        }
    }
    return [...set];
}

function evalRules(
    rules: CellConditionRule[],
    ownDp: string,
    ownValue: unknown,
    values: Map<string, unknown>,
): CellCondResult {
    const merged: CellCondResult = {};
    let any = false;
    for (const rule of rules) {
        const clauses = rule.clauses ?? [];
        if (!clauses.length) continue;
        const results = clauses.map((cl) => {
            // Empty datapoint (or one equal to the cell's own DP) compares the
            // cell's own live value; a foreign DP uses its subscribed value.
            const raw = cl.datapoint && cl.datapoint !== ownDp ? values.get(cl.datapoint) : ownValue;
            return evaluateClause(cl, raw, values);
        });
        const matched = (rule.logic ?? 'AND') === 'OR' ? results.some(Boolean) : results.every(Boolean);
        if (!matched) continue;
        any = true;
        if (rule.color) merged.color = rule.color;
        if (rule.bg) merged.bg = rule.bg;
        if (rule.bold !== undefined) merged.bold = rule.bold;
        if (rule.italic !== undefined) merged.italic = rule.italic;
        if (rule.icon) merged.icon = rule.icon;
        if (rule.hide) merged.hide = true;
    }
    return any ? merged : EMPTY;
}

/**
 * @param cell     the custom-grid cell (reads cell.conditions)
 * @param ownValue the cell's own live DP value (already subscribed by the caller)
 * @param ownDpId  override for the cell's own DP ref (e.g. the widget main DP for
 *                 'value' cells). Defaults to cell.dpId.
 */
export function useCellConditionStyle(cell: CustomCell, ownValue: unknown, ownDpId?: string): CellCondResult {
    const rules = cell.conditions;
    const ownDp = ownDpId ?? cell.dpId ?? '';
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [, setTick] = useState(0);

    const refs = rules?.length ? foreignRefs(rules, ownDp) : [];
    const refsKey = refs.join('|');

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

    if (!rules?.length) return EMPTY;

    // Build the lookup map: own value under its ref + all foreign values.
    const values = new Map(valuesRef.current);
    if (ownDp) values.set(ownDp, ownValue);
    return evalRules(rules, ownDp, ownValue, values);
}
