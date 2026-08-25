/**
 * Free-form sort rules for the static and the dynamic list.
 *
 * Sorting used to be two fixed slots — a key plus a direction, and a tie-breaker with
 * the same — which could say "by name" or "by value" and, since issue #572, "by a
 * datapoint of the second line". What it could not say is *how* to compare: a text
 * datapoint holding `ON`/`OFF`/`ERROR` has no useful alphabetical order, rows whose
 * extra datapoint simply does not exist always landed in the same place, and three
 * criteria were one too many.
 *
 * A sort rule fixes that the same way a filter preset fixed the three fixed filter
 * modes (utils/listFilter): the admin writes a CHAIN of rules, each naming what it
 * reads (main value / row name / one datapoint of the second line), how it compares
 * (automatic, number, text, active first, or an order the admin types out) and where
 * rows without a value go.
 *
 * The two old option pairs stay readable: effectiveSortRules() maps them onto the
 * same chain, so stored dashboards sort exactly as before and both widgets have a
 * single code path.
 */
import { isActiveVal } from './groupTargets';
import {
    subMatchesKey,
    sortSubKey,
    type ListFilterCandidate,
    type ListFilterRow,
    type ListSortKey,
} from './listFilter';
import type { ioBrokerState } from '../types';

/** Which value of a row a sort rule reads. */
export type ListSortSource = 'value' | 'name' | 'sub';

/** How the two values of a rule are compared. */
export type ListSortMode = 'auto' | 'number' | 'text' | 'active' | 'custom';

export interface ListSortRule {
    /** Default 'value' — the row's main datapoint. */
    source?: ListSortSource;
    /**
     * 'sub': which extra datapoint of the second line, matched against its label, its
     * full id or its last id segment — the same convention a filter rule's `subKey`
     * uses, so `{{parent}}.BATTERY` is addressed as `BATTERY` in every row.
     * Empty = the first extra datapoint of the row.
     */
    subKey?: string;
    /** Default 'asc'. */
    order?: 'asc' | 'desc';
    /** Default 'auto': numbers numerically, booleans false→true, everything else as text. */
    mode?: ListSortMode;
    /** mode 'custom': the value order, first entry first. Values not listed follow behind. */
    values?: string[];
    /** Where rows without a value land, regardless of direction. Default 'last'. */
    empty?: 'first' | 'last';
}

/** The option block both list widgets share for sorting — new chain plus the old pair. */
export interface ListSortOptions {
    /** The rule chain. Present and non-empty, it replaces sortBy/sortBy2 entirely. */
    sortRules?: ListSortRule[];
    sortBy?: ListSortKey;
    sortOrder?: 'asc' | 'desc';
    sortBy2?: ListSortKey;
    sortOrder2?: 'asc' | 'desc';
}

export const SORT_SOURCE_LABELS: Record<ListSortSource, string> = {
    value: 'Wert',
    name: 'Name',
    sub: '2. Zeile',
};

export const SORT_MODES: { value: ListSortMode; label: string; hint: string }[] = [
    { value: 'auto', label: 'Automatisch', hint: 'Zahlen numerisch, Text alphabetisch (mit Zahlen darin)' },
    { value: 'number', label: 'Als Zahl', hint: 'Text wird in eine Zahl gewandelt; was keine ist, gilt als ohne Wert' },
    { value: 'text', label: 'Als Text', hint: 'Rein alphabetisch — „10“ steht damit vor „9“' },
    { value: 'active', label: 'Aktiv / Inaktiv', hint: 'An / > 0 zuerst, Rest danach' },
    { value: 'custom', label: 'Eigene Reihenfolge', hint: 'Werte in der Reihenfolge, in der sie unten stehen' },
];

/** Direction labels — they only read right once the mode is known. */
export function orderLabels(mode: ListSortMode | undefined): { asc: string; desc: string } {
    if (mode === 'active') return { asc: 'Aktive zuerst', desc: 'Inaktive zuerst' };
    if (mode === 'custom') return { asc: 'Wie aufgelistet', desc: 'Umgekehrt' };
    if (mode === 'text') return { asc: 'A → Z', desc: 'Z → A' };
    return { asc: '↑ Aufsteigend', desc: '↓ Absteigend' };
}

