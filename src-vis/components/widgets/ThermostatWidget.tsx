import React, { useMemo } from 'react';
import { Thermometer, Flame, Wind, Snowflake } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { lookupDatapointName } from '../../hooks/useDatapointList';
import type { WidgetProps, WidgetConfig } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';

// ── helpers ────────────────────────────────────────────────────────────────

function resolveTitle(config: WidgetConfig): string {
    if (config.title?.trim()) return config.title;
    return lookupDatapointName(config.datapoint) ?? config.datapoint.split('.').slice(-2).join(' ');
}

function clamp(v: number, min: number, max: number, step: number) {
    return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

// ── main widget ────────────────────────────────────────────────────────────

export function ThermostatWidget({ config }: WidgetProps) {
    const t = useT();
    const actualDpId = (config.options?.actualDatapoint as string) || '';
    const { value: rawActual } = useDatapoint(actualDpId);
    const { value: rawTarget } = useDatapoint(config.datapoint);
    const { setState } = useIoBroker();

    const minTemp = (config.options?.minTemp as number) ?? 10;
    const maxTemp = (config.options?.maxTemp as number) ?? 30;
    const step = (config.options?.step as number) ?? 0.5;
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showSetpoint = o.showSetpoint !== false;
    const showActualTemp = o.showActualTemp !== false;
    const showControls = o.showControls !== false;
    const showPresets = o.showPresets !== false;
    const presets = (o.presets as number[] | undefined) ?? [18, 20, 22, 24];
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const ThermoIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
    const iconSize = (o.iconSize as number) || 20;
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;

    const target = typeof rawTarget === 'number' ? rawTarget : 20;
    const actual = typeof rawActual === 'number' ? rawActual : null;

    const isHeating = actual !== null && target > actual + 0.2;
    const isCooling = actual !== null && target < actual - 0.2;
    const accentColor = isHeating
        ? 'var(--climate-heat, var(--accent-red))'
        : isCooling
          ? 'var(--climate-cool, var(--accent))'
          : 'var(--text-secondary)';

    // Colour thresholds are evaluated against the measured (actual) temperature
    // and colour the actual reading — not the setpoint, which keeps its
    // heat/cool accent.
    const thresholds = o.colorThresholds as Array<[number, string]> | undefined;
    const thresholdColor = useMemo(() => {
        if (!thresholds?.length || actual === null) return undefined;
        for (const [thresh, color] of thresholds) {
            if (actual < thresh) return color;
        }
        return thresholds[thresholds.length - 1][1];
    }, [thresholds, actual]);

    const displayTitle = resolveTitle(config);

    const setTemp = (v: number) => setState(config.datapoint, clamp(v, minTemp, maxTemp, step));

    const PlusMinus = () => (
        <div className="aura-widget-action flex flex-col gap-1 shrink-0">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setTemp(target + step);
                }}
                className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
            >
                +
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setTemp(target - step);
                }}
                className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
            >
                −
            </button>
        </div>
    );

    const PresetButtons = () => (
        <div className="aura-widget-action nodrag flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {presets.map((v) => {
                const active = Math.abs(target - v) < 0.1;
                return (
                    <button
                        key={v}
                        onClick={() => setTemp(v)}
                        className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80 active:scale-95 transition-all"
                        style={{
                            background: active ? 'var(--accent)' : 'var(--app-border)',
                            color: active ? '#fff' : 'var(--text-primary)',
                        }}
                    >
                        {String(v).replace('.', ',')}°
                    </button>
                );
            })}
        </div>
    );

    const StatusIcon = () =>
        isHeating ? (
            <Flame size={14} style={{ color: 'var(--climate-heat, var(--accent-red))', flexShrink: 0 }} />
        ) : isCooling ? (
            <Snowflake size={14} style={{ color: 'var(--climate-cool, var(--accent))', flexShrink: 0 }} />
        ) : (
            <Wind size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.5 }} />
        );

    const layout = config.layout ?? 'default';
    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    if (layout === 'custom') {
        const btnSty: React.CSSProperties = {
            background: 'var(--app-border)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            width: 28,
            height: 28,
            fontWeight: 'bold',
            fontSize: 16,
            cursor: 'pointer',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        return (
            <CustomGridView
                config={config}
                value={typeof rawTarget === 'number' ? formatNum(rawTarget, decimals) : '–'}
                rawValue={typeof rawTarget === 'number' ? rawTarget : null}
                extraFields={{
                    setpoint: typeof rawTarget === 'number' ? formatNum(rawTarget, decimals) : '–',
                    actual: actual !== null ? formatNum(actual, decimals) : '–',
                    status: isHeating ? 'Heizend' : isCooling ? 'Kühlend' : 'Inaktiv',
                    battery,
                    reach,
                }}
                extraComponents={{
                    icon: showIcon ? (
                        <ThermoIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: accentColor, flexShrink: 0 }}
                        />
                    ) : null,
                    'btn-plus': (
                        <button
                            className="aura-widget-action nodrag"
                            style={btnSty}
                            onClick={() => setTemp(target + step)}
                        >
                            +
                        </button>
                    ),
                    'btn-minus': (
                        <button
                            className="aura-widget-action nodrag"
                            style={btnSty}
                            onClick={() => setTemp(target - step)}
                        >
                            −
                        </button>
                    ),
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
        );
    }

    // ── COMPACT ───────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <>
                <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                    {showIcon && (
                        <ThermoIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: accentColor, flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <span
                            className="aura-widget-title flex-1 text-sm truncate min-w-0"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {displayTitle}
                        </span>
                    )}
                    {!showTitle && <span className="flex-1" />}
                    {showSetpoint && (
                        <span className="aura-widget-value text-xl font-bold shrink-0" style={{ color: accentColor }}>
                            {formatNum(target, decimals)}°C
                            {showActualTemp && actual !== null && (
                                <span
                                    className="font-normal text-xs ml-1"
                                    style={{ color: thresholdColor ?? 'var(--text-secondary)' }}
                                >
                                    / {formatNum(actual, decimals)}°C
                                </span>
                            )}
                        </span>
                    )}
                    {showControls && (
                        <div className="aura-widget-action flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setTemp(target - step)}
                                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                −
                            </button>
                            <button
                                onClick={() => setTemp(target + step)}
                                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                +
                            </button>
                        </div>
                    )}
                    <StatusBadges config={config} />
                </div>
            </>
        );
    }

    // ── MINIMAL ───────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <>
                <div
                    className="aura-widget-row flex flex-col items-center justify-center h-full gap-2"
                    style={{ position: 'relative' }}
                >
                    {showIcon && (
                        <ThermoIcon className="aura-widget-icon" size={iconSize} style={{ color: accentColor }} />
                    )}
                    {showSetpoint && (
                        <span
                            className="aura-widget-value text-xl font-bold"
                            style={{ color: accentColor, lineHeight: 1 }}
                        >
                            {formatNum(target, decimals)}°C
                        </span>
                    )}
                    {showActualTemp && actual !== null && (
                        <span className="text-xs" style={{ color: thresholdColor ?? 'var(--text-secondary)' }}>
                            {t('thermo.actual')} {formatNum(actual, decimals)}°C
                        </span>
                    )}
                    {showControls && (
                        <div className="aura-widget-action flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setTemp(target - step)}
                                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                −
                            </button>
                            <button
                                onClick={() => setTemp(target + step)}
                                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                +
                            </button>
                        </div>
                    )}
                    {showPresets && presets.length > 0 && (
                        <div className="flex justify-center mt-1">
                            <PresetButtons />
                        </div>
                    )}
                    <StatusBadges config={config} />
                </div>
            </>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    return (
        <>
            <div className="aura-widget-row flex flex-col h-full gap-2" style={{ position: 'relative' }}>
                {/* Title row */}
                {(showTitle || showIcon) && (
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {showIcon && (
                                <ThermoIcon
                                    className="aura-widget-icon"
                                    size={iconSize}
                                    style={{ color: accentColor, flexShrink: 0 }}
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
                                    {displayTitle}
                                </p>
                            )}
                        </div>
                        <StatusIcon />
                    </div>
                )}

                {/* Temperature */}
                <div className="flex items-center justify-between flex-1">
                    <div className="aura-widget-value">
                        {showSetpoint && (
                            <p className="text-xl font-bold leading-none" style={{ color: accentColor }}>
                                {formatNum(target, decimals)}°C
                            </p>
                        )}
                        {showActualTemp && actual !== null && (
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('thermo.actual')}:{' '}
                                <span style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
                                    {formatNum(actual, decimals)}°C
                                </span>
                            </p>
                        )}
                    </div>
                    {showControls && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <PlusMinus />
                        </div>
                    )}
                </div>

                {/* Quick-select presets */}
                {showPresets && presets.length > 0 && <PresetButtons />}
                <StatusBadges config={config} />
            </div>
        </>
    );
}
