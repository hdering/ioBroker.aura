/**
 * Free-form display filters for the static and the dynamic list.
 *
 * Both lists used to offer exactly three modes — Alle / Nur aktive / Nur inaktive —
 * which only ever looked at the row's MAIN datapoint and only ever asked "truthy?".
 * A filter preset replaces that with named rules the admin writes: an operator plus
 * a comparison value, applied to the main datapoint, to the extra datapoints of the
 * second line (see EntrySubLine / subDpTemplate), or to both at once.
 *
 * The operator engine is the one WidgetCondition / cell conditions already use
 * (utils/conditionEval) so `>=`, `contains` & co. behave identically everywhere;
 * only `empty` / `notEmpty` are added on top, because "the device did not answer"
 * is a list-specific thing to filter for.
 *
 * The three old modes stay as built-ins, so stored dashboards keep working and the
 * common case needs no configuration.
 */
import { isActiveVal } from './groupTargets';
import { evaluateClause } from './conditionEval';
import type { ConditionClause, ConditionOperator } from '../types';

/** Condition operators plus the two "is there a value at all" checks. */
export type ListFilterOperator = ConditionOperator | 'empty' | 'notEmpty';

/** Which value(s) of a row a rule reads. */
export type ListFilterSource = 'main' | 'sub' | 'both';

export interface ListFilterRule {
    /** Default 'main' — the row's own datapoint. */
    source?: ListFilterSource;
    /**
     * 'sub' / 'both': restrict to ONE extra datapoint, matched against its label, its
     * full id or its last id segment (case-insensitive, `{{parent}}.BATTERY` → BATTERY).
     * Empty = every extra datapoint of the row is a candidate.
     */
    subKey?: string;
    operator: ListFilterOperator;
    /** Comparison value. Ignored by active/inactive/true/false/empty/notEmpty. */
    value?: string;
    /** Several candidates (all extra datapoints): require ALL to match instead of one. */
    every?: boolean;
}

export interface ListFilterPreset {
    /** Stable key stored in valueFilter / backendValueFilter. */
    id: string;
    label: string;
    /** Iconify id / lucide name shown in the filter menu. */
    icon?: string;
    /** How several rules combine. Default 'AND'. */
    logic?: 'AND' | 'OR';
    rules: ListFilterRule[];
}

/** One extra datapoint of a row, with its live value. */
export interface ListFilterCandidate {
    id: string;
    label?: string;
    value: unknown;
}

/** Everything a filter may look at for one list row. */
export interface ListFilterRow {
    id: string;
    /** Rendered row name — what the free-text search matches on. */
    label?: string;
    /** Value of the row's main datapoint. */
    value: unknown;
    /** Extra datapoints of the second line (resolved, i.e. no template tokens left). */
    subs?: ListFilterCandidate[];
}

/** Options block both list widgets share for the filter feature. */
export interface ListFilterOptions {
    filterPresets?: ListFilterPreset[];
    /** Drop the built-in "Nur aktive" / "Nur inaktive" from the menu (presets only). */
    hideBuiltinFilters?: boolean;
    /** Hide the free-text field in the filter menu. */
    hideFilterSearch?: boolean;
    /** Placeholder of the free-text field. Default 'Suchen …'. */
    filterSearchPlaceholder?: string;
    /** Menu label of the built-in "active" mode. */
    filterActiveLabel?: string;
    /** Menu label of the built-in "inactive" mode. */
    filterInactiveLabel?: string;
}

export const BUILTIN_FILTER_MODES = ['all', 'active', 'inactive'] as const;

export const DEFAULT_ACTIVE_LABEL = 'Nur aktive';
export const DEFAULT_INACTIVE_LABEL = 'Nur inaktive';
export const ALL_LABEL = 'Alle';

/** Operator table for the editor: label plus whether a comparison value is needed. */
export const LIST_FILTER_OPERATORS: { value: ListFilterOperator; label: string; needsValue?: boolean }[] = [
    { value: 'active', label: 'ist aktiv (an / > 0)' },
    { value: 'inactive', label: 'ist inaktiv (aus / 0)' },
    { value: '==', label: 'ist gleich', needsValue: true },
    { value: '!=', label: 'ist nicht gleich', needsValue: true },
    { value: '>', label: 'ist größer als', needsValue: true },
    { value: '>=', label: 'ist größer/gleich', needsValue: true },
    { value: '<', label: 'ist kleiner als', needsValue: true },
    { value: '<=', label: 'ist kleiner/gleich', needsValue: true },
    { value: 'contains', label: 'enthält Text', needsValue: true },
    { value: 'true', label: 'ist true / 1' },
    { value: 'false', label: 'ist false / 0' },
    { value: 'empty', label: 'hat keinen Wert' },
    { value: 'notEmpty', label: 'hat einen Wert' },
];

