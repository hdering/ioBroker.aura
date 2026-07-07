import { useId } from 'react';
import { Droplets } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';

export interface ColorZone {
    max: number;
    color: string;
}

type Orientation = 'vertical' | 'horizontal';

interface TankProps {
    pct: number;
    value: number;
    min: number;
    max: number;
    unit: string;
    decimals: number;
    fillColor: string;
    zones: ColorZone[];
    colorZones: boolean;
    showTicks: boolean;
    showValue: boolean;
    uid: string;
}

// ── Vertical tank ──────────────────────────────────────────────────────────
function TankVertical({
    pct,
    value,
    min,
    max,
    unit,
    decimals,
    fillColor,
    zones,
    colorZones,
    showTicks,
    showValue,
    uid,
}: TankProps) {
    // Layout constants (viewBox 0 0 100 220)
    const bx = 32,
        by = 10,
        bw = 42,
        bh = 185,
        br = 13;
    const fillH = Math.max(0, (pct / 100) * bh);
    const fillY = by + bh - fillH;
    const clipId = `fv-${uid}`;
    const labelY = Math.max(fillY + 4, by + 12); // clamp so label stays inside viewBox

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals);

    const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

    return (
        <svg viewBox="0 0 100 220" style={{ width: '100%', height: '100%' }} overflow="visible">
            <defs>
                <clipPath id={clipId}>
                    <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                </clipPath>
            </defs>

            {/* Tank background */}
            <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Zone bands – entire tank at 45% (vivid context) */}
            {colorZones &&
                zones.map((zone, i) => {
                    const prev = i === 0 ? min : zones[i - 1].max;
                    const s = max > min ? Math.max(0, Math.min(1, (prev - min) / (max - min))) : 0;
                    const e = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
                    const zH = (e - s) * bh;
                    const zY = by + bh - e * bh;
                    return zH > 0 ? (
                        <rect
                            key={`bg-${i}`}
                            x={bx}
                            y={zY}
                            width={bw}
                            height={zH}
                            fill={zone.color}
                            clipPath={`url(#${clipId})`}
                        />
                    ) : null;
                })}

            {/* Fill – zone-colored segments at 100% up to fill level */}
            {colorZones &&
                fillH > 0 &&
                zones.map((zone, i) => {
                    const prev = i === 0 ? min : zones[i - 1].max;
                    const sRaw = max > min ? Math.max(0, Math.min(1, (prev - min) / (max - min))) : 0;
                    const eRaw = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
                    const fp = pct / 100;
                    const s = Math.min(sRaw, fp);
                    const e = Math.min(eRaw, fp);
                    if (e <= s) return null;
                    const segH = (e - s) * bh;
                    const segY = by + bh - e * bh;
                    return (
                        <rect
                            key={`fill-${i}`}
                            x={bx}
                            y={segY}
                            width={bw}
                            height={segH}
                            fill={zone.color}
                            clipPath={`url(#${clipId})`}
                        />
                    );
                })}

            {/* Fill – single color (no zones) */}
            {!colorZones && fillH > 0 && (
                <rect x={bx} y={fillY} width={bw} height={fillH} fill={fillColor} clipPath={`url(#${clipId})`} />
            )}

            {/* Tank border on top */}
            <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="none"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Tick marks + labels (left side) */}
            {showTicks &&
                TICKS.map((t, i) => {
                    const y = by + bh * (1 - t);
                    const v = min + t * (max - min);
                    return (
                        <g key={i}>
                            <line x1={bx - 1} y1={y} x2={bx + 9} y2={y} stroke="var(--app-border)" strokeWidth={1.5} />
                            <text
                                x={bx - 4}
                                y={y + 3.5}
                                fontSize={8}
                                textAnchor="end"
                                fill="var(--text-secondary)"
                                opacity={0.75}
                            >
                                {decimals === 0 ? Math.round(v) : v.toFixed(1)}
                            </text>
                        </g>
                    );
                })}

            {/* Value label – right side, at fill level */}
            {showValue && (
                <text
                    x={bx + bw + 5}
                    y={labelY}
                    fontSize={11}
                    fontWeight="bold"
                    fill="var(--text-primary)"
                    textAnchor="start"
                >
                    {displayVal}
                    {unit && (
                        <tspan fontSize={9} fill="var(--text-secondary)" dx={1}>
                            {unit}
                        </tspan>
                    )}
                </text>
            )}

            {/* Fill-level indicator line */}
            {showValue && fillH > 0 && (
                <line
                    x1={bx + bw}
                    y1={fillY}
                    x2={bx + bw + 4}
                    y2={fillY}
                    stroke={fillColor}
                    strokeWidth={1}
                    opacity={0.6}
                />
            )}
        </svg>
    );
}

