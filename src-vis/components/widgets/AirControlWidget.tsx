import React, { useEffect, useMemo, useState } from 'react';
import {
    AirVent,
    Power,
    Flame,
    Snowflake,
    Droplets,
    Wind,
    Fan,
    Leaf,
    AlertTriangle,
    Wifi,
    WifiOff,
    Plus,
    Minus,
    Zap,
    Thermometer,
    MoveVertical,
    MoveHorizontal,
    type LucideIcon,
} from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker, getObjectDirect } from '../../hooks/useIoBroker';
import { lookupDatapointName } from '../../hooks/useDatapointList';
import { useT } from '../../i18n';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import type { WidgetProps, WidgetConfig } from '../../types';
import { getProfile, type ClimateEnumEntry } from '../../utils/climateProfiles';

// ── helpers ────────────────────────────────────────────────────────────────

interface EnumOption {
    value: number;
    label: string;
}

/** Parses ioBroker `common.states` (object | legacy "0:a;1:b" string) into a map. */
function parseStates(raw: unknown): Record<string, string> | null {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>;
    if (typeof raw === 'string') {
        const out: Record<string, string> = {};
        raw.split(';').forEach((pair) => {
            const [k, v] = pair.split(':');
            if (k !== undefined && v !== undefined) out[k.trim()] = v.trim();
        });
        return Object.keys(out).length ? out : null;
    }
    return null;
}

/**
 * Resolves selector options for a multi-state DP: prefers the device's live
 * `common.states`, falls back to the profile enum (translated via i18n).
 */
