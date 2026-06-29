import { useState, useEffect, useRef } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { evaluateCondition } from '../utils/conditionEval';
import { isActiveVal } from '../utils/groupTargets';
import type { BadgeDef, BadgeStyle, BadgeCorner, BadgeSize, WidgetCondition, WidgetConfig } from '../types';

export interface ResolvedBadge {
    id: string;
    style: BadgeStyle;
    corner: BadgeCorner;
    color?: string;
    size: BadgeSize;
    icon?: string;
    text?: string; // count value or label text
}

const EMPTY: ResolvedBadge[] = [];

// All datapoint refs a set of badges needs to subscribe to: the count DP plus
// any clause DPs used for conditional visibility. Values are keyed by the full
// ref (incl. JSON path) — the same convention as useConditionStyle.
function badgeDpRefs(badges: BadgeDef[]): string[] {
    const ids = new Set<string>();
    for (const b of badges) {
        // The count value and the 'nonzero' visibility test both read b.dp.
        if ((b.style === 'count' || b.visibility === 'nonzero') && b.dp) ids.add(b.dp);
        if (b.visibility === 'condition') {
            for (const cl of b.clauses ?? []) {
                if (cl.datapoint) ids.add(cl.datapoint);
                if (cl.valueType === 'datapoint' && cl.value) ids.add(cl.value);
            }
        }
    }
    return [...ids];
}

// Seed values from the module-level cache so already-known DPs (mock-before-mount
// in the screenshot harness, or a cold remount in production) resolve on first
// paint instead of waiting for a fresh socket round-trip.
function seedFromCache(refs: string[], values: Map<string, unknown>): void {
    for (const ref of refs) {
        const { id, path } = splitDpRef(ref);
        const cached = getStateFromCache(id);
        if (cached !== null) values.set(ref, resolveDpValue(cached.val, path));
    }
}

function badgeVisible(b: BadgeDef, values: Map<string, unknown>): boolean {
    if (b.visibility === 'nonzero') {
        if (!b.dp) return false; // no datapoint to test → nothing to show
        return isActiveVal(values.get(b.dp) as never);
    }
    if (b.visibility === 'condition') {
        const clauses = b.clauses ?? [];
        if (!clauses.length) return true;
        const cond: WidgetCondition = { id: b.id, logic: b.logic ?? 'AND', clauses, style: {} };
        return evaluateCondition(cond, values);
    }
    return true; // 'always' (default)
}

function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
}

function computeBadges(badges: BadgeDef[], values: Map<string, unknown>): ResolvedBadge[] {
    const out: ResolvedBadge[] = [];
    for (const b of badges) {
        if (!badgeVisible(b, values)) continue;
        let text: string | undefined;
        if (b.style === 'count') text = formatValue(values.get(b.dp ?? ''));
        else if (b.style === 'label') text = b.label ?? '';
        out.push({
            id: b.id,
            style: b.style,
            corner: b.corner ?? 'top-right',
            color: b.color,
            size: b.size ?? 'md',
            icon: b.icon,
            text,
        });
    }
    return out;
}

function sameBadges(a: ResolvedBadge[], b: ResolvedBadge[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.id !== y.id ||
            x.style !== y.style ||
            x.corner !== y.corner ||
            x.color !== y.color ||
            x.size !== y.size ||
            x.icon !== y.icon ||
            x.text !== y.text
        )
            return false;
    }
    return true;
}

/**
 * Resolve a list of badge definitions against live ioBroker values. Returns only
 * the badges that are currently visible, with their count/label text filled in.
 * Pass a STABLE `badges` reference (e.g. a module-level NO_BADGES constant for
 * the empty case) to avoid needless re-subscription.
 */
export function useBadges(badges: BadgeDef[] | undefined): ResolvedBadge[] {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [result, setResult] = useState<ResolvedBadge[]>(() => {
        if (!badges?.length) return EMPTY;
        seedFromCache(badgeDpRefs(badges), valuesRef.current);
        return computeBadges(badges, valuesRef.current);
    });

    useEffect(() => {
        const list = badges ?? [];
        if (!list.length) {
            setResult(EMPTY);
            return;
        }

        const recompute = () => {
            const next = computeBadges(list, valuesRef.current);
            setResult((prev) => (sameBadges(prev, next) ? prev : next));
        };

        const refs = badgeDpRefs(list);
        seedFromCache(refs, valuesRef.current);
        // Always-visible label/dot badges with no DP: compute once, no subscription.
        if (!refs.length) {
            recompute();
            return;
        }

        let cancelled = false;
        const unsubscribers = refs.map((ref) => {
            const { id, path } = splitDpRef(ref);
            getState(id).then((state) => {
                if (cancelled || state === null) return;
                valuesRef.current.set(ref, resolveDpValue(state.val, path));
                recompute();
            });
            return subscribe(id, (state) => {
                if (cancelled) return;
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                recompute();
            });
        });
        recompute();
        return () => {
            cancelled = true;
            unsubscribers.forEach((fn) => fn());
        };
    }, [badges, subscribe, getState]);

    return result;
}

/**
 * Count how many widgets on a tab currently show at least one visible badge.
 * Drives the optional per-tab aggregate badge.
 */
export function useTabBadgeAggregate(widgets: WidgetConfig[] | undefined): number {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [count, setCount] = useState(0);

    useEffect(() => {
        const perWidget = (widgets ?? [])
            .map((w) => ({ id: w.id, badges: (w.options?.badges as BadgeDef[] | undefined) ?? [] }))
            .filter((x) => x.badges.length > 0);

        if (!perWidget.length) {
            setCount(0);
            return;
        }

        const recompute = () => {
            let n = 0;
            for (const w of perWidget) {
                if (w.badges.some((b) => badgeVisible(b, valuesRef.current))) n++;
            }
            setCount((prev) => (prev === n ? prev : n));
        };

        const refs = [...new Set(perWidget.flatMap((x) => badgeDpRefs(x.badges)))];
        seedFromCache(refs, valuesRef.current);
        recompute(); // always-visible + already-cached badges already count
        if (!refs.length) return;

        let cancelled = false;
        const unsubscribers = refs.map((ref) => {
            const { id, path } = splitDpRef(ref);
            getState(id).then((state) => {
                if (cancelled || state === null) return;
                valuesRef.current.set(ref, resolveDpValue(state.val, path));
                recompute();
            });
            return subscribe(id, (state) => {
                if (cancelled) return;
                valuesRef.current.set(ref, resolveDpValue(state?.val, path));
                recompute();
            });
        });
        return () => {
            cancelled = true;
            unsubscribers.forEach((fn) => fn());
        };
    }, [widgets, subscribe, getState]);

    return count;
}
