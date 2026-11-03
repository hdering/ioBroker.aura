import { useEffect, useRef, type RefObject } from 'react';
import { useIoBroker } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { conditionHides } from '../utils/conditionEval';
import { evaluateConditionWithSource } from '../utils/conditionSources';
import { escapeLayerCount } from '../utils/escapeStack';
import { suppressNextClick } from '../utils/interactiveTargets';
import {
    classifySwipe,
    inspectSwipeStart,
    stepTarget,
    swipeAllowed,
    swipeStep,
    SWIPE_EDGE_PX,
    type SwipeAction,
    type SwipeStartInfo,
} from '../utils/swipeNav';
import type { Section, Tab } from '../store/dashboardStore';
import type { WidgetCondition } from '../types';

export interface SwipeNavigationOptions {
    enabled: boolean;
    horizontal: SwipeAction;
    vertical: SwipeAction;
    wrap: boolean;
    tabs: Tab[];
    activeTabId: string | undefined;
    sections: Section[];
    activeSectionId: string | undefined;
    onTab: (tab: Tab) => void;
    onSection: (section: Section) => void;
}

/**
 * Latest values of every datapoint the tab / section conditions read, so a swipe
 * skips the entries their menus hide or grey out (#907) — even when the tab bar
 * or the section menu itself is not on screen and evaluates nothing.
 */
function useConditionValues(lists: (WidgetCondition[] | undefined)[], enabled: boolean) {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const key = enabled
        ? [
              ...new Set(
                  lists.flatMap((conds) =>
                      (conds ?? []).flatMap((c) =>
                          c.clauses.flatMap((cl) =>
                              cl.valueType === 'datapoint' && cl.value ? [cl.datapoint, cl.value] : [cl.datapoint],
                          ),
                      ),
                  ),
              ),
          ]
              .filter(Boolean)
              .sort()
              .join('\n')
        : '';
    useEffect(() => {
        if (!key) return;
        const unsubscribers = key.split('\n').map((ref) => {
            // Socket uses the bare state ID; values are keyed by the full ref (incl. JSON path).
            const { id, path } = splitDpRef(ref);
            getState(id).then((state) => {
                if (state !== null) valuesRef.current.set(ref, resolveDpValue(state.val, path));
            });
            return subscribe(id, (state) => valuesRef.current.set(ref, resolveDpValue(state?.val, path)));
        });
        return () => unsubscribers.forEach((fn) => fn());
    }, [key, subscribe, getState]);
    return valuesRef;
}

/** Hidden or disabled by a matching condition — the same rules the menus apply. */
function blockedByConditions(conds: WidgetCondition[] | undefined, values: Map<string, unknown>): boolean {
    for (const cond of conds ?? []) {
        const matched = evaluateConditionWithSource(cond, values, undefined);
        if (conditionHides(cond, matched)) return true;
        if (matched && cond.disableWidget) return true;
    }
    return false;
}

/**
 * Swipe navigation (#908): a touch swipe across `hostRef` steps to the next /
 * previous tab or section, per axis as configured. Touch only — a mouse drag
 * keeps selecting text and dragging as before.
 *
 * Native, passive listeners: the swipe never cancels scrolling, it is judged
 * after the finger lifts. Overlays (popups, the section drawer) are portalled
 * outside the host, so their touches never arrive here.
 */
export function useSwipeNavigation(hostRef: RefObject<HTMLElement | null>, opts: SwipeNavigationOptions) {
    const active = opts.enabled && (opts.horizontal !== 'off' || opts.vertical !== 'off');
    const tabConds = opts.tabs.map((t) => t.conditions);
    const sectionConds = opts.sections.map((s) => s.conditions);
    const valuesRef = useConditionValues([...tabConds, ...sectionConds], active);

    const optsRef = useRef(opts);
    optsRef.current = opts;

    useEffect(() => {
        const host = hostRef.current;
        if (!active || !host) return;

        let start: { x: number; y: number; t: number; info: SwipeStartInfo } | null = null;

        const onStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) {
                start = null; // a second finger = pinch, not a swipe
                return;
            }
            const p = e.touches[0];
            start = { x: p.clientX, y: p.clientY, t: e.timeStamp, info: inspectSwipeStart(e.target, host) };
        };
        const onEnd = (e: TouchEvent) => {
            const s = start;
            start = null;
            if (!s || e.touches.length > 0) return;
            const p = e.changedTouches[0];
            if (!p) return;
            const dir = classifySwipe(p.clientX - s.x, p.clientY - s.y, e.timeStamp - s.t);
            if (!dir || !swipeAllowed(dir, s.info)) return;
            // An open overlay owns the screen even when it sits inside the host.
            if (escapeLayerCount() > 0) return;
            const horizontal = dir === 'left' || dir === 'right';
            if (horizontal && (s.x < SWIPE_EDGE_PX || s.x > window.innerWidth - SWIPE_EDGE_PX)) return;
            const o = optsRef.current;
            const action = horizontal ? o.horizontal : o.vertical;
            if (action === 'off') return;
            const step = swipeStep(dir);
            const values = valuesRef.current;
            suppressNextClick();
            if (action === 'tabs') {
                const next = stepTarget(
                    o.tabs,
                    (t) => !t.hidden && !t.disabled && !blockedByConditions(t.conditions, values),
                    o.activeTabId,
                    step,
                    o.wrap,
                );
                if (next) o.onTab(next);
                else bounce(host, dir);
            } else {
                const next = stepTarget(
                    o.sections,
                    (sec) => !sec.hidden && !blockedByConditions(sec.conditions, values),
                    o.activeSectionId,
                    step,
                    o.wrap,
                );
                if (next) o.onSection(next);
                else bounce(host, dir);
            }
        };
        const onCancel = () => {
            start = null;
        };

        host.addEventListener('touchstart', onStart, { passive: true });
        host.addEventListener('touchend', onEnd, { passive: true });
        host.addEventListener('touchcancel', onCancel, { passive: true });
        return () => {
            host.removeEventListener('touchstart', onStart);
            host.removeEventListener('touchend', onEnd);
            host.removeEventListener('touchcancel', onCancel);
        };
    }, [active, hostRef, valuesRef]);
}

/** Short nudge in the swipe direction: "there is nothing further this way". */
function bounce(host: HTMLElement, dir: 'left' | 'right' | 'up' | 'down') {
    if (typeof host.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const d = 14;
    const to =
        dir === 'left'
            ? `translateX(-${d}px)`
            : dir === 'right'
              ? `translateX(${d}px)`
              : dir === 'up'
                ? `translateY(-${d}px)`
                : `translateY(${d}px)`;
    host.animate([{ transform: 'none' }, { transform: to }, { transform: 'none' }], {
        duration: 260,
        easing: 'ease-out',
    });
}
