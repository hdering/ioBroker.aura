import { CalendarClock, CalendarDays, Clock } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useDateValueFields, type DateValueSettings } from '../common/DateValueFields';
import type { DateOutputFormat } from '../../utils/dateValue';
import { StatusBadges } from './StatusBadges';

export function DatePickerWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const settings: DateValueSettings = {
        inputFormat: o.inputFormat === 'custom' ? 'custom' : 'picker',
        inputPattern: o.inputPattern as string | undefined,
        timeOnly: o.timeOnly === true,
        showTime: o.showTime === true,
        outputFormat: (o.outputFormat as DateOutputFormat) ?? 'timestamp_ms',
        outputPattern: o.outputPattern as string | undefined,
    };
    const timeOnly = settings.timeOnly === true;
    const showTime = timeOnly || settings.showTime === true;
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const showCurrent = o.showCurrentValue !== false;
    const layout = config.layout ?? 'default';
    const iconSize = (o.iconSize as number) || 20;
    const defaultIcon = timeOnly ? Clock : showTime ? CalendarClock : CalendarDays;
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, defaultIcon);

    const { value } = useDatapoint(config.datapoint);
    const { setState } = useIoBroker();

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

    // The custom field replaces both native pickers, so the layouts below keep
    // rendering the same two slots.
    const {
        dateInput,
        timeInput,
        currentText: currentDisplay,
    } = useDateValueFields({
        value,
        settings,
        onWrite: (v) => setState(config.datapoint, v),
        className: 'aura-widget-action nodrag focus:outline-none',
        style: inputSty,
        patternAutoWidth: true,
    });

    // ── CARD ─────────────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div
                className="aura-widget-row flex flex-col h-full gap-2 items-center justify-center"
                style={{ position: 'relative' }}
            >
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{ color: 'var(--accent)', opacity: 0.8 }}
                    />
                )}
                {showTitle && (
                    <p
                        className="aura-widget-title text-xs font-medium"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </p>
                )}
                <div className="flex flex-wrap justify-center gap-1.5">
                    {dateInput}
                    {timeInput}
                </div>
                {showCurrent && (
                    <p className="aura-widget-value text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Gesetzt: {currentDisplay}
                    </p>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── COMPACT ───────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{ color: 'var(--accent)', flexShrink: 0 }}
                    />
                )}
                {showTitle && (
                    <span
                        className="aura-widget-title text-sm truncate flex-1 min-w-0"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
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
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-1.5"
                style={{ position: 'relative' }}
            >
                <div className="flex flex-wrap justify-center gap-1.5">
                    {dateInput}
                    {timeInput}
                </div>
                {showCurrent && (
                    <p className="aura-widget-value text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {currentDisplay}
                    </p>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    const posClass = contentPositionClass(o.contentPosition as string | undefined);
    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
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
            <div className="flex flex-wrap gap-1.5">
                {dateInput}
                {timeInput}
            </div>
            {showCurrent && (
                <p className="aura-widget-value text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Gesetzt: {currentDisplay}
                </p>
            )}
            <StatusBadges config={config} />
        </div>
    );
}
