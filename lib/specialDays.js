'use strict';

/**
 * Special-day lists for the timer filters (holidaysDp / vacationDp).
 *
 * Accepted DP values:
 *   - JSON array whose entries are
 *       "YYYY-MM-DD"                    single day
 *       "YYYY-MM-DD/YYYY-MM-DD"         range, both ends inclusive (ISO 8601 interval)
 *       { "from": "…", "to": "…" }     range, both ends inclusive
 *   - a single entry of the above (not wrapped in an array)
 *   - boolean (or "true"/"false"): true = today is a special day
 *
 * Returns an object with has(dayKey) so callers can treat it like a Set of day keys.
 * Malformed entries are skipped; a reversed range is swapped.
 */

const EMPTY = { has: () => false };
const ALWAYS = { has: () => true };

function normDay(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
    if (!m) {
        return null;
    }
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function toRange(entry) {
    let from;
    let to;
    if (entry && typeof entry === 'object') {
        from = normDay(entry.from ?? '');
        to = normDay(entry.to ?? entry.from ?? '');
    } else if (typeof entry === 'string' && entry.includes('/')) {
        const [a, b] = entry.split('/');
        from = normDay(a);
        to = normDay(b);
    } else {
        from = to = normDay(entry ?? '');
    }
    if (!from || !to) {
        return null;
    }
    return from <= to ? [from, to] : [to, from];
}

/**
 * Turn a special-day DP value into a day-key matcher (see file header for the formats).
 *
 * @param {unknown} val raw state value
 * @returns {{ has: (dayKey: string) => boolean }} matcher for zero-padded YYYY-MM-DD keys
 */
function parseSpecialDays(val) {
    if (val == null) {
        return EMPTY;
    }
    if (typeof val === 'boolean') {
        return val ? ALWAYS : EMPTY;
    }
    let data = val;
    if (typeof data === 'string') {
        const s = data.trim();
        if (s === '') {
            return EMPTY;
        }
        if (s.toLowerCase() === 'true') {
            return ALWAYS;
        }
        if (s.toLowerCase() === 'false') {
            return EMPTY;
        }
        try {
            data = JSON.parse(s);
        } catch {
            data = s; // bare "YYYY-MM-DD" or "A/B" without quotes
        }
        if (typeof data === 'boolean') {
            return data ? ALWAYS : EMPTY;
        }
    }
    const entries = Array.isArray(data) ? data : [data];
    const days = new Set();
    const ranges = [];
    for (const entry of entries) {
        const r = toRange(entry);
        if (!r) {
            continue;
        }
        if (r[0] === r[1]) {
            days.add(r[0]);
        } else {
            ranges.push(r);
        }
    }
    // Day keys are zero-padded YYYY-MM-DD, so string comparison is chronological.
    return { has: (key) => days.has(key) || ranges.some(([a, b]) => key >= a && key <= b) };
}

module.exports = { parseSpecialDays };
