/**
 * useEnergyBalanceValues — resolves ONE aggregated number per energy-balance entry
 * over a shared time window, using a history adapter (history/influxdb/sql).
 *
 * It mirrors the history plumbing of the "Diagramm (erweitert)" widget
 * (`useMultiSeriesData` / `useChartHistory`): per entry it resolves a history
 * instance (explicit or auto-detected from `common.custom`), fetches the range via
 * `getHistoryDirect`, then reduces the returned points to a single value per the
 * entry's `aggregate` mode. The `last` mode short-circuits to the datapoint's current
 * state (the true last value) instead of a history query — a step-aggregated query
 * returns bucket averages, which can be non-zero even when the last logged value is 0.
 * Entries without a history adapter fall back to the live state value. A periodic tick
 * keeps the window from freezing, and live updates refresh the value immediately.
 */
import { useState, useEffect, useRef } from 'react';
import { getHistoryDirect, getObjectDirect, getStateDirect, getStateFromCache, type HistoryEntry } from './useIoBroker';
import { detectHistoryAdapters } from './useChartHistory';
import type { EChartTimeRange } from './useMultiSeriesData';
import type { ioBrokerState } from '../types';

export type EnergyAggregate = 'last' | 'delta' | 'sum' | 'average' | 'max' | 'min';

export interface EnergyEntry {
    id: string;
    datapointId: string;
    label?: string;
    icon?: string;
    color?: string;
    unit?: string;
    decimals?: number;
    historyInstance?: string;
    aggregate?: EnergyAggregate;
}

export interface EnergyValueResult {
    value: number | null;
    loading: boolean;
}

const RANGE_MS: Record<Exclude<EChartTimeRange, 'custom'>, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
};

function getRangeMs(range: EChartTimeRange, customVal?: number, customUnit?: 'h' | 'd'): number {
    if (range === 'custom') {
        const val = customVal ?? 24;
        return Math.max(1, val) * (customUnit === 'd' ? 86_400_000 : 3_600_000);
    }
    return RANGE_MS[range];
}

/** Aggregation interval based on the window in ms (undefined = raw data). */
function getStepForMs(rangeMs: number): number | undefined {
    if (rangeMs <= 3 * 3_600_000) return undefined;
    if (rangeMs <= 12 * 3_600_000) return 300_000;
    if (rangeMs <= 48 * 3_600_000) return 900_000;
    if (rangeMs <= 14 * 86_400_000) return 3_600_000;
    return 21_600_000;
}

/** Reduce a sorted [ts,val][] series to a single number per the aggregate mode. */
function reduce(data: [number, number][], mode: EnergyAggregate): number | null {
    if (data.length === 0) return null;
    const vals = data.map((d) => d[1]);
    switch (mode) {
        case 'delta':
            return vals[vals.length - 1] - vals[0];
        case 'sum':
            return vals.reduce((a, b) => a + b, 0);
        case 'average':
            return vals.reduce((a, b) => a + b, 0) / vals.length;
        case 'max':
            return Math.max(...vals);
        case 'min':
            return Math.min(...vals);
        case 'last':
        default:
            return vals[vals.length - 1];
    }
}

