import { useState, useEffect, useRef } from 'react';
import { getHistoryDirect, getStateFromCache, getObjectDirect, type HistoryEntry } from './useIoBroker';
import { detectHistoryAdapters, type DetectedAdapter } from './useChartHistory';
import type { ioBrokerState } from '../types';

export type EChartTimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

export interface EChartSeriesConfig {
    id: string;
    name: string;
    datapointId: string;
    chartType: 'line' | 'bar' | 'area' | 'scatter';
    color?: string;
    historyInstance?: string;
    historyRange?: EChartTimeRange;
    historyRangeCustomValue?: number;
    historyRangeCustomUnit?: 'h' | 'd';
    smooth?: boolean;
    yAxisIndex?: 0 | 1;
    lineWidth?: number;
    /** Absolute window override (ms epoch) — set by the widget's day navigation; wins over historyRange. */
    historyStart?: number;
    historyEnd?: number;
    /**
     * getHistory aggregation for stepped fetches (default `average`). `minmax` keeps the real
     * extreme points with their true timestamps — right for sparsely change-logged datapoints
     * (e.g. daily rain counters), where bucket averages smear resets and dropped empty buckets
     * let the chart interpolate across days. `none` disables bucketing entirely and returns the
     * raw logged points — no server-side averaging that could smear a value across a gap.
     */
    aggregate?: 'average' | 'minmax' | 'max' | 'min' | 'total' | 'none';
    /**
     * Where the series gets its points from. `history` (default) queries a history adapter;
     * `json` reads a JSON array straight out of the datapoint's value — for datapoints that
     * already hold pre-aggregated label/value pairs (issue #509).
     */
    source?: 'history' | 'json';
    /** Dotted path into the parsed JSON value down to the array, e.g. `data.hours`. Empty = root. */
    jsonPath?: string;
    /** Object key holding the x category (default `label`). */
    jsonLabelKey?: string;
    /** Object key holding the y value (default `value`). */
    jsonValueKey?: string;
}

/** One label/value pair of a JSON-sourced series. */
export interface JsonPoint {
    label: string;
    value: number;
}

export interface SeriesDataResult {
    data: [number, number][];
    current: number | null;
    loading: boolean;
    /** Categorical points — only filled for `source: 'json'` series. */
    points?: JsonPoint[];
}

const RANGE_MS: Record<Exclude<EChartTimeRange, 'custom'>, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
};

const RANGE_STEP: Record<Exclude<EChartTimeRange, 'custom'>, number | undefined> = {
    '1h': undefined,
    '6h': 300_000,
    '24h': 900_000,
    '7d': 3_600_000,
    '30d': 21_600_000,
};

/** Millisecond span of a range selection — also used by the widget to frame flat "no change" windows. */
export function rangeToMs(range: EChartTimeRange, customValue?: number, customUnit?: 'h' | 'd'): number {
    if (range === 'custom') {
        return Math.max(1, customValue ?? 24) * ((customUnit ?? 'h') === 'd' ? 86_400_000 : 3_600_000);
    }
    return RANGE_MS[range];
}

function getRangeMs(s: EChartSeriesConfig): number {
    return rangeToMs(s.historyRange ?? '24h', s.historyRangeCustomValue, s.historyRangeCustomUnit);
}

function getStepForMs(rangeMs: number): number | undefined {
    if (rangeMs <= 3 * 3_600_000) return undefined;
    if (rangeMs <= 12 * 3_600_000) return 300_000;
    if (rangeMs <= 48 * 3_600_000) return 900_000;
    if (rangeMs <= 14 * 86_400_000) return 3_600_000;
    return 21_600_000;
}

/**
 * Turn a JSON datapoint's raw value into label/value points.
 *
 * Accepts the value as an already-parsed object/array or as a JSON string (the usual case for
 * ioBroker string datapoints). Entries whose value doesn't parse to a finite number are dropped;
 * the array order is kept as-is and becomes the category order on the x axis.
 */
export function parseJsonSeries(raw: unknown, s: EChartSeriesConfig): JsonPoint[] {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    const path = (s.jsonPath ?? '').trim();
    if (path) {
        parsed = path.split('.').reduce<unknown>((acc, key) => {
            if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
            return undefined;
        }, parsed);
    }
    if (!Array.isArray(parsed)) return [];

    const labelKey = s.jsonLabelKey || 'label';
    const valueKey = s.jsonValueKey || 'value';
    const points: JsonPoint[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const value = Number(rec[valueKey]);
        if (!Number.isFinite(value)) continue;
        points.push({ label: String(rec[labelKey] ?? ''), value });
    }
    return points;
}

