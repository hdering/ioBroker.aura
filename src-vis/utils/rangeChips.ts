/**
 * User-defined time-range chips for the chart widgets (issue #709).
 *
 * A chip is stored as a short token — `"6h"`, `"3M"`, `"1y"`, `"total"`, optionally with its own
 * caption after `=` (`"3M=Quartal"`). The same notation works in the editor, in the MCP schema and
 * later in a datapoint, which is why the option is a plain string list rather than objects.
 *
 * Tokens that spell one of the built-in presets resolve to that preset, so a chip list that merely
 * reorders the defaults fetches and buckets exactly like before. Everything else becomes a
 * `custom` range with value + unit.
 */
import type { EChartTimeRange } from '../hooks/useMultiSeriesData';

/** Units of a custom range: hours, days, weeks, calendar months, calendar years. */
export type RangeUnit = 'h' | 'd' | 'w' | 'M' | 'y';

export const RANGE_UNITS: RangeUnit[] = ['h', 'd', 'w', 'M', 'y'];

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Tokens that ARE the built-in presets — kept as presets so their fetch step stays unchanged. */
const PRESET_TOKENS: Exclude<EChartTimeRange, 'custom'>[] = ['1h', '6h', '24h', '7d', '30d', '1y', 'total'];

export interface RangeChip {
    /** Normalised key without caption, e.g. `3M` — what the active chip is matched by. */
    key: string;
    range: EChartTimeRange;
    /** Set for `custom` only. */
    value?: number;
    unit?: RangeUnit;
    label: string;
}

/**
 * Span of `value` × `unit` ending at `now`. Months and years count back on the CALENDAR (Sep 24 →
 * Jun 24), not in fixed 30-day steps — otherwise a three-month window would drift against the
 * monthly bucket grid. A day that does not exist in the target month clamps to its last day.
 */
export function unitSpanMs(value: number, unit: RangeUnit, now: number = Date.now()): number {
    const n = Math.max(1, Math.round(value) || 1);
    if (unit === 'h') return n * HOUR;
    if (unit === 'd') return n * DAY;
    if (unit === 'w') return n * 7 * DAY;
    const d = new Date(now);
    const day = d.getDate();
    d.setDate(1);
    if (unit === 'M') d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, daysInMonth));
    return now - d.getTime();
}

/** Caption of a range; presets keep their established labels. */
export function rangeLabel(value: number, unit: RangeUnit): string {
    const one = value === 1;
    switch (unit) {
        case 'h':
            return `${value} Std`;
        case 'd':
            return `${value} ${one ? 'Tag' : 'Tage'}`;
        case 'w':
            return `${value} ${one ? 'Woche' : 'Wochen'}`;
        case 'M':
            return `${value} ${one ? 'Monat' : 'Monate'}`;
        case 'y':
            return `${value} ${one ? 'Jahr' : 'Jahre'}`;
    }
}

export const PRESET_LABELS: Record<Exclude<EChartTimeRange, 'custom'>, string> = {
    '1h': '1 Std',
    '6h': '6 Std',
    '24h': '24 Std',
    '7d': '7 Tage',
    '30d': '30 Tage',
    '1y': '1 Jahr',
    total: 'Gesamt',
};

/**
 * Key of a range selection — the same for a preset and a custom range of equal length and unit,
 * so a configured "custom 24 h" lights up the `24h` chip.
 */
export function rangeKey(range: EChartTimeRange, value?: number, unit?: RangeUnit): string {
    if (range !== 'custom') return range;
    return `${Math.max(1, Math.round(value ?? 24) || 1)}${unit ?? 'h'}`;
}

/** One token → chip, or null when it is not a valid range. */
export function parseRangeToken(raw: unknown): RangeChip | null {
    if (typeof raw !== 'string') return null;
    const eq = raw.indexOf('=');
    const body = (eq >= 0 ? raw.slice(0, eq) : raw).trim();
    const caption = eq >= 0 ? raw.slice(eq + 1).trim() : '';
    if (/^(total|gesamt|all)$/i.test(body)) {
        return { key: 'total', range: 'total', label: caption || PRESET_LABELS.total };
    }
    // Case matters for the unit: `M` is a month, a lowercase `m` would read as minutes.
    const m = /^(\d{1,3})\s*(h|d|w|M|y)$/.exec(body);
    if (!m) return null;
    const value = Number(m[1]);
    if (value < 1) return null;
    const unit = m[2] as RangeUnit;
    const key = `${value}${unit}`;
    const preset = PRESET_TOKENS.find((p) => p === key);
    if (preset) return { key, range: preset, label: caption || PRESET_LABELS[preset] };
    return { key, range: 'custom', value, unit, label: caption || rangeLabel(value, unit) };
}

/**
 * The configured chip list — an array of tokens or one string separated by commas, semicolons or line breaks. Invalid
 * tokens are dropped, duplicates keep their first position. Empty = the widget's built-in chips.
 */
export function parseRangeChips(raw: unknown): RangeChip[] {
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\n]+/) : [];
    const out: RangeChip[] = [];
    for (const item of list) {
        const chip = parseRangeToken(item);
        if (chip && !out.some((c) => c.key === chip.key)) out.push(chip);
    }
    return out;
}