export function useEnergyBalanceValues(
    entries: EnergyEntry[],
    range: EChartTimeRange,
    connected: boolean,
    subscribe: (id: string, cb: (state: ioBrokerState) => void) => () => void,
    customVal?: number,
    customUnit?: 'h' | 'd',
): Map<string, EnergyValueResult> {
    const [results, setResults] = useState<Map<string, EnergyValueResult>>(new Map());
    // Runtime-resolved history instance per entry (for entries without an explicit one).
    const [resolvedInstances, setResolvedInstances] = useState<Record<string, string | null>>({});
    const [refreshTick, setRefreshTick] = useState(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const depKey = JSON.stringify(entries.map((e) => [e.id, e.datapointId, e.historyInstance, e.aggregate ?? 'last']));
    const rangeMs = getRangeMs(range, customVal, customUnit);

    // ── Auto-detect a history adapter for entries without an explicit instance ──
    useEffect(() => {
        if (!connected) return;
        entries.forEach((e) => {
            if (!e.datapointId || e.datapointId.includes('{{')) return;
            if (e.historyInstance) return; // explicit config wins
            if (resolvedInstances[e.id] !== undefined) return; // already tried
            getObjectDirect(e.datapointId)
                .then((obj) => {
                    if (!mountedRef.current) return;
                    const custom = obj?.common?.custom;
                    const adapters = custom
                        ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>)
                        : [];
                    setResolvedInstances((prev) => ({ ...prev, [e.id]: adapters[0]?.instance ?? null }));
                })
                .catch(() => {
                    if (mountedRef.current) setResolvedInstances((prev) => ({ ...prev, [e.id]: null }));
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, connected]);

    const instanceKey = JSON.stringify(resolvedInstances);

    // ── Periodic refresh so the trailing window keeps moving ────────────────────
    useEffect(() => {
        if (!connected || entries.length === 0) return;
        const interval = rangeMs <= 3_600_000 ? 60_000 : rangeMs <= 86_400_000 ? 300_000 : 900_000;
        const id = globalThis.setInterval(() => setRefreshTick((t) => t + 1), interval);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, connected, rangeMs]);

    // ── Fetch + reduce one value per entry ──────────────────────────────────────
    useEffect(() => {
        if (!connected || entries.length === 0) return;

        setResults((prev) => {
            const next = new Map(prev);
            for (const e of entries) {
                const existing = next.get(e.id);
                next.set(e.id, { value: existing?.value ?? null, loading: true });
            }
            return next;
        });

        entries.forEach((e) => {
            if (!e.datapointId || e.datapointId.includes('{{')) {
                setResults((prev) => new Map(prev).set(e.id, { value: null, loading: false }));
                return;
            }
            const mode = e.aggregate ?? 'last';
            const instance = e.historyInstance ?? resolvedInstances[e.id] ?? undefined;

            // 'last' means the datapoint's current value. Read it live rather than from
            // history: a step-aggregated history query returns bucket *averages*, so the
            // last returned point can be a non-zero mean even when the true last logged
            // value is 0 (see #404). The current state is always the real last value.
            if (mode === 'last') {
                getStateDirect(e.datapointId).then((state) => {
                    if (!mountedRef.current) return;
                    const val = typeof state?.val === 'number' ? (state.val as number) : null;
                    setResults((prev) => new Map(prev).set(e.id, { value: val, loading: false }));
                });
                return;
            }

            if (!instance) {
                // No history adapter — a ranged aggregate can't be computed, so fall back to
                // the datapoint's current value (≈ 'last'). Fetch it live via getStateDirect
                // rather than the synchronous cache, which is empty on first mount before any
                // subscription has fired — otherwise pie/donut/bars render empty until the DP
                // next changes. Seed instantly from the cache if present to avoid a flash.
                const cached = getStateFromCache(e.datapointId);
                if (typeof cached?.val === 'number') {
                    setResults((prev) => new Map(prev).set(e.id, { value: cached.val as number, loading: false }));
                }
                getStateDirect(e.datapointId).then((state) => {
                    if (!mountedRef.current) return;
                    const val = typeof state?.val === 'number' ? (state.val as number) : null;
                    setResults((prev) => new Map(prev).set(e.id, { value: val, loading: false }));
                });
                return;
            }

            const end = Date.now();
            const start = end - rangeMs;
            const step = getStepForMs(rangeMs);
            getHistoryDirect(e.datapointId, {
                instance,
                start,
                end,
                step,
                aggregate: step ? 'average' : 'none',
                count: 1000,
            })
                .then((raw: HistoryEntry[]) => {
                    if (!mountedRef.current) return;
                    const data: [number, number][] = raw
                        .filter(
                            (d): d is { ts: number; val: number; ack?: boolean; q?: number } =>
                                typeof d.val === 'number',
                        )
                        .map((d): [number, number] => [d.ts, d.val as number])
                        .sort((a, b) => a[0] - b[0]);
                    setResults((prev) => new Map(prev).set(e.id, { value: reduce(data, mode), loading: false }));
                })
                .catch(() => {
                    if (!mountedRef.current) return;
                    setResults((prev) => {
                        const next = new Map(prev);
                        const existing = next.get(e.id);
                        next.set(e.id, { value: existing?.value ?? null, loading: false });
                        return next;
                    });
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, instanceKey, connected, rangeMs, refreshTick]);

    // ── Live updates: for 'last' reflect the new value instantly; other modes wait for
    //    the next refresh tick (a single point can't re-derive a range aggregate). ──
    useEffect(() => {
        if (!connected || entries.length === 0) return;
        const unsubs = entries
            .filter((e) => !!e.datapointId && !e.datapointId.includes('{{'))
            .map((e) => {
                const mode = e.aggregate ?? 'last';
                const instance = e.historyInstance ?? resolvedInstances[e.id] ?? undefined;
                return subscribe(e.datapointId, (state: ioBrokerState) => {
                    if (typeof state.val !== 'number') return;
                    if (instance && mode !== 'last') return; // ranged aggregate → refresh handles it
                    setResults((prev) => new Map(prev).set(e.id, { value: state.val as number, loading: false }));
                });
            });
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, instanceKey, connected, subscribe]);

    return results;
}
