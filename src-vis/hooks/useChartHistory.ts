import { useState, useEffect, useRef } from 'react';
import { getObjectDirect, getHistoryDirect, getStateDirect, type HistoryEntry } from './useIoBroker';
import type { ioBrokerState } from '../types';

// `1y` and `total` are offered by the advanced chart widget only (issue #536); the simple chart's
// own preset list leaves them out, but range maths and labels stay shared.
export type ChartTimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | '1y' | 'total' | 'custom';

export const RANGE_LABELS: Record<ChartTimeRange, string> = {
    '1h': '1 Std',
    '6h': '6 Std',
    '24h': '24 Std',
    '7d': '7 Tage',
    '30d': '30 Tage',
    '1y': '1 Jahr',
    total: 'Gesamt',
    custom: 'Eigen',
};

/**
 * Upper bound for a `total` ("since recording started") window.
 *
 * `total` has no configured span — the real start is probed from the history adapter. This is only
 * the floor that probe searches within and falls back to when an adapter reports nothing at all,
 * and what live-window trimming compares against (i.e. it never trims). Deliberately older than
 * ioBroker itself, so it cannot clip real records.
 */
export const TOTAL_FLOOR_MS = 20 * 365 * 86_400_000;

const RANGE_MS: Record<Exclude<ChartTimeRange, 'custom'>, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
    '1y': 31_536_000_000,
    total: TOTAL_FLOOR_MS,
};

/** Aggregations-Intervall basierend auf Zeitraum in ms (undefined = Rohdaten) */
function getStep(rangeMs: number): number | undefined {
    if (rangeMs <= 3 * 3_600_000) return undefined; // ≤3 h  → raw
    if (rangeMs <= 12 * 3_600_000) return 300_000; // ≤12 h → 5 min
    if (rangeMs <= 48 * 3_600_000) return 900_000; // ≤48 h → 15 min
    if (rangeMs <= 14 * 86_400_000) return 3_600_000; // ≤14 d → 1 h
    if (rangeMs <= 60 * 86_400_000) return 21_600_000; // ≤60 d → 6 h
    // Beyond that scale the step so the row count stays under the query's `count` cap: whole days,
    // never finer than daily, aiming for ≈900 rows however long the window is.
    return Math.max(86_400_000, Math.ceil(rangeMs / 900 / 86_400_000) * 86_400_000);
}

export interface DetectedAdapter {
    instance: string; // z.B. 'history.0', 'influxdb.0'
    label: string;
}

export interface ChartDataPoint {
    t: number;
    v: number;
}

/** Prüft common.custom auf aktivierte History-Adapter */
export function detectHistoryAdapters(custom: Record<string, { enabled?: boolean }>): DetectedAdapter[] {
    const result: DetectedAdapter[] = [];
    for (const [key, val] of Object.entries(custom)) {
        if (!val?.enabled) continue;
        if (key.startsWith('history.')) result.push({ instance: key, label: `History  (${key})` });
        else if (key.startsWith('influxdb.')) result.push({ instance: key, label: `InfluxDB (${key})` });
        else if (key.startsWith('sql.')) result.push({ instance: key, label: `SQL      (${key})` });
    }
    return result;
}

