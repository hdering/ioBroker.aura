import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { Clock, Sunrise, Sunset, MapPin, CalendarDays } from 'lucide-react';
import SunCalc from 'suncalc';
import type { WidgetProps } from '../../types';
import { useT } from '../../i18n';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { CustomGridView } from './CustomGridView';
import { getWidgetIcon } from '../../utils/widgetIconMap';

type TFn = ReturnType<typeof useT>;

function pad(n: number) {
    return String(n).padStart(2, '0');
}

/** ISO-8601 calendar week (week starts Monday; week 1 contains the first Thursday). */
function isoWeek(d: Date): number {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}

function formatHM(d: Date | null): string {
    if (!d || isNaN(d.getTime())) return '–';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyCustomFormat(
    date: Date,
    fmt: string,
    t: TFn,
    ctx: { city: string; sunrise: Date | null; sunset: Date | null },
): string {
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
        .replace('ss', pad(date.getSeconds()))
        .replace('ww', String(isoWeek(date)))
        .replace('SR', formatHM(ctx.sunrise))
        .replace('SS', formatHM(ctx.sunset))
        .replace('CT', ctx.city);
}

function formatTime(date: Date, showSeconds: boolean): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}${showSeconds ? `:${pad(date.getSeconds())}` : ''}`;
}

/** Renders the date string, wrapping the weekday in its own span when long format is used. */
function DateText({ date, length, t }: { date: Date; length: 'short' | 'long'; t: TFn }) {
    if (length === 'long') {
        const dayName = t(`clock.day.${date.getDay()}` as Parameters<TFn>[0]);
        const monthName = t(`clock.month.${date.getMonth()}` as Parameters<TFn>[0]);
        return (
            <>
                <span className="aura-clock-weekday">{dayName}</span>
                {`, ${date.getDate()}. ${monthName} ${date.getFullYear()}`}
            </>
        );
    }
    return <>{`${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`}</>;
}

export function ClockWidget({ config }: WidgetProps) {
    const t = useT();
    const sys = useSystemConfig();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const opts = config.options ?? {};
    const display = (opts.display as string) ?? 'time';
    const showSeconds = Boolean(opts.showSeconds);
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Clock);
    const dateLength = (opts.dateLength as 'short' | 'long') ?? 'short';
    const customFormat = opts.customFormat as string | undefined;
    const timeFontSize = Number(opts.timeFontSize) || 0;
    const dateFontSize = Number(opts.dateFontSize) || 0;
    const customFontSize = Number(opts.customFontSize) || 0;
    const extrasFontSize = Number(opts.extrasFontSize) || 0;
    const showCity = Boolean(opts.showCity);
    const showSunrise = Boolean(opts.showSunrise);
    const showSunset = Boolean(opts.showSunset);
    const showWeek = Boolean(opts.showWeek);
    const layout = config.layout ?? 'default';

    const sizeStyle = (px: number): CSSProperties => (px > 0 ? { fontSize: `${px}px` } : {});
    const sizeCls = (px: number, fallback: string) => (px > 0 ? '' : fallback);

    // Compute sun times once per day (date-stable); using `now` re-evaluates each tick,
    // but SunCalc is cheap (~µs), so we don't bother memoizing further.
    const sunTimes =
        sys.latitude != null && sys.longitude != null ? SunCalc.getTimes(now, sys.latitude, sys.longitude) : null;
    const sunrise = sunTimes?.sunrise ?? null;
    const sunset = sunTimes?.sunset ?? null;

    const timeStr = formatTime(now, showSeconds);
    const sunriseStr = formatHM(sunrise);
    const sunsetStr = formatHM(sunset);
    const weekStr = `${t('clock.kw')}${isoWeek(now)}`;
    const cityStr = sys.city;
    const customStr = customFormat ? applyCustomFormat(now, customFormat, t, { city: cityStr, sunrise, sunset }) : '';

    // Inline extras row: chips with optional icons, controlled per-field by toggles.
    const extrasFontStyle: CSSProperties = extrasFontSize > 0 ? { fontSize: `${extrasFontSize}px` } : {};
    const extraChip = (icon: ReactNode, text: string, key: string) => (
        <span key={key} className="inline-flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
            {icon}
            <span>{text}</span>
        </span>
    );
    const extrasNodes: ReactNode[] = [];
    if (showWeek) extrasNodes.push(extraChip(<CalendarDays size={12} />, weekStr, 'week'));
    if (showCity && cityStr) extrasNodes.push(extraChip(<MapPin size={12} />, cityStr, 'city'));
    if (showSunrise && sunrise) extrasNodes.push(extraChip(<Sunrise size={12} />, sunriseStr, 'sunrise'));
    if (showSunset && sunset) extrasNodes.push(extraChip(<Sunset size={12} />, sunsetStr, 'sunset'));
    const extrasRow =
        extrasNodes.length > 0 ? (
            <div
                className={`aura-clock-extras flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 ${sizeCls(extrasFontSize, 'text-[11px]')}`}
                style={extrasFontStyle}
            >
                {extrasNodes}
            </div>
        ) : null;

    if (layout === 'custom') {
        const dateStr =
            dateLength === 'long'
                ? `${t(`clock.day.${now.getDay()}` as Parameters<typeof t>[0])}, ${now.getDate()}. ${t(`clock.month.${now.getMonth()}` as Parameters<typeof t>[0])} ${now.getFullYear()}`
                : `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
        const defaultValue = customFormat
            ? customStr
            : display === 'date'
              ? dateStr
              : display === 'datetime'
                ? `${timeStr} ${dateStr}`
                : timeStr;
        const cellIcon = (Icon: typeof Sunrise, color = 'var(--text-secondary)') => (
            <Icon size={20} style={{ color }} />
        );
        return (
            <CustomGridView
                config={config}
                value={defaultValue}
                extraFields={{
                    time: timeStr,
                    date: dateStr,
                    custom: customStr,
                    city: cityStr,
                    sunrise: sunriseStr,
                    sunset: sunsetStr,
                    week: String(isoWeek(now)),
                    kw: weekStr,
                }}
                extraComponents={{
                    icon: <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)' }} />,
                    'sunrise-icon': cellIcon(Sunrise),
                    'sunset-icon': cellIcon(Sunset),
                    'city-icon': cellIcon(MapPin),
                    'week-icon': cellIcon(CalendarDays),
                }}
            />
        );
    }

    // ---------- MINIMAL ----------
    if (layout === 'minimal') {
        const primaryCls = customFormat
            ? 'aura-clock-custom'
            : display === 'date'
              ? 'aura-clock-date'
              : 'aura-clock-time';
        const primaryPx = customFormat ? customFontSize : display === 'date' ? dateFontSize : timeFontSize;
        return (
            <div className="aura-widget-row flex flex-col items-center justify-center h-full gap-1">
                <p
                    className={`aura-widget-value ${primaryCls} ${sizeCls(primaryPx, 'text-xl')} font-bold tabular-nums leading-none text-center`}
                    style={{ color: 'var(--accent)', ...sizeStyle(primaryPx) }}
                >
                    {customFormat ? (
                        customStr
                    ) : display === 'date' ? (
                        <DateText date={now} length={dateLength} t={t} />
                    ) : (
                        timeStr
                    )}
                </p>
                {!customFormat && display === 'datetime' && (
                    <p
                        className={`aura-clock-date ${sizeCls(dateFontSize, 'text-xs')}`}
                        style={{ color: 'var(--text-secondary)', ...sizeStyle(dateFontSize) }}
                    >
                        <DateText date={now} length={dateLength} t={t} />
                    </p>
                )}
                {extrasRow}
            </div>
        );
    }

    // ---------- CARD ----------
    if (layout === 'card') {
        if (customFormat) {
            return (
                <div className="aura-widget-row flex flex-col items-center justify-center h-full gap-1">
                    <p
                        className={`aura-widget-value aura-clock-custom ${sizeCls(customFontSize, 'text-xl')} font-bold tabular-nums text-center`}
                        style={{ color: 'var(--accent)', lineHeight: 1.1, ...sizeStyle(customFontSize) }}
                    >
                        {customStr}
                    </p>
                    {extrasRow}
                    {(showTitle || showIcon) && (
                        <div className="flex items-center gap-1 mt-1 min-w-0">
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
                </div>
            );
        }
        return (
            <div className="aura-widget-row flex flex-col items-center justify-center h-full gap-1.5">
                {display !== 'date' && (
                    <p
                        className={`aura-widget-value aura-clock-time ${sizeCls(timeFontSize, 'text-xl')} font-bold tabular-nums leading-none`}
                        style={{ color: 'var(--accent)', ...sizeStyle(timeFontSize) }}
                    >
                        {timeStr}
                    </p>
                )}
                {display !== 'time' && (
                    <p
                        className={`aura-widget-value aura-clock-date ${display === 'date' ? `${sizeCls(dateFontSize, 'text-2xl')} font-bold tabular-nums` : sizeCls(dateFontSize, 'text-sm')}`}
                        style={{
                            color: display === 'date' ? 'var(--accent)' : 'var(--text-secondary)',
                            ...sizeStyle(dateFontSize),
                        }}
                    >
                        <DateText date={now} length={dateLength} t={t} />
                    </p>
                )}
                {extrasRow}
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 mt-1 min-w-0">
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
            </div>
        );
    }

    // ---------- DEFAULT ----------
    if (customFormat) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 min-w-0">
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
                <div className="flex-1 flex flex-col items-center justify-center gap-1">
                    <p
                        className={`aura-widget-value aura-clock-custom ${sizeCls(customFontSize, 'text-xl')} font-bold tabular-nums`}
                        style={{ color: 'var(--text-primary)', ...sizeStyle(customFontSize) }}
                    >
                        {customStr}
                    </p>
                    {extrasRow}
                </div>
            </div>
        );
    }

    return (
        <div className="aura-widget-row flex flex-col h-full">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1 shrink-0 min-w-0">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                {display !== 'date' && (
                    <p
                        className={`aura-widget-value aura-clock-time ${sizeCls(timeFontSize, 'text-xl')} font-bold tabular-nums leading-none`}
                        style={{ color: 'var(--text-primary)', ...sizeStyle(timeFontSize) }}
                    >
                        {timeStr}
                    </p>
                )}
                {display !== 'time' && (
                    <p
                        className={`aura-widget-value aura-clock-date ${display === 'date' ? `${sizeCls(dateFontSize, 'text-xl')} font-bold` : sizeCls(dateFontSize, 'text-sm')}`}
                        style={{
                            color: display === 'date' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            ...sizeStyle(dateFontSize),
                        }}
                    >
                        <DateText date={now} length={dateLength} t={t} />
                    </p>
                )}
                {extrasRow}
            </div>
        </div>
    );
}
