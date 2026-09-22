import { useRef, useState, useEffect, useMemo } from 'react';
import {
    AreaChart,
    Area,
    Line,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    YAxis,
    XAxis,
    ReferenceLine,
    Legend,
} from 'recharts';
import { Thermometer, Loader, BarChart2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfigStore } from '../../store/configStore';
import { type ChartTimeRange, RANGE_LABELS } from '../../hooks/useChartHistory';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../hooks/useMultiSeriesData';
import { useTemplateValues } from '../../hooks/useTemplateValues';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { ClimateMetric, WidgetProps } from '../../types';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { formatYTick } from '../../utils/chartFormat';
import { StatusBadges } from './StatusBadges';
import {
    climateMetricRefs,
    formatMetric,
    mergeChartRows,
    metricsInSlot,
    resolveClimateMetrics,
    LEGACY_TARGET,
    type ClimateContext,
    type FormattedMetric,
    type ResolvedClimateMetric,
} from '../../utils/climateMetrics';
import { ClimateMetricGrid, ClimateMetricPrimary, ClimateMetricValue } from './ClimateMetricChips';

const PRESET_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

/** Series key of the temperature — the main datapoint always draws itself. */
const TEMP_SERIES = '__temp';

function formatLabel(ts: number): string {
    return new Date(ts).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function ComfortBadge({ temp, humidity }: { temp: number | null; humidity: number | null }) {
    const tempOk = temp !== null && temp >= 18 && temp <= 24;
    const humOk = humidity !== null && humidity >= 40 && humidity <= 60;
    const bothOk = tempOk && humOk;
    const color = bothOk ? '#22c55e' : '#f59e0b';
    const label = bothOk ? 'Komfortabel' : 'Außerhalb Komfortzone';
    return (
        <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium self-start"
            style={{ background: `${color}22`, color }}
        >
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                    flexShrink: 0,
                }}
            />
            {label}
        </span>
    );
}

