import { useState, useEffect, useRef } from 'react';
import { useIoBroker } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { conditionHides } from '../utils/conditionEval';
import { evaluateConditionWithSource } from '../utils/conditionSources';
import type { WidgetCondition, ConditionStyle } from '../types';

function styleToTabVars(style: ConditionStyle): Record<string, string> {
    const v: Record<string, string> = {};
    if (style.accent) v['--tab-accent'] = style.accent;
    if (style.bg) v['--tab-bg'] = style.bg;
    if (style.border) v['--tab-border'] = style.border;
    // borderWidth / radius / opacity are widget-frame properties; a tab button has no
    // equivalent, so the editor hides those fields in the tab context instead of
    // emitting variables nothing reads.
    if (style.textPrimary) v['--tab-text'] = style.textPrimary;
    if (style.textSecondary) v['--tab-text2'] = style.textSecondary;
    return v;
}

export interface TabConditionResult {
    cssVars: Record<string, string>;
    bold: boolean;
    italic: boolean;
    effect: 'pulse' | 'blink' | 'border' | null;
    hidden: boolean;
}

const EMPTY_RESULT: TabConditionResult = { cssVars: {}, bold: false, italic: false, effect: null, hidden: false };

export function useTabConditionStyle(conditions?: WidgetCondition[]): TabConditionResult {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [result, setResult] = useState<TabConditionResult>(() => {
        if (!conditions?.length) return EMPTY_RESULT;
        const mayHide = conditions.some((c) => c.hideWidget);
        return mayHide ? { cssVars: {}, bold: false, italic: false, effect: null, hidden: true } : EMPTY_RESULT;
    });

    useEffect(() => {
        const conds = conditions ?? [];
        if (!conds.length) {
            setResult(EMPTY_RESULT);
            return;
        }

        const uniqueIds = [
            ...new Set(
                conds
                    .flatMap((c) =>
                        c.clauses.flatMap((cl) => {
                            const ids = [cl.datapoint];
                            if (cl.valueType === 'datapoint' && cl.value) ids.push(cl.value);
                            return ids;
                        }),
                    )
                    .filter(Boolean),
            ),
        ];

        if (!uniqueIds.length) {
            setResult(EMPTY_RESULT);
            return;
        }

        const recompute = () => {
            const merged: Record<string, string> = {};
            let bold = false;
            let italic = false;
            let effect: 'pulse' | 'blink' | 'border' | null = null;
            let hidden = false;

            for (const cond of conds) {
                // A tab has no main datapoint and no list, so it passes no source
                // context — but it must share the operator path with widgets and
                // badges, whose AND/OR default it otherwise contradicts.
                const matched = evaluateConditionWithSource(cond, valuesRef.current, undefined);
                if (matched) {
                    Object.assign(merged, styleToTabVars(cond.style));
                    if (cond.style.bold !== undefined) bold = cond.style.bold;
                    if (cond.style.italic !== undefined) italic = cond.style.italic;
                    if (cond.effect && cond.effect !== 'none') effect = cond.effect as 'pulse' | 'blink' | 'border';
                }
                if (conditionHides(cond, matched)) hidden = true;
            }
            setResult((prev) => {
                if (
                    prev.effect === effect &&
                    prev.bold === bold &&
                    prev.italic === italic &&
                    prev.hidden === hidden &&
                    JSON.stringify(prev.cssVars) === JSON.stringify(merged)
                )
                    return prev;
                return { cssVars: merged, bold, italic, effect, hidden };
            });
        };

        const unsubscribers = uniqueIds.map((ref) => {
            // Socket uses the bare state ID; values are keyed by the full ref (incl. JSON path).
            const { id, path } = splitDpRef(ref);
            getState(id).then((state) => {
                if (state !== null) {
                    valuesRef.current.set(ref, resolveDpValue(state.val, path));
                    recompute();
                }
            });
            return subscribe(id, (state) => {
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                recompute();
            });
        });

        recompute();
        return () => unsubscribers.forEach((fn) => fn());
    }, [conditions, subscribe, getState]);

    return result;
}
