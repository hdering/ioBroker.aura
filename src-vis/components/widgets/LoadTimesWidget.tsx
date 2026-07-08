import { useEffect, useMemo, useRef, useState } from 'react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid,
    ReferenceLine,
} from 'recharts';
import { Activity, Info, X, RefreshCw, RotateCcw } from 'lucide-react';
import { sendToDirect, useIoBroker } from '../../hooks/useIoBroker';
import { resetBreakdown } from '../../utils/perfBreakdown';
import { useConnectionStore } from '../../store/connectionStore';
import { NS } from '../../utils/namespace';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';

// ── Metric catalogue ──────────────────────────────────────────────────────────
//
// `good` / `ok` are reference thresholds in ms: value ≤ good → green, ≤ ok →
// amber, otherwise red. They give the raw numbers meaning ("is this fast?") and
// drive both the status badges and the in-chart reference lines. Ranges assume a
// vis instance on a local network; a weak client device shifts everything up.

interface MetricMeta {
    key: string;
    label: string;
    color: string;
    good: number;
    ok: number;
}

const METRICS: MetricMeta[] = [
    { key: 'initialLoad', label: 'Initial-Load', color: '#3b82f6', good: 1500, ok: 3000 },
    { key: 'firstContentfulPaint', label: 'First Paint', color: '#10b981', good: 1000, ok: 2500 },
    { key: 'socketToFirstState', label: 'Socket → 1. DP', color: '#f59e0b', good: 300, ok: 800 },
    { key: 'tabSwitch', label: 'Tab-Wechsel', color: '#a855f7', good: 150, ok: 400 },
    { key: 'longTaskMax', label: 'Long-Task max', color: '#ef4444', good: 50, ok: 150 },
];
const METRIC_BY_KEY: Record<string, MetricMeta> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

const STATUS_COLOR = { good: '#22c55e', ok: '#f59e0b', bad: '#ef4444' } as const;
function classify(value: number, m: MetricMeta): keyof typeof STATUS_COLOR {
    if (value <= m.good) return 'good';
    if (value <= m.ok) return 'ok';
    return 'bad';
}
function classifyMs(value: number, good: number, ok: number): keyof typeof STATUS_COLOR {
    if (value <= good) return 'good';
    if (value <= ok) return 'ok';
    return 'bad';
}

// ── Breakdown view (per-widget / per-command attribution) ──────────────────────

interface BreakdownEntry {
    cat: string;
    key: string;
    label: string;
    count: number;
    avg: number;
    max: number;
    last: number;
}
interface BreakdownClient {
    client: string;
    clientName: string;
    ts: number;
    entries: BreakdownEntry[];
}
// Reference thresholds (ms) per metric: value ≤ good → green, ≤ ok → amber, else red.
const TH_READY = { good: 300, ok: 1000 };
const TH_RENDER = { good: 16, ok: 50 };
const TH_BACKEND = { good: 300, ok: 1000 };

interface PerfSample {
    seq: number;
    ts: number;
    metric: string;
    value: number;
    client?: string;
    clientName?: string;
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
    const showThresholds = o.showThresholds !== false;
    const chartType = (o.chartType as 'line' | 'area') ?? 'line';

    // Which metric series to render (default: all).
    const enabledMetrics = useMemo(() => {
        const raw = o.metrics as string[] | undefined;
        if (Array.isArray(raw) && raw.length > 0) return raw.filter((k) => METRIC_BY_KEY[k]);
        return METRICS.map((m) => m.key);
    }, [o.metrics]);
    const enabledKey = enabledMetrics.join(',');

    const { connected } = useIoBroker();
    const myClientId = useConnectionStore((s) => s.clientId);
    const Icon = getWidgetIcon((o.icon as string) ?? 'Activity', Activity);

    // Client filter: default to *this* device so the numbers are directly
    // interpretable (these metrics are client-dependent). The config seeds the
    // default; the inline dropdown overrides it at runtime.
    const [clientSel, setClientSel] = useState<string>((o.clientFilter as string) ?? 'current');
    useEffect(() => setClientSel((o.clientFilter as string) ?? 'current'), [o.clientFilter]);

