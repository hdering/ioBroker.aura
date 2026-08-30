import type { ConditionClause, WidgetConfig, ioBrokerState } from '../types';
import { evaluateClause, OWN_DP_TOKEN } from './conditionEval';
import { computeListStats } from './listStats';
import { isActiveVal } from './groupTargets';
import type { TranslationKey } from '../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Datapoint *sources* for conditions and badges.
//
// A clause / badge normally names a concrete ioBroker state. On top of that a
// small token vocabulary lets it reference values the widget already knows, so
// the user doesn't have to re-enter (or even have) a datapoint:
//
//   ''  /  '{dp}'   → the widget's main datapoint (config.datapoint)
//   '{list}' / '{list:any}'   → clause matches when ONE list entry matches
//   '{list:all}' / '{list:none}'
//   '{list:count}'  → number of list entries          (a value, not a quantifier)
//   '{list:active}' → number of active entries (>0/true/non-empty)
//   '{list:sum}' | '{list:avg}' | '{list:min}' | '{list:max}'
//
// The tokens live in the existing `datapoint` string field — no type change and
// no config migration. Widgets without a main DP (static/dynamic list) can use
// the list tokens; widgets without any of it (tabs, sections) simply pass no
// context, in which case a token resolves to nothing and its clause is false.
// ─────────────────────────────────────────────────────────────────────────────

/** Token that stands for the widget's own (main) datapoint. Also used by cells and
 *  list rows. Declared in conditionEval so pure consumers can import it without the
 *  list-stats chain below. */
export { OWN_DP_TOKEN };

export type ListAgg = 'any' | 'all' | 'none' | 'count' | 'active' | 'sum' | 'avg' | 'min' | 'max';

/** Aggregations that yield a single value (usable as a badge DP / compare value). */
export const LIST_VALUE_AGGS: ListAgg[] = ['count', 'active', 'sum', 'avg', 'min', 'max'];
/** Aggregations that test every list entry — only meaningful inside a clause. */
export const LIST_QUANTIFIER_AGGS: ListAgg[] = ['any', 'all', 'none'];

export function listToken(agg: ListAgg): string {
    return `{list:${agg}}`;
}

export interface DpSourceCtx {
    /** The widget's main datapoint ref, if it has one. */
    ownDp?: string;
    /** Datapoint refs of the widget's list entries, if it is a list widget. */
    listRefs?: string[];
}

export interface ParsedRef {
    kind: 'dp' | 'own' | 'list';
    /** The raw ref (only meaningful for kind 'dp'). */
    ref: string;
    agg?: ListAgg;
}

const AGGS = new Set<string>([...LIST_VALUE_AGGS, ...LIST_QUANTIFIER_AGGS]);

/** Classify a datapoint ref: plain state id, own-DP token or list token. */
export function parseSourceRef(ref: string | undefined | null): ParsedRef {
    const r = (ref ?? '').trim();
    // Empty means "the widget's own datapoint" — the whole point of the fallback.
    if (!r || r === OWN_DP_TOKEN) return { kind: 'own', ref: r };
    if (r.startsWith('{list') && r.endsWith('}')) {
        const inner = r.slice(1, -1); // 'list' | 'list:sum' | …
        const sep = inner.indexOf(':');
        const agg = sep === -1 ? 'any' : inner.slice(sep + 1).trim();
        if (AGGS.has(agg)) return { kind: 'list', ref: r, agg: agg as ListAgg };
        return { kind: 'list', ref: r, agg: 'any' };
    }
    return { kind: 'dp', ref: r };
}

/** True when the ref is an explicit token (not a plain — possibly empty — state id). */
export function isSourceToken(ref: string | undefined | null): boolean {
    const r = (ref ?? '').trim();
    return r === OWN_DP_TOKEN || (r.startsWith('{list') && r.endsWith('}'));
}

/** Canonical token spelling for the UI select ('{list}' → '{list:any}'). */
export function normalizeSourceToken(ref: string | undefined | null): string {
    const r = (ref ?? '').trim();
    if (!isSourceToken(r)) return '';
    if (r === OWN_DP_TOKEN) return OWN_DP_TOKEN;
    const p = parseSourceRef(r);
    return listToken(p.agg ?? 'any');
}

export function isListQuantifier(agg: ListAgg | undefined): boolean {
    return agg === 'any' || agg === 'all' || agg === 'none';
}

/** Stable string identity of a context — use as a React effect dependency. */
export function sourceCtxKey(ctx: DpSourceCtx | undefined): string {
    if (!ctx) return '';
    return `${ctx.ownDp ?? ''}#${(ctx.listRefs ?? []).join(',')}`;
}

/** The real state refs a (possibly token) ref needs subscribed. */
export function sourceRefs(ref: string | undefined | null, ctx: DpSourceCtx | undefined): string[] {
    const p = parseSourceRef(ref);
    if (p.kind === 'own') return ctx?.ownDp ? [ctx.ownDp] : [];
    if (p.kind === 'list') return ctx?.listRefs?.length ? [...ctx.listRefs] : [];
    return [p.ref];
}

