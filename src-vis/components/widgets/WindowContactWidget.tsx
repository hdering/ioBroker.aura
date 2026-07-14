import type { CheckCircle2 } from 'lucide-react';
import { Lock, LockOpen } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import {
    type StateCfg,
    WC_PRESETS,
    WC_FALLBACK,
    matchesValues,
    resolveContactState,
    getWcCfg,
} from '../../utils/windowContact';

// The window-contact presets/helpers moved to utils/windowContact so the list
// widgets can reuse them without importing this widget. Re-exported for the
// existing editor import in WidgetFrame.
export {
    type StateCfg,
    WC_PRESETS,
    WC_PRESET_LABELS,
    WC_FALLBACK,
    matchesValues,
    resolveContactState,
    getWcCfg,
} from '../../utils/windowContact';

// ─── StateDisplay ─────────────────────────────────────────────────────────────

function StateDisplay({
    cfg,
    fallback: Fallback,
    size,
    className,
}: {
    cfg: StateCfg;
    fallback: typeof CheckCircle2;
    size: number;
    className?: string;
}) {
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
    const Icon = getWidgetIcon(cfg.icon, Fallback);
    return <Icon className={className} size={size} style={{ color: cfg.color, flexShrink: 0 }} />;
}

// ─── widget ───────────────────────────────────────────────────────────────────

export function WindowContactWidget({ config }: WidgetProps) {
    const o = config.options ?? {};

    const { value } = useDatapoint(config.datapoint);

    const preset = (o.statePreset as string) ?? 'hmip';
    const state = resolveContactState(value, preset, {
        closed: (o.stateValuesClosed as string) ?? WC_PRESETS.hmip.closed,
        tilted: (o.stateValuesTilted as string) ?? WC_PRESETS.hmip.tilted,
        open: (o.stateValuesOpen as string) ?? WC_PRESETS.hmip.open,
    });

    const layout = config.layout ?? 'default';
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const showLabel = o.showLabel !== false;
    const iconSize = (o.iconSize as number) || 20;

    const cfg = getWcCfg(o, state);
    const fb = WC_FALLBACK[state];

    // Extra DPs for custom layout – hooks must always run unconditionally
    const lockDpId = (o.lockDp as string) ?? '';
    const { value: lockRaw } = useDatapoint(lockDpId);
    const { battery, reach, batteryIcon, reachIcon } = useStatusFields(config);

    // Lock string + icon
    const lockLockedValues = (o.lockLockedValues as string) ?? 'true,1';
    const isLocked = lockDpId ? matchesValues(lockRaw, lockLockedValues) : null;
    const lockStr = isLocked === null ? '' : isLocked ? 'Abgeschlossen' : 'Offen';
    const blue = 'var(--accent, #3b82f6)';
    const green = 'var(--accent-green, #22c55e)';
    const lockColor = isLocked ? blue : green;
    const lockIcon =
        lockDpId && isLocked !== null ? (
            <span
                className="flex items-center justify-center rounded-full"
                style={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    background: `color-mix(in srgb, ${lockColor} 20%, var(--app-surface))`,
                    border: `1px solid color-mix(in srgb, ${lockColor} 50%, transparent)`,
                }}
            >
                {isLocked ? (
                    <Lock size={10} style={{ color: lockColor }} />
                ) : (
                    <LockOpen size={10} style={{ color: lockColor }} />
                )}
            </span>
        ) : null;

    // Combined row: lock + battery + reach (only configured icons)
    const statusBadges =
        lockIcon || batteryIcon || reachIcon ? (
            <span className="flex items-center gap-0.5">
                {lockIcon}
                {batteryIcon}
                {reachIcon}
            </span>
        ) : null;

    // ── custom layout ─────────────────────────────────────────────────────────
    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={cfg.label}
                extraFields={{
                    label: cfg.label,
                    open: state === 'open' ? 'Ja' : 'Nein',
                    tilted: state === 'tilted' ? 'Ja' : 'Nein',
                    closed: state === 'closed' ? 'Ja' : 'Nein',
                    lock: lockStr,
                    battery: battery,
                    reach: reach,
                }}
                extraComponents={{
                    icon: <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} className="aura-widget-icon" />,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'lock-icon': lockIcon,
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
                    background: `linear-gradient(135deg, ${cfg.color}, color-mix(in srgb, ${cfg.color} 60%, black))`,
                    border: `2px solid ${cfg.color}`,
                }}
            >
                {showIcon && <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} className="aura-widget-icon" />}
                <div className="text-center">
                    {showTitle && (
                        <p
                            className="aura-widget-title font-bold text-sm"
                            style={{ color: '#fff', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
                        >
                            {config.title}
                        </p>
                    )}
                    {showLabel && (
                        <p className="aura-widget-value text-xs opacity-80" style={{ color: '#fff' }}>
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
            <div className="aura-widget-row flex items-center gap-3 h-full" style={{ position: 'relative' }}>
                {showIcon && <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} className="aura-widget-icon" />}
                {showTitle && (
                    <span
                        className="aura-widget-title flex-1 text-sm font-medium truncate"
                        style={{
                            color: 'var(--text-primary)',
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

    // ── MINIMAL ──────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-1"
                style={{ position: 'relative' }}
            >
                {showIcon && <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} className="aura-widget-icon" />}
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
    const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2">
                    {showIcon && (
                        <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} className="aura-widget-icon" />
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
            {showLabel && (
                <span className="aura-widget-value text-base font-semibold" style={{ color: cfg.color }}>
                    {cfg.label}
                </span>
            )}
            <StatusBadges config={config} />
        </div>
    );
}
