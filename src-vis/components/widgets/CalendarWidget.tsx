import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, CalendarDays, MapPin, AlertCircle, Star } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { getSocket, subscribeStateDirect, setStateDirect, getStateDirect } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { isoWeek } from '../../utils/timeDisplay';
import {
    eventEndDay,
    isMultiDay,
    splitMultiDay,
    firstOfWeekFlags,
    clockLabel,
    endClockLabel,
    timeSpanLabel,
    type SplitPart,
} from '../../utils/calendarEvents';
import { CustomGridView } from './CustomGridView';
import { usePopupAutoHeight } from '../../contexts/PopupAutoHeightContext';
import { useAutoHeightStore } from '../../store/autoHeightStore';
import { NS } from '../../utils/namespace';

// ── CalendarSource ─────────────────────────────────────────────────────────

/** `url` = widget fetches the iCal URL itself, `adapter` = read a ioBroker.ical table state. */
export type CalendarSourceType = 'url' | 'adapter';

export interface CalendarSource {
    id: string;
    url: string;
    name: string;
    color: string;
    showName: boolean;
    /** Optional lucide icon shown in front of this calendar's entries. Empty = none. */
    icon?: string;
    /** Defaults to 'url' so sources saved before adapter support keep working. */
    type?: CalendarSourceType;
    /** Adapter source: state holding the ical adapter table JSON (e.g. ical.0.data.table). */
    datapoint?: string;
    /** Adapter source: only keep entries of this calendar (empty = all calendars of the state). */
    calFilter?: string;
}

/** The URL resp. datapoint a source reads from – empty when it is not configured yet. */
export function getSourceTarget(src: CalendarSource): string {
    return ((src.type === 'adapter' ? src.datapoint : src.url) ?? '').trim();
}

export const DEFAULT_CAL_COLORS = [
    '#3b82f6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
];

export function getSources(options: Record<string, unknown>): CalendarSource[] {
    if (Array.isArray(options.calendars) && (options.calendars as CalendarSource[]).length > 0) {
        return options.calendars as CalendarSource[];
    }
    // backward compat: single icalUrl
    if (options.icalUrl) {
        return [
            {
                id: 'legacy',
                url: options.icalUrl as string,
                name: 'Kalender',
                color: DEFAULT_CAL_COLORS[0],
                showName: true,
            },
        ];
    }
    return [];
}

// ── iCal parser ────────────────────────────────────────────────────────────

interface CalEvent {
    uid: string;
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end?: Date;
    allDay: boolean;
    priority?: number; // PRIORITY 1-9 (1-4 = high)
    categories?: string[]; // CATEGORIES
    rrule?: string; // raw RRULE value (recurrence rule)
    exdates?: Date[]; // EXDATE exclusions
}

interface CalEventTagged extends CalEvent, SplitPart {
    sourceId: string;
    sourceName: string;
    sourceColor: string;
    showSourceName: boolean;
    /** Lucide icon name of the source, if one was configured. */
    sourceIcon?: string;
}

function parseIcalDate(raw: string): Date {
    const v = raw.trim();
    if (v.length === 8) {
        return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
    }
    const y = +v.slice(0, 4),
        mo = +v.slice(4, 6) - 1,
        d = +v.slice(6, 8);
    const h = +v.slice(9, 11),
        mi = +v.slice(11, 13),
        s = +v.slice(13, 15);
    return v.endsWith('Z') ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
}

function parseIcal(text: string): CalEvent[] {
    const unfolded = text.replace(/\r\n([ \t])/g, '$1').replace(/\n([ \t])/g, '$1');
    const lines = unfolded.split(/\r?\n/);
    const events: CalEvent[] = [];
    let inEvent = false;
    let cur: Partial<CalEvent> & { uid: string } = { uid: '' };

    for (const raw of lines) {
        const line = raw.trim();
        if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            cur = { uid: String(Math.random()), allDay: false };
            continue;
        }
        if (line === 'END:VEVENT') {
            inEvent = false;
            if (cur.summary && cur.start) events.push(cur as CalEvent);
            cur = { uid: '' };
            continue;
        }
        if (!inEvent) continue;
        const sep = line.indexOf(':');
        if (sep < 0) continue;
        const key = line.slice(0, sep).split(';')[0].toUpperCase();
        const value = line.slice(sep + 1);
        if (key === 'UID') cur.uid = value;
        else if (key === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',').replace(/\\n/g, '\n');
        else if (key === 'DESCRIPTION') cur.description = value.replace(/\\,/g, ',').replace(/\\n/g, '\n');
        else if (key === 'LOCATION') cur.location = value.replace(/\\,/g, ',');
        else if (key === 'DTSTART') {
            cur.allDay = !value.includes('T');
            try {
                cur.start = parseIcalDate(value);
            } catch {
                /* skip */
            }
        } else if (key === 'DTEND') {
            try {
                cur.end = parseIcalDate(value);
            } catch {
                /* skip */
            }
        } else if (key === 'PRIORITY') {
            const p = parseInt(value, 10);
            if (!isNaN(p)) cur.priority = p;
        } else if (key === 'CATEGORIES') {
            cur.categories = value
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
        } else if (key === 'RRULE') {
            cur.rrule = value.trim();
        } else if (key === 'EXDATE') {
            const dates = value
                .split(',')
                .map((v) => {
                    try {
                        return parseIcalDate(v.trim());
                    } catch {
                        return null;
                    }
                })
                .filter((d): d is Date => d != null);
            cur.exdates = [...(cur.exdates ?? []), ...dates];
        }
    }
    return events;
}

// ── ioBroker.ical adapter table ─────────────────────────────────────────────

/** One row of the ical adapter's `data.table` JSON. */
interface IcalTableRow {
    event?: string;
    location?: string;
    _date?: string | number;
    _end?: string | number;
    _section?: string;
    _IDID?: string;
    _allDay?: boolean;
    _calName?: string;
    _calColor?: string;
    _class?: string;
}

/** Calendar name of a row – newer ical versions ship `_calName`, older ones only `_class`. */
function rowCalName(row: IcalTableRow): string {
    if (row._calName?.trim()) return row._calName.trim();
    return (row._class ?? '')
        .replace(/^ical_/, '')
        .replace(/_/g, ' ')
        .trim();
}

function toTableRows(val: unknown): IcalTableRow[] {
    let raw: unknown = val;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is IcalTableRow => !!r && typeof r === 'object');
}

