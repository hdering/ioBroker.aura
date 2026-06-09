import { Gauge } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number): number {
    if (max <= min) return -180;
    const clamped = Math.max(min, Math.min(max, value));
    return -180 + ((clamped - min) / (max - min)) * 180;
}

export interface ColorZone {
    max: number;
    color: string;
}

export interface PointerDef {
    value: number;
    color: string;
    label?: string;
}

interface GaugeSVGProps {
    pointers: PointerDef[]; // [0] = primary
    min: number;
    max: number;
    unit: string;
    decimals: number;
    strokeWidth: number;
    colorZones: boolean;
    zones: ColorZone[];
    showMinMax: boolean;
    scale?: number;
}

function GaugeSVG({
    pointers,
    min,
    max,
    unit,
    decimals,
    strokeWidth,
    colorZones,
    zones,
    showMinMax,
    scale = 1,
}: GaugeSVGProps) {
    const cx = 100,
        cy = 100,
        r = 80;
    const primary = pointers[0];

    // Determine primary color (zone-based or fixed)
    let primaryColor = primary.color;
    if (colorZones && zones.length > 0) {
        const match = zones.find((z) => primary.value <= z.max);
        primaryColor = match ? match.color : zones[zones.length - 1].color;
    }

    const displayVal = isNaN(primary.value) ? '–' : formatNum(primary.value, decimals);

    // Needle lengths: primary longest, secondary progressively shorter
    const needleLengths = [r - 8, r - 16, r - 24];

    return (
        <svg viewBox="0 0 200 120" style={{ width: 200 * scale, height: 120 * scale, display: 'block' }}>
            {colorZones && zones.length > 0 ? (
                /* Zone arcs – cover the full track, no background track underneath */
                <>
                    {zones.map((zone, i) => {
                        const prevMax = i === 0 ? min : zones[i - 1].max;
                        const zoneMax = i === zones.length - 1 ? max : zone.max;
                        const startAngle = valueToAngle(prevMax, min, max);
                        const endAngle = valueToAngle(zoneMax, min, max);
                        if (endAngle <= startAngle) return null;
                        return (
                            <path
                                key={i}
                                d={describeArc(cx, cy, r, startAngle, endAngle)}
                                fill="none"
                                stroke={zone.color}
                                strokeWidth={strokeWidth}
                                strokeLinecap="butt"
                            />
                        );
                    })}
                    {/* Rounded caps at the outer gauge endpoints (first/last zone color) */}
                    {(() => {
                        const p0 = polarToCartesian(cx, cy, r, -180);
                        const p1 = polarToCartesian(cx, cy, r, 0);
                        const cr = strokeWidth / 2;
                        return (
                            <>
                                <circle cx={p0.x} cy={p0.y} r={cr} fill={zones[0].color} />
                                <circle cx={p1.x} cy={p1.y} r={cr} fill={zones[zones.length - 1].color} />
                            </>
                        );
                    })()}
                </>
            ) : (
                /* Background track + value fill when no color zones */
                <>
                    <path
                        d={describeArc(cx, cy, r, -180, 0)}
                        fill="none"
                        stroke="var(--app-border)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                    <path
                        d={describeArc(cx, cy, r, -180, valueToAngle(primary.value, min, max))}
                        fill="none"
                        stroke={primaryColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                </>
            )}

            {/* Needles (render from last to first so primary is on top) */}
            {[...pointers].reverse().map((ptr, revIdx) => {
                const idx = pointers.length - 1 - revIdx;
                const angle = valueToAngle(ptr.value, min, max);
                const len = needleLengths[Math.min(idx, needleLengths.length - 1)];
                const tip = polarToCartesian(cx, cy, len, angle);
                const sw = idx === 0 ? 2.5 : idx === 1 ? 2.0 : 1.5;
                const color = idx === 0 ? primaryColor : ptr.color;
                return (
                    <line
                        key={idx}
                        x1={cx}
                        y1={cy}
                        x2={tip.x}
                        y2={tip.y}
                        stroke={color}
                        strokeWidth={sw}
                        strokeLinecap="round"
                    />
                );
            })}

            {/* Center circle */}
            <circle cx={cx} cy={cy} r={5} fill={primaryColor} />

            {/* Primary value text */}
            <text x={cx} y={cy + 18} textAnchor="middle" fontSize={22} fontWeight="bold" fill="var(--text-primary)">
                {displayVal}
                {unit && (
                    <tspan fontSize={13} fill="var(--text-secondary)" dx={2}>
                        {unit}
                    </tspan>
                )}
            </text>

            {/* Min/Max labels – centred below the arc endpoints, clear of the stroke */}
            {showMinMax && (
                <>
                    <text x={cx - r} y={cy + 16} fontSize={10} fill="var(--text-secondary)" textAnchor="middle">
                        {min}
                    </text>
                    <text x={cx + r} y={cy + 16} fontSize={10} fill="var(--text-secondary)" textAnchor="middle">
                        {max}
                    </text>
                </>
            )}
        </svg>
    );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function GaugeWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};

    const { value } = useDatapoint(config.datapoint);

    const minDp = (opts.minDatapoint as string) ?? '';
    const maxDp = (opts.maxDatapoint as string) ?? '';
    const { value: minDpVal } = useDatapoint(minDp);
    const { value: maxDpVal } = useDatapoint(maxDp);

    const ptr2Dp = (opts.pointer2Datapoint as string) ?? '';
    const ptr3Dp = (opts.pointer3Datapoint as string) ?? '';
    const { value: val2 } = useDatapoint(ptr2Dp);
    const { value: val3 } = useDatapoint(ptr3Dp);

    const staticMin = (opts.minValue as number) ?? 0;
    const staticMax = (opts.maxValue as number) ?? 100;

    const resolvedMin = minDp && minDpVal !== undefined && minDpVal !== null ? parseFloat(String(minDpVal)) : staticMin;
    const resolvedMax = maxDp && maxDpVal !== undefined && maxDpVal !== null ? parseFloat(String(maxDpVal)) : staticMax;

    const { defaultDecimals } = useGlobalSettingsStore();
    const unit = (opts.unit as string) ?? '';
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const strokeWidth = (opts.strokeWidth as number) ?? 12;
    const colorZones = (opts.colorZones as boolean) ?? false;
    const showMinMax = (opts.showMinMax as boolean) ?? true;

    const numVal = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
    const safeVal = isNaN(numVal) ? resolvedMin : numVal;

    const dynamicMaxEnabled = !!opts.dynamicMax;
    const effectiveMax = dynamicMaxEnabled ? Math.max(resolvedMax, safeVal) : resolvedMax;
    const effectiveMin = resolvedMin;
    const range = effectiveMax - effectiveMin;

    // Build zones array – new format (opts.zones) takes priority,
    // falls back to legacy zone1Max/zone2Max/zone1Color/… properties.
    const zones: ColorZone[] = (() => {
        const raw = opts.zones as ColorZone[] | undefined;
        if (raw && raw.length > 0) return raw;
        return [
            {
                max: (opts.zone1Max as number) ?? effectiveMin + range * 0.33,
                color: (opts.zone1Color as string) ?? '#10b981',
            },
            {
                max: (opts.zone2Max as number) ?? effectiveMin + range * 0.66,
                color: (opts.zone2Color as string) ?? '#f59e0b',
            },
            { max: effectiveMax, color: (opts.zone3Color as string) ?? '#ef4444' },
        ];
    })();

    // Build pointers array
    const ptr1Color = (opts.pointer1Color as string) ?? 'var(--accent)';
    const pointers: PointerDef[] = [
        { value: safeVal, color: ptr1Color, label: (opts.pointer1Label as string) || config.title || undefined },
    ];
    if (ptr2Dp) {
        const v = parseFloat(String(val2 ?? 0));
        pointers.push({
            value: isNaN(v) ? effectiveMin : v,
            color: (opts.pointer2Color as string) ?? '#f97316',
            label: (opts.pointer2Label as string) || undefined,
        });
    }
    if (ptr3Dp) {
        const v = parseFloat(String(val3 ?? 0));
        pointers.push({
            value: isNaN(v) ? effectiveMin : v,
            color: (opts.pointer3Color as string) ?? '#8b5cf6',
            label: (opts.pointer3Label as string) || undefined,
        });
    }

    const gaugeProps: GaugeSVGProps = {
        pointers,
        min: effectiveMin,
        max: effectiveMax,
        unit,
        decimals,
        strokeWidth,
        colorZones,
        zones,
        showMinMax,
    };

    // Secondary pointer badges
    const secondaryBadges = pointers.slice(1).map((ptr, i) => {
        const dispVal = isNaN(ptr.value) ? '–' : formatNum(ptr.value, decimals);
        return (
            <span
                key={i}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: `${ptr.color}22`, color: ptr.color, border: `1px solid ${ptr.color}55` }}
            >
                <span className="font-bold tabular-nums">
                    {dispVal}
                    {unit}
                </span>
                {ptr.label && <span className="opacity-80">{ptr.label}</span>}
            </span>
        );
    });

    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const GaugeIcon = getWidgetIcon(opts.icon as string | undefined, Gauge);

    return (
        <div className="aura-widget-row flex flex-col h-full">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                    {showIcon && (
                        <GaugeIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs truncate"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                                flex: '1',
                                minWidth: 0,
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
            )}
            <div className="aura-widget-value flex-1 flex items-center justify-center">
                <GaugeSVG {...gaugeProps} scale={0.95} />
            </div>
            {secondaryBadges.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 pb-1 shrink-0">{secondaryBadges}</div>
            )}
        </div>
    );
}
