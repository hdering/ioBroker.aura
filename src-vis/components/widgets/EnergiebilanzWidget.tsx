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
import { Scale } from 'lucide-react';
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
    legendSide?: 'left' | 'right' | 'below';
}

/** What each legend row shows. Default 'icon-value'. */
export type LegendFormat = 'value' | 'icon-value' | 'label-value' | 'icon-label-value';

export interface EnergyBalanceOptions {
    bars: EnergyBar[];
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
    showLegend?: boolean;
    /** Legend position for all bars. Falls back to each bar's own `legendSide`, then 'below'. */
    legendSide?: 'left' | 'right' | 'below';
    /** Horizontal text alignment of the legend rows. Defaults to the side (right when side is 'right', else left). */
    legendAlign?: 'left' | 'right';
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
    const showLegend = o.showLegend !== false;
    const legendFormat = o.legendFormat ?? 'icon-value';
    const legendAlign = o.legendAlign;
    const unit = o.unit ?? 'kWh';
    const decimals = o.decimals ?? defaultDecimals ?? 2;
    const range = o.range ?? '24h';
    // Honor the shared "Darstellung" appearance controls (icon, hide icon, icon size, align).
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 18;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon, Scale);

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
                Keine Balken konfiguriert – im Editor Balken und Datenpunkte hinzufügen.
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
                    const stacked = <StackedBar items={computed} total={total} showPercent={showPercent} />;

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
                            <div className="flex-1 min-h-0 w-full flex items-stretch justify-center gap-2">
                                {side === 'left' && legend}
                                {stacked}
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

function StackedBar({ items, total, showPercent }: { items: Computed[]; total: number; showPercent: boolean }) {
    if (total <= 0) {
        return (
            <div
                className="rounded-lg self-stretch"
                style={{
                    width: 46,
                    minHeight: 80,
                    background: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
                    border: '1px dashed var(--app-border)',
                }}
            />
        );
    }
    return (
        <div className="rounded-lg overflow-hidden self-stretch flex flex-col" style={{ width: 46, minHeight: 80 }}>
            {items.map((c) => (
                <div
                    key={c.entry.id}
                    className="flex items-center justify-center"
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
                    {showPercent && c.percent >= 8 ? `${Math.round(c.percent)} %` : ''}
                </div>
            ))}
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
    side: 'left' | 'right' | 'below';
    align?: 'left' | 'right';
    format: LegendFormat;
    fmt: (v: number, e: EnergyEntry) => string;
}) {
    const isRight = side === 'right';
    const isBelow = side === 'below';
    // Explicit alignment overrides the side-derived default; below stays centred only when unset.
    const alignRight = align === 'right' || (align == null && isRight);
    const centerRow = isBelow && align == null;
    const wantIcon = format === 'icon-value' || format === 'icon-label-value';
    const wantLabel = format === 'label-value' || format === 'icon-label-value';
    return (
        <div
            className={`flex flex-col justify-center gap-1 min-w-0 ${isBelow ? 'w-full' : ''}`}
            style={{ alignItems: 'stretch' }}
        >
            {items.map((c) => (
                <div
                    key={c.entry.id}
                    className="flex items-center gap-1.5 min-w-0"
                    style={{
                        flexDirection: alignRight ? 'row-reverse' : 'row',
                        justifyContent: centerRow ? 'center' : undefined,
                    }}
                    title={c.entry.label}
                >
                    {wantIcon && c.entry.icon && (
                        <Icon
                            icon={toIconifyId(c.entry.icon)}
                            width={16}
                            height={16}
                            style={{ color: c.color, flexShrink: 0 }}
                        />
                    )}
                    {wantLabel && c.entry.label && (
                        <span
                            className="truncate"
                            style={{
                                color: c.color,
                                fontSize: 12,
                                flex: isBelow ? undefined : '1 1 0',
                                minWidth: 0,
                                textAlign: alignRight ? 'right' : 'left',
                            }}
                        >
                            {c.entry.label}
                        </span>
                    )}
                    <span
                        className="truncate shrink-0"
                        style={{
                            color: c.color,
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: alignRight ? 'right' : 'left',
                        }}
                    >
                        {fmt(c.value, c.entry)}
                    </span>
                </div>
            ))}
        </div>
    );
}
