/**
 * Own status symbols shown as a value (StatusItem.display 'value', #875).
 *
 * Instead of an active/inactive glyph the entry prints its datapoint — '21,5 °C',
 * 'Eco', '{dp;round(0)} W' — in the same status row, so it sits in whatever corner
 * `statusPosition` names. Highlighting is optional: `activeValues` then also takes
 * comparisons ('>30', '<=5', '!=0'), since a number is rarely one exact value.
 *
 * Kept free of React so tools/tests/status-item-value.mjs can run it in node.
 */
import { badgeLabelRefs, renderBadgeLabel, type BadgeLabelState } from './badgeLabel';
import type { OpsContext } from './exprOps';
import type { StatusItem } from '../types';

export function isValueItem(item: StatusItem): boolean {
    return item.display === 'value';
}

/** The template a value entry renders: own text, else the datapoint plus unit. */
export function statusItemValueTemplate(item: StatusItem): string {
    const own = item.text?.trim();
    if (own) return own;
    return item.unit ? `{dp} ${item.unit}` : '{dp}';
}

/** Every datapoint ref a value entry reads — its own datapoint and the text's bindings. */
export function statusItemValueRefs(item: StatusItem): string[] {
    return badgeLabelRefs([statusItemValueTemplate(item)], item.dp);
}

export interface StatusValueFormat {
    formatNum: (n: number, decimals: number) => string;
    /** Global default decimals — a maximum, like for markers: '12 min', not '12.00 min'. */
    defaultDecimals: number;
    ops: OpsContext;
}

/** The text of a value entry; `{dp}` is the entry's own datapoint, with its decimals. */
export function statusItemValueText(
    item: StatusItem,
    states: Record<string, BadgeLabelState | undefined>,
    fmt: StatusValueFormat,
): string {
    const decimals = typeof item.decimals === 'number' ? Math.max(0, item.decimals) : undefined;
    const format = (v: unknown): string => {
        if (v === null || v === undefined) return '–';
        if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
        if (decimals !== undefined) return fmt.formatNum(v, decimals);
        const rounded = Number(v.toFixed(Math.max(0, fmt.defaultDecimals)));
        return fmt.formatNum(rounded, (String(rounded).split('.')[1] ?? '').length);
    };
    return renderBadgeLabel(statusItemValueTemplate(item), {
        states,
        ownDp: item.dp,
        fmt: format,
        ops: fmt.ops,
    });
}

// A decimal point only: the comma already separates the rule's entries.
const COMPARE = /^(>=|<=|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Whether a value matches a highlight rule: comma-separated exact values (case-
 * insensitive) or comparisons with a number. An empty rule matches nothing — a
 * value entry without a rule is never "active".
 */
export function matchesValueRule(value: unknown, rule: string | undefined): boolean {
    if (!rule?.trim()) return false;
    const str = String(value ?? '')
        .toLowerCase()
        .trim();
    const num = typeof value === 'number' ? value : str === '' ? NaN : Number(str.replace(',', '.'));
    return rule
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .some((token) => {
            const m = COMPARE.exec(token);
            if (!m) return token === str;
            if (!Number.isFinite(num)) return false;
            const ref = Number(m[2]);
            switch (m[1]) {
                case '>':
                    return num > ref;
                case '>=':
                    return num >= ref;
                case '<':
                    return num < ref;
                case '<=':
                    return num <= ref;
                default:
                    return num !== ref;
            }
        });
}