/** Distinct calendar names contained in a table state – used by the editor's picker. */
export function extractCalNames(val: unknown): string[] {
    const names = new Set<string>();
    for (const row of toTableRows(val)) {
        const name = rowCalName(row);
        if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Map the ical adapter's table onto CalEvent. The adapter already expands
 * recurrences and applies its own preview window, so neither RRULE handling nor
 * an HTTP fetch is needed for these sources. `PRIORITY`/`CATEGORIES` are not
 * part of the table – keyword highlighting still works on summary/description.
 */
function parseAdapterTable(val: unknown, calFilter?: string): Array<CalEvent & { calName?: string }> {
    const filter = (calFilter ?? '').trim().toLowerCase();
    const out: Array<CalEvent & { calName?: string }> = [];
    for (const row of toTableRows(val)) {
        const summary = (row.event ?? '').trim();
        if (!summary || row._date == null) continue;
        const start = new Date(row._date as string);
        if (isNaN(start.getTime())) continue;
        const calName = rowCalName(row);
        if (filter && calName.toLowerCase() !== filter) continue;
        const end = row._end != null ? new Date(row._end as string) : undefined;
        out.push({
            uid: row._IDID?.trim() || `${start.getTime()}-${summary}`,
            summary,
            description: row._section?.trim() || undefined,
            location: row.location?.trim() || undefined,
            start,
            end: end && !isNaN(end.getTime()) ? end : undefined,
            allDay: !!row._allDay,
            calName: calName || undefined,
        });
    }
    return out;
}

// ── recurrence expansion (RRULE) ─────────────────────────────────────────────

interface ParsedRRule {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval: number;
    count?: number;
    until?: Date;
    byday?: number[]; // 0=SU … 6=SA
}

const RRULE_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRRule(raw: string): ParsedRRule | null {
    const map: Record<string, string> = {};
    for (const part of raw.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        map[part.slice(0, eq).toUpperCase().trim()] = part.slice(eq + 1).trim();
    }
    const freq = map.FREQ?.toUpperCase();
    if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
    const r: ParsedRRule = { freq, interval: Math.max(1, parseInt(map.INTERVAL, 10) || 1) };
    if (map.COUNT) {
        const c = parseInt(map.COUNT, 10);
        if (!isNaN(c)) r.count = c;
    }
    if (map.UNTIL) {
        try {
            r.until = parseIcalDate(map.UNTIL);
        } catch {
            /* ignore malformed UNTIL */
        }
    }
    if (map.BYDAY) {
        // Take the trailing 2-letter weekday; ordinal prefixes (e.g. "2MO") are approximated.
        r.byday = map.BYDAY.split(',')
            .map((tok) => RRULE_DAY[tok.trim().slice(-2).toUpperCase()])
            .filter((n) => n != null);
    }
    return r;
}

function occKey(d: Date, allDay: boolean): string {
    return allDay ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : String(d.getTime());
}

function advanceDate(d: Date, freq: ParsedRRule['freq'], step: number): Date {
    const x = new Date(d.getTime());
    if (freq === 'DAILY') x.setDate(x.getDate() + step);
    else if (freq === 'WEEKLY') x.setDate(x.getDate() + step * 7);
    else if (freq === 'MONTHLY') x.setMonth(x.getMonth() + step);
    else x.setFullYear(x.getFullYear() + step);
    return x;
}

/**
 * Expand a single recurring event into its concrete occurrences whose time range
 * overlaps [winStart, winEnd]. Non-recurring events are returned unchanged.
 * Supports FREQ/INTERVAL/COUNT/UNTIL/BYDAY (weekly) and EXDATE — enough for the
 * common Google/waste-collection ("Abfall") feeds that define pickups via RRULE.
 */
function expandRecurring(events: CalEvent[], winStart: Date, winEnd: Date): CalEvent[] {
    const out: CalEvent[] = [];
    const MAX_ITER = 3000;
    const winStartMs = winStart.getTime();
    const winEndMs = winEnd.getTime();

    for (const ev of events) {
        const rule = ev.rrule ? parseRRule(ev.rrule) : null;
        if (!rule) {
            out.push(ev);
            continue;
        }

        const duration = ev.end ? ev.end.getTime() - ev.start.getTime() : 0;
        const exSet = new Set((ev.exdates ?? []).map((d) => occKey(d, ev.allDay)));
        const startMs = ev.start.getTime();
        let seq = 0; // occurrences counted for COUNT
        let iter = 0;

        const emit = (occStart: Date): 'skip' | 'stop' | 'past' => {
            if (occStart.getTime() < startMs) return 'skip'; // before series start
            if (rule.until && occStart.getTime() > rule.until.getTime()) return 'stop';
            seq++;
            if (rule.count != null && seq > rule.count) return 'stop';
            const occStartMs = occStart.getTime();
            if (occStartMs + duration >= winStartMs && occStartMs <= winEndMs) {
                if (!exSet.has(occKey(occStart, ev.allDay))) {
                    out.push({
                        ...ev,
                        uid: `${ev.uid}@${occStartMs}`,
                        start: new Date(occStartMs),
                        end: ev.end ? new Date(occStartMs + duration) : undefined,
                        rrule: undefined,
                        exdates: undefined,
                    });
                }
            }
            return occStartMs > winEndMs ? 'past' : 'skip';
        };

        if (rule.freq === 'WEEKLY' && rule.byday && rule.byday.length > 0) {
            const bydays = [...rule.byday].sort((a, b) => a - b);
            // Anchor to the Sunday of the series-start week.
            const weekAnchor = new Date(ev.start);
            weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay());
            weekAnchor.setHours(0, 0, 0, 0);
            let stop = false;
            while (!stop && iter < MAX_ITER) {
                for (const wd of bydays) {
                    const occ = new Date(weekAnchor);
                    occ.setDate(weekAnchor.getDate() + wd);
                    occ.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
                    const res = emit(occ);
                    if (res === 'stop' || res === 'past') {
                        stop = true;
                        break;
                    }
                }
                weekAnchor.setDate(weekAnchor.getDate() + 7 * rule.interval);
                iter++;
            }
        } else {
            let cur = new Date(ev.start);
            while (iter < MAX_ITER) {
                const res = emit(cur);
                if (res === 'stop' || res === 'past') break;
                cur = advanceDate(cur, rule.freq, rule.interval);
                iter++;
            }
        }
    }
    return out;
}

// ── importance detection ───────────────────────────────────────────────────

function isImportant(ev: CalEventTagged, keywords: string[], usePriority: boolean): boolean {
    if (usePriority && ev.priority != null && ev.priority >= 1 && ev.priority <= 4) return true;
    if (keywords.length === 0) return false;
    const summaryLower = ev.summary.toLowerCase();
    const descLower = ev.description?.toLowerCase() ?? '';
    return keywords.some((kw) => {
        if (!kw) return false;
        const kwLower = kw.toLowerCase();
        if (summaryLower.includes(kwLower)) return true;
        if (descLower && descLower.includes(kwLower)) return true;
        if (ev.categories?.some((c) => c.toLowerCase().includes(kwLower))) return true;
        return false;
    });
}

// ── fetch ──────────────────────────────────────────────────────────────────

// Fetch iCal via the adapter's state-based relay:
//   frontend writes {id, url} → aura.0.calendar.request
//   adapter fetches URL, writes {id, content|error} → aura.0.calendar.response
//   frontend subscriber matches by id and resolves/rejects
/** Single attempt – rejects on timeout or adapter error. */
function fetchIcalTextOnce(url: string, ttlSeconds: number): Promise<string> {
    if (import.meta.env.DEV) {
        return fetch(`/proxy/ical?url=${encodeURIComponent(url)}`).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
        });
    }
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return new Promise((resolve, reject) => {
        let settled = false;
        let unsubscribe: (() => void) | undefined = undefined;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                unsubscribe?.();
                reject(new Error('Timeout'));
            }
        }, 20000);
        unsubscribe = subscribeStateDirect(`${NS}.calendar.response`, (state) => {
            if (!state?.val) return;
            try {
                const resp = JSON.parse(String(state.val)) as { id?: string; content?: string; error?: string };
                if (resp.id !== id) return;
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe?.();
                if (resp.content) resolve(resp.content);
                else reject(new Error(resp.error ?? 'Adapter-Fetch fehlgeschlagen'));
            } catch {
                /* ignore parse errors from unrelated state changes */
            }
        });
        // ttl tells the adapter how long its cache entry is considered fresh
        getSocket().emit('setState', `${NS}.calendar.request`, {
            val: JSON.stringify({ id, url, ttl: ttlSeconds }),
            ack: false,
        });
    });
}

