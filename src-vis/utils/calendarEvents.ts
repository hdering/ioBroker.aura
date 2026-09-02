// Pure calendar-event helpers shared by the Kalender widget.
//
// They live outside the component so `tools/tests/calendar-events.mjs` can bundle
// and drive them without a browser: nothing in here touches React, i18n or the
// socket. The widget imports them back in.

import { isoWeek } from './timeDisplay';

/** The bits of a calendar event the day arithmetic needs. */
export interface DaySpan {
    uid: string;
    start: Date;
    end?: Date;
    allDay: boolean;
}

/** Same calendar day in local time. */
export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Inclusive last calendar day of an event, or null for single-day / no-end events.
 * iCal DTEND is EXCLUSIVE for all-day events (a Mon–Wed event has DTEND=Thu),
 * so we step back one day to get the actual last day the event covers.
 */
export function eventEndDay(ev: DaySpan): Date | null {
    if (!ev.end) return null;
    const end = new Date(ev.end.getTime());
    if (ev.allDay) end.setDate(end.getDate() - 1);
    return end;
}

export function isMultiDay(ev: DaySpan): boolean {
    const endDay = eventEndDay(ev);
    return !!endDay && endDay > ev.start && !sameDay(ev.start, endDay);
}

function dayStart(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** A whole event may not produce more rows than this, however long it runs. */
const MAX_SPLIT_DAYS = 400;

/** One day of a split multi-day event knows where it sits in the run. */
export interface SplitPart {
    /** 1-based day of the run; undefined on events that were not split. */
    dayIndex?: number;
    /** Total days of the run; undefined on events that were not split. */
    dayCount?: number;
}

/**
 * Expands every multi-day event into one entry per calendar day.
 *
 * Each part covers exactly one day, so `isMultiDay` is false for all of them and
 * the span/running-badge display of the widget switches itself off. The first
 * part keeps the original start (and its time), every following one starts at
 * midnight and is treated as all-day — "Sa, 5. Sept" reads better than
 * "Sa, 5. Sept, 00:00".
 *
 * Single-day events pass through untouched (same object identity).
 */
export function splitMultiDay<T extends DaySpan>(events: T[]): (T & SplitPart)[] {
    const out: (T & SplitPart)[] = [];
    for (const ev of events) {
        if (!isMultiDay(ev)) {
            out.push(ev);
            continue;
        }
        const endDay = eventEndDay(ev) as Date;
        const first = dayStart(ev.start);
        const last = dayStart(endDay);
        const span = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
        const count = Math.min(MAX_SPLIT_DAYS, span);
        for (let i = 0; i < count; i++) {
            const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
            const isLast = i === count - 1;
            // Non-last parts end with their day: all-day parts use the exclusive
            // next midnight iCal writes, timed ones the last millisecond — either
            // way `eventEndDay` lands back on `day`, so the part is single-day.
            const end = isLast
                ? ev.end
                : ev.allDay || i > 0
                  ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
                  : new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, -1);
            out.push({
                ...ev,
                uid: `${ev.uid}#d${i}`,
                start: i === 0 ? ev.start : day,
                end,
                allDay: ev.allDay || i > 0,
                dayIndex: i + 1,
                dayCount: count,
            });
        }
    }
    return out;
}

/**
 * Marks the first entry of every ISO calendar week in an already-sorted list —
 * the position the week number is printed at, the way a paper agenda does it.
 */
export function firstOfWeekFlags(starts: Date[]): boolean[] {
    let prev: string | null = null;
    return starts.map((d) => {
        // The week number alone repeats every year, so the year of the ISO week
        // (January days can belong to week 52/53 of the year before) is part of it.
        const wk = isoWeek(d);
        const key = `${d.getFullYear() + (d.getMonth() === 0 && wk > 50 ? -1 : d.getMonth() === 11 && wk === 1 ? 1 : 0)}-${wk}`;
        const first = key !== prev;
        prev = key;
        return first;
    });
}

/** "HH:MM" in local time. */
export function clockLabel(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Clock time an event ends at, or '' when there is nothing sensible to print:
 * an all-day event has no "bis" time, and neither has one whose source sent no
 * DTEND (or an end that isn't after the start).
 */
export function endClockLabel(ev: DaySpan): string {
    if (ev.allDay || !ev.end) return '';
    if (ev.end.getTime() <= ev.start.getTime()) return '';
    return clockLabel(ev.end);
}

/** "09:00 – 10:30", "09:00" when no end is known, '' for an all-day event. */
export function timeSpanLabel(ev: DaySpan): string {
    if (ev.allDay) return '';
    const end = endClockLabel(ev);
    return end ? `${clockLabel(ev.start)} – ${end}` : clockLabel(ev.start);
}
