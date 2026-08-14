import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { conditionHides } from '../utils/conditionEval';
import {
    applySourceValues,
    clauseSourceRefs,
    evaluateConditionWithSource,
    hasChangedClause,
    sourceCtxKey,
    type DpSourceCtx,
} from '../utils/conditionSources';
import { bumpWidgetRefresh } from '../store/widgetRefreshStore';
import { isScreenshotMode } from '../store/persistManager';
import type { WidgetCondition, ConditionStyle } from '../types';

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

// `reflowHiddenIds` is the *removal* set: widgets that should be pulled out of
// the grid so others slide up. It is edit-mode-gated by the caller (an editor
// must keep every widget mounted and editable), so it is empty while editing.
const reflowHiddenIds = new Set<string>();
const reflowListeners = new Set<() => void>();
// `conditionReflowIds` mirrors the raw condition verdict (hidden+reflow)
// regardless of edit mode. It does NOT remove anything — it just lets the group
// auto-shrink height calc know which children a condition currently hides, so a
// group can shrink (with an inner scrollbar) even inside the editor.
const conditionReflowIds = new Set<string>();
const conditionListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).auraConditionStats = () => {
        const ids = Array.from(reflowHiddenIds);
        console.log('[cond] reflow-hidden widgets:', ids.length, ids);
        return { count: ids.length, ids };
    };
}

function syncSet(set: Set<string>, listeners: Set<() => void>, widgetId: string, member: boolean): boolean {
    const was = set.has(widgetId);
    if (member === was) return false;
    if (member) set.add(widgetId);
    else set.delete(widgetId);
    listeners.forEach((fn) => fn());
    return true;
}

export function notifyHiddenState(widgetId: string, hidden: boolean, reflow: boolean, conditionReflow?: boolean) {
    const isReflow = hidden && reflow;
    if (syncSet(reflowHiddenIds, reflowListeners, widgetId, isReflow)) {
        condLog(isReflow ? 'reflow-set ADD' : 'reflow-set REMOVE', {
            widgetId,
            hidden,
            reflow,
            reflowSetSize: reflowHiddenIds.size,
        });
    }
    // Default to the removal verdict when the caller doesn't pass the raw one.
    syncSet(conditionReflowIds, conditionListeners, widgetId, conditionReflow ?? isReflow);
}

