/**
 * Paging through a chart by its active range (issue #871).
 *
 * The chart's absolute window hangs on one instant, the reference point `ref`: the window's END
 * with anchor `end`, its START with anchor `start`. ◀ / ▶ move `ref` by the span of the active
 * chip, so a 7-day chip steps a week and a 1-month chip a calendar month. Switching chips keeps
 * `ref`, which is what keeps the browsed date when the range changes.
 *
 * `ref === null` is the rolling window up to now — the chart's normal mode.
 *
 * Pure logic, no React: shared by the chart widget, its group store and the tests.
 */
import type { EChartTimeRange } from '../hooks/useMultiSeriesData';
import type { RangeUnit } from './rangeChips';

export type NavAnchor = 'end' | 'start';

export interface NavSpan {
    value: number;
    unit: RangeUnit;
}

export interface NavWindow {
    start: number;
    end: number;
}

export type NavCommand = 'prev' | 'next' | 'today' | 'now';

/**
 * What the "current" window is: the one that ends with today / the current hour (`contains-now`,
 * the default — right for consumption), or the one that STARTS today / at the current hour
 * (`starts-today` — right for a forecast, where today and the days after it matter).
 */
export type NavCurrent = 'contains-now' | 'starts-today';

/**
 * How far forward the windows may go. `horizon` is the latest instant a window may START at — by
 * default now, so a window never starts in the future. A forecast chart raises it to the last
 * forecast point or a fixed lead (`echartNavFuture`).
 */
export interface NavLimits {
    horizon?: number;
    current?: NavCurrent;
}

/** `echartNavFuture`: no future (default), up to the newest recorded point, or a fixed lead. */
export type NavFuture = { kind: 'none' } | { kind: 'data' } | { kind: 'fixed'; span: NavSpan };

/** Reads `none` / `data` / `16d` (number + unit like a range chip). Anything else = `none`. */
export function parseNavFuture(raw: unknown): NavFuture {
    if (typeof raw !== 'string') return { kind: 'none' };
    const s = raw.trim();
    if (/^data$/i.test(s)) return { kind: 'data' };
    const m = /^(\d{1,4})\s*(m|h|d|w|M|y)$/.exec(s);
    if (m && Number(m[1]) > 0) return { kind: 'fixed', span: { value: Number(m[1]), unit: m[2] as RangeUnit } };
    return { kind: 'none' };
}

/**
 * The horizon for `parseNavFuture`'s result. `data` takes the newest recorded point; while that is
 * still unknown (`undefined`, probe pending) any future window is accepted, so a date set from a
 * datapoint on mount is not thrown back to today before the probe has answered.
 */
export function futureHorizon(f: NavFuture, newest: number | null | undefined, now: number = Date.now()): number {
    if (f.kind === 'fixed') return shiftBy(now, f.span.value, f.span.unit);
    if (f.kind === 'data') return newest === undefined ? Infinity : Math.max(now, newest ?? now);
    return now;
}