/**
 * Fetch iCal text with one automatic retry on timeout.
 * On final failure writes to aura.0.calendar.clientError so the adapter can log it.
 */
async function fetchIcalText(url: string, ttlSeconds: number): Promise<string> {
    const MAX_ATTEMPTS = 2;
    let lastError: Error = new Error('Unknown error');
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            // Short pause before retry so a briefly unavailable adapter can recover
            await new Promise<void>((r) => setTimeout(r, 5000));
        }
        try {
            return await fetchIcalTextOnce(url, ttlSeconds);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // Only retry on timeout; propagate other errors (bad URL, HTTP error) immediately
            if (!lastError.message.startsWith('Timeout')) break;
        }
    }
    // Notify the adapter so it can write to the ioBroker log
    if (!import.meta.env.DEV) {
        setStateDirect(
            `${NS}.calendar.clientError`,
            `[${new Date().toISOString()}] ${lastError.message} – url: ${url}`,
        );
    }
    // Re-surface a user-friendly message
    if (lastError.message.startsWith('Timeout')) {
        throw new Error('Kalender-Fetch Timeout – Adapter läuft nicht oder erreichbar?');
    }
    throw lastError;
}

// ── helpers ────────────────────────────────────────────────────────────────

function pad(n: number) {
    return String(n).padStart(2, '0');
}

function isToday(d: Date) {
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function isTomorrow(d: Date) {
    const tm = new Date();
    tm.setDate(tm.getDate() + 1);
    return d.getFullYear() === tm.getFullYear() && d.getMonth() === tm.getMonth() && d.getDate() === tm.getDate();
}

type TFn = ReturnType<typeof useT>;

/** Absolute "weekday, day. month" label (no today/tomorrow substitution). */
function formatDayLabel(d: Date, t: TFn): string {
    const day = d.getDate();
    const month = t(`cal.month.${d.getMonth()}` as Parameters<TFn>[0]);
    const weekday = t(`cal.day.${d.getDay()}` as Parameters<TFn>[0]);
    return `${weekday}, ${day}. ${month}`;
}

function formatEventDate(event: CalEvent, t: TFn, showSpan = false): string {
    const d = event.start;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    let startLabel: string;
    if (isToday(d)) startLabel = event.allDay ? t('calendar.today') : t('calendar.todayAt', { time });
    else if (isTomorrow(d)) startLabel = event.allDay ? t('calendar.tomorrow') : t('calendar.tomorrowAt', { time });
    else startLabel = event.allDay ? formatDayLabel(d, t) : `${formatDayLabel(d, t)}, ${time}`;

    if (!showSpan || !isMultiDay(event)) return startLabel;

    const endDay = eventEndDay(event);
    if (!endDay) return startLabel;
    const endLabel = event.allDay
        ? formatDayLabel(endDay, t)
        : `${formatDayLabel(endDay, t)}, ${pad(endDay.getHours())}:${pad(endDay.getMinutes())}`;
    return `${startLabel} – ${endLabel}`;
}

/**
 * For a multi-day event that is currently in progress, returns a short badge
 * label: "läuft" on the last day, otherwise "noch N T" full days remaining.
 * Returns null if the event isn't multi-day, hasn't started, or is already over.
 */
function runningBadge(ev: CalEvent, t: TFn): string | null {
    if (!isMultiDay(ev)) return null;
    const now = new Date();
    if (ev.start > now) return null; // not started yet
    const endDay = eventEndDay(ev);
    if (!endDay) return null;
    const endInclusive = ev.allDay
        ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999)
        : (ev.end ?? endDay);
    if (endInclusive < now) return null; // already over
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last0 = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());
    const days = Math.round((last0.getTime() - today0.getTime()) / 86_400_000);
    return days <= 0 ? t('calendar.running') : t('calendar.daysLeft', { days });
}

function isUpcoming(event: CalEvent, daysAhead: number): boolean {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const end = event.end ?? event.start;
    return end >= now && event.start <= cutoff;
}

/**
 * Returns semantic flags and CSS class names for an event row.
 *
 * CSS hooks:
 *   .aura-cal-event              — every event row
 *   .aura-cal-event-today        — event that starts today
 *   .aura-cal-event-next         — the very next upcoming event (index 0)
 *   .aura-cal-source-icon        — the per-calendar icon of a row
 *   .aura-cal-week               — the calendar-week label of a row
 *
 * HTML data attributes:
 *   data-calendar-event="upcoming|today|next|today,next"
 *   data-calendar-week="first|repeat"  — "first" is the row the KW is printed on
 */
function eventMeta(ev: CalEventTagged, index: number) {
    const today = isToday(ev.start);
    const next = index === 0;
    const states = [today && 'today', next && 'next'].filter(Boolean) as string[];
    return {
        isToday: today,
        isNext: next,
        dataAttr: states.length ? states.join(',') : 'upcoming',
        className: ['aura-cal-event', today && 'aura-cal-event-today', next && 'aura-cal-event-next']
            .filter(Boolean)
            .join(' '),
    };
}

// ── shared sub-components ──────────────────────────────────────────────────