export function useChartHistory(
    datapointId: string | undefined,
    historyInstance: string | undefined, // aus config.options.historyInstance
    timeRange: ChartTimeRange, // aus config.options.historyRange
    connected: boolean,
    subscribe: (id: string, cb: (state: ioBrokerState) => void) => () => void,
    customRangeMs?: number, // nur wenn timeRange === 'custom'
) {
    const [adapters, setAdapters] = useState<DetectedAdapter[]>([]);
    const [history, setHistory] = useState<ChartDataPoint[]>([]);
    const [current, setCurrent] = useState<number | null>(null);
    // Start in loading state when a DP is set so the spinner shows on first paint instead of
    // the "Warte auf Daten" placeholder during the initial socket round-trip(s).
    const [loading, setLoading] = useState<boolean>(!!datapointId);
    const [refreshTick, setRefreshTick] = useState(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // If no instance is explicitly configured, fall back to the first detected adapter
    const effectiveInstance = historyInstance ?? adapters[0]?.instance;

    // ── Periodischer Refresh damit das Zeitfenster nicht einfriert ───────────
    useEffect(() => {
        if (!datapointId || !effectiveInstance || !connected) return;
        const rangeMs =
            timeRange === 'custom'
                ? (customRangeMs ?? 86_400_000)
                : RANGE_MS[timeRange as Exclude<ChartTimeRange, 'custom'>];
        const interval = rangeMs <= 3_600_000 ? 60_000 : rangeMs <= 86_400_000 ? 300_000 : 900_000;
        const id = globalThis.setInterval(() => setRefreshTick((t) => t + 1), interval);
        return () => clearInterval(id);
    }, [datapointId, effectiveInstance, connected, timeRange, customRangeMs]);

    // ── 1. Verfügbare Adapter aus Objekt-Metadaten ermitteln ──────────────────
    useEffect(() => {
        if (!datapointId) {
            setAdapters([]);
            return;
        }
        getObjectDirect(datapointId).then((obj) => {
            if (!mountedRef.current) return;
            const custom = obj?.common?.custom;
            setAdapters(custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : []);
        });
    }, [datapointId]);

    // ── 2. Echten aktuellen Wert direkt vom Datenpunkt laden ─────────────────
    useEffect(() => {
        if (!datapointId || !connected) return;
        getStateDirect(datapointId).then((state) => {
            if (!mountedRef.current) return;
            if (typeof state?.val === 'number') setCurrent(state.val);
        });
    }, [datapointId, connected]);

    // ── 3. Verlaufsdaten laden ────────────────────────────────────────────────
    // Fires immediately when datapointId, effectiveInstance and connection are known.
    // The numeric-check getObject was previously chained here, adding a sequential
    // round-trip before getHistory. Non-numeric values are filtered out below regardless
    // of the requested aggregate, so we skip that pre-flight fetch.
    useEffect(() => {
        if (!datapointId || !effectiveInstance || !connected) return;
        setLoading(true);
        const rangeMs = timeRange === 'custom' ? (customRangeMs ?? 86_400_000) : RANGE_MS[timeRange];
        const end = Date.now();
        const start = end - rangeMs;
        const step = getStep(rangeMs);
        getHistoryDirect(datapointId, {
            instance: effectiveInstance,
            start,
            end,
            step,
            aggregate: step ? 'average' : 'none',
            count: 500,
        })
            .then((data: HistoryEntry[]) => {
                if (!mountedRef.current) return;
                const points: ChartDataPoint[] = data
                    .filter(
                        (d): d is { ts: number; val: number; ack?: boolean; q?: number } => typeof d.val === 'number',
                    )
                    .map((d) => ({ t: d.ts, v: d.val as number }))
                    .sort((a, b) => a.t - b.t);
                setHistory(points);
                setLoading(false);
            })
            .catch(() => {
                if (mountedRef.current) setLoading(false);
            });
    }, [datapointId, effectiveInstance, timeRange, customRangeMs, connected, refreshTick]);

    // ── 4. Live-Updates abonnieren ────────────────────────────────────────────
    useEffect(() => {
        if (!datapointId || !connected) return;
        const cutoffMs = timeRange === 'custom' ? (customRangeMs ?? 86_400_000) : RANGE_MS[timeRange];
        const unsub = subscribe(datapointId, (state: ioBrokerState) => {
            if (typeof state.val !== 'number') return;
            const val = state.val as number;
            setCurrent(val);
            if (effectiveInstance) {
                setHistory((prev) => {
                    const cutoff = Date.now() - cutoffMs;
                    const trimmed = prev.filter((p) => p.t >= cutoff);
                    if (trimmed.length > 0 && trimmed[trimmed.length - 1].t === state.ts) return trimmed;
                    return [...trimmed, { t: state.ts, v: val }];
                });
            } else {
                // Kein Adapter konfiguriert → Live-Ringpuffer
                setHistory((prev) => [...prev, { t: state.ts, v: val }].slice(-120));
            }
        });
        return unsub;
    }, [datapointId, connected, subscribe, effectiveInstance, timeRange, customRangeMs]);

    return { adapters, history, current, loading };
}
