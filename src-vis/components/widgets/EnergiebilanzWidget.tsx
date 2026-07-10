/**
 * EnergiebilanzWidget — an arbitrary number of vertical 100%-stacked bars, each fed by an
 * arbitrary number of ioBroker datapoints. Every bar segment is sized by its share of that
 * bar's total and labelled with a percentage; a per-bar legend lists icon + aggregated value.
 *
 * Values are aggregated over a shared time window via a history adapter (see
 * `useEnergyBalanceValues`), matching the "Diagramm (erweitert)" data model. The two-sided
 * Produktion/Verbrauch reference layout is simply the N=2 case (legendSide left + right).
 */
import { useMemo } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetProps } from '../../types';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import type { EChartTimeRange } from '../../hooks/useMultiSeriesData';
import { useEnergyBalanceValues, type EnergyEntry } from '../../hooks/useEnergyBalanceValues';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnergyBar {
    id: string;
    title?: string;
    entries: EnergyEntry[];
    /** Where this bar's legend sits relative to the bar. Default 'below'. */
    legendSide?: 'left' | 'right' | 'below' | 'top';
}

/** What each legend row shows. Default 'icon-value'. */
export type LegendFormat = 'value' | 'icon-value' | 'label' | 'label-value' | 'icon-label-value';

export interface EnergyBalanceOptions {
    bars: EnergyBar[];
    /** Visual style of each bar's composition. Default 'bars' (100%-stacked bar). */
    chartStyle?: 'bars' | 'pie' | 'donut';
    /** Width of each stacked bar in px (only for chartStyle 'bars'). Default 46. */
    barWidth?: number;
    /** Max diameter of the pie/donut in px (only for chartStyle 'pie'/'donut'). Default 160. */
    pieSize?: number;
    /** Default unit shown after each value + total (per-entry unit overrides). */
    unit?: string;
    decimals?: number;
    range?: EChartTimeRange;
    rangeCustomValue?: number;
    rangeCustomUnit?: 'h' | 'd';
    showTitle?: boolean;
    /** Per-bar title + total above each bar. Default true. */
    showBarTitles?: boolean;
    /** Horizontal alignment of the per-bar title + total. Default 'center'. */
    barTitleAlign?: 'left' | 'center' | 'right';
    showTotals?: boolean;
    showPercent?: boolean;
    /** Show each entry's icon inside its bar segment / pie slice, next to the percentage. Default false. */
    showSegmentIcon?: boolean;
    /** Pull the percentage of pie/donut slices too small for an inside label outside on a leader line. Default true. */
    showOutsidePercent?: boolean;
    showLegend?: boolean;
    /** Legend position for all bars. Falls back to each bar's own `legendSide`, then 'below'. */
    legendSide?: 'left' | 'right' | 'below' | 'top';
    /** Horizontal text alignment of the legend rows. Defaults to the side (below → center, right → right, else left). */
    legendAlign?: 'left' | 'center' | 'right';
    legendFormat?: LegendFormat;
    /** Shared "Darstellung" appearance controls (written by the general config section). */
    icon?: string;
    showIcon?: boolean;
    iconSize?: number;
    titleAlign?: 'left' | 'center' | 'right';
}

const DEFAULT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

/** Representative sample bars shown in the editor before anything is configured. */
const SAMPLE_BARS: EnergyBar[] = [
    {
        id: 'sample-l',
        title: 'Produktion',
        legendSide: 'left',
        entries: [
            { id: 's-pv', datapointId: '', icon: 'Sun', color: '#22c55e' },
            { id: 's-bat', datapointId: '', icon: 'BatteryCharging', color: '#3b82f6' },
            { id: 's-grid', datapointId: '', icon: 'Zap', color: '#f59e0b' },
        ],
    },
    {
        id: 'sample-r',
        title: 'Verbrauch',
        legendSide: 'right',
        entries: [
            { id: 's-grid2', datapointId: '', icon: 'Zap', color: '#f59e0b' },
            { id: 's-car', datapointId: '', icon: 'Car', color: '#3b82f6' },
            { id: 's-home', datapointId: '', icon: 'House', color: '#22c55e' },
        ],
    },
];
const SAMPLE_VALUES: Record<string, number> = {
    's-pv': 11.11,
    's-bat': 6.51,
    's-grid': 10.36,
    's-grid2': 1.47,
    's-car': 4.9,
    's-home': 17.62,
};

