/**
 * Field detection for lists read from a JSON datapoint — shared by the
 * Auswahlfeld entries (#577, enumEntriesJson) and the alarm widget's modes and
 * zones (#1037), so both accept the same spellings.
 */
import { extractJsonPath } from './dpRef';

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Scalars become text; objects/arrays have no place in a single field. */
export function toText(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    const t = typeof v;
    if (t === 'string') return v as string;
    if (t === 'number' || t === 'boolean') return String(v);
    return undefined;
}

/**
 * Value of one field: a configured field name (also as path `a.b`) wins,
 * otherwise the first candidate the row knows — exact first, then ignoring case.
 */
export function pick(row: Record<string, unknown>, explicit: string | undefined, auto: string[]): unknown {
    const key = (explicit ?? '').trim();
    if (key) return row[key] !== undefined ? row[key] : extractJsonPath(row, key);
    for (const name of auto) {
        if (row[name] !== undefined) return row[name];
    }
    const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
    for (const name of auto) {
        const hit = lower.get(name.toLowerCase());
        if (hit !== undefined) return row[hit];
    }
    return undefined;
}

/** A datapoint value that may be a JSON string: parsed, or `undefined` when unreadable. */
export function parseJsonValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    const s = raw.trim();
    if (!s) return undefined;
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}
