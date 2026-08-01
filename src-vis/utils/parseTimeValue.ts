import type { TranslationKey } from '../i18n';

/**
 * Parses an ioBroker state value into a `Date`.
 *
 * Accepted shapes (in that order):
 *  - `Date` instances (JSON-path results can already be dates)
 *  - `HH:mm` / `HH:mm:ss` → that time on the current day
 *  - numbers / numeric strings → epoch; below 1e11 treated as seconds, else as
 *    milliseconds (1e11 s ≈ year 5138, 1e11 ms ≈ 1973 — no realistic overlap)
 *  - anything else `Date`-parsable, e.g. `2026-07-31T20:15:30+02:00` or
 *    `2026-07-31 20:15:30` (space instead of `T`, common in adapter states)
 *
 * Returns `null` for empty, boolean or unparsable values so callers can render a
 * placeholder instead of "Invalid Date".
 */
export function parseTimeValue(val: unknown, ref: Date = new Date()): Date | null {
    if (val === null || val === undefined || typeof val === 'boolean') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

    let num: number | null = null;
    if (typeof val === 'number') {
        num = val;
    } else if (typeof val === 'string') {
        const s = val.trim();
        if (!s) return null;

        // Time-only value → today at that time.
        const hm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
        if (hm) {
            const h = Number(hm[1]);
            const m = Number(hm[2]);
            const sec = hm[3] ? Number(hm[3]) : 0;
            if (h > 23 || m > 59 || sec > 59) return null;
            return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), h, m, sec);
        }

        // Date-only values are UTC midnight per spec — that shifts the day in
        // timezones behind UTC, so build them in local time instead.
        const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (ymd) {
            const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
            return isNaN(d.getTime()) ? null : d;
        }

        if (/^-?\d+(\.\d+)?$/.test(s)) {
            num = Number(s);
        } else {
            const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') : s);
            return isNaN(d.getTime()) ? null : d;
        }
    } else {
        return null;
    }

    if (num === null || !Number.isFinite(num) || num === 0) return null;
    const d = new Date(Math.abs(num) < 1e11 ? num * 1000 : num);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Human-readable distance between `target` and `now`, e.g. `in 3 h 12 min`,
 * `vor 5 min`, `jetzt`. Days are only added above 24 h, seconds only below a
 * minute — keeps the string short enough for a widget line.
 */
export function formatRelative(
    target: Date,
    now: Date,
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
    const tr = t;
    const diffSec = Math.round((target.getTime() - now.getTime()) / 1000);
    const abs = Math.abs(diffSec);
    if (abs < 10) return tr('clock.rel.now');

    const parts: string[] = [];
    if (abs < 60) {
        parts.push(`${abs} ${tr('clock.rel.sec')}`);
    } else {
        const days = Math.floor(abs / 86400);
        const hours = Math.floor((abs % 86400) / 3600);
        const mins = Math.floor((abs % 3600) / 60);
        if (days > 0) parts.push(`${days} ${tr('clock.rel.day')}`);
        if (hours > 0) parts.push(`${hours} ${tr('clock.rel.hour')}`);
        if (mins > 0 && days === 0) parts.push(`${mins} ${tr('clock.rel.min')}`);
    }
    const span = parts.join(' ');
    return diffSec >= 0 ? tr('clock.rel.in', { span }) : tr('clock.rel.ago', { span });
}