// ── Horizontal tank ────────────────────────────────────────────────────────
function TankHorizontal({
    pct,
    value,
    min,
    max,
    unit,
    decimals,
    fillColor,
    zones,
    colorZones,
    showTicks,
    showValue,
    uid,
}: TankProps) {
    // Layout constants (viewBox 0 0 220 80)
    const bx = 10,
        by = 24,
        bw = 185,
        bh = 42,
        br = 13;
    const fillW = Math.max(0, (pct / 100) * bw);
    const clipId = `fh-${uid}`;

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals);

    const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

    return (
        <svg viewBox="0 0 220 80" style={{ width: '100%', height: '100%' }} overflow="visible">
            <defs>
                <clipPath id={clipId}>
                    <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                </clipPath>
            </defs>

            {/* Tank background */}
            <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Zone bands – entire tank at 45% */}
            {colorZones &&
                zones.map((zone, i) => {
                    const prev = i === 0 ? min : zones[i - 1].max;
                    const s = max > min ? Math.max(0, Math.min(1, (prev - min) / (max - min))) : 0;
                    const e = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
                    const zW = (e - s) * bw;
                    const zX = bx + s * bw;
                    return zW > 0 ? (
                        <rect
                            key={`bg-${i}`}
                            x={zX}
                            y={by}
                            width={zW}
                            height={bh}
                            fill={zone.color}
                            clipPath={`url(#${clipId})`}
                        />
                    ) : null;
                })}

            {/* Fill – zone-colored segments at 100% up to fill level */}
            {colorZones &&
                fillW > 0 &&
                zones.map((zone, i) => {
                    const prev = i === 0 ? min : zones[i - 1].max;
                    const sRaw = max > min ? Math.max(0, Math.min(1, (prev - min) / (max - min))) : 0;
                    const eRaw = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
                    const fp = pct / 100;
                    const s = Math.min(sRaw, fp);
                    const e = Math.min(eRaw, fp);
                    if (e <= s) return null;
                    const segW = (e - s) * bw;
                    const segX = bx + s * bw;
                    return (
                        <rect
                            key={`fill-${i}`}
                            x={segX}
                            y={by}
                            width={segW}
                            height={bh}
                            fill={zone.color}
                            clipPath={`url(#${clipId})`}
                        />
                    );
                })}

            {/* Fill – single color (no zones) */}
            {!colorZones && fillW > 0 && (
                <rect x={bx} y={by} width={fillW} height={bh} fill={fillColor} clipPath={`url(#${clipId})`} />
            )}

            {/* Tank border on top */}
            <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="none"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Tick marks + labels (top side) */}
            {showTicks &&
                TICKS.map((t, i) => {
                    const x = bx + t * bw;
                    const v = min + t * (max - min);
                    return (
                        <g key={i}>
                            <line x1={x} y1={by - 1} x2={x} y2={by + 10} stroke="var(--app-border)" strokeWidth={1.5} />
                            <text
                                x={x}
                                y={by - 4}
                                fontSize={8}
                                textAnchor="middle"
                                fill="var(--text-secondary)"
                                opacity={0.75}
                            >
                                {decimals === 0 ? Math.round(v) : v.toFixed(1)}
                            </text>
                        </g>
                    );
                })}

            {/* Fill-level indicator line – white halo + colored line for contrast on any zone color */}
            {showValue && fillW > 0 && (
                <g>
                    <line
                        x1={bx + fillW}
                        y1={by - 4}
                        x2={bx + fillW}
                        y2={by + bh + 4}
                        stroke="white"
                        strokeWidth={3}
                        opacity={0.5}
                    />
                    <line
                        x1={bx + fillW}
                        y1={by - 4}
                        x2={bx + fillW}
                        y2={by + bh + 4}
                        stroke={fillColor}
                        strokeWidth={1.5}
                    />
                </g>
            )}

            {/* Value label – right of tank */}
            {showValue && (
                <text
                    x={bx + bw + 7}
                    y={by + bh / 2 + 4}
                    fontSize={12}
                    fontWeight="bold"
                    fill="var(--text-primary)"
                    textAnchor="start"
                >
                    {displayVal}
                    {unit && (
                        <tspan fontSize={9} fill="var(--text-secondary)" dx={1}>
                            {unit}
                        </tspan>
                    )}
                </text>
            )}
        </svg>
    );
}

