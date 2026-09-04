import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Droplets } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useTemplateValues } from '../../hooks/useTemplateValues';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { FillLimits } from './FillLimits';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import {
    bandSegments,
    limitBands,
    numericOrNull,
    reachedLimitColor,
    resolveLimits,
    toRawLimit,
    type FillBand,
    type FillLimit,
} from '../../utils/fillLimits';

export interface ColorZone {
    max: number;
    color: string;
}

/** Default warning colour once the value hits `overThreshold` (#607). */
export const OVER_COLOR = '#ef4444';

type Orientation = 'vertical' | 'horizontal';

interface TankProps {
    pct: number;
    value: number;
    min: number;
    max: number;
    unit: string;
    decimals: number;
    numFmt?: NumberFormat;
    fillColor: string;
    zones: ColorZone[];
    colorZones: boolean;
    /** Value is at or past the warning threshold - `fillColor` is then the warning colour. */
    isOver: boolean;
    /**
     * `fillColor` is a single verdict about the whole fill and nothing else may paint:
     * the warning colour, or a reached limit. Zones and sections are both skipped -
     * without this a reached limit only changed a colour nobody drew, because the zone
     * segments paint themselves rather than reading `fillColor`.
     */
    solid: boolean;
    showTicks: boolean;
    showValue: boolean;
    uid: string;
    /**
     * Sections between the configured limits (#613). Empty = no limits, and the
     * renderers keep painting zones or a single colour exactly as before.
     */
    bands: FillBand[];
    /** The bar rect, so the limits overlay can measure where 0 % and 100 % are. */
    trackRef?: RefObject<SVGRectElement>;
}

/**
 * The filled sub-sections to paint, or null when no section carries its own colour.
 * Sections win over the colour zones — mixing both is a configuration mistake the
 * editor warns about, and a live section edge is the more specific statement.
 */
function paintedBands(bands: FillBand[], pct: number, fallback: string, solid: boolean) {
    if (solid || !bands.some((b) => b.color)) return null;
    const segs = bandSegments(bands, pct / 100, fallback);
    return segs.length ? segs : null;
}

