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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { CustomGridView } from './CustomGridView';
import { saveAll, saveToIoBroker } from '../../store/persistManager';

/**
 * Flush the dashboard config to ioBroker immediately after a user edit.
 * The frontend uses `ignoreDirty: true` in useConfigSync, so a pending-but-
 * unsaved change is otherwise overwritten by the next stateChange echo or
 * poll. Calling saveToIoBroker() arms the `isSavingRecently` window (5 s)
 * that suppresses our own echo and prevents the rollback.
 */
function flushDashboard() {
  try { saveAll(); saveToIoBroker(); } catch { /* offline / not configured */ }
}

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

export function TimerWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const o = (config.options ?? {}) as Record<string, unknown>;
  // Wrap the ?? [] fallback so an unconfigured widget doesn't hand a fresh array
  // to the publish effect on every render, which would re-publish on every tick.
  const events = useMemo(() => (o.events as TimerEvent[] | undefined) ?? [], [o.events]);
  const masterEnabled = (o.enabled as boolean | undefined)          ?? true;
  const targetDp        = o.targetDp        as string | undefined;
  const targetValue     = o.value           as string | undefined;
  const allowEventValue = o.allowEventValue === true;
  const holidaysDp      = o.holidaysDp      as string | undefined;
  const vacationDp      = o.vacationDp      as string | undefined;
  const showTitle    = o.showTitle !== false;
  const showIcon     = o.showIcon  !== false;
  const showMaster   = o.showMasterSwitch !== false;
  const showEvents   = o.showEvents   !== false;
  const showAdd      = o.showAddButton !== false;
  const titleAlign   = (o.titleAlign as string) ?? 'left';
  const iconSize     = (o.iconSize as number) || 20;
  const WidgetIcon   = getWidgetIcon(o.icon as string | undefined, Timer);
  const posClass     = contentPositionClass(o.contentPosition as string | undefined);

  const hasTarget = !!targetDp;
  const statusCol = statusColor(masterEnabled, events, hasTarget);
  const enabledCount = events.filter((e) => e.enabled && e.weekdays.length > 0).length;

  // Assign a stable, instance-unique stateBaseId on first mount. Copies / group
  // clones get a fresh path because copyConfig + cloneChildren strip stateBaseId,
  // so they never collide on the backend with the original — even though their
  // config.id (top-level) or child id (inside a group def) may match.
  useLayoutEffect(() => {
    if (!o.stateBaseId) {
      const seg = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      onConfigChange({ ...config, options: { ...o, stateBaseId: `aura.0.timers.${seg}` } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Path segment for publish*/unpublish* (last component of stateBaseId).
  // Null until useLayoutEffect has stamped one in — publish effects gate on it.
  const backendKey = ((o.stateBaseId as string | undefined)?.split('.').pop()) || null;

  // ── Mirror config to backend DPs whenever it changes ──────────────────────
  // The adapter scheduler subscribes to aura.0.timers.<backendKey>.{config,enabled}.
  const lastPublishedRef = useRef<string>('');
  useEffect(() => {
    if (!backendKey) return;
    const payload: TimerConfigPayload = {
      events,
      targetDp,
      value: targetValue,
      allowEventValue,
      holidaysDp,
      vacationDp,
      title: config.title,
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPublishedRef.current) {
      publishTimerConfig(backendKey, config.title || 'Zeitschaltuhr', payload);
      lastPublishedRef.current = serialized;
    }
  }, [backendKey, config.title, events, targetDp, targetValue, allowEventValue, holidaysDp, vacationDp]);

  const lastEnabledRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!backendKey) return;
    if (lastEnabledRef.current !== masterEnabled) {
      publishTimerEnabled(backendKey, config.title || 'Zeitschaltuhr', masterEnabled);
      lastEnabledRef.current = masterEnabled;
    }
  }, [backendKey, config.title, masterEnabled]);

  const toggleMaster = () => {
    onConfigChange({ ...config, options: { ...o, enabled: !masterEnabled } });
    setTimeout(flushDashboard, 0);
  };

  const toggleEvent = (eventId: string) => {
    const next = events.map((e) => e.id === eventId ? { ...e, enabled: !e.enabled } : e);
    onConfigChange({ ...config, options: { ...o, events: next } });
    setTimeout(flushDashboard, 0);
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
    setTimeout(flushDashboard, 0);
  };

  const deleteFromModal = () => {
    if (editing && editing !== 'new') {
      onConfigChange({ ...config, options: { ...o, events: events.filter((x) => x.id !== editing.id) } });
    }
    setEditing(null);
    setTimeout(flushDashboard, 0);
  };

  const layout = config.layout ?? 'default';
  const isCompact = layout === 'compact';
  const isCustom  = layout === 'custom';
  const visibleEvents = events.slice(0, isCompact ? 2 : 4);
  const hiddenCount   = events.length - visibleEvents.length;

  // In edit mode the widget is shown inside the admin editor for layout/styling
  // only — interaction is disabled so the admin can't accidentally toggle the
  // master, add events, or open the event modal from the preview.
  const interactive = !editMode;

  // ── Reusable building blocks (also used as extraComponents in custom layout) ─
  const masterSwitch = (
    <button onClick={interactive ? toggleMaster : undefined}
      disabled={!interactive}
      className="nodrag relative w-10 h-5 rounded-full transition-colors shrink-0"
      style={{ background: masterEnabled ? 'var(--accent-green)' : 'var(--app-border)', cursor: interactive ? 'pointer' : 'default', opacity: interactive ? 1 : 0.6 }}
      aria-label="Zeitschaltuhr ein/aus"
      title={interactive ? (masterEnabled ? 'Master aktiv' : 'Master aus — Ereignisse bleiben gespeichert') : 'Im Bearbeitungsmodus deaktiviert'}>
      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ left: masterEnabled ? '22px' : '2px' }} />
    </button>
  );

  const statusBubble = (
    <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}
      title={hasTarget ? `Ziel: ${targetDp} ← ${targetValue ?? 'true'}` : 'Kein Ziel-Datenpunkt — bitte Admin'}>
      {!hasTarget
        ? '⚠ Admin: Ziel-DP fehlt'
        : events.length === 0
          ? 'Keine Ereignisse'
          : `${enabledCount}/${events.length} aktiv`}
    </span>
  );

  const eventList = (
    <div className="flex flex-col gap-1 w-full">
      {visibleEvents.map((ev) => {
        const isLive = ev.enabled && ev.weekdays.length > 0 && masterEnabled;
        return (
          <div key={ev.id}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 group"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', opacity: interactive ? 1 : 0.7 }}>
            <button onClick={interactive ? () => toggleEvent(ev.id) : undefined}
              disabled={!interactive}
              className="nodrag w-3 h-3 rounded-full shrink-0 transition-colors"
              style={{ background: isLive ? 'var(--accent-green)' : 'var(--app-border)', cursor: interactive ? 'pointer' : 'default' }}
              title={interactive ? (ev.enabled ? 'Aktiv – Klick deaktiviert' : 'Inaktiv – Klick aktiviert') : ''} />
            <button onClick={interactive ? () => setEditing(ev) : undefined}
              disabled={!interactive}
              className="nodrag flex-1 flex items-center gap-1.5 min-w-0 text-left"
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              title={interactive ? 'Bearbeiten' : ''}>
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
              {interactive && <Pencil size={10} className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--text-secondary)' }} />}
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
          Noch keine Ereignisse
        </p>
      )}
    </div>
  );

  const addButton = (
    <button onClick={interactive ? () => setEditing('new') : undefined}
      disabled={!interactive}
      className="nodrag w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-lg hover:opacity-80 transition-opacity"
      style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)', cursor: interactive ? 'pointer' : 'default', opacity: interactive ? 1 : 0.6 }}
      title={interactive ? 'Neues Ereignis' : 'Im Bearbeitungsmodus deaktiviert'}>
      <Plus size={12} /> Ereignis hinzufügen
    </button>
  );

  const iconNode = showIcon
    ? <WidgetIcon size={iconSize} style={{ color: statusCol, flexShrink: 0 }} />
    : null;

  const modal = editing && (
    <TimerEventModal
      initial={editing === 'new' ? newEvent() : editing}
      allowValue={allowEventValue}
      defaultValue={targetValue}
      onSave={saveFromModal}
      onCancel={() => setEditing(null)}
      onDelete={editing === 'new' ? undefined : deleteFromModal}
    />
  );

  // ── Custom layout: user-defined grid via CustomGridView ────────────────────
  if (isCustom) {
    return (
      <div className="aura-widget-row relative w-full h-full">
        <CustomGridView
          config={config}
          value={hasTarget ? (events.length === 0 ? '0' : String(enabledCount)) : '—'}
          extraFields={{
            status:  hasTarget ? `${enabledCount}/${events.length}` : 'Ziel-DP fehlt',
            target:  targetDp ?? '',
            value:   targetValue ?? '',
            count:   String(events.length),
            enabled: String(enabledCount),
          }}
          extraComponents={{
            icon:    iconNode,
            master:  showMaster ? masterSwitch : null,
            status:  statusBubble,
            events:  eventList,
            add:     showAdd ? addButton : null,
          }}
        />
        {modal}
      </div>
    );
  }

  // ── Compact layout: one-line header + tight event list ─────────────────────
  if (isCompact) {
    return (
      <div className={`aura-widget-row flex flex-col h-full gap-1 ${posClass}`}>
        <div className="flex items-center gap-1.5">
          {iconNode}
          {showTitle && (
            <p className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
              {config.title}
            </p>
          )}
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {events.length === 0 ? '—' : `${enabledCount}/${events.length}`}
          </span>
          {showMaster && (
            <button onClick={interactive ? toggleMaster : undefined}
              disabled={!interactive}
              className="nodrag relative w-8 h-4 rounded-full transition-colors shrink-0"
              style={{ background: masterEnabled ? 'var(--accent-green)' : 'var(--app-border)', cursor: interactive ? 'pointer' : 'default', opacity: interactive ? 1 : 0.6 }}>
              <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                style={{ left: masterEnabled ? '18px' : '2px' }} />
            </button>
          )}
        </div>
        {showEvents && (
          <div className="flex-1 overflow-hidden flex flex-col gap-0.5">
            {visibleEvents.map((ev) => (
              <button key={ev.id} onClick={interactive ? () => setEditing(ev) : undefined}
                disabled={!interactive}
                className="nodrag flex items-center gap-1 text-[10px] text-left hover:opacity-80"
                style={{ color: 'var(--text-primary)', cursor: interactive ? 'pointer' : 'default', opacity: interactive ? 1 : 0.7 }}>
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ev.enabled && masterEnabled ? 'var(--accent-green)' : 'var(--app-border)' }} />
                <TriggerIcon trigger={ev.trigger} />
                <span className="font-mono">{formatTrigger(ev.trigger)}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {ev.label || (ev.trigger.kind === 'time' || ev.trigger.kind === 'astro' ? weekdaysText(ev.weekdays) : '')}
                </span>
              </button>
            ))}
            {showAdd && (
              <button onClick={interactive ? () => setEditing('new') : undefined}
                disabled={!interactive}
                className="nodrag mt-auto py-1 text-[10px] rounded-md hover:opacity-80"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)', cursor: interactive ? 'pointer' : 'default', opacity: interactive ? 1 : 0.6 }}>
                + Ereignis
              </button>
            )}
          </div>
        )}
        {modal}
      </div>
    );
  }

  return (
    <div className={`aura-widget-row flex flex-col h-full gap-1.5 ${posClass}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {iconNode}
        {showTitle && (
          <p className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
            {config.title}
          </p>
        )}
        {showMaster && masterSwitch}
      </div>

      {/* Status sub-line */}
      <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}
        title={hasTarget ? `Ziel: ${targetDp} ← ${targetValue ?? 'true'}` : 'Kein Ziel-Datenpunkt — bitte Admin'}>
        {!hasTarget
          ? '⚠ Admin: Ziel-DP fehlt'
          : events.length === 0
            ? 'Keine Ereignisse — über „+“ hinzufügen'
            : `${enabledCount} aktiv${enabledCount === 1 ? '' : 'e'} / ${events.length} Ereignis${events.length === 1 ? '' : 'se'}`}
      </p>

      {/* Event list */}
      {showEvents && (
        <div className="flex-1 overflow-hidden flex flex-col gap-1">
          {eventList}
          {showAdd && <div className="mt-auto pt-1">{addButton}</div>}
        </div>
      )}
      {!showEvents && showAdd && (
        <div className="mt-auto">{addButton}</div>
      )}

      {modal}
    </div>
  );
}