function Spinner({ loading }: { loading: boolean }) {
    return (
        <RefreshCw
            size={11}
            style={{
                color: 'var(--text-secondary)',
                animation: loading ? 'spin 1s linear infinite' : 'none',
                flexShrink: 0,
            }}
        />
    );
}

type MultiDayMode = 'off' | 'span' | 'badge' | 'both';

function getMultiDayMode(options: Record<string, unknown>): MultiDayMode {
    const m = options.multiDayDisplay;
    return m === 'off' || m === 'span' || m === 'badge' || m === 'both' ? m : 'both';
}

/**
 * Small pill shown for a currently-running multi-day event — or, once the run was
 * split into single days, which day of it this row is ("Tag 2/5"). Both share the
 * slot because a split part is no longer multi-day and would print nothing.
 */
function RunningBadge({ ev, t, color, fontSize }: { ev: CalEventTagged; t: TFn; color: string; fontSize: string }) {
    const label = ev.dayCount
        ? t('calendar.dayOfRun', { day: ev.dayIndex ?? 1, days: ev.dayCount })
        : runningBadge(ev, t);
    if (!label) return null;
    return (
        <span
            className="shrink-0 rounded whitespace-nowrap"
            style={{
                color,
                background: `${color}22`,
                fontSize,
                padding: '0 4px',
                lineHeight: 1.5,
                fontWeight: 600,
            }}
        >
            {label}
        </span>
    );
}

/**
 * The icon a calendar source carries, in the source's own colour. Renders nothing
 * when the source has none configured — the icon is opt-in per calendar.
 */
function CalSourceIcon({ ev, size, style }: { ev: CalEventTagged; size: number; style?: React.CSSProperties }) {
    if (!ev.sourceIcon) return null;
    const Icon = getWidgetIcon(ev.sourceIcon, CalendarDays);
    return (
        <Icon className="aura-cal-source-icon" size={size} style={{ color: ev.sourceColor, flexShrink: 0, ...style }} />
    );
}

/** "KW 36" for a date. */
function weekLabel(d: Date, t: TFn): string {
    return `${t('clock.kw')}${isoWeek(d)}`;
}

/**
 * Week-number column of the event lists. Only the first entry of a week carries
 * the label, the way a paper agenda writes it; the other rows keep an invisible
 * copy so every title still starts on the same edge.
 */
function CalWeek({
    label,
    show,
    fontSize,
    style,
}: {
    label: string;
    show: boolean;
    fontSize: string;
    style?: React.CSSProperties;
}) {
    return (
        <span
            className="aura-cal-week shrink-0 tabular-nums whitespace-nowrap font-medium"
            data-calendar-week={show ? 'first' : 'repeat'}
            style={{ color: 'var(--text-secondary)', fontSize, visibility: show ? undefined : 'hidden', ...style }}
        >
            {label}
        </span>
    );
}

/** Auto width of the agenda name column may take at most this share of the row. */
const CAL_NAME_MAX_SHARE = '45%';

/**
 * Calendar-name cell of the agenda layout. All cells end up the same width so
 * every event title starts on one edge.
 *
 * On auto width an invisible grid stack of *all* visible names sizes the cell:
 * grid children sharing one area make the grid as wide as its widest child, in
 * the real rendered font. That is exact – estimating from the character count
 * cuts off wide names, since the font is proportional. The actual name is laid
 * over that sizer. `widthPercent > 0` skips it and fixes the column instead.
 */
function AgendaCalName({
    name,
    allNames,
    color,
    fontSize,
    widthPercent,
}: {
    name: string;
    allNames: string[];
    color: string;
    fontSize: string;
    widthPercent: number;
}) {
    if (widthPercent > 0) {
        return (
            <span className="font-medium shrink-0 truncate" style={{ color, fontSize, width: `${widthPercent}%` }}>
                {name}
            </span>
        );
    }
    return (
        <span
            className="font-medium shrink-0 relative overflow-hidden"
            style={{ fontSize, maxWidth: CAL_NAME_MAX_SHARE }}
        >
            <span aria-hidden className="invisible grid">
                {allNames.map((n) => (
                    <span key={n} className="whitespace-nowrap" style={{ gridArea: '1 / 1' }}>
                        {n}
                    </span>
                ))}
            </span>
            <span className="absolute inset-0 truncate" style={{ color }}>
                {name}
            </span>
        </span>
    );
}

// ── widget ─────────────────────────────────────────────────────────────────

