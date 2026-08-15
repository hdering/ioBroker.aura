import { Gauge } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum, type NumberFormat } from '../../utils/formatValue';

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
    numFmt?: NumberFormat;
    strokeWidth: number;
    colorZones: boolean;
    zones: ColorZone[];
    showMinMax: boolean;
    showValue: boolean;
    valueFontSize?: number;
    scale?: number;
}

const DEFAULT_VALUE_FONT_SIZE = 22;
const CENTER_DOT_R = 5;

/** Arc/needle color for the primary pointer – zone color when zones are active, else its fixed color. */
function resolvePrimaryColor(value: number, fallback: string, colorZones: boolean, zones: ColorZone[]): string {
    if (!colorZones || zones.length === 0) return fallback;
    const match = zones.find((z) => value <= z.max);
    return match ? match.color : zones[zones.length - 1].color;
}

function GaugeSVG({
    pointers,
    min,
    max,
    unit,
    decimals,
    numFmt,
    strokeWidth,
    colorZones,
    zones,
    showMinMax,
    showValue,
    valueFontSize,
    scale = 1,
}: GaugeSVGProps) {
    const cx = 100,
        cy = 100,
        r = 80;
    const primary = pointers[0];

    // Value text: baseline placed so the digit tops stay clear of the centre dot,
    // and the viewBox grows with the font size so nothing is clipped at the bottom.
    const valueFs = valueFontSize && valueFontSize > 0 ? valueFontSize : DEFAULT_VALUE_FONT_SIZE;
    const unitFs = Math.max(7, Math.round(valueFs * 0.6));
    const valueBaseline = cy + CENTER_DOT_R + 4 + valueFs * 0.72;
    const vbHeight = showValue ? Math.max(120, Math.ceil(valueBaseline + valueFs * 0.12)) : 120;

    const primaryColor = resolvePrimaryColor(primary.value, primary.color, colorZones, zones);

    const displayVal = isNaN(primary.value) ? '–' : formatNum(primary.value, decimals, numFmt);

    // Needle lengths: primary longest, secondary progressively shorter
    const needleLengths = [r - 8, r - 16, r - 24];

    return (
        <svg viewBox={`0 0 200 ${vbHeight}`} style={{ width: 200 * scale, height: vbHeight * scale, display: 'block' }}>
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
                        stroke="var(--gauge-track, var(--app-border))"
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
            <circle cx={cx} cy={cy} r={CENTER_DOT_R} fill={primaryColor} />

            {/* Primary value text */}
            {showValue && (
                <text
                    x={cx}
                    y={valueBaseline}
                    textAnchor="middle"
                    fontSize={valueFs}
                    fontWeight="bold"
                    fill="var(--text-primary)"
                >
                    {displayVal}
                    {unit && (
                        <tspan fontSize={unitFs} fill="var(--text-secondary)" dx={2}>
                            {unit}
                        </tspan>
                    )}
                </text>
            )}

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

    // Display-only transform: live DP values are mapped into display space, while
    // static min/max and zones stay as configured (user enters them in display units).
    const factor = Number(opts.valueFactor ?? 1);
    const offset = Number(opts.valueOffset ?? 0);
    const tx = (n: number): number => n * factor + offset;

    const staticMin = (opts.minValue as number) ?? 0;
    const staticMax = (opts.maxValue as number) ?? 100;

    const resolvedMin =
        minDp && minDpVal !== undefined && minDpVal !== null ? tx(parseFloat(String(minDpVal))) : staticMin;
    const resolvedMax =
        maxDp && maxDpVal !== undefined && maxDpVal !== null ? tx(parseFloat(String(maxDpVal))) : staticMax;

    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const unit = (opts.unit as string) ?? '';
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const numFmt = (opts.numberFormat as NumberFormat | undefined) ?? globalNumFmt;
    const strokeWidth = (opts.strokeWidth as number) ?? 12;
    const colorZones = (opts.colorZones as boolean) ?? false;
    const showMinMax = (opts.showMinMax as boolean) ?? true;
    const showValue = opts.showValue !== false;
    const showValueBadge = !!opts.showValueBadge;
    const valueFontSize = (opts.valueFontSize as number) || DEFAULT_VALUE_FONT_SIZE;

    const numVal = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
    const safeVal = isNaN(numVal) ? resolvedMin : tx(numVal);

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
    const ptr1Color = (opts.pointer1Color as string) ?? 'var(--gauge-arc, var(--accent))';
    const pointers: PointerDef[] = [
        { value: safeVal, color: ptr1Color, label: (opts.pointer1Label as string) || config.title || undefined },
    ];
    if (ptr2Dp) {
        const v = parseFloat(String(val2 ?? 0));
        pointers.push({
            value: isNaN(v) ? effectiveMin : tx(v),
            color: (opts.pointer2Color as string) ?? '#f97316',
            label: (opts.pointer2Label as string) || undefined,
        });
    }
    if (ptr3Dp) {
        const v = parseFloat(String(val3 ?? 0));
        pointers.push({
            value: isNaN(v) ? effectiveMin : tx(v),
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
        numFmt,
        strokeWidth,
        colorZones,
        zones,
        showMinMax,
        showValue,
        valueFontSize,
    };

    const renderBadge = (key: string, val: number, color: string, label?: string) => {
        const dispVal = isNaN(val) ? '–' : formatNum(val, decimals, numFmt);
        return (
            <span
                key={key}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
            >
                <span className="font-bold tabular-nums">
                    {dispVal}
                    {unit}
                </span>
                {label && <span className="opacity-80">{label}</span>}
            </span>
        );
    };

    // Main value as a badge below the arc – zone-coloured like the arc itself.
    // The title already sits in the header, so only an explicit pointer 1 label is repeated here.
    const badges = showValueBadge
        ? [
              renderBadge(
                  'primary',
                  safeVal,
                  resolvePrimaryColor(safeVal, ptr1Color, colorZones, zones),
                  (opts.pointer1Label as string) || undefined,
              ),
          ]
        : [];
    // Secondary pointer badges
    badges.push(...pointers.slice(1).map((ptr, i) => renderBadge(`ptr${i}`, ptr.value, ptr.color, ptr.label)));

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
            {badges.length > 0 && <div className="flex flex-wrap justify-center gap-1.5 pb-1 shrink-0">{badges}</div>}
        </div>
    );
}