/** A rule with no readable source is a half-configured card, not a criterion. */
export function isUsableRule(rule: ListSortRule | undefined): boolean {
    if (!rule) return false;
    if (rule.mode === 'custom' && !(rule.values ?? []).some((v) => v.trim() !== '')) {
        // An empty list would compare every row as "not listed" — i.e. sort by nothing.
        return false;
    }
    return true;
}

/**
 * The chain the widgets sort by: the rules if the admin wrote any, otherwise the two
 * legacy option pairs mapped onto the same shape. Empty = keep the configured order.
 */
export function effectiveSortRules(o: ListSortOptions | undefined): ListSortRule[] {
    const rules = (o?.sortRules ?? []).filter(isUsableRule);
    if (rules.length) return rules;
    const out: ListSortRule[] = [];
    const push = (key: ListSortKey | undefined, order: 'asc' | 'desc' | undefined) => {
        if (!key || key === 'none') return;
        const sub = sortSubKey(key);
        if (sub !== null) out.push({ source: 'sub', subKey: sub, order });
        else out.push({ source: key === 'label' ? 'name' : 'value', order });
    };
    push(o?.sortBy, o?.sortOrder);
    // The old tie-breaker was ignored when it repeated the first key — keep that.
    if (o?.sortBy2 && o.sortBy2 !== 'none' && o.sortBy2 !== o.sortBy) push(o.sortBy2, o.sortOrder2);
    return out;
}

/** Does anything sort this list at all? */
export function hasSorting(o: ListSortOptions | undefined): boolean {
    return effectiveSortRules(o).length > 0;
}

/** Value one rule reads from a row. */
export function ruleValue(rule: ListSortRule, row: ListFilterRow): unknown {
    const source = rule.source ?? 'value';
    if (source === 'name') return row.label ?? '';
    if (source === 'value') return row.value ?? null;
    const subs: ListFilterCandidate[] = row.subs ?? [];
    const key = (rule.subKey ?? '').trim();
    // No key = "the datapoint of the second line", which is what a list with exactly
    // one extra datapoint per row means. `find` with an empty key matches the first.
    const hit = subs.find((s) => subMatchesKey(s, key));
    return hit ? (hit.value ?? null) : null;
}

/** true = there is nothing to compare, so the rule's `empty` decides the position. */
function isMissing(val: unknown, mode: ListSortMode): boolean {
    if (val === null || val === undefined || val === '') return true;
    // In number mode a non-numeric value has no place on the scale either.
    return mode === 'number' && !isFinite(Number(val));
}

function textOf(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return '';
        }
    }
    return String(val);
}

/** Position of a value in a hand-written order. Unlisted values sort behind all listed. */
function customRank(val: unknown, values: string[] | undefined): number {
    const list = (values ?? []).map((v) => v.trim().toLowerCase()).filter((v) => v !== '');
    const key = textOf(val).trim().toLowerCase();
    const at = list.indexOf(key);
    return at === -1 ? list.length : at;
}

