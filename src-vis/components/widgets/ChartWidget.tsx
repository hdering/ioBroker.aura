import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis, ReferenceLine } from 'recharts';
import { TrendingUp, BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfigStore } from '../../store/configStore';
import { useChartHistory, type ChartTimeRange, RANGE_LABELS } from '../../hooks/useChartHistory';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { formatYTick } from '../../utils/chartFormat';
import { samplePreviewHistory } from '../../utils/sampleChartData';

const PRESET_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

/** Static sample series for the editor preview (computed once). */
const PREVIEW_HISTORY = samplePreviewHistory();

function formatTick(ts: number, rangeMs: number): string {
    const d = new Date(ts);
    if (rangeMs >= 2 * 86_400_000) {
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatLabel(ts: number): string {
    return new Date(ts).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function ChartWidget({ config, editMode }: WidgetProps) {
    const { subscribe, connected } = useIoBroker();
    const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);

    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const unit = o.unit as string | undefined;
    const historyInstance = o.historyInstance as string | undefined;
    // Set on popup charts opened from a value-display widget that had no history instance to
    // inherit — the chart then auto-detects the DP's adapter (selection field when several).
    const autoHistory = o.autoHistoryInstance === true;
    const cfgRange = (o.historyRange as ChartTimeRange | undefined) ?? '24h';
    const customVal = (o.historyRangeCustomValue as number | undefined) ?? 24;
    const customUnit = (o.historyRangeCustomUnit as 'h' | 'd' | undefined) ?? 'h';
    const cfgCustomMs = cfgRange === 'custom' ? customVal * (customUnit === 'd' ? 86_400_000 : 3_600_000) : undefined;
    const lockRange = o.lockRange === true;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const showAverage = o.showAverage === true;
    const showAverageAsValue = o.showAverageAsValue === true;
    const layout = config.layout ?? 'default';
    const lineColor = (o.lineColor as string | undefined) ?? 'var(--accent)';
    const unitColor = (o.unitColor as string | undefined) ?? 'var(--text-primary)';
    const avgColor = (o.avgColor as string | undefined) ?? lineColor;
    const showYAxis = o.showYAxis === true;
    const yAxisCompact = o.yAxisCompact !== false;
    const showXAxis = o.showXAxis !== false;
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, TrendingUp);

    // ── Frontend-local range selection (starts from admin config, switchable at runtime) ──
    const [activeRange, setActiveRange] = useState<ChartTimeRange>(cfgRange);
    const [activeCustomMs, setActiveCustomMs] = useState<number | undefined>(cfgCustomMs);

    // Reset when admin config changes
    useEffect(() => {
        setActiveRange(cfgRange);
        setActiveCustomMs(cfgCustomMs);
    }, [cfgRange, cfgCustomMs]);

    const effectiveRangeMs =
        activeRange === 'custom'
            ? (activeCustomMs ?? 86_400_000)
            : ((
                  {
                      '1h': 3_600_000,
                      '6h': 21_600_000,
                      '24h': 86_400_000,
                      '7d': 604_800_000,
                      '30d': 2_592_000_000,
                  } as Record<string, number>
              )[activeRange] ?? 86_400_000);

    // Auto-detected instance picked at runtime (only relevant when autoHistory and no
    // configured instance). useChartHistory falls back to its first detected adapter on its
    // own, so a single adapter needs no pick; this state only drives the multi-adapter case.
    const [pickedInstance, setPickedInstance] = useState<string | undefined>(undefined);
    const effInstance = historyInstance ?? (autoHistory ? pickedInstance : undefined);

    const raw = useChartHistory(config.datapoint, effInstance, activeRange, connected, subscribe, activeCustomMs);

    // Default the picker to the first adapter once several are detected.
    useEffect(() => {
        if (autoHistory && !historyInstance && raw.adapters.length > 1 && !pickedInstance) {
            setPickedInstance(raw.adapters[0].instance);
        }
    }, [autoHistory, historyInstance, raw.adapters, pickedInstance]);

    // A history range is available when an instance is configured, or one was auto-detected.
    const hasResolvedInstance = !!historyInstance || (autoHistory && raw.adapters.length > 0);
    const showAdapterPicker = autoHistory && !historyInstance && raw.adapters.length > 1;

    // In the popup editor the datapoint is a {{placeholder}} that can't resolve, so there
    // is no real history. Show a representative sample chart instead of an empty widget.
    const isPreview = editMode && (config.datapoint?.startsWith('{{') ?? false) && raw.history.length === 0;
    const history = isPreview ? PREVIEW_HISTORY : raw.history;
    const current = isPreview ? history[history.length - 1].v : raw.current;
    const loading = isPreview ? false : raw.loading;

    const avg =
        (showAverage || showAverageAsValue) && history.length > 1
            ? history.reduce((sum, p) => sum + p.v, 0) / history.length
            : null;

    // Mount/unmount ResponsiveContainer based on container visibility.
    // Recharts' internal ResizeObserver fires when display:none collapses the container to 0×0
    // and logs a warning. Toggle hasSize bidirectionally so the chart unmounts on hide and
    // remounts on show (isAnimationActive=false means no flicker).
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

    const noData = (
        <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: 'var(--text-secondary)' }}
        >
            {loading ? (
                <Loader size={20} strokeWidth={1.5} className="animate-spin" />
            ) : (
                <BarChart2 size={24} strokeWidth={1} />
            )}
            <span className="text-xs">{loading ? 'Lade Verlauf…' : 'Warte auf Daten…'}</span>
        </div>
    );

    // "Vorschau" badge — marks the sample chart shown in the popup editor.
    const previewBadge = isPreview ? (
        <span
            className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-medium pointer-events-none"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            Vorschau
        </span>
    ) : null;

    // Selection field for the history adapter — shown in the popup auto-detect case when the
    // resolved datapoint has more than one history instance to choose from.
    const adapterPicker = showAdapterPicker ? (
        <select
            className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium focus:outline-none"
            style={{
                background: 'var(--app-border)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
            value={pickedInstance ?? raw.adapters[0].instance}
            onChange={(e) => setPickedInstance(e.target.value)}
            title="Verlaufs-Instanz"
        >
            {raw.adapters.map((a) => (
                <option key={a.instance} value={a.instance}>
                    {a.label}
                </option>
            ))}
        </select>
    ) : null;

    // Range selector shown only when a history adapter is configured/detected and not locked
    const rangeSelector =
        hasResolvedInstance && !lockRange ? (
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
                        {customVal} {customUnit === 'd' ? (customVal === 1 ? 'Tag' : 'Tage') : 'Std'}
                    </button>
                )}
            </div>
        ) : null;

    // ── CARD ─────────────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col h-full" style={{ position: 'relative' }}>
                {previewBadge}
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-start gap-1.5 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                strokeWidth={1.5}
                                style={{ color: lineColor, flexShrink: 0, marginTop: 2 }}
                            />
                        )}
                        <div className="min-w-0 flex-1">
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    }}
                                >
                                    {config.title}
                                </p>
                            )}
                            {current !== null && (
                                <p
                                    className="aura-widget-value text-xl font-bold leading-tight"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {formatNum(current, decimals)}
                                    {unit && (
                                        <span className="text-lg ml-1 font-medium" style={{ color: unitColor }}>
                                            {unit}
                                        </span>
                                    )}
                                </p>
                            )}
                            {showAverageAsValue && avg !== null && (
                                <p className="text-xs leading-tight mt-0.5" style={{ color: avgColor }}>
                                    Ø {formatNum(avg, decimals)}
                                    {unit ? ` ${unit}` : ''}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                {(rangeSelector || adapterPicker) && (
                    <div className="mb-1.5 flex items-center gap-1 flex-wrap">
                        {rangeSelector}
                        {adapterPicker}
                    </div>
                )}
                <div className="flex-1" style={{ minHeight: 1 }}>
                    {history.length > 1 ? (
                        hasSize ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history}>
                                    <defs>
                                        <linearGradient id={`grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
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
                                        labelFormatter={(label) => formatLabel(Number(label))}
                                        formatter={(v) => `${formatNum(Number(v), decimals)}${unit ? ` ${unit}` : ''}`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="v"
                                        stroke={lineColor}
                                        strokeWidth={2}
                                        fill={`url(#grad-${config.id})`}
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
                                                value: `Ø ${formatNum(avg, decimals)}${unit ? ` ${unit}` : ''}`,
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
                        noData
                    )}
                </div>
            </div>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    return (
        <div ref={containerRef} className="flex flex-col h-full" style={{ position: 'relative' }}>
            {previewBadge}
            <div className="flex justify-between items-start mb-1">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
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
                {current !== null && (
                    <div className="aura-widget-value flex flex-col items-end shrink-0 ml-2">
                        <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                            {formatNum(current, decimals)}
                            {unit ? ` ${unit}` : ''}
                        </span>
                        {showAverageAsValue && avg !== null && (
                            <span className="text-[10px] leading-tight" style={{ color: avgColor }}>
                                Ø {formatNum(avg, decimals)}
                                {unit ? ` ${unit}` : ''}
                            </span>
                        )}
                    </div>
                )}
            </div>
            {(rangeSelector || adapterPicker) && (
                <div className="mb-1 flex items-center gap-1 flex-wrap">
                    {rangeSelector}
                    {adapterPicker}
                </div>
            )}
            <div className="flex-1" style={{ minHeight: 1 }}>
                {history.length > 1 ? (
                    hasSize ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history}>
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
                                    hide={!showXAxis}
                                    tickFormatter={(ts) => formatTick(ts, effectiveRangeMs)}
                                    tick={tickStyle}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={40}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    labelFormatter={(label) => formatLabel(Number(label))}
                                    formatter={(v) => `${formatNum(Number(v), decimals)}${unit ? ` ${unit}` : ''}`}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="v"
                                    stroke={lineColor}
                                    strokeWidth={2}
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
                                            value: `Ø ${formatNum(avg, decimals)}${unit ? ` ${unit}` : ''}`,
                                            position: 'insideTopRight',
                                            fill: avgColor,
                                            fontSize: 10,
                                        }}
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : null
                ) : (
                    noData
                )}
            </div>
        </div>
    );
}
