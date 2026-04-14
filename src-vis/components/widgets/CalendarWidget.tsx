import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, CalendarDays, MapPin, AlertCircle } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { getSocket, subscribeStateDirect } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';

// ── CalendarSource ─────────────────────────────────────────────────────────

export interface CalendarSource {
  id: string;
  url: string;
  name: string;
  color: string;
  showName: boolean;
}

export const DEFAULT_CAL_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export function getSources(options: Record<string, unknown>): CalendarSource[] {
  if (Array.isArray(options.calendars) && (options.calendars as CalendarSource[]).length > 0) {
    return options.calendars as CalendarSource[];
  }
  // backward compat: single icalUrl
  if (options.icalUrl) {
    return [{
      id: 'legacy',
      url: options.icalUrl as string,
      name: 'Kalender',
      color: DEFAULT_CAL_COLORS[0],
      showName: true,
    }];
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
}

interface CalEventTagged extends CalEvent {
  sourceId: string;
  sourceName: string;
  sourceColor: string;
  showSourceName: boolean;
}

function parseIcalDate(raw: string): Date {
  const v = raw.trim();
  if (v.length === 8) {
    return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
  }
  const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
  const h = +v.slice(9, 11), mi = +v.slice(11, 13), s = +v.slice(13, 15);
  return v.endsWith('Z')
    ? new Date(Date.UTC(y, mo, d, h, mi, s))
    : new Date(y, mo, d, h, mi, s);
}

function parseIcal(text: string): CalEvent[] {
  const unfolded = text.replace(/\r\n([ \t])/g, '$1').replace(/\n([ \t])/g, '$1');
  const lines = unfolded.split(/\r?\n/);
  const events: CalEvent[] = [];
  let inEvent = false;
  let cur: Partial<CalEvent> & { uid: string } = { uid: '' };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { inEvent = true; cur = { uid: String(Math.random()), allDay: false }; continue; }
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
    else if (key === 'DTSTART') { cur.allDay = !value.includes('T'); try { cur.start = parseIcalDate(value); } catch { /* skip */ } }
    else if (key === 'DTEND') { try { cur.end = parseIcalDate(value); } catch { /* skip */ } }
  }
  return events;
}

// ── fetch ──────────────────────────────────────────────────────────────────

