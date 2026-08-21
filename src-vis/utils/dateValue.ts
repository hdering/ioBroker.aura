/**
 * Date value helpers shared by everything that reads or writes a point in time
 * to a datapoint: the Datumswähler widget, the custom-layout datepicker cell and
 * the list widgets' "Datumswähler" display type.
 *
 * Pure functions only — no React — so every consumer can import them without
 * pulling a widget module in.
 */
import { tokenRe } from './datePattern';

export type DateOutputFormat =
    | 'timestamp_ms'
    | 'timestamp_s'
    | 'iso'
    | 'date'
    | 'datetime_local'
    | 'de_date'
    | 'de_datetime'
    | 'time_hhmm'
    | 'time_hhmmss'
    | 'custom';

export const FORMAT_LABELS: Record<DateOutputFormat, string> = {
    timestamp_ms: 'Timestamp (ms)',
    timestamp_s: 'Timestamp (s)',
    iso: 'ISO 8601 (2025-01-15T13:30:00.000Z)',
    date: 'Datum (2025-01-15)',
    datetime_local: 'Datum+Zeit (2025-01-15T13:30)',
    de_date: 'Datum (15.01.2025)',
    de_datetime: 'Datum+Zeit (15.01.2025 13:30)',
    time_hhmm: 'Uhrzeit (13:30)',
    time_hhmmss: 'Uhrzeit (13:30:00)',
    custom: 'Eigenes Format…',
};

/** Placeholder pattern used whenever a custom format is selected but left empty. */
export const DEFAULT_DATE_PATTERN = 'dd.MM.yyyy';
/** Tokens understood by custom patterns — shown as a hint in the option panels. */
export const DATE_PATTERN_TOKENS = 'dd MM yyyy yy HH hh mm ss';

function pad(n: number) {
    return String(n).padStart(2, '0');
}

/** Render a date with a user-supplied token pattern (e.g. `MM.yyyy`). */
export function formatCustom(d: Date, pattern: string): string {
    return pattern.replace(tokenRe(), (tok) => {
        switch (tok) {
            case 'yyyy':
                return String(d.getFullYear());
            case 'yy':
                return String(d.getFullYear()).slice(-2);
            case 'MM':
                return pad(d.getMonth() + 1);
            case 'dd':
                return pad(d.getDate());
            case 'HH':
                return pad(d.getHours());
            case 'hh':
                return pad(d.getHours() % 12 || 12);
            case 'mm':
                return pad(d.getMinutes());
            case 'ss':
                return pad(d.getSeconds());
            default:
                return tok;
        }
    });
}

function escapeRe(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse `str` against a token pattern. Parts the pattern does not mention fall
 * back to `base` (or "now"): `MM.yyyy` moves the stored date to that month and
 * leaves day and time-of-day alone (clamped when the new month is shorter).
 */
export function parseCustom(str: string, pattern: string, base?: Date | null): Date | null {
    const tokens: string[] = [];
    const re = tokenRe();
    let src = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pattern)) !== null) {
        src += escapeRe(pattern.slice(last, m.index));
        last = m.index + m[0].length;
        tokens.push(m[0]);
        src += m[0] === 'yyyy' ? '(\\d{4})' : '(\\d{1,2})';
    }
    if (!tokens.length) return null;
    src += escapeRe(pattern.slice(last));
    const hit = str.trim().match(new RegExp(`^${src}$`));
    if (!hit) return null;

    const b = base && !isNaN(base.getTime()) ? base : new Date();
    const hasTime = tokens.some((tk) => tk === 'HH' || tk === 'hh' || tk === 'mm' || tk === 'ss');
    let year = b.getFullYear();
    let month = b.getMonth();
    let day = b.getDate();
    let hours = hasTime ? 0 : b.getHours();
    let minutes = hasTime ? 0 : b.getMinutes();
    let seconds = hasTime ? 0 : b.getSeconds();

    tokens.forEach((tok, i) => {
        const n = Number(hit[i + 1]);
        switch (tok) {
            case 'yyyy':
                year = n;
                break;
            case 'yy':
                year = 2000 + n;
                break;
            case 'MM':
                month = n - 1;
                break;
            case 'dd':
                day = n;
                break;
            case 'HH':
            case 'hh':
                hours = n;
                break;
            case 'mm':
                minutes = n;
                break;
            case 'ss':
                seconds = n;
                break;
        }
    });
    if (month < 0 || month > 11 || day < 1 || day > 31 || hours > 23 || minutes > 59 || seconds > 59) return null;
    // Only a day carried over from `base` may be clamped; a typed one must be valid.
    if (!tokens.includes('dd')) day = Math.min(day, new Date(year, month + 1, 0).getDate());
    const d = new Date(year, month, day, hours, minutes, seconds, 0);
    // Reject overflow like 31.02 — JS would silently roll into the next month.
    if (isNaN(d.getTime()) || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
}