export function CalendarWidget({ config, onLastChange }: WidgetProps) {
    const t = useT();
    const popupAutoHeight = usePopupAutoHeight();
    const options = config.options ?? {};
    const refreshInterval = (options.refreshInterval as number) ?? 30;
    const maxEvents = (options.maxEvents as number) ?? 5;
    const daysAhead = (options.daysAhead as number) ?? 14;
    /** "Jeden Tag einzeln": a multi-day event becomes one entry per day. */
    const multiDaySplit = options.multiDaySplit === true;

    const showTitle = options.showTitle !== false;
    const showIcon = options.showIcon !== false;
    const iconSize = (options.iconSize as number) || 20;
    const titleAlign = (options.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(options.icon as string | undefined, CalendarDays);

    const [events, setEvents] = useState<CalEventTagged[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fetchingRef = useRef(false); // prevents concurrent fetches

    // stable key so fetchEvents only recreates when sources/daysAhead actually change

    const sourcesKey = JSON.stringify(options.calendars ?? (options.icalUrl ? [{ url: options.icalUrl }] : []));

    const fetchEvents = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        const opts = config.options ?? {};
        const srcs = getSources(opts).filter((s) => getSourceTarget(s));
        const dA = (opts.daysAhead as number) ?? 14;
        const ttl = ((opts.refreshInterval as number) ?? 30) * 60; // seconds
        if (srcs.length === 0) {
            setEvents([]);
            fetchingRef.current = false;
            return;
        }

        setLoading(true);
        setErrors([]);
        try {
            // Sequential fetches to avoid state race conditions on aura.0.calendar.response
            const all: CalEventTagged[] = [];
            const errs: string[] = [];
            // Expansion window: from just before now to the lookahead cutoff.
            // isUpcoming() applies the exact filter afterwards; this just bounds
            // how many recurring occurrences we materialise.
            const now = Date.now();
            const winStart = new Date(now - 2 * 86_400_000);
            const winEnd = new Date(now + dA * 86_400_000);
            // Tag events with their source; adapter rows may carry their own
            // calendar name, which wins when the source name is left blank.
            const tag = (evs: Array<CalEvent & { calName?: string }>, src: CalendarSource): CalEventTagged[] =>
                evs.map(({ calName, ...ev }) => ({
                    ...ev,
                    uid: `${src.id}:${ev.uid}`,
                    sourceId: src.id,
                    sourceName: src.name || calName || '',
                    sourceColor: src.color,
                    showSourceName: src.showName,
                    sourceIcon: src.icon || undefined,
                }));

            for (const src of srcs) {
                try {
                    if (src.type === 'adapter') {
                        // The ical adapter did the fetching and expanding already
                        const dp = (src.datapoint ?? '').trim();
                        const state = await getStateDirect(dp);
                        if (state?.val == null) throw new Error(`${dp}: kein Wert`);
                        all.push(...tag(parseAdapterTable(state.val, src.calFilter), src));
                    } else {
                        const text = await fetchIcalText(src.url, ttl);
                        all.push(...tag(expandRecurring(parseIcal(text), winStart, winEnd), src));
                    }
                } catch (err) {
                    errs.push(err instanceof Error ? err.message : String(err));
                }
            }

            // Split before filtering: a run that started last week still has days
            // inside the window, and isUpcoming() then prunes the days outside it.
            const rows = opts.multiDaySplit === true ? splitMultiDay(all) : all;
            const upcoming = rows
                .filter((e) => isUpcoming(e, dA))
                .sort((a, b) => a.start.getTime() - b.start.getTime());

            setEvents(upcoming);
            onLastChange?.(Date.now());
            if (errs.length > 0 && all.length === 0) setErrors(errs);
        } catch (err) {
            setErrors([String(err instanceof Error ? err.message : err)]);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourcesKey, daysAhead, multiDaySplit]);

    useEffect(() => {
        fetchEvents();
        if (timerRef.current) clearInterval(timerRef.current);
        if (refreshInterval > 0) {
            timerRef.current = setInterval(fetchEvents, refreshInterval * 60 * 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [fetchEvents, refreshInterval]);

    // Adapter sources update themselves – refresh as soon as their table changes
    useEffect(() => {
        const dps = [
            ...new Set(
                getSources(config.options ?? {})
                    .filter((s) => s.type === 'adapter')
                    .map((s) => (s.datapoint ?? '').trim())
                    .filter(Boolean),
            ),
        ];
        if (dps.length === 0) return;
        const unsubs = dps.map((dp) => subscribeStateDirect(dp, () => void fetchEvents()));
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourcesKey, fetchEvents]);

    // When all sources failed, retry every 45 s until one succeeds
    useEffect(() => {
        if (retryRef.current) {
            clearInterval(retryRef.current);
            retryRef.current = null;
        }
        if (errors.length > 0 && events.length === 0) {
            retryRef.current = setInterval(fetchEvents, 45_000);
        }
        return () => {
            if (retryRef.current) {
                clearInterval(retryRef.current);
                retryRef.current = null;
            }
        };
    }, [errors.length, events.length, fetchEvents]);

    const sources = getSources(options).filter((s) => getSourceTarget(s));
    // A single adapter source can carry several calendars, so the "more than one
    // calendar" gate looks at the event names instead of the source count.
    const multiCal = sources.length > 1 || new Set(events.map((e) => e.sourceName).filter(Boolean)).size > 1;
    const layout = config.layout ?? 'default';
    const calFontScale = (options.calFontScale as number) ?? 1;
    const multiDayMode = getMultiDayMode(options);
    const showSpan = multiDayMode === 'span' || multiDayMode === 'both';
    const showBadge = multiDayMode === 'badge' || multiDayMode === 'both';
    const highlightEnabled = options.highlightEnabled !== false;
    const highlightPriority = options.highlightPriority !== false;
    const highlightColor = (options.highlightColor as string) || '#f59e0b';
    const highlightKeywords: string[] = ((options.highlightKeywords as string) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const importantOnly = !!options.importantOnly && highlightEnabled;
    const hideImportantIcon = !!options.hideImportantIcon;
    const importantIconName = (options.importantIcon as string) || '';
    const ImportantIcon = importantIconName ? getWidgetIcon(importantIconName, Star) : Star;

    const fs = (px: number) => `calc(${px}px * var(--font-scale, 1) * ${calFontScale})`;
    const imp = (ev: CalEventTagged) => highlightEnabled && isImportant(ev, highlightKeywords, highlightPriority);

    const filteredEvents = importantOnly
        ? events.filter((ev) => isImportant(ev, highlightKeywords, highlightPriority))
        : events;
    const visibleEvents = filteredEvents.slice(0, maxEvents);

    // Event lists scroll when they outgrow the cell. Inside an auto-height
    // popup-view the list grows instead, so the dialog can fit every entry.
    // Agenda name column: 0 = auto (as wide as the widest name), else % of the row
    const calNameWidth = Math.max(0, Math.min(60, (options.calNameWidth as number) || 0));
    /** Per-calendar icons; each source still decides whether it has one at all. */
    const showCalIcon = options.showCalIcon !== false;
    /** Calendar week, printed at the first entry of every week. */
    const showWeek = options.showWeek === true;
    /** Which visible rows open a new calendar week — the ones that get the label. */
    const weekFirst = firstOfWeekFlags(visibleEvents.map((ev) => ev.start));

    // Widget option "Höhe automatisch an Inhalt anpassen" (mirrors Statusübersicht):
    // the widget grows with its content and the Dashboard sizes the grid item to the
    // measured height. The custom layout is excluded — CustomGridView is height:100%
    // and would collapse to 0 without a definite box.
    const contentAutoHeight = options.autoHeight === true && layout !== 'custom';
    const autoHeight = popupAutoHeight || contentAutoHeight;

    // Event rows bleed past the content column so the row background and the
    // "important" accent bar reach into the widget's padding gutter — capped at
    // that padding, so a small "Innenabstand der Widgets" never lets a row past
    // the card edge. With a fixed height the list is a scroll container, which
    // additionally clips the overhang on the left and shortens the content box on
    // the right by the reserved scrollbar gutter. See .aura-bleed-* in index.css,
    // which cancels out both and keeps the spacing even (#590).
    const listFillCls = autoHeight ? '' : 'aura-scroll aura-bleed-scroll flex-1 overflow-y-auto min-h-0';
    const listRootCls = autoHeight ? '' : 'h-full overflow-hidden';
    const eventRootCls = `aura-bleed-host ${autoHeight ? '' : 'aura-bleed-clip h-full overflow-hidden'}`;
    // The agenda rows are denser and overhang less than the default ones.
    const agendaBleed = { '--aura-bleed-max': '4px' } as React.CSSProperties;
    const rootHCls = autoHeight ? '' : 'h-full';
    // Empty/loading placeholders fill the box; with auto height they'd be razor-thin.
    const emptyCls = autoHeight ? 'py-2' : 'flex-1';

    // Publish the rendered content height so the Dashboard can size the grid item.
    // Only for the widget option — inside an auto-height popup the dialog measures the
    // embedded copy itself, and reporting there would resize the dashboard item too.
    const measureOn = contentAutoHeight && !popupAutoHeight;
    const widgetId = config.id;
    const roRef = useRef<ResizeObserver | null>(null);
    const measureRef = useCallback(
        (el: HTMLDivElement | null) => {
            if (roRef.current) {
                roRef.current.disconnect();
                roRef.current = null;
            }
            if (!el || !measureOn) {
                useAutoHeightStore.getState().clear(widgetId);
                return;
            }
            const report = () => useAutoHeightStore.getState().setHeight(widgetId, el.offsetHeight);
            report();
            const ro = new ResizeObserver(report);
            ro.observe(el);
            roRef.current = ro;
        },
        [measureOn, widgetId],
    );
    // No unmount effect on top of this: React calls the ref with null when the widget
    // goes away (disconnect + clear above), and a second clear from an effect cleanup
    // would wipe a height that the re-attached ref had just reported (StrictMode).

    // ── no sources configured ────────────────────────────────────────────────
    if (sources.length === 0) {
        return (
            <div ref={measureRef} className={`aura-widget-row flex flex-col ${rootHCls}`}>
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div
                    className={`flex flex-col items-center justify-center ${autoHeight ? 'py-4' : 'flex-1'} gap-2 text-center`}
                >
                    <CalendarDays size={22} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>{t('calendar.configure')}</p>
                </div>
            </div>
        );
    }

    // ── full error (all sources failed) ─────────────────────────────────────
    if (errors.length > 0 && events.length === 0) {
        return (
            <div ref={measureRef} className={`aura-widget-row flex flex-col gap-1.5 ${listRootCls}`}>
                <div className="flex items-center justify-between shrink-0 gap-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title font-medium truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-primary)',
                                    fontSize: fs(11),
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                    <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
                        <Spinner loading={loading} />
                    </button>
                </div>
                <div className={`flex items-start gap-1.5 ${autoHeight ? '' : 'flex-1 overflow-hidden'}`}>
                    <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-red)' }} />
                    <p className="leading-tight" style={{ color: 'var(--accent-red)', fontSize: fs(10) }}>
                        {errors[0]}
                    </p>
                </div>
            </div>
        );
    }

    if (layout === 'custom') {
        const next = visibleEvents[0];
        // Every visible event carries its own 1-based field set (summary1, date2, …)
        // so a grid can lay out a whole agenda — one grid row per event — the way the
        // Wetter widget exposes its forecast days. The unindexed keys stay what they
        // always were: aliases of event 1, so old grids keep working.
        const perEventFields: Record<string, string> = {};
        const perEventComponents: Record<string, React.ReactNode> = {};
        visibleEvents.forEach((ev, i) => {
            const n = i + 1;
            perEventFields[`summary${n}`] = ev.summary ?? '';
            perEventFields[`date${n}`] = formatEventDate(ev, t, showSpan);
            perEventFields[`time${n}`] = clockLabel(ev.start);
            perEventFields[`endtime${n}`] = endClockLabel(ev);
            perEventFields[`timespan${n}`] = timeSpanLabel(ev);
            perEventFields[`calname${n}`] = ev.sourceName ?? '';
            perEventFields[`location${n}`] = ev.location ?? '';
            // Same label the RunningBadge of the list layouts prints: which day of a
            // split run this is, or how much of a multi-day event is left.
            perEventFields[`running${n}`] = ev.dayCount
                ? t('calendar.dayOfRun', { day: ev.dayIndex ?? 1, days: ev.dayCount })
                : (runningBadge(ev, t) ?? '');
            perEventFields[`week${n}`] = String(isoWeek(ev.start));
            perEventFields[`kw${n}`] = weekLabel(ev.start, t);
            // Only the row that opens a calendar week carries this one, the way the
            // agenda layout prints it — "KW 36" on every row reads badly.
            perEventFields[`kwnew${n}`] = weekFirst[i] ? weekLabel(ev.start, t) : '';
            perEventFields[`day${n}`] = ev.dayIndex ? String(ev.dayIndex) : '';
            perEventFields[`daycount${n}`] = ev.dayCount ? String(ev.dayCount) : '';
            const SrcIcon = ev.sourceIcon ? getWidgetIcon(ev.sourceIcon, CalendarDays) : null;
            perEventComponents[`cal-icon${n}`] = SrcIcon ? (
                <SrcIcon size={20} style={{ color: ev.sourceColor ?? 'var(--accent)' }} />
            ) : null;
        });
        return (
            <CustomGridView
                config={config}
                value={next?.summary ?? ''}
                extraFields={{
                    summary: perEventFields.summary1 ?? '',
                    date: perEventFields.date1 ?? '',
                    time: perEventFields.time1 ?? '',
                    endtime: perEventFields.endtime1 ?? '',
                    timespan: perEventFields.timespan1 ?? '',
                    calname: perEventFields.calname1 ?? '',
                    location: perEventFields.location1 ?? '',
                    running: perEventFields.running1 ?? '',
                    count: String(visibleEvents.length),
                    week: perEventFields.week1 ?? '',
                    kw: perEventFields.kw1 ?? '',
                    day: perEventFields.day1 ?? '',
                    daycount: perEventFields.daycount1 ?? '',
                    ...perEventFields,
                }}
                extraComponents={{
                    icon: <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)' }} />,
                    'cal-icon': perEventComponents['cal-icon1'] ?? null,
                    ...perEventComponents,
                }}
            />
        );
    }

    // ── MINIMAL ──────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <div ref={measureRef} className={`aura-widget-row flex flex-col ${rootHCls}`}>
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div className={`flex flex-col items-center justify-center ${autoHeight ? 'py-2' : 'flex-1'} gap-1`}>
                    <p
                        className="font-black tabular-nums leading-none"
                        style={{ color: 'var(--accent)', fontSize: fs(30) }}
                    >
                        {loading ? '…' : visibleEvents.length}
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: fs(10) }}>{t('calendar.events')}</p>
                </div>
            </div>
        );
    }

    // ── COMPACT ──────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        const next = visibleEvents[0];
        const important = next ? imp(next) : false;
        const color = important ? highlightColor : (next?.sourceColor ?? 'var(--accent)');
        const meta = next ? eventMeta(next, 0) : null;
        const showCalName = options.showCalName !== false;
        const showDate = options.showDate !== false;
        return (
            <div
                ref={measureRef}
                className={`flex items-center gap-2 ${rootHCls}${meta ? ` ${meta.className}` : ''}`}
                data-calendar-event={meta?.dataAttr}
            >
                {important && !hideImportantIcon ? (
                    <ImportantIcon size={14} style={{ color, flexShrink: 0 }} />
                ) : (
                    <CalendarDays size={14} style={{ color, flexShrink: 0 }} />
                )}
                {showCalIcon && next && <CalSourceIcon ev={next} size={13} />}
                {showWeek && next && <CalWeek label={weekLabel(next.start, t)} show fontSize={fs(10)} />}
                {showCalName && next?.showSourceName && next.sourceName && (
                    <span className="shrink-0 font-medium" style={{ color: next.sourceColor, fontSize: fs(9) }}>
                        {next.sourceName}
                    </span>
                )}
                {loading && !next ? (
                    <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)', fontSize: fs(12) }}>
                        {t('calendar.loading')}
                    </span>
                ) : next ? (
                    <span
                        className="flex-1 font-medium truncate min-w-0"
                        style={{ color: important ? highlightColor : 'var(--text-primary)', fontSize: fs(12) }}
                    >
                        {next.summary}
                    </span>
                ) : (
                    <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)', fontSize: fs(12) }}>
                        {t('calendar.noEvents')}
                    </span>
                )}
                {showBadge && next && <RunningBadge ev={next} t={t} color={color} fontSize={fs(10)} />}
                {showDate && next && (
                    <span className="shrink-0" style={{ color, fontSize: fs(12) }}>
                        {formatEventDate(next, t, showSpan)}
                    </span>
                )}
                <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
                    <Spinner loading={loading} />
                </button>
            </div>
        );
    }

    // ── CARD ─────────────────────────────────────────────────────────────────
    if (layout === 'card') {
        const next = visibleEvents[0];
        const important = next ? imp(next) : false;
        const meta = next ? eventMeta(next, 0) : null;

        // Visibility options (all shown by default)
        const showCalName = options.showCalName !== false;
        const showSummary = options.showSummary !== false;
        const showDate = options.showDate !== false;
        const showLocation = options.showLocation !== false;
        const showMore = options.showMore !== false;

        return (
            <div ref={measureRef} className={`aura-widget-row flex flex-col ${rootHCls}`}>
                {/* header row */}
                <div className="flex items-center justify-between shrink-0 gap-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: fs(11),
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                    <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
                        <Spinner loading={loading} />
                    </button>
                </div>

                {/* centered content */}
                <div className={`${autoHeight ? 'py-1' : 'flex-1'} flex flex-col justify-center`}>
                    {next ? (
                        <div className={meta?.className} data-calendar-event={meta?.dataAttr}>
                            {(() => {
                                const nameShown = showCalName && next.showSourceName && !!next.sourceName;
                                const iconShown = showCalIcon && !!next.sourceIcon;
                                if (!nameShown && !iconShown && !showWeek) return null;
                                return (
                                    <div className="flex items-center gap-1" style={{ marginBottom: 2 }}>
                                        {iconShown && <CalSourceIcon ev={next} size={11} />}
                                        {nameShown && (
                                            <p style={{ color: next.sourceColor, fontSize: fs(9) }}>
                                                {next.sourceName}
                                            </p>
                                        )}
                                        {showWeek && <CalWeek label={weekLabel(next.start, t)} show fontSize={fs(9)} />}
                                    </div>
                                );
                            })()}
                            {showSummary && (
                                <p
                                    className="font-bold leading-tight"
                                    style={{ color: important ? highlightColor : 'var(--accent)', fontSize: fs(20) }}
                                >
                                    {important && !hideImportantIcon && (
                                        <ImportantIcon
                                            size={14}
                                            style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                                        />
                                    )}
                                    {next.summary}
                                </p>
                            )}
                            {(showDate || showBadge) && (
                                <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 2 }}>
                                    {showDate && (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>
                                            {formatEventDate(next, t, showSpan)}
                                        </p>
                                    )}
                                    {showBadge && (
                                        <RunningBadge
                                            ev={next}
                                            t={t}
                                            color={important ? highlightColor : next.sourceColor}
                                            fontSize={fs(10)}
                                        />
                                    )}
                                </div>
                            )}
                            {showLocation && next.location && (
                                <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                                    <MapPin size={10} style={{ color: 'var(--text-secondary)' }} />
                                    <p
                                        className="truncate"
                                        style={{ color: 'var(--text-secondary)', fontSize: fs(10) }}
                                    >
                                        {next.location}
                                    </p>
                                </div>
                            )}
                            {showMore && visibleEvents.length > 1 && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: fs(10), marginTop: 6 }}>
                                    {t('calendar.more', { count: visibleEvents.length - 1 })}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="font-bold" style={{ color: 'var(--text-secondary)', fontSize: fs(18) }}>
                            {t('calendar.noEvents')}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── AGENDA ───────────────────────────────────────────────────────────────
    if (layout === 'agenda') {
        return (
            <div ref={measureRef} className={`aura-widget-row flex flex-col gap-1 ${eventRootCls}`} style={agendaBleed}>
                <div className="flex items-center justify-between shrink-0 mb-0.5 gap-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title font-medium truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: fs(11),
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                    <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
                        <Spinner loading={loading} />
                    </button>
                </div>
                {loading && events.length === 0 ? (
                    <div className={`${emptyCls} flex items-center justify-center`}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>{t('calendar.loading')}</p>
                    </div>
                ) : visibleEvents.length === 0 ? (
                    <div className={`${emptyCls} flex items-center justify-center`}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>{t('calendar.noEvents')}</p>
                    </div>
                ) : (
                    <div className={`${listFillCls} flex flex-col gap-0.5`}>
                        {(() => {
                            const showCalName = options.showCalName !== false;
                            const showDate = options.showDate !== false;
                            // Every visible name – sizes the shared name column so the
                            // titles line up however uneven the names are.
                            const calNames = showCalName
                                ? [
                                      ...new Set(
                                          visibleEvents
                                              .filter((ev) => ev.showSourceName && ev.sourceName)
                                              .map((ev) => ev.sourceName),
                                      ),
                                  ]
                                : [];
                            return visibleEvents.map((ev, idx) => {
                                const meta = eventMeta(ev, idx);
                                const important = imp(ev);
                                return (
                                    <div
                                        key={ev.uid}
                                        className={`${meta.className} aura-bleed-row flex items-center gap-2 min-h-0 shrink-0 py-0.5 rounded px-1 transition-colors`}
                                        data-calendar-event={meta.dataAttr}
                                        style={{
                                            background: important
                                                ? `${highlightColor}18`
                                                : meta.isToday || meta.isNext
                                                  ? `${ev.sourceColor}18`
                                                  : undefined,
                                            ...(important
                                                ? { borderLeft: `2px solid ${highlightColor}`, paddingLeft: 4 }
                                                : {}),
                                        }}
                                    >
                                        <div
                                            className="self-stretch rounded-full shrink-0 transition-all"
                                            style={{
                                                width: meta.isNext ? 3 : 2,
                                                background: important ? highlightColor : ev.sourceColor,
                                            }}
                                        />
                                        {showCalIcon && <CalSourceIcon ev={ev} size={11} />}
                                        {showWeek && (
                                            <CalWeek
                                                label={weekLabel(ev.start, t)}
                                                show={weekFirst[idx]}
                                                fontSize={fs(9)}
                                            />
                                        )}
                                        {showCalName && ev.showSourceName && ev.sourceName && (
                                            <AgendaCalName
                                                name={ev.sourceName}
                                                allNames={calNames}
                                                color={ev.sourceColor}
                                                fontSize={fs(9)}
                                                widthPercent={calNameWidth}
                                            />
                                        )}
                                        <p
                                            className="flex-1 truncate min-w-0"
                                            style={{
                                                color: important ? highlightColor : 'var(--text-primary)',
                                                fontWeight: important || meta.isNext ? 700 : 500,
                                                fontSize: fs(11),
                                            }}
                                        >
                                            {important && !hideImportantIcon && (
                                                <ImportantIcon
                                                    size={9}
                                                    style={{
                                                        display: 'inline',
                                                        marginRight: 3,
                                                        verticalAlign: 'middle',
                                                    }}
                                                />
                                            )}
                                            {ev.summary}
                                        </p>
                                        {showBadge && (
                                            <RunningBadge
                                                ev={ev}
                                                t={t}
                                                color={important ? highlightColor : ev.sourceColor}
                                                fontSize={fs(9)}
                                            />
                                        )}
                                        {showDate && (
                                            <p
                                                className="shrink-0 tabular-nums"
                                                style={{
                                                    color: meta.isToday ? ev.sourceColor : 'var(--text-secondary)',
                                                    fontWeight: meta.isNext ? 600 : 400,
                                                    fontSize: fs(10),
                                                }}
                                            >
                                                {formatEventDate(ev, t, showSpan)}
                                            </p>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
            </div>
        );
    }

    // ── DEFAULT ──────────────────────────────────────────────────────────────
    return (
        <div ref={measureRef} className={`aura-widget-row flex flex-col gap-1.5 ${eventRootCls}`}>
            <div className="flex items-center justify-between shrink-0 gap-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title font-medium truncate flex-1 min-w-0"
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: fs(11),
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
                <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
                    <Spinner loading={loading} />
                </button>
            </div>

            {loading && events.length === 0 ? (
                <div className={`${emptyCls} flex items-center justify-center`}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>Lädt…</p>
                </div>
            ) : visibleEvents.length === 0 ? (
                <div className={`${emptyCls} flex items-center justify-center`}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: fs(11) }}>
                        {t('calendar.noDays', { days: daysAhead })}
                    </p>
                </div>
            ) : (
                <div className={`${listFillCls} flex flex-col gap-1`}>
                    {(() => {
                        const showCalName = options.showCalName !== false;
                        const showDate = options.showDate !== false;
                        const showLocation = options.showLocation !== false;
                        return visibleEvents.map((ev, idx) => {
                            const meta = eventMeta(ev, idx);
                            const important = imp(ev);
                            return (
                                <div
                                    key={ev.uid}
                                    className={`${meta.className} aura-bleed-row flex items-start gap-2 min-h-0 shrink-0 rounded-lg px-1.5 py-0.5 transition-colors`}
                                    data-calendar-event={meta.dataAttr}
                                    style={{
                                        background: important
                                            ? `${highlightColor}18`
                                            : meta.isToday || meta.isNext
                                              ? `${ev.sourceColor}18`
                                              : undefined,
                                        // Border plus padding add up to the px-1.5 of a
                                        // normal row, so the accent bar widens the row
                                        // inwards and every summary stays on one column.
                                        ...(important
                                            ? {
                                                  borderLeft: `2px solid ${highlightColor}`,
                                                  paddingLeft: 4,
                                              }
                                            : {}),
                                    }}
                                >
                                    {meta.isNext ? (
                                        <div
                                            className="mt-1.5 shrink-0 w-2 h-2 rounded-full"
                                            style={{
                                                background: important ? highlightColor : ev.sourceColor,
                                                boxShadow: `0 0 0 1.5px var(--app-surface), 0 0 0 3px ${important ? highlightColor : ev.sourceColor}`,
                                            }}
                                        />
                                    ) : (
                                        <div
                                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                                            style={{ background: important ? highlightColor : ev.sourceColor }}
                                        />
                                    )}
                                    {showCalIcon && <CalSourceIcon ev={ev} size={12} style={{ marginTop: 2 }} />}
                                    {showWeek && (
                                        <CalWeek
                                            label={weekLabel(ev.start, t)}
                                            show={weekFirst[idx]}
                                            fontSize={fs(9)}
                                            style={{ marginTop: 2 }}
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        {showCalName && ev.showSourceName && ev.sourceName && multiCal && (
                                            <p style={{ color: ev.sourceColor, fontSize: fs(9) }}>{ev.sourceName}</p>
                                        )}
                                        <p
                                            className="leading-tight truncate"
                                            style={{
                                                color: important ? highlightColor : 'var(--text-primary)',
                                                fontWeight: important || meta.isNext ? 700 : 500,
                                                fontSize: fs(11),
                                            }}
                                        >
                                            {important && !hideImportantIcon && (
                                                <ImportantIcon
                                                    size={9}
                                                    style={{
                                                        display: 'inline',
                                                        marginRight: 3,
                                                        verticalAlign: 'middle',
                                                    }}
                                                />
                                            )}
                                            {ev.summary}
                                        </p>
                                        {(showDate || showBadge) && (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {showDate && (
                                                    <p
                                                        style={{
                                                            color: meta.isToday
                                                                ? ev.sourceColor
                                                                : 'var(--text-secondary)',
                                                            fontWeight: meta.isToday ? 500 : 400,
                                                            fontSize: fs(10),
                                                        }}
                                                    >
                                                        {formatEventDate(ev, t, showSpan)}
                                                    </p>
                                                )}
                                                {showBadge && (
                                                    <RunningBadge
                                                        ev={ev}
                                                        t={t}
                                                        color={important ? highlightColor : ev.sourceColor}
                                                        fontSize={fs(9)}
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {showLocation && ev.location && (
                                            <div className="flex items-center gap-0.5">
                                                <MapPin size={8} style={{ color: 'var(--text-secondary)' }} />
                                                <p
                                                    className="truncate"
                                                    style={{ color: 'var(--text-secondary)', fontSize: fs(9) }}
                                                >
                                                    {ev.location}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}
        </div>
    );
}