/** The 'auto' comparison — the behaviour both widgets had before the rule chain. */
function compareAuto(a: unknown, b: unknown): number {
    if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return textOf(a).localeCompare(textOf(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** One rule against two rows. */
export function compareByRule(rule: ListSortRule, a: ListFilterRow, b: ListFilterRow): number {
    const mode = rule.mode ?? 'auto';
    const va = ruleValue(rule, a);
    const vb = ruleValue(rule, b);
    const ma = isMissing(va, mode);
    const mb = isMissing(vb, mode);
    if (ma || mb) {
        // Missing values are placed by `empty`, NOT by the direction: a row whose
        // battery datapoint does not exist should stay out of the way in both
        // directions — otherwise every "worst battery first" list starts with the
        // devices that have no battery at all.
        if (ma && mb) return 0;
        const last = (rule.empty ?? 'last') === 'last';
        return ma === last ? 1 : -1;
    }
    let cmp: number;
    if (mode === 'number') cmp = Number(va) - Number(vb);
    else if (mode === 'text') cmp = textOf(va).localeCompare(textOf(vb), undefined, { sensitivity: 'base' });
    else if (mode === 'active')
        cmp = (isActiveVal(va as ioBrokerState['val']) ? 0 : 1) - (isActiveVal(vb as ioBrokerState['val']) ? 0 : 1);
    else if (mode === 'custom') cmp = customRank(va, rule.values) - customRank(vb, rule.values);
    else cmp = compareAuto(va, vb);
    if (cmp === 0) return 0;
    return (rule.order ?? 'asc') === 'desc' ? -cmp : cmp;
}

/** The whole chain against two rows: the first rule that separates them wins. */
export function compareByRules(rules: ListSortRule[], a: ListFilterRow, b: ListFilterRow): number {
    for (const rule of rules) {
        const cmp = compareByRule(rule, a, b);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

/**
 * Comparator over the widgets' own entry type, or null when nothing sorts.
 *
 * `toRow` is the expensive part (a rendered row name resolves `[[dp]]` tokens), so
 * with `keyOf` it is called once per entry instead of once per comparison.
 */
export function makeSortComparator<T>(
    rules: ListSortRule[],
    toRow: (item: T) => ListFilterRow,
    keyOf?: (item: T) => string,
): ((a: T, b: T) => number) | null {
    if (!rules.length) return null;
    if (!keyOf) return (a, b) => compareByRules(rules, toRow(a), toRow(b));
    const cache = new Map<string, ListFilterRow>();
    const rowOf = (item: T) => {
        const key = keyOf(item);
        let row = cache.get(key);
        if (!row) {
            row = toRow(item);
            cache.set(key, row);
        }
        return row;
    };
    return (a, b) => compareByRules(rules, rowOf(a), rowOf(b));
}

// ── Editor support ────────────────────────────────────────────────────────────

/** How one rule reads in a sentence — the summary on the button and in the hints. */
export function sortRuleLabel(rule: ListSortRule): string {
    const source = rule.source ?? 'value';
    const what =
        source === 'sub' ? `2. Zeile: ${(rule.subKey ?? '').trim() || 'erster DP'}` : SORT_SOURCE_LABELS[source];
    const dir = (rule.order ?? 'asc') === 'desc' ? '↓' : '↑';
    const mode = rule.mode ?? 'auto';
    if (mode === 'active') return `${what} (${(rule.order ?? 'asc') === 'desc' ? 'inaktive' : 'aktive'} zuerst)`;
    if (mode === 'custom')
        return `${what} (eigene Reihenfolge${(rule.order ?? 'asc') === 'desc' ? ', umgekehrt' : ''})`;
    return `${what} ${dir}`;
}

/** The whole chain in one line, e.g. `Name ↑ · dann 2. Zeile: Akku ↓`. */
export function sortSummary(o: ListSortOptions | undefined): string {
    const rules = effectiveSortRules(o);
    if (!rules.length) return '';
    return rules.map(sortRuleLabel).join(' · dann ');
}

/** A fresh rule for the "+ Kriterium" button — the main value, ascending. */
export function newSortRule(): ListSortRule {
    return { source: 'value' };
}

/**
 * Distinct values the rule currently reads, for the custom-order editor and the
 * preview. Sorted the way the mode would, so the list doubles as a starting point
 * for typing an order out.
 */
export function collectSortValues(rule: ListSortRule, rows: ListFilterRow[], limit = 40): string[] {
    const seen = new Set<string>();
    for (const row of rows) {
        const text = textOf(ruleValue(rule, row));
        if (text !== '') seen.add(text);
    }
    return [...seen]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .slice(0, limit);
}

/** Rows in the order the chain puts them — the editor's live preview. */
export function sortPreview(rules: ListSortRule[], rows: ListFilterRow[]): ListFilterRow[] {
    if (!rules.length) return rows;
    return [...rows].sort((a, b) => compareByRules(rules, a, b));
}