function useEnumOptions(
    dpId: string,
    fallback: ClimateEnumEntry[],
    t: (key: string) => string,
    kind: 'mode' | 'fan',
): EnumOption[] {
    const [states, setStates] = useState<Record<string, string> | null>(null);
    useEffect(() => {
        let alive = true;
        if (!dpId) {
            setStates(null);
            return;
        }
        getObjectDirect(dpId)
            .then((obj) => {
                if (alive) setStates(parseStates((obj?.common as { states?: unknown } | undefined)?.states));
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [dpId]);
    return useMemo(() => {
        if (states) {
            return Object.entries(states)
                .map(([k, v]) => ({ value: Number(k), label: String(v) }))
                .filter((o) => Number.isFinite(o.value));
        }
        return fallback.map((e) => ({ value: e.value, label: t(`aircontrol.${kind}.${e.labelKey}`) }));
    }, [states, fallback, t, kind]);
}

function modeIcon(label: string): LucideIcon | null {
    const l = label.toLowerCase();
    if (l.includes('heat') || l.includes('heiz') || l.includes('wärm')) return Flame;
    if (l.includes('cool') || l.includes('kühl') || l.includes('kalt')) return Snowflake;
    if (l.includes('dry') || l.includes('troc') || l.includes('entf')) return Droplets;
    if (l.includes('vent') || l.includes('fan') || l.includes('lüft') || l.includes('gebläse')) return Wind;
    return null;
}

function clamp(v: number, min: number, max: number, step: number) {
    return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

function resolveTitle(config: WidgetConfig, primaryDp: string): string {
    if (config.title?.trim()) return config.title;
    if (primaryDp) return lookupDatapointName(primaryDp) ?? primaryDp.split('.').slice(0, -2).slice(-1).join(' ');
    return 'Klimasteuerung';
}

// ── selector row ─────────────────────────────────────────────────────────────

function SelectorRow({
    options,
    current,
    onPick,
    withIcons,
}: {
    options: EnumOption[];
    current: number | null;
    onPick: (v: number) => void;
    withIcons?: boolean;
}) {
    return (
        <div className="aura-widget-action nodrag flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {options.map((opt) => {
                const active = current === opt.value;
                const Icon = withIcons ? modeIcon(opt.label) : null;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onPick(opt.value)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80 active:scale-95 transition-all"
                        style={{
                            background: active ? 'var(--accent)' : 'var(--app-border)',
                            color: active ? '#fff' : 'var(--text-primary)',
                        }}
                    >
                        {Icon && <Icon size={13} />}
                        <span className="truncate">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ── main widget ────────────────────────────────────────────────────────────

export function AirControlWidget({ config }: WidgetProps) {
    const t = useT();
    const { setState } = useIoBroker();
    const o = config.options ?? {};

    const profile = getProfile(o.deviceType as string | undefined);

    // Datapoint ids from options.
    const powerDp = (o.powerDp as string) || '';
    const currentTempDp = (o.currentTempDp as string) || '';
    const targetTempDp = (o.targetTempDp as string) || '';
    const modeDp = (o.modeDp as string) || '';
    const fanSpeedDp = (o.fanSpeedDp as string) || '';
    const vaneVDp = (o.vaneVDp as string) || '';
    const vaneHDp = (o.vaneHDp as string) || '';
    const ecoDp = (o.ecoDp as string) || '';
    const onlineDp = (o.onlineDp as string) || '';
    const errorDp = (o.errorDp as string) || '';
    const consumptionDp = (o.consumptionDp as string) || '';
    const outsideTempDp = (o.outsideTempDp as string) || '';

    // Live values.
    const { value: powerRaw } = useDatapoint(powerDp);
    const { value: currentRaw } = useDatapoint(currentTempDp);
    const { value: targetRaw } = useDatapoint(targetTempDp);
    const { value: modeRaw } = useDatapoint(modeDp);
    const { value: fanRaw } = useDatapoint(fanSpeedDp);
    const { value: vaneVRaw } = useDatapoint(vaneVDp);
    const { value: vaneHRaw } = useDatapoint(vaneHDp);
    const { value: ecoRaw } = useDatapoint(ecoDp);
    const { value: onlineRaw } = useDatapoint(onlineDp);
    const { value: errorRaw } = useDatapoint(errorDp);
    const { value: consumptionRaw } = useDatapoint(consumptionDp);
    const { value: outsideRaw } = useDatapoint(outsideTempDp);

    // Display options.
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const showVanes = o.showVanes !== false;
    const showEco = o.showEco !== false;
    const showConsumption = o.showConsumption !== false;
    const showOutside = o.showOutside !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const Icon = getWidgetIcon(o.icon as string | undefined, AirVent);
    const iconSize = (o.iconSize as number) || 20;
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const numFmt = (o.numberFormat as NumberFormat | undefined) ?? globalNumFmt;

    const minTemp = (o.tempMin as number) ?? profile?.tempRange.min ?? 16;
    const maxTemp = (o.tempMax as number) ?? profile?.tempRange.max ?? 31;
    const step = (o.tempStep as number) ?? profile?.tempRange.step ?? 1;

    const tStr = t as (key: string) => string;
    const modeOptions = useEnumOptions(modeDp, profile?.modes ?? [], tStr, 'mode');
    const fanOptions = useEnumOptions(fanSpeedDp, profile?.fanSpeeds ?? [], tStr, 'fan');

    // Coerced values.
    const isOn = powerRaw === true || powerRaw === 1 || powerRaw === 'true';
    const current = typeof currentRaw === 'number' ? currentRaw : null;
    const target = typeof targetRaw === 'number' ? targetRaw : null;
    const mode = typeof modeRaw === 'number' ? modeRaw : null;
    const fan = typeof fanRaw === 'number' ? fanRaw : null;
    const vaneV = typeof vaneVRaw === 'number' ? vaneVRaw : null;
    const vaneH = typeof vaneHRaw === 'number' ? vaneHRaw : null;
    const isEco = ecoRaw === true || ecoRaw === 1;
    const isOnline = onlineDp ? onlineRaw === true || onlineRaw === 1 : null;
    const hasError = errorRaw === true || errorRaw === 1;
    const consumption = typeof consumptionRaw === 'number' ? consumptionRaw : null;
    const outside = typeof outsideRaw === 'number' ? outsideRaw : null;

    const displayTitle = resolveTitle(config, powerDp || currentTempDp || targetTempDp);
    const setTarget = (v: number) => targetTempDp && setState(targetTempDp, clamp(v, minTemp, maxTemp, step));

    // Accent reflects the active mode label.
    const activeModeLabel = modeOptions.find((m) => m.value === mode)?.label ?? '';
    const accent = !isOn
        ? 'var(--text-secondary)'
        : /heat|heiz|wärm/i.test(activeModeLabel)
          ? 'var(--climate-heat, var(--accent-red))'
          : /cool|kühl|kalt/i.test(activeModeLabel)
            ? 'var(--climate-cool, var(--accent))'
            : 'var(--accent)';

    return (
        <div className="aura-widget-row flex flex-col h-full gap-2 min-h-0" style={{ position: 'relative' }}>
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {showIcon && (
                        <Icon className="aura-widget-icon" size={iconSize} style={{ color: accent, flexShrink: 0 }} />
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
                <div className="flex items-center gap-1.5 shrink-0">
                    {isOnline === false && <WifiOff size={13} style={{ color: 'var(--text-secondary)' }} />}
                    {isOnline === true && <Wifi size={13} style={{ color: 'var(--accent)', opacity: 0.7 }} />}
                    {hasError && <AlertTriangle size={13} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                    {powerDp && (
                        <button
                            className="aura-widget-action nodrag flex items-center justify-center rounded-lg active:scale-95 transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                setState(powerDp, !isOn);
                            }}
                            style={{
                                width: 30,
                                height: 30,
                                background: isOn ? 'var(--accent)' : 'var(--app-border)',
                                color: isOn ? '#fff' : 'var(--text-secondary)',
                            }}
                            title={t('aircontrol.power')}
                        >
                            <Power size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Temperatures */}
            <div className="flex items-end justify-between gap-2">
                <div className="aura-widget-value min-w-0">
                    {current !== null && (
                        <p className="text-2xl font-bold leading-none" style={{ color: accent }}>
                            {formatNum(current, decimals, numFmt)}
                            <span className="text-sm font-normal" style={{ color: 'var(--text-secondary)' }}>
                                °C
                            </span>
                        </p>
                    )}
                    {target !== null && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {t('aircontrol.targetTemp')}: {formatNum(target, decimals, numFmt)}°C
                        </p>
                    )}
                </div>
                {targetTempDp && target !== null && (
                    <div
                        className="aura-widget-action nodrag flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setTarget(target - step)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 active:scale-95 transition-all"
                            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                        >
                            <Minus size={16} />
                        </button>
                        <span
                            className="text-lg font-bold tabular-nums min-w-[3ch] text-center"
                            style={{ color: accent }}
                        >
                            {formatNum(target, decimals, numFmt)}°
                        </span>
                        <button
                            onClick={() => setTarget(target + step)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 active:scale-95 transition-all"
                            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Mode */}
            {modeDp && modeOptions.length > 0 && (
                <div className="flex flex-col gap-1">
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('aircontrol.mode')}
                    </span>
                    <SelectorRow options={modeOptions} current={mode} onPick={(v) => setState(modeDp, v)} withIcons />
                </div>
            )}

            {/* Fan speed */}
            {fanSpeedDp && fanOptions.length > 0 && (
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <Fan size={11} /> {t('aircontrol.fanSpeed')}
                    </span>
                    <SelectorRow options={fanOptions} current={fan} onPick={(v) => setState(fanSpeedDp, v)} />
                </div>
            )}

            {/* Vanes */}
            {showVanes && (vaneVDp || vaneHDp) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {vaneVDp && vaneV !== null && (
                        <span
                            className="text-[11px] flex items-center gap-1"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <MoveVertical size={11} /> {t('aircontrol.vaneV')}: {vaneV}
                        </span>
                    )}
                    {vaneHDp && vaneH !== null && (
                        <span
                            className="text-[11px] flex items-center gap-1"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <MoveHorizontal size={11} /> {t('aircontrol.vaneH')}: {vaneH}
                        </span>
                    )}
                </div>
            )}

            {/* Footer: eco toggle + info */}
            <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    {showEco && ecoDp && (
                        <button
                            className="aura-widget-action nodrag flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                setState(ecoDp, !isEco);
                            }}
                            style={{
                                background: isEco ? 'var(--accent-green, #22c55e)' : 'var(--app-border)',
                                color: isEco ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            <Leaf size={13} /> {t('aircontrol.eco')}
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {showConsumption && consumption !== null && (
                        <span className="flex items-center gap-1">
                            <Zap size={11} /> {formatNum(consumption, 0)} W
                        </span>
                    )}
                    {showOutside && outside !== null && (
                        <span className="flex items-center gap-1">
                            <Thermometer size={11} /> {formatNum(outside, decimals, numFmt)}°C
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