    // Time window: adjustable live from the header (config seeds the default).
    const [windowSel, setWindowSel] = useState<string>((o.timeWindow as string) ?? '24h');
    useEffect(() => setWindowSel((o.timeWindow as string) ?? '24h'), [o.timeWindow]);
    const windowMs = WINDOWS[windowSel] ?? WINDOWS['24h'];

    // View: history chart vs. per-widget / per-command breakdown.
    const [viewSel, setViewSel] = useState<'chart' | 'breakdown'>(
        (o.view as string) === 'breakdown' ? 'breakdown' : 'chart',
    );
    useEffect(() => setViewSel((o.view as string) === 'breakdown' ? 'breakdown' : 'chart'), [o.view]);
    const [breakdown, setBreakdown] = useState<BreakdownClient[]>([]);
    const [showInfo, setShowInfo] = useState(false);
    // Bumped by the refresh button to re-poll the backend immediately. This only
    // re-fetches the already-stored data — unlike F5 it does NOT create a new
    // page-load sample or reset this client's session counters.
    const [refreshNonce, setRefreshNonce] = useState(0);

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
    }, [connected, editMode, refreshNonce]);

    // Poll the per-widget / per-command breakdown while that view is open.
    useEffect(() => {
        if (!connected || editMode || viewSel !== 'breakdown') return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const poll = async () => {
            if (cancelled) return;
            const res = await sendToDirect<{ ok?: boolean; clients?: BreakdownClient[] }>(
                NS,
                'getPerfBreakdown',
                {},
                10000,
            );
            if (!cancelled && res && typeof res === 'object' && 'clients' in res && Array.isArray(res.clients)) {
                setBreakdown(res.clients);
            }
            timer = setTimeout(poll, 8000);
        };
        poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [connected, editMode, viewSel, refreshNonce]);

    // Distinct clients seen in either data source, for the filter dropdown.
    const clientOptions = useMemo(() => {
        const byId = new Map<string, string>();
        for (const e of bufferRef.current) {
            if (e.client) byId.set(e.client, e.clientName || e.client.slice(0, 8));
        }
        for (const c of breakdown) {
            if (c.client) byId.set(c.client, c.clientName || byId.get(c.client) || c.client.slice(0, 8));
        }
        return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [tick, breakdown]); // eslint-disable-line react-hooks/exhaustive-deps

    // Build the recharts series (merge samples per timestamp) plus the latest
    // value per metric for the status badges — both honouring the client filter.
    const { points, spanMs, latest } = useMemo(() => {
        const raw = editMode && bufferRef.current.length === 0 ? previewSamples() : bufferRef.current;
        const enabled = new Set(enabledMetrics);
        const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;
        const matchesClient = (e: PerfSample): boolean => {
            if (editMode || clientSel === 'all') return true;
            if (clientSel === 'current') return e.client === myClientId;
            return e.client === clientSel;
        };
        const byTs = new Map<number, Record<string, number>>();
        const latestByMetric: Record<string, { value: number; seq: number }> = {};
        for (const e of raw) {
            if (!enabled.has(e.metric)) continue;
            if (!matchesClient(e)) continue;
            if (cutoff && e.ts < cutoff) continue;
            let p = byTs.get(e.ts);
            if (!p) {
                p = { ts: e.ts };
                byTs.set(e.ts, p);
            }
            p[e.metric] = e.value;
            const cur = latestByMetric[e.metric];
            if (!cur || e.seq >= cur.seq) latestByMetric[e.metric] = { value: e.value, seq: e.seq };
        }
        const arr = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
        const span = arr.length > 1 ? arr[arr.length - 1].ts - arr[0].ts : 0;
        return { points: arr, spanMs: span, latest: latestByMetric };
    }, [tick, enabledKey, windowMs, editMode, clientSel, myClientId]); // eslint-disable-line react-hooks/exhaustive-deps

    const seriesMetrics = enabledMetrics.map((k) => METRIC_BY_KEY[k]).filter(Boolean);
    const hasData = points.length > 0;
    // Reference lines only make sense when a single metric owns the Y axis.
    const soloMetric = seriesMetrics.length === 1 ? seriesMetrics[0] : null;

    // Merge breakdown entries across the selected client(s). Widgets get one row
    // each with ready- and render-time side by side (so you can see which one is
    // high); backend commands are their own list. Values are count-weighted
    // averages (typical cost); `max` is kept as the worst-case spike.
    const { widgetRows, backendRows } = useMemo(() => {
        const sel = breakdown.filter((c) => {
            if (clientSel === 'all') return true;
            if (clientSel === 'current') return c.client === myClientId;
            return c.client === clientSel;
        });
        type Slot = { sum: number; count: number; max: number };
        const empty = (): Slot => ({ sum: 0, count: 0, max: 0 });
        const add = (s: Slot, avg: number, count: number, max: number) => {
            s.sum += avg * count;
            s.count += count;
            if (max > s.max) s.max = max;
        };
        const avgOf = (s: Slot) => (s.count ? Math.round(s.sum / s.count) : 0);
        const widgets = new Map<string, { label: string; ready: Slot; render: Slot }>();
        const backend = new Map<string, { label: string; slot: Slot }>();
        for (const c of sel) {
            for (const e of c.entries) {
                if (e.cat === 'backend') {
                    const cur = backend.get(e.key) ?? { label: e.label, slot: empty() };
                    cur.label = e.label;
                    add(cur.slot, e.avg, e.count, e.max);
                    backend.set(e.key, cur);
                } else if (e.cat === 'widgetReady' || e.cat === 'widgetRender') {
                    // Group by the stable label (type · title), not the raw widget id.
                    // Container widgets can churn through many short-lived child ids
                    // for the same logical widget — grouping by label collapses those
                    // into one row instead of dozens of duplicates.
                    const w = widgets.get(e.label) ?? { label: e.label, ready: empty(), render: empty() };
                    w.label = e.label;
                    add(e.cat === 'widgetReady' ? w.ready : w.render, e.avg, e.count, e.max);
                    widgets.set(e.label, w);
                }
            }
        }
        const wRows = Array.from(widgets.values())
            .map((w) => {
                const readyAvg = avgOf(w.ready);
                const renderAvg = avgOf(w.render);
                // Label is "type · title" (or just "type" when untitled) — split it
                // into separate type and name columns. type has no " · " so the
                // first token is always the type.
                const sepIdx = w.label.indexOf(' · ');
                const type = sepIdx >= 0 ? w.label.slice(0, sepIdx) : w.label;
                const name = sepIdx >= 0 ? w.label.slice(sepIdx + 3) : '—';
                return {
                    label: w.label,
                    name,
                    type,
                    readyAvg,
                    readyMax: w.ready.max,
                    renderAvg,
                    renderMax: w.render.max,
                    sum: readyAvg + renderAvg,
                };
            })
            .sort((a, b) => b.sum - a.sum)
            .slice(0, 12);
        const bRows = Array.from(backend.values())
            .map((b) => ({ label: b.label, count: b.slot.count, avg: avgOf(b.slot), max: b.slot.max }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8);
        return { widgetRows: wRows, backendRows: bRows };
    }, [breakdown, clientSel, myClientId]);
    const hasBreakdown = widgetRows.length > 0 || backendRows.length > 0;

    // Newest snapshot timestamp among the selected client(s) — shows data freshness.
    const breakdownUpdatedAt = useMemo(() => {
        let mx = 0;
        for (const c of breakdown) {
            const match =
                clientSel === 'all' ? true : clientSel === 'current' ? c.client === myClientId : c.client === clientSel;
            if (match && c.ts > mx) mx = c.ts;
        }
        return mx;
    }, [breakdown, clientSel, myClientId]);

    const tooltipStyle: React.CSSProperties = {
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 6,
        fontSize: 10,
        color: 'var(--text-primary)',
    };

    const selectStyle: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="aura-widget-row relative w-full h-full flex flex-col gap-2 overflow-hidden">
            {
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
                    {!showTitle && <span className="flex-1 min-w-0" />}
                    <button
                        onClick={() => setRefreshNonce((n) => n + 1)}
                        className="flex items-center rounded-md p-1 focus:outline-none shrink-0"
                        style={selectStyle}
                        title="Aktualisieren (lädt nur neu vom Backend — verfälscht die Messwerte nicht)"
                    >
                        <RefreshCw size={12} />
                    </button>
                    <button
                        onClick={() => setViewSel(viewSel === 'chart' ? 'breakdown' : 'chart')}
                        className="text-[10px] rounded-md px-1.5 py-0.5 focus:outline-none shrink-0"
                        style={selectStyle}
                        title="Ansicht wechseln (Verlauf / Details)"
                    >
                        {viewSel === 'chart' ? 'Verlauf' : 'Details'}
                    </button>
                    {viewSel === 'chart' && (
                        <select
                            value={windowSel}
                            onChange={(e) => setWindowSel(e.target.value)}
                            className="text-[10px] rounded-md px-1.5 py-0.5 focus:outline-none shrink-0"
                            style={selectStyle}
                            title="Zeitfenster"
                        >
                            <option value="1h">1 h</option>
                            <option value="6h">6 h</option>
                            <option value="24h">24 h</option>
                            <option value="7d">7 Tage</option>
                            <option value="all">Alles</option>
                        </select>
                    )}
                    {clientOptions.length > 0 && (
                        <select
                            value={clientSel}
                            onChange={(e) => setClientSel(e.target.value)}
                            className="text-[10px] rounded-md px-1.5 py-0.5 focus:outline-none shrink-0 max-w-[45%] truncate"
                            style={selectStyle}
                            title="Client-Filter"
                        >
                            <option value="current">Dieser Client</option>
                            <option value="all">Alle Clients</option>
                            {clientOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            }

            {viewSel === 'chart' && showLegend && (
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

            {viewSel === 'chart' && showThresholds && hasData && (
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {seriesMetrics.map((m) => {
                        const l = latest[m.key];
                        if (!l) return null;
                        const status = classify(l.value, m);
                        const c = STATUS_COLOR[status];
                        return (
                            <span
                                key={m.key}
                                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                                style={{ background: `${c}22`, color: 'var(--text-primary)' }}
                                title={`${m.label} — Zielwert ≤ ${m.good} ms · OK ≤ ${m.ok} ms`}
                            >
                                <span style={{ width: 7, height: 7, borderRadius: 9, background: c }} />
                                <span className="opacity-70">{m.label}</span>
                                <b>{Math.round(l.value)} ms</b>
                            </span>
                        );
                    })}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
                {viewSel === 'breakdown' ? (
                    !hasBreakdown ? (
                        <div
                            className="flex items-center justify-center h-full text-[11px] text-center px-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {!connected
                                ? 'Nicht verbunden'
                                : 'Noch keine Detail-Daten. Für Widget-Zeiten „Timing pro Widget“ in den Aura-Adapter-Einstellungen aktivieren und Seite neu laden.'}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 py-0.5">
                            <div className="flex items-center gap-2">
                                {breakdownUpdatedAt > 0 && (
                                    <span className="text-[10px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                        Stand: {new Date(breakdownUpdatedAt).toLocaleTimeString('de-DE')}
                                    </span>
                                )}
                                <span className="flex-1" />
                                <button
                                    onClick={() => {
                                        resetBreakdown();
                                        setBreakdown([]);
                                        setRefreshNonce((n) => n + 1);
                                    }}
                                    className="flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    title="Zähler zurücksetzen und neu messen (kein Seiten-Reload — verfälscht die Lade-Metriken nicht)"
                                >
                                    <RotateCcw size={11} />
                                    Zurücksetzen
                                </button>
                                <button
                                    onClick={() => setShowInfo(true)}
                                    className="flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    title="Was bedeuten die Spalten?"
                                >
                                    <Info size={11} />
                                    Spalten erklären
                                </button>
                            </div>

                            {widgetRows.length > 0 && (
                                <div>
                                    <div
                                        className="text-[9px] uppercase tracking-wide mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Widgets{' '}
                                        <span className="opacity-70">
                                            · Ziel: Bereit ≤ {TH_READY.good} ms · Render ≤ {TH_RENDER.good} ms
                                        </span>
                                    </div>
                                    <div
                                        className="flex items-center gap-1.5 text-[9px] mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <span className="flex-1 min-w-0">Name</span>
                                        <span style={{ minWidth: 96, textAlign: 'left' }}>Typ</span>
                                        <span style={{ minWidth: 56, textAlign: 'right' }}>Bereit</span>
                                        <span style={{ minWidth: 56, textAlign: 'right' }}>Render</span>
                                        <span style={{ minWidth: 56, textAlign: 'right' }}>Σ</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        {widgetRows.map((r) => {
                                            const cReady =
                                                STATUS_COLOR[classifyMs(r.readyAvg, TH_READY.good, TH_READY.ok)];
                                            const cRender =
                                                STATUS_COLOR[classifyMs(r.renderAvg, TH_RENDER.good, TH_RENDER.ok)];
                                            return (
                                                <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                                                    <span
                                                        className="flex-1 min-w-0 truncate"
                                                        style={{ color: 'var(--text-primary)' }}
                                                        title={r.name}
                                                    >
                                                        {r.name}
                                                    </span>
                                                    <span
                                                        className="truncate opacity-70"
                                                        style={{
                                                            color: 'var(--text-secondary)',
                                                            minWidth: 96,
                                                            maxWidth: 96,
                                                            textAlign: 'left',
                                                        }}
                                                        title={r.type}
                                                    >
                                                        {r.type}
                                                    </span>
                                                    <span
                                                        style={{ color: cReady, minWidth: 56, textAlign: 'right' }}
                                                        title={`Spitze ↑${r.readyMax} ms`}
                                                    >
                                                        {r.readyAvg ? `${r.readyAvg} ms` : '—'}
                                                    </span>
                                                    <span
                                                        style={{ color: cRender, minWidth: 56, textAlign: 'right' }}
                                                        title={`Spitze ↑${r.renderMax} ms`}
                                                    >
                                                        {r.renderAvg ? `${r.renderAvg} ms` : '—'}
                                                    </span>
                                                    <b
                                                        style={{
                                                            color: 'var(--text-primary)',
                                                            minWidth: 56,
                                                            textAlign: 'right',
                                                        }}
                                                    >
                                                        {r.sum} ms
                                                    </b>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {backendRows.length > 0 && (
                                <div>
                                    <div
                                        className="text-[9px] uppercase tracking-wide mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Backend-Befehle{' '}
                                        <span className="opacity-70">· Ziel ≤ {TH_BACKEND.good} ms</span>
                                    </div>
                                    <div
                                        className="flex items-center gap-1.5 text-[9px] mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <span className="flex-1 min-w-0">Befehl</span>
                                        <span style={{ minWidth: 44, textAlign: 'right' }}>Anzahl</span>
                                        <span style={{ minWidth: 52, textAlign: 'right' }}>Ø</span>
                                        <span style={{ minWidth: 56, textAlign: 'right' }}>↑ Spitze</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        {backendRows.map((r) => {
                                            const c = STATUS_COLOR[classifyMs(r.avg, TH_BACKEND.good, TH_BACKEND.ok)];
                                            return (
                                                <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                                                    <span
                                                        className="flex-1 min-w-0 truncate"
                                                        style={{ color: 'var(--text-primary)' }}
                                                        title={r.label}
                                                    >
                                                        {r.label}
                                                    </span>
                                                    <span
                                                        className="opacity-50 text-[10px]"
                                                        style={{
                                                            color: 'var(--text-secondary)',
                                                            minWidth: 44,
                                                            textAlign: 'right',
                                                        }}
                                                    >
                                                        ×{r.count}
                                                    </span>
                                                    <b style={{ color: c, minWidth: 52, textAlign: 'right' }}>
                                                        {r.avg} ms
                                                    </b>
                                                    <span
                                                        className="text-[10px] opacity-60"
                                                        style={{
                                                            color: 'var(--text-secondary)',
                                                            minWidth: 56,
                                                            textAlign: 'right',
                                                        }}
                                                        title="längste Messung (Spitze)"
                                                    >
                                                        ↑{r.max} ms
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : !hasData ? (
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
                                : clientSel !== 'all' && clientSel !== 'current'
                                  ? 'Keine Messwerte für diesen Client.'
                                  : clientSel === 'current'
                                    ? 'Noch keine Messwerte für dieses Gerät — Seite neu laden oder Tabs wechseln. („Alle Clients“ zeigt andere Geräte.)'
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
                                    width={40}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                    tickFormatter={(v) => `${v}`}
                                    label={{
                                        value: 'ms',
                                        angle: -90,
                                        position: 'insideLeft',
                                        style: {
                                            fontSize: 9,
                                            fill: 'var(--text-secondary)',
                                            textAnchor: 'middle',
                                        },
                                    }}
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
                                {showThresholds && soloMetric && (
                                    <>
                                        <ReferenceLine
                                            y={soloMetric.good}
                                            stroke={STATUS_COLOR.good}
                                            strokeDasharray="4 4"
                                            strokeOpacity={0.7}
                                        />
                                        <ReferenceLine
                                            y={soloMetric.ok}
                                            stroke={STATUS_COLOR.ok}
                                            strokeDasharray="4 4"
                                            strokeOpacity={0.7}
                                        />
                                    </>
                                )}
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
                                    width={40}
                                    tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                    stroke="var(--app-border)"
                                    tickFormatter={(v) => `${v}`}
                                    label={{
                                        value: 'ms',
                                        angle: -90,
                                        position: 'insideLeft',
                                        style: {
                                            fontSize: 9,
                                            fill: 'var(--text-secondary)',
                                            textAnchor: 'middle',
                                        },
                                    }}
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
                                {showThresholds && soloMetric && (
                                    <>
                                        <ReferenceLine
                                            y={soloMetric.good}
                                            stroke={STATUS_COLOR.good}
                                            strokeDasharray="4 4"
                                            strokeOpacity={0.7}
                                        />
                                        <ReferenceLine
                                            y={soloMetric.ok}
                                            stroke={STATUS_COLOR.ok}
                                            strokeDasharray="4 4"
                                            strokeOpacity={0.7}
                                        />
                                    </>
                                )}
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

            {showInfo && (
                <div
                    className="absolute inset-0 z-30 flex items-center justify-center p-3"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                    onClick={() => setShowInfo(false)}
                >
                    <div
                        className="rounded-lg p-3 text-[11px] leading-relaxed max-w-full max-h-full overflow-auto"
                        style={{
                            background: 'var(--app-surface)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--text-primary)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <b>So liest du die Details</b>
                            <button
                                onClick={() => setShowInfo(false)}
                                className="shrink-0 rounded p-0.5 focus:outline-none"
                                style={{ color: 'var(--text-secondary)' }}
                                title="Schließen"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <ul className="flex flex-col gap-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            <li>
                                <b>Bereit</b> — Zeit von Mount bis die Daten sichtbar sind (inklusive Warten auf
                                Backend-Daten). Zielwert ≤ {TH_READY.good} ms. Hoch = das Widget wartet lange auf seine
                                Daten.
                            </li>
                            <li>
                                <b>Render</b> — reine Zeichenzeit im Browser (CPU). Zielwert ≤ {TH_RENDER.good} ms (ein
                                60-fps-Frame). Hoch = das Widget ist teuer zu zeichnen.
                            </li>
                            <li>
                                <b>Σ</b> — Bereit + Render zusammen. Danach wird sortiert (größtes zuerst).
                            </li>
                            <li>
                                Jede Zelle ist einzeln eingefärbt:{' '}
                                <span style={{ color: STATUS_COLOR.good }}>grün</span> gut,{' '}
                                <span style={{ color: STATUS_COLOR.ok }}>gelb</span> ok,{' '}
                                <span style={{ color: STATUS_COLOR.bad }}>rot</span> langsam.{' '}
                                <b>Niedriger ist besser.</b>
                            </li>
                            <li className="opacity-80">
                                <b>Backend-Befehle</b>: <b>Anzahl</b> = Aufrufe, <b>Ø</b> = typische (durchschnittliche)
                                Zeit, <b>↑ Spitze</b> = längste Einzelmessung.
                            </li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