// ── Vertical tank ──────────────────────────────────────────────────────────
function TankVertical({
    pct,
    value,
    min,
    max,
    unit,
    decimals,
    numFmt,
    fillColor,
    zones,
    colorZones,
    isOver,
    solid,
    showTicks,
    showValue,
    uid,
    bands,
    trackRef,
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
    const bandSegs = paintedBands(bands, pct, fillColor, solid);

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);

    const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

    return (
        <svg
            viewBox="0 0 100 220"
            style={{ width: '100%', height: '100%' }}
            overflow="visible"
            data-aura-fill="vertical"
            data-aura-fill-pct={Math.round(pct)}
            data-aura-fill-max={max}
            data-aura-fill-over={isOver ? '1' : '0'}
        >
            <defs>
                <clipPath id={clipId}>
                    <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                </clipPath>
            </defs>

            {/* Tank background */}
            <rect
                ref={trackRef}
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Limit sections – faint above the fill, so the edges read even when empty */}
            {bandSegs &&
                bands.map((band, i) =>
                    band.color ? (
                        <rect
                            key={`band-bg-${i}`}
                            x={bx}
                            y={by + bh - band.to * bh}
                            width={bw}
                            height={(band.to - band.from) * bh}
                            fill={band.color}
                            opacity={0.22}
                            clipPath={`url(#${clipId})`}
                        />
                    ) : null,
                )}

            {/* Limit sections – the filled part, at full strength */}
            {bandSegs?.map((seg, i) => (
                <rect
                    key={`band-fill-${i}`}
                    x={bx}
                    y={by + bh - seg.to * bh}
                    width={bw}
                    height={(seg.to - seg.from) * bh}
                    fill={seg.color}
                    clipPath={`url(#${clipId})`}
                    data-aura-fill-level=""
                    data-aura-fill-band={i}
                />
            ))}

            {/* Zone bands – entire tank at 45% (vivid context) */}
            {!bandSegs &&
                colorZones &&
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
            {!bandSegs &&
                colorZones &&
                !solid &&
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
                            data-aura-fill-level=""
                        />
                    );
                })}

            {/* Fill – single color (no zones) */}
            {!bandSegs && (!colorZones || solid) && fillH > 0 && (
                <rect
                    x={bx}
                    y={fillY}
                    width={bw}
                    height={fillH}
                    fill={fillColor}
                    clipPath={`url(#${clipId})`}
                    data-aura-fill-level=""
                />
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
                                {formatNum(v, decimals === 0 ? 0 : 1, numFmt)}
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
    numFmt,
    fillColor,
    zones,
    colorZones,
    isOver,
    solid,
    showTicks,
    showValue,
    uid,
    bands,
    trackRef,
}: TankProps) {
    // Layout constants (viewBox 0 0 220 80)
    const bx = 10,
        by = 24,
        bw = 185,
        bh = 42,
        br = 13;
    const fillW = Math.max(0, (pct / 100) * bw);
    const clipId = `fh-${uid}`;
    const bandSegs = paintedBands(bands, pct, fillColor, solid);

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);

    const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

    return (
        <svg
            viewBox="0 0 220 80"
            style={{ width: '100%', height: '100%' }}
            overflow="visible"
            data-aura-fill="horizontal"
            data-aura-fill-pct={Math.round(pct)}
            data-aura-fill-max={max}
            data-aura-fill-over={isOver ? '1' : '0'}
        >
            <defs>
                <clipPath id={clipId}>
                    <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                </clipPath>
            </defs>

            {/* Tank background */}
            <rect
                ref={trackRef}
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={br}
                fill="var(--widget-bg)"
                stroke="var(--app-border)"
                strokeWidth={1.5}
            />

            {/* Limit sections – faint above the fill, so the edges read even when empty */}
            {bandSegs &&
                bands.map((band, i) =>
                    band.color ? (
                        <rect
                            key={`band-bg-${i}`}
                            x={bx + band.from * bw}
                            y={by}
                            width={(band.to - band.from) * bw}
                            height={bh}
                            fill={band.color}
                            opacity={0.22}
                            clipPath={`url(#${clipId})`}
                        />
                    ) : null,
                )}

            {/* Limit sections – the filled part, at full strength */}
            {bandSegs?.map((seg, i) => (
                <rect
                    key={`band-fill-${i}`}
                    x={bx + seg.from * bw}
                    y={by}
                    width={(seg.to - seg.from) * bw}
                    height={bh}
                    fill={seg.color}
                    clipPath={`url(#${clipId})`}
                    data-aura-fill-level=""
                    data-aura-fill-band={i}
                />
            ))}

            {/* Zone bands – entire tank at 45% */}
            {!bandSegs &&
                colorZones &&
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
            {!bandSegs &&
                colorZones &&
                !solid &&
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
                            data-aura-fill-level=""
                        />
                    );
                })}

            {/* Fill – single color (no zones) */}
            {!bandSegs && (!colorZones || solid) && fillW > 0 && (
                <rect
                    x={bx}
                    y={by}
                    width={fillW}
                    height={bh}
                    fill={fillColor}
                    clipPath={`url(#${clipId})`}
                    data-aura-fill-level=""
                />
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
                                {formatNum(v, decimals === 0 ? 0 : 1, numFmt)}
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
    numFmt,
    fillColor,
    zones,
    colorZones,
    showValue,
    orientation,
}: Pick<
    TankProps,
    | 'pct'
    | 'value'
    | 'min'
    | 'max'
    | 'unit'
    | 'decimals'
    | 'numFmt'
    | 'fillColor'
    | 'zones'
    | 'colorZones'
    | 'showValue'
> & { orientation: Orientation }) {
    const SEGS = 12;
    const gap = 3;
    const lit = Math.round((pct / 100) * SEGS);

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);

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
    numFmt,
    fillColor,
    showValue,
    uid,
}: Pick<TankProps, 'pct' | 'value' | 'unit' | 'decimals' | 'numFmt' | 'fillColor' | 'showValue' | 'uid'>) {
    const clipId = `wave-${uid}`;
    const aboveId = `wave-above-${uid}`;
    const belowId = `wave-below-${uid}`;
    const fillY = 100 - pct;
    const amp = 5;
    const waveColor = fillColor;

    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);

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
    numFmt,
    fillColor,
    showValue,
    uid,
    orientation,
    bands,
    trackRef,
    solid,
}: Pick<
    TankProps,
    | 'pct'
    | 'value'
    | 'unit'
    | 'decimals'
    | 'numFmt'
    | 'fillColor'
    | 'showValue'
    | 'uid'
    | 'bands'
    | 'trackRef'
    | 'solid'
