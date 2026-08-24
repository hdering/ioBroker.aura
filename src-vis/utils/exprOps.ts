/**
 * The operation vocabulary of datapoint bindings.
 *
 * Two spellings, one implementation: the vis-style chain appends operations with
 * semicolons (`{senec.0.P;round(1);HEX2}`), an expression pipes into the very same
 * names (`{{ senec.0.P | round(1) | HEX2 }}`). Keeping a single registry is the whole
 * point — the documentation table and the tests then describe both forms at once.
 *
 * Names and semantics follow ioBroker.vis so existing bindings can be pasted over:
 * https://github.com/ioBroker/ioBroker.vis-2#bindings-of-objects
 * Note the trap that comes with that heritage — vis' `min`/`max` clamp the LOWER /
 * UPPER bound and are therefore the mirror image of `Math.min`/`Math.max`.
 *
 * Not adopted from vis: `json()` (aura's `?path` suffix already addresses nested
 * values, and it works inside a chain too), `array()` and `random()`.
 */
import type { TranslationKey } from '../i18n';
import { parseTimeValue } from './parseTimeValue';
import { pad, isoWeek } from './timeDisplay';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Everything an operation may need from the widget that renders it. */
export interface OpsContext {
    /** Locale-aware number rendering — formatNum from utils/formatValue, bound to the
     *  widget's number format. The only operation output that is NOT technical. */
    formatNum: (value: number, decimals: number) => string;
    /** The widget's decimals setting, used when `formatValue()` gets no argument. */
    decimals: number;
    /** Translator, for weekday and month names. */
    t: TFn;
}

/** Operation arguments are literals only — never nested expressions. */
export type OpArg = string | number | boolean | null;

type OpFn = (value: unknown, args: OpArg[], ctx: OpsContext) => unknown;

// ── value coercion ────────────────────────────────────────────────────────────

/**
 * Read a value as a number. ioBroker states are often strings, so a numeric string
 * counts; anything unreadable becomes NaN and travels through the chain as such,
 * which `exprToString` finally renders as an empty string rather than "NaN".
 */
export function toNum(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const s = value.trim();
        return s ? parseFloat(s) : NaN;
    }
    return NaN;
}

/** Numeric argument with a fallback for the no-argument spellings (`round`, `pow`). */
function argNum(args: OpArg[], index: number, fallback: number): number {
    if (index >= args.length) return fallback;
    const n = toNum(args[index]);
    return isNaN(n) ? fallback : n;
}

/** Apply `fn` only to readable numbers — NaN in, NaN out (and thus empty output). */
function numeric(fn: (n: number, args: OpArg[], ctx: OpsContext) => unknown): OpFn {
    return (value, args, ctx) => {
        const n = toNum(value);
        return isNaN(n) ? NaN : fn(n, args, ctx);
    };
}

// ── date formatting ───────────────────────────────────────────────────────────

// Longest spelling first — JS alternation matches leftmost, so `dddd` has to be
// tried before `ddd` and `dd`, `MMMM` before `MM`, and so on.
const DATE_TOKEN_RE = /YYYY|yyyy|MMMM|dddd|EEEE|SSS|ddd|YY|yy|MM|DD|dd|EE|HH|hh|mm|ss|ww/g;

const DEFAULT_DATE_FORMAT = 'dd.MM.yyyy HH:mm';

/** `expr.today` / `expr.yesterday` when the date is one of those, else null. */
function relDayKey(d: Date): TranslationKey | null {
    const now = new Date();
    const sameDay = (a: Date, b: Date): boolean =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, now)) return 'expr.today';
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return sameDay(d, yesterday) ? 'expr.yesterday' : null;
}

/**
 * Render a point in time with the token set both vis and moment users expect.
 *
 * The one place the two disagree is `hh`: vis' own example `date(hh:mm)` prints a
 * 24-hour clock, while moment defines `hh` as 12-hour. `mode` therefore decides,
 * and `HH` is always 24-hour. Unlike `applyTimeFormat` (a chain of single
 * `String.replace` calls) every token is replaced at every occurrence.
 */
