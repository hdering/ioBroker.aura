import { useState, useEffect, useRef } from 'react';
import { getHistoryDirect, getStateFromCache, getObjectDirect, type HistoryEntry } from './useIoBroker';
import { detectHistoryAdapters, TOTAL_FLOOR_MS, type DetectedAdapter } from './useChartHistory';
import { applyValueTransform } from '../utils/valueTransform';
import type { ioBrokerState } from '../types';

export type EChartTimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | '1y' | 'total' | 'custom';

/** Calendar bucket the `delta` aggregation differences a rising counter over. */
export type DeltaBucket = 'hour' | 'day' | 'week' | 'month' | 'year';

/** What the user picks — `auto` derives the bucket from the selected window (issue #536). */
export type DeltaBucketSetting = DeltaBucket | 'auto';

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
    /**
     * Stack this series onto the other stacked series of its y axis (issue #541) — e.g. battery
     * discharge + grid draw adding up to the house consumption. Stacks are grouped per axis, since
     * summing values from two differently scaled axes would be meaningless. See `alignStackedSeries`
     * for why the points have to be resampled onto a shared timeline first.
     */
    stack?: boolean;
    /**
     * Outline a stacked area band with the series colour (default off). Off, because the outline of
     * a band at value 0 lies on the band below it and reads as a curve with no area — see
     * `outlineWidthFor`. Only meaningful for a stacked area.
     */
    stackOutline?: boolean;
    /**
     * Fill opacity of an area in percent (10–100), unset = the default of `areaOpacityFor`: a
     * stacked band is opaque so it shows the colour it was given, a single area stays a wash to
     * see through (issue #557). Only meaningful for an area.
     */
    areaOpacity?: number;
    /** Absolute window override (ms epoch) — set by the widget's day navigation; wins over historyRange. */
    historyStart?: number;
    historyEnd?: number;
    /**
     * getHistory aggregation for stepped fetches (default `average`). `minmax` keeps the real
     * extreme points with their true timestamps — right for sparsely change-logged datapoints
     * (e.g. daily rain counters), where bucket averages smear resets and dropped empty buckets
     * let the chart interpolate across days. `none` disables bucketing entirely and returns the
     * raw logged points — no server-side averaging that could smear a value across a gap.
     * `delta` is for ever-rising totalisers (electricity/water meters): instead of the counter
     * reading it plots the consumption per calendar bucket — see `deltaBucket` (issue #521).
     */
    aggregate?: 'average' | 'minmax' | 'max' | 'min' | 'total' | 'none' | 'delta';
    /**
     * Calendar bucket the `delta` aggregation differences over (default `hour`). `auto` derives it
     * from the active window instead — see `resolveDeltaBucket`.
     */
    deltaBucket?: DeltaBucketSetting;
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
    /**
     * Dotted path to the object holding the y-axis bounds, e.g. `axis` for
     * `{"axis": {"min": 0, "max": 100}, "data": [...]}`. Empty = look for the block automatically.
     * Only read when the widget has `echartJsonAxisBounds` switched on (issue #550).
     */
    jsonAxisPath?: string;
    /**
     * Display-only value conversion, per series (issue #540): every point, the live value and the
     * current-value block are shown as `raw * valueFactor + valueOffset` — the datapoint and its
     * history records are never touched. Set through the ƒx button next to the series' datapoint;
     * `valueTransform` only remembers which preset was picked (several share a factor, e.g. W→kW
     * and Wh→kWh are both ×0.001).
     *
     * A `delta` series is converted before differencing, so the offset cancels out — as it must:
     * a shifted counter reading consumes exactly as much per bucket as an unshifted one.
     */
    valueTransform?: string;
    valueFactor?: number;
    valueOffset?: number;
}

/** A series' raw number as it should be displayed — see `valueFactor` / `valueOffset`. */
function seriesValue(s: EChartSeriesConfig, raw: number): number {
    return applyValueTransform(raw, s.valueFactor, s.valueOffset);
}

/** One label/value pair of a JSON-sourced series. */
export interface JsonPoint {
    label: string;
    value: number;
}

/** Y-axis scale a JSON payload asks for — either bound may be missing (issue #550). */
export interface JsonAxisBounds {
    min?: number;
    max?: number;
}

export interface SeriesDataResult {
    data: [number, number][];
    current: number | null;
    loading: boolean;
    /** Categorical points — only filled for `source: 'json'` series. */
    points?: JsonPoint[];
    /** Y-axis min/max the payload carries alongside its data — only for `source: 'json'`. */
    bounds?: JsonAxisBounds;
}

const RANGE_MS: Record<Exclude<EChartTimeRange, 'custom'>, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
    '1y': 31_536_000_000,
    total: TOTAL_FLOOR_MS,
};

