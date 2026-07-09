import ReactECharts from 'echarts-for-react';
import { useRef, useState, useEffect } from 'react';
import { BarChart2, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import {
    useMultiSeriesData,
    useAutoHistoryInstances,
    rangeToMs,
    type EChartSeriesConfig,
    type EChartTimeRange,
} from '../../hooks/useMultiSeriesData';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { samplePreviewSeries } from '../../utils/sampleChartData';
import { useT } from '../../i18n';
import { RANGE_LABELS } from '../../hooks/useChartHistory';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const PRESET_RANGES: EChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const s = source[key];
        const t = result[key];
        const sIsPlainObj = !!s && typeof s === 'object' && !Array.isArray(s);
        if (sIsPlainObj && Array.isArray(t)) {
            // Object override on array target: apply object as defaults to each item
            // (e.g. `series: { type: 'line', step: 'end' }` applied to all series entries)
            result[key] = (t as unknown[]).map((item) =>
                item && typeof item === 'object' && !Array.isArray(item)
                    ? deepMerge(item as Record<string, unknown>, s as Record<string, unknown>)
                    : item,
            );
        } else if (sIsPlainObj && t && typeof t === 'object' && !Array.isArray(t)) {
            result[key] = deepMerge(t as Record<string, unknown>, s as Record<string, unknown>);
        } else {
            result[key] = s;
        }
    }
    return result;
}

