import { CalendarDays, Camera, Zap } from 'lucide-react';
import type { WidgetType, WidgetLayout } from '../../types';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
import { useT } from '../../i18n';

interface WidgetPreviewProps {
  type: WidgetType;
  layout?: WidgetLayout;
  title?: string;
}

// Derived from central registry
const ICON = Object.fromEntries(
  Object.entries(WIDGET_BY_TYPE).map(([t, m]) => [t, <m.Icon key={t} size={13} />]),
) as Record<WidgetType, React.ReactElement>;

const MOCK = Object.fromEntries(
  Object.entries(WIDGET_BY_TYPE).map(([t, m]) => [t, m.mock]),
) as Record<WidgetType, { t: string; v: string; u?: string; sub?: string }>;

function Toggle({ on }: { on?: boolean }) {
  return (
    <div className="relative w-8 h-4 rounded-full shrink-0" style={{ background: on !== false ? 'var(--accent-green)' : 'var(--app-border)' }}>
      <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow"
        style={{ left: on !== false ? '18px' : '2px', transition: 'left 0.15s' }} />
    </div>
  );
}

function MockContent({ type, layout, title }: { type: WidgetType; layout: WidgetLayout; title: string }) {
  const tr = useT();
  const m = MOCK[type];
  const t = title || m.t;
  const icon = ICON[type];

  // Clock
  if (type === 'clock') {
    if (layout === 'minimal' || layout === 'card') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-0.5">
          <p className="text-3xl font-black tabular-nums leading-none" style={{ color: 'var(--accent)' }}>12:34</p>
          {layout === 'card' && <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>07.04.2026</p>}
        </div>
      );
    }
    if (layout === 'compact') {
      return (
        <div className="flex items-center gap-2 h-full">
          <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>12:34</p>
          <span style={{ color: 'var(--app-border)' }}>·</span>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Mo., 7. Apr.</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full justify-between">
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t}</p>
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>12:34</p>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>07.04.2026</p>
        </div>
      </div>
    );
  }

  // Calendar
  if (type === 'calendar') {
    const mockEvents = [
      { label: 'Team-Meeting', date: tr('calendar.todayAt', { time: '10:00' }), dot: 'var(--accent)' },
      { label: tr('preview.cal.dentist'), date: tr('calendar.tomorrowAt', { time: '14:30' }), dot: 'var(--accent-green)' },
      { label: tr('preview.cal.birthday'), date: `${tr('cal.day.3')}, 9. ${tr('cal.month.3')}`, dot: 'var(--accent-yellow)' },
    ];
    if (layout === 'minimal' || layout === 'card') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <p className="text-3xl font-black leading-none" style={{ color: 'var(--accent)' }}>3</p>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tr('calendar.events')}</p>
        </div>
      );
    }
    if (layout === 'compact') {
      return (
        <div className="flex items-center gap-2 h-full">
          <CalendarDays size={16} style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Team-Meeting</p>
            <p className="text-[10px]" style={{ color: 'var(--accent)' }}>{tr('calendar.todayAt', { time: '10:00' })}</p>
          </div>
        </div>
      );
    }
    if (layout === 'agenda') {
      return (
        <div className="flex flex-col h-full gap-0.5">
          <p className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t}</p>
          {mockEvents.map((ev, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: ev.dot }} />
              <span className="text-[8px] w-8 truncate shrink-0" style={{ color: ev.dot }}>Cal {i + 1}</span>
              <p className="flex-1 text-[9px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ev.label}</p>
              <p className="text-[8px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{ev.date.split(', ')[1] ?? ev.date}</p>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full gap-1.5">
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t}</p>
        {mockEvents.map((ev, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: ev.dot }} />
            <div>
              <p className="text-[10px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{ev.label}</p>
              <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{ev.date}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Weather
  if (type === 'weather') {
    if (layout === 'minimal') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span style={{ fontSize: '2rem', lineHeight: 1 }}>⛅</span>
          <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>18°</span>
        </div>
      );
    }
    if (layout === 'compact') {
      return (
        <div className="flex items-center gap-2 h-full">
          <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>⛅</span>
          <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>18°</span>
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tr('weather.cloudy')}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full gap-1.5">
        <div className="flex items-start gap-2">
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>⛅</span>
          <div>
            <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>18°</span>
            <span className="text-[11px] ml-1" style={{ color: 'var(--text-secondary)' }}>{tr('weather.cloudy')}</span>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{tr('preview.feelsLike', { temp: 15 })}</p>
          </div>
        </div>
        <div className="text-[10px] flex gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span>💧 65%</span><span>💨 12 km/h</span>
        </div>
        <div className="flex gap-1 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
          {[['Mo', '☁️', '18°'], ['Di', '🌧️', '15°'], ['Mi', '☀️', '22°']].map(([d, e, tmp]) => (
            <div key={d} className="flex-1 flex flex-col items-center" style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
              <span>{d}</span><span style={{ fontSize: '11px' }}>{e}</span><span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{tmp}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Gauge
  if (type === 'gauge') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <svg viewBox="0 0 200 120" style={{ width: 120, height: 72 }}>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--app-border)" strokeWidth={12} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 131.13 33.57" fill="none" stroke="var(--accent)" strokeWidth={12} strokeLinecap="round" />
          <text x={100} y={95} textAnchor="middle" fontSize={22} fontWeight="bold" fill="var(--text-primary)">72</text>
          <text x={100} y={110} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">{m.u}</text>
        </svg>
        {t && <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t}</p>}
      </div>
    );
  }

  // Camera
  if (type === 'camera') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1" style={{ background: 'var(--app-bg)', borderRadius: 4 }}>
        <Camera size={20} style={{ color: 'var(--text-secondary)' }} />
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t}</p>
      </div>
    );
  }

  // Chart
  if (type === 'chart') {
    const bars = [40, 60, 45, 75, 55, 80, 65, 90, 70];
    return (
      <div className="flex flex-col h-full gap-1.5">
        <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{t}</p>
        <div className="flex-1 flex items-end gap-0.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === bars.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)' }} />
          ))}
        </div>
        <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{m.v}{m.u && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> {m.u}</span>}</p>
      </div>
    );
  }

  // List
  if (type === 'list') {
    return (
      <div className="flex flex-col h-full gap-1.5">
        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{t}</p>
        {[1, 2, 3].map((n, i) => (
          <div key={i} className="flex items-center justify-between px-1.5 py-0.5 rounded" style={{ background: 'var(--app-bg)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-primary)' }}>{tr('preview.device')} {n}</span>
            <Toggle on={i === 0} />
          </div>
        ))}
      </div>
    );
  }

  // CARD layout
  if (layout === 'card') {
    if (type === 'switch') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 rounded-md" style={{ background: 'color-mix(in srgb, var(--accent-green) 20%, transparent)' }}>
          <Zap size={26} style={{ color: 'var(--accent-green)' }} />
          <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{t}</p>
          <p className="text-[10px]" style={{ color: 'var(--accent-green)' }}>{tr('common.on')}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-center justify-between">
          <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{t}</p>
          <span style={{ color: 'var(--accent)' }}>{icon}</span>
        </div>
        <div>
          <p className="text-3xl font-black leading-none" style={{ color: 'var(--accent)' }}>
            {m.v}
          </p>
          {m.u && <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{m.u}</p>}
        </div>
      </div>
    );
  }

  // COMPACT layout
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2 h-full">
        <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{t}</p>
          <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {m.v}{m.u && <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-secondary)' }}>{m.u}</span>}
          </p>
        </div>
        {type === 'switch' && <Toggle />}
        {type === 'thermostat' && (
          <div className="flex gap-0.5 shrink-0">
            <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</span>
            <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</span>
          </div>
        )}
        {type === 'dimmer' && (
          <div className="w-14 h-2 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--app-border)' }}>
            <div className="h-full rounded-full" style={{ width: '75%', background: 'var(--accent)' }} />
          </div>
        )}
      </div>
    );
  }

  // MINIMAL layout
  if (layout === 'minimal') {
    if (type === 'switch') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1.5">
          <Toggle />
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-0.5">
        <p className="text-3xl font-black leading-none" style={{ color: 'var(--accent)' }}>{m.v}</p>
        {m.u && <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{m.u}</p>}
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>{t}</p>
      </div>
    );
  }

  // DEFAULT layout
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{t}</p>
      </div>
      <div>
        {type === 'switch' ? (
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>{tr('common.on')}</span>
            <Toggle />
          </div>
        ) : type === 'thermostat' ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.v}°</p>
              {m.sub && <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{m.sub}</p>}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center" style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</span>
              <span className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center" style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</span>
            </div>
          </div>
        ) : type === 'dimmer' ? (
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.v}<span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>{m.u}</span></p>
            <div className="w-full h-2 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
              <div className="h-full rounded-full" style={{ width: '75%', background: 'var(--accent)' }} />
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.v}</span>
            {m.u && <span className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>{m.u}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function WidgetPreview({ type, layout = 'default', title, scale: scaleProp }: WidgetPreviewProps & { scale?: number }) {
  const SCALE = scaleProp ?? 0.62;
  const INNER_W = 200;
  const INNER_H = 140;

  return (
    <div
      className="rounded-lg overflow-hidden shrink-0 relative"
      style={{
        width: Math.round(INNER_W * SCALE),
        height: Math.round(INNER_H * SCALE),
        background: 'var(--widget-bg)',
        border: '1px solid var(--app-border)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: INNER_W,
          height: INNER_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          padding: 14,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <MockContent type={type} layout={layout} title={title ?? ''} />
      </div>
    </div>
  );
}