export function ClimateWidget({ config }: WidgetProps) {
    const { subscribe, connected } = useIoBroker();
    const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);

    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showActualTemp = o.showActualTemp !== false;
    const showTargetTemp = o.showTargetTemp !== false;
    const showHumidity = o.showHumidity !== false;
    const showPressure = o.showPressure !== false;
    const showComfort = o.showComfort === true;
    const showChart = o.showChart !== false;

    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const numFmt = (o.numberFormat as NumberFormat | undefined) ?? globalNumFmt;
    const unit = (o.unit as string | undefined) ?? '°C';
    const humidityUnit = (o.humidityUnit as string | undefined) ?? '%';
    const pressureUnit = (o.pressureUnit as string | undefined) ?? 'hPa';
    // Pressure is conventionally shown without decimals — independent of the temperature setting.
    const pressureDecimals = (o.pressureDecimals as number | undefined) ?? 0;
    const lineColor = (o.lineColor as string | undefined) ?? 'var(--accent)';
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const historyInstance = o.historyInstance as string | undefined;
    const cfgRange = (o.historyRange as ChartTimeRange | undefined) ?? '24h';
    const customVal = (o.historyRangeCustomValue as number | undefined) ?? 24;
    const customUnit = (o.historyRangeCustomUnit as 'h' | 'd' | undefined) ?? 'h';
    const cfgCustomMs = cfgRange === 'custom' ? customVal * (customUnit === 'd' ? 86_400_000 : 3_600_000) : undefined;
    const lockRange = o.lockRange === true;
    const showYAxis = o.showYAxis === true;
    const yAxisCompact = o.yAxisCompact !== false;
    const showGridLines = o.showGridLines === true;
    const showAverage = o.showAverage === true;
    const showAverageAsValue = o.showAverageAsValue === true;
    const avgColor = (o.avgColor as string | undefined) ?? lineColor;
    // Weitere Werte (Issue #698)
    const metricColumns = (o.metricColumns as number | undefined) ?? 0;
    const showMetricLabels = o.showMetricLabels !== false;
    const showChartLegend = o.showChartLegend !== false;

    const TempIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);

    const targetDpId = (o.targetDatapoint as string | undefined) ?? '';
    const humidityDpId = (o.humidityDatapoint as string | undefined) ?? '';
    const pressureDpId = (o.pressureDatapoint as string | undefined) ?? '';
    const humidityIcon = o.humidityIcon as string | undefined;
    const pressureIcon = o.pressureIcon as string | undefined;
    const extraMetrics = (o.metrics as ClimateMetric[] | undefined) ?? [];

    // ── Werte ────────────────────────────────────────────────────────────────
    // Soll, Feuchte und Luftdruck haben eigene Optionen, alles Weitere steht in
    // `metrics`; resolveClimateMetrics macht daraus eine einzige Liste.
    const extraKey = JSON.stringify(extraMetrics);
    const metrics = useMemo(
        () =>
            resolveClimateMetrics(
                {
                    showTargetTemp,
                    targetDatapoint: targetDpId,
                    unit,
                    showHumidity,
                    humidityDatapoint: humidityDpId,
                    humidityIcon,
                    humidityUnit,
                    showPressure,
                    pressureDatapoint: pressureDpId,
                    pressureIcon,
                    pressureUnit,
                    pressureDecimals,
                },
                extraMetrics,
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            showTargetTemp,
            targetDpId,
            unit,
            showHumidity,
            humidityDpId,
            humidityIcon,
            humidityUnit,
            showPressure,
            pressureDpId,
            pressureIcon,
            pressureUnit,
            pressureDecimals,
            extraKey,
        ],
    );

    const { value: rawActual } = useDatapoint(config.datapoint);
    const actualTemp = typeof rawActual === 'number' ? rawActual : null;

    // Die Feuchte wird auch dann abonniert, wenn ihre Zeile ausgeblendet ist —
    // Taupunkt und absolute Feuchte rechnen mit ihr.
    const refs = useMemo(() => {
        const list = climateMetricRefs(metrics);
        if (humidityDpId && !list.includes(humidityDpId)) list.push(humidityDpId);
        return list;
    }, [metrics, humidityDpId]);
    const dpValues = useTemplateValues(refs);

    const humidity = typeof dpValues[humidityDpId] === 'number' ? (dpValues[humidityDpId] as number) : null;
    const ctx: ClimateContext = { temperature: actualTemp, humidity };

    const formatted = useMemo(() => {
        const map: Record<string, FormattedMetric> = {};
        for (const m of metrics) map[m.id] = formatMetric(m, dpValues, ctx, { decimals, numberFormat: numFmt });
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metrics, dpValues, actualTemp, humidity, decimals, numFmt]);

    const primaryMetrics = metricsInSlot(metrics, 'primary');
    const secondaryMetrics = metricsInSlot(metrics, 'secondary');
    const gridMetrics = metricsInSlot(metrics, 'grid');

    const [activeRange, setActiveRange] = useState<ChartTimeRange>(cfgRange);
    const [activeCustomMs, setActiveCustomMs] = useState<number | undefined>(cfgCustomMs);
    useEffect(() => {
        setActiveRange(cfgRange);
        setActiveCustomMs(cfgCustomMs);
    }, [cfgRange, cfgCustomMs]);

    const showChartSection = showChart && !!historyInstance;

    // ── Diagramm: Temperatur plus jeder Wert mit „im Diagramm" ────────────────
    const chartMetrics: ResolvedClimateMetric[] = useMemo(
        () => metrics.filter((m) => m.inChart && (m.source ?? 'datapoint') === 'datapoint' && !!m.datapoint),
        [metrics],
    );

    const activeCustomValue = activeCustomMs ? activeCustomMs / 3_600_000 : customVal;
    const chartSeries: EChartSeriesConfig[] = useMemo(() => {
        if (!showChartSection) return [];
        const common = {
            historyRange: activeRange,
            historyRangeCustomValue: activeRange === 'custom' ? activeCustomValue : undefined,
            historyRangeCustomUnit: 'h' as const,
        };
        const list: EChartSeriesConfig[] = [
            {
                id: TEMP_SERIES,
                name: config.title || 'Temperatur',
                datapointId: config.datapoint,
                chartType: 'area',
                color: lineColor,
                historyInstance,
                ...common,
            },
        ];
        for (const m of chartMetrics) {
            list.push({
                id: m.id,
                name: m.label || m.datapoint || m.id,
                datapointId: m.datapoint as string,
                chartType: m.chartType === 'area' ? 'area' : 'line',
                color: m.color,
                historyInstance: m.historyInstance ?? historyInstance,
                ...common,
            });
        }
        return list;
    }, [
        showChartSection,
        config.datapoint,
        config.title,
        lineColor,
        historyInstance,
        chartMetrics,
        activeRange,
        activeCustomValue,
    ]);

    const seriesData = useMultiSeriesData(chartSeries, connected, subscribe);

    /** Punkte aller Reihen auf eine gemeinsame Zeitachse legen (Lücken bleiben Lücken). */
    const history = useMemo(
        () =>
            mergeChartRows(
                chartSeries.map((s) => s.id),
                (id) => seriesData.get(id)?.data,
            ),
        [seriesData, chartSeries],
    );

    const loading = chartSeries.some((s) => seriesData.get(s.id)?.loading ?? true);

    const tempPoints = seriesData.get(TEMP_SERIES)?.data ?? [];
    const avg =
        (showAverage || showAverageAsValue) && tempPoints.length > 1
            ? tempPoints.reduce((sum, p) => sum + p[1], 0) / tempPoints.length
            : null;

    /** Beschriftung, Einheit und Nachkommastellen je Reihe — für Tooltip und Legende. */
    const seriesMeta = useMemo(() => {
        const map: Record<string, { name: string; unit: string; decimals: number; axis: 'left' | 'right' }> = {
            [TEMP_SERIES]: { name: config.title || 'Temperatur', unit, decimals, axis: 'left' },
        };
        for (const m of chartMetrics) {
            map[m.id] = {
                name: m.label || m.datapoint || m.id,
                unit: m.unit ?? '',
                decimals: m.decimals ?? decimals,
                axis: m.chartAxis === 'right' ? 'right' : 'left',
            };
        }
        return map;
    }, [chartMetrics, config.title, unit, decimals]);

    const hasRightAxis = chartMetrics.some((m) => m.chartAxis === 'right');

    const containerRef = useRef<HTMLDivElement>(null);
    const [hasSize, setHasSize] = useState(false);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setHasSize(el.clientWidth > 0 && el.clientHeight > 0);
        const ro = new ResizeObserver(() => {
            const w = containerRef.current?.clientWidth ?? 0;
            const h = containerRef.current?.clientHeight ?? 0;
            setHasSize(w > 0 && h > 0);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const tooltipStyle = {
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        fontSize: Math.round(11 * fontScale),
        color: 'var(--text-primary)',
    };
    const tickStyle = { fontSize: Math.round(10 * fontScale), fill: 'var(--text-secondary)' };

    const rangeSelector =
        showChartSection && !lockRange ? (
            <div className="flex gap-1 flex-wrap">
                {PRESET_RANGES.map((r) => {
                    const active = activeRange === r;
                    return (
                        <button
                            key={r}
                            className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-border)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                            }}
                            onClick={() => {
                                setActiveRange(r);
                                setActiveCustomMs(undefined);
                            }}
                        >
                            {RANGE_LABELS[r]}
                        </button>
                    );
                })}
                {cfgRange === 'custom' && (
                    <button
                        className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: activeRange === 'custom' ? 'var(--accent)' : 'var(--app-border)',
                            color: activeRange === 'custom' ? '#fff' : 'var(--text-secondary)',
                        }}
                        onClick={() => {
                            setActiveRange('custom');
                            setActiveCustomMs(cfgCustomMs);
                        }}
                    >
                        {customVal}
                        {customUnit === 'd' ? 'd' : 'h'}
                    </button>
                )}
            </div>
        ) : null;

    return (
        <div ref={containerRef} className="aura-widget-row flex flex-col h-full gap-1" style={{ position: 'relative' }}>
            {/* Title */}
            {(showTitle || showIcon) && (
                <div
                    className="flex items-center gap-1 min-w-0 shrink-0"
                    style={{
                        justifyContent:
                            titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start',
                    }}
                >
                    {showIcon && (
                        <TempIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            strokeWidth={1.5}
                            style={{ color: lineColor, flexShrink: 0 }}
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

            {/* Main values */}
            {(showActualTemp || primaryMetrics.length > 0 || secondaryMetrics.length > 0) && (
                <div className="aura-widget-value flex items-end justify-between gap-2">
                    <div className="flex items-end gap-3 min-w-0">
                        {showActualTemp && (
                            <div className="flex flex-col leading-none">
                                <span
                                    className="font-black"
                                    style={{ fontSize: Math.round(30 * fontScale), color: 'var(--text-primary)' }}
                                >
                                    {actualTemp !== null ? formatNum(actualTemp, decimals, numFmt) : '–'}
                                    <span
                                        className="ml-0.5 font-medium"
                                        style={{ fontSize: Math.round(16 * fontScale), color: 'var(--text-secondary)' }}
                                    >
                                        {unit}
                                    </span>
                                </span>
                                {showAverageAsValue && avg !== null && (
                                    <span
                                        className="mt-0.5"
                                        style={{ fontSize: Math.round(11 * fontScale), color: avgColor }}
                                    >
                                        Ø {formatNum(avg, decimals, numFmt)} {unit}
                                    </span>
                                )}
                            </div>
                        )}
                        {primaryMetrics.map((m) => (
                            <ClimateMetricPrimary
                                key={m.id}
                                metric={m}
                                formatted={formatted[m.id]}
                                fontScale={fontScale}
                            />
                        ))}
                    </div>
                    {secondaryMetrics.length > 0 && (
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                            {secondaryMetrics.map((m) =>
                                // Die Soll-Temperatur war schon immer weg, wenn sie keinen Wert hat.
                                m.id === LEGACY_TARGET && formatted[m.id].empty ? null : (
                                    <ClimateMetricValue
                                        key={m.id}
                                        metric={m}
                                        formatted={formatted[m.id]}
                                        fontScale={fontScale}
                                        showLabel={m.legacy ? true : showMetricLabels}
                                    />
                                ),
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Weitere Werte */}
            <ClimateMetricGrid
                metrics={gridMetrics}
                formatted={formatted}
                fontScale={fontScale}
                columns={metricColumns}
                showLabels={showMetricLabels}
            />

            {/* Comfort badge */}
            {showComfort && <ComfortBadge temp={actualTemp} humidity={humidity} />}

            {/* Range selector */}
            {rangeSelector && <div>{rangeSelector}</div>}

            {/* Chart — isolation:isolate ensures the SVG stacking context doesn't cover the WidgetFrame last-change overlay */}
            {showChartSection && (
                <div className="flex-1" style={{ minHeight: 1, isolation: 'isolate' }}>
                    {history.length > 1 ? (
                        hasSize ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history}>
                                    <defs>
                                        <linearGradient id={`climate-grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    {showGridLines && (
                                        <CartesianGrid horizontal vertical={false} stroke="var(--app-border)" />
                                    )}
                                    <YAxis
                                        yAxisId="left"
                                        domain={['auto', 'auto']}
                                        hide={!showYAxis}
                                        tick={tickStyle}
                                        tickLine={false}
                                        axisLine={false}
                                        width={showYAxis ? (yAxisCompact ? 22 : 36) : 0}
                                        tickFormatter={(v: number) => formatYTick(v, decimals, yAxisCompact, numFmt)}
                                    />
                                    {hasRightAxis && (
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            domain={['auto', 'auto']}
                                            hide={!showYAxis}
                                            tick={tickStyle}
                                            tickLine={false}
                                            axisLine={false}
                                            width={showYAxis ? (yAxisCompact ? 28 : 42) : 0}
                                            tickFormatter={(v: number) => formatYTick(v, 0, yAxisCompact, numFmt)}
                                        />
                                    )}
                                    <XAxis
                                        dataKey="t"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        scale="time"
                                        hide
                                    />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        labelFormatter={(label) => formatLabel(Number(label))}
                                        formatter={(v, _n, entry) => {
                                            const meta = seriesMeta[String(entry?.dataKey ?? TEMP_SERIES)];
                                            if (!meta) return String(v);
                                            return [
                                                `${formatNum(Number(v), meta.decimals, numFmt)} ${meta.unit}`.trim(),
                                                meta.name,
                                            ];
                                        }}
                                    />
                                    {showChartLegend && chartMetrics.length > 0 && (
                                        <Legend
                                            iconSize={8}
                                            wrapperStyle={{
                                                fontSize: Math.round(10 * fontScale),
                                                color: 'var(--text-secondary)',
                                            }}
                                            formatter={(value) => seriesMeta[String(value)]?.name ?? String(value)}
                                        />
                                    )}
                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey={TEMP_SERIES}
                                        stroke={lineColor}
                                        strokeWidth={2}
                                        fill={`url(#climate-grad-${config.id})`}
                                        dot={false}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                    {chartMetrics.map((m) =>
                                        m.chartType === 'area' ? (
                                            <Area
                                                key={m.id}
                                                yAxisId={m.chartAxis === 'right' ? 'right' : 'left'}
                                                type="monotone"
                                                dataKey={m.id}
                                                stroke={m.color ?? 'var(--accent)'}
                                                fill={m.color ?? 'var(--accent)'}
                                                fillOpacity={0.15}
                                                strokeWidth={1.5}
                                                dot={false}
                                                connectNulls
                                                isAnimationActive={false}
                                            />
                                        ) : (
                                            <Line
                                                key={m.id}
                                                yAxisId={m.chartAxis === 'right' ? 'right' : 'left'}
                                                type="monotone"
                                                dataKey={m.id}
                                                stroke={m.color ?? 'var(--accent)'}
                                                strokeWidth={1.5}
                                                dot={false}
                                                connectNulls
                                                isAnimationActive={false}
                                            />
                                        ),
                                    )}
                                    {showAverage && avg !== null && (
                                        <ReferenceLine
                                            yAxisId="left"
                                            y={avg}
                                            stroke={avgColor}
                                            strokeDasharray="4 3"
                                            strokeWidth={1.5}
                                            label={{
                                                value: `Ø ${formatNum(avg, decimals, numFmt)} ${unit}`,
                                                position: 'insideTopRight',
                                                fill: avgColor,
                                                fontSize: 10,
                                            }}
                                        />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : null
                    ) : (
                        <div
                            className="flex flex-col items-center justify-center h-full gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {loading ? (
                                <Loader size={16} strokeWidth={1.5} className="animate-spin" />
                            ) : (
                                <BarChart2 size={18} strokeWidth={1} />
                            )}
                            <span className="text-xs">{loading ? 'Lade Verlauf…' : 'Warte auf Daten…'}</span>
                        </div>
                    )}
                </div>
            )}

            <StatusBadges config={config} />
        </div>
    );
}
