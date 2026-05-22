import { useState, useEffect, type CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';
import { getWidgetIcon } from '../../utils/widgetIconMap';

type TFn = ReturnType<typeof useT>;

function pad(n: number) { return String(n).padStart(2, '0'); }

function applyCustomFormat(date: Date, fmt: string, t: TFn): string {
  return fmt
    .replace('EEEE', t(`clock.day.${date.getDay()}` as Parameters<TFn>[0]))
    .replace('EE', t(`cal.day.${date.getDay()}` as Parameters<TFn>[0]))
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


/** Renders the date string, wrapping the weekday in its own span when long format is used. */
function DateText({ date, length, t }: { date: Date; length: 'short' | 'long'; t: TFn }) {
  if (length === 'long') {
    const dayName = t(`clock.day.${date.getDay()}` as Parameters<TFn>[0]);
    const monthName = t(`clock.month.${date.getMonth()}` as Parameters<TFn>[0]);
    return <><span className="aura-clock-weekday">{dayName}</span>{`, ${date.getDate()}. ${monthName} ${date.getFullYear()}`}</>;
  }
  return <>{`${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`}</>;
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
  const showTitle  = opts.showTitle !== false;
  const showIcon   = opts.showIcon  !== false;
  const iconSize   = (opts.iconSize as number) || 20;
  const titleAlign = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Clock);
  const dateLength = (opts.dateLength as 'short' | 'long') ?? 'short';
  const customFormat = opts.customFormat as string | undefined;
  const timeFontSize = Number(opts.timeFontSize) || 0;
  const dateFontSize = Number(opts.dateFontSize) || 0;
  const customFontSize = Number(opts.customFontSize) || 0;
  const layout = config.layout ?? 'default';

  const sizeStyle = (px: number): CSSProperties => (px > 0 ? { fontSize: `${px}px` } : {});
  const sizeCls = (px: number, fallback: string) => (px > 0 ? '' : fallback);

  const timeStr = formatTime(now, showSeconds);
  const customStr = customFormat ? applyCustomFormat(now, customFormat, t) : '';

  if (layout === 'custom') {
    const dateStr = dateLength === 'long'
      ? `${t(`clock.day.${now.getDay()}` as Parameters<typeof t>[0])}, ${now.getDate()}. ${t(`clock.month.${now.getMonth()}` as Parameters<typeof t>[0])} ${now.getFullYear()}`
      : `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    const defaultValue = customFormat
      ? customStr
      : display === 'date'
        ? dateStr
        : display === 'datetime'
          ? `${timeStr} ${dateStr}`
          : timeStr;
    return <CustomGridView config={config} value={defaultValue} extraFields={{ time: timeStr, date: dateStr, custom: customStr }} />;
  }

  // ---------- MINIMAL ----------
  if (layout === 'minimal') {
    const primaryCls = customFormat ? 'aura-clock-custom' : display === 'date' ? 'aura-clock-date' : 'aura-clock-time';
    const primaryPx = customFormat ? customFontSize : display === 'date' ? dateFontSize : timeFontSize;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <p
          className={`${primaryCls} ${sizeCls(primaryPx, 'text-xl')} font-bold tabular-nums leading-none text-center`}
          style={{ color: 'var(--accent)', ...sizeStyle(primaryPx) }}
        >
          {customFormat ? customStr : display === 'date' ? <DateText date={now} length={dateLength} t={t} /> : timeStr}
        </p>
        {!customFormat && display === 'datetime' && (
          <p
            className={`aura-clock-date ${sizeCls(dateFontSize, 'text-xs')}`}
            style={{ color: 'var(--text-secondary)', ...sizeStyle(dateFontSize) }}
          >
            <DateText date={now} length={dateLength} t={t} />
          </p>
        )}
      </div>
    );
  }

  // ---------- CARD ----------
  if (layout === 'card') {
    if (customFormat) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <p
            className={`aura-clock-custom ${sizeCls(customFontSize, 'text-xl')} font-bold tabular-nums text-center`}
            style={{ color: 'var(--accent)', lineHeight: 1.1, ...sizeStyle(customFontSize) }}
          >
            {customStr}
          </p>
          {(showTitle || showIcon) && (
            <div className="flex items-center gap-1 mt-1 min-w-0">
              {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
              {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5">
        {display !== 'date' && (
          <p
            className={`aura-clock-time ${sizeCls(timeFontSize, 'text-xl')} font-bold tabular-nums leading-none`}
            style={{ color: 'var(--accent)', ...sizeStyle(timeFontSize) }}
          >
            {timeStr}
          </p>
        )}
        {display !== 'time' && (
          <p
            className={`aura-clock-date ${display === 'date' ? `${sizeCls(dateFontSize, 'text-2xl')} font-bold tabular-nums` : sizeCls(dateFontSize, 'text-sm')}`}
            style={{ color: display === 'date' ? 'var(--accent)' : 'var(--text-secondary)', ...sizeStyle(dateFontSize) }}
          >
            <DateText date={now} length={dateLength} t={t} />
          </p>
        )}
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 mt-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
      </div>
    );
  }

  // ---------- DEFAULT ----------
  if (customFormat) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`aura-clock-custom ${sizeCls(customFontSize, 'text-xl')} font-bold tabular-nums`}
            style={{ color: 'var(--text-primary)', ...sizeStyle(customFontSize) }}
          >
            {customStr}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1 shrink-0 min-w-0">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
        {display !== 'date' && (
          <p
            className={`aura-clock-time ${sizeCls(timeFontSize, 'text-xl')} font-bold tabular-nums leading-none`}
            style={{ color: 'var(--text-primary)', ...sizeStyle(timeFontSize) }}
          >
            {timeStr}
          </p>
        )}
        {display !== 'time' && (
          <p
            className={`aura-clock-date ${display === 'date' ? `${sizeCls(dateFontSize, 'text-xl')} font-bold` : sizeCls(dateFontSize, 'text-sm')}`}
            style={{ color: display === 'date' ? 'var(--text-primary)' : 'var(--text-secondary)', ...sizeStyle(dateFontSize) }}
          >
            <DateText date={now} length={dateLength} t={t} />
          </p>
        )}
      </div>
    </div>
  );
}