export function EChartWidget({ config, editMode }: WidgetProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const t = useT();

    const layout = config.layout ?? 'default';

    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, BarChart2);
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const echartSeries = (o.echartSeries as EChartSeriesConfig[] | undefined) ?? [];
    const echartShowLegend = (o.echartShowLegend as boolean | undefined) ?? true;
    const echartLeftUnit = (o.echartLeftUnit as string | undefined) ?? '';
    const echartRightUnit = (o.echartRightUnit as string | undefined) ?? '';
    const echartLeftMin = o.echartLeftMin as number | string | undefined;
    const echartLeftMax = o.echartLeftMax as number | string | undefined;
    const echartRightMin = o.echartRightMin as number | string | undefined;
    const echartRightMax = o.echartRightMax as number | string | undefined;
    const echartJsonExtra = (o.echartJsonExtra as string | undefined) ?? '';
    const echartShowYAxis = (o.echartShowYAxis as boolean | undefined) ?? true;
    const echartShowXAxis = (o.echartShowXAxis as boolean | undefined) ?? true;
    const echartShowGridLines = (o.echartShowGridLines as boolean | undefined) ?? true;
    const echartShowCurrent = (o.echartShowCurrent as boolean | undefined) ?? true;
    const echartMode = (o.echartMode as string | undefined) ?? 'timeseries';
    const isGauge = config.layout === ('gauge' as string);

    // ── Single widget-level range shared by all series (frontend-switchable unless locked) ──
    // Falls back to the first series' former per-series range so upgraded widgets keep their window.
    const cfgRange = (o.echartRange as EChartTimeRange | undefined) ?? echartSeries[0]?.historyRange ?? '24h';
    const cfgCustomVal =
        (o.echartRangeCustomValue as number | undefined) ?? echartSeries[0]?.historyRangeCustomValue ?? 24;
    const cfgCustomUnit =
        (o.echartRangeCustomUnit as 'h' | 'd' | undefined) ?? echartSeries[0]?.historyRangeCustomUnit ?? 'h';
    const lockRange = o.lockRange === true;
    // Which presets the frontend selector offers (config-selectable; default: all).
    const cfgVisibleRanges = o.echartVisibleRanges as EChartTimeRange[] | undefined;
    const visibleRanges =
        cfgVisibleRanges && cfgVisibleRanges.length > 0
            ? PRESET_RANGES.filter((r) => cfgVisibleRanges.includes(r))
            : PRESET_RANGES;

    const [activeRange, setActiveRange] = useState<EChartTimeRange>(cfgRange);
    const [activeCustomVal, setActiveCustomVal] = useState<number>(cfgCustomVal);
    const [activeCustomUnit, setActiveCustomUnit] = useState<'h' | 'd'>(cfgCustomUnit);

    // ── Day navigation (◀ Heute ▶): view a single calendar day, step day by day ──
    // null = normal rolling-range mode; number = offset in days from today (0 = today, -1 = yesterday …)
    const dayNav = o.echartDayNav === true;
    const [dayOffset, setDayOffset] = useState<number | null>(null);
    const dayWindow = (() => {
        if (!dayNav || dayOffset === null) return null;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + dayOffset);
        const e = new Date(d);
        e.setDate(e.getDate() + 1);
        return { start: d.getTime(), end: e.getTime() };
    })();

    // Reset frontend selection when the admin config changes
    useEffect(() => {
        setActiveRange(cfgRange);
        setActiveCustomVal(cfgCustomVal);
        setActiveCustomUnit(cfgCustomUnit);
    }, [cfgRange, cfgCustomVal, cfgCustomUnit]);

    // Popup charts opened from a value-display widget carry no history instance to inherit.
    // Detect the adapter per series from its resolved datapoint — auto-select the sole one,
    // or offer a selection field when several exist.
    const autoHistory = o.autoHistoryInstance === true;
    const { resolved, setPicked } = useAutoHistoryInstances(echartSeries, autoHistory);

    // All series share the single widget-level range; auto-resolved instances fill in where none
    // is configured.
    const effectiveSeries = echartSeries.map((s) => ({
        ...s,
        historyInstance: s.historyInstance ?? resolved[s.id]?.instance,
        historyRange: activeRange,
        historyRangeCustomValue: activeCustomVal,
        historyRangeCustomUnit: activeCustomUnit,
        // Day mode pins all series to one absolute calendar-day window.
        historyStart: dayWindow?.start,
        historyEnd: dayWindow?.end,
    }));

    const hasHistory = effectiveSeries.some((s) => !!s.historyInstance);

    // Series whose resolved DP has several history adapters → render a selection field each.
    const instancePickers = autoHistory
        ? echartSeries
              .filter((s) => !s.historyInstance && (resolved[s.id]?.adapters.length ?? 0) > 1)
              .map((s) => ({
                  id: s.id,
                  name: s.name,
                  adapters: resolved[s.id]!.adapters,
                  value: resolved[s.id]!.instance ?? '',
              }))
        : [];

    const seriesDataMap = useMultiSeriesData(effectiveSeries, connected, subscribe, getState);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hasSize, setHasSize] = useState(false);
    // Single ResizeObserver handles both initial sizing and tab-switch resize.
    // Avoids the two-effect race where the first effect returns early on visible
    // mount and the second effect never fires when switching to a hidden tab.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const check = () => {
            const w = containerRef.current?.clientWidth ?? 0;
            const h = containerRef.current?.clientHeight ?? 0;
            if (w > 0 && h > 0) {
                setHasSize(true);
                chartRef.current?.getEchartsInstance?.()?.resize?.();
            }
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (layout === 'custom') return <CustomGridView config={config} value="" />;

    const allLoading = echartSeries.length > 0 && echartSeries.every((s) => seriesDataMap.get(s.id)?.loading);
    const hasAnyData = echartSeries.some((s) => (seriesDataMap.get(s.id)?.data.length ?? 0) > 0);

    // In the popup editor the series datapoints are {{placeholders}} that can't resolve,
    // so there is no real data. Render representative sample curves instead of "Keine Daten".
    const isPreview =
        editMode &&
        echartSeries.length > 0 &&
        !hasAnyData &&
        echartSeries.some((s) => (s.datapointId ?? '').includes('{{'));
    const previewData = isPreview ? echartSeries.map((_, idx) => samplePreviewSeries(idx)) : null;
    // A window without records renders as a flat line instead of "Keine Daten":
    //   • day mode: flat zero — the browsed day simply had nothing to log (e.g. no rain);
    //   • rolling range: flat at the current value — a change-logged datapoint that
    //     didn't change in the window has been constant at its live value the whole time.
    const flatLineData = (current: number | null): [number, number][] => {
        const now = Date.now();
        if (dayWindow) {
            return [
                [dayWindow.start, 0],
                [Math.min(dayWindow.end, now), 0],
            ];
        }
        const val = current ?? 0;
        return [
            [now - rangeToMs(activeRange, activeCustomVal, activeCustomUnit), val],
            [now, val],
        ];
    };
    const seriesData = (idx: number, id: string): [number, number][] => {
        if (previewData) return previewData[idx];
        const r = seriesDataMap.get(id);
        const data = r?.data ?? [];
        if (data.length === 0 && r && !r.loading && (dayWindow !== null || !!effectiveSeries[idx]?.historyInstance)) {
            return flatLineData(r.current);
        }
        return data;
    };
    const seriesCurrent = (idx: number, id: string): number | null => {
        if (previewData) return previewData[idx][previewData[idx].length - 1][1];
        const current = seriesDataMap.get(id)?.current ?? null;
        if (dayWindow && current === null && !seriesDataMap.get(id)?.loading) return 0;
        return current;
    };
    const effHasData =
        isPreview || hasAnyData || (echartSeries.length > 0 && !allLoading && (dayWindow !== null || hasHistory));
    const effLoading = !isPreview && allLoading;

    // Gauge mode: show first series' current value as a gauge
    if (isGauge) {
        const firstSeries = echartSeries[0];
        const gaugeValue = seriesCurrent(0, firstSeries?.id ?? '') ?? 0;
        const gaugeColor = firstSeries?.color ?? DEFAULT_COLORS[0];

        const gaugeOption: Record<string, unknown> = {
            backgroundColor: 'transparent',
            series: [
                {
                    type: 'gauge',
                    radius: '85%',
                    progress: { show: true, width: 12 },
                    axisLine: { lineStyle: { width: 12, color: [[1, '#333']] } },
                    axisTick: { show: false },
                    splitLine: { length: 8, lineStyle: { color: '#555', width: 1 } },
                    axisLabel: { color: '#888', fontSize: 10 },
                    pointer: { show: true, length: '60%', width: 4 },
                    itemStyle: { color: gaugeColor },
                    detail: {
                        formatter: `{value}${echartLeftUnit ? ` ${echartLeftUnit}` : ''}`,
                        color: 'var(--text-primary)',
                        fontSize: 16,
                        offsetCenter: [0, '70%'],
                    },
                    title: { color: '#888', fontSize: 11 },
                    data: [{ value: gaugeValue, name: firstSeries?.name ?? '' }],
                },
            ],
        };

        let mergedGauge = gaugeOption;
        if (echartJsonExtra) {
            try {
                const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
                mergedGauge = deepMerge(gaugeOption, extra);
            } catch {
                // ignore invalid JSON
            }
        }

        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col w-full h-full">
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
                <div className="flex-1 relative min-h-0">
                    {hasSize && (
                        <ReactECharts
                            ref={chartRef}
                            option={mergedGauge}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // Comparison mode: categorical bar chart — each series = one bar with its current value
    if (echartMode === 'comparison') {
        const categories = echartSeries.map((s) => s.name);
        const values = echartSeries.map((s, idx) => ({
            value: seriesCurrent(idx, s.id),
            itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
        }));
        const hasData = values.some((v) => v.value !== null);

        const compOption: Record<string, unknown> = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'var(--app-surface, #1e1e1e)',
                borderColor: 'var(--app-border, #333)',
                textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
                formatter: (params: unknown) => {
                    const items = params as { name: string; value: number; marker: string }[];
                    if (!items?.length) return '';
                    return items
                        .map((p) => {
                            const dispVal = typeof p.value === 'number' ? formatNum(p.value, decimals) : p.value;
                            return `${p.marker} ${p.name}: <b>${dispVal}${echartLeftUnit ? ` ${echartLeftUnit}` : ''}</b>`;
                        })
                        .join('<br/>');
                },
            },
            legend: { show: false },
            grid: {
                left: echartShowYAxis ? 60 : 12,
                right: 12,
                top: 16,
                bottom: echartShowXAxis ? 40 : 12,
                containLabel: false,
            },
            xAxis: {
                type: 'category',
                data: categories,
                show: echartShowXAxis,
                axisLabel: { show: echartShowXAxis, color: '#888', fontSize: 10 },
                axisTick: { show: echartShowXAxis },
                axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    show: echartShowYAxis,
                    color: '#888',
                    fontSize: 10,
                    formatter: echartLeftUnit ? `{value} ${echartLeftUnit}` : '{value}',
                },
                axisTick: { show: echartShowYAxis },
                axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
                splitLine: { show: echartShowYAxis, lineStyle: { color: '#333' } },
                ...(echartLeftMin !== undefined ? { min: echartLeftMin } : {}),
                ...(echartLeftMax !== undefined ? { max: echartLeftMax } : {}),
            },
            series: [
                {
                    type: 'bar',
                    data: values,
                    label: {
                        show: true,
                        position: 'top',
                        color: '#888',
                        fontSize: 10,
                        formatter: (p: { value: number | null }) => {
                            if (p.value === null || p.value === undefined) return '';
                            return `${formatNum(p.value, decimals)}${echartLeftUnit ? ` ${echartLeftUnit}` : ''}`;
                        },
                    },
                },
            ],
        };

        let mergedComp = compOption;
        if (echartJsonExtra) {
            try {
                const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
                mergedComp = deepMerge(compOption, extra);
            } catch {
                /* ignore invalid JSON */
            }
        }

        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col w-full h-full">
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
                <div className="flex-1 relative min-h-0">
                    {(echartSeries.length === 0 || !hasData) && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <BarChart2 size={28} strokeWidth={1.5} />
                            <span className="text-xs">{t('echart.noData')}</span>
                        </div>
                    )}
                    {hasSize && hasData && (
                        <ReactECharts
                            ref={chartRef}
                            option={mergedComp}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    )}
                </div>
            </div>
        );
    }

    const hasRightAxis = echartSeries.some((s) => (s.yAxisIndex ?? 0) === 1);

    const leftAxis: Record<string, unknown> = {
        type: 'value',
        // Fit the axis to the data range instead of forcing zero in — otherwise a
        // line at e.g. 200–250 sits at the top with the whole 0–200 band left blank.
        scale: true,
        axisLabel: {
            show: echartShowYAxis,
            color: '#888',
            fontSize: 10,
            formatter: echartLeftUnit ? `{value} ${echartLeftUnit}` : '{value}',
        },
        axisTick: { show: echartShowYAxis },
        axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
        splitLine: { show: echartShowYAxis && echartShowGridLines, lineStyle: { color: '#333' } },
        ...(echartLeftMin !== undefined ? { min: echartLeftMin } : {}),
        ...(echartLeftMax !== undefined ? { max: echartLeftMax } : {}),
    };

    const rightAxis: Record<string, unknown> = hasRightAxis
        ? {
              type: 'value',
              scale: true,
              axisLabel: {
                  show: echartShowYAxis,
                  color: '#888',
                  fontSize: 10,
                  formatter: echartRightUnit ? `{value} ${echartRightUnit}` : '{value}',
              },
              axisTick: { show: echartShowYAxis },
              axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
              splitLine: { show: false },
              ...(echartRightMin !== undefined ? { min: echartRightMin } : {}),
              ...(echartRightMax !== undefined ? { max: echartRightMax } : {}),
          }
        : { show: false };

    const seriesList = echartSeries.map((s, idx) => {
        const data = seriesData(idx, s.id);
        return {
            name: s.name,
            type: s.chartType === 'area' ? 'line' : s.chartType,
            areaStyle: s.chartType === 'area' ? { opacity: 0.2 } : undefined,
            smooth: s.smooth ?? (s.chartType === 'line' || s.chartType === 'area'),
            // Monotone smoothing never overshoots the data — a flat run of equal values
            // (e.g. dry days at 0) stays exactly flat instead of wobbling around it.
            smoothMonotone: 'x',
            lineStyle: { width: s.lineWidth ?? 2 },
            itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
            data,
            yAxisIndex: s.yAxisIndex ?? 0,
            showSymbol: false,
        };
    });

    const option: Record<string, unknown> = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'var(--app-surface, #1e1e1e)',
            borderColor: 'var(--app-border, #333)',
            textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
            formatter: (params: unknown) => {
                const items = params as {
                    axisValue: number;
                    seriesName: string;
                    value: [number, number];
                    marker: string;
                    seriesIndex: number;
                }[];
                if (!items?.length) return '';
                const ts = items[0].axisValue;
                const date = new Date(ts);
                const timeStr = date.toLocaleString(t('echart.dateLocale'), {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                });
                const lines = items.map((p) => {
                    const seriesCfg = echartSeries[p.seriesIndex];
                    const unit = (seriesCfg?.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit;
                    const raw = p.value[1];
                    const dispVal = typeof raw === 'number' ? formatNum(raw, decimals) : raw;
                    return `${p.marker} ${p.seriesName}: <b>${dispVal}${unit ? `\u202F${unit}` : ''}</b>`;
                });
                return `${timeStr}<br/>${lines.join('<br/>')}`;
            },
        },
        legend: echartShowLegend ? { show: true, textStyle: { color: '#888', fontSize: 11 }, top: 4 } : { show: false },
        grid: {
            left: echartShowYAxis ? 60 : 6,
            right: hasRightAxis && echartShowYAxis ? 60 : 6,
            top: echartShowLegend ? 30 : 6,
            bottom: echartShowXAxis ? 32 : 6,
            containLabel: false,
        },
        xAxis: {
            type: 'time',
            show: echartShowXAxis,
            axisLabel: { show: echartShowXAxis, color: '#888', fontSize: 10 },
            axisTick: { show: echartShowXAxis },
            axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
            splitLine: { show: false },
            // Day mode: frame exactly the selected calendar day, even when data is sparse.
            ...(dayWindow ? { min: dayWindow.start, max: dayWindow.end } : {}),
        },
        yAxis: [leftAxis, rightAxis],
        series: seriesList,
    };

    let merged = option;
    if (echartJsonExtra) {
        try {
            const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
            merged = deepMerge(option, extra);
        } catch {
            // ignore invalid JSON
        }
    }

    // Current value(s) shown top-right — one per series, tinted with its colour.
    const currentValues = echartSeries
        .map((s, idx) => ({
            value: seriesCurrent(idx, s.id),
            color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
            unit: (s.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit,
        }))
        .filter((c) => c.value !== null);

    const showCurrentBlock = echartShowCurrent && currentValues.length > 0;

    // Frontend range selector — shown when at least one series has history and not locked.
    const rangeSelector =
        hasHistory && !lockRange ? (
            // nowrap + horizontal scroll: keeps the chips on one line next to the
            // day-nav controls; on very narrow widgets the chips scroll (swipe)
            // instead of wrapping the day-nav into a second row.
            <div className="nodrag flex gap-1 min-w-0 overflow-x-auto aura-no-scrollbar">
                {visibleRanges.map((r) => {
                    const active = dayOffset === null && activeRange === r;
                    return (
                        <button
                            key={r}
                            className="nodrag shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-border)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                            }}
                            onClick={() => {
                                setDayOffset(null);
                                setActiveRange(r);
                            }}
                        >
                            {RANGE_LABELS[r]}
                        </button>
                    );
                })}
                {cfgRange === 'custom' && (
                    <button
                        className="nodrag shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: activeRange === 'custom' ? 'var(--accent)' : 'var(--app-border)',
                            color: activeRange === 'custom' ? '#fff' : 'var(--text-secondary)',
                        }}
                        onClick={() => {
                            setDayOffset(null);
                            setActiveRange('custom');
                            setActiveCustomVal(cfgCustomVal);
                            setActiveCustomUnit(cfgCustomUnit);
                        }}
                    >
                        {cfgCustomVal}{' '}
                        {cfgCustomUnit === 'd'
                            ? cfgCustomVal === 1
                                ? t('echart.daySingular')
                                : t('echart.dayPlural')
                            : t('echart.unitHoursShort')}
                    </button>
                )}
            </div>
        ) : null;

    // Day navigation (◀ Heute ▶) — step through single calendar days, "Heute" returns to the current day.
    const navBtnStyle = (active: boolean): React.CSSProperties => ({
        background: active ? 'var(--accent)' : 'var(--app-border)',
        color: active ? '#fff' : 'var(--text-secondary)',
    });
    const dayNavControls =
        dayNav && hasHistory ? (
            <div className="flex items-center gap-1 shrink-0">
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={navBtnStyle(false)}
                    title={t('echart.dayPrevTitle')}
                    onClick={() => setDayOffset((prev) => (prev ?? 0) - 1)}
                >
                    <ChevronLeft size={12} />
                </button>
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={navBtnStyle(dayOffset === 0)}
                    title={t('echart.dayTodayTitle')}
                    onClick={() => setDayOffset(0)}
                >
                    {t('echart.today')}
                </button>
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
                    style={navBtnStyle(false)}
                    title={t('echart.dayNextTitle')}
                    disabled={dayOffset === null || dayOffset >= 0}
                    onClick={() => setDayOffset((prev) => (prev !== null && prev < 0 ? prev + 1 : prev))}
                >
                    <ChevronRight size={12} />
                </button>
                {dayWindow && (
                    <span
                        className="text-[10px] font-medium ml-1 whitespace-nowrap"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {new Date(dayWindow.start).toLocaleDateString(t('echart.dateLocale'), {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                        })}
                    </span>
                )}
            </div>
        ) : null;

    return (
        <div ref={containerRef} className="flex flex-col w-full h-full">
            {(showTitle || showIcon || showCurrentBlock) && (
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
                    {showCurrentBlock && (
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                            {currentValues.map((c, i) => (
                                <span key={i} className="text-sm font-bold leading-none" style={{ color: c.color }}>
                                    {formatNum(c.value as number, decimals)}
                                    {c.unit ? ` ${c.unit}` : ''}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {(rangeSelector || dayNavControls) && (
                <div className="shrink-0 mb-1 flex items-center justify-between gap-2 min-w-0">
                    {rangeSelector ?? <span />}
                    {dayNavControls}
                </div>
            )}
            {instancePickers.length > 0 && (
                <div className="shrink-0 mb-1 flex items-center gap-1 flex-wrap">
                    {instancePickers.map((p) => (
                        <select
                            key={p.id}
                            className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium focus:outline-none"
                            style={{
                                background: 'var(--app-border)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                            value={p.value}
                            onChange={(e) => setPicked(p.id, e.target.value)}
                            title={echartSeries.length > 1 ? p.name : t('echart.historyInstance')}
                        >
                            {p.adapters.map((a) => (
                                <option key={a.instance} value={a.instance}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    ))}
                </div>
            )}
            <div className="flex-1 relative min-h-0">
                {isPreview && (
                    <span
                        className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-medium pointer-events-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('echart.preview')}
                    </span>
                )}
                {effLoading && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!effLoading && (echartSeries.length === 0 || !effHasData) && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">{t('echart.noData')}</span>
                    </div>
                )}
                {hasSize && effHasData && (
                    <ReactECharts
                        ref={chartRef}
                        option={merged}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                    />
                )}
            </div>
        </div>
    );
}