/**
 * Read a JSON label as a point in time — for datapoints that key their entries by timestamp
 * (`{"ts": "1785362400000", "val": 0}`) rather than by a display label.
 *
 * Accepts epoch milliseconds, epoch seconds (anything below the year-2001 millisecond mark is
 * treated as seconds) and any string `Date.parse` understands, e.g. ISO 8601. Returns null when
 * the label is not a timestamp, so the caller can fall back to the category axis.
 */
export function parseTimeLabel(label: string): number | null {
    const trimmed = label.trim();
    if (!trimmed) return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        const n = Number(trimmed);
        // Below 1e8 (≈ March 1973 in seconds) nothing is a plausible epoch — a bare "2024"
        // is a year label, and silently plotting it in 1970 would be worse than dropping it.
        if (!Number.isFinite(n) || n < 1e8) return null;
        // 1e11 ms = 1973, 1e11 s = year 5138 — no realistic dataset sits on the wrong side.
        return n < 1e11 ? n * 1000 : n;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
}

export interface SeriesInstanceResolution {
    /** Effective history instance to use — the sole detected adapter, or the picked one. */
    instance?: string;
    /** All detected adapters for this series' datapoint — drives the selection field. */
    adapters: DetectedAdapter[];
}

/**
 * Resolve a history-adapter instance per series at runtime for series that carry no
 * configured instance — used when a popup chart is opened from a value-display widget
 * that has no history instance to inherit (so `enabled` is the popup auto-flag).
 *
 *   • exactly one detected adapter  → auto-selected
 *   • several detected adapters      → first one as default, switchable via the returned picker
 *
 * Series with an explicit `historyInstance` are left untouched (no entry in `resolved`).
 */