function formatDateValue(
    value: unknown,
    fmt: string,
    ctx: OpsContext,
    mode: 'vis' | 'moment',
    todayOrYesterday = false,
): string {
    const d = parseTimeValue(value);
    if (!d) return '';

    const weekday = (long: boolean): string => {
        if (todayOrYesterday) {
            const rel = relDayKey(d);
            if (rel) return ctx.t(rel);
        }
        return ctx.t((long ? `clock.day.${d.getDay()}` : `cal.day.${d.getDay()}`) as TranslationKey);
    };

    return fmt.replace(DATE_TOKEN_RE, (tok) => {
        switch (tok) {
            case 'YYYY':
            case 'yyyy':
                return String(d.getFullYear());
            case 'YY':
            case 'yy':
                return String(d.getFullYear()).slice(-2);
            case 'MMMM':
                return ctx.t(`clock.month.${d.getMonth()}` as TranslationKey);
            case 'MM':
                return pad(d.getMonth() + 1);
            case 'DD':
            case 'dd':
                return pad(d.getDate());
            case 'dddd':
            case 'EEEE':
                return weekday(true);
            case 'ddd':
            case 'EE':
                return weekday(false);
            case 'HH':
                return pad(d.getHours());
            case 'hh':
                return mode === 'moment' ? pad(d.getHours() % 12 || 12) : pad(d.getHours());
            case 'mm':
                return pad(d.getMinutes());
            case 'ss':
                return pad(d.getSeconds());
            case 'SSS':
                return String(d.getMilliseconds()).padStart(3, '0');
            case 'ww':
                return String(isoWeek(d));
            default:
                return tok;
        }
    });
}

// ── the registry ──────────────────────────────────────────────────────────────

const OPS: Record<string, OpFn> = {
    // Arithmetic — vis writes the argument in brackets: `*(4)`, `+(4.5)`, `-(-674.5)`.
    '*': numeric((n, a) => n * argNum(a, 0, 1)),
    '+': numeric((n, a) => n + argNum(a, 0, 0)),
    '-': numeric((n, a) => n - argNum(a, 0, 0)),
    '/': numeric((n, a) => n / argNum(a, 0, 1)),
    '%': numeric((n, a) => n % argNum(a, 0, 1)),

    // Rounding. `round` alone yields a whole number, `round(N)` keeps N decimals.
    round: numeric((n, a) => {
        const f = 10 ** Math.max(0, Math.round(argNum(a, 0, 0)));
        return Math.round(n * f) / f;
    }),
    floor: numeric((n) => Math.floor(n)),
    ceil: numeric((n) => Math.ceil(n)),

    // Bounds, with vis' inverted naming: `min(N)` is the LOWER bound.
    min: numeric((n, a) => (n < argNum(a, 0, n) ? argNum(a, 0, n) : n)),
    max: numeric((n, a) => (n > argNum(a, 0, n) ? argNum(a, 0, n) : n)),

    sqrt: numeric((n) => Math.sqrt(n)),
    pow: numeric((n, a) => n ** argNum(a, 0, 2)),

    // Hex — the `…2` spellings pad to two digits, the upper-case ones shout.
    hex: numeric((n) => Math.round(n).toString(16)),
    hex2: numeric((n) => Math.round(n).toString(16).padStart(2, '0')),
    HEX: numeric((n) => Math.round(n).toString(16).toUpperCase()),
    HEX2: numeric((n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()),

    // Display formatting: thousands separator and decimal comma of the widget.
    formatValue: numeric((n, a, ctx) => ctx.formatNum(n, Math.max(0, Math.round(argNum(a, 0, ctx.decimals))))),

    date: (value, args, ctx) => formatDateValue(value, String(args[0] ?? DEFAULT_DATE_FORMAT), ctx, 'vis'),
    momentDate: (value, args, ctx) =>
        formatDateValue(
            value,
            String(args[0] ?? DEFAULT_DATE_FORMAT),
            ctx,
            'moment',
            args[1] === true || args[1] === 'true',
        ),

    // ── aura additions, no counterpart in vis ──
    /** Fallback for values that would otherwise render as nothing. */
    default: (value, args) => {
        const empty =
            value === null || value === undefined || value === '' || (typeof value === 'number' && !isFinite(value));
        return empty ? (args[0] ?? '') : value;
    },
    fixed: numeric((n, a) => n.toFixed(Math.max(0, Math.round(argNum(a, 0, 0))))),
    upper: (value) => String(value ?? '').toUpperCase(),
    lower: (value) => String(value ?? '').toLowerCase(),
    trim: (value) => String(value ?? '').trim(),
    bool: (value) => value === true || value === 1 || value === '1' || value === 'true',
    json: (value) => {
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    },
};

/** True for a name the chain / pipe may use. */
export function isOp(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(OPS, name);
}

/** Run one operation. Unknown names never reach here — the parsers reject them. */
export function applyOp(name: string, value: unknown, args: OpArg[], ctx: OpsContext): unknown {
    const op = OPS[name];
    return op ? op(value, args, ctx) : value;
}

/** Every operation name — used by the tests and the editor hints. */
export const OP_NAMES: string[] = Object.keys(OPS);
