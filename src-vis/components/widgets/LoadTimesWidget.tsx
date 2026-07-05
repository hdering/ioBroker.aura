import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Activity } from 'lucide-react';
import { sendToDirect, useIoBroker } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';

// ── Metric catalogue ──────────────────────────────────────────────────────────

interface MetricMeta {
    key: string;
    label: string;
    color: string;
}

const METRICS: MetricMeta[] = [
    { key: 'initialLoad', label: 'Initial-Load', color: '#3b82f6' },
    { key: 'firstContentfulPaint', label: 'First Paint', color: '#10b981' },
    { key: 'socketToFirstState', label: 'Socket → 1. DP', color: '#f59e0b' },
    { key: 'tabSwitch', label: 'Tab-Wechsel', color: '#a855f7' },
    { key: 'longTaskMax', label: 'Long-Task max', color: '#ef4444' },
];
const METRIC_BY_KEY: Record<string, MetricMeta> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

interface PerfSample {
    seq: number;
    ts: number;
    metric: string;
    value: number;
}

const WINDOWS: Record<string, number> = {
    '1h': 3_600_000,
    '6h': 6 * 3_600_000,
    '24h': 24 * 3_600_000,
    '7d': 7 * 86_400_000,
    all: 0,
};

// Static sample so the widget isn't empty in the editor preview.
function previewSamples(): PerfSample[] {
    const now = Date.now();
    const out: PerfSample[] = [];
    let seq = 0;
    for (let i = 9; i >= 0; i--) {
        const ts = now - i * 3_600_000;
        out.push({ seq: seq++, ts, metric: 'initialLoad', value: 900 + Math.round(Math.sin(i) * 120) + i * 8 });
        out.push({ seq: seq++, ts, metric: 'firstContentfulPaint', value: 420 + Math.round(Math.cos(i) * 60) });
        out.push({ seq: seq++, ts, metric: 'socketToFirstState', value: 160 + (i % 3) * 30 });
    }
    return out;
}