// Fetch iCal via the adapter's state-based relay:
//   frontend writes {id, url} → aura.0.calendar.request
//   adapter fetches URL, writes {id, content|error} → aura.0.calendar.response
//   frontend subscriber matches by id and resolves/rejects
async function fetchIcalText(url: string): Promise<string> {
  if (import.meta.env.DEV) {
    const res = await fetch(`/proxy/ical?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        reject(new Error('Kalender-Fetch Timeout (20s) – Adapter läuft nicht oder erreichbar?'));
      }
    }, 20000);
    const unsubscribe = subscribeStateDirect('aura.0.calendar.response', (state) => {
      if (!state?.val) return;
      try {
        const resp = JSON.parse(String(state.val)) as { id?: string; content?: string; error?: string };
        if (resp.id !== id) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        if (resp.content) resolve(resp.content);
        else reject(new Error(resp.error ?? 'Adapter-Fetch fehlgeschlagen'));
      } catch { /* ignore parse errors from unrelated state changes */ }
    });
    // Write request – triggers adapter onStateChange
    getSocket().emit('setState', 'aura.0.calendar.request', { val: JSON.stringify({ id, url }), ack: false });
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function isToday(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function isTomorrow(d: Date) {
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  return d.getFullYear() === tm.getFullYear() && d.getMonth() === tm.getMonth() && d.getDate() === tm.getDate();
}

type TFn = ReturnType<typeof useT>;

function formatEventDate(event: CalEvent, t: TFn): string {
  const d = event.start;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isToday(d)) return event.allDay ? t('calendar.today') : t('calendar.todayAt', { time });
  if (isTomorrow(d)) return event.allDay ? t('calendar.tomorrow') : t('calendar.tomorrowAt', { time });
  const day = d.getDate();
  const month = t(`cal.month.${d.getMonth()}` as Parameters<TFn>[0]);
  const weekday = t(`cal.day.${d.getDay()}` as Parameters<TFn>[0]);
  if (event.allDay) return `${weekday}, ${day}. ${month}`;
  return `${weekday}, ${day}. ${month}, ${time}`;
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
 *
 * HTML data attribute:
 *   data-calendar-event="upcoming|today|next|today,next"
 */
function eventMeta(ev: CalEventTagged, index: number) {
  const today = isToday(ev.start);
  const next  = index === 0;
  const states = [today && 'today', next && 'next'].filter(Boolean) as string[];
  return {
    isToday:   today,
    isNext:    next,
    dataAttr:  states.length ? states.join(',') : 'upcoming',
    className: ['aura-cal-event', today && 'aura-cal-event-today', next && 'aura-cal-event-next'].filter(Boolean).join(' '),
  };
}

// ── shared sub-components ──────────────────────────────────────────────────

function Spinner({ loading }: { loading: boolean }) {
  return (
    <RefreshCw size={11} style={{
      color: 'var(--text-secondary)',
      animation: loading ? 'spin 1s linear infinite' : 'none',
      flexShrink: 0,
    }} />
  );
}

// ── widget ─────────────────────────────────────────────────────────────────

export function CalendarWidget({ config }: WidgetProps) {
  const t = useT();
  const options = config.options ?? {};
  const refreshInterval = (options.refreshInterval as number) ?? 30;
  const maxEvents = (options.maxEvents as number) ?? 5;
  const daysAhead = (options.daysAhead as number) ?? 14;

  const [events, setEvents] = useState<CalEventTagged[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // stable key so fetchEvents only recreates when sources/daysAhead actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sourcesKey = JSON.stringify((options.calendars ?? (options.icalUrl ? [{ url: options.icalUrl }] : [])));

  const fetchEvents = useCallback(async () => {
    const opts = config.options ?? {};
    const srcs = getSources(opts);
    const dA = (opts.daysAhead as number) ?? 14;
    if (srcs.length === 0) { setEvents([]); return; }

    setLoading(true);
    setErrors([]);
    try {
      // Sequential fetches to avoid state race conditions on aura.0.calendar.response
      const all: CalEventTagged[] = [];
      const errs: string[] = [];
      for (const src of srcs) {
        try {
          const text = await fetchIcalText(src.url);
          const parsed = parseIcal(text).map((ev): CalEventTagged => ({
            ...ev,
            uid: `${src.id}:${ev.uid}`,
            sourceId: src.id,
            sourceName: src.name,
            sourceColor: src.color,
            showSourceName: src.showName,
          }));
          all.push(...parsed);
        } catch (err) {
          errs.push(err instanceof Error ? err.message : String(err));
        }
      }

      const upcoming = all
        .filter((e) => isUpcoming(e, dA))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      setEvents(upcoming);
      setLastUpdated(new Date());
      if (errs.length > 0 && all.length === 0) setErrors(errs);
    } catch (err) {
      setErrors([String(err instanceof Error ? err.message : err)]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, daysAhead]);

  useEffect(() => {
    fetchEvents();
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) {
      timerRef.current = setInterval(fetchEvents, refreshInterval * 60 * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchEvents, refreshInterval]);

  const sources = getSources(options);
  const layout = config.layout ?? 'default';
  const visibleEvents = events.slice(0, maxEvents);

  // ── no sources configured ────────────────────────────────────────────────
  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
        <CalendarDays size={22} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.configure')}</p>
      </div>
    );
  }

  // ── full error (all sources failed) ─────────────────────────────────────
  if (errors.length > 0 && events.length === 0) {
    return (
      <div className="flex flex-col h-full gap-1.5 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{config.title}</p>
          <button onClick={fetchEvents} className="hover:opacity-70 shrink-0"><Spinner loading={loading} /></button>
        </div>
        <div className="flex items-start gap-1.5 flex-1 overflow-hidden">
          <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-red)' }} />
          <p className="text-[10px] leading-tight" style={{ color: 'var(--accent-red)' }}>{errors[0]}</p>
        </div>
      </div>
    );
  }

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <p className="text-3xl font-black tabular-nums leading-none" style={{ color: 'var(--accent)' }}>
          {loading ? '…' : visibleEvents.length}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.events')}</p>
      </div>
    );
  }

  // ── COMPACT ──────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    const next = visibleEvents[0];
    const color = next?.sourceColor ?? 'var(--accent)';
    const meta = next ? eventMeta(next, 0) : null;
    return (
      <div
        className={`flex items-center gap-2.5 h-full${meta ? ` ${meta.className}` : ''}`}
        data-calendar-event={meta?.dataAttr}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: color + '22' }}>
          <CalendarDays size={16} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          {loading && !next
            ? <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('calendar.loading')}</p>
            : next ? (
              <>
                <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{next.summary}</p>
                <p className="text-[10px]" style={{ color }}>{formatEventDate(next, t)}</p>
              </>
            ) : <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.noEvents')}</p>
          }
        </div>
        <button onClick={fetchEvents} className="hover:opacity-70 shrink-0"><Spinner loading={loading} /></button>
      </div>
    );
  }

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    const next = visibleEvents[0];
    const color = next?.sourceColor ?? 'var(--accent)';
    const meta = next ? eventMeta(next, 0) : null;
    return (
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-center justify-between shrink-0">
          <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          <button onClick={fetchEvents} className="hover:opacity-70 shrink-0"><Spinner loading={loading} /></button>
        </div>
        {next ? (
          <div
            className={meta?.className}
            data-calendar-event={meta?.dataAttr}
          >
            {next.showSourceName && (
              <p className="text-[9px] mb-0.5" style={{ color: next.sourceColor }}>{next.sourceName}</p>
            )}
            <p className="text-xl font-bold leading-tight" style={{ color }}>{next.summary}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{formatEventDate(next, t)}</p>
            {next.location && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin size={10} style={{ color: 'var(--text-secondary)' }} />
                <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{next.location}</p>
              </div>
            )}
            {visibleEvents.length > 1 && (
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>{t('calendar.more', { count: visibleEvents.length - 1 })}</p>
            )}
          </div>
        ) : (
          <p className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>{t('calendar.noEvents')}</p>
        )}
      </div>
    );
  }

  // ── AGENDA ───────────────────────────────────────────────────────────────
  if (layout === 'agenda') {
    return (
      <div className="flex flex-col h-full gap-1 overflow-hidden">
        <div className="flex items-center justify-between shrink-0 mb-0.5">
          <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          <button onClick={fetchEvents} className="hover:opacity-70 shrink-0"><Spinner loading={loading} /></button>
        </div>
        {loading && events.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.loading')}</p>
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.noEvents')}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-0.5 min-h-0">
            {visibleEvents.map((ev, idx) => {
              const meta = eventMeta(ev, idx);
              return (
                <div
                  key={ev.uid}
                  className={`${meta.className} flex items-center gap-2 min-h-0 shrink-0 py-0.5 rounded px-1 -mx-1 transition-colors`}
                  data-calendar-event={meta.dataAttr}
                  style={meta.isToday || meta.isNext ? { background: ev.sourceColor + '18' } : undefined}
                >
                  {/* calendar color bar — thicker for next event */}
                  <div
                    className="self-stretch rounded-full shrink-0 transition-all"
                    style={{ width: meta.isNext ? 3 : 2, background: ev.sourceColor }}
                  />
                  {/* calendar name */}
                  {ev.showSourceName && (
                    <span className="text-[9px] font-medium shrink-0 w-14 truncate" style={{ color: ev.sourceColor }}>
                      {ev.sourceName}
                    </span>
                  )}
                  {/* event title */}
                  <p
                    className="flex-1 text-[11px] truncate min-w-0"
                    style={{
                      color: 'var(--text-primary)',
                      fontWeight: meta.isNext ? 700 : 500,
                    }}
                  >
                    {ev.summary}
                  </p>
                  {/* date/time */}
                  <p
                    className="text-[10px] shrink-0 tabular-nums"
                    style={{ color: meta.isToday ? ev.sourceColor : 'var(--text-secondary)', fontWeight: meta.isNext ? 600 : 400 }}
                  >
                    {formatEventDate(ev, t)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {lastUpdated && (
          <p className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
            {pad(lastUpdated.getHours())}:{pad(lastUpdated.getMinutes())}
          </p>
        )}
      </div>
    );
  }

  // ── DEFAULT ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-1.5 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        <button onClick={fetchEvents} className="hover:opacity-70 shrink-0">
          <Spinner loading={loading} />
        </button>
      </div>

      {loading && events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Lädt…</p>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('calendar.noDays', { days: daysAhead })}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col gap-1 min-h-0">
          {visibleEvents.map((ev, idx) => {
            const meta = eventMeta(ev, idx);
            return (
              <div
                key={ev.uid}
                className={`${meta.className} flex items-start gap-2 min-h-0 shrink-0 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors`}
                data-calendar-event={meta.dataAttr}
                style={meta.isToday || meta.isNext ? { background: ev.sourceColor + '18' } : undefined}
              >
                {/* color indicator dot — larger/solid ring for next event */}
                {meta.isNext ? (
                  <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full"
                    style={{
                      background: ev.sourceColor,
                      boxShadow: `0 0 0 1.5px var(--app-surface), 0 0 0 3px ${ev.sourceColor}`,
                    }}
                  />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: ev.sourceColor }} />
                )}
                <div className="flex-1 min-w-0">
                  {ev.showSourceName && sources.length > 1 && (
                    <p className="text-[9px]" style={{ color: ev.sourceColor }}>{ev.sourceName}</p>
                  )}
                  <p
                    className="text-[11px] leading-tight truncate"
                    style={{ color: 'var(--text-primary)', fontWeight: meta.isNext ? 700 : 500 }}
                  >
                    {ev.summary}
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: meta.isToday ? ev.sourceColor : 'var(--text-secondary)', fontWeight: meta.isToday ? 500 : 400 }}
                  >
                    {formatEventDate(ev, t)}
                  </p>
                  {ev.location && (
                    <div className="flex items-center gap-0.5">
                      <MapPin size={8} style={{ color: 'var(--text-secondary)' }} />
                      <p className="text-[9px] truncate" style={{ color: 'var(--text-secondary)' }}>{ev.location}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastUpdated && (
        <p className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
          {t('calendar.updated', { time: `${pad(lastUpdated.getHours())}:${pad(lastUpdated.getMinutes())}` })}
        </p>
      )}
    </div>
  );
}
