import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import type { WidgetCondition, ConditionClause, ConditionStyle } from '../types';

// ── Debug logging ─────────────────────────────────────────────────────────────
// End-user opt-in. Enable from DevTools console:
//   window.auraEnableConditionDebug()   // persists in localStorage + reload required
//   window.auraEnableConditionDebug(true) // hot-enable without reload
// Disable: window.auraDisableConditionDebug()
// Or append ?auraDebug=conditions to the URL for a one-shot session.
//
// Logs cover: per-widget init, datapoint subscribe/value arrival, hidden/reflow
// transitions and reflow-set membership changes. Designed to surface why a
// hidden-by-condition widget takes long to settle on initial load (multi-mount
// bouncing between visible grid and off-screen reflow container).

let _condDebug = false;
function refreshCondDebug(): void {
    try {
        if (typeof window === 'undefined') {
            _condDebug = false;
            return;
        }
        _condDebug =
            window.location.search.includes('auraDebug=conditions') ||
            window.localStorage.getItem('aura.debug.conditions') === '1';
    } catch {
        _condDebug = false;
    }
}
refreshCondDebug();

function condLog(tag: string, ...args: unknown[]): void {
    if (!_condDebug) return;

    console.log(
        `%c[cond]%c ${tag}`,
        'background:#6366f1;color:#fff;padding:1px 4px;border-radius:3px;font-weight:bold',
        'color:#6366f1;font-weight:bold',
        ...args,
    );
}

if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.auraEnableConditionDebug = (hot?: boolean) => {
        try {
            window.localStorage.setItem('aura.debug.conditions', '1');
        } catch {
            /* ignore */
        }
        if (hot) {
            _condDebug = true;
            console.log('[cond] debug enabled (live, no reload needed)');
        } else {
            console.log('[cond] debug flag stored — reload the page to start logging');
        }
    };
    w.auraDisableConditionDebug = () => {
        try {
            window.localStorage.removeItem('aura.debug.conditions');
        } catch {
            /* ignore */
        }
        _condDebug = false;
        console.log('[cond] debug disabled');
    };
}

// ── Evaluation ────────────────────────────────────────────────────────────────

function evaluateClause(clause: ConditionClause, raw: unknown, values: Map<string, unknown>): boolean {
    const str = String(raw ?? '');
    const num = Number(raw);

    // Resolve the comparison value: static string vs second datapoint
    const isDpCompare = clause.valueType === 'datapoint';
    const cmpRaw: unknown = isDpCompare ? (values.get(clause.value) ?? null) : clause.value;
    const cmpStr = isDpCompare ? String(cmpRaw ?? '') : clause.value;
    const cmpNum = Number(cmpRaw);

    switch (clause.operator) {
        case '==':
            return str === cmpStr;
        case '!=':
            return str !== cmpStr;
        case '>':
            return !isNaN(num) && !isNaN(cmpNum) && num > cmpNum;
        case '>=':
            return !isNaN(num) && !isNaN(cmpNum) && num >= cmpNum;
        case '<':
            return !isNaN(num) && !isNaN(cmpNum) && num < cmpNum;
        case '<=':
            return !isNaN(num) && !isNaN(cmpNum) && num <= cmpNum;
        case 'true':
            return raw === true || raw === 1 || str === 'true' || str === '1';
        case 'false':
            return raw === false || raw === 0 || str === 'false' || str === '0';
        case 'contains':
            return str.includes(cmpStr);
        default:
            return false;
    }
}

function evaluateCondition(cond: WidgetCondition, values: Map<string, unknown>): boolean {
    if (!cond.clauses.length) return false;
    const results = cond.clauses.map((c) => evaluateClause(c, values.get(c.datapoint) ?? null, values));
    return cond.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ── CSS var mapping ───────────────────────────────────────────────────────────

function styleToVars(style: ConditionStyle): Record<string, string> {
    const v: Record<string, string> = {};
    if (style.accent) v['--accent'] = style.accent;
    if (style.bg) v['--widget-bg'] = style.bg;
    if (style.border) v['--widget-border'] = style.border;
    if (style.textPrimary) v['--text-primary'] = style.textPrimary;
    if (style.textSecondary) v['--text-secondary'] = style.textSecondary;
    return v;
}

// ── Reflow-hidden registry ────────────────────────────────────────────────────
// Lets Dashboard subscribe to which widgets want to be removed from the grid.

const reflowHiddenIds = new Set<string>();
const reflowListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).auraConditionStats = () => {
        const ids = Array.from(reflowHiddenIds);
        console.log('[cond] reflow-hidden widgets:', ids.length, ids);
        return { count: ids.length, ids };
    };
}