function formatTick(ts: number, spanMs: number): string {
    const d = new Date(ts);
    if (spanMs >= 2 * 86_400_000) return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ── Widget ──────────────────────────────────────────────────────────────────

export function LoadTimesWidget({ config, editMode }: WidgetProps) {
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const showLegend = o.showLegend !== false;
    const chartType = (o.chartType as 'line' | 'area') ?? 'line';
    const timeWindow = (o.timeWindow as string) ?? '24h';
    const windowMs = WINDOWS[timeWindow] ?? WINDOWS['24h'];

    // Which metric series to render (default: all).
    const enabledMetrics = useMemo(() => {
        const raw = o.metrics as string[] | undefined;
        if (Array.isArray(raw) && raw.length > 0) return raw.filter((k) => METRIC_BY_KEY[k]);
        return METRICS.map((m) => m.key);
    }, [o.metrics]);
    const enabledKey = enabledMetrics.join(',');

    const { connected } = useIoBroker();
    const Icon = getWidgetIcon((o.icon as string) ?? 'Activity', Activity);

    const bufferRef = useRef<PerfSample[]>([]);
    const seenSeqRef = useRef(0);
    const [tick, setTick] = useState(0);
    const [backendOk, setBackendOk] = useState<boolean | null>(null);

    // Poll the aura backend for new samples (delta by seq). Metrics change slowly,
    // so a relaxed cadence is fine.
    useEffect(() => {
        if (!connected || editMode) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const pollOnce = async () => {
            if (cancelled) return;
            const result = await sendToDirect<{
                ok?: boolean;
                entries?: PerfSample[];
                latestSeq?: number;
            }>(NS, 'getLoadHistory', { sinceSeq: seenSeqRef.current }, 10000);
            if (cancelled) return;
            if (result && typeof result === 'object' && '__timeout' in (result as object)) {
                setBackendOk(false);
            } else if (result && typeof result === 'object' && 'entries' in result && Array.isArray(result.entries)) {
                setBackendOk(true);
                const entries = result.entries;
                if (entries.length > 0) {
                    const buf = bufferRef.current;
                    for (const e of entries) {
                        if (e.seq && e.seq <= seenSeqRef.current) continue;
                        buf.push(e);
                        if (e.seq > seenSeqRef.current) seenSeqRef.current = e.seq;
                    }
                    if (buf.length > 5000) buf.splice(0, buf.length - 5000);
                    setTick((t) => t + 1);
                }
                if (typeof result.latestSeq === 'number' && result.latestSeq > seenSeqRef.current) {
                    seenSeqRef.current = result.latestSeq;
                }
            }
            timer = setTimeout(pollOnce, 5000);
        };
        pollOnce();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [connected, editMode]);

    // Build the recharts series: merge samples per timestamp into one point each.
    const { points, spanMs } = useMemo(() => {
        const raw = editMode && bufferRef.current.length === 0 ? previewSamples() : bufferRef.current;
        const enabled = new Set(enabledMetrics);
        const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;
        const byTs = new Map<number, Record<string, number>>();
        for (const e of raw) {
            if (!enabled.has(e.metric)) continue;
            if (cutoff && e.ts < cutoff) continue;
            let p = byTs.get(e.ts);
            if (!p) {
                p = { ts: e.ts };
                byTs.set(e.ts, p);
            }
            p[e.metric] = e.value;
        }
        const arr = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
        const span = arr.length > 1 ? arr[arr.length - 1].ts - arr[0].ts : 0;
        return { points: arr, spanMs: span };
    }, [tick, enabledKey, windowMs, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const seriesMetrics = enabledMetrics.map((k) => METRIC_BY_KEY[k]).filter(Boolean);
    const hasData = points.length > 0;

    const tooltipStyle: React.CSSProperties = {
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 6,
        fontSize: 10,
        color: 'var(--text-primary)',
    };

    return (
        <div className="aura-widget-row w-full h-full flex flex-col gap-2 overflow-hidden">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <Icon
                            size={iconSize}
                            style={{ color: 'var(--accent)' }}
                            className="aura-widget-icon shrink-0"
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title || 'Ladezeiten'}
                        </p>
                    )}
                </div>
            )}

            {showLegend && (
                <div className="flex items-center gap-2 flex-wrap shrink-0 text-[10px]">
                    {seriesMetrics.map((m) => (
                        <span
                            key={m.key}
                            className="flex items-center gap-1"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <span style={{ width: 8, height: 8, borderRadius: 9, background: m.color }} />
                            {m.label}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex-1 min-h-0">
                {!hasData ? (
                    <div
                        className="flex items-center justify-center h-full text-[11px] text-center px-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {!connected
                            ? 'Nicht verbunden'
                            : backendOk === false
                              ? 'Aura-Adapter antwortet nicht — bitte Adapter neu starten/aktualisieren.'
                              : backendOk === null
                                ? 'Backend wird kontaktiert…'
                                : 'Noch keine Messwerte — Seite neu laden oder Tabs wechseln.'}
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'area' ? (
                            <AreaChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                                <defs>
                                    {seriesMetrics.map((m) => (
                                        <linearGradient key={m.key} id={`lt-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={m.color} stopOpacity={0.35} />
                                            <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" opacity={0.35} />
                                <XAxis
                                    dataKey="ts"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    scale="time"
                                    tickFormatter={(ts) => formatTick(ts as number, spanMs)}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                />
                                <YAxis
                                    width={34}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                    tickFormatter={(v) => `${v}`}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    labelStyle={{ color: 'var(--text-secondary)' }}
                                    labelFormatter={(label) => new Date(Number(label)).toLocaleString('de-DE')}
                                    formatter={(value, name) => [
                                        `${Math.round(Number(value))} ms`,
                                        METRIC_BY_KEY[String(name)]?.label ?? String(name),
                                    ]}
                                />
                                {seriesMetrics.map((m) => (
                                    <Area
                                        key={m.key}
                                        type="monotone"
                                        dataKey={m.key}
                                        stroke={m.color}
                                        fill={`url(#lt-${m.key})`}
                                        strokeWidth={1.5}
                                        dot={false}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                ))}
                            </AreaChart>
                        ) : (
                            <LineChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" opacity={0.35} />
                                <XAxis
                                    dataKey="ts"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    scale="time"
                                    tickFormatter={(ts) => formatTick(ts as number, spanMs)}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                />
                                <YAxis
                                    width={34}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                    tickFormatter={(v) => `${v}`}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    labelStyle={{ color: 'var(--text-secondary)' }}
                                    labelFormatter={(label) => new Date(Number(label)).toLocaleString('de-DE')}
                                    formatter={(value, name) => [
                                        `${Math.round(Number(value))} ms`,
                                        METRIC_BY_KEY[String(name)]?.label ?? String(name),
                                    ]}
                                />
                                {seriesMetrics.map((m) => (
                                    <Line
                                        key={m.key}
                                        type="monotone"
                                        dataKey={m.key}
                                        stroke={m.color}
                                        strokeWidth={1.5}
                                        dot={false}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                ))}
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
