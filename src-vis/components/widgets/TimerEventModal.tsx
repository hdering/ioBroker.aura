/**
 * Modal editor for a single TimerEvent — opened directly from the Zeitschaltuhr
 * widget so users can add or edit events without entering widget-edit mode.
 *
 * Rendered into a portal (#portal-target) so it overlays the dashboard. Local
 * draft state is committed via onSave; cancel discards changes.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Clock as ClockIcon, Sunrise, CalendarRange, Calendar } from 'lucide-react';
import type { TimerEvent, TimerWeekday, TimerTrigger, TimerFilter, TimerAstroEvent } from '../../types';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';

interface Props {
  initial: TimerEvent;
  onSave:   (ev: TimerEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;       // only shown when editing an existing event
}

const WEEKDAYS: { id: TimerWeekday; short: string; long: string }[] = [
  { id: 'mon', short: 'Mo', long: 'Montag' },
  { id: 'tue', short: 'Di', long: 'Dienstag' },
  { id: 'wed', short: 'Mi', long: 'Mittwoch' },
  { id: 'thu', short: 'Do', long: 'Donnerstag' },
  { id: 'fri', short: 'Fr', long: 'Freitag' },
  { id: 'sat', short: 'Sa', long: 'Samstag' },
  { id: 'sun', short: 'So', long: 'Sonntag' },
];

const ASTRO_EVENTS: { id: TimerAstroEvent; label: string }[] = [
  { id: 'sunrise',   label: 'Sonnenaufgang' },
  { id: 'sunset',    label: 'Sonnenuntergang' },
  { id: 'dawn',      label: 'Morgendämmerung' },
  { id: 'dusk',      label: 'Abenddämmerung' },
  { id: 'solarNoon', label: 'Sonnenhöchststand' },
];

const FILTER_OPTIONS: { id: TimerFilter; label: string }[] = [
  { id: 'all-days',      label: 'Alle Tage' },
  { id: 'no-special',    label: 'Ohne Sondertage' },
  { id: 'only-holidays', label: 'Nur Feiertage' },
  { id: 'only-vacation', label: 'Nur Urlaubstage' },
  { id: 'blocked',       label: 'Gesperrte Zeit (nicht ausführen)' },
];

const TRIGGER_TABS: { id: TimerTrigger['kind']; label: string; Icon: typeof ClockIcon }[] = [
  { id: 'time',  label: 'Zeit',     Icon: ClockIcon },
  { id: 'astro', label: 'Astro',    Icon: Sunrise },
  { id: 'once',  label: 'Einmalig', Icon: Calendar },
  { id: 'range', label: 'Zeitraum', Icon: CalendarRange },
];

const inputCls   = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color:      'var(--text-primary)',
  border:     '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] block mb-1';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map((x) => Number(x) || 0);
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

function freshTrigger(kind: TimerTrigger['kind']): TimerTrigger {
  const today  = new Date();
  const isoNow = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const isoEnd = new Date(today.getTime() + 60 * 60_000 - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  if (kind === 'time')  return { kind: 'time',  hour: 8, minute: 0 };
  if (kind === 'astro') return { kind: 'astro', event: 'sunset', offsetMin: 0 };
  if (kind === 'once')  return { kind: 'once',  iso: isoNow };
  return { kind: 'range', fromIso: isoNow, toIso: isoEnd };
}

export function TimerEventModal({ initial, onSave, onCancel, onDelete }: Props) {
  const [event, setEvent] = useState<TimerEvent>(initial);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const patch = (p: Partial<TimerEvent>) => setEvent((cur) => ({ ...cur, ...p }));

  const toggleWeekday = (d: TimerWeekday) => {
    const set = new Set(event.weekdays);
    if (set.has(d)) set.delete(d); else set.add(d);
    patch({ weekdays: WEEKDAYS.map((w) => w.id).filter((id) => set.has(id)) });
  };

  const t = event.trigger;
  const portal    = usePortalTarget();
  const themeVars = usePortalThemeVars();

  // The frontend applies its theme as a CSS rule scoped to [data-aura-app="frontend"].
  // Portals rendered to document.body are OUTSIDE that scope, so we tag our root
  // div with the same attribute to pick up the frontend's --app-* CSS vars.
  return createPortal(
    <div
      data-aura-app="frontend"
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
      onClick={onCancel}>
        <div
          className="rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <p className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
              {onDelete ? 'Ereignis bearbeiten' : 'Neues Ereignis'}
            </p>
            <button onClick={onCancel} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Enabled + Label */}
            <div className="flex items-center gap-2">
              <button onClick={() => patch({ enabled: !event.enabled })}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: event.enabled ? 'var(--accent-green)' : 'var(--app-border)' }}
                title={event.enabled ? 'Aktiv' : 'Inaktiv'}>
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: event.enabled ? '18px' : '2px' }} />
              </button>
              <input type="text" value={event.label ?? ''}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Bezeichnung (optional)"
                className={`flex-1 ${inputCls} min-w-0`} style={inputStyle} />
            </div>

            {/* Trigger tabs */}
            <div>
              <label className={labelCls} style={labelStyle}>Auslöser</label>
              <div className="flex gap-1 mb-2">
                {TRIGGER_TABS.map(({ id, label, Icon }) => {
                  const active = t.kind === id;
                  return (
                    <button key={id} onClick={() => patch({ trigger: freshTrigger(id) })}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-lg transition-colors"
                      style={{
                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                        color:      active ? '#fff' : 'var(--text-secondary)',
                        border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}>
                      <Icon size={12} /> {label}
                    </button>
                  );
                })}
              </div>

              {t.kind === 'time' && (
                <input type="time"
                  value={`${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map((x) => Number(x) || 0);
                    patch({ trigger: { kind: 'time', hour: h, minute: m } });
                  }}
                  className={inputCls} style={inputStyle} />
              )}

              {t.kind === 'astro' && (
                <div className="flex gap-1.5">
                  <select
                    value={t.event}
                    onChange={(e) => patch({ trigger: { ...t, event: e.target.value as TimerAstroEvent } })}
                    className={`flex-1 ${inputCls}`} style={inputStyle}>
                    {ASTRO_EVENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="number"
                      value={t.offsetMin}
                      onChange={(e) => patch({ trigger: { ...t, offsetMin: Number(e.target.value) || 0 } })}
                      className={`w-16 ${inputCls}`} style={inputStyle}
                      placeholder="±Min" />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Min</span>
                  </div>
                </div>
              )}

              {t.kind === 'once' && (
                <input type="datetime-local"
                  value={t.iso}
                  onChange={(e) => patch({ trigger: { kind: 'once', iso: e.target.value } })}
                  className={inputCls} style={inputStyle} />
              )}

              {t.kind === 'range' && (
                <div className="space-y-1.5">
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Von</label>
                    <input type="datetime-local"
                      value={t.fromIso}
                      onChange={(e) => patch({ trigger: { ...t, fromIso: e.target.value } })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Bis</label>
                    <input type="datetime-local"
                      value={t.toIso}
                      onChange={(e) => patch({ trigger: { ...t, toIso: e.target.value } })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    Feuert am Start des Zeitraums (Wert) und am Ende (invertierter Wert, falls Boolean).
                  </p>
                </div>
              )}
            </div>

            {/* Weekdays — only for time/astro */}
            {(t.kind === 'time' || t.kind === 'astro') && (
              <div>
                <label className={labelCls} style={labelStyle}>Wochentage</label>
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((w) => {
                    const active = event.weekdays.includes(w.id);
                    return (
                      <button key={w.id} onClick={() => toggleWeekday(w.id)}
                        title={w.long}
                        className="px-2 py-1 text-[11px] rounded-lg transition-colors"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--app-bg)',
                          color:      active ? '#fff' : 'var(--text-secondary)',
                          border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}>
                        {w.short}
                      </button>
                    );
                  })}
                </div>
                {event.weekdays.length === 0 && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--accent-red)' }}>
                    Kein Wochentag gewählt — Ereignis wird nicht ausgeführt.
                  </p>
                )}
              </div>
            )}

            {/* Filter */}
            <div>
              <label className={labelCls} style={labelStyle}>Filter</label>
              <select
                value={event.filter}
                onChange={(e) => patch({ filter: e.target.value as TimerFilter })}
                className={inputCls} style={inputStyle}>
                {FILTER_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              {event.filter === 'blocked' && (
                <div className="flex gap-1.5 mt-1.5">
                  <div className="flex-1">
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Sperre von</label>
                    <input type="time"
                      value={minutesToHHMM(event.blockFromMin ?? 0)}
                      onChange={(e) => patch({ blockFromMin: hhmmToMinutes(e.target.value) })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Sperre bis</label>
                    <input type="time"
                      value={minutesToHHMM(event.blockToMin ?? 0)}
                      onChange={(e) => patch({ blockToMin: hhmmToMinutes(e.target.value) })}
                      className={inputCls} style={inputStyle} />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--app-border)' }}>
            {onDelete && (
              <button onClick={onDelete}
                className="px-3 py-2 text-xs rounded-lg hover:opacity-80 flex items-center gap-1"
                style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}>
                <Trash2 size={12} /> Löschen
              </button>
            )}
            <span className="flex-1" />
            <button onClick={onCancel}
              className="px-3 py-2 text-xs rounded-lg hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              Abbruch
            </button>
            <button onClick={() => onSave(event)}
              className="px-3 py-2 text-xs rounded-lg text-white hover:opacity-80"
              style={{ background: 'var(--accent)' }}>
              Speichern
            </button>
          </div>
        </div>
      </div>,
    portal,
  );
}
