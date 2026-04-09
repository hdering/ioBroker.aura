import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useIoBroker } from './useIoBroker';
import type { WidgetCondition, ConditionClause, ConditionStyle } from '../types';

// ── Evaluation ────────────────────────────────────────────────────────────────

function evaluateClause(clause: ConditionClause, raw: unknown): boolean {
  const str = String(raw ?? '');
  const num = Number(raw);
  const tNum = Number(clause.value);

  switch (clause.operator) {
    case '==':       return str === clause.value;
    case '!=':       return str !== clause.value;
    case '>':        return !isNaN(num) && num > tNum;
    case '>=':       return !isNaN(num) && num >= tNum;
    case '<':        return !isNaN(num) && num < tNum;
    case '<=':       return !isNaN(num) && num <= tNum;
    case 'true':     return raw === true || raw === 1 || str === 'true' || str === '1';
    case 'false':    return raw === false || raw === 0 || str === 'false' || str === '0';
    case 'contains': return str.includes(clause.value);
    default:         return false;
  }
}

function evaluateCondition(cond: WidgetCondition, values: Map<string, unknown>): boolean {
  if (!cond.clauses.length) return false;
  const results = cond.clauses.map((c) => evaluateClause(c, values.get(c.datapoint) ?? null));
  return cond.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ── CSS var mapping ───────────────────────────────────────────────────────────

function styleToVars(style: ConditionStyle): Record<string, string> {
  const v: Record<string, string> = {};
  if (style.accent)       v['--accent']          = style.accent;
  if (style.bg)           v['--widget-bg']        = style.bg;
  if (style.border)       v['--widget-border']    = style.border;
  if (style.textPrimary)  v['--text-primary']     = style.textPrimary;
  if (style.textSecondary) v['--text-secondary']  = style.textSecondary;
  return v;
}

// ── Reflow-hidden registry ────────────────────────────────────────────────────
// Lets Dashboard subscribe to which widgets want to be removed from the grid.

const reflowHiddenIds = new Set<string>();
const reflowListeners = new Set<() => void>();

export function notifyHiddenState(widgetId: string, hidden: boolean, reflow: boolean) {
  const wasReflow = reflowHiddenIds.has(widgetId);
  const isReflow = hidden && reflow;
  if (isReflow === wasReflow) return;
  if (isReflow) reflowHiddenIds.add(widgetId);
  else reflowHiddenIds.delete(widgetId);
  reflowListeners.forEach((fn) => fn());
}

export function cleanupHiddenState(widgetId: string) {
  if (reflowHiddenIds.delete(widgetId)) {
    reflowListeners.forEach((fn) => fn());
  }
}

export function useReflowHiddenIds(): Set<string> {
  const [ids, setIds] = useState(() => new Set(reflowHiddenIds));
  useLayoutEffect(() => {
    const fn = () => setIds(new Set(reflowHiddenIds));
    reflowListeners.add(fn);
    return () => { reflowListeners.delete(fn); };
  }, []);
  return ids;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ConditionResult {
  cssVars: Record<string, string>;
  effect: 'pulse' | 'blink' | null;
  hidden: boolean;   // widget should be hidden
  reflow: boolean;   // remove from grid so others slide up
}

// Module-level constant – same reference every time, lets React bail out of re-renders
const EMPTY_RESULT: ConditionResult = { cssVars: {}, effect: null, hidden: false, reflow: false };

export function useConditionStyle(conditions: WidgetCondition[]): ConditionResult {
  const { subscribe, getState } = useIoBroker();
  const valuesRef = useRef<Map<string, unknown>>(new Map());
  // Pessimistic initial state: if any condition can hide the widget, start hidden
  // to avoid the flash where the widget briefly appears before the first ioBroker value arrives.
  const [result, setResult] = useState<ConditionResult>(() => {
    const mayHide = conditions.some((c) => c.hideWidget);
    return mayHide ? { cssVars: {}, effect: null, hidden: true, reflow: conditions.some((c) => c.hideWidget && c.reflow) } : EMPTY_RESULT;
  });

  // Stable recompute — defined inside useEffect via ref to avoid stale closure
  const recomputeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!conditions.length) {
      setResult(EMPTY_RESULT); // stable reference → React bails out if already EMPTY_RESULT
      return;
    }

    const uniqueIds = [
      ...new Set(
        conditions.flatMap((c) => c.clauses.map((cl) => cl.datapoint)).filter(Boolean),
      ),
    ];

    if (!uniqueIds.length) {
      setResult(EMPTY_RESULT);
      return;
    }

    const recompute = () => {
      const merged: Record<string, string> = {};
      let effect: 'pulse' | 'blink' | null = null;
      let hidden = false;
      let reflow = false;

      for (const cond of conditions) {
        if (evaluateCondition(cond, valuesRef.current)) {
          Object.assign(merged, styleToVars(cond.style));
          if (cond.effect && cond.effect !== 'none') effect = cond.effect as 'pulse' | 'blink';
          if (cond.hideWidget) { hidden = true; if (cond.reflow) reflow = true; }
        }
      }
      setResult((prev) => {
        if (
          prev.effect === effect && prev.hidden === hidden && prev.reflow === reflow &&
          JSON.stringify(prev.cssVars) === JSON.stringify(merged)
        ) return prev;
        return { cssVars: merged, effect, hidden, reflow };
      });
    };

    recomputeRef.current = recompute;

    // Subscribe + fetch initial values
    const unsubscribers = uniqueIds.map((id) => {
      // Fetch current value immediately
      getState(id).then((state) => {
        if (state !== null) {
          valuesRef.current.set(id, state.val ?? null);
          recompute();
        }
      });
      // Subscribe to future changes
      return subscribe(id, (state) => {
        valuesRef.current.set(id, state?.val ?? null);
        recompute();
      });
    });

    recompute(); // initial pass with whatever values are already known

    return () => unsubscribers.forEach((fn) => fn());
  }, [conditions, subscribe, getState]);

  return result;
}
