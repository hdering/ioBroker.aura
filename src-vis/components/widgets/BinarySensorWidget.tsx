import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

// Preset configurations per sensor sub-type
export const BINARY_SENSOR_PRESETS: Record<
    string,
    {
        labelOn: string;
        labelOff: string;
        colorOn: string;
        colorOff: string;
    }
> = {
    motion: { labelOn: 'Bewegung', labelOff: 'Ruhig', colorOn: '#f59e0b', colorOff: 'var(--accent-green)' },
    smoke: {
        labelOn: 'Alarm!',
        labelOff: 'OK',
        colorOn: 'var(--accent-red, #ef4444)',
        colorOff: 'var(--accent-green)',
    },
    doorbell: { labelOn: 'Klingelt', labelOff: 'Ruhig', colorOn: '#f59e0b', colorOff: 'var(--text-secondary)' },
    vibration: { labelOn: 'Vibration', labelOff: 'Ruhig', colorOn: '#f59e0b', colorOff: 'var(--accent-green)' },
    flood: {
        labelOn: 'Wasser!',
        labelOff: 'Trocken',
        colorOn: 'var(--accent-red, #ef4444)',
        colorOff: 'var(--accent-green)',
    },
    lowbat: { labelOn: 'Leer', labelOff: 'OK', colorOn: 'var(--accent-red, #ef4444)', colorOff: 'var(--accent-green)' },
    generic: {
        labelOn: 'Aktiv',
        labelOff: 'Inaktiv',
        colorOn: 'var(--accent-green)',
        colorOff: 'var(--text-secondary)',
    },
};

export function BinarySensorWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const { value } = useDatapoint(config.datapoint);

    const isActive = Boolean(value);
    const layout = config.layout ?? 'default';

    const preset = BINARY_SENSOR_PRESETS[(opts.sensorType as string) ?? 'generic'];
    const labelOn = (opts.labelOn as string) || preset.labelOn;
    const labelOff = (opts.labelOff as string) || preset.labelOff;
    const colorOn = (opts.colorOn as string) || preset.colorOn;
    const colorOff = (opts.colorOff as string) || preset.colorOff;

    const label = isActive ? labelOn : labelOff;
    const color = isActive ? colorOn : colorOff;
    // Keep the icon component reference stable across active/inactive toggles.
    // A custom Iconify icon is cached by iconId+fallback, so flipping the
    // fallback (ShieldAlert/CheckCircle2) with isActive would remount the
    // wrapper on every state change → brief reload → title shift. With a custom
    // icon we therefore pin one fallback; without one the static Lucide icon
    // swaps instantly and can still reflect the state.
    const Icon = opts.icon ? getWidgetIcon(opts.icon as string, ShieldAlert) : isActive ? ShieldAlert : CheckCircle2;
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const showLabel = opts.showLabel !== false;
    const iconSize = (opts.iconSize as number) || 20;

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={isActive ? labelOn : labelOff}
                extraFields={{
                    label: isActive ? labelOn : labelOff,
                    labelOn: labelOn,
                    labelOff: labelOff,
                    active: isActive ? 'Ja' : 'Nein',
                    battery,
                    reach,
                }}
                extraComponents={{
                    icon: <Icon className="aura-widget-icon" size={iconSize} style={{ color, flexShrink: 0 }} />,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
        );

    // ── CARD ─────────────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div
                className="aura-widget-row w-full h-full flex flex-col items-center justify-center gap-2 rounded-widget"
                style={{
                    position: 'relative',
                    background: isActive
                        ? `linear-gradient(135deg, ${colorOn}, color-mix(in srgb, ${colorOn} 60%, black))`
                        : 'var(--app-bg)',
                    border: `2px solid ${color}`,
                }}
            >
                {showIcon && (
                    <Icon className="aura-widget-icon" size={iconSize} style={{ color: isActive ? '#fff' : color }} />
                )}
                <div className="text-center">
                    {showTitle && (
                        <p
                            className="aura-widget-title font-bold text-sm"
                            style={{
                                color: isActive ? '#fff' : 'var(--text-primary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                    {showLabel && (
                        <p
                            className="aura-widget-value text-xs opacity-80"
                            style={{ color: isActive ? '#fff' : color }}
                        >
                            {label}
                        </p>
                    )}
                </div>
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── COMPACT ──────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                {showIcon && <Icon className="aura-widget-icon" size={iconSize} style={{ color, flexShrink: 0 }} />}
                {showTitle && (
                    <span
                        className="aura-widget-title flex-1 text-sm truncate"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                {!showTitle && <span className="flex-1" />}
                {showLabel && (
                    <span
                        className="aura-widget-value text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
                    >
                        {label}
                    </span>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── MINIMAL ──────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-1"
                style={{ position: 'relative' }}
            >
                {showIcon && <Icon className="aura-widget-icon" size={iconSize} style={{ color }} />}
                {showLabel && (
                    <span className="aura-widget-value text-xl font-bold" style={{ color }}>
                        {label}
                    </span>
                )}
                {showTitle && (
                    <span
                        className="aura-widget-title text-xs"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    const posClass = contentPositionClass(opts.contentPosition as string | undefined);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2">
                    {showIcon && <Icon className="aura-widget-icon" size={iconSize} style={{ color, flexShrink: 0 }} />}
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
            {showLabel && (
                <span className="aura-widget-value text-base font-semibold" style={{ color }}>
                    {label}
                </span>
            )}
            <StatusBadges config={config} />
        </div>
    );
}