// ── LED Segments ──────────────────────────────────────────────────────────
function SegmentsViz({
    pct,
    value,
    min,
    max,
    unit,
    decimals,
    fillColor,
    zones,
    colorZones,
    showValue,
    orientation,
}: Pick<
    TankProps,
    'pct' | 'value' | 'min' | 'max' | 'unit' | 'decimals' | 'fillColor' | 'zones' | 'colorZones' | 'showValue'
> & { orientation: Orientation }) {
    const SEGS = 12;
    const gap = 3;
    const lit = Math.round((pct / 100) * SEGS);

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals);

    const zoneColor = (frac: number) => {
        if (colorZones && zones.length > 0) {
            const segVal = min + frac * (max - min);
            const match = zones.find((z) => segVal <= z.max);
            return match ? match.color : zones[zones.length - 1].color;
        }
        return fillColor;
    };

    if (orientation === 'vertical') {
        const totalH = 220;
        const segW = 56;
        const segH = (totalH - (SEGS - 1) * gap) / SEGS;
        return (
            <svg viewBox={showValue ? '0 4 80 238' : '0 4 80 220'} style={{ width: '100%', height: '100%' }}>
                {Array.from({ length: SEGS }, (_, i) => {
                    // i=0 top, i=11 bottom; bottom segments = low values → lit first
                    const isLit = i >= SEGS - lit;
                    const frac = (SEGS - 1 - i + 0.5) / SEGS; // bottom segment → low fraction
                    const color = isLit ? zoneColor(frac) : undefined;
                    return (
                        <rect
                            key={i}
                            x={12}
                            y={4 + i * (segH + gap)}
                            width={segW}
                            height={segH}
                            rx={3}
                            fill={color ?? 'var(--app-border)'}
                            opacity={color ? 1 : 0.25}
                        />
                    );
                })}
                {showValue && (
                    <text
                        x={40}
                        y={4 + totalH + 18}
                        fontSize={13}
                        fontWeight="bold"
                        textAnchor="middle"
                        fill="var(--text-primary)"
                    >
                        {displayVal}
                        {unit && (
                            <tspan fontSize={9} dx={1} fill="var(--text-secondary)">
                                {unit}
                            </tspan>
                        )}
                    </text>
                )}
            </svg>
        );
    }

    // ── horizontal ────────────────────────────────────────────────────────────
    const totalW = 220;
    const segH = 44;
    const segW = (totalW - (SEGS - 1) * gap) / SEGS;
    return (
        <svg viewBox="0 0 220 70" style={{ width: '100%', height: '100%' }}>
            {Array.from({ length: SEGS }, (_, i) => {
                const isLit = i < lit;
                const frac = (i + 0.5) / SEGS;
                const color = isLit ? zoneColor(frac) : undefined;
                return (
                    <rect
                        key={i}
                        x={i * (segW + gap)}
                        y={4}
                        width={segW}
                        height={segH}
                        rx={3}
                        fill={color ?? 'var(--app-border)'}
                        opacity={color ? 1 : 0.25}
                    />
                );
            })}
            {showValue && (
                <text
                    x={totalW / 2}
                    y={segH + 18}
                    fontSize={14}
                    fontWeight="bold"
                    textAnchor="middle"
                    fill="var(--text-primary)"
                >
                    {displayVal}
                    {unit && (
                        <tspan fontSize={9} dx={1} fill="var(--text-secondary)">
                            {unit}
                        </tspan>
                    )}
                </text>
            )}
        </svg>
    );
}

