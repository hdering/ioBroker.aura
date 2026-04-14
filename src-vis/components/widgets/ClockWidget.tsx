import { useState, useEffect } from 'react';
import type { WidgetProps } from '../../types';
import { useT } from '../../i18n';

type TFn = ReturnType<typeof useT>;

function pad(n: number) { return String(n).padStart(2, '0'); }

function applyCustomFormat(date: Date, fmt: string, t: TFn): string {
  return fmt
    .replace('EEEE', t(`clock.day.${date.getDay()}` as Parameters<TFn>[0]))
    .replace('MMMM', t(`clock.month.${date.getMonth()}` as Parameters<TFn>[0]))
    .replace('yyyy', String(date.getFullYear()))
    .replace('yy', String(date.getFullYear()).slice(-2))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('dd', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('hh', pad(date.getHours() % 12 || 12))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()));
}

function formatTime(date: Date, showSeconds: boolean): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}${showSeconds ? ':' + pad(date.getSeconds()) : ''}`;
}

function formatDate(date: Date, length: 'short' | 'long', t: TFn): string {
  if (length === 'long') {
    const dayName = t(`clock.day.${date.getDay()}` as Parameters<TFn>[0]);
    const monthName = t(`clock.month.${date.getMonth()}` as Parameters<TFn>[0]);
    return `${dayName}, ${date.getDate()}. ${monthName} ${date.getFullYear()}`;
  }
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function ClockWidget({ config }: WidgetProps) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const opts = config.options ?? {};
  const display = (opts.display as string) ?? 'time';
  const showSeconds = Boolean(opts.showSeconds);
  const dateLength = (opts.dateLength as 'short' | 'long') ?? 'short';
  const customFormat = opts.customFormat as string | undefined;
  const layout = config.layout ?? 'default';

  const timeStr = formatTime(now, showSeconds);
  const dateStr = display !== 'time' ? formatDate(now, dateLength, t) : '';
  const customStr = customFormat ? applyCustomFormat(now, customFormat, t) : '';

  // ---------- COMPACT ----------
  if (layout === 'compact') {
    if (customFormat) {
      return (
        <div className="flex items-center h-full">
          <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{customStr}</p>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 h-full">
        {display !== 'date' && (
          <p className="text-xl font-bold tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>{timeStr}</p>
        )}
        {display === 'datetime' && <span style={{ color: 'var(--app-border)' }}>·</span>}
        {display !== 'time' && (
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{dateStr}</p>
        )}
      </div>
    );
  }

  // ---------- MINIMAL ----------
  if (layout === 'minimal') {
    const text = customFormat ? customStr : display === 'date' ? dateStr : timeStr;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <p
          className="font-black tabular-nums leading-none text-center"
          style={{ color: 'var(--accent)', fontSize: 'calc(clamp(1.8rem, 5vw, 3rem) * var(--font-scale, 1))' }}
        >
          {text}
        </p>
        {!customFormat && display === 'datetime' && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dateStr}</p>
        )}
      </div>
    );
  }

  // ---------- CARD ----------
  if (layout === 'card') {
    if (customFormat) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <p className="font-black tabular-nums text-center" style={{ color: 'var(--accent)', fontSize: 'calc(clamp(2rem, 6vw, 3.5rem) * var(--font-scale, 1))', lineHeight: 1.1 }}>
            {customStr}
          </p>
          {config.title && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5">
        {display !== 'date' && (
          <p className="font-black tabular-nums leading-none" style={{ color: 'var(--accent)', fontSize: 'calc(clamp(2rem, 6vw, 3.5rem) * var(--font-scale, 1))' }}>
            {timeStr}
          </p>
        )}
        {display !== 'time' && (
          <p className={display === 'date' ? 'text-2xl font-bold tabular-nums' : 'text-sm'} style={{ color: display === 'date' ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {dateStr}
          </p>
        )}
        {config.title && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>}
      </div>
    );
  }

  // ---------- DEFAULT ----------
  if (customFormat) {
    return (
      <div className="flex flex-col h-full justify-between">
        {config.title && (
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        )}
        <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{customStr}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between">
      {config.title && (
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      )}
      <div>
        {display !== 'date' && (
          <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
            {timeStr}
          </p>
        )}
        {display !== 'time' && (
          <p className={`mt-1 ${display === 'date' ? 'text-2xl font-bold' : 'text-sm'}`} style={{ color: display === 'date' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {dateStr}
          </p>
        )}
      </div>
    </div>
  );
}
