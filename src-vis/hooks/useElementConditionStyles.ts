import { useEffect, useMemo, useRef, useState } from 'react';
import { useIoBroker, getStateFromCache, readValueDirect } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import {
    EMPTY_ROW_COND,
    evalRowRules,
    matchingNotifyRules,
    resolveRuleRefs,
    ruleForeignRefs,
    type RowCondResult,
} from '../utils/rowConditions';
import { conditionNotifyArmed } from './useConditionStyle';
import { useMessagesStore } from '../store/messagesStore';
import { draftToPayload } from '../components/config/MessageBuilder';
import { freezeDraftTokens, resolveDraftForRow } from '../utils/notifyTemplate';
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
    /**
     * True once the element's own datapoint has actually answered. Styling does not
     * care (a wrong colour for one frame is invisible), but the "send a message"
     * effect does: without it every page load looks like a rising edge the moment
     * the real value replaces the `null` placeholder. Absent = never fires.
     */
    loaded?: boolean;
    /** List-wide rules first, element-specific ones after — later wins per field. */
    rules?: ElementConditionRule[];
}

const EMPTY_MAP: Map<string, RowCondResult> = new Map();

/** One element that a "send a message" rule currently matches. */
interface NotifyHit {
    /** `${element key}\u0000${rule id}` — the edge is per element AND per rule. */
    key: string;
    /** The element's datapoint, for `{{parent}}` & co. in the draft. */
    dp: string;
    rule: ElementConditionRule;
    /** False on the element's first complete evaluation: that one only primes. */
    primed: boolean;
}

export function useElementConditionStyles(items: ElementCondInput[]): Map<string, RowCondResult> {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [, setTick] = useState(0);
    // Rising-edge bookkeeping for the "Meldung senden" effect (issue #605): the
    // verdict of every element/rule pair as of the last render. A pair that stops
    // matching re-arms, an element that leaves the list forgets its verdict.
    const notifyStateRef = useRef<Map<string, boolean>>(new Map());
    // Filled during the render pass below and consumed by the effect underneath —
    // sending is a side effect and must not happen while rendering.
    const notifyHitsRef = useRef<NotifyHit[]>([]);
    // Elements whose own value AND every datapoint their rules reference have
    // arrived at least once. A rule matching on that first complete evaluation is
    // the state the page loaded into, not an event — the same reasoning that makes
    // useConditionStyle wait for `allKnown` before it fires anything.
    const primedRef = useRef<Set<string>>(new Set());
    const readyKeysRef = useRef<string[]>([]);

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

    // No dependency array on purpose: the hits are recomputed on every render (a
    // datapoint event re-renders this hook), and the edge map decides what is new.
    useEffect(() => {
        const hits = notifyHitsRef.current;
        const seen = notifyStateRef.current;
        const live = new Set(hits.map((h) => h.key));
        // Pairs that no longer match — or elements that left the list — re-arm.
        for (const key of [...seen.keys()]) if (!live.has(key)) seen.delete(key);
        const armed = conditionNotifyArmed();
        for (const hit of hits) {
            if (seen.get(hit.key)) continue; // still matching from an earlier render
            seen.set(hit.key, true);
            if (!hit.primed || !armed) continue; // first complete evaluation only primes
            // `[[dp]]` values are frozen at the edge, so the archive keeps what the
            // datapoint said when the rule fired. The prefetch cache answers for the
            // row that just triggered, so this usually resolves in a microtask.
            const draft = resolveDraftForRow(hit.rule.notify!, hit.dp);
            void freezeDraftTokens(draft, readValueDirect).then((frozen) =>
                useMessagesStore.getState().send(JSON.stringify(draftToPayload(frozen))),
            );
        }
        // Marked here rather than during the render pass: a double render (StrictMode)
        // would otherwise turn the priming pass into a firing one.
        for (const key of readyKeysRef.current) primedRef.current.add(key);
    });

    if (!hasRules) {
        notifyHitsRef.current = [];
        readyKeysRef.current = [];
        return EMPTY_MAP;
    }

    const out = new Map<string, RowCondResult>();
    const hits: NotifyHit[] = [];
    const ready: string[] = [];
    for (let i = 0; i < resolved.length; i++) {
        const { dp, rules } = resolved[i];
        if (!rules.length) continue;
        const item = items[i];
        if (!item || item.key === undefined) continue;
        const res = evalRowRules(rules, dp, item.value, valuesRef.current);
        if (res !== EMPTY_ROW_COND) out.set(item.key, res);

        if (!rules.some((r) => r.notify)) continue;
        // An element still waiting for a value cannot produce an edge — a rule
        // matching once the value lands would otherwise fire on every page load.
        const complete = item.loaded === true && ruleForeignRefs(rules, dp).every((ref) => valuesRef.current.has(ref));
        if (!complete) continue;
        ready.push(item.key);
        const primed = primedRef.current.has(item.key);
        for (const rule of matchingNotifyRules(rules, dp, item.value, valuesRef.current)) {
            hits.push({ key: `${item.key}\u0000${rule.id}`, dp, rule, primed });
        }
    }
    notifyHitsRef.current = hits;
    readyKeysRef.current = ready;
    return out;
}