const RANGE_STEP: Record<Exclude<EChartTimeRange, 'custom'>, number | undefined> = {
    '1h': undefined,
    '6h': 300_000,
    '24h': 900_000,
    '7d': 3_600_000,
    '30d': 21_600_000,
    // A year at the 6 h step would be ~1460 rows and run into the `count` cap below.
    '1y': 86_400_000,
    // Unused: a `total` window sizes its step from the probed span instead, since how long it
    // actually is only becomes known after the probe.
    total: 86_400_000,
};

/**
 * Millisecond span of a range selection — also used by the widget to frame flat "no change" windows.
 *
 * `total` has no configured span; it reports the floor, which is what live-window trimming needs
 * (never trim). The fetch path does NOT use this for `total` — it probes the real start instead.
 */
export function rangeToMs(range: EChartTimeRange, customValue?: number, customUnit?: 'h' | 'd'): number {
    if (range === 'custom') {
        return Math.max(1, customValue ?? 24) * ((customUnit ?? 'h') === 'd' ? 86_400_000 : 3_600_000);
    }
    return RANGE_MS[range];
}

function getRangeMs(s: EChartSeriesConfig): number {
    return rangeToMs(s.historyRange ?? '24h', s.historyRangeCustomValue, s.historyRangeCustomUnit);
}

/** Length of the window actually fetched — an absolute day window overrides the rolling range. */
function windowMs(s: EChartSeriesConfig): number {
    if (typeof s.historyStart === 'number' && typeof s.historyEnd === 'number') {
        return s.historyEnd - s.historyStart;
    }
    return getRangeMs(s);
}

function getStepForMs(rangeMs: number): number | undefined {
    if (rangeMs <= 3 * 3_600_000) return undefined;
    if (rangeMs <= 12 * 3_600_000) return 300_000;
    if (rangeMs <= 48 * 3_600_000) return 900_000;
    if (rangeMs <= 14 * 86_400_000) return 3_600_000;
    // Beyond ~2 months the 6 h step exceeds the 1000-row `count` cap — drop to daily, then scale
    // in whole days so even a multi-year `total` window stays at ≈900 rows.
    if (rangeMs <= 60 * 86_400_000) return 21_600_000;
    return Math.max(86_400_000, Math.ceil(rangeMs / 900 / 86_400_000) * 86_400_000);
}

// ── Counter deltas (issue #521) ───────────────────────────────────────────────
// A totaliser (electricity/water meter) logs an ever-rising reading. Plotting it raw gives a
// flat-looking line, because the absolute value (12345 kWh) dwarfs the swings (1.4 kWh). The
// `delta` aggregation instead differences the reading per calendar bucket, so the chart shows
// consumption per hour/day/week/month.

/** Start of the local calendar bucket `ts` falls into. */
export function bucketStart(ts: number, bucket: DeltaBucket): number {
    const d = new Date(ts);
    d.setMinutes(0, 0, 0);
    if (bucket === 'hour') return d.getTime();
    // setHours(0,…) rather than subtracting 24 h — keeps DST switch days intact.
    d.setHours(0, 0, 0, 0);
    if (bucket === 'day') return d.getTime();
    if (bucket === 'week') {
        // ISO weeks start on Monday; getDay() is Sunday-based.
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d.getTime();
    }
    d.setDate(1);
    if (bucket === 'month') return d.getTime();
    // Day is already 1, so setting the month can't roll over into the next one.
    d.setMonth(0);
    return d.getTime();
}