/**
 * Parse any supported format back to a local Date. When `pattern` is given it is
 * tried first, so values written with a custom output format read back correctly.
 */
export function parseValue(val: unknown, pattern?: string): Date | null {
    if (val == null || val === '') return null;
    if (typeof val === 'number') {
        const d = new Date(val > 1e10 ? val : val * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string') {
        if (pattern?.trim()) {
            const custom = parseCustom(val, pattern.trim());
            if (custom) return custom;
        }
        // German format DD.MM.YYYY or DD.MM.YYYY HH:mm
        const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
        if (m) {
            const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

export function formatDate(d: Date, fmt: DateOutputFormat, pattern?: string): string | number {
    switch (fmt) {
        case 'timestamp_ms':
            return d.getTime();
        case 'timestamp_s':
            return Math.floor(d.getTime() / 1000);
        case 'iso':
            return d.toISOString();
        case 'date':
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        case 'datetime_local':
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        case 'de_date':
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
        case 'de_datetime':
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        case 'time_hhmm':
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        case 'time_hhmmss':
            return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
        case 'custom':
            return formatCustom(d, pattern?.trim() || DEFAULT_DATE_PATTERN);
    }
}

export function toDateInputValue(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInputValue(d: Date) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Native field that matches a pattern's granularity; 'text' = free entry plus our own picker. */
export type DateInputKind = 'datetime-local' | 'date' | 'month' | 'time' | 'text';

/**
 * Pick the native input that covers exactly the parts a custom pattern names, so
 * `MM.yyyy` still opens a month picker instead of forcing the user to type.
 * Patterns no native field covers (`yyyy`, `dd.MM`, …) stay free text and get
 * the parts picker from {@link PatternInput}.
 */
export function inputKindFor(pattern: string): DateInputKind {
    const toks: string[] = pattern.match(tokenRe()) ?? [];
    const day = toks.includes('dd');
    const month = toks.includes('MM');
    const year = toks.includes('yyyy') || toks.includes('yy');
    const time = toks.some((tk) => tk === 'HH' || tk === 'hh' || tk === 'mm' || tk === 'ss');
    if (day && month && year) return time ? 'datetime-local' : 'date';
    if (month && year && !day && !time) return 'month';
    if (time && !day && !month && !year) return 'time';
    return 'text';
}

/** Current date as the value string the native field of `kind` expects. */
export function toInputValue(kind: DateInputKind, d: Date, pattern: string): string {
    switch (kind) {
        case 'datetime-local':
            return `${toDateInputValue(d)}T${toTimeInputValue(d)}`;
        case 'date':
            return toDateInputValue(d);
        case 'month':
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        case 'time':
            return toTimeInputValue(d);
        default:
            return formatCustom(d, pattern);
    }
}

/**
 * Read a native field back into a Date. Parts the field does not cover keep their
 * value from `base` — a month field never touches the stored day or time.
 */
export function fromInputValue(kind: DateInputKind, raw: string, base?: Date | null): Date | null {
    const b = base && !isNaN(base.getTime()) ? base : new Date();
    const m = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?$/);
    if (kind === 'time') {
        const t = raw.match(/^(\d{2}):(\d{2})/);
        if (!t) return null;
        return new Date(b.getFullYear(), b.getMonth(), b.getDate(), +t[1], +t[2], 0, 0);
    }
    if (!m) return null;
    const year = +m[1];
    const month = +m[2] - 1;
    const day = kind === 'month' ? b.getDate() : +(m[3] ?? 1);
    const hasTime = m[4] !== undefined;
    const d = new Date(
        year,
        month,
        day,
        hasTime ? +m[4] : b.getHours(),
        hasTime ? +m[5] : b.getMinutes(),
        hasTime ? 0 : b.getSeconds(),
        0,
    );
    if (isNaN(d.getTime())) return null;
    // A month field keeps the stored day — clamp when the new month is shorter.
    if (kind === 'month' && d.getMonth() !== month) return new Date(year, month + 1, 0, d.getHours(), d.getMinutes());
    return d;
}