/** A lead token (`36h`; `0h` = none) → ms, or null when it is not one. */
export function parseLead(raw: unknown, now: number = Date.now()): number | null {
    if (typeof raw !== 'string') return null;
    const m = /^(\d{1,4})\s*(m|h|d|w|M|y)$/.exec(raw.trim());
    if (!m) return null;
    const n = Number(m[1]);
    return n === 0 ? 0 : shiftBy(now, n, m[2] as RangeUnit) - now;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Step span of a range; null for `total`, which has no window to page through. */
export function navSpan(range: EChartTimeRange, value?: number, unit?: RangeUnit): NavSpan | null {
    switch (range) {
        case 'total':
            return null;
        case '1h':
            return { value: 1, unit: 'h' };
        case '6h':
            return { value: 6, unit: 'h' };
        // A day, not 24 fixed hours: on the two DST switch days 24 h would slide off midnight.
        case '24h':
            return { value: 1, unit: 'd' };
        case '7d':
            return { value: 7, unit: 'd' };
        case '30d':
            return { value: 30, unit: 'd' };
        case '1y':
            return { value: 1, unit: 'y' };
        case 'custom': {
            const n = Math.max(1, Math.round(value ?? 24) || 1);
            const u = unit ?? 'h';
            if (u === 'h' && n % 24 === 0) return { value: n / 24, unit: 'd' };
            return { value: n, unit: u };
        }
    }
}

/** Spans of whole days and longer page along the calendar and snap to midnight. */
export function isDaySpan(span: NavSpan): boolean {
    return span.unit === 'd' || span.unit === 'w' || span.unit === 'M' || span.unit === 'y';
}

export function dayStart(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Local midnight at or after `ms`. */
function dayCeil(ms: number): number {
    const s = dayStart(ms);
    return s === ms ? s : shiftBy(s, 1, 'd');
}

function hourCeil(ms: number): number {
    return Math.ceil(ms / HOUR) * HOUR;
}

function hourFloor(ms: number): number {
    return Math.floor(ms / HOUR) * HOUR;
}

/**
 * `ms` moved by `n` units. Days and weeks count calendar days (DST-safe), months and years
 * calendar months; a day that does not exist in the target month clamps to its last day —
 * the same rule as `unitSpanMs`.
 */
export function shiftBy(ms: number, n: number, unit: RangeUnit): number {
    if (unit === 'm') return ms + n * MINUTE;
    if (unit === 'h') return ms + n * HOUR;
    const d = new Date(ms);
    if (unit === 'd' || unit === 'w') {
        d.setDate(d.getDate() + n * (unit === 'w' ? 7 : 1));
        return d.getTime();
    }
    const day = d.getDate();
    d.setDate(1);
    if (unit === 'M') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, daysInMonth));
    return d.getTime();
}

export function navWindow(span: NavSpan, ref: number, anchor: NavAnchor): NavWindow {
    return anchor === 'start'
        ? { start: ref, end: shiftBy(ref, span.value, span.unit) }
        : { start: shiftBy(ref, -span.value, span.unit), end: ref };
}

/**
 * The "today" reference point: the window that ends with today (day spans) or with the current
 * hour (shorter spans) — whatever the anchor, so "Heute" shows the current period either way.
 * With `current: 'starts-today'` it is the window that STARTS today / at the current hour instead.
 */
export function todayRef(span: NavSpan, anchor: NavAnchor, now: number = Date.now(), lim: NavLimits = {}): number {
    if (lim.current === 'starts-today') {
        const start = isDaySpan(span) ? dayStart(now) : hourFloor(now);
        return anchor === 'start' ? start : shiftBy(start, span.value, span.unit);
    }
    const end = isDaySpan(span) ? dayCeil(now + 1) : hourCeil(now + 1);
    return anchor === 'start' ? shiftBy(end, -span.value, span.unit) : end;
}

/** Whether `ref` IS today's window for this span. */
export function isTodayRef(
    ref: number | null,
    span: NavSpan | null,
    anchor: NavAnchor,
    now = Date.now(),
    lim: NavLimits = {},
): boolean {
    return ref !== null && span !== null && ref === todayRef(span, anchor, now, lim);
}

/** Reference point of a picked calendar day (local midnight of `dayMs`'s date). */
export function refFromDay(dayMs: number, anchor: NavAnchor): number {
    const s = dayStart(dayMs);
    return anchor === 'start' ? s : shiftBy(s, 1, 'd');
}

/** The calendar day the reference point names — the inverse of `refFromDay`. */
export function dayOfRef(ref: number, anchor: NavAnchor): number {
    return anchor === 'start' ? dayStart(ref) : dayStart(ref - 1);
}

/** Latest instant a window may start at. */
function horizonOf(lim: NavLimits, now: number): number {
    return Math.max(now, lim.horizon ?? now);
}

/**
 * `ref` fitted to a (new) span. Day spans snap to a day boundary, so stepping hours and then
 * switching to a week does not leave an 18:00–18:00 window. A window has to start in the past (or
 * before the forecast horizon) — one that would start later falls back to today's window. It may
 * END in the future: today's day runs to midnight, and "7 days from yesterday" is a fair thing to pick.
 */
export function normalizeRef(
    ref: number,
    span: NavSpan,
    anchor: NavAnchor,
    now: number = Date.now(),
    lim: NavLimits = {},
): number {
    const snapped = isDaySpan(span) ? (anchor === 'start' ? dayStart(ref) : dayCeil(ref)) : ref;
    return navWindow(span, snapped, anchor).start > horizonOf(lim, now) ? todayRef(span, anchor, now, lim) : snapped;
}