interface Computed {
    entry: EnergyEntry;
    color: string;
    value: number; // null → 0 for sizing
    percent: number; // 0..100
}

export function EnergiebilanzWidget({ config, editMode }: WidgetProps) {
    const { subscribe, connected } = useIoBroker();
    const { defaultDecimals } = useGlobalSettingsStore();

    const o = (config.options ?? {}) as unknown as EnergyBalanceOptions;
    const showTitle = o.showTitle !== false;
    const showBarTitles = o.showBarTitles !== false;
    const barTitleAlign = o.barTitleAlign ?? 'center';
    const showTotals = o.showTotals !== false;
    const showPercent = o.showPercent !== false;
    const showSegmentIcon = o.showSegmentIcon === true;
    const showOutsidePercent = o.showOutsidePercent !== false;
    const showLegend = o.showLegend !== false;
    const chartStyle = o.chartStyle ?? 'bars';
    const barWidth = o.barWidth ?? 46;
    const pieSize = o.pieSize ?? 160;
    const legendFormat = o.legendFormat ?? 'icon-value';
    const legendAlign = o.legendAlign;
    const unit = o.unit ?? 'kWh';
    const decimals = o.decimals ?? defaultDecimals ?? 2;
    const range = o.range ?? '24h';
    // Honor the shared "Darstellung" appearance controls (icon, hide icon, icon size, align).
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 18;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon, PieChartIcon);

    const configuredBars = o.bars ?? [];
    const hasConfig = configuredBars.some((b) => (b.entries ?? []).some((e) => e.datapointId));
    const usingSample = editMode && !hasConfig;
    const bars = usingSample ? SAMPLE_BARS : configuredBars;

    // One flat subscription/fetch across every entry of every bar (ids are unique).
    const allEntries = useMemo(() => bars.flatMap((b) => b.entries ?? []), [bars]);
    const valueMap = useEnergyBalanceValues(
        usingSample ? [] : allEntries,
        range,
        connected,
        subscribe,
        o.rangeCustomValue,
        o.rangeCustomUnit,
    );

    const getValue = (entryId: string): number | null =>
        usingSample ? (SAMPLE_VALUES[entryId] ?? null) : (valueMap.get(entryId)?.value ?? null);

    const fmt = (v: number, e: EnergyEntry) => `${formatNum(v, e.decimals ?? decimals)} ${e.unit ?? unit}`;

    if (bars.length === 0) {
        return (
            <div
                className="w-full h-full flex items-center justify-center text-center px-3"
                style={{ color: 'var(--text-secondary)', fontSize: 12 }}
            >
                Keine Gruppen konfiguriert – im Editor Gruppen und Datenpunkte hinzufügen.
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col overflow-hidden" style={{ color: 'var(--text-primary)' }}>
            {showTitle && (config.title || showIcon) && (
                <div
                    className="flex items-center gap-1.5 mb-1 shrink-0"
                    style={{
                        fontSize: 13,
                        fontWeight: 600,
                        justifyContent:
                            titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start',
                    }}
                >
                    {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)' }} />}
                    {config.title && <span>{config.title}</span>}
                </div>
            )}

            <div className="flex-1 min-h-0 flex items-stretch justify-center gap-4 overflow-x-auto aura-scroll">
                {bars.map((bar) => {
                    const entries = bar.entries ?? [];
                    const computed: Computed[] = entries.map((e, i) => {
                        const raw = getValue(e.id);
                        const value = typeof raw === 'number' ? raw : 0;
                        return {
                            entry: e,
                            color: e.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                            value: value < 0 ? 0 : value,
                            percent: 0,
                        };
                    });
                    const total = computed.reduce((sum, c) => sum + c.value, 0);
                    for (const c of computed) c.percent = total > 0 ? (c.value / total) * 100 : 0;

                    const side = o.legendSide ?? bar.legendSide ?? 'below';
                    const legend = showLegend ? (
                        <Legend items={computed} side={side} align={legendAlign} format={legendFormat} fmt={fmt} />
                    ) : null;
                    const chart =
                        chartStyle === 'bars' ? (
                            <StackedBar
                                items={computed}
                                total={total}
                                showPercent={showPercent}
                                showIcon={showSegmentIcon}
                                width={barWidth}
                            />
                        ) : (
                            <PieChart
                                items={computed}
                                total={total}
                                showPercent={showPercent}
                                showIcon={showSegmentIcon}
                                showOutside={showOutsidePercent}
                                donut={chartStyle === 'donut'}
                                size={pieSize}
                                center={
                                    chartStyle === 'donut' && showTotals
                                        ? { value: formatNum(total, decimals), unit }
                                        : null
                                }
                            />
                        );

                    return (
                        <div key={bar.id} className="flex flex-col items-center min-w-0" style={{ flex: '1 1 0' }}>
                            {showBarTitles && (bar.title || showTotals) && (
                                <div className="mb-1.5 shrink-0 w-full" style={{ textAlign: barTitleAlign }}>
                                    {bar.title && (
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                            {bar.title}
                                        </div>
                                    )}
                                    {showTotals && (
                                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                                            {formatNum(total, decimals)} {unit}
                                        </div>
                                    )}
                                </div>
                            )}
                            {side === 'top' && legend && <div className="shrink-0 mb-1.5 w-full">{legend}</div>}
                            <div className="flex-1 min-h-0 w-full flex items-stretch justify-center gap-2">
                                {side === 'left' && legend}
                                {chart}
                                {side === 'right' && legend}
                            </div>
                            {side === 'below' && legend && <div className="shrink-0 mt-1.5 w-full">{legend}</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Stacked bar ─────────────────────────────────────────────────────────────────

function StackedBar({
    items,
    total,
    showPercent,
    showIcon,
    width = 46,
}: {
    items: Computed[];
    total: number;
    showPercent: boolean;
    showIcon: boolean;
    width?: number;
}) {
    if (total <= 0) {
        return (
            <div
                className="rounded-lg self-stretch"
                style={{
                    width,
                    minHeight: 80,
                    background: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
                    border: '1px dashed var(--app-border)',
                }}
            />
        );
    }
    return (
        <div className="rounded-lg overflow-hidden self-stretch flex flex-col" style={{ width, minHeight: 80 }}>
            {items.map((c) => {
                // Icon needs more vertical room than the percent label, so gate it on a
                // larger share; both are centred and stacked when they fit together.
                const wantIcon = showIcon && !!c.entry.icon && c.percent >= 12;
                const wantPct = showPercent && c.percent >= 8;
                return (
                    <div
                        key={c.entry.id}
                        className="flex flex-col items-center justify-center gap-0.5"
                        style={{
                            flexGrow: c.value,
                            flexBasis: 0,
                            background: c.color,
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            overflow: 'hidden',
                            minHeight: 0,
                        }}
                    >
                        {wantIcon && (
                            <Icon icon={toIconifyId(c.entry.icon!)} width={15} height={15} style={{ color: '#fff' }} />
                        )}
                        {wantPct && <span>{Math.round(c.percent)} %</span>}
                    </div>
                );
            })}
        </div>
    );
}

// ── Pie / Donut ─────────────────────────────────────────────────────────────────

/** Point on a circle; angle 0 = top, growing clockwise. */
function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
    return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

/** SVG path for an annular sector (rInner = 0 → filled pie slice). */
function sectorPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    const [xo0, yo0] = polar(cx, cy, rOuter, start);
    const [xo1, yo1] = polar(cx, cy, rOuter, end);
    if (rInner <= 0) {
        return `M ${cx} ${cy} L ${xo0} ${yo0} A ${rOuter} ${rOuter} 0 ${large} 1 ${xo1} ${yo1} Z`;
    }
    const [xi0, yi0] = polar(cx, cy, rInner, start);
    const [xi1, yi1] = polar(cx, cy, rInner, end);
    return `M ${xo0} ${yo0} A ${rOuter} ${rOuter} 0 ${large} 1 ${xo1} ${yo1} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi0} ${yi0} Z`;
}

function PieChart({
    items,
    total,
    showPercent,
    showIcon,
    showOutside,
    donut,
    center,
    size = 160,
}: {
    items: Computed[];
    total: number;
    showPercent: boolean;
    showIcon: boolean;
    showOutside: boolean;
    donut: boolean;
    center: { value: string; unit: string } | null;
    size?: number;
}) {
    const R = 46;
    const cx = 50;
    const cy = 50;
    const rInner = donut ? 26 : 0;

    // Icon (foreignObject) + percentage (SVG text) at a slice centroid. Icon needs a bit
    // more room, so it's gated on a slightly larger share; when both show they stack.
    const renderLabel = (c: Computed, lx: number, ly: number) => {
        const wantIcon = showIcon && !!c.entry.icon && c.percent >= 10;
        const wantPct = showPercent && c.percent >= 8;
        if (!wantIcon && !wantPct) return null;
        const both = wantIcon && wantPct;
        return (
            <g style={{ pointerEvents: 'none' }}>
                {wantIcon && (
                    <foreignObject
                        x={lx - 6}
                        y={ly - (both ? 11 : 6)}
                        width={12}
                        height={12}
                        style={{ overflow: 'visible' }}
                    >
                        <div className="w-full h-full flex items-center justify-center">
                            <Icon icon={toIconifyId(c.entry.icon!)} width={11} height={11} style={{ color: '#fff' }} />
                        </div>
                    </foreignObject>
                )}
                {wantPct && (
                    <text
                        x={lx}
                        y={both ? ly + 5 : ly}
                        fill="#fff"
                        fontSize={7}
                        fontWeight={600}
                        textAnchor="middle"
                        dominantBaseline="central"
                    >
                        {Math.round(c.percent)}%
                    </text>
                )}
            </g>
        );
    };

    if (total <= 0) {
        return (
            <div className="self-stretch min-h-0 shrink-0 flex items-center justify-center">
                <svg
                    viewBox="0 0 100 100"
                    style={{ height: '100%', maxHeight: size, width: 'auto', aspectRatio: '1 / 1' }}
                >
                    <circle
                        cx={cx}
                        cy={cy}
                        r={R}
                        fill="none"
                        stroke="var(--app-border)"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                    />
                </svg>
            </div>
        );
    }

    const segments = items.filter((c) => c.value > 0);

    // Lay out every slice's angular span once so the slices and the small-slice outside
    // labels share the same geometry (angle 0 = top, growing clockwise).
    let acc = 0;
    const laid = segments.map((c) => {
        const frac = c.value / total;
        const start = acc;
        const end = acc + frac * 2 * Math.PI;
        acc = end;
        return { c, frac, start, end, mid: (start + end) / 2 };
    });

    // Slices below this share can't fit a readable label inside, so their percentage is
    // pulled outside the ring with a leader line instead of being dropped. Only when
    // percentages are shown and there's more than one slice.
    const OUTSIDE_MAX = 8;
    const outside =
        showPercent && showOutside && laid.length > 1
            ? laid.filter((s) => s.c.percent > 0 && s.c.percent < OUTSIDE_MAX && s.frac < 0.9999)
            : [];

    // Widen the viewBox only when there are outside labels, so a pie without tiny slices
    // still fills the box at full size.
    const pad = outside.length > 0 ? 22 : 2;
    const viewBox = `${-pad} ${-pad} ${100 + 2 * pad} ${100 + 2 * pad}`;

    // De-collide outside labels per side: sort by their natural edge-y, push apart to a
    // minimum gap, then shift the column up if it runs past the bottom margin.
    const MIN_GAP = 9;
    const yBottom = cy + R + 16;
    const adjY = new Map<string, number>();
    for (const sign of [1, -1] as const) {
        const col = outside
            .filter((s) => (Math.sin(s.mid) >= 0 ? 1 : -1) === sign)
            .map((s) => ({ id: s.c.entry.id, y: polar(cx, cy, R, s.mid)[1] }))
            .sort((a, b) => a.y - b.y);
        for (let i = 1; i < col.length; i++) {
            if (col[i].y - col[i - 1].y < MIN_GAP) col[i].y = col[i - 1].y + MIN_GAP;
        }
        const overflow = col.length ? col[col.length - 1].y - yBottom : 0;
        if (overflow > 0) for (const e of col) e.y -= overflow;
        for (const e of col) adjY.set(e.id, e.y);
    }

    return (
        <div className="self-stretch min-h-0 shrink-0 flex items-center justify-center">
            <svg viewBox={viewBox} style={{ height: '100%', maxHeight: size, width: 'auto', aspectRatio: '1 / 1' }}>
                {laid.map((s) => {
                    const c = s.c;
                    // A single full-circle segment: draw a ring/disc (an arc from 0 to 2π is degenerate).
                    if (s.frac >= 0.9999) {
                        // Label sits at the top of the ring band; the donut centre still shows the total.
                        const [lx, ly] = polar(cx, cy, (R + rInner) / 2, 0);
                        const shape = donut ? (
                            <circle
                                cx={cx}
                                cy={cy}
                                r={(R + rInner) / 2}
                                fill="none"
                                stroke={c.color}
                                strokeWidth={R - rInner}
                            />
                        ) : (
                            <circle cx={cx} cy={cy} r={R} fill={c.color} />
                        );
                        return (
                            <g key={c.entry.id}>
                                {shape}
                                {renderLabel(c, lx, ly)}
                            </g>
                        );
                    }
                    const [lx, ly] = polar(cx, cy, (R + rInner) / 2, s.mid);
                    return (
                        <g key={c.entry.id}>
                            <path d={sectorPath(cx, cy, R, rInner, s.start, s.end)} fill={c.color} />
                            {renderLabel(c, lx, ly)}
                        </g>
                    );
                })}
                {outside.map((s) => {
                    const c = s.c;
                    const right = Math.sin(s.mid) >= 0;
                    const [ex, ey] = polar(cx, cy, R, s.mid);
                    const y = adjY.get(c.entry.id) ?? ey;
                    const kneeX = right ? cx + R + 7 : cx - R - 7;
                    const textX = right ? kneeX + 2 : kneeX - 2;
                    const label = c.percent < 1 ? '<1 %' : `${Math.round(c.percent)} %`;
                    return (
                        <g key={`o-${c.entry.id}`} style={{ pointerEvents: 'none' }}>
                            <polyline
                                points={`${ex},${ey} ${kneeX},${y} ${textX},${y}`}
                                fill="none"
                                stroke={c.color}
                                strokeWidth={0.6}
                                strokeOpacity={0.75}
                            />
                            <text
                                x={textX + (right ? 0.5 : -0.5)}
                                y={y}
                                fill={c.color}
                                fontSize={7}
                                fontWeight={600}
                                textAnchor={right ? 'start' : 'end'}
                                dominantBaseline="central"
                            >
                                {label}
                            </text>
                        </g>
                    );
                })}
                {donut && center && (
                    <>
                        <text
                            x={cx}
                            y={center.unit ? cy - 2 : cy}
                            fill="var(--text-primary)"
                            fontSize={11}
                            fontWeight={700}
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {center.value}
                        </text>
                        {center.unit && (
                            <text
                                x={cx}
                                y={cy + 8}
                                fill="var(--text-secondary)"
                                fontSize={7}
                                textAnchor="middle"
                                dominantBaseline="central"
                            >
                                {center.unit}
                            </text>
                        )}
                    </>
                )}
            </svg>
        </div>
    );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({
    items,
    side,
    align,
    format,
    fmt,
}: {
    items: Computed[];
    side: 'left' | 'right' | 'below' | 'top';
    align?: 'left' | 'center' | 'right';
    format: LegendFormat;
    fmt: (v: number, e: EnergyEntry) => string;
}) {
    const isRight = side === 'right';
    // 'top'/'below' render a full-width, horizontally-stacked legend.
    const isStacked = side === 'below' || side === 'top';
    // Explicit alignment overrides the side-derived default (stacked → center, right → right, else left).
    const effAlign: 'left' | 'center' | 'right' = align ?? (isStacked ? 'center' : isRight ? 'right' : 'left');
    const alignRight = effAlign === 'right';
    const alignCenter = effAlign === 'center';
    const wantIcon = format === 'icon-value' || format === 'icon-label-value';
    const wantLabel = format === 'label' || format === 'label-value' || format === 'icon-label-value';
    const wantValue = format !== 'label';
    return (
        <div
            className={`flex flex-col justify-center gap-1 min-w-0 ${isStacked ? 'w-full' : 'flex-1'}`}
            style={{ alignItems: 'stretch' }}
        >
            {items.map((c) => {
                const iconEl = wantIcon && c.entry.icon && (
                    <Icon
                        icon={toIconifyId(c.entry.icon)}
                        width={16}
                        height={16}
                        style={{ color: c.color, flexShrink: 0 }}
                    />
                );
                const labelEl = wantLabel && c.entry.label && (
                    <span
                        className={isStacked ? 'truncate' : ''}
                        style={{
                            color: c.color,
                            fontSize: 12,
                            minWidth: 0,
                            textAlign: effAlign,
                            // Side legends wrap long labels (block below) instead of clipping.
                            overflowWrap: isStacked ? undefined : 'break-word',
                        }}
                    >
                        {c.entry.label}
                    </span>
                );
                const valueEl = wantValue && (
                    <span
                        className="truncate shrink-0"
                        style={{ color: c.color, fontSize: 12, fontWeight: 600, textAlign: effAlign }}
                    >
                        {fmt(c.value, c.entry)}
                    </span>
                );
                // Side legends: icon beside a stacked label/value block, so a long label
                // wraps over multiple lines without ever overlapping the value.
                if (!isStacked) {
                    return (
                        <div
                            key={c.entry.id}
                            className="flex items-center gap-1.5 min-w-0"
                            style={{ flexDirection: alignRight ? 'row-reverse' : 'row' }}
                            title={c.entry.label}
                        >
                            {iconEl}
                            <div
                                className="flex flex-col min-w-0 flex-1"
                                style={{
                                    alignItems: alignRight ? 'flex-end' : alignCenter ? 'center' : 'flex-start',
                                }}
                            >
                                {labelEl}
                                {valueEl}
                            </div>
                        </div>
                    );
                }
                // Stacked (top/below): single inline row across the full width.
                return (
                    <div
                        key={c.entry.id}
                        className="flex items-center gap-1.5 min-w-0"
                        style={{
                            flexDirection: alignRight ? 'row-reverse' : 'row',
                            justifyContent: alignCenter ? 'center' : undefined,
                        }}
                        title={c.entry.label}
                    >
                        {iconEl}
                        {labelEl}
                        {valueEl}
                    </div>
                );
            })}
        </div>
    );
}
