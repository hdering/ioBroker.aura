import { useEffect, useRef, useState } from 'react';
import { getHistoryDirect, getObjectDirect, isHistoryStubbed, type HistoryEntry } from './useIoBroker';
import { detectHistoryAdapters, type DetectedAdapter } from './useChartHistory';
import { onWake } from '../utils/wakeSignal';
import type { ioBrokerState } from '../types';

/** Upper bound of rows a time window loads — raw values over weeks can be far more than a table shows. */
export const HISTORY_TABLE_RANGE_CAP = 2000;
/** Upper bound of the "last N values" setting. */
export const HISTORY_TABLE_MAX_COUNT = 500;

/**
 * Windows the "last N values" mode searches, smallest first. A narrow window keeps the adapter's
 * work small for a datapoint that logs every few seconds; a rarely changing one needs the wide ones.
 */
const COUNT_WINDOWS_MS = [86_400_000, 7 * 86_400_000, 30 * 86_400_000, 365 * 86_400_000, 20 * 365 * 86_400_000];
/** Forward pages one window may take when the adapter hands out its oldest rows instead of its newest. */
const MAX_FORWARD_PAGES = 20;

export type HistoryTableMode = 'count' | 'range';

export interface HistoryRowsResult {
    /** Raw rows, oldest first. */
    rows: HistoryEntry[];
    adapters: DetectedAdapter[];
    /** `common.states` of the datapoint — value texts the object declares itself. */
    states: unknown;
    instance: string | undefined;
    loading: boolean;
    /** The time window held more rows than {@link HISTORY_TABLE_RANGE_CAP}; only the newest are shown. */
    truncated: boolean;
}

function byTs(a: HistoryEntry, b: HistoryEntry) {
    return a.ts - b.ts;
}

/** Collapse rows with the same timestamp (adapters can return one twice across page borders). */
function uniqueByTs(rows: HistoryEntry[]): HistoryEntry[] {
    const out: HistoryEntry[] = [];
    for (const r of [...rows].sort(byTs)) {
        if (out.length && out[out.length - 1].ts === r.ts) out[out.length - 1] = r;
        else out.push(r);
    }
    return out;
}

/**
 * The newest `count` raw rows. Asked with `returnNewestEntries`, but not every adapter version
 * honours it — one that hands out the oldest rows of the window instead is caught by paging forward
 * from the newest row it returned until nothing newer comes back.
 */
async function fetchLastN(id: string, instance: string, count: number): Promise<HistoryEntry[]> {
    const end = Date.now();
    let rows: HistoryEntry[] = [];
    for (const span of COUNT_WINDOWS_MS) {
        rows = await getHistoryDirect(id, {
            instance,
            start: end - span,
            end,
            count,
            aggregate: 'none',
            returnNewestEntries: true,
            removeBorderValues: true,
        });
        if (rows.length < count) continue;
        for (let page = 0; page < MAX_FORWARD_PAGES; page++) {
            const newest = rows.reduce((m, r) => Math.max(m, r.ts), -Infinity);
            const next = await getHistoryDirect(id, {
                instance,
                start: newest + 1,
                end,
                count,
                aggregate: 'none',
                returnNewestEntries: true,
                removeBorderValues: true,
            });
            if (!next.some((r) => r.ts > newest)) break;
            rows = uniqueByTs([...rows, ...next]).slice(-count * 2);
        }
        break;
    }
    return uniqueByTs(rows).slice(-count);
}

async function fetchRange(id: string, instance: string, rangeMs: number): Promise<HistoryEntry[]> {
    const end = Date.now();
    const rows = await getHistoryDirect(id, {
        instance,
        start: end - rangeMs,
        end,
        count: HISTORY_TABLE_RANGE_CAP,
        aggregate: 'none',
        returnNewestEntries: true,
        removeBorderValues: true,
    });
    return uniqueByTs(rows.filter((r) => r.ts >= end - rangeMs && r.ts <= end)).slice(-HISTORY_TABLE_RANGE_CAP);
}

