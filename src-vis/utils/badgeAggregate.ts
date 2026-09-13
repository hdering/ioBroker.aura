/**
 * Marker visibility and the aggregate number a tab / section shows for the markers
 * of its widgets.
 *
 * Kept out of hooks/useBadges so the arithmetic can be tested without React and
 * without a dev server (tools/tests/badge-aggregate.mjs).
 *
 * The aggregate used to be one fixed rule: count every widget that shows any
 * marker. A marker that is only decoration — a free text with no condition — was
 * counted like an alarm, which is what BadgeAggregateMode fixes: 'conditional'
 * looks at the markers that can switch off again, 'sum' adds up what the 'count'
 * markers display. `BadgeDef.countInAggregate: false` overrules the mode for a
 * single marker.
 */
import type { BadgeAggregateMode, BadgeDef } from '../types';
import { evaluateConditionWithSource, resolveRefValue, applySourceValues, type DpSourceCtx } from './conditionSources';
import { isActiveVal } from './groupTargets';

/** One widget's markers plus the token context they resolve against. */
export interface BadgeAggregateEntry {
    badges: BadgeDef[];
    ctx?: DpSourceCtx;
}

export function badgeVisible(b: BadgeDef, values: Map<string, unknown>, ctx?: DpSourceCtx): boolean {
    if (b.visibility === 'nonzero') {
        // Legacy mode, kept for stored configs — see BadgeDef.visibility.
        // An empty datapoint falls back to the widget's main DP; without one
        // (and without a list token) there is nothing to test → stay hidden.
        const val = resolveRefValue(b.dp, values, ctx);
        if (val === undefined) return false;
        return isActiveVal(val as never);
    }
    if (b.visibility === 'condition') {
        const clauses = b.clauses ?? [];
        if (!clauses.length) return true;
        return evaluateConditionWithSource({ logic: b.logic ?? 'AND', clauses }, values, ctx);
    }
    return true; // 'always' (default)
}

/**
 * Does this marker take part in the aggregate at all? Purely static — the live
 * value decides visibility, this decides eligibility.
 */
export function badgeInAggregate(b: BadgeDef, mode: BadgeAggregateMode = 'widgets'): boolean {
    if (b.countInAggregate === false) return false;
    // A marker that is always on says nothing about a state, so it must not raise
    // the number in this mode. 'nonzero' is the legacy form of a condition.
    if (mode === 'conditional') return b.visibility === 'condition' || b.visibility === 'nonzero';
    // Only the count marker carries a number of its own; a label is text and may
    // hold bindings that are resolved elsewhere (hooks/useBadges, useLabelBindings).
    if (mode === 'sum') return b.style === 'count';
    return true;
}

/** Datapoint value → summand. Booleans count like the count marker prints them. */
function toNumber(v: unknown): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

/**
 * The number the aggregate badge shows. 'widgets' / 'conditional' count widgets
 * (a widget with three visible markers is one), 'sum' adds the marker values.
 */
export function aggregateBadgeValue(
    entries: BadgeAggregateEntry[],
    values: Map<string, unknown>,
    mode: BadgeAggregateMode = 'widgets',
): number {
    let n = 0;
    for (const e of entries) {
        // Token values are widget-specific — refresh them before this widget's
        // markers are tested against the shared value map.
        applySourceValues(values, e.ctx);
        const eligible = e.badges.filter((b) => badgeInAggregate(b, mode));
        if (mode === 'sum') {
            for (const b of eligible) {
                if (!badgeVisible(b, values, e.ctx)) continue;
                const v = toNumber(resolveRefValue(b.dp, values, e.ctx));
                if (v !== undefined) n += v;
            }
        } else if (eligible.some((b) => badgeVisible(b, values, e.ctx))) {
            n++;
        }
    }
    // 0.1 + 0.2 must not reach the badge as 0.30000000000000004; the caller still
    // formats with the user's decimals on top of this.
    return mode === 'sum' ? Number(n.toFixed(6)) : n;
}