export function operatorNeedsValue(op: ListFilterOperator): boolean {
    return LIST_FILTER_OPERATORS.find((o) => o.value === op)?.needsValue === true;
}

export const SOURCE_LABELS: Record<ListFilterSource, string> = {
    main: 'Haupt-Datenpunkt',
    sub: 'Weitere Datenpunkte',
    both: 'Beide',
};

/** Value as the search / the comparison sees it. */
function valueText(val: unknown): string {
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

function hasValue(val: unknown): boolean {
    return val !== null && val !== undefined && val !== '';
}

/**
 * Does this extra datapoint answer to `subKey`?
 *
 * Matched in order label → full id → last id segment, then a contains fallback, so
 * the same key works for a hand-picked datapoint of the static list and for a
 * `{{parent}}.BATTERY` template row of the dynamic one (which resolves per row).
 */
export function subMatchesKey(sub: ListFilterCandidate, subKey?: string): boolean {
    const key = (subKey ?? '').trim().toLowerCase();
    if (!key) return true;
    const label = (sub.label ?? '').toLowerCase();
    const id = (sub.id ?? '').toLowerCase();
    const last = id.split('.').pop() ?? '';
    if (label === key || id === key || last === key) return true;
    return id.endsWith(`.${key}`) || label.includes(key);
}

/** Candidate values a rule compares against, in row order. */
function ruleCandidates(rule: ListFilterRule, row: ListFilterRow): unknown[] {
    const source = rule.source ?? 'main';
    const out: unknown[] = [];
    if (source === 'main' || source === 'both') out.push(row.value);
    if (source === 'sub' || source === 'both') {
        for (const sub of row.subs ?? []) if (subMatchesKey(sub, rule.subKey)) out.push(sub.value);
    }
    return out;
}

const EMPTY_DP_MAP = new Map<string, unknown>();

/** One rule against one row. */
export function ruleMatches(rule: ListFilterRule, row: ListFilterRow): boolean {
    if (!rule?.operator) return true;
    const candidates = ruleCandidates(rule, row);
    if (rule.operator === 'empty' || rule.operator === 'notEmpty') {
        // These two are ABOUT missing values, so an absent candidate is a result, not
        // a reason to skip: a row whose extra datapoint the device does not have is
        // exactly what "hat keinen Wert" is meant to find.
        if (!candidates.length) return rule.operator === 'empty';
        const test = (v: unknown) => (rule.operator === 'empty' ? !hasValue(v) : hasValue(v));
        return rule.every ? candidates.every(test) : candidates.some(test);
    }
    // Every other operator needs a value to compare. A null candidate is dropped
    // rather than compared: `!=` against a missing value would otherwise report
    // "true" for every dead datapoint and quietly fill the list with them.
    const usable = candidates.filter(hasValue);
    if (!usable.length) return false;
    const clause: ConditionClause = {
        datapoint: '',
        operator: rule.operator as ConditionOperator,
        value: rule.value ?? '',
        valueType: 'static',
    };
    const test = (v: unknown) => evaluateClause(clause, v, EMPTY_DP_MAP);
    return rule.every ? usable.every(test) : usable.some(test);
}

/** All rules of a preset against one row. An empty preset matches everything. */
export function presetMatches(preset: ListFilterPreset | undefined, row: ListFilterRow): boolean {
    const rules = (preset?.rules ?? []).filter((r) => !!r?.operator);
    if (!rules.length) return true;
    const results = rules.map((r) => ruleMatches(r, row));
    return (preset?.logic ?? 'AND') === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * The single entry point both widgets use: is this row visible under `mode`?
 *
 * `mode` is 'all' | 'active' | 'inactive' (built-ins) or a preset id. An unknown id
 * (preset deleted while a viewer still had it selected) falls back to showing the
 * row — better a stale filter than an empty widget.
 */
export function matchesFilterMode(
    mode: string | undefined,
    presets: ListFilterPreset[] | undefined,
    row: ListFilterRow,
): boolean {
    if (!mode || mode === 'all') return true;
    if (mode === 'active' || mode === 'inactive') {
        if (row.value === null || row.value === undefined) return false;
        const active = isActiveVal(row.value as never);
        return mode === 'active' ? active : !active;
    }
    const preset = presets?.find((p) => p.id === mode);
    if (!preset) return true;
    return presetMatches(preset, row);
}

/** Free-text search over the row name, its id and every value on the row. */
export function matchesSearch(row: ListFilterRow, term: string | undefined): boolean {
    const q = (term ?? '').trim().toLowerCase();
    if (!q) return true;
    const haystack = [row.label, row.id, valueText(row.value)];
    for (const sub of row.subs ?? []) haystack.push(sub.label, sub.id, valueText(sub.value));
    return haystack.some((h) => !!h && h.toLowerCase().includes(q));
}

// ── Filter menu ───────────────────────────────────────────────────────────────

export interface ListFilterChoice {
    key: string;
    label: string;
    icon?: string;
}

/** Entries of the header filter menu: the built-ins (unless hidden) plus the presets. */
export function buildFilterChoices(o: ListFilterOptions): ListFilterChoice[] {
    const choices: ListFilterChoice[] = [{ key: 'all', label: ALL_LABEL }];
    if (!o.hideBuiltinFilters) {
        choices.push({ key: 'active', label: o.filterActiveLabel || DEFAULT_ACTIVE_LABEL });
        choices.push({ key: 'inactive', label: o.filterInactiveLabel || DEFAULT_INACTIVE_LABEL });
    }
    for (const p of o.filterPresets ?? []) {
        if (p?.id) choices.push({ key: p.id, label: p.label || p.id, icon: p.icon });
    }
    return choices;
}

/** Menu label of the active mode — '' when it is 'all' or no longer exists. */
export function filterModeLabel(mode: string | undefined, choices: ListFilterChoice[]): string {
    if (!mode || mode === 'all') return '';
    return choices.find((c) => c.key === mode)?.label ?? '';
}

/** Message for a list that HAS entries but none of them pass the current filter. */
export function filterEmptyText(mode: string | undefined, search: string | undefined, label: string): string {
    const q = (search ?? '').trim();
    if (q) return `Keine Treffer für „${q}“.`;
    if (mode === 'active') return 'Alle Datenpunkte inaktiv.';
    if (mode === 'inactive') return 'Alle Datenpunkte aktiv.';
    return label ? `Kein Eintrag passt zu „${label}“.` : 'Kein Eintrag passt zum Filter.';
}

/**
 * Keeps a stored mode usable: a preset that was deleted (or a built-in that the
 * admin has since hidden) falls back to 'all' instead of filtering everything away.
 */
export function normalizeFilterMode(mode: string | undefined, choices: ListFilterChoice[]): string {
    if (!mode) return 'all';
    return choices.some((c) => c.key === mode) ? mode : 'all';
}

// ── Editor support ────────────────────────────────────────────────────────────

/**
 * Distinct values the configured datapoints currently hold, for the value dropdown
 * of the rule editor ("Auswahlset" instead of typing a literal). Sorted numerically
 * where possible and capped, since a list of 300 temperatures is not a choice.
 */
export function collectFilterValueOptions(
    rows: ListFilterRow[],
    source: ListFilterSource,
    subKey?: string,
    limit = 40,
): string[] {
    const seen = new Set<string>();
    for (const row of rows) {
        for (const val of ruleCandidates({ source, subKey, operator: '==' }, row)) {
            const text = valueText(val);
            if (text !== '') seen.add(text);
        }
    }
    return [...seen]
        .sort((a, b) => {
            const na = Number(a);
            const nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        })
        .slice(0, limit);
}

/** Keys offered for `subKey`: the labels / last segments of the known extra datapoints. */
export function collectSubKeyOptions(rows: ListFilterRow[]): { key: string; hint: string }[] {
    const map = new Map<string, string>();
    for (const row of rows) {
        for (const sub of row.subs ?? []) {
            const key = sub.label || sub.id.split('.').pop() || sub.id;
            if (!key || map.has(key)) continue;
            map.set(key, sub.id);
        }
    }
    return [...map].map(([key, hint]) => ({ key, hint }));
}

/** How many of `rows` a preset currently matches — the editor's live preview. */
export function countPresetMatches(preset: ListFilterPreset, rows: ListFilterRow[]): number {
    return rows.reduce((n, row) => (presetMatches(preset, row) ? n + 1 : n), 0);
}

let seq = 0;
/** Collision-free preset id. Prefixed so it can never clash with a built-in mode. */
export function newPresetId(): string {
    seq += 1;
    return `f${Date.now().toString(36)}${seq.toString(36)}`;
}
