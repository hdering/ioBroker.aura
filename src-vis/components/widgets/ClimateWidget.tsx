import { useRef, useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis, ReferenceLine } from 'recharts';
import { Thermometer, Droplets, Loader, BarChart2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfigStore } from '../../store/configStore';
import { useChartHistory, type ChartTimeRange, RANGE_LABELS } from '../../hooks/useChartHistory';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { formatYTick } from '../../utils/chartFormat';

const PRESET_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

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
    const showTargetTemp = o.showTargetTemp !== false && !!(o.targetDatapoint as string | undefined);
    const showHumidity = o.showHumidity !== false;
    const showComfort = o.showComfort === true;
    const showChart = o.showChart !== false;

    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const unit = (o.unit as string | undefined) ?? '°C';
    const humidityUnit = (o.humidityUnit as string | undefined) ?? '%';
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
    const showAverage = o.showAverage === true;
    const showAverageAsValue = o.showAverageAsValue === true;
    const avgColor = (o.avgColor as string | undefined) ?? lineColor;

    const TempIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
    const HumidityIcon = getWidgetIcon(o.humidityIcon as string | undefined, Droplets);

    const targetDpId = (o.targetDatapoint as string | undefined) ?? '';
    const humidityDpId = (o.humidityDatapoint as string | undefined) ?? '';

    const { value: rawActual } = useDatapoint(config.datapoint);
    const { value: rawTarget } = useDatapoint(targetDpId);
    const { value: rawHumidity } = useDatapoint(humidityDpId);

    const actualTemp = typeof rawActual === 'number' ? rawActual : null;
    const targetTemp = typeof rawTarget === 'number' ? rawTarget : null;
    const humidity = typeof rawHumidity === 'number' ? rawHumidity : null;

    const [activeRange, setActiveRange] = useState<ChartTimeRange>(cfgRange);
    const [activeCustomMs, setActiveCustomMs] = useState<number | undefined>(cfgCustomMs);
    useEffect(() => {
        setActiveRange(cfgRange);
        setActiveCustomMs(cfgCustomMs);
    }, [cfgRange, cfgCustomMs]);

    const { history, loading } = useChartHistory(
        config.datapoint,
        historyInstance,
        activeRange,
        connected,
        subscribe,
        activeCustomMs,
    );

    const avg =
        (showAverage || showAverageAsValue) && history.length > 1
            ? history.reduce((sum, p) => sum + p.v, 0) / history.length
            : null;

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

    const showChartSection = showChart && !!historyInstance;

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
        <div ref={containerRef} className="aura-widget-row flex flex-col h-full gap-1">
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
            {(showActualTemp || showHumidity || showTargetTemp) && (
                <div className="aura-widget-value flex items-end justify-between gap-2">
                    {showActualTemp && (
                        <div className="flex flex-col leading-none">
                            <span
                                className="font-black"
                                style={{ fontSize: Math.round(30 * fontScale), color: 'var(--text-primary)' }}
                            >
                                {actualTemp !== null ? formatNum(actualTemp, decimals) : '–'}
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
                                    Ø {formatNum(avg, decimals)} {unit}
                                </span>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {showTargetTemp && targetTemp !== null && (
                            <span
                                className="text-[11px] px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                            >
                                ↑ {formatNum(targetTemp, decimals)}
                                {unit}
                            </span>
                        )}
                        {showHumidity && (
                            <span
                                className="flex items-center gap-1 font-medium"
                                style={{ fontSize: Math.round(14 * fontScale), color: 'var(--text-secondary)' }}
                            >
                                <HumidityIcon size={Math.round(14 * fontScale)} strokeWidth={1.5} />
                                {humidity !== null ? formatNum(humidity, decimals) : '–'}
                                {humidityUnit}
                            </span>
                        )}
                    </div>
                </div>
            )}

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
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        hide={!showYAxis}
                                        tick={tickStyle}
                                        tickLine={false}
                                        axisLine={false}
                                        width={showYAxis ? (yAxisCompact ? 22 : 36) : 0}
                                        tickFormatter={(v: number) => formatYTick(v, decimals, yAxisCompact)}
                                    />
                                    <XAxis
                                        dataKey="t"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        scale="time"
                                        hide
                                    />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        labelFormatter={formatLabel}
                                        formatter={(v: number) => `${formatNum(v, decimals)} ${unit}`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="v"
                                        stroke={lineColor}
                                        strokeWidth={2}
                                        fill={`url(#climate-grad-${config.id})`}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                    {showAverage && avg !== null && (
                                        <ReferenceLine
                                            y={avg}
                                            stroke={avgColor}
                                            strokeDasharray="4 3"
                                            strokeWidth={1.5}
                                            label={{
                                                value: `Ø ${formatNum(avg, decimals)} ${unit}`,
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
        </div>
    );
}