// ── Wave ───────────────────────────────────────────────────────────────────
function WaveViz({
    pct,
    value,
    unit,
    decimals,
    fillColor,
    showValue,
    uid,
}: Pick<TankProps, 'pct' | 'value' | 'unit' | 'decimals' | 'fillColor' | 'showValue' | 'uid'>) {
    const clipId = `wave-${uid}`;
    const aboveId = `wave-above-${uid}`;
    const belowId = `wave-below-${uid}`;
    const fillY = 100 - pct;
    const amp = 5;
    const waveColor = fillColor;

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals);

    // Split the value at the waterline: dark on the empty background, white on the fill,
    // so it stays readable even when the line crosses the middle of the number.
    const renderVal = (mainFill: string, unitFill: string, clip: string) => (
        <text x={50} y={55} fontSize={18} fontWeight="bold" textAnchor="middle" fill={mainFill} clipPath={clip}>
            {displayVal}
            {unit && (
                <tspan fontSize={10} dx={2} fill={unitFill}>
                    {unit}
                </tspan>
            )}
        </text>
    );

    // Two sine periods across 200 units so animation looks seamless
    const wavePath =
        `M0,${fillY} ` +
        `C25,${fillY - amp} 25,${fillY + amp} 50,${fillY} ` +
        `C75,${fillY - amp} 75,${fillY + amp} 100,${fillY} ` +
        `C125,${fillY - amp} 125,${fillY + amp} 150,${fillY} ` +
        `C175,${fillY - amp} 175,${fillY + amp} 200,${fillY} ` +
        `L200,100 L0,100 Z`;

    return (
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
            <defs>
                <clipPath id={clipId}>
                    <rect x={0} y={0} width={100} height={100} rx={8} />
                </clipPath>
                <clipPath id={aboveId}>
                    <rect x={0} y={0} width={100} height={Math.max(0, fillY)} />
                </clipPath>
                <clipPath id={belowId}>
                    <rect x={0} y={fillY} width={100} height={Math.max(0, 100 - fillY)} />
                </clipPath>
            </defs>

            {/* Background */}
            <rect
                x={0}
                y={0}
                width={100}
                height={100}
                rx={8}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Animated wave fill */}
            {pct > 0 && (
                <g clipPath={`url(#${clipId})`}>
                    <path d={wavePath} fill={waveColor} opacity={0.85}>
                        <animateTransform
                            attributeName="transform"
                            type="translate"
                            from="0,0"
                            to="-100,0"
                            dur="3s"
                            repeatCount="indefinite"
                        />
                    </path>
                </g>
            )}

            {/* Border on top */}
            <rect
                x={0}
                y={0}
                width={100}
                height={100}
                rx={8}
                fill="none"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Value – split at the waterline for readable contrast on both sides */}
            {showValue && (
                <>
                    {renderVal('var(--text-primary)', 'var(--text-secondary)', `url(#${aboveId})`)}
                    {renderVal('#fff', 'rgba(255,255,255,0.85)', `url(#${belowId})`)}
                </>
            )}
        </svg>
    );
}