/** Start of the bucket immediately preceding the one `ts` falls into. */
export function prevBucketStart(ts: number, bucket: DeltaBucket): number {
    const d = new Date(bucketStart(ts, bucket));
    if (bucket === 'hour') d.setHours(d.getHours() - 1);
    else if (bucket === 'day') d.setDate(d.getDate() - 1);
    else if (bucket === 'week') d.setDate(d.getDate() - 7);
    else if (bucket === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
}

/**
 * Concrete bucket for a bucket setting and the window it is charted over (issue #536).
 *
 * An unset bucket keeps the historical `hour` default, so widgets configured before `auto` existed
 * render unchanged. `auto` picks the bucket that gives a readable number of bars for the window:
 * a day of hourly bars, a week or month of daily bars, a year of monthly bars. The thresholds sit
 * above the nominal window lengths (26 h, 45 d, 400 d) so a custom "25 hours" or "31 days" lands in
 * the bucket a user would expect rather than one step coarser. The weekly band only ever comes from
 * a custom window (no preset falls into it) and keeps a "90 days" selection at ~13 bars instead of
 * the three a monthly bucket would give.
 */
export function resolveDeltaBucket(setting: DeltaBucketSetting | undefined, rangeMs: number): DeltaBucket {
    if (setting !== 'auto') return setting ?? 'hour';
    if (rangeMs <= 26 * 3_600_000) return 'hour';
    if (rangeMs <= 45 * 86_400_000) return 'day';
    if (rangeMs <= 180 * 86_400_000) return 'week';
    if (rangeMs <= 400 * 86_400_000) return 'month';
    return 'year';
}

/**
 * getHistory step for a delta fetch. Hour buckets are fetched hourly; larger buckets are also
 * fetched hourly and re-bucketed locally, because adapters align their own buckets to UTC —
 * a server-side day bucket would cut the local day at the wrong hour. Only long windows drop to a
 * daily step so the row count stays sane.
 *
 * A whole day is where it stops. A step coarser than that used to be taken for multi-year windows,
 * but it cannot carry a resetting counter at all: several reset cycles then fall into one step, and
 * the `minmax` rows a step comes back as expose exactly one climb of them — a two-day step showed a
 * `total` window at a fraction of the real yield (issue #562). The rows a daily step costs are paid
 * for out of the row budget instead, see `deltaFetchCount`.
 */
export function deltaFetchStep(bucket: DeltaBucket, rangeMs: number): number {
    if (bucket === 'hour') return 3_600_000;
    if (rangeMs <= 125 * 86_400_000) return 3_600_000;
    return 86_400_000;
}

/**
 * Row budget for a delta fetch — a cap the adapter trims the result to, so it has to cover the
 * whole window: a truncated series silently drops bars off one end.
 *
 * An hourly step returns one row per hour, a daily one up to four (`minmax` hands back start, min,
 * max and end of the step). The floor keeps short windows at the value they always asked for, the
 * ceiling stops a `total` window whose probe reaches back years from asking for a payload nobody
 * can read anyway — at four rows a day it still covers well over a decade.
 */
export function deltaFetchCount(step: number, rangeMs: number): number {
    const rows = step >= 86_400_000 ? Math.ceil(rangeMs / 86_400_000) * 4 : Math.ceil(rangeMs / step);
    return Math.min(20_000, Math.max(3000, rows + 100));
}

/**
 * Timestamp the history adapter's oldest record for `id` sits at, for a `total` window (issue #536).
 *
 * A coarse monthly-step probe stays at a couple of hundred rows even across decades, and the first
 * bucket that carries an actual value marks the recording start to within a month — precise enough
 * to size the real fetch, which then picks its own step from that span. Adapters that pad empty
 * buckets with nulls are handled by skipping non-numeric rows. Returns null when the adapter reports
 * nothing at all, or when the probe fails; the caller then falls back to the floor.
 */
async function probeHistoryStart(id: string, instance: string, end: number): Promise<number | null> {
    try {
        const entries = await getHistoryDirect(id, {
            instance,
            start: end - TOTAL_FLOOR_MS,
            end,
            step: 30 * 86_400_000,
            aggregate: 'min',
            count: 1000,
        });
        const first = entries.find((e) => typeof e.val === 'number');
        return first ? first.ts : null;
    } catch {
        return null;
    }
}

export interface DeltaSeries {
    /** One point per bucket: [bucket start, consumption within the bucket]. */
    points: [number, number][];
    /**
     * The trailing bucket's start, plus the value a live reading has to be differenced against to
     * reproduce that bucket's bar — lets a live state update grow the still-open bar without
     * refetching. `lastBase` is not a reading the counter ever had: it is the last reading minus
     * what the bucket has already accumulated, so `live − lastBase` keeps the consumption booked
     * so far. For a plain monotonic meter it works out to the previous bucket's reading.
     */
    lastBucket: number | null;
    lastBase: number | null;
}

/**
 * Does this series come from a counter that RESETS, rather than one that only ever rises?
 *
 * A day counter (a PV inverter's day yield, `sourceanalytix.*.01_currentDay`) falls back to ~0 on
 * every single day; a meter's stray low reading — an adapter restart — happens once. So a fall to
 * below half the reading it fell from counts as a turnover, and the series is a resetting counter
 * when those turnovers show up on at least two days AND on at least a third of the days that carry
 * data. Two thresholds, because either alone misreads a case: a single day of data with one glitch
 * would be a ratio of 1, and a handful of glitches over a long window would pass a plain count.
 *
 * `bucketDeltas` needs the distinction because at a coarse resolution a reset and a glitch look
 * alike within one day — see the drop handling there (issue #562).
 */
export function looksLikeResettingCounter(data: [number, number][]): boolean {
    const days = new Set<number>();
    const turnoverDays = new Set<number>();
    let prev: number | null = null;
    for (const [ts, val] of data) {
        const day = bucketStart(ts, 'day');
        days.add(day);
        if (prev !== null && prev > 0 && val < prev / 2) turnoverDays.add(day);
        prev = val;
    }
    return turnoverDays.size >= 2 && turnoverDays.size * 3 >= days.size;
}

/**
 * Difference a counter series into per-bucket consumption.
 *
 * The series is walked in timestamp order and every rise is booked onto the bucket of the reading
 * that realises it, so a bucket's bar is the sum of the rises inside it plus the rise out of the
 * previous bucket. For a plain monotonic meter that is exactly `max(bucket) − max(previous bucket)`,
 * which is what this used to compute directly. Buckets without any record are skipped, so their
 * consumption folds into the next bucket that has one rather than showing a false zero, and a
 * bucket with no predecessor at all is left with the rises inside it — a counter whose logging
 * just started still renders instead of waiting for its second bucket.
 *
 * Drops are where the two kinds of counter part ways (issue #545):
 *
 * - A counter that RESETS — a PV inverter's day yield, `solaredge.*.lastDayData` — falls back to
 *   ~0 at midnight. The drop books nothing and the climb that follows is real production, so the
 *   day ends up with its full yield. Differencing the daily maxima instead (the old behaviour)
 *   gave a negative number on every day that produced less than its predecessor, which was
 *   clamped to 0 — those bars went missing, and the rest showed only the difference to the day
 *   before rather than the day's own total.
 * - A GLITCH — an adapter restart writing one stray low reading — is followed by a jump straight
 *   back to where the counter was. Booking that jump would invent a bar the size of the entire
 *   meter reading. So a suspicious drop arms a guard, and the next rise that lands back at or
 *   above the pre-drop reading is discarded instead of booked.
 *
 * Which drop is suspicious was decided by WHERE it happens: one across a day boundary is a
 * turnover, one inside a day a glitch. That reads a resetting counter wrong as soon as the rows
 * are coarse (issue #562). A day counter's reset lands a few records INTO the new day, because the
 * reading it still held at midnight comes first — the flushed last sample of the old day, or the
 * `start` row of a daily `minmax` fetch. The turnover was then taken for a glitch, and since the
 * next rise is the whole day's climb in one step, every day that reached the previous day's level
 * was discarded: monthly and yearly bars came out at roughly half. So a series that turns over
 * daily (`looksLikeResettingCounter`) gets ONE unguarded drop per local day — its reset — and
 * every further drop that day is still treated as a glitch.
 *
 * A series that only ever rises never reaches either path and comes out exactly as before.
 *
 * `data` must be sorted by timestamp. `windowStart` drops the leading baseline bucket, which only
 * exists to difference against.
 */
export function bucketDeltas(data: [number, number][], bucket: DeltaBucket, windowStart: number): DeltaSeries {
    const sums = new Map<number, number>();
    const resetting = looksLikeResettingCounter(data);
    let prevVal: number | null = null;
    let prevTs = 0;
    /** Reading an intra-day drop fell from, while the rise back to it is still to come. */
    let glitchHigh: number | null = null;
    /** Local day whose turnover a resetting counter has already been granted. */
    let turnoverDay: number | null = null;
    for (const [ts, val] of data) {
        const b = bucketStart(ts, bucket);
        if (!sums.has(b)) sums.set(b, 0);
        if (prevVal !== null) {
            let inc = val - prevVal;
            if (inc < 0) {
                // Nothing to book either way — a reset consumed nothing, and a glitch is not a
                // reading at all. Suspicious is a drop inside a day, unless it is the daily
                // turnover of a resetting counter (which may sit either side of midnight).
                const day = bucketStart(ts, 'day');
                const turnover = resetting && turnoverDay !== day;
                if (!turnover && bucketStart(prevTs, 'day') === day) glitchHigh ??= prevVal;
                if (resetting) turnoverDay = day;
                inc = 0;
            } else if (inc > 0 && glitchHigh !== null) {
                if (val >= glitchHigh) inc = 0;
                // Either outcome settles the guard: a rise that stayed below the pre-drop reading
                // means the counter really is climbing again from a lower level.
                glitchHigh = null;
            }
            sums.set(b, sums.get(b)! + inc);
        }
        prevVal = val;
        prevTs = ts;
    }
    const buckets = [...sums.keys()].sort((a, b) => a - b);
    const points: [number, number][] = [];
    for (const b of buckets) {
        if (b < windowStart) continue;
        points.push([b, sums.get(b)!]);
    }
    const lastBucket = buckets.length > 0 ? buckets[buckets.length - 1] : null;
    return {
        points,
        lastBucket,
        lastBase: lastBucket !== null && prevVal !== null ? prevVal - sums.get(lastBucket)! : null,
    };
}

/** Key names commonly used for the y value, best guess first. */
const VALUE_KEY_HINTS = ['value', 'val', 'y', 'v', 'wert', 'amount', 'count'];
/** Key names commonly used for the x label, best guess first. */
const LABEL_KEY_HINTS = ['label', 'ts', 'timestamp', 'time', 'date', 'datum', 'x', 'name', 't', 'key'];

/**
 * Guess which object keys hold the label and the value, so a `{"ts": …, "val": …}` datapoint
 * charts without anyone having to know the field names. Well-known names win; otherwise the
 * first numeric field becomes the value and the first remaining field the label.
 */
export function detectJsonKeys(sample: Record<string, unknown>): { labelKey?: string; valueKey?: string } {
    const keys = Object.keys(sample);
    if (keys.length === 0) return {};
    const numeric = keys.filter((k) => {
        const v = sample[k];
        return (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v));
    });
    // Well-known value names first: they are the strongest signal, and pinning the value down
    // keeps a numeric-looking label (`"ts": "1785362400000"`, `"stunde": "08"`) from being
    // mistaken for it. Only then pick the label, falling back to field order — objects are
    // written label-first by convention.
    let valueKey = VALUE_KEY_HINTS.find((h) => keys.includes(h));
    const labelKey =
        LABEL_KEY_HINTS.find((h) => keys.includes(h) && h !== valueKey) ?? keys.find((k) => k !== valueKey);
    valueKey ??= numeric.find((k) => k !== labelKey) ?? keys.find((k) => k !== labelKey);
    return { labelKey, valueKey };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The object hiding inside an array wrapper — `[{"yAxis": {…}, "data": […]}]` instead of
 * `{"yAxis": {…}, "data": […]}`, the shape a script writes when it wraps a payload that already
 * was an array (issue #550). Only a single-element array whose object carries a nested array
 * counts, so an array of real data entries is never mistaken for a wrapper.
 */
function wrapperObject(node: unknown): Record<string, unknown> | undefined {
    if (!Array.isArray(node) || node.length !== 1 || !isPlainObject(node[0])) return undefined;
    const only = node[0];
    return Object.values(only).some(Array.isArray) ? only : undefined;
}

/** Follow one path segment, seeing through an array wrapper around the object that holds it. */
function stepInto(node: unknown, key: string): unknown {
    if (Array.isArray(node)) {
        // A numeric segment picks the element (`0.data`); any other one is looked up in the
        // objects the array holds, so a path written for the payload itself keeps resolving
        // when that payload arrives wrapped in an array.
        if (/^\d+$/.test(key)) return node[Number(key)];
        for (const item of node) {
            if (isPlainObject(item) && item[key] !== undefined) return item[key];
        }
        return undefined;
    }
    return isPlainObject(node) ? node[key] : undefined;
}

/** Resolve the array a JSON datapoint's value holds, following the configured path. */
export function resolveJsonArray(raw: unknown, jsonPath?: string): unknown[] | null {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    const path = (jsonPath ?? '').trim();
    if (path) {
        parsed = path.split('.').filter(Boolean).reduce<unknown>(stepInto, parsed);
    }
    if (!Array.isArray(parsed)) return null;
    // A wrapper array is not the data: hand out the array it holds, so the same payload charts
    // with or without the wrapper — and with or without a path pointing past it.
    const wrapped = wrapperObject(parsed);
    if (wrapped) {
        const nested = Object.values(wrapped).filter(Array.isArray) as unknown[][];
        // One nested array is unambiguous; with several the path has to say which one.
        if (nested.length === 1) return nested[0];
    }
    return parsed;
}

/**
 * Every path inside a payload that points at a non-empty array — what the editor offers when the
 * configured path found nothing, so "no JSON array here" comes with the paths that would work
 * instead of leaving the structure to be guessed (issue #550).
 *
 * Wrapper arrays are seen through exactly like `resolveJsonArray` does, so `[{"data": […]}]`
 * suggests `data` and not `0.data`. Walks two object levels — deeper nesting is rare enough
 * that a suggestion list would turn into noise.
 */
export function suggestJsonArrayPaths(raw: unknown, maxPaths = 4): string[] {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    const root = isPlainObject(parsed) ? parsed : wrapperObject(parsed);
    if (!root) return [];
    const found: string[] = [];
    const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
        for (const [key, value] of Object.entries(obj)) {
            if (found.length >= maxPaths) return;
            const path = prefix ? `${prefix}.${key}` : key;
            if (Array.isArray(value)) {
                if (value.length > 0) found.push(path);
            } else if (isPlainObject(value) && depth > 0) {
                walk(value, path, depth - 1);
            }
        }
    };
    walk(root, '', 1);
    return found;
}

/**
 * Turn a JSON datapoint's raw value into label/value points.
 *
 * Accepts the value as an already-parsed object/array or as a JSON string (the usual case for
 * ioBroker string datapoints). Field names are optional — when unset they are detected from the
 * first entry. Entries whose value doesn't parse to a finite number are dropped; the array order
 * is kept as-is and becomes the category order on the x axis.
 */
export function parseJsonSeries(raw: unknown, s: EChartSeriesConfig): JsonPoint[] {
    const parsed = resolveJsonArray(raw, s.jsonPath);
    if (!parsed) return [];

    const firstObj = parsed.find((i) => !!i && typeof i === 'object' && !Array.isArray(i)) as
        | Record<string, unknown>
        | undefined;
    const detected = firstObj ? detectJsonKeys(firstObj) : {};
    const labelKey = s.jsonLabelKey || detected.labelKey || 'label';
    const valueKey = s.jsonValueKey || detected.valueKey || 'value';
    const points: JsonPoint[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const value = Number(rec[valueKey]);
        if (!Number.isFinite(value)) continue;
        points.push({ label: String(rec[labelKey] ?? ''), value: seriesValue(s, value) });
    }
    return points;
}

/** Key names a payload may use for the two bounds, best guess first. */
const AXIS_MIN_KEYS = ['min', 'yMin', 'ymin', 'minValue', 'axisMin', 'yAxisMin'];
const AXIS_MAX_KEYS = ['max', 'yMax', 'ymax', 'maxValue', 'axisMax', 'yAxisMax'];
/** Object keys commonly wrapping the bounds — checked before any other nested object. */
const AXIS_BLOCK_KEYS = ['yAxis', 'yaxis', 'axis', 'axes', 'scale', 'range', 'limits', 'bounds', 'meta'];

/** First of `keys` that holds a finite number (numeric strings count) — `undefined` if none does. */
function numberAt(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    }
    return undefined;
}