/**
 * Raw history rows of one datapoint for the history table (#760): either the last `count` values
 * or every value of the last `rangeMs`. Values of any type are kept — unlike the chart hook, which
 * plots numbers only. New values arrive live; a quiet refetch every few minutes (and after the
 * device wakes from standby) picks up what the subscription cannot know, e.g. a history adapter that
 * logs only every n-th change.
 */
export function useHistoryRows(
    datapointId: string | undefined,
    historyInstance: string | undefined,
    mode: HistoryTableMode,
    count: number,
    rangeMs: number,
    socketConnected: boolean,
    subscribe: (id: string, cb: (state: ioBrokerState) => void) => () => void,
): HistoryRowsResult {
    const connected = socketConnected || isHistoryStubbed();
    const [adapters, setAdapters] = useState<DetectedAdapter[]>([]);
    const [states, setStates] = useState<unknown>(undefined);
    // Which datapoint's object has been read — until then "no adapter" is not known yet.
    const [objectFor, setObjectFor] = useState<string | undefined>(undefined);
    const [rows, setRows] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(!!datapointId);
    const [truncated, setTruncated] = useState(false);
    const [tick, setTick] = useState(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const isTemplate = !!datapointId?.startsWith('{{');
    const instance = historyInstance || adapters[0]?.instance;

    useEffect(() => {
        if (!datapointId || isTemplate) {
            setAdapters([]);
            setStates(undefined);
            return;
        }
        getObjectDirect(datapointId).then((obj) => {
            if (!mountedRef.current) return;
            const custom = obj?.common?.custom;
            setAdapters(custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : []);
            setStates(obj?.common?.states);
            setObjectFor(datapointId);
        });
    }, [datapointId, isTemplate]);

    // Quiet refetch: the window moves on and the adapter may log values the subscription never sees.
    useEffect(() => {
        if (!datapointId || !instance || !connected) return;
        const every = mode === 'range' && rangeMs <= 3_600_000 ? 60_000 : 300_000;
        const timer = globalThis.setInterval(() => setTick((n) => n + 1), every);
        const offWake = onWake(() => setTick((n) => n + 1));
        return () => {
            clearInterval(timer);
            offWake();
        };
    }, [datapointId, instance, connected, mode, rangeMs]);

    // A changed request shows the spinner; a refresh tick swaps the rows silently.
    const requestKey = `${datapointId}|${instance}|${mode}|${count}|${rangeMs}`;
    const shownKeyRef = useRef('');
    useEffect(() => {
        if (!datapointId || isTemplate || !connected) return;
        if (!instance) {
            if (objectFor !== datapointId) return;
            setRows([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        if (shownKeyRef.current !== requestKey) setLoading(true);
        const job =
            mode === 'range' ? fetchRange(datapointId, instance, rangeMs) : fetchLastN(datapointId, instance, count);
        job.then((data) => {
            if (cancelled || !mountedRef.current) return;
            shownKeyRef.current = requestKey;
            setRows(data);
            setTruncated(mode === 'range' && data.length >= HISTORY_TABLE_RANGE_CAP);
            setLoading(false);
        }).catch(() => {
            if (!cancelled && mountedRef.current) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [requestKey, tick, connected, isTemplate, objectFor]); // eslint-disable-line react-hooks/exhaustive-deps

    // Live values: a new reading goes on top. An adapter rewriting the same value is not a new row —
    // history adapters only log changes by default, and the refetch corrects any other setting.
    useEffect(() => {
        if (!datapointId || isTemplate || !connected || !instance) return;
        return subscribe(datapointId, (state) => {
            if (!state || typeof state.ts !== 'number') return;
            setRows((prev) => {
                const last = prev[prev.length - 1];
                if (last && (state.ts <= last.ts || state.val === last.val)) return prev;
                const next = [...prev, { ts: state.ts, val: state.val as HistoryEntry['val'] }];
                if (mode === 'count') return next.slice(-count);
                const cutoff = Date.now() - rangeMs;
                return next.filter((r) => r.ts >= cutoff).slice(-HISTORY_TABLE_RANGE_CAP);
            });
        });
    }, [datapointId, isTemplate, connected, instance, subscribe, mode, count, rangeMs]);

    return { rows, adapters, states, instance, loading, truncated };
}
