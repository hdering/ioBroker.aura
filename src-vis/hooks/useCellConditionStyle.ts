import { useEffect, useRef, useState } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { evaluateClause } from '../utils/conditionEval';
import { OWN_DP_TOKEN } from '../utils/conditionSources';
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
    /** Icon colour, when it should differ from the text colour. */
    iconColor?: string;
    /** Replaces the cell's text — the same effect a list row's value has. */
    text?: string;
    hide?: boolean;
}

const EMPTY: CellCondResult = {};

/**
 * Token that stands for the cell's own datapoint inside a clause, so the user
 * doesn't have to re-enter the DP that's already configured on the cell. An
 * empty datapoint (legacy) and a ref equal to the cell's own DP are treated the
 * same way. Shared with the widget-level sources (`utils/conditionSources.ts`),
 * where the same token means the widget's main datapoint.
 */
export const OWN_VALUE_TOKEN = OWN_DP_TOKEN;

function isOwnRef(ref: string | undefined, ownDp: string): boolean {
    return !ref || ref === OWN_VALUE_TOKEN || ref === ownDp;
}

/** Clause DP refs that are NOT the cell's own value and must be subscribed. */
function foreignRefs(rules: CellConditionRule[], ownDp: string): string[] {
    const set = new Set<string>();
    for (const rule of rules) {
        for (const cl of rule.clauses ?? []) {
            if (!isOwnRef(cl.datapoint, ownDp)) set.add(cl.datapoint);
            if (cl.valueType === 'datapoint' && !isOwnRef(cl.value, ownDp)) set.add(cl.value);
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
            // '{dp}' / empty / the cell's own DP compare the cell's own live
            // value; any other ref uses its subscribed foreign value.
            const raw = isOwnRef(cl.datapoint, ownDp) ? ownValue : values.get(cl.datapoint);
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
        if (rule.iconColor) merged.iconColor = rule.iconColor;
        if (rule.text !== undefined && rule.text !== '') merged.text = rule.text;
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

    // Build the lookup map: own value under the {dp} token and its ref + all
    // foreign values. Keying by the token lets a '{dp}' compare-value resolve too.
    const values = new Map(valuesRef.current);
    values.set(OWN_VALUE_TOKEN, ownValue);
    if (ownDp) values.set(ownDp, ownValue);
    return evalRules(rules, ownDp, ownValue, values);
}
