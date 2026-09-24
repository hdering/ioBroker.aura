/**
 * Cell text of the JSON table.
 *
 * A JSON datapoint often carries a value the table should not print verbatim — a
 * millisecond timestamp that belongs on screen as "10.07.2024" (issue #697), Wh that
 * read better as kWh, a measurement with six digits behind the comma. The table has no
 * datapoint per column to hang a conversion on, so each column carries the same option
 * keys the lists use and this module applies them in the same order the list widgets do:
 * factor/offset first, then the time format, then the decimal places.
 *
 * The data itself is never modified — this only changes what is displayed.
 */

import { formatNum, type NumberFormat } from './formatValue';
import { applyValueTransform, tidyDisplayNumber } from './valueTransform';
import { formatTimeDisplay, hasTimeDisplay, TIME_DASH } from './timeDisplay';

type TFn = Parameters<typeof formatTimeDisplay>[2];

/** The display options a single table column may carry. */
export interface JsonCellFormat {
    /** Display-only conversion: preset id from VALUE_TRANSFORM_PRESETS, or 'custom'. */
    valueTransform?: string;
    valueFactor?: number;
    valueOffset?: number;
    /** Render the value as time/date (see TIME_DISPLAY_PRESETS). */
    valueTimeFormat?: string;
    valueTimePattern?: string;
    /** Decimal places for numeric cells. Unset = print the number as it comes. */
    decimals?: number;
    /** Thousands separator of numeric cells. Unset = the global setting, which only applies
     *  once decimals are set; picked explicitly it groups the number with its own decimals. */
    numberFormat?: NumberFormat;
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** Thousands grouping without touching the decimals the number already has. */
function groupAsIs(n: number, fmt: NumberFormat): string {
    const text = String(n);
    if (/e/i.test(text)) return text; // 1e21 and friends: no digits to group
    const dot = text.indexOf('.');
    return formatNum(n, dot < 0 ? 0 : text.length - dot - 1, fmt);
}

/** Raw JSON value as plain text — the fallback whenever no format applies. */
export function cellText(v: unknown): string {
    if (v === null || v === undefined) return TIME_DASH;
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
}

/** False while a column prints its values verbatim — lets callers keep the untouched path. */
export function hasCellFormat(col: JsonCellFormat): boolean {
    return (
        col.valueFactor !== undefined ||
        col.valueOffset !== undefined ||
        hasTimeDisplay(col.valueTimeFormat) ||
        typeof col.decimals === 'number' ||
        col.numberFormat !== undefined
    );
}

/** The text one cell shows. Empty cells stay bare, so the "–" placeholder is never formatted. */
export function formatCellValue(col: JsonCellFormat, raw: unknown, t: TFn, numFmt?: NumberFormat): string {
    if (raw === null || raw === undefined || raw === '') return cellText(raw);
    const value = applyValueTransform(raw, col.valueFactor, col.valueOffset);
    if (hasTimeDisplay(col.valueTimeFormat)) {
        return formatTimeDisplay(value, col.valueTimeFormat, t, col.valueTimePattern) ?? TIME_DASH;
    }
    const fmt = col.numberFormat ?? numFmt;
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (typeof col.decimals === 'number' && col.decimals >= 0) return formatNum(value, col.decimals, fmt);
        // A conversion without a decimal setting would otherwise print its float noise
        // (1234 × 0.001 = 1.2340000000000002); the value itself is kept.
        const tidy = value !== raw ? tidyDisplayNumber(value) : value;
        if (col.numberFormat !== undefined) return groupAsIs(tidy, col.numberFormat);
        if (value !== raw) return String(tidy);
    }
    // JSON often carries numbers as strings ("1234.5") - the separator is meant for them too.
    if (col.numberFormat !== undefined && typeof value === 'string' && NUMERIC_TEXT.test(value.trim())) {
        return groupAsIs(Number(value.trim()), col.numberFormat);
    }
    return cellText(value);
}