/**
 * The reference point after switching from one span to another. Today's window stays today's
 * window — with anchor `start` the start of "the last 7 days" is not the start of "today".
 */
export function switchRef(
    ref: number,
    from: NavSpan | null,
    to: NavSpan,
    anchor: NavAnchor,
    now: number = Date.now(),
    lim: NavLimits = {},
): number {
    if (from && isTodayRef(ref, from, anchor, now, lim)) return todayRef(to, anchor, now, lim);
    return normalizeRef(ref, to, anchor, now, lim);
}

/**
 * Can ▶ move on? Only while the next window still starts in the past — or, with a forecast
 * horizon, before it. From the rolling window (`ref === null`) the step starts at today's window;
 * without a horizon the window after today's always starts in the future, so ▶ stays off there.
 */
export function canStepForward(
    ref: number | null,
    span: NavSpan | null,
    anchor: NavAnchor,
    now = Date.now(),
    lim: NavLimits = {},
): boolean {
    if (span === null) return false;
    const base = ref ?? todayRef(span, anchor, now, lim);
    return navWindow(span, shiftBy(base, span.value, span.unit), anchor).start <= horizonOf(lim, now);
}

/**
 * One step back (`dir = -1`) or forward (`+1`). From the rolling window a step back lands on the
 * window before today's; a step forward never lands on a window that starts past the horizon.
 */
export function stepRef(
    ref: number | null,
    span: NavSpan,
    dir: -1 | 1,
    anchor: NavAnchor,
    now: number = Date.now(),
    lim: NavLimits = {},
): number {
    const base = ref ?? todayRef(span, anchor, now, lim);
    if (dir > 0 && !canStepForward(base, span, anchor, now, lim)) return base;
    return normalizeRef(shiftBy(base, dir * span.value, span.unit), span, anchor, now, lim);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDay(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A reference point read from a datapoint. `undefined` = not a usable value (the chart keeps
 * its state), `null` = the rolling window.
 *   • empty, `0`, `now`/`live`/`jetzt` → rolling;
 *   • `YYYY-MM-DD` → that calendar day, placed by the anchor;
 *   • a number (ms) or a date-time string → that instant as the reference point itself.
 */
export function parseNavDate(raw: unknown, anchor: NavAnchor): number | null | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'number') return raw === 0 ? null : Number.isFinite(raw) ? raw : undefined;
    if (typeof raw !== 'string') return undefined;
    const s = raw.trim();
    if (s === '' || s === '0' || /^(now|live|jetzt)$/i.test(s)) return null;
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (day) {
        const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
        return Number.isNaN(d.getTime()) ? undefined : refFromDay(d.getTime(), anchor);
    }
    if (/^\d+$/.test(s)) return Number(s) || null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : t;
}

/**
 * A reference point for a datapoint — the counterpart of `parseNavDate`. A number datapoint
 * gets ms (`0` = rolling); a string one the calendar day where `ref` sits on a day boundary,
 * otherwise the local date-time.
 */
export function formatNavDate(ref: number | null, anchor: NavAnchor, asNumber: boolean): string | number {
    if (ref === null) return asNumber ? 0 : '';
    if (asNumber) return ref;
    if (dayStart(ref) === ref) return isoDay(dayOfRef(ref, anchor));
    const d = new Date(ref);
    return `${isoDay(ref)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A command written to the command datapoint, or null when it is none. */
export function parseNavCommand(raw: unknown): NavCommand | null {
    if (typeof raw === 'number') return raw < 0 ? 'prev' : raw > 0 ? 'next' : null;
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toLowerCase();
    if (s === 'prev' || s === 'back' || s === 'zurück' || s === 'zurueck' || s === '-1') return 'prev';
    if (s === 'next' || s === 'forward' || s === 'vor' || s === '+1' || s === '1') return 'next';
    if (s === 'today' || s === 'heute') return 'today';
    if (s === 'now' || s === 'live' || s === 'jetzt') return 'now';
    return null;
}