export function notifyHiddenState(widgetId: string, hidden: boolean, reflow: boolean) {
    const wasReflow = reflowHiddenIds.has(widgetId);
    const isReflow = hidden && reflow;
    if (isReflow === wasReflow) {
        condLog('notify (no-op)', { widgetId, hidden, reflow, inReflowSet: wasReflow });
        return;
    }
    if (isReflow) reflowHiddenIds.add(widgetId);
    else reflowHiddenIds.delete(widgetId);
    condLog(isReflow ? 'reflow-set ADD' : 'reflow-set REMOVE', {
        widgetId,
        hidden,
        reflow,
        reflowSetSize: reflowHiddenIds.size,
    });
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
        return () => {
            reflowListeners.delete(fn);
        };
    }, []);
    return ids;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ConditionResult {
    cssVars: Record<string, string>;
    effect: 'pulse' | 'blink' | null;
    hidden: boolean; // widget should be hidden
    reflow: boolean; // remove from grid so others slide up
}

// Module-level constant – same reference every time, lets React bail out of re-renders
const EMPTY_RESULT: ConditionResult = { cssVars: {}, effect: null, hidden: false, reflow: false };

function collectUniqueIds(conditions: WidgetCondition[]): string[] {
    return [
        ...new Set(
            conditions
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
}

function computeResult(conditions: WidgetCondition[], values: Map<string, unknown>): ConditionResult {
    const merged: Record<string, string> = {};
    let effect: 'pulse' | 'blink' | null = null;
    let hidden = false;
    let reflow = false;
    for (const cond of conditions) {
        if (evaluateCondition(cond, values)) {
            Object.assign(merged, styleToVars(cond.style));
            if (cond.effect && cond.effect !== 'none') effect = cond.effect as 'pulse' | 'blink';
            if (cond.hideWidget) {
                hidden = true;
                if (cond.reflow) reflow = true;
            }
        }
    }
    return { cssVars: merged, effect, hidden, reflow };
}

export function useConditionStyle(conditions: WidgetCondition[], widgetId?: string): ConditionResult {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const mountedAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
    const mountCountRef = useRef<number>(0);
    // Cache-aware initial state: on remount (e.g. when a widget moves between the
    // visible grid and the off-screen reflow container) the global stateCache
    // already has the DP values — compute the correct result synchronously so the
    // widget doesn't pessimistically bounce back to the reflow container.
    // On the very first page load nothing is cached yet, so we fall back to the
    // pessimistic "hidden=true" state to avoid a flash.
    const [result, setResult] = useState<ConditionResult>(() => {
        const uniqueIds = collectUniqueIds(conditions);
        // Populate valuesRef from whatever the cache already has (even partial).
        // The cache check below decides whether we can compute synchronously.
        let cacheHits = 0;
        uniqueIds.forEach((id) => {
            const cached = getStateFromCache(id);
            if (cached !== null) {
                valuesRef.current.set(id, cached.val ?? null);
                cacheHits++;
            }
        });
        if (uniqueIds.length > 0 && cacheHits === uniqueIds.length) {
            const r = computeResult(conditions, valuesRef.current);
            condLog('init (cache hit)', {
                widgetId,
                dps: uniqueIds,
                hidden: r.hidden,
                reflow: r.reflow,
                values: Object.fromEntries(valuesRef.current),
            });
            return r;
        }
        const mayHide = conditions.some((c) => c.hideWidget);
        // Pessimistic in-place hide: keep widget mounted in the grid with
        // visibility:hidden until real DP values arrive. We deliberately do NOT
        // set reflow=true here — that would push the widget into the off-screen
        // reflow container before values are known, causing a mount→unmount→
        // remount cycle on initial paint (and inside group widgets, an actual
        // flicker loop: see issue #281).
        const initial: ConditionResult = mayHide
            ? { cssVars: {}, effect: null, hidden: true, reflow: false }
            : EMPTY_RESULT;
        condLog('init (cache miss/partial — pessimistic in-place hide)', {
            widgetId,
            dps: uniqueIds,
            cacheHits,
            missing: uniqueIds.filter((id) => getStateFromCache(id) === null),
            conditionsCount: conditions.length,
            mayHide,
            initialHidden: initial.hidden,
            initialReflow: initial.reflow,
        });
        return initial;
    });

    // Stable recompute — defined inside useEffect via ref to avoid stale closure
    const recomputeRef = useRef<() => void>(() => {});

    useEffect(() => {
        if (!conditions.length) {
            setResult(EMPTY_RESULT); // stable reference → React bails out if already EMPTY_RESULT
            return;
        }

        const uniqueIds = collectUniqueIds(conditions);

        if (!uniqueIds.length) {
            setResult(EMPTY_RESULT);
            return;
        }

        mountCountRef.current += 1;
        const mountStart = typeof performance !== 'undefined' ? performance.now() : 0;
        condLog('effect mount', {
            widgetId,
            mountCount: mountCountRef.current,
            dps: uniqueIds,
            sinceHookCreated: `${(mountStart - mountedAtRef.current).toFixed(1)}ms`,
        });

        // Per-effect "DP value known" tracking. We must NOT compute conditions
        // with empty values — evaluateClause treats null as the empty string,
        // so operators like '!=' return true spuriously and flip the widget into
        // reflow=true before any real value has arrived. That triggered the
        // mount/unmount loop reported in issue #281. Until every condition DP
        // has either resolved via getState/subscribe or been served from the
        // module-level cache, we stay in the pessimistic in-place hide state.
        let cancelled = false;
        const loadedIds = new Set<string>();
        uniqueIds.forEach((id) => {
            if (getStateFromCache(id) !== null) loadedIds.add(id);
        });

        const pessimistic = (): ConditionResult => {
            const mayHide = conditions.some((c) => c.hideWidget);
            return mayHide ? { cssVars: {}, effect: null, hidden: true, reflow: false } : EMPTY_RESULT;
        };

        const recompute = (trigger: string, dp?: string) => {
            const allKnown = uniqueIds.every((id) => loadedIds.has(id));
            const next = allKnown ? computeResult(conditions, valuesRef.current) : pessimistic();
            setResult((prev) => {
                if (
                    prev.effect === next.effect &&
                    prev.hidden === next.hidden &&
                    prev.reflow === next.reflow &&
                    JSON.stringify(prev.cssVars) === JSON.stringify(next.cssVars)
                ) {
                    condLog('recompute (no change)', { widgetId, trigger, dp, allKnown });
                    return prev;
                }
                condLog('recompute CHANGED', {
                    widgetId,
                    trigger,
                    dp,
                    allKnown,
                    hidden: `${prev.hidden} → ${next.hidden}`,
                    reflow: `${prev.reflow} → ${next.reflow}`,
                    effect: `${prev.effect} → ${next.effect}`,
                    loadedIds: Array.from(loadedIds),
                    pendingIds: uniqueIds.filter((id) => !loadedIds.has(id)),
                    values: Object.fromEntries(valuesRef.current),
                });
                return next;
            });
        };

        recomputeRef.current = () => recompute('manual');

        // Subscribe + fetch initial values. The cancelled flag prevents late
        // getState resolvers from a stale effect run from writing into the
        // shared valuesRef after a remount.
        const unsubscribers = uniqueIds.map((id) => {
            const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
            getState(id).then((state) => {
                if (cancelled) return;
                const dt = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
                // Mark loaded regardless of state existing — a non-existent DP is
                // "known to be null", not "still loading".
                loadedIds.add(id);
                if (state !== null) {
                    valuesRef.current.set(id, state.val ?? null);
                    condLog('getState resolved', { widgetId, dp: id, val: state.val, took: `${dt.toFixed(1)}ms` });
                } else {
                    condLog('getState resolved (null — DP missing)', { widgetId, dp: id, took: `${dt.toFixed(1)}ms` });
                }
                recompute('getState', id);
            });
            return subscribe(id, (state) => {
                if (cancelled) return;
                loadedIds.add(id);
                valuesRef.current.set(id, state?.val ?? null);
                condLog('subscribe event', { widgetId, dp: id, val: state?.val });
                recompute('subscribe', id);
            });
        });

        recompute('initial', undefined); // stays pessimistic unless all DPs already cached

        return () => {
            cancelled = true;
            condLog('effect cleanup (unmount/deps change)', {
                widgetId,
                mountCount: mountCountRef.current,
                livedFor: `${(performance.now() - mountStart).toFixed(1)}ms`,
            });
            unsubscribers.forEach((fn) => fn());
        };
    }, [conditions, subscribe, getState, widgetId]);

    return result;
}