/** All real state refs one clause needs (datapoint side + datapoint compare value). */
export function clauseSourceRefs(clause: ConditionClause, ctx: DpSourceCtx | undefined): string[] {
    const refs = sourceRefs(clause.datapoint, ctx);
    if (clause.valueType === 'datapoint' && clause.value) refs.push(...sourceRefs(clause.value, ctx));
    return refs;
}

/** The list values in entry order (unresolved entries come through as undefined). */
function listValues(values: Map<string, unknown>, ctx: DpSourceCtx | undefined): unknown[] {
    return (ctx?.listRefs ?? []).map((ref) => values.get(ref));
}

/**
 * Write the derived token values into the value map so the ordinary lookup path
 * (and any `{dp}` / `{list:sum}` compare value) resolves them. Call once before
 * evaluating a set of conditions.
 */
export function applySourceValues(values: Map<string, unknown>, ctx: DpSourceCtx | undefined): void {
    if (!ctx) return;
    if (ctx.ownDp) values.set(OWN_DP_TOKEN, values.get(ctx.ownDp) ?? null);
    const refs = ctx.listRefs ?? [];
    if (!refs.length) return;

    values.set(listToken('count'), refs.length);
    values.set(
        listToken('active'),
        refs.reduce((n, ref) => n + (isActiveVal(values.get(ref) as ioBrokerState['val']) ? 1 : 0), 0),
    );

    // Numeric aggregates reuse the list widgets' own stat helper (non-numeric
    // values are skipped there, so a mixed list still yields a usable sum).
    const stats = computeListStats(
        refs.map((id) => ({ id })),
        Object.fromEntries(refs.map((ref) => [ref, { val: values.get(ref) }])),
    );
    values.set(listToken('sum'), stats ? stats.sum : null);
    values.set(listToken('avg'), stats ? stats.avg : null);
    values.set(listToken('min'), stats ? stats.min : null);
    values.set(listToken('max'), stats ? stats.max : null);
}

/**
 * Value behind a ref, tokens included. Returns undefined when the token cannot
 * be resolved in this context (no main DP / not a list widget).
 */
export function resolveRefValue(
    ref: string | undefined | null,
    values: Map<string, unknown>,
    ctx: DpSourceCtx | undefined,
): unknown {
    const p = parseSourceRef(ref);
    if (p.kind === 'own') return ctx?.ownDp ? (values.get(ctx.ownDp) ?? null) : undefined;
    if (p.kind === 'list') {
        if (!ctx?.listRefs?.length || isListQuantifier(p.agg)) return undefined;
        return values.get(listToken(p.agg!));
    }
    return values.get(p.ref) ?? null;
}

/** Evaluate one clause, resolving own-DP / list tokens against the context. */
export function evaluateClauseWithSource(
    clause: ConditionClause,
    values: Map<string, unknown>,
    ctx: DpSourceCtx | undefined,
    changed?: ReadonlySet<string>,
): boolean {
    // 'changed' asks about the transition, not the value — resolve the clause to the
    // real state refs behind it and ask whether one of them just delivered a new value.
    if (clause.operator === 'changed') {
        if (!changed?.size) return false;
        return clauseSourceRefs(clause, ctx).some((ref) => changed.has(ref));
    }

    const p = parseSourceRef(clause.datapoint);

    if (p.kind === 'list' && isListQuantifier(p.agg)) {
        const vals = listValues(values, ctx);
        if (!vals.length) return false; // nothing to test against
        const hits = vals.map((v) => evaluateClause(clause, v ?? null, values));
        if (p.agg === 'all') return hits.every(Boolean);
        if (p.agg === 'none') return !hits.some(Boolean);
        return hits.some(Boolean); // 'any'
    }

    const raw = resolveRefValue(clause.datapoint, values, ctx);
    if (raw === undefined) return false; // token not resolvable here
    return evaluateClause(clause, raw, values);
}