/**
 * The objects a node offers as a place for the bounds block: itself, or — when the payload
 * arrives wrapped in an array — the object inside that wrapper. Entries of a plain data array
 * are deliberately not offered: a `min` next to a point's value is per-point data, not an axis.
 */
function boundsCandidates(node: unknown): Record<string, unknown>[] {
    if (isPlainObject(node)) return [node];
    const wrapped = wrapperObject(node);
    return wrapped ? [wrapped] : [];
}

function boundsOf(obj: Record<string, unknown>): JsonAxisBounds | undefined {
    const min = numberAt(obj, AXIS_MIN_KEYS);
    const max = numberAt(obj, AXIS_MAX_KEYS);
    return min === undefined && max === undefined ? undefined : { min, max };
}

/**
 * Read the y-axis scale a JSON datapoint asks for — the payload's own `min`/`max` block, so a
 * script that already knows its value range can hand the axis over instead of leaving it to the
 * data (issue #550).
 *
 * The block is looked for next to the data rather than at one fixed place: the object itself
 * first, then a well-known wrapper (`axis`, `yAxis`, `scale`, `range`, ...), then any other nested
 * object carrying min/max — walking from the root down along `jsonPath`, so both
 * `{"min": 0, "max": 100, "data": [...]}` and `{"data": {"axis": {...}, "hours": [...]}}` are
 * found. `jsonAxisPath` pins the block down when a payload holds several candidates.
 *
 * Bounds go through the series' value conversion, exactly like its points: a payload scaled
 * W → kW must not keep a raw-watt axis.
 */
