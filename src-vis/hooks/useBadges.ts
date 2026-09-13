import { useState, useEffect, useMemo, useRef } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import { useTemplateStates } from './useTemplateValues';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';
import { badgeLabelRefs, hasBadgeBinding, renderBadgeLabel } from '../utils/badgeLabel';
import { formatNum } from '../utils/formatValue';
import { useGlobalSettingsStore } from '../store/globalSettingsStore';
import { useT } from '../i18n';
import {
    applySourceValues,
    clauseSourceRefs,
    resolveRefValue,
    sourceCtxKey,
    sourceRefs,
    widgetSourceCtx,
    type DpSourceCtx,
} from '../utils/conditionSources';
import { aggregateBadgeValue, badgeInAggregate, badgeVisible } from '../utils/badgeAggregate';
import type { BadgeAggregateMode, BadgeDef, BadgeStyle, BadgeCorner, BadgeSize, WidgetConfig } from '../types';

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
// ref (incl. JSON path) — the same convention as useConditionStyle. Token refs
// ('' / '{dp}' / '{list:…}') expand to the widget's own / list datapoints.
function badgeDpRefs(badges: BadgeDef[], ctx?: DpSourceCtx): string[] {
    const ids = new Set<string>();
    for (const b of badges) {
        // The count value and the legacy 'nonzero' visibility test both read b.dp.
        if (b.style === 'count' || b.visibility === 'nonzero') {
            sourceRefs(b.dp, ctx).forEach((r) => ids.add(r));
        }
        if (b.visibility === 'condition') {
            for (const cl of b.clauses ?? []) {
                clauseSourceRefs(cl, ctx).forEach((r) => {
                    if (r) ids.add(r);
                });
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

function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
}

function computeBadges(badges: BadgeDef[], values: Map<string, unknown>, ctx?: DpSourceCtx): ResolvedBadge[] {
    const out: ResolvedBadge[] = [];
    applySourceValues(values, ctx);
    for (const b of badges) {
        if (!badgeVisible(b, values, ctx)) continue;
        let text: string | undefined;
        if (b.style === 'count') text = formatValue(resolveRefValue(b.dp, values, ctx));
        // The label is handed over raw — its `{dp}` bindings are filled in by
        // useLabelBindings, which needs React state of its own for them.
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
export function useBadges(badges: BadgeDef[] | undefined, ctx?: DpSourceCtx): ResolvedBadge[] {
    const { subscribe, getState } = useIoBroker();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    // Context identity is up to the caller — key the effect on its content.
    const ctxRef = useRef<DpSourceCtx | undefined>(ctx);
    ctxRef.current = ctx;
    const ctxKey = sourceCtxKey(ctx);
    const [result, setResult] = useState<ResolvedBadge[]>(() => {
        if (!badges?.length) return EMPTY;
        seedFromCache(badgeDpRefs(badges, ctx), valuesRef.current);
        return computeBadges(badges, valuesRef.current, ctx);
    });

    useEffect(() => {
        const list = badges ?? [];
        if (!list.length) {
            setResult(EMPTY);
            return;
        }

        const recompute = () => {
            const next = computeBadges(list, valuesRef.current, ctxRef.current);
            setResult((prev) => (sameBadges(prev, next) ? prev : next));
        };

        const refs = badgeDpRefs(list, ctxRef.current);
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
    }, [badges, subscribe, getState, ctxKey]);

    return useLabelBindings(result, ctx?.ownDp);
}

/**
 * Fills the datapoint bindings of the visible label badges (utils/badgeLabel).
 *
 * A second subscription set on purpose: the value map above keeps values only, while
 * a binding may address `ts` / `lc` and run the value through operations — that is
 * what useTemplateStates delivers. Nothing is subscribed for a label without a
 * brace, which is every marker that does not use the feature.
 */
function useLabelBindings(badges: ResolvedBadge[], ownDp?: string): ResolvedBadge[] {
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const t = useT();
    const labels = badges.filter((b) => b.style === 'label' && hasBadgeBinding(b.text)).map((b) => b.text);
    // Depend on the contents, not the array identity — the badge list is rebuilt on
    // every value change, and an equal set of texts must not re-subscribe.
    const textKey = labels.join('\n');
    const refs = useMemo(
        () => (textKey ? badgeLabelRefs(labels, ownDp) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [textKey, ownDp],
    );
    const states = useTemplateStates(refs);

    return useMemo(() => {
        if (!textKey) return badges;
        // A marker is a few pixels wide, so the global decimals are a MAXIMUM here,
        // not a fixed width: '12 min', not '12.00 min'. An explicit
        // `{id;formatValue(2)}` still pads, being the user's own instruction.
        const fmt = (v: unknown): string => {
            if (v === null || v === undefined) return '–';
            if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
            const rounded = Number(v.toFixed(Math.max(0, defaultDecimals)));
            const decimals = (String(rounded).split('.')[1] ?? '').length;
            return formatNum(rounded, decimals, numberFormat);
        };
        const env = {
            states,
            ownDp,
            fmt,
            ops: { formatNum: (v: number, d: number) => formatNum(v, d, numberFormat), decimals: defaultDecimals, t },
        };
        return badges.map((b) =>
            b.style === 'label' && hasBadgeBinding(b.text)
                ? { ...b, text: renderBadgeLabel(b.text as string, env) }
                : b,
        );
    }, [badges, textKey, states, ownDp, defaultDecimals, numberFormat, t]);
}

/** Value + ready-to-print text of a tab's / section's aggregate badge. */
export interface TabBadgeAggregate {
    value: number;
    text: string;
}

/**
 * The number behind the optional per-tab / per-section aggregate badge: how many
 * widgets currently show a marker ('widgets' / 'conditional') or the sum of the
 * values their count markers display ('sum'). See utils/badgeAggregate for what
 * each mode lets through.
 */
export function useTabBadgeAggregate(
    widgets: WidgetConfig[] | undefined,
    mode: BadgeAggregateMode = 'widgets',
): TabBadgeAggregate {
    const { subscribe, getState } = useIoBroker();
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const valuesRef = useRef<Map<string, unknown>>(new Map());
    const [count, setCount] = useState(0);

    useEffect(() => {
        const perWidget = (widgets ?? [])
            .map((w) => ({
                id: w.id,
                // Markers the mode excludes are dropped here, so they are not even
                // subscribed to — the aggregate must not keep a datapoint alive that
                // it will never look at.
                badges: ((w.options?.badges as BadgeDef[] | undefined) ?? []).filter((b) => badgeInAggregate(b, mode)),
                ctx: widgetSourceCtx(w),
            }))
            .filter((x) => x.badges.length > 0);

        if (!perWidget.length) {
            setCount(0);
            return;
        }

        const recompute = () => {
            const n = aggregateBadgeValue(perWidget, valuesRef.current, mode);
            setCount((prev) => (prev === n ? prev : n));
        };

        const refs = [...new Set(perWidget.flatMap((x) => badgeDpRefs(x.badges, x.ctx)))];
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
    }, [widgets, subscribe, getState, mode]);

    return useMemo(() => {
        // A marker is a few pixels wide: the global decimals are a maximum, not a
        // fixed width (same rule as the label bindings above). Counts are integers
        // and pass through untouched.
        const rounded = Number(count.toFixed(Math.max(0, defaultDecimals)));
        const decimals = (String(rounded).split('.')[1] ?? '').length;
        return { value: rounded, text: formatNum(rounded, decimals, numberFormat) };
    }, [count, defaultDecimals, numberFormat]);
}
