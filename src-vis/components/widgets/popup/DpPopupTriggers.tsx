import { useEffect, useMemo, useRef } from 'react';
import type { ClickAction, ConditionClause, WidgetConfig } from '../../../types';
import { subscribeDpValue, setStateDirect } from '../../../hooks/useIoBroker';
import { useConnectionStore } from '../../../store/connectionStore';
import { useDashboardStore } from '../../../store/dashboardStore';
import {
    usePopupConfigStore,
    CLIENT_ID_TOKEN,
    triggerClauses,
    type PopupTrigger,
} from '../../../store/popupConfigStore';
import { usePopupRuntimeStore } from '../../../store/popupRuntimeStore';
import { isScreenshotMode } from '../../../store/persistManager';
import { evaluateClause } from '../../../utils/conditionEval';
import { combineClauseHits } from '../../../utils/clauseLogic';
import { WidgetClickPopup } from './WidgetClickPopup';

/** Delay before writing the reset value back to the trigger DP.
 *  Gives every connected client time to receive the rising edge first — the
 *  fastest client's reset would otherwise race the broadcast on the others. */
const RESET_DELAY_MS = 300;

// The screenshot harness runs against a real instance, so a configured trigger
// could otherwise pop an overlay into a documentation shot. Triggers are off in
// screenshot mode; `__auraShot.dpTriggers(true)` re-arms them for tests that
// exercise this path on purpose. Writes stay blocked either way.
let devTriggersForced = false;
export function __devForceDpTriggers(on: boolean): void {
    devTriggersForced = on;
}

/** How long a rule waits for the primed values of all its DPs before arming anyway. */
const PRIME_GRACE_MS = 2000;

function clauseDps(clause: ConditionClause): string[] {
    const dps = clause.datapoint ? [clause.datapoint] : [];
    if (clause.valueType === 'datapoint' && clause.value) dps.push(clause.value);
    return dps;
}

function triggerDps(trigger: PopupTrigger): string[] {
    return [...new Set(triggerClauses(trigger).flatMap(clauseDps))];
}

function withClientId(trigger: PopupTrigger, clientId: string): PopupTrigger {
    const sub = (v: string) => v.split(CLIENT_ID_TOKEN).join(clientId);
    const usesToken = (c: ConditionClause) =>
        c.datapoint.includes(CLIENT_ID_TOKEN) || (c.valueType === 'datapoint' && c.value.includes(CLIENT_ID_TOKEN));
    const resolve = (c: ConditionClause): ConditionClause =>
        usesToken(c)
            ? { ...c, datapoint: sub(c.datapoint), value: c.valueType === 'datapoint' ? sub(c.value) : c.value }
            : c;
    if (!triggerClauses(trigger).some(usesToken)) return trigger;
    return { ...trigger, clause: resolve(trigger.clause), extraClauses: trigger.extraClauses?.map(resolve) };
}

/**
 * All conditions of a trigger against the latest values. A further condition
 * whose datapoint is still empty is half-configured and simply left out — it
 * must not turn an otherwise working rule into one that never fires.
 */
function triggerMatches(trigger: PopupTrigger, values: Map<string, unknown>): boolean {
    const clauses = triggerClauses(trigger).filter((c, i) => i === 0 || c.datapoint);
    const hits = clauses.map((c) => evaluateClause(c, values.get(c.datapoint) ?? null, values));
    return combineClauseHits(clauses, hits, 'AND');
}

function inScope(trigger: PopupTrigger, clientId: string, layoutId?: string, tabId?: string): boolean {
    if (trigger.clientIds?.length && !trigger.clientIds.includes(clientId)) return false;
    if (trigger.layoutId && trigger.layoutId !== layoutId) return false;
    if (trigger.tabId && trigger.tabId !== tabId) return false;
    return true;
}

interface Props {
    /** Active layout/tab — used for the optional per-trigger scope filter. */
    layoutId?: string;
    tabId?: string;
}

/**
 * Opens popups from datapoint values instead of widget clicks (issue #523).
 *
 * Mounted once inside the frontend container, so it keeps watching while the user
 * switches tabs and the popup inherits the layout-scoped CSS vars.
 *
 * Also the single renderer for the `popupRuntimeStore` slot, which the
 * `popup.open` datapoints in App.tsx write to as well.
 */