export function parseJsonAxisBounds(raw: unknown, s: EChartSeriesConfig): JsonAxisBounds | undefined {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
    const roots = boundsCandidates(parsed);
    if (roots.length === 0) return undefined;

    const scaled = (b: JsonAxisBounds): JsonAxisBounds => {
        const min = b.min === undefined ? undefined : seriesValue(s, b.min);
        const max = b.max === undefined ? undefined : seriesValue(s, b.max);
        // Hand the two bounds over in ascending order: a payload may write them the other way
        // round (`{"yMin": 20, "yMax": 0}`, issue #550) and a negative value factor flips them
        // anyway — a min above its max draws a mirrored, unreadable axis.
        return min !== undefined && max !== undefined && min > max ? { min: max, max: min } : { min, max };
    };

    const explicit = (s.jsonAxisPath ?? '').trim();
    if (explicit) {
        const target = explicit.split('.').filter(Boolean).reduce<unknown>(stepInto, parsed);
        for (const cand of boundsCandidates(target)) {
            const found = boundsOf(cand);
            if (found) return scaled(found);
        }
        return undefined;
    }

    // Root first, then every object step of the data path — the block usually sits beside the array.
    const candidates: Record<string, unknown>[] = [...roots];
    let cursor: unknown = parsed;
    for (const seg of (s.jsonPath ?? '').trim().split('.').filter(Boolean)) {
        cursor = stepInto(cursor, seg);
        const next = boundsCandidates(cursor);
        if (next.length === 0) break;
        candidates.push(...next);
    }

    for (const cand of candidates) {
        const direct = boundsOf(cand);
        if (direct) return scaled(direct);
        for (const key of AXIS_BLOCK_KEYS) {
            const block = cand[key];
            if (!isPlainObject(block)) continue;
            const found = boundsOf(block);
            if (found) return scaled(found);
        }
        for (const value of Object.values(cand)) {
            if (!isPlainObject(value)) continue;
            const found = boundsOf(value);
            if (found) return scaled(found);
        }
    }
    return undefined;
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
            // The RESOLVED bucket, so an `auto` series refetches when the window change moves it
            // into a different bucket.
            s.aggregate === 'delta' ? resolveDeltaBucket(s.deltaBucket, windowMs(s)) : undefined,
            s.source,
            s.jsonPath,
            s.jsonLabelKey,
            s.jsonValueKey,
            s.jsonAxisPath,
            s.valueFactor,
            s.valueOffset,
        ]),
    );

    // Last raw value seen per JSON series — lets the live subscription bail out of a re-render
    // when an adapter re-writes the identical payload (same flicker guard as numeric series).
    const lastRawRef = useRef<Map<string, string>>(new Map());

    // Per delta series: the still-open trailing bucket, the counter reading it differences against,
    // and the calendar unit it was bucketed by — lets a live state update grow the current bar
    // without a refetch. The unit is recorded rather than re-derived, so an `auto` or `total` series
    // (whose bucket depends on the probed window length) can't disagree with the fetch that filled
    // the bar.
    const deltaBaseRef = useRef<Map<string, { bucket: number; base: number; unit: DeltaBucket }>>(new Map());

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
                    const bounds = parseJsonAxisBounds(state?.val, s);
                    lastRawRef.current.set(
                        s.id,
                        typeof state?.val === 'string' ? state.val : JSON.stringify(state?.val),
                    );
                    setResultsMap((prev) => {
                        const next = new Map(prev);
                        next.set(s.id, {
                            data: [],
                            points,
                            bounds,
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
                    const val = typeof state?.val === 'number' ? seriesValue(s, state.val as number) : null;
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
            // Captured before the closures below: TS drops the narrowing the guard above established
            // for the property itself once it is read inside a callback.
            const instance = s.historyInstance;
            const hasAbsWindow = typeof s.historyStart === 'number' && typeof s.historyEnd === 'number';
            const now = Date.now();
            // `total` = everything the adapter holds. Its length is unknown up front, so the window
            // is probed first and the fetch below is sized from the result.
            const isTotal = !hasAbsWindow && range === 'total';

            /**
             * Fetch and publish one series over a known window. `rangeMs` is the NOMINAL span the
             * step and delta bucket are chosen from — for a pinned day window that is the full day
             * even once `end` has been clamped to now, so the resolution doesn't drift through the day.
             */
            const fetchWindow = (start: number, end: number, rangeMs: number) => {
                // `none` = raw points: skip bucketing so the adapter returns the actual logged
                // values instead of per-bucket averages.
                const wantRaw = s.aggregate === 'none';
                const isDelta = s.aggregate === 'delta';
                const bucket = resolveDeltaBucket(s.deltaBucket, rangeMs);
                const step = isDelta
                    ? deltaFetchStep(bucket, rangeMs)
                    : wantRaw
                      ? undefined
                      : hasAbsWindow || isTotal || range === 'custom'
                        ? getStepForMs(rangeMs)
                        : RANGE_STEP[range];
                // Delta needs one bucket of run-up before the window: the first visible bar is the
                // difference against the reading the counter had when the window opened. A `total`
                // window has nothing before it — bucketDeltas then differences the first bucket
                // against its own lowest reading, which is what "since recording started" means.
                const deltaWindowStart = isDelta ? bucketStart(start, bucket) : start;
                const fetchStart = isDelta ? prevBucketStart(start, bucket) : start;

                getHistoryDirect(s.datapointId, {
                    instance,
                    start: fetchStart,
                    end,
                    step,
                    // `delta` never reaches the adapter — it is differenced client-side. An hourly
                    // step comes back as `max`, a counter's reading at the step's end, with any
                    // sub-hour glitch already swallowed by the aggregation. Once the step is a whole
                    // day it can contain an entire reset cycle of a day counter, and only the extra
                    // low row of a `minmax` fetch makes that reset visible to `bucketDeltas` (#545).
                    // Spelled out rather than reusing `isDelta`, so the else branch keeps the
                    // narrowing that drops `delta` from the adapter's aggregate union.
                    aggregate:
                        s.aggregate === 'delta'
                            ? (step ?? 0) >= 86_400_000
                                ? 'minmax'
                                : 'max'
                            : step
                              ? (s.aggregate ?? 'average')
                              : 'none',
                    count: isDelta ? deltaFetchCount(step as number, rangeMs) : 1000,
                })
                    .then((entries: HistoryEntry[]) => {
                        if (!mountedRef.current) return;
                        let data: [number, number][] = entries
                            .filter(
                                (e): e is { ts: number; val: number; ack?: boolean; q?: number } =>
                                    typeof e.val === 'number',
                            )
                            // Converted here, at the single point every downstream path flows through:
                            // the plotted points, the delta bucketing and the "current" value all
                            // derive from `data` (issue #540).
                            .map((e): [number, number] => [e.ts, seriesValue(s, e.val as number)])
                            .sort((a, b) => a[0] - b[0]);

                        if (isDelta) {
                            const { points, lastBucket, lastBase } = bucketDeltas(data, bucket, deltaWindowStart);
                            // Same edge trim as below, but applied to the finished bars: the run-up
                            // bucket has already served its purpose as the difference baseline.
                            const bars = hasAbsWindow
                                ? points.filter(
                                      (p) => p[0] >= (s.historyStart as number) && p[0] < (s.historyEnd as number),
                                  )
                                : points;
                            if (lastBucket !== null && lastBase !== null) {
                                deltaBaseRef.current.set(s.id, {
                                    bucket: lastBucket,
                                    base: lastBase,
                                    unit: bucket,
                                });
                            } else {
                                deltaBaseRef.current.delete(s.id);
                            }
                            setResultsMap((prev) => {
                                const next = new Map(prev);
                                // "Current" is the latest bucket's consumption, not the counter reading.
                                next.set(s.id, {
                                    data: bars,
                                    current: bars.length > 0 ? bars[bars.length - 1][1] : null,
                                    loading: false,
                                });
                                return next;
                            });
                            return;
                        }

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
                            const liveVal = typeof state?.val === 'number' ? seriesValue(s, state.val as number) : null;
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
            };

            if (isTotal) {
                // Probe first, then fetch the discovered window. A probe that finds nothing falls
                // back to the floor, which simply yields an empty chart — same as any other window
                // without records.
                probeHistoryStart(s.datapointId, instance, now).then((first) => {
                    if (!mountedRef.current) return;
                    const start = first ?? now - TOTAL_FLOOR_MS;
                    fetchWindow(start, now, now - start);
                });
                return;
            }

            const rangeMs = hasAbsWindow ? (s.historyEnd as number) - (s.historyStart as number) : getRangeMs(s);
            const end = hasAbsWindow ? Math.min(s.historyEnd as number, now) : now;
            fetchWindow(hasAbsWindow ? (s.historyStart as number) : end - rangeMs, end, rangeMs);
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
                        const bounds = parseJsonAxisBounds(state.val, s);
                        setResultsMap((prev) => {
                            const next = new Map(prev);
                            next.set(s.id, {
                                data: [],
                                points,
                                bounds,
                                current: points.length > 0 ? points[points.length - 1].value : null,
                                loading: false,
                            });
                            return next;
                        });
                    });
                }
                if (s.aggregate === 'delta') {
                    // A delta series' points are per-bucket differences — appending the raw counter
                    // reading would spike the chart. Only the still-open trailing bar can grow, and
                    // only while the update still falls into its bucket; once the counter rolls into
                    // the next bucket the base is stale and the next refetch takes over.
                    return subscribe(s.datapointId, (state: ioBrokerState) => {
                        if (typeof state.val !== 'number') return;
                        // The unit comes from the fetch that filled the bar, not from a second
                        // resolution here — an `auto`/`total` series would otherwise disagree with it
                        // and silently stop growing the trailing bar.
                        const info = deltaBaseRef.current.get(s.id);
                        if (!info || bucketStart(state.ts, info.unit) !== info.bucket) return;
                        // `info.base` came out of already-converted history, so the live reading has
                        // to be converted too before the two are differenced.
                        const diff = Math.max(0, seriesValue(s, state.val as number) - info.base);
                        setResultsMap((prev) => {
                            const existing = prev.get(s.id);
                            if (!existing || existing.loading || existing.data.length === 0) return prev;
                            const last = existing.data[existing.data.length - 1];
                            // Adapters re-write unchanged values on every poll — bail out of the
                            // re-render when the bar wouldn't move.
                            if (last[0] !== info.bucket || last[1] === diff) return prev;
                            const data: [number, number][] = [...existing.data.slice(0, -1), [info.bucket, diff]];
                            const next = new Map(prev);
                            next.set(s.id, { data, current: diff, loading: false });
                            return next;
                        });
                    });
                }
                return subscribe(s.datapointId, (state: ioBrokerState) => {
                    if (typeof state.val !== 'number') return;
                    const val = seriesValue(s, state.val as number);
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