> & {
    orientation: Orientation;
}) {
    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);
    // The battery never had colour zones, so the limit sections are its only source
    // of more than one colour - no zone branch to step around here.
    const bandSegs = paintedBands(bands, pct, fillColor, solid);

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
            <svg
                viewBox="0 0 90 260"
                style={{ width: '100%', height: '100%' }}
                data-aura-fill="vertical"
                data-aura-fill-pct={Math.round(pct)}
            >
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
                    ref={trackRef}
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={br}
                    fill="var(--widget-bg)"
                    stroke="var(--app-border)"
                    strokeWidth={2}
                />
                {bandSegs &&
                    bands.map((band, i) =>
                        band.color ? (
                            <rect
                                key={`band-bg-${i}`}
                                x={bx}
                                y={by + bh - band.to * bh}
                                width={bw}
                                height={(band.to - band.from) * bh}
                                fill={band.color}
                                opacity={0.22}
                                clipPath={`url(#${clipId})`}
                            />
                        ) : null,
                    )}
                {bandSegs?.map((seg, i) => (
                    <rect
                        key={`band-fill-${i}`}
                        x={bx}
                        y={by + bh - seg.to * bh}
                        width={bw}
                        height={(seg.to - seg.from) * bh}
                        fill={seg.color}
                        clipPath={`url(#${clipId})`}
                        data-aura-fill-level=""
                        data-aura-fill-band={i}
                    />
                ))}
                {!bandSegs && fillH > 0 && (
                    <rect
                        x={bx}
                        y={by + bh - fillH}
                        width={bw}
                        height={fillH}
                        fill={fillColor}
                        clipPath={`url(#${clipId})`}
                        data-aura-fill-level=""
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
    // Battery body stretches to fill the cell (preserveAspectRatio="none") so it
    // no longer leaves large empty margins in short/wide cells. The value is an
    // HTML overlay (not SVG text) so it stays crisp/undistorted and scales with
    // the cell via container-query units. #453
    const bx = 13.5,
        by = 12,
        bw = 218,
        bh = 66,
        br = 9;
    const nubW = 12,
        nubH = 30;
    const fillPct = Math.max(0, Math.min(100, pct));
    const fillW = (fillPct / 100) * bw;
    const clipId = `bat-h-${uid}`;
    // Fill edge as % of the full viewBox width → drives the on-fill/empty text split.
    const fillLinePct = ((bx + fillW) / 260) * 100;
    const valStyle: React.CSSProperties = {
        fontWeight: 'bold',
        fontSize: 'min(42cqh, 24cqw)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
    };
    const renderVal = (color: string, unitColor: string, extra?: React.CSSProperties) => (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...extra,
            }}
        >
            <span style={{ ...valStyle, color }}>
                {displayVal}
                {unit && <span style={{ fontSize: '0.6em', marginLeft: '0.12em', color: unitColor }}>{unit}</span>}
            </span>
        </div>
    );
    return (
        <div
            style={
                { position: 'relative', width: '100%', height: '100%', containerType: 'size' } as React.CSSProperties
            }
        >
            <svg
                viewBox="0 0 260 90"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                data-aura-fill="horizontal"
                data-aura-fill-pct={Math.round(pct)}
            >
                <defs>
                    <clipPath id={clipId}>
                        <rect x={bx} y={by} width={bw} height={bh} rx={br} />
                    </clipPath>
                </defs>
                <rect
                    ref={trackRef}
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={br}
                    fill="var(--widget-bg)"
                    stroke="var(--app-border)"
                    strokeWidth={2}
                />
                <rect
                    x={bx + bw + 3}
                    y={by + (bh - nubH) / 2}
                    width={nubW}
                    height={nubH}
                    rx={5}
                    fill="var(--app-border)"
                />
                {bandSegs &&
                    bands.map((band, i) =>
                        band.color ? (
                            <rect
                                key={`band-bg-${i}`}
                                x={bx + band.from * bw}
                                y={by}
                                width={(band.to - band.from) * bw}
                                height={bh}
                                fill={band.color}
                                opacity={0.22}
                                clipPath={`url(#${clipId})`}
                            />
                        ) : null,
                    )}
                {bandSegs?.map((seg, i) => (
                    <rect
                        key={`band-fill-${i}`}
                        x={bx + seg.from * bw}
                        y={by}
                        width={(seg.to - seg.from) * bw}
                        height={bh}
                        fill={seg.color}
                        clipPath={`url(#${clipId})`}
                        data-aura-fill-level=""
                        data-aura-fill-band={i}
                    />
                ))}
                {!bandSegs && fillW > 0 && (
                    <rect
                        x={bx}
                        y={by}
                        width={fillW}
                        height={bh}
                        fill={fillColor}
                        clipPath={`url(#${clipId})`}
                        data-aura-fill-level=""
                    />
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
            </svg>
            {showValue && (
                <>
                    {/* empty-side value (readable on the background, both themes) */}
                    {renderVal('var(--text-primary)', 'var(--text-secondary)')}
                    {/* on-fill value in white, clipped to the filled portion */}
                    {renderVal('#fff', 'rgba(255,255,255,0.85)', {
                        clipPath: `inset(0 ${100 - fillLinePct}% 0 0)`,
                    })}
                </>
            )}
        </div>
    );
}

// ── Flat bar ("bar" layout) ─────────────────────────────────────
// Plain HTML, not SVG: a rounded bar with draggable limits wants a real pixel
// thickness and undistorted round caps, which a viewBox that scales to the cell
// cannot give (the tanks letterbox, the horizontal battery stretches). This is also
// the shape the request actually showed - a charge limit is not a tank.
function BarViz({
    pct,
    min,
    max,
    value,
    unit,
    decimals,
    numFmt,
    fillColor,
    showValue,
    showTicks,
    bands,
    orientation,
    barSize,
    barRef,
    solid,
}: Pick<
    TankProps,
    | 'pct'
    | 'min'
    | 'max'
    | 'value'
    | 'unit'
    | 'decimals'
    | 'numFmt'
    | 'fillColor'
    | 'showValue'
    | 'showTicks'
    | 'bands'
    | 'solid'
> & {
    orientation: Orientation;
    barSize: number;
    barRef: RefObject<HTMLDivElement>;
}) {
    const vertical = orientation === 'vertical';
    // barSize keeps its meaning ("how chunky is the bar") but maps to px here: a
    // percentage of the cell would collapse the bar to a hairline in a short widget,
    // which is where this layout is most likely to sit.
    const thickness = Math.round(8 + (Math.max(10, Math.min(100, barSize)) / 100) * 24);
    const bandSegs = paintedBands(bands, pct, fillColor, solid);
    const displayVal = isNaN(value) ? '–' : formatNum(value, decimals, numFmt);
    const endLabel = (v: number) => `${formatNum(v, decimals === 0 ? 0 : 1, numFmt)}${unit}`;

    const seg = (from: number, to: number, color: string, faint?: boolean) => ({
        position: 'absolute' as const,
        background: color,
        ...(faint ? { opacity: 0.22 } : null),
        ...(vertical
            ? { left: 0, right: 0, bottom: `${from * 100}%`, height: `${(to - from) * 100}%` }
            : { top: 0, bottom: 0, left: `${from * 100}%`, width: `${(to - from) * 100}%` }),
    });

    const bar = (
        <div
            ref={barRef}
            data-aura-fill={vertical ? 'vertical' : 'horizontal'}
            data-aura-fill-pct={Math.round(pct)}
            data-aura-fill-max={max}
            style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: thickness / 2,
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                ...(vertical ? { width: thickness, height: '100%' } : { height: thickness, width: '100%' }),
            }}
        >
            {bandSegs &&
                bands.map((b, i) =>
                    b.color ? <div key={`bg-${i}`} style={seg(b.from, b.to, b.color, true)} /> : null,
                )}
            {bandSegs?.map((sg, i) => (
                <div
                    key={`fill-${i}`}
                    data-aura-fill-level=""
                    data-aura-fill-band={i}
                    style={seg(sg.from, sg.to, sg.color)}
                />
            ))}
            {!bandSegs && pct > 0 && <div data-aura-fill-level="" style={seg(0, pct / 100, fillColor)} />}
        </div>
    );

    const valueEl = showValue ? (
        <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            {displayVal}
            {unit && (
                <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {unit}
                </span>
            )}
        </span>
    ) : null;

    if (vertical) {
        return (
            <div className="h-full flex items-stretch justify-center gap-1.5">
                {showTicks && (
                    <div
                        className="flex flex-col justify-between text-[9px] shrink-0"
                        style={{ color: 'var(--text-secondary)', opacity: 0.75 }}
                    >
                        <span>{endLabel(max)}</span>
                        <span>{endLabel(min)}</span>
                    </div>
                )}
                <div className="shrink-0">{bar}</div>
                {valueEl && <div className="flex items-center shrink-0">{valueEl}</div>}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col justify-center gap-1">
            <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">{bar}</div>
                {valueEl}
            </div>
            {showTicks && (
                <div
                    className="flex justify-between text-[9px]"
                    style={{ color: 'var(--text-secondary)', opacity: 0.75 }}
                >
                    <span>{endLabel(min)}</span>
                    <span>{endLabel(max)}</span>
                </div>
            )}
        </div>
    );
}