export function DpPopupTriggers({ layoutId, tabId }: Props) {
    const triggers = usePopupConfigStore((s) => s.triggers);
    const clientId = useConnectionStore((s) => s.clientId);
    const layouts = useDashboardStore((s) => s.layouts);
    const active = usePopupRuntimeStore((s) => s.active);
    const openPopup = usePopupRuntimeStore((s) => s.openPopup);
    const closePopup = usePopupRuntimeStore((s) => s.closePopup);

    const activeTriggers = useMemo(
        () =>
            (triggers ?? [])
                .filter((t) => t.enabled && t.clause.datapoint && inScope(t, clientId, layoutId, tabId))
                .map((t) => withClientId(t, clientId)),
        [triggers, clientId, layoutId, tabId],
    );

    // Every widget across all layouts — a trigger is not bound to a tab, so a
    // 'popup-widget' action may point at a widget on a completely different one.
    const allWidgets = useMemo(
        () => layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs.flatMap((t) => t.widgets))),
        [layouts],
    );

    // Latest DP values and the last evaluation result per trigger. Kept in refs:
    // a value arriving must be able to fire immediately without waiting for a
    // re-render, and re-renders must not lose the edge-detection state.
    const valuesRef = useRef(new Map<string, unknown>());
    const matchedRef = useRef(new Map<string, boolean>());
    const resetTimersRef = useRef(new Map<string, number>());

    useEffect(() => {
        if (isScreenshotMode() && !devTriggersForced) return;

        const resetTimers = resetTimersRef.current;

        // Drop edge state for triggers that are no longer watched, so a rule
        // re-entering scope re-primes instead of firing on a stale baseline.
        const liveIds = new Set(activeTriggers.map((t) => t.id));
        for (const id of [...matchedRef.current.keys()]) {
            if (!liveIds.has(id)) matchedRef.current.delete(id);
        }

        // DPs per trigger whose primed value has not arrived yet. With several
        // conditions the primes land one after the other, and a rule half-primed
        // would see `true AND <unknown>` flip to `true AND true` on page load. A DP
        // that does not exist never primes, hence the grace period as a backstop.
        const pending = new Map<string, Set<string>>(activeTriggers.map((t) => [t.id, new Set(triggerDps(t))]));
        const graceTimer = window.setTimeout(() => pending.clear(), PRIME_GRACE_MS);

        const evaluate = (trigger: PopupTrigger) => {
            const matched = triggerMatches(trigger, valuesRef.current);
            const prev = matchedRef.current.get(trigger.id);
            matchedRef.current.set(trigger.id, matched);

            // First evaluation only records the baseline. subscribeDpValue primes
            // with the current value, so firing here would re-open every popup
            // whose DP happens to sit at `true` on each page load / reconnect.
            if (prev === undefined || pending.has(trigger.id)) return;
            if (matched === prev) return;

            if (!matched) {
                if (trigger.closeOnFalse) closePopup(trigger.id);
                return;
            }

            const action = trigger.host.options?.clickAction as ClickAction | undefined;
            // Popups only. A navigation kind has no click to act on here and would
            // render as a bare backdrop; an unpicked view is simply not configured yet.
            if (!action?.kind.startsWith('popup-')) return;
            if (action.kind === 'popup-view' && !action.viewId) return;

            // The trigger DP is the popup's `{{dp}}` context.
            const host: WidgetConfig = { ...trigger.host, datapoint: trigger.clause.datapoint };
            openPopup({ key: trigger.id, widget: host, action });

            if (trigger.resetDp) {
                const existing = resetTimers.get(trigger.id);
                if (existing !== undefined) window.clearTimeout(existing);
                const dp = trigger.clause.datapoint;
                const resetRaw = (trigger.resetValue ?? '').trim();
                const timer = window.setTimeout(() => {
                    resetTimers.delete(trigger.id);
                    if (isScreenshotMode()) return;
                    if (resetRaw === '') setStateDirect(dp, false);
                    else if (resetRaw !== '' && !isNaN(Number(resetRaw))) setStateDirect(dp, Number(resetRaw));
                    else setStateDirect(dp, resetRaw);
                }, RESET_DELAY_MS);
                resetTimers.set(trigger.id, timer);
            }
        };

        // One subscription per distinct DP; a DP watched by several triggers
        // re-evaluates all of them.
        const consumers = new Map<string, PopupTrigger[]>();
        for (const trigger of activeTriggers) {
            for (const dp of triggerDps(trigger)) {
                const list = consumers.get(dp);
                if (list) list.push(trigger);
                else consumers.set(dp, [trigger]);
            }
        }

        const unsubs = [...consumers.entries()].map(([dp, rules]) =>
            subscribeDpValue(dp, (value) => {
                valuesRef.current.set(dp, value);
                for (const rule of rules) {
                    // The evaluation that completes priming still only sets the
                    // baseline — the rule is armed from the next value on.
                    const waiting = pending.get(rule.id);
                    waiting?.delete(dp);
                    evaluate(rule);
                    if (waiting && !waiting.size) pending.delete(rule.id);
                }
            }),
        );

        return () => {
            window.clearTimeout(graceTimer);
            unsubs.forEach((u) => u());
            for (const timer of resetTimers.values()) window.clearTimeout(timer);
            resetTimers.clear();
        };
    }, [activeTriggers, openPopup, closePopup]);

    if (!active) return null;

    return (
        <WidgetClickPopup
            widget={active.widget}
            action={active.action}
            allWidgets={allWidgets}
            titleOverride={active.titleOverride}
            onClose={() => closePopup(active.key)}
        />
    );
}
