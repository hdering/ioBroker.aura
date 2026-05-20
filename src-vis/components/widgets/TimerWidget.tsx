/**
 * Zeitschaltuhr-Widget (timer / scheduler).
 *
 * The widget config (events list, master enabled) lives in WidgetConfig.options
 * and is mirrored on save to two ioBroker states (publishTimerConfig.ts), which
 * the adapter watches to run a 30-second tick scheduler in main.js.
 *
 * Display:
 *   - status icon (grey = unconfigured, slate = master off, orange = master on
 *     but no enabled events, green = at least one event armed)
 *   - title + master switch
 *   - compact list of up to N events (weekday chips, trigger preview, target DP)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Timer, Sun, Sunset, Sunrise, Moon, CalendarRange, Clock, Plus, Pencil } from 'lucide-react';
import type { WidgetProps, TimerEvent, TimerWeekday, TimerTrigger } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import {
  publishTimerConfig,
  publishTimerEnabled,
  type TimerConfigPayload,
} from '../../utils/publishTimerConfig';
import { TimerEventModal } from './TimerEventModal';

function newEvent(): TimerEvent {
  return {
    id:       `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled:  true,
    label:    '',
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    trigger:  { kind: 'time', hour: 8, minute: 0 },
    filter:   'all-days',
  };
}

const WEEKDAY_LABEL_SHORT: Record<TimerWeekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
};
const WEEKDAY_ORDER: TimerWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function formatTrigger(t: TimerTrigger): string {
  switch (t.kind) {
    case 'time':
      return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    case 'astro': {
      const symbol = t.event === 'sunrise' ? '☀↑'
        : t.event === 'sunset' ? '☀↓'
        : t.event === 'dawn'   ? '🌄'
        : t.event === 'dusk'   ? '🌆'
        : '☀';
      const sign = t.offsetMin >= 0 ? '+' : '−';
      const mag  = Math.abs(t.offsetMin);
      return mag === 0 ? symbol : `${symbol} ${sign}${mag}m`;
    }
    case 'once': {
      try {
        const d = new Date(t.iso);
        return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return t.iso; }
    }
    case 'range': {
      try {
        const f = new Date(t.fromIso);
        const to = new Date(t.toIso);
        const fmt = (d: Date) => d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `${fmt(f)} – ${fmt(to)}`;
      } catch { return `${t.fromIso}…${t.toIso}`; }
    }
  }
}

function TriggerIcon({ trigger, size = 12 }: { trigger: TimerTrigger; size?: number }) {
  if (trigger.kind === 'time')  return <Clock size={size} />;
  if (trigger.kind === 'once')  return <CalendarRange size={size} />;
  if (trigger.kind === 'range') return <CalendarRange size={size} />;
  // astro
  if (trigger.event === 'sunrise') return <Sunrise size={size} />;
  if (trigger.event === 'sunset')  return <Sunset size={size} />;
  if (trigger.event === 'dawn')    return <Sunrise size={size} />;
  if (trigger.event === 'dusk')    return <Moon size={size} />;
  return <Sun size={size} />;
}

function statusColor(masterEnabled: boolean, events: TimerEvent[], hasTarget: boolean): string {
  if (!hasTarget)                 return 'var(--text-secondary)';   // grey — admin hasn't set target yet
  if (events.length === 0)        return 'var(--text-secondary)';   // grey — no events
  const armed = events.some((e) => e.enabled && e.weekdays.length > 0);
  if (!masterEnabled)             return '#64748b';                  // slate — master off
  if (!armed)                     return '#f59e0b';                  // orange — master on but no active event
  return 'var(--accent-green)';                                      // green — armed and active
}

function weekdaysText(wd: TimerWeekday[]): string {
  if (wd.length === 0) return '—';
  if (wd.length === 7) return 'täglich';
  // Mo-Fr block?
  const set = new Set(wd);
  const isWeekdaysOnly = ['mon','tue','wed','thu','fri'].every((d) => set.has(d as TimerWeekday)) && !set.has('sat') && !set.has('sun');
  if (isWeekdaysOnly) return 'Mo–Fr';
  const isWeekendOnly = set.has('sat') && set.has('sun') && wd.length === 2;
  if (isWeekendOnly) return 'Sa+So';
  return WEEKDAY_ORDER.filter((d) => set.has(d)).map((d) => WEEKDAY_LABEL_SHORT[d]).join(' ');
}

export function TimerWidget({ config, onConfigChange }: WidgetProps) {
  const o = (config.options ?? {}) as Record<string, unknown>;
  const events       = (o.events as TimerEvent[] | undefined)        ?? [];
  const masterEnabled = (o.enabled as boolean | undefined)          ?? true;
  const targetDp     = o.targetDp   as string | undefined;
  const targetValue  = o.value      as string | undefined;
  const holidaysDp   = o.holidaysDp as string | undefined;
  const vacationDp   = o.vacationDp as string | undefined;
  const showTitle    = o.showTitle !== false;
  const showIcon     = o.showIcon  !== false;
  const titleAlign   = (o.titleAlign as string) ?? 'left';
  const iconSize     = (o.iconSize as number) || 20;
  const WidgetIcon   = getWidgetIcon(o.icon as string | undefined, Timer);
  const posClass     = contentPositionClass(o.contentPosition as string | undefined);

  const hasTarget = !!targetDp;
  const statusCol = statusColor(masterEnabled, events, hasTarget);
  const enabledCount = events.filter((e) => e.enabled && e.weekdays.length > 0).length;

  // ── Mirror config to backend DPs whenever it changes ──────────────────────
  // The adapter scheduler subscribes to aura.0.timers.<widgetId>.{config,enabled}.
  const lastPublishedRef = useRef<string>('');
  useEffect(() => {
    if (!config.id) return;
    const payload: TimerConfigPayload = {
      events,
      targetDp,
      value: targetValue,
      holidaysDp,
      vacationDp,
      title: config.title,
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPublishedRef.current) {
      publishTimerConfig(config.id, config.title || 'Zeitschaltuhr', payload);
      lastPublishedRef.current = serialized;
    }
  }, [config.id, config.title, events, targetDp, targetValue, holidaysDp, vacationDp]);

  const lastEnabledRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!config.id) return;
    if (lastEnabledRef.current !== masterEnabled) {
      publishTimerEnabled(config.id, config.title || 'Zeitschaltuhr', masterEnabled);
      lastEnabledRef.current = masterEnabled;
    }
  }, [config.id, config.title, masterEnabled]);

  // Persist stateBaseId in options so other tools can find the scheduler DPs.
  useLayoutEffect(() => {
    const expected = `aura.0.timers.${config.id}`;
    if (o.stateBaseId !== expected) {
      onConfigChange({ ...config, options: { ...o, stateBaseId: expected } });
    }
  }, [config.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMaster = () => {
    onConfigChange({ ...config, options: { ...o, enabled: !masterEnabled } });
  };

  const toggleEvent = (eventId: string) => {
    const next = events.map((e) => e.id === eventId ? { ...e, enabled: !e.enabled } : e);
    onConfigChange({ ...config, options: { ...o, events: next } });
  };

  // ── Modal state ─────────────────────────────────────────────────────────────
  // editing === null: closed; editing === 'new': adding new; otherwise the event being edited
  const [editing, setEditing] = useState<TimerEvent | 'new' | null>(null);

  const saveFromModal = (ev: TimerEvent) => {
    if (editing === 'new') {
      onConfigChange({ ...config, options: { ...o, events: [...events, ev] } });
    } else {
      onConfigChange({ ...config, options: { ...o, events: events.map((x) => x.id === ev.id ? ev : x) } });
    }
    setEditing(null);
  };

  const deleteFromModal = () => {
    if (editing && editing !== 'new') {
      onConfigChange({ ...config, options: { ...o, events: events.filter((x) => x.id !== editing.id) } });
    }
    setEditing(null);
  };

  const layout = config.layout ?? 'default';
  const isCompact = layout === 'compact';
  const visibleEvents = events.slice(0, isCompact ? 2 : 4);
  const hiddenCount   = events.length - visibleEvents.length;

  // ── Compact layout: one-line header + tight event list ─────────────────────
  if (isCompact) {
    return (
      <div className={`flex flex-col h-full gap-1 ${posClass}`}>
        <div className="flex items-center gap-1.5">
          {showIcon && <WidgetIcon size={14} style={{ color: statusCol, flexShrink: 0 }} />}
          {showTitle && (
            <p className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
              {config.title}
            </p>
          )}
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {events.length === 0 ? '—' : `${enabledCount}/${events.length}`}
          </span>
          <button onClick={toggleMaster}
            className="nodrag relative w-8 h-4 rounded-full transition-colors shrink-0"
            style={{ background: masterEnabled ? 'var(--accent-green)' : 'var(--app-border)' }}>
            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
              style={{ left: masterEnabled ? '18px' : '2px' }} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col gap-0.5">
          {visibleEvents.map((ev) => (
            <button key={ev.id} onClick={() => setEditing(ev)}
              className="nodrag flex items-center gap-1 text-[10px] text-left hover:opacity-80"
              style={{ color: 'var(--text-primary)' }}>
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: ev.enabled && masterEnabled ? 'var(--accent-green)' : 'var(--app-border)' }} />
              <TriggerIcon trigger={ev.trigger} />
              <span className="font-mono">{formatTrigger(ev.trigger)}</span>
              <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {ev.label || (ev.trigger.kind === 'time' || ev.trigger.kind === 'astro' ? weekdaysText(ev.weekdays) : '')}
              </span>
            </button>
          ))}
          <button onClick={() => setEditing('new')}
            className="nodrag mt-auto py-1 text-[10px] rounded-md hover:opacity-80"
            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)' }}>
            + Ereignis
          </button>
        </div>
        {editing && (
          <TimerEventModal
            initial={editing === 'new' ? newEvent() : editing}
            onSave={saveFromModal}
            onCancel={() => setEditing(null)}
            onDelete={editing === 'new' ? undefined : deleteFromModal}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full gap-1.5 ${posClass}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {showIcon && (
          <div className="flex items-center justify-center shrink-0 rounded-full"
            style={{ width: 24, height: 24, background: `color-mix(in srgb, ${statusCol} 18%, transparent)` }}>
            <WidgetIcon size={iconSize - 4} style={{ color: statusCol }} />
          </div>
        )}
        {showTitle && (
          <p className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
            {config.title}
          </p>
        )}
        {/* Master switch */}
        <button onClick={toggleMaster}
          className="nodrag relative w-10 h-5 rounded-full transition-colors shrink-0"
          style={{ background: masterEnabled ? 'var(--accent-green)' : 'var(--app-border)' }}
          aria-label="Zeitschaltuhr ein/aus"
          title={masterEnabled ? 'Master aktiv' : 'Master aus — Ereignisse bleiben gespeichert'}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: masterEnabled ? '22px' : '2px' }} />
        </button>
      </div>

      {/* Status sub-line */}
      <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}
        title={hasTarget ? `Ziel: ${targetDp} ← ${targetValue ?? 'true'}` : 'Kein Ziel-Datenpunkt — bitte Admin'}>
        {!hasTarget
          ? '⚠ Admin: Ziel-DP fehlt'
          : events.length === 0
            ? 'Keine Ereignisse — über „+" hinzufügen'
            : `${enabledCount} aktiv${enabledCount === 1 ? '' : 'e'} / ${events.length} Ereignis${events.length === 1 ? '' : 'se'}`}
      </p>

      {/* Event list (compact) */}
      <div className="flex-1 overflow-hidden flex flex-col gap-1">
        {visibleEvents.map((ev) => {
          const isLive = ev.enabled && ev.weekdays.length > 0 && masterEnabled;
          return (
            <div key={ev.id}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 group"
              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <button onClick={() => toggleEvent(ev.id)}
                className="nodrag w-3 h-3 rounded-full shrink-0 transition-colors"
                style={{ background: isLive ? 'var(--accent-green)' : 'var(--app-border)' }}
                aria-label={ev.enabled ? 'Deaktivieren' : 'Aktivieren'}
                title={ev.enabled ? 'Aktiv – Klick deaktiviert' : 'Inaktiv – Klick aktiviert'} />
              <button onClick={() => setEditing(ev)}
                className="nodrag flex-1 flex items-center gap-1.5 min-w-0 text-left"
                title="Bearbeiten">
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)', minWidth: 48 }}>
                  {ev.trigger.kind === 'once' || ev.trigger.kind === 'range' ? '—' : weekdaysText(ev.weekdays)}
                </span>
                <span className="flex items-center gap-1 text-[10px] shrink-0" style={{ color: 'var(--text-primary)' }}>
                  <TriggerIcon trigger={ev.trigger} />
                  {formatTrigger(ev.trigger)}
                </span>
                {ev.label ? (
                  <span className="text-[10px] flex-1 truncate text-right" style={{ color: 'var(--text-secondary)' }}>
                    {ev.label}
                  </span>
                ) : <span className="flex-1" />}
                <Pencil size={10} className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)' }}>
            +{hiddenCount} weitere
          </p>
        )}
        {events.length === 0 && (
          <p className="text-[10px] italic text-center" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
            Noch keine Ereignisse — über „+" hinzufügen
          </p>
        )}

        {/* Add-event button — always available, frontend UI */}
        <button onClick={() => setEditing('new')}
          className="nodrag mt-auto w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-lg hover:opacity-80 transition-opacity"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)' }}>
          <Plus size={12} /> Ereignis hinzufügen
        </button>
      </div>

      {editing && (
        <TimerEventModal
          initial={editing === 'new' ? newEvent() : editing}
          onSave={saveFromModal}
          onCancel={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : deleteFromModal}
        />
      )}
    </div>
  );
}