export function cleanupHiddenState(widgetId: string) {
    syncSet(conditionReflowIds, conditionListeners, widgetId, false);
    syncSet(reflowHiddenIds, reflowListeners, widgetId, false);
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

/** Widgets a condition currently hides (reflow), independent of edit mode. */
export function useConditionReflowIds(): Set<string> {
    const [ids, setIds] = useState(() => new Set(conditionReflowIds));
    useLayoutEffect(() => {
        const fn = () => setIds(new Set(conditionReflowIds));
        conditionListeners.add(fn);
        return () => {
            conditionListeners.delete(fn);
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

// Shared "nothing changed" set for every evaluation that is not driven by a live
// value arriving (initial load, getState resolution, manual recompute).
const NO_CHANGES: ReadonlySet<string> = new Set<string>();

// A widget remounting mid-shot would corrupt documentation screenshots, so the
// reload rules are off in screenshot mode; `__auraShot.conditionRefresh(true)`
// re-arms them for the tests that exercise this path on purpose.
let devRefreshForced = false;
export function __devForceConditionRefresh(on: boolean): void {
    devRefreshForced = on;
}

// Real state IDs behind all clauses — token refs ('{dp}', '{list:…}') are
// expanded to the widget's own / list datapoints via the source context.
function collectUniqueIds(conditions: WidgetCondition[], ctx?: DpSourceCtx): string[] {
    return [
        ...new Set(conditions.flatMap((c) => c.clauses.flatMap((cl) => clauseSourceRefs(cl, ctx))).filter(Boolean)),
    ];
}

function computeResult(
    conditions: WidgetCondition[],
    values: Map<string, unknown>,
    ctx?: DpSourceCtx,
): ConditionResult {
    const merged: Record<string, string> = {};
    let effect: 'pulse' | 'blink' | null = null;
    let hidden = false;
    let reflow = false;
    applySourceValues(values, ctx);
    for (const cond of conditions) {
        const matched = evaluateConditionWithSource(cond, values, ctx);
        if (matched) {
            Object.assign(merged, styleToVars(cond.style));
            if (cond.effect && cond.effect !== 'none') effect = cond.effect as 'pulse' | 'blink';
        }
        if (conditionHides(cond, matched)) {
            hidden = true;
            if (cond.reflow) reflow = true;
        }
    }
    return { cssVars: merged, effect, hidden, reflow };
}

export function useConditionStyle(
    conditions: WidgetCondition[],
    widgetId?: string,
    ctx?: DpSourceCtx,
): ConditionResult {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    // The context object identity is up to the caller — key the effect on its
    // content instead and read the latest object through a ref.
    const ctxRef = useRef<DpSourceCtx | undefined>(ctx);
    ctxRef.current = ctx;
    const ctxKey = sourceCtxKey(ctx);
    const mountedAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
    const mountCountRef = useRef<number>(0);
    // Last verdict per refresh rule — a rule without a 'changed' clause reloads on
    // the rising edge only, so it must remember whether it already matched.
    const refreshMatchRef = useRef<Map<string, boolean>>(new Map());
    // Cache-aware initial state: on remount (e.g. when a widget moves between the
    // visible grid and the off-screen reflow container) the global stateCache
    // already has the DP values — compute the correct result synchronously so the
    // widget doesn't pessimistically bounce back to the reflow container.
    // On the very first page load nothing is cached yet, so we fall back to the
    // pessimistic "hidden=true" state to avoid a flash.
    const [result, setResult] = useState<ConditionResult>(() => {
        const uniqueIds = collectUniqueIds(conditions, ctx);
        // Populate valuesRef from whatever the cache already has (even partial).
        // The cache check below decides whether we can compute synchronously.
        let cacheHits = 0;
        uniqueIds.forEach((ref) => {
            // Subscriptions/cache use the bare state ID; values are keyed by the full ref
            // (incl. any JSON path) since that is what evaluateClause looks up.
            const { id, path } = splitDpRef(ref);
            const cached = getStateFromCache(id);
            if (cached !== null) {
                valuesRef.current.set(ref, resolveDpValue(cached.val, path));
                cacheHits++;
            }
        });
        if (uniqueIds.length > 0 && cacheHits === uniqueIds.length) {
            const r = computeResult(conditions, valuesRef.current, ctx);
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
            missing: uniqueIds.filter((ref) => getStateFromCache(splitDpRef(ref).id) === null),
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

        const uniqueIds = collectUniqueIds(conditions, ctxRef.current);

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
        uniqueIds.forEach((ref) => {
            if (getStateFromCache(splitDpRef(ref).id) !== null) loadedIds.add(ref);
        });

        const pessimistic = (): ConditionResult => {
            const mayHide = conditions.some((c) => c.hideWidget);
            return mayHide ? { cssVars: {}, effect: null, hidden: true, reflow: false } : EMPTY_RESULT;
        };

        // ── "Widget neu laden" rules (issue #537) ────────────────────────────
        // Kept out of computeResult: that one is pure and also runs in the useState
        // initializer, where a reload side effect must never fire.
        const refreshConds = conditions.filter((c) => c.refreshWidget);
        // A rule re-entering the set must re-prime instead of firing against a stale
        // verdict from a previous mount.
        for (const id of [...refreshMatchRef.current.keys()]) {
            if (!refreshConds.some((c) => c.id === id)) refreshMatchRef.current.delete(id);
        }

        const fireRefresh = (changed: ReadonlySet<string>) => {
            if (!refreshConds.length || !widgetId) return;
            if (isScreenshotMode() && !devRefreshForced) return;
            for (const cond of refreshConds) {
                const matched = evaluateConditionWithSource(cond, valuesRef.current, ctxRef.current, changed);
                const prev = refreshMatchRef.current.get(cond.id);
                refreshMatchRef.current.set(cond.id, matched);
                if (!matched) continue;
                // A 'changed' clause only matches on an actual value arrival, so every
                // match is a fresh event — no edge detection needed (and none possible:
                // the verdict falls back to false on the very next evaluation).
                if (hasChangedClause(cond)) {
                    condLog('refresh (changed)', { widgetId, rule: cond.id, changed: [...changed] });
                    bumpWidgetRefresh(widgetId);
                    continue;
                }
                // State rules reload on the rising edge. `undefined` is the baseline
                // evaluation — firing there would reload on every page load.
                if (prev === undefined || prev) continue;
                condLog('refresh (rising edge)', { widgetId, rule: cond.id });
                bumpWidgetRefresh(widgetId);
            }
        };

        const recompute = (trigger: string, dp?: string, changed: ReadonlySet<string> = NO_CHANGES) => {
            const allKnown = uniqueIds.every((id) => loadedIds.has(id));
            const next = allKnown ? computeResult(conditions, valuesRef.current, ctxRef.current) : pessimistic();
            // computeResult resolved the source tokens into valuesRef, so the refresh
            // rules see the same values the style verdict was built from. Skipped while
            // values are still loading — a half-known state is not a real transition.
            if (allKnown) fireRefresh(changed);
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
        const unsubscribers = uniqueIds.map((ref) => {
            // The socket only knows bare state IDs; the JSON path is applied to the value.
            const { id, path } = splitDpRef(ref);
            const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
            getState(id).then((state) => {
                if (cancelled) return;
                const dt = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
                // Mark loaded regardless of state existing — a non-existent DP is
                // "known to be null", not "still loading".
                loadedIds.add(ref);
                if (state !== null) {
                    valuesRef.current.set(ref, resolveDpValue(state.val, path));
                    condLog('getState resolved', { widgetId, dp: ref, val: state.val, took: `${dt.toFixed(1)}ms` });
                } else {
                    condLog('getState resolved (null — DP missing)', { widgetId, dp: ref, took: `${dt.toFixed(1)}ms` });
                }
                recompute('getState', ref);
            });
            return subscribe(id, (state) => {
                if (cancelled) return;
                loadedIds.add(ref);
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                condLog('subscribe event', { widgetId, dp: ref, val: state?.val });
                // Only a live value counts as a change — a getState resolution is the
                // initial load, and reloading the widget there would fire on every mount.
                recompute('subscribe', ref, new Set([ref]));
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
    }, [conditions, subscribe, getState, widgetId, ctxKey]);

    return result;
}
