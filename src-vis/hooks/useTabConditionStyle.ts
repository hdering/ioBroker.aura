import { useState, useEffect, useRef } from 'react';
import { useIoBroker } from './useIoBroker';
import type { WidgetCondition, ConditionClause, ConditionStyle } from '../types';

function evaluateClause(clause: ConditionClause, raw: unknown, values: Map<string, unknown>): boolean {
  const str = String(raw ?? '');
  const num = Number(raw);

  const isDpCompare = clause.valueType === 'datapoint';
  const cmpRaw: unknown = isDpCompare ? (values.get(clause.value) ?? null) : clause.value;
  const cmpStr = isDpCompare ? String(cmpRaw ?? '') : clause.value;
  const cmpNum = Number(cmpRaw);

  switch (clause.operator) {
    case '==':       return str === cmpStr;
    case '!=':       return str !== cmpStr;
    case '>':        return !isNaN(num) && !isNaN(cmpNum) && num > cmpNum;
    case '>=':       return !isNaN(num) && !isNaN(cmpNum) && num >= cmpNum;
    case '<':        return !isNaN(num) && !isNaN(cmpNum) && num < cmpNum;
    case '<=':       return !isNaN(num) && !isNaN(cmpNum) && num <= cmpNum;
    case 'true':     return raw === true || raw === 1 || str === 'true' || str === '1';
    case 'false':    return raw === false || raw === 0 || str === 'false' || str === '0';
    case 'contains': return str.includes(cmpStr);
    default:         return false;
  }
}

function evaluateCondition(cond: WidgetCondition, values: Map<string, unknown>): boolean {
  if (!cond.clauses.length) return false;
  const results = cond.clauses.map((c) => evaluateClause(c, values.get(c.datapoint) ?? null, values));
  return cond.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function styleToTabVars(style: ConditionStyle): Record<string, string> {
  const v: Record<string, string> = {};
  if (style.accent)        v['--tab-accent'] = style.accent;
  if (style.bg)            v['--tab-bg']     = style.bg;
  if (style.border)        v['--tab-border'] = style.border;
  if (style.textPrimary)   v['--tab-text']   = style.textPrimary;
  if (style.textSecondary) v['--tab-text2']  = style.textSecondary;
  return v;
}

export interface TabConditionResult {
  cssVars: Record<string, string>;
  effect: 'pulse' | 'blink' | null;
  hidden: boolean;
}

const EMPTY_RESULT: TabConditionResult = { cssVars: {}, effect: null, hidden: false };

export function useTabConditionStyle(conditions?: WidgetCondition[]): TabConditionResult {
  const { subscribe, getState } = useIoBroker();
  const valuesRef = useRef<Map<string, unknown>>(new Map());
  const [result, setResult] = useState<TabConditionResult>(() => {
    if (!conditions?.length) return EMPTY_RESULT;
    const mayHide = conditions.some((c) => c.hideWidget);
    return mayHide ? { cssVars: {}, effect: null, hidden: true } : EMPTY_RESULT;
  });

  useEffect(() => {
    const conds = conditions ?? [];
    if (!conds.length) { setResult(EMPTY_RESULT); return; }

    const uniqueIds = [
      ...new Set(conds.flatMap((c) => c.clauses.flatMap((cl) => {
        const ids = [cl.datapoint];
        if (cl.valueType === 'datapoint' && cl.value) ids.push(cl.value);
        return ids;
      })).filter(Boolean)),
    ];

    if (!uniqueIds.length) { setResult(EMPTY_RESULT); return; }

    const recompute = () => {
      const merged: Record<string, string> = {};
      let effect: 'pulse' | 'blink' | null = null;
      let hidden = false;

      for (const cond of conds) {
        if (evaluateCondition(cond, valuesRef.current)) {
          Object.assign(merged, styleToTabVars(cond.style));
          if (cond.effect && cond.effect !== 'none') effect = cond.effect as 'pulse' | 'blink';
          if (cond.hideWidget) hidden = true;
        }
      }
      setResult((prev) => {
        if (
          prev.effect === effect && prev.hidden === hidden &&
          JSON.stringify(prev.cssVars) === JSON.stringify(merged)
        ) return prev;
        return { cssVars: merged, effect, hidden };
      });
    };

    const unsubscribers = uniqueIds.map((id) => {
      getState(id).then((state) => {
        if (state !== null) { valuesRef.current.set(id, state.val ?? null); recompute(); }
      });
      return subscribe(id, (state) => {
        valuesRef.current.set(id, state?.val ?? null);
        recompute();
      });
    });

    recompute();
    return () => unsubscribers.forEach((fn) => fn());
  }, [conditions, subscribe, getState]);

  return result;
}
