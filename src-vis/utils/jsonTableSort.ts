/**
 * Sort rules of the JSON table — the static list's rule chain (utils/listSort) with a
 * column in place of the row's datapoint (issue #706).
 *
 * A preset "one column, one direction" could not say what a log table needs: newest
 * date first, and among equal dates the largest value; a date column written as
 * `24.09.2026` that compares as text; empty cells that belong at the end in both
 * directions. The list already solved all of that, so a JSON rule is a list rule that
 * reads a cell: the comparison itself is compareByRule() of the list, fed with the cell
 * as the row's value. Only the stamp modes of the list have no meaning here (a cell
 * has no lc/ts) — in their place 'time' reads the cell as a date.
 */
import { compareByRule, type ListSortRule } from './listSort';
import { parseTimeValue } from './parseTimeValue';

export type JsonSortMode = 'auto' | 'number' | 'text' | 'active' | 'time';

export interface JsonSortRule {
    /** Key of the column the rule reads (the JSON key, not the display name). */
    column: string;
    /** Default 'asc'. With mode 'time': oldest first. */
    order?: 'asc' | 'desc';
    /**
     * Default 'auto': numbers numerically, booleans false→true, text alphabetically
     * with the numbers in it. 'number' / 'text' force one of the two, 'active' puts
     * on / > 0 first, 'time' reads the cell as a date (timestamp, ISO, dd.MM.yyyy).
     */
    mode?: JsonSortMode;
    /** Where rows without a value land, regardless of direction. Default 'last'. */
    empty?: 'first' | 'last';
}

export const JSON_SORT_MODES: { value: JsonSortMode; label: string; hint: string }[] = [
    { value: 'auto', label: 'Automatisch', hint: 'Zahlen numerisch, Text alphabetisch (mit Zahlen darin)' },
    { value: 'number', label: 'Als Zahl', hint: 'Text wird in eine Zahl gewandelt; was keine ist, gilt als ohne Wert' },
    { value: 'text', label: 'Als Text', hint: 'Rein alphabetisch — „10“ steht damit vor „9“' },
    { value: 'active', label: 'Aktiv / Inaktiv', hint: 'An / > 0 zuerst, Rest danach' },
    {
        value: 'time',
        label: 'Als Datum / Zeit',
        hint: 'Zeitstempel, ISO-Angaben und dd.MM.yyyy (HH:mm) werden als Zeitpunkt verglichen',
    },
];

/** Direction labels — they only read right once the mode is known. */
export function jsonOrderLabels(mode: JsonSortMode | undefined): { asc: string; desc: string } {
    if (mode === 'time') return { asc: 'Älteste zuerst', desc: 'Neueste zuerst' };
    if (mode === 'active') return { asc: 'Aktive zuerst', desc: 'Inaktive zuerst' };
    if (mode === 'text') return { asc: 'A → Z', desc: 'Z → A' };
    return { asc: '↑ Aufsteigend', desc: '↓ Absteigend' };
}

const DE_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** A cell as epoch ms, or null. Adds the German date the ioBroker world writes most. */
export function cellTime(val: unknown): number | null {
    if (typeof val === 'string') {
        const m = DE_DATE.exec(val.trim());
        if (m) {
            const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
            const d = new Date(
                y,
                Number(m[2]) - 1,
                Number(m[1]),
                Number(m[4] ?? 0),
                Number(m[5] ?? 0),
                Number(m[6] ?? 0),
            );
            return isNaN(d.getTime()) ? null : d.getTime();
        }
    }
    return parseTimeValue(val)?.getTime() ?? null;
}

/** Only rules whose column still exists — a renamed key must not scramble the table. */
export function usableJsonSortRules(rules: JsonSortRule[] | undefined, keys: string[]): JsonSortRule[] {
    return (rules ?? []).filter((r) => !!r?.column && keys.includes(r.column));
}

function asListRule(rule: JsonSortRule): ListSortRule {
    return {
        source: 'value',
        order: rule.order,
        // A time is compared as its number; the list's own modes pass through.
        mode: rule.mode === 'time' ? 'number' : rule.mode,
        empty: rule.empty,
    };
}

function cellOf(rule: JsonSortRule, row: Record<string, unknown>): unknown {
    const v = row[rule.column];
    return rule.mode === 'time' ? cellTime(v) : v;
}

/** The whole chain against two rows: the first rule that separates them wins. */
export function compareJsonRows(rules: JsonSortRule[], a: Record<string, unknown>, b: Record<string, unknown>): number {
    for (const rule of rules) {
        const lr = asListRule(rule);
        const cmp = compareByRule(lr, { id: '', value: cellOf(rule, a) }, { id: '', value: cellOf(rule, b) });
        if (cmp !== 0) return cmp;
    }
    return 0;
}

/** Rows in the order the chain puts them; the input is left alone. */
export function sortJsonRows<T extends Record<string, unknown>>(rows: T[], rules: JsonSortRule[]): T[] {
    if (!rules.length) return rows;
    return [...rows].sort((a, b) => compareJsonRows(rules, a, b));
}

/** How one rule reads in a sentence — the summary under the button. */
export function jsonSortRuleLabel(rule: JsonSortRule, labelOf: (key: string) => string = (k) => k): string {
    const labels = jsonOrderLabels(rule.mode);
    return `${labelOf(rule.column)} ${(rule.order ?? 'asc') === 'desc' ? labels.desc : labels.asc}`;
}

/** The whole chain in one line, e.g. `Datum Neueste zuerst · dann Wert ↓ Absteigend`. */
export function jsonSortSummary(rules: JsonSortRule[], labelOf?: (key: string) => string): string {
    return rules.map((r) => jsonSortRuleLabel(r, labelOf)).join(' · dann ');
}