// ── Battery layout ─────────────────────────────────────────────────────────
function BatteryViz({
    pct,
    value,
    unit,
    decimals,
    fillColor,
    showValue,
    uid,
    orientation,
}: Pick<TankProps, 'pct' | 'value' | 'unit' | 'decimals' | 'fillColor' | 'showValue' | 'uid'> & {
    orientation: Orientation;
}) {
    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals);

    if (orientation === 'vertical') {
        const bx = 12,
            by = 22,
            bw = 66,
            bh = 218,
            br = 9;
        const nubW = 30,
            nubH = 12;
        const fillH = Math.max(0, (pct / 100) * bh);
        const clipId = `bat-v-${uid}`;
        const aboveId = `bat-v-above-${uid}`;
        const belowId = `bat-v-below-${uid}`;
        const lineY = by + bh - fillH; // fill top edge
        const renderVal = (mainFill: string, unitFill: string, clip: string) => (
            <text
                x={bx + bw / 2}
                y={by + bh / 2 + 6}
                fontSize={18}
                fontWeight="bold"
                textAnchor="middle"
                fill={mainFill}
                clipPath={clip}
            >
                {displayVal}
                {unit && (
                    <tspan fontSize={10} dx={2} fill={unitFill}>
                        {unit}
                    </tspan>
                )}
            </text>
        );
        return (
            <svg viewBox="0 0 90 260" style={{ width: '100%', height: '100%' }}>
                <defs>
                    <clipPath id={clipId}>
                        <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                    </clipPath>
                    <clipPath id={aboveId}>
                        <rect x={0} y={0} width={90} height={Math.max(0, lineY)} />
                    </clipPath>
                    <clipPath id={belowId}>
                        <rect x={0} y={lineY} width={90} height={Math.max(0, 260 - lineY)} />
                    </clipPath>
                </defs>
                <rect
                    x={bx + (bw - nubW) / 2}
                    y={by - nubH - 3}
                    width={nubW}
                    height={nubH}
                    rx={5}
                    fill="var(--app-border)"
                />
                <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={br}
                    fill="var(--widget-bg)"
                    stroke="var(--app-border)"
                    strokeWidth={2}
                />
                {fillH > 0 && (
                    <rect
                        x={bx}
                        y={by + bh - fillH}
                        width={bw}
                        height={fillH}
                        fill={fillColor}
                        clipPath={`url(#${clipId})`}
                    />
                )}
                {[0.25, 0.5, 0.75].map((t, i) => (
                    <line
                        key={i}
                        x1={bx}
                        y1={by + bh * (1 - t)}
                        x2={bx + bw}
                        y2={by + bh * (1 - t)}
                        stroke="var(--app-bg)"
                        strokeWidth={2.5}
                        clipPath={`url(#${clipId})`}
                    />
                ))}
                <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={br}
                    fill="none"
                    stroke="var(--app-border)"
                    strokeWidth={2}
                />
                {showValue && (
                    <>
                        {renderVal('var(--text-primary)', 'var(--text-secondary)', `url(#${aboveId})`)}
                        {renderVal('#fff', 'rgba(255,255,255,0.85)', `url(#${belowId})`)}
                    </>
                )}
            </svg>
        );
    }

    // ── horizontal ────────────────────────────────────────────────────────────
    // Center silhouette (body+nub = 218+3+12 = 233) in 260-wide viewBox → (260-233)/2 = 13.5
    const bx = 13.5,
        by = 12,
        bw = 218,
        bh = 66,
        br = 9;
    const nubW = 12,
        nubH = 30;
    const fillW = Math.max(0, (pct / 100) * bw);
    const clipId = `bat-h-${uid}`;
    const onFillId = `bat-h-onfill-${uid}`;
    const emptyId = `bat-h-empty-${uid}`;
    const lineX = bx + fillW; // fill right edge
    const renderVal = (mainFill: string, unitFill: string, clip: string) => (
        <text
            x={bx + bw / 2}
            y={by + bh / 2 + 6}
            fontSize={20}
            fontWeight="bold"
            textAnchor="middle"
            fill={mainFill}
            clipPath={clip}
        >
            {displayVal}
            {unit && (
                <tspan fontSize={12} dx={2} fill={unitFill}>
                    {unit}
                </tspan>
            )}
        </text>
    );
    return (
        <svg viewBox="0 0 260 90" style={{ width: '100%', height: '100%' }}>
            <defs>
                <clipPath id={clipId}>
                    <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                </clipPath>
                <clipPath id={onFillId}>
                    <rect x={0} y={0} width={Math.max(0, lineX)} height={90} />
                </clipPath>
                <clipPath id={emptyId}>
                    <rect x={lineX} y={0} width={Math.max(0, 260 - lineX)} height={90} />
                </clipPath>
            </defs>
            <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={2}
            />
            <rect x={bx + bw + 3} y={by + (bh - nubH) / 2} width={nubW} height={nubH} rx={5} fill="var(--app-border)" />
            {fillW > 0 && (
                <rect x={bx} y={by} width={fillW} height={bh} fill={fillColor} clipPath={`url(#${clipId})`} />
            )}
            {[0.25, 0.5, 0.75].map((t, i) => (
                <line
                    key={i}
                    x1={bx + t * bw}
                    y1={by}
                    x2={bx + t * bw}
                    y2={by + bh}
                    stroke="var(--app-bg)"
                    strokeWidth={2.5}
                    clipPath={`url(#${clipId})`}
                />
            ))}
            <rect x={bx} y={by} width={bw} height={bh} rx={br} fill="none" stroke="var(--app-border)" strokeWidth={2} />
            {showValue && (
                <>
                    {renderVal('#fff', 'rgba(255,255,255,0.85)', `url(#${onFillId})`)}
                    {renderVal('var(--text-primary)', 'var(--text-secondary)', `url(#${emptyId})`)}
                </>
            )}
        </svg>
    );
}

