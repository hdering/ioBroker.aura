import { useState, useEffect, useRef } from 'react';
import { getHistoryDirect, type HistoryEntry } from './useIoBroker';
import type { ioBrokerState } from '../types';

export type EChartTimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

export interface EChartSeriesConfig {
  id: string;
  name: string;
  datapointId: string;
  chartType: 'line' | 'bar' | 'area' | 'scatter';
  color?: string;
  historyInstance?: string;
  historyRange?: EChartTimeRange;
  smooth?: boolean;
  yAxisIndex?: 0 | 1;
  lineWidth?: number;
}

export interface SeriesDataResult {
  data: [number, number][];
  current: number | null;
  loading: boolean;
}

const RANGE_MS: Record<EChartTimeRange, number> = {
  '1h':  3_600_000,
  '6h':  21_600_000,
  '24h': 86_400_000,
  '7d':  604_800_000,
  '30d': 2_592_000_000,
};

const RANGE_STEP: Record<EChartTimeRange, number | undefined> = {
  '1h':  undefined,
  '6h':  300_000,
  '24h': 900_000,
  '7d':  3_600_000,
  '30d': 21_600_000,
};

export function useMultiSeriesData(
  series: EChartSeriesConfig[],
  connected: boolean,
  subscribe: (id: string, cb: (state: ioBrokerState) => void) => () => void,
): Map<string, SeriesDataResult> {
  const [resultsMap, setResultsMap] = useState<Map<string, SeriesDataResult>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Dep key to detect when series config changes meaningfully
  const depKey = JSON.stringify(
    series.map((s) => [s.id, s.datapointId, s.historyInstance, s.historyRange]),
  );

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
      if (!s.datapointId || !s.historyInstance) {
        setResultsMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(s.id);
          next.set(s.id, { data: existing?.data ?? [], current: existing?.current ?? null, loading: false });
          return next;
        });
        return;
      }

      const range = s.historyRange ?? '24h';
      const end = Date.now();
      const start = end - RANGE_MS[range];
      const step = RANGE_STEP[range];

      getHistoryDirect(s.datapointId, {
        instance: s.historyInstance,
        start,
        end,
        step,
        aggregate: step ? 'average' : 'none',
        count: 1000,
      }).then((entries: HistoryEntry[]) => {
        if (!mountedRef.current) return;
        const data: [number, number][] = (entries
          .filter((e): e is { ts: number; val: number; ack?: boolean; q?: number } => typeof e.val === 'number')
          .map((e): [number, number] => [e.ts, e.val as number])
          .sort((a, b) => a[0] - b[0]));
        const current = data.length > 0 ? data[data.length - 1][1] : null;
        setResultsMap((prev) => {
          const next = new Map(prev);
          next.set(s.id, { data, current, loading: false });
          return next;
        });
      }).catch(() => {
        if (!mountedRef.current) return;
        setResultsMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(s.id);
          next.set(s.id, { data: existing?.data ?? [], current: existing?.current ?? null, loading: false });
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
      .filter((s) => !!s.datapointId)
      .map((s) => {
        const range = s.historyRange ?? '24h';
        const cutoffMs = RANGE_MS[range];
        return subscribe(s.datapointId, (state: ioBrokerState) => {
          if (typeof state.val !== 'number') return;
          const val = state.val as number;
          setResultsMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(s.id);
            let newData: [number, number][];
            if (s.historyInstance && existing) {
              const cutoff = Date.now() - cutoffMs;
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
    return () => { unsubs.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, connected, subscribe]);

  return resultsMap;
}
