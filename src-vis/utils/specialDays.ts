/**
 * Special-day lists of the timer (holidaysDp / vacationDp), as edited from the
 * frontend (#785). Reads the same formats as lib/specialDays.js on the adapter:
 *
 *   - JSON array of "YYYY-MM-DD", "YYYY-MM-DD/YYYY-MM-DD" and { from, to }
 *   - a single such entry, not wrapped in an array
 *   - boolean (or "true"/"false"): a flag for "today", set by an adapter or script
 *
 * Only a list (or an empty value) can be edited — a flag belongs to whoever sets it,
 * and overwriting it with an array would break that source. Every entry keeps its
 * original form (`raw`), so writing the list back leaves entries a script wrote
 * untouched; new entries are added as "YYYY-MM-DD" or "YYYY-MM-DD/YYYY-MM-DD".
 */

export interface SpecialDayEntry {
    /** First day, zero-padded YYYY-MM-DD. */
    from: string;
    /** Last day (inclusive); equals `from` for a single day. */
    to: string;
    /** The entry exactly as found in the datapoint — written back unchanged. */
    raw: unknown;
}

export type SpecialDaysValue =
    | { kind: 'list'; entries: SpecialDayEntry[]; skipped: unknown[] }
    | { kind: 'flag'; today: boolean }
    | { kind: 'invalid' };

export function normDay(s: unknown): string | null {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s ?? '').trim());
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function toEntry(raw: unknown): SpecialDayEntry | null {
    let from: string | null;
    let to: string | null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const r = raw as { from?: unknown; to?: unknown };
        from = normDay(r.from);
        to = normDay(r.to ?? r.from);
    } else if (typeof raw === 'string' && raw.includes('/')) {
        const [a, b] = raw.split('/');
        from = normDay(a);
        to = normDay(b);
    } else if (typeof raw === 'string') {
        from = to = normDay(raw);
    } else {
        return null;
    }
    if (!from || !to) return null;
    return from <= to ? { from, to, raw } : { from: to, to: from, raw };
}

export function parseSpecialDaysValue(val: unknown): SpecialDaysValue {
    if (val == null) return { kind: 'list', entries: [], skipped: [] };
    if (typeof val === 'boolean') return { kind: 'flag', today: val };
    let data: unknown = val;
    if (typeof data === 'string') {
        const s = data.trim();
        if (s === '') return { kind: 'list', entries: [], skipped: [] };
        if (s.toLowerCase() === 'true') return { kind: 'flag', today: true };
        if (s.toLowerCase() === 'false') return { kind: 'flag', today: false };
        try {
            data = JSON.parse(s);
        } catch {
            data = s; // bare "YYYY-MM-DD" or "A/B" without quotes
        }
        if (typeof data === 'boolean') return { kind: 'flag', today: data };
    }
    if (typeof data === 'number') return { kind: 'invalid' };
    const items = Array.isArray(data) ? data : [data];
    const entries: SpecialDayEntry[] = [];
    const skipped: unknown[] = [];
    for (const raw of items) {
        const e = toEntry(raw);
        if (e) entries.push(e);
        else skipped.push(raw);
    }
    // A lone value that is no day at all is not a list someone keeps by hand.
    if (!Array.isArray(data) && entries.length === 0) return { kind: 'invalid' };
    return { kind: 'list', entries, skipped };
}

/** Today as a zero-padded local YYYY-MM-DD key. */
export function todayKey(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** New list entry for a day or an inclusive range. */
export function makeEntry(from: string, to?: string): SpecialDayEntry | null {
    const a = normDay(from);
    const b = normDay(to || from);
    if (!a || !b) return null;
    const [f, t] = a <= b ? [a, b] : [b, a];
    return { from: f, to: t, raw: f === t ? f : `${f}/${t}` };
}

/** Chronological order; ties by the end day. */
export function sortEntries(entries: SpecialDayEntry[]): SpecialDayEntry[] {
    return [...entries].sort((x, y) => (x.from === y.from ? x.to.localeCompare(y.to) : x.from.localeCompare(y.from)));
}

/** True when an equal day / range is already in the list. */
export function hasEntry(entries: SpecialDayEntry[], e: SpecialDayEntry): boolean {
    return entries.some((x) => x.from === e.from && x.to === e.to);
}

/**
 * The datapoint value for a list. Always a JSON string — ioBroker states hold
 * primitives, and the adapter parses the string. Entries neither side can read
 * (`skipped`) stay at the end, so a typo in a hand-written list is not lost.
 */
export function serializeEntries(entries: SpecialDayEntry[], skipped: unknown[] = []): string {
    return JSON.stringify([...sortEntries(entries).map((e) => e.raw), ...skipped]);
}
