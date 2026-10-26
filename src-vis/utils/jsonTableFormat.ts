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

/** One "Zuordnung" entry of a column (#852) — the Auswahlfeld's EnumEntry, reduced to what matching reads. */
interface CellMapEntry {
    value: string;
}

/**
 * The entry a column's value mapping holds for this cell, if any. The entries store
 * their value as text, while JSON carries numbers and booleans — so 1, "1" and "1.0"
 * all meet the entry "1", and true meets "true" in any case.
 */
export function findCellEntry<E extends CellMapEntry>(entries: E[] | undefined, raw: unknown): E | undefined {
    if (!entries?.length || raw === null || raw === undefined || raw === '') return undefined;
    const text = String(raw).trim();
    const lower = text.toLowerCase();
    const num = typeof raw === 'number' ? raw : NUMERIC_TEXT.test(text) ? Number(text) : NaN;
    return entries.find((e) => {
        const v = String(e.value ?? '').trim();
        if (v === text) return true;
        if (typeof raw === 'boolean') return v.toLowerCase() === lower;
        return Number.isFinite(num) && NUMERIC_TEXT.test(v) && Number(v) === num;
    });
}

/** Display options of a column that the row tokens honour — the cell format plus decoration and mapping. */
interface RowTokenColumn extends JsonCellFormat {
    key: string;
    prefix?: string;
    suffix?: string;
    mapValues?: boolean;
    valueMap?: { value: string; label?: string }[];
    image?: boolean;
    html?: boolean;
}

/** A JSON key as popup token name: `{{…}}` only matches word characters. */
export function rowTokenName(key: string): string {
    return key.replace(/\W/g, '_');
}

/**
 * The popup tokens of one clicked table row (#858): `{{row_<key>}}` holds the raw
 * value (objects as JSON), `{{rowtext_<key>}}` the text the table would print —
 * formatted, mapped and decorated by the column's settings, also for hidden columns.
 */
export function jsonRowVars(
    row: Record<string, unknown>,
    columns: RowTokenColumn[],
    t: TFn,
    numFmt?: NumberFormat,
): Record<string, string> {
    const defs = new Map(columns.map((c) => [c.key, c]));
    const vars: Record<string, string> = {};
    for (const [key, raw] of Object.entries(row)) {
        const name = rowTokenName(key);
        vars[`row_${name}`] =
            raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        const col = defs.get(key);
        const plain = !col || col.image || col.html;
        let text = plain ? cellText(raw) : formatCellValue(col, raw, t, numFmt);
        const entry = !plain && col.mapValues ? findCellEntry(col.valueMap, raw) : undefined;
        if (entry?.label) text = entry.label;
        else if (!plain && raw !== null && raw !== undefined && raw !== '' && (col.prefix || col.suffix))
            text = `${col.prefix ?? ''}${text}${col.suffix ?? ''}`;
        vars[`rowtext_${name}`] = raw === null || raw === undefined ? '' : text;
    }
    return vars;
}