// ── Main widget ────────────────────────────────────────────────────────────
export function FillWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

    const { value } = useDatapoint(config.datapoint);
    const { defaultDecimals } = useGlobalSettingsStore();

    const orientation = (opts.orientation as Orientation) ?? 'vertical';
    const min = (opts.minValue as number) ?? 0;
    const max = (opts.maxValue as number) ?? 100;
    const unit = (opts.unit as string) ?? '%';
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const colorZones = (opts.colorZones as boolean) ?? false;
    const showTicks = (opts.showTicks as boolean) ?? true;
    const showValue = (opts.showValue as boolean) ?? true;
    // barSize: % of widget width (vertical) or height (horizontal), 10-100
    const barSize = (opts.barSize as number) ?? 80;

    // Zone array – new format first, fall back to 3 default zones
    const zones: ColorZone[] = (() => {
        const raw = opts.zones as ColorZone[] | undefined;
        if (raw && raw.length > 0) return raw;
        const range = max - min;
        return [
            { max: min + range * 0.33, color: '#ef4444' },
            { max: min + range * 0.66, color: '#f59e0b' },
            { max: max, color: '#22c55e' },
        ];
    })();

    // Display-only transform: live value mapped into display space; min/max + zones stay in display units.
    const factor = Number(opts.valueFactor ?? 1);
    const offset = Number(opts.valueOffset ?? 0);
    const rawNum = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    const numVal = isNaN(rawNum) ? NaN : rawNum * factor + offset;
    const safeVal = isNaN(numVal) ? min : Math.max(min, Math.min(max, numVal));
    const pct = max > min ? ((safeVal - min) / (max - min)) * 100 : 0;

    // Determine fill color
    let fillColor = 'var(--accent)';
    if (colorZones && zones.length > 0) {
        const match = zones.find((z) => safeVal <= z.max);
        fillColor = match ? match.color : zones[zones.length - 1].color;
    }

    const layout = (config.layout ?? 'default') as string;

    const tankProps: TankProps = {
        pct,
        value: safeVal,
        min,
        max,
        unit,
        decimals,
        fillColor,
        zones,
        colorZones,
        showTicks,
        showValue,
        uid,
    };

    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Droplets);

    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={value !== null ? formatNum(safeVal, decimals) : '–'}
                rawValue={value !== null ? safeVal : null}
                unit={unit}
            />
        );

    if (layout === 'battery') {
        return (
            <div className="flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
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
                <div
                    className="aura-widget-value flex-1 flex items-center justify-center min-h-0 min-w-0"
                    style={{ padding: '4px 0' }}
                >
                    <div
                        style={
                            orientation === 'vertical'
                                ? { width: `${barSize}%`, height: '100%' }
                                : { width: '100%', height: `${barSize}%` }
                        }
                    >
                        <BatteryViz
                            pct={pct}
                            value={safeVal}
                            unit={unit}
                            decimals={decimals}
                            fillColor={fillColor}
                            showValue={showValue}
                            uid={uid}
                            orientation={orientation}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (layout === 'segments') {
        return (
            <div className="flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
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
                <div className="aura-widget-value flex-1 flex items-center justify-center min-h-0 min-w-0">
                    <div
                        style={
                            orientation === 'vertical'
                                ? { width: `${barSize}%`, height: '100%' }
                                : { width: '100%', height: `${barSize}%` }
                        }
                    >
                        <SegmentsViz
                            pct={pct}
                            value={safeVal}
                            min={min}
                            max={max}
                            unit={unit}
                            decimals={decimals}
                            fillColor={fillColor}
                            zones={zones}
                            colorZones={colorZones}
                            showValue={showValue}
                            orientation={orientation}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (layout === 'wave') {
        return (
            <div className="flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
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
                <div className="aura-widget-value flex-1 flex items-center justify-center min-h-0 min-w-0">
                    <div
                        style={
                            orientation === 'vertical'
                                ? { width: `${barSize}%`, height: '100%' }
                                : { width: '100%', height: `${barSize}%` }
                        }
                    >
                        <WaveViz
                            pct={pct}
                            value={safeVal}
                            unit={unit}
                            decimals={decimals}
                            fillColor={fillColor}
                            showValue={showValue}
                            uid={uid}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (!config.datapoint) {
        return (
            <div className="flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
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
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Droplets size={32} strokeWidth={1} />
                    <span className="text-xs opacity-60">Kein Datenpunkt konfiguriert</span>
                </div>
            </div>
        );
    }

    return (
        <div className="aura-widget-row flex flex-col h-full">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                    {showIcon && (
                        <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    )}
                    {showTitle && (
                        <p
                            className="text-xs truncate flex-1 min-w-0"
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
            <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
                {orientation === 'vertical' ? (
                    <div style={{ width: `${barSize}%`, height: '100%' }}>
                        <TankVertical {...tankProps} />
                    </div>
                ) : (
                    <div style={{ width: '100%', height: `${barSize}%` }}>
                        <TankHorizontal {...tankProps} />
                    </div>
                )}
            </div>
        </div>
    );
}
