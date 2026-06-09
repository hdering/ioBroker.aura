import { CircleDot } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { contentPositionClass } from '../../utils/widgetUtils';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

// ── Types ─────────────────────────────────────────────────────────────────────

type StateCfg = {
    type: 'icon' | 'base64';
    icon?: string;
    color: string;
    base64?: string;
    label: string;
};

// ── State display (icon or base64 image) ──────────────────────────────────────

function StateDisplay({ cfg, size, className }: { cfg: StateCfg; size: number; className?: string }) {
    if (cfg.type === 'base64' && cfg.base64) {
        return (
            <img
                src={resolveAssetUrl(cfg.base64)}
                className={className}
                style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
                alt=""
            />
        );
    }
    const Icon = getWidgetIcon(cfg.icon, CircleDot);
    return <Icon className={className} size={size} style={{ color: cfg.color, flexShrink: 0 }} />;
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function StateImageWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const { value } = useDatapoint(config.datapoint);
    const isActive = Boolean(value);
    const layout = config.layout ?? 'default';

    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const showLabel = opts.showLabel !== false;
    const iconSize = (opts.iconSize as number) || 48;

    const trueCfg: StateCfg = {
        type: (opts.trueType as 'icon' | 'base64') ?? 'icon',
        icon: opts.trueIcon as string | undefined,
        color: (opts.trueColor as string) || '#22c55e',
        base64: opts.trueBase64 as string | undefined,
        label: (opts.trueLabel as string) || 'Offen',
    };
    const falseCfg: StateCfg = {
        type: (opts.falseType as 'icon' | 'base64') ?? 'icon',
        icon: opts.falseIcon as string | undefined,
        color: (opts.falseColor as string) || '#6b7280',
        base64: opts.falseBase64 as string | undefined,
        label: (opts.falseLabel as string) || 'Geschlossen',
    };

    const cfg = isActive ? trueCfg : falseCfg;

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={cfg.label}
                extraFields={{
                    label: cfg.label,
                    battery,
                    reach,
                }}
                extraComponents={{
                    icon: <StateDisplay cfg={cfg} size={iconSize} className="aura-widget-icon" />,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
        );

    // ── CARD ──────────────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div
                className="aura-widget-row w-full h-full flex flex-col items-center justify-center gap-2 rounded-widget"
                style={{ position: 'relative', background: 'var(--app-bg)', border: `2px solid ${cfg.color}` }}
            >
                {showIcon && <StateDisplay cfg={cfg} size={iconSize} className="aura-widget-icon" />}
                <div className="text-center">
                    {showTitle && (
                        <p
                            className="aura-widget-title font-bold text-sm"
                            style={{
                                color: 'var(--text-primary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                    {showLabel && (
                        <p className="aura-widget-value text-xs" style={{ color: cfg.color }}>
                            {cfg.label}
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
                {showIcon && <StateDisplay cfg={cfg} size={iconSize} className="aura-widget-icon" />}
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
                        style={{ background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}55` }}
                    >
                        {cfg.label}
                    </span>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── MINIMAL ───────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-1"
                style={{ position: 'relative' }}
            >
                {showIcon && <StateDisplay cfg={cfg} size={iconSize} className="aura-widget-icon" />}
                {showLabel && (
                    <span className="aura-widget-value text-xl font-bold" style={{ color: cfg.color }}>
                        {cfg.label}
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
                    {showIcon && <StateDisplay cfg={cfg} size={iconSize} className="aura-widget-icon" />}
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
                <span className="aura-widget-value text-base font-semibold" style={{ color: cfg.color }}>
                    {cfg.label}
                </span>
            )}
            <StatusBadges config={config} />
        </div>
    );
}
