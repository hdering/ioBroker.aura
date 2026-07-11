import { formatNum } from './formatValue';

export type ListStat = 'sum' | 'avg' | 'min' | 'max';

export interface ListStatsResult {
    sum: number;
    avg: number;
    min: number;
    max: number;
    count: number;
    unit?: string;
}

/**
 * Aggregate the numeric values of a list's visible entries. Non-numeric / non-finite
 * values are skipped. Returns null when no numeric value is present. A single shared
 * unit is assumed — the first encountered unit wins.
 */
export function computeListStats(
    entries: ReadonlyArray<{ id: string; unit?: string }>,
    states: Record<string, { val?: unknown } | null | undefined>,
): ListStatsResult | null {
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    let unit: string | undefined;
    for (const e of entries) {
        const v = states[e.id]?.val;
        if (typeof v !== 'number' || !isFinite(v)) continue;
        sum += v;
        count++;
        if (v < min) min = v;
        if (v > max) max = v;
        if (unit === undefined && e.unit) unit = e.unit;
    }
    if (count === 0) return null;
    return { sum, avg: sum / count, min, max, count, unit };
}

export const STAT_ORDER: ListStat[] = ['sum', 'avg', 'min', 'max'];
export const STAT_SYMBOL: Record<ListStat, string> = { sum: 'Σ', avg: 'ø', min: '↓', max: '↑' };

export interface StatPart {
    key: ListStat;
    /** Optional icon name (iconify id or lucide PascalCase) rendered before the text/value. */
    icon?: string;
    /** Optional text prefix rendered before the value. */
    text?: string;
    /** Formatted numeric value. */
    value: string;
}

/**
 * Resolve the aggregate parts to render, e.g. Σ 42 · ø 5.2 · ↓ 1 · ↑ 12.
 * Empty / undefined selection falls back to the sum only (backward compat).
 * Per-stat prefix/text comes from `labels`, per-stat icon from `icons`.
 * When neither icon nor text is set, the default symbol (Σ/ø/↓/↑) is used as text
 * (for the sum also the legacy `sumLabel`).
 */
export function getStatParts(
    stats: ListStatsResult,
    selected: ListStat[] | undefined,
    labels: Partial<Record<ListStat, string>> | undefined,
    icons: Partial<Record<ListStat, string>> | undefined,
    sumLabel: string | undefined,
    decimals: number,
): StatPart[] {
    const active = selected && selected.length > 0 ? selected : (['sum'] as ListStat[]);
    return STAT_ORDER.filter((s) => active.includes(s)).map((s) => {
        const icon = icons?.[s] || undefined;
        let text = labels?.[s] ?? (s === 'sum' ? sumLabel : undefined);
        if (!icon && !text) text = STAT_SYMBOL[s];
        return { key: s, icon, text: text || undefined, value: formatNum(stats[s], decimals) };
    });
}