export function useAutoHistoryInstances(
    series: EChartSeriesConfig[],
    enabled: boolean,
): {
    resolved: Record<string, SeriesInstanceResolution>;
    setPicked: (seriesId: string, instance: string) => void;
} {
    const [adaptersById, setAdaptersById] = useState<Record<string, DetectedAdapter[]>>({});
    const [pickedById, setPickedById] = useState<Record<string, string>>({});
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Series needing detection: enabled, no configured instance, and a resolvable (non-template) DP.
    const targets = enabled
        ? series.filter((s) => !s.historyInstance && s.datapointId && !s.datapointId.includes('{{'))
        : [];
    const depKey = targets.map((s) => `${s.id}:${s.datapointId}`).join(',');

    useEffect(() => {
        if (!enabled) {
            setAdaptersById({});
            return;
        }
        targets.forEach((s) => {
            getObjectDirect(s.datapointId)
                .then((obj) => {
                    if (!mountedRef.current) return;
                    const custom = obj?.common?.custom;
                    const adapters = custom
                        ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>)
                        : [];
                    setAdaptersById((prev) => ({ ...prev, [s.id]: adapters }));
                })
                .catch(() => {});
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, enabled]);

    const resolved: Record<string, SeriesInstanceResolution> = {};
    for (const s of series) {
        if (s.historyInstance) continue; // explicit config wins — nothing to resolve
        const adapters = adaptersById[s.id] ?? [];
        let instance: string | undefined;
        if (adapters.length === 1) instance = adapters[0].instance;
        else if (adapters.length > 1) instance = pickedById[s.id] ?? adapters[0].instance;
        resolved[s.id] = { instance, adapters };
    }

    const setPicked = (seriesId: string, instance: string) =>
        setPickedById((prev) => ({ ...prev, [seriesId]: instance }));

    return { resolved, setPicked };
}

export function useMultiSeriesData(
    series: EChartSeriesConfig[],
    connected: boolean,
    subscribe: (id: string, cb: (state: ioBrokerState) => void) => () => void,
    getState?: (id: string) => Promise<ioBrokerState | null>,
): Map<string, SeriesDataResult> {
    const [resultsMap, setResultsMap] = useState<Map<string, SeriesDataResult>>(new Map());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const depKey = JSON.stringify(
        series.map((s) => [
            s.id,
            s.datapointId,
            s.historyInstance,
            s.historyRange,
            s.historyRange === 'custom' ? s.historyRangeCustomValue : undefined,
            s.historyRange === 'custom' ? s.historyRangeCustomUnit : undefined,
            s.historyStart,
            s.historyEnd,
            s.aggregate,
            s.source,
            s.jsonPath,
            s.jsonLabelKey,
            s.jsonValueKey,
        ]),
    );

    // Last raw value seen per JSON series — lets the live subscription bail out of a re-render
    // when an adapter re-writes the identical payload (same flicker guard as numeric series).
    const lastRawRef = useRef<Map<string, string>>(new Map());

    // Fetch history for all series
    useEffect(() => {
        if (!connected || series.length === 0) return;

        // Mark all as loading
        setResultsMap((prev) => {
            const next = new Map(prev);
            for (const s of series) {
                const existing = next.get(s.id);
                next.set(s.id, { data: existing?.data ?? [], current: existing?.current ?? null, loading: true });
            }
            return next;
        });

        series.forEach((s) => {
            if (!s.datapointId) {
                setResultsMap((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(s.id);
                    next.set(s.id, { data: existing?.data ?? [], current: existing?.current ?? null, loading: false });
                    return next;
                });
                return;
            }

            if (s.source === 'json') {
                // JSON series: the datapoint value IS the whole dataset — no history query.
                const applyJson = (state: ioBrokerState | null) => {
                    if (!mountedRef.current) return;
                    const points = parseJsonSeries(state?.val, s);
                    lastRawRef.current.set(
                        s.id,
                        typeof state?.val === 'string' ? state.val : JSON.stringify(state?.val),
                    );
                    setResultsMap((prev) => {
                        const next = new Map(prev);
                        next.set(s.id, {
                            data: [],
                            points,
                            current: points.length > 0 ? points[points.length - 1].value : null,
                            loading: false,
                        });
                        return next;
                    });
                };
                const cachedJson = getStateFromCache(s.datapointId);
                if (cachedJson) applyJson(cachedJson);
                else if (getState)
                    getState(s.datapointId)
                        .then(applyJson)
                        .catch(() => applyJson(null));
                else applyJson(null);
                return;
            }

            if (!s.historyInstance) {
                // No history adapter configured — seed current value from live state so
                // comparison-mode bars (and timeseries first point) render immediately.
                const cached = getStateFromCache(s.datapointId);
                const seedFromState = (state: ioBrokerState | null) => {
                    if (!mountedRef.current) return;
                    const val = typeof state?.val === 'number' ? (state.val as number) : null;
                    setResultsMap((prev) => {
                        const next = new Map(prev);
                        const existing = next.get(s.id);
                        next.set(s.id, { data: existing?.data ?? [], current: val, loading: false });
                        return next;
                    });
                };
                if (cached) {
                    seedFromState(cached);
                } else if (getState) {
                    getState(s.datapointId)
                        .then(seedFromState)
                        .catch(() => seedFromState(null));
                } else {
                    seedFromState(null);
                }
                return;
            }

            const range = s.historyRange ?? '24h';
            const hasAbsWindow = typeof s.historyStart === 'number' && typeof s.historyEnd === 'number';
            const rangeMs = hasAbsWindow ? (s.historyEnd as number) - (s.historyStart as number) : getRangeMs(s);
            const now = Date.now();
            const end = hasAbsWindow ? Math.min(s.historyEnd as number, now) : now;
            const start = hasAbsWindow ? (s.historyStart as number) : end - rangeMs;
            // `none` = raw points: skip bucketing so the adapter returns the actual logged
            // values instead of per-bucket averages.
            const wantRaw = s.aggregate === 'none';
            const step = wantRaw
                ? undefined
                : hasAbsWindow
                  ? getStepForMs(rangeMs)
                  : range === 'custom'
                    ? getStepForMs(rangeMs)
                    : RANGE_STEP[range];

            getHistoryDirect(s.datapointId, {
                instance: s.historyInstance,
                start,
                end,
                step,
                aggregate: step ? (s.aggregate ?? 'average') : 'none',
                count: 1000,
            })
                .then((entries: HistoryEntry[]) => {
                    if (!mountedRef.current) return;
                    let data: [number, number][] = entries
                        .filter(
                            (e): e is { ts: number; val: number; ack?: boolean; q?: number } =>
                                typeof e.val === 'number',
                        )
                        .map((e): [number, number] => [e.ts, e.val as number])
                        .sort((a, b) => a[0] - b[0]);
                    if (hasAbsWindow) {
                        // History adapters append border values at the window edges (last value
                        // before start, first value after end). For a pinned calendar-day window
                        // they leak the neighbour days in — e.g. the midnight reset of a daily
                        // rain counter lands exactly on the end border and hides the day total.
                        const winStart = s.historyStart as number;
                        const winEnd = s.historyEnd as number;
                        data = data.filter((p) => p[0] >= winStart && p[0] < winEnd);
                    }

                    // A pinned PAST day is a frozen view: its "current" is that day's last value,
                    // never the live state.
                    if (hasAbsWindow && (s.historyEnd as number) < Date.now()) {
                        const current = data.length > 0 ? data[data.length - 1][1] : null;
                        setResultsMap((prev) => {
                            const next = new Map(prev);
                            next.set(s.id, { data, current, loading: false });
                            return next;
                        });
                        return;
                    }

                    // Rolling / live window: the displayed "current" must be the datapoint's real
                    // present value. History adapters append a boundary point at `now` that holds
                    // the LAST logged value, so a datapoint that dropped (e.g. power → 0) without a
                    // fresh log would otherwise keep showing its stale value (issue #510). Read the
                    // live state; when it differs from the held tail, extend the line to it so the
                    // curve drops to reality instead of running flat.
                    const finish = (state: ioBrokerState | null) => {
                        if (!mountedRef.current) return;
                        const liveVal = typeof state?.val === 'number' ? (state.val as number) : null;
                        let outData = data;
                        if (liveVal !== null && data.length > 0 && data[data.length - 1][1] !== liveVal) {
                            outData = [...data, [Date.now(), liveVal]];
                        }
                        const current = liveVal ?? (data.length > 0 ? data[data.length - 1][1] : null);
                        setResultsMap((prev) => {
                            const next = new Map(prev);
                            next.set(s.id, { data: outData, current, loading: false });
                            return next;
                        });
                    };
                    const cached = getStateFromCache(s.datapointId);
                    if (cached) finish(cached);
                    else if (getState)
                        getState(s.datapointId)
                            .then(finish)
                            .catch(() => finish(null));
                    else finish(null);
                })
                .catch(() => {
                    if (!mountedRef.current) return;
                    setResultsMap((prev) => {
                        const next = new Map(prev);
                        const existing = next.get(s.id);
                        next.set(s.id, {
                            data: existing?.data ?? [],
                            current: existing?.current ?? null,
                            loading: false,
                        });
                        return next;
                    });
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, connected]);

    // Subscribe to live updates for all series
    useEffect(() => {
        if (!connected || series.length === 0) return;
        const unsubs = series
            // Series pinned to a past absolute window are a frozen view — no live appends.
            .filter(
                (s) =>
                    !!s.datapointId &&
                    (s.source === 'json' || !(typeof s.historyEnd === 'number' && s.historyEnd < Date.now())),
            )
            .map((s) => {
                const cutoffMs = getRangeMs(s);
                if (s.source === 'json') {
                    // JSON datapoints are rewritten as a whole — re-parse the payload instead of
                    // appending a point, and skip the update when the raw value is unchanged.
                    return subscribe(s.datapointId, (state: ioBrokerState) => {
                        const rawStr = typeof state.val === 'string' ? state.val : JSON.stringify(state.val);
                        if (lastRawRef.current.get(s.id) === rawStr) return;
                        lastRawRef.current.set(s.id, rawStr);
                        const points = parseJsonSeries(state.val, s);
                        setResultsMap((prev) => {
                            const next = new Map(prev);
                            next.set(s.id, {
                                data: [],
                                points,
                                current: points.length > 0 ? points[points.length - 1].value : null,
                                loading: false,
                            });
                            return next;
                        });
                    });
                }
                return subscribe(s.datapointId, (state: ioBrokerState) => {
                    if (typeof state.val !== 'number') return;
                    const val = state.val as number;
                    setResultsMap((prev) => {
                        const existing = prev.get(s.id);
                        // Adapters often re-write unchanged values on every poll (only the ts
                        // moves). Appending those points rebuilt the chart each time — visible
                        // as a periodic flicker. Returning the previous map bails out of the
                        // re-render entirely.
                        if (existing && !existing.loading && existing.current === val) return prev;
                        const next = new Map(prev);
                        let newData: [number, number][];
                        if (s.historyInstance && existing) {
                            const cutoff = typeof s.historyStart === 'number' ? s.historyStart : Date.now() - cutoffMs;
                            const trimmed = existing.data.filter((p) => p[0] >= cutoff);
                            if (trimmed.length > 0 && trimmed[trimmed.length - 1][0] === state.ts) {
                                newData = trimmed;
                            } else {
                                newData = [...trimmed, [state.ts, val]];
                            }
                        } else {
                            const prev2 = existing?.data ?? [];
                            const combined: [number, number][] = [...prev2, [state.ts, val]];
                            newData = combined.slice(-120);
                        }
                        next.set(s.id, { data: newData, current: val, loading: false });
                        return next;
                    });
                });
            });
        return () => {
            unsubs.forEach((u) => u());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey, connected, subscribe]);

    return resultsMap;
}
