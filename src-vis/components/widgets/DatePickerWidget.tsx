import { useState, useEffect } from 'react';
import { CalendarClock, CalendarDays } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';

export type DateOutputFormat =
  | 'timestamp_ms'
  | 'timestamp_s'
  | 'iso'
  | 'date'
  | 'datetime_local'
  | 'de_date'
  | 'de_datetime';

export const FORMAT_LABELS: Record<DateOutputFormat, string> = {
  timestamp_ms:   'Timestamp (ms)',
  timestamp_s:    'Timestamp (s)',
  iso:            'ISO 8601 (2025-01-15T13:30:00.000Z)',
  date:           'Datum (2025-01-15)',
  datetime_local: 'Datum+Zeit (2025-01-15T13:30)',
  de_date:        'Datum (15.01.2025)',
  de_datetime:    'Datum+Zeit (15.01.2025 13:30)',
};

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Parse any supported format back to a local Date */
function parseValue(val: unknown): Date | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    const d = new Date(val > 1e10 ? val : val * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    // German format DD.MM.YYYY or DD.MM.YYYY HH:mm
    const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDate(d: Date, fmt: DateOutputFormat): string | number {
  switch (fmt) {
    case 'timestamp_ms':   return d.getTime();
    case 'timestamp_s':    return Math.floor(d.getTime() / 1000);
    case 'iso':            return d.toISOString();
    case 'date':           return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    case 'datetime_local': return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'de_date':        return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
    case 'de_datetime':    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DatePickerWidget({ config }: WidgetProps) {
  const o           = config.options ?? {};
  const showTime    = o.showTime === true;
  const outputFmt   = (o.outputFormat as DateOutputFormat) ?? 'timestamp_ms';
  const showTitle   = o.showTitle !== false;
  const showCurrent = o.showCurrentValue !== false;
  const layout      = config.layout ?? 'default';
  const iconSize    = (o.iconSize as number) || 36;
  const WidgetIcon  = getWidgetIcon(o.icon as string | undefined, showTime ? CalendarClock : CalendarDays);

  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();

  const currentDate = parseValue(value);

  const [dateVal, setDateVal] = useState(() => currentDate ? toDateInputValue(currentDate) : '');
  const [timeVal, setTimeVal] = useState(() => currentDate ? toTimeInputValue(currentDate) : '00:00');

  // Sync when DP value changes externally
  useEffect(() => {
    if (!currentDate) return;
    setDateVal(toDateInputValue(currentDate));
    setTimeVal(toTimeInputValue(currentDate));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeValue = (date: string, time: string) => {
    if (!date) return;
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi]    = time.split(':').map(Number);
    const dt = showTime
      ? new Date(y, mo - 1, d, h ?? 0, mi ?? 0)
      : new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (isNaN(dt.getTime())) return;
    setState(config.datapoint, formatDate(dt, outputFmt));
  };

  const handleDate = (v: string) => { setDateVal(v); writeValue(v, timeVal); };
  const handleTime = (v: string) => { setTimeVal(v); writeValue(dateVal, v); };

  const currentDisplay = currentDate
    ? (showTime
        ? currentDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : currentDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    : '–';

  const inputSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
    borderRadius: 8,
    padding: '5px 8px',
    fontSize: 12,
    colorScheme: 'dark' as never,
    flexShrink: 0,
  };

  const dateInput = (
    <input type="date" value={dateVal} onChange={(e) => handleDate(e.target.value)}
      className="nodrag focus:outline-none" style={inputSty} />
  );

  const timeInput = showTime ? (
    <input type="time" value={timeVal} onChange={(e) => handleTime(e.target.value)}
      className="nodrag focus:outline-none" style={inputSty} />
  ) : null;

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="flex flex-col h-full gap-2 items-center justify-center" style={{ position: 'relative' }}>
        <WidgetIcon size={iconSize} style={{ color: 'var(--accent)', opacity: 0.8 }} />
        {showTitle && <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>}
        <div className="flex flex-wrap justify-center gap-1.5">
          {dateInput}
          {timeInput}
        </div>
        {showCurrent && (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Gesetzt: {currentDisplay}</p>
        )}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2 h-full" style={{ position: 'relative' }}>
        <WidgetIcon size={iconSize} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        {showTitle && <span className="text-sm truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
        {!showTitle && <span className="flex-1" />}
        <div className="flex items-center gap-1 shrink-0">
          {dateInput}
          {timeInput}
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5" style={{ position: 'relative' }}>
        <div className="flex flex-wrap justify-center gap-1.5">
          {dateInput}
          {timeInput}
        </div>
        {showCurrent && <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{currentDisplay}</p>}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  const posClass = contentPositionClass(o.contentPosition as string | undefined);
  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center gap-1.5">
          <WidgetIcon size={iconSize} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {dateInput}
        {timeInput}
      </div>
      {showCurrent && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Gesetzt: {currentDisplay}</p>
      )}
      <StatusBadges config={config} />
    </div>
  );
}