/** Condition-level evaluation with source resolution (widgets + badges). */
export function evaluateConditionWithSource(
    cond: { logic?: 'AND' | 'OR'; clauses: ConditionClause[] },
    values: Map<string, unknown>,
    ctx: DpSourceCtx | undefined,
    changed?: ReadonlySet<string>,
): boolean {
    if (!cond.clauses.length) return false;
    const results = cond.clauses.map((c) => evaluateClauseWithSource(c, values, ctx, changed));
    return (cond.logic ?? 'AND') === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

/** True when at least one clause tests the list entry by entry (`{list:any}`). */
export function hasListAnyClause(cond: { clauses: ConditionClause[] }): boolean {
    return cond.clauses.some((c) => {
        const p = parseSourceRef(c.datapoint);
        return p.kind === 'list' && p.agg === 'any';
    });
}

/**
 * Which list entries made the condition match — the rows a per-row effect fans out
 * over (issue #605).
 *
 * Only `{list:any}` names a single row: `all` / `none` and the value aggregates
 * speak about the list as a whole, a plain datapoint clause about neither. So the
 * row set is built from the `any` clauses alone while everything else stays a global
 * gate, which is what makes "ein Eintrag offen AND Nachtmodus" point at the open
 * entries rather than at all of them.
 *
 * AND intersects the per-clause hits, OR unions them. An empty result means no row
 * is identifiable (no list context, no `any` clause, or the match came from a global
 * clause under OR) — the caller then treats the match as list-wide.
 */
export function matchingListRefs(
    cond: { logic?: 'AND' | 'OR'; clauses: ConditionClause[] },
    values: Map<string, unknown>,
    ctx: DpSourceCtx | undefined,
    changed?: ReadonlySet<string>,
): string[] {
    const refs = ctx?.listRefs ?? [];
    if (!refs.length || !cond.clauses.length) return [];

    const hitSets: string[][] = [];
    for (const clause of cond.clauses) {
        const p = parseSourceRef(clause.datapoint);
        if (p.kind !== 'list' || p.agg !== 'any') continue;
        // 'changed' asks about the transition: the rows that just delivered a value.
        if (clause.operator === 'changed') {
            hitSets.push(changed?.size ? refs.filter((ref) => changed.has(ref)) : []);
            continue;
        }
        hitSets.push(refs.filter((ref) => evaluateClause(clause, values.get(ref) ?? null, values)));
    }
    if (!hitSets.length) return [];

    if ((cond.logic ?? 'AND') === 'AND') {
        return hitSets[0].filter((ref) => hitSets.every((set) => set.includes(ref)));
    }
    return refs.filter((ref) => hitSets.some((set) => set.includes(ref)));
}

/** True when the rule asks about a transition rather than a state. */
export function hasChangedClause(cond: { clauses: ConditionClause[] }): boolean {
    return cond.clauses.some((c) => c.operator === 'changed');
}

// ── Per-widget context ────────────────────────────────────────────────────────

interface EntryLike {
    id?: unknown;
}

/**
 * The value sources a widget offers to its conditions / badges: its main
 * datapoint plus — for the static and dynamic list — the datapoints of its
 * entries. The dynamic list persists its discovered entries into
 * `options.entries`, so both list types read the same way.
 */
export function widgetSourceCtx(config: WidgetConfig): DpSourceCtx {
    const ownDp = config.datapoint?.trim() || undefined;
    let listRefs: string[] | undefined;
    if (config.type === 'list' || config.type === 'autolist') {
        const entries = config.options?.entries;
        if (Array.isArray(entries)) {
            const ids = (entries as EntryLike[])
                .map((e) => (typeof e?.id === 'string' ? e.id.trim() : ''))
                .filter(Boolean);
            if (ids.length) listRefs = ids;
        }
    }
    return { ownDp, listRefs };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export interface SourceOption {
    value: string;
    /** i18n key for the option label. */
    labelKey: TranslationKey;
}

const LIST_VALUE_OPTIONS: SourceOption[] = [
    { value: listToken('count'), labelKey: 'cond.srcListCount' },
    { value: listToken('active'), labelKey: 'cond.srcListActive' },
    { value: listToken('sum'), labelKey: 'cond.srcListSum' },
    { value: listToken('avg'), labelKey: 'cond.srcListAvg' },
    { value: listToken('min'), labelKey: 'cond.srcListMin' },
    { value: listToken('max'), labelKey: 'cond.srcListMax' },
];

// The main DP is NOT offered as its own option: an empty datapoint field already
// means exactly that (parseSourceRef maps both to kind 'own'), so a '{dp}' entry
// would be a second name for the same thing. Stored '{dp}' refs keep resolving;
// the editors show them as the equivalent empty field.

/** Source options for a clause (quantifiers + value aggregates). */
export function clauseSourceOptions(ctx: DpSourceCtx | undefined): SourceOption[] {
    const out: SourceOption[] = [{ value: '', labelKey: 'cond.srcDatapoint' }];
    if (ctx?.listRefs?.length) {
        out.push(
            { value: listToken('any'), labelKey: 'cond.srcListAny' },
            { value: listToken('all'), labelKey: 'cond.srcListAll' },
            { value: listToken('none'), labelKey: 'cond.srcListNone' },
            ...LIST_VALUE_OPTIONS,
        );
    }
    return out;
}

/** Source options for a plain value field (badge datapoint) — no quantifiers. */
export function valueSourceOptions(ctx: DpSourceCtx | undefined): SourceOption[] {
    const out: SourceOption[] = [{ value: '', labelKey: 'cond.srcDatapoint' }];
    if (ctx?.listRefs?.length) out.push(...LIST_VALUE_OPTIONS);
    return out;
}

/**
 * Editor view of a datapoint ref: the legacy explicit main-DP token collapses to
 * the empty field that now stands for it. Cell conditions use the very same
 * token for "own cell value" — never pass their refs through here.
 */
export function dropOwnDpToken(ref: string | undefined | null): string {
    const r = ref ?? '';
    return r.trim() === OWN_DP_TOKEN ? '' : r;
}
