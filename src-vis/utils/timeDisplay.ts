/**
 * Display-only time formatting for datapoint values.
 *
 * Some datapoints hold a point in time (unix seconds, milliseconds, ISO string,
 * `HH:mm`, …). `parseTimeValue` already detects all of those shapes, so anywhere
 * a raw value is rendered as text we can offer to show it as time, date or both.
 * The datapoint itself is never modified.
 *
 * The token formatter (`applyTimeFormat` + helpers) was originally private to the
 * clock widget; it lives here so both the clock widget and the generic value
 * formatting below share one implementation.
 */

import type { TranslationKey } from '../i18n';
import { parseTimeValue } from './parseTimeValue';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Shown instead of a formatted value when the value holds no readable time. */
export const TIME_DASH = '–';

export function pad(n: number) {
    return String(n).padStart(2, '0');
}

/** ISO-8601 calendar week (week starts Monday; week 1 contains the first Thursday). */
export function isoWeek(d: Date): number {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}

/** `HH:mm` for a date, or the dash placeholder for null/invalid dates. */
export function formatHM(d: Date | null): string {
    if (!d || isNaN(d.getTime())) return TIME_DASH;
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Extra tokens only the clock widget can fill (sun times, location, countdown). */
export interface TimeFormatContext {
    city: string;
    sunrise: Date | null;
    sunset: Date | null;
    rel: string;
}

/**
 * Replaces date/time tokens in `fmt`. Without a `ctx` the clock-only tokens
 * (`REL`, `SR`, `SS`, `CT`) resolve to the dash placeholder.
 */
export function applyTimeFormat(date: Date, fmt: string, t: TFn, ctx?: TimeFormatContext): string {
    return fmt
        .replace('REL', ctx?.rel ?? TIME_DASH)
        .replace('EEEE', t(`clock.day.${date.getDay()}` as TranslationKey))
        .replace('EE', t(`cal.day.${date.getDay()}` as TranslationKey))
        .replace('MMMM', t(`clock.month.${date.getMonth()}` as TranslationKey))
        .replace('yyyy', String(date.getFullYear()))
        .replace('yy', String(date.getFullYear()).slice(-2))
        .replace('MM', pad(date.getMonth() + 1))
        .replace('dd', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('hh', pad(date.getHours() % 12 || 12))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()))
        .replace('ww', String(isoWeek(date)))
        .replace('SR', ctx ? formatHM(ctx.sunrise) : TIME_DASH)
        .replace('SS', ctx ? formatHM(ctx.sunset) : TIME_DASH)
        .replace('CT', ctx?.city ?? TIME_DASH);
}

export interface TimeDisplayPreset {
    id: string;
    label: string;
}

/** Selectable output shapes; `none` (the default) leaves the value untouched. */
export const TIME_DISPLAY_PRESETS: TimeDisplayPreset[] = [
    { id: 'none', label: 'Keine' },
    { id: 'time', label: 'Uhrzeit (14:32)' },
    { id: 'time-sec', label: 'Uhrzeit mit Sekunden (14:32:07)' },
    { id: 'date', label: 'Datum (01.08.2026)' },
    { id: 'date-long', label: 'Datum lang (Samstag, 1. August 2026)' },
    { id: 'datetime', label: 'Datum + Uhrzeit (01.08.2026 14:32)' },
    { id: 'datetime-sec', label: 'Datum + Uhrzeit mit Sekunden' },
];

/** True when the stored format id actually produces a time output. */
export function hasTimeDisplay(format: string | undefined): boolean {
    return Boolean(format) && format !== 'none';
}

function shortDate(d: Date): string {
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function longDate(d: Date, t: TFn): string {
    const day = t(`clock.day.${d.getDay()}` as TranslationKey);
    const month = t(`clock.month.${d.getMonth()}` as TranslationKey);
    return `${day}, ${d.getDate()}. ${month} ${d.getFullYear()}`;
}

/**
 * Formats an arbitrary datapoint value as time/date. Returns `null` when the
 * format is off or the value cannot be read as a time, so callers decide whether
 * to fall back to the raw value or render a placeholder.
 */
export function formatTimeDisplay(
    value: unknown,
    format: string | undefined,
    t: TFn,
    pattern?: string,
    now?: Date,
): string | null {
    if (!hasTimeDisplay(format)) return null;
    const d = parseTimeValue(value, now ?? new Date());
    if (!d) return null;
    switch (format) {
        case 'time':
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        case 'time-sec':
            return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        case 'date':
            return shortDate(d);
        case 'date-long':
            return longDate(d, t);
        case 'datetime':
            return `${shortDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        case 'datetime-sec':
            return `${shortDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        case 'custom': {
            const fmt = pattern?.trim();
            if (!fmt) return null;
            return applyTimeFormat(d, fmt, t);
        }
        default:
            return null;
    }
}