// ── Main widget ────────────────────────────────────────────────────────────
export function FillWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    // The limits layer is measured, not computed from the viewBox: `hostRef` is the
    // positioned wrapper it draws in, `trackRef` the bar whose box defines 0 %/100 %.
    const hostRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<SVGRectElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    const { setState } = useIoBroker();
    const { value } = useDatapoint(config.datapoint);
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();

    // Scale bounds may come from datapoints instead of fixed numbers — a budget, an
    // electricity prepayment, a tank size the installation itself knows (issue #596).
    const minDp = (opts.minDatapoint as string) ?? '';
    const maxDp = (opts.maxDatapoint as string) ?? '';
    const { value: minDpVal } = useDatapoint(minDp);
    const { value: maxDpVal } = useDatapoint(maxDp);

    // Display-only transform: live DP values are mapped into display space, while the
    // static min/max and the zones stay as configured (entered in display units).
    const factor = Number(opts.valueFactor ?? 1);
    const offset = Number(opts.valueOffset ?? 0);
    const tx = (n: number): number => n * factor + offset;
    /** A bound's live value in display space, or null when the DP has nothing usable yet. */
    const boundFromDp = (raw: unknown): number | null => {
        if (raw === undefined || raw === null || raw === '') return null;
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
        return isNaN(n) ? null : tx(n);
    };

    const orientation = (opts.orientation as Orientation) ?? 'vertical';
    const min = (minDp ? boundFromDp(minDpVal) : null) ?? (opts.minValue as number) ?? 0;
    const max = (maxDp ? boundFromDp(maxDpVal) : null) ?? (opts.maxValue as number) ?? 100;
    const unit = (opts.unit as string) ?? '%';
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const numFmt = (opts.numberFormat as NumberFormat | undefined) ?? globalNumFmt;
    const colorZones = (opts.colorZones as boolean) ?? false;
    const overActive = (opts.overActive as boolean) ?? false;
    const overThreshold = (opts.overThreshold as number) ?? 100;
    const showTicks = (opts.showTicks as boolean) ?? true;
    const showValue = (opts.showValue as boolean) ?? true;
    // barSize: % of widget width (vertical) or height (horizontal), 10-100
    const barSize = (opts.barSize as number) ?? 80;

    // ── Limits (#613) ──────────────────────────────────────────────────────────
    // Every limit brings its own datapoint, so the set of subscriptions changes with
    // the configuration - useTemplateStates takes a dynamic list, which is exactly
    // what the rules of hooks forbid doing with useDatapoint in a loop.
    const limits = (opts.limits as FillLimit[] | undefined) ?? [];
    const limitsEditable = opts.limitsEditable !== false;
    const commitOnRelease = opts.limitCommitOnRelease !== false;
    const clampNeighbours = opts.limitClampNeighbours !== false;
    const limitValues = useTemplateValues(limits.map((l) => l.datapoint?.trim() ?? '').filter(Boolean));

    // Display value of the limit being dragged. Kept until the datapoint echoes it
    // back (or 3 s pass), otherwise the handle jumps back to the old value for the
    // round-trip and reads as a rejected drag.
    const [pending, setPending] = useState<{ id: string; at: number } | null>(null);
    useEffect(() => {
        if (!pending) return;
        const dp = limits.find((l) => l.id === pending.id)?.datapoint?.trim();
        if (!dp) {
            setPending(null);
            return;
        }
        const live = numericOrNull(limitValues[dp]);
        if (live !== null && Math.abs(live * factor + offset - pending.at) < 1e-6) {
            setPending(null);
            return;
        }
        // The adapter may clamp or refuse the write - never hold the marker hostage.
        const t = setTimeout(() => setPending(null), 3000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending, limitValues, factor, offset]);

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

    const rawNum = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    const numVal = isNaN(rawNum) ? NaN : tx(rawNum);
    const safeVal = isNaN(numVal) ? min : Math.max(min, Math.min(max, numVal));
    const pct = max > min ? ((safeVal - min) / (max - min)) * 100 : 0;
    // Threshold reads the UNCLAMPED value: an overrun clamps to `max`, so `pct` alone can
    // never tell "exactly full" from "well past full" (#607).
    const rawPct = max > min && !isNaN(numVal) ? ((numVal - min) / (max - min)) * 100 : 0;
    const isOver = overActive && !isNaN(numVal) && rawPct >= overThreshold;

    const resolvedLimits = resolveLimits(limits, {
        scale: { min, max },
        values: limitValues,
        tx,
        editable: limitsEditable,
        override: pending,
    });
    const bands = limitBands(resolvedLimits, {
        icon: opts.baseIcon as string | undefined,
        color: opts.baseBandColor as string | undefined,
    });
    const bandsActive = bands.some((b) => b.color);

    // Determine fill color
    let fillColor = 'var(--accent)';
    // Once a section has its own colour, the sections own the colouring - a section
    // WITHOUT one falls back to `fillColor`, and taking that out of the zones would
    // smuggle a zone colour back into a bar that is no longer drawing zones.
    if (!bandsActive && colorZones && zones.length > 0) {
        const match = zones.find((z) => safeVal <= z.max);
        fillColor = match ? match.color : zones[zones.length - 1].color;
    }
    // A reached limit repaints the whole fill - that is the "turns green once the top
    // limit is met" half of the request. It beats the zones and the sections; the
    // warning colour still beats it, because an overrun is the louder statement.
    const reached = reachedLimitColor(resolvedLimits, numVal);
    if (reached) fillColor = reached;
    // The warning colour wins over both the plain fill colour and the zones.
    if (isOver) fillColor = (opts.overColor as string) ?? OVER_COLOR;
    const solid = isOver || !!reached;

    const writeLimit = (id: string, at: number) => {
        const dp = limits.find((l) => l.id === id)?.datapoint?.trim();
        if (dp) setState(dp, toRawLimit(at, factor, offset));
    };
    const onLimitDrag = (id: string, at: number) => {
        setPending({ id, at });
        if (!commitOnRelease) writeLimit(id, at);
    };
    const onLimitCommit = (id: string, at: number) => {
        setPending({ id, at });
        writeLimit(id, at);
    };

    const layout = (config.layout ?? 'default') as string;
    /** The limits layer, mounted inside the (relative) bar wrapper of each layout. */
    const limitsLayerFor = (ref: RefObject<Element>) =>
        resolvedLimits.length ? (
            <FillLimits
                hostRef={hostRef}
                trackRef={ref}
                limits={resolvedLimits}
                bands={bands}
                scale={{ min, max }}
                orientation={orientation}
                fillFrac={pct / 100}
                unit={unit}
                decimals={decimals}
                numFmt={numFmt}
                clampNeighbours={clampNeighbours}
                onDrag={onLimitDrag}
                onCommit={onLimitCommit}
            />
        ) : null;
    const limitsLayer = limitsLayerFor(trackRef);

    const tankProps: TankProps = {
        pct,
        value: safeVal,
        min,
        max,
        unit,
        decimals,
        numFmt,
        fillColor,
        zones,
        colorZones,
        isOver,
        solid,
        showTicks,
        showValue,
        uid,
        bands,
        trackRef,
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
                value={value !== null ? formatNum(safeVal, decimals, numFmt) : '–'}
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
                        ref={hostRef}
                        style={
                            orientation === 'vertical'
                                ? { width: `${barSize}%`, height: '100%', position: 'relative' }
                                : // horizontal: keep the battery's natural aspect ratio (matches the
                                  // segments layout) so barSize actually scales it and it no longer
                                  // stretches to full width on narrow (mobile) cells. #453
                                  {
                                      height: `${barSize}%`,
                                      aspectRatio: '260 / 90',
                                      maxWidth: '100%',
                                      position: 'relative',
                                  }
                        }
                    >
                        <BatteryViz
                            pct={pct}
                            value={safeVal}
                            unit={unit}
                            decimals={decimals}
                            numFmt={numFmt}
                            fillColor={fillColor}
                            showValue={showValue}
                            uid={uid}
                            orientation={orientation}
                            bands={bands}
                            trackRef={trackRef}
                            solid={solid}
                        />
                        {limitsLayer}
                    </div>
                </div>
            </div>
        );
    }

    if (layout === 'bar') {
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
                    ref={hostRef}
                    className="aura-widget-value flex-1 flex items-center justify-center min-h-0 min-w-0"
                    style={{ position: 'relative' }}
                >
                    <div style={orientation === 'vertical' ? { height: '100%' } : { width: '100%' }}>
                        <BarViz
                            pct={pct}
                            min={min}
                            max={max}
                            value={safeVal}
                            unit={unit}
                            decimals={decimals}
                            numFmt={numFmt}
                            fillColor={fillColor}
                            showValue={showValue}
                            showTicks={showTicks}
                            bands={bands}
                            orientation={orientation}
                            barSize={barSize}
                            barRef={barRef}
                            solid={solid}
                        />
                    </div>
                    {limitsLayerFor(barRef)}
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
                            numFmt={numFmt}
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
                            numFmt={numFmt}
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
            <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
                {orientation === 'vertical' ? (
                    <div ref={hostRef} style={{ width: `${barSize}%`, height: '100%', position: 'relative' }}>
                        <TankVertical {...tankProps} />
                        {limitsLayer}
                    </div>
                ) : (
                    <div ref={hostRef} style={{ width: '100%', height: `${barSize}%`, position: 'relative' }}>
                        <TankHorizontal {...tankProps} />
                        {limitsLayer}
                    </div>
                )}
            </div>
        </div>
    );
}
