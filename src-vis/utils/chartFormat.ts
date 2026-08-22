import { formatNum, type NumberFormat } from './formatValue';

/** Format a Y-axis tick value, optionally using compact notation (K/M/B). */
export function formatYTick(value: number, decimals: number, compact: boolean, format?: NumberFormat): string {
    if (!compact) return formatNum(value, decimals, format);
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e9) {
        const n = abs / 1e9;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}B`;
    }
    if (abs >= 1e6) {
        const n = abs / 1e6;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (abs >= 1e3) {
        const n = abs / 1e3;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return formatNum(value, decimals, format);
}

/** Calendar bucket a `delta` series is differenced over — mirrors `DeltaBucket` of the data hook. */
export type ChartBucket = 'hour' | 'day' | 'week' | 'month' | 'year';

const BUCKET_ORDER: ChartBucket[] = ['hour', 'day', 'week', 'month', 'year'];

/** The coarsest of the given buckets — the one the shared x axis has to be readable at. */
export function coarsestBucket(buckets: (ChartBucket | undefined)[]): ChartBucket | undefined {
    let best = -1;
    for (const b of buckets) {
        const idx = b ? BUCKET_ORDER.indexOf(b) : -1;
        if (idx > best) best = idx;
    }
    return best < 0 ? undefined : BUCKET_ORDER[best];
}

/**
 * Smallest tick spacing (ms) a bucketed time axis may use, so echarts places its ticks ON the
 * bucket grid: without it a two-bar yearly chart gets month ticks (Dec, Mar, Jun …) and not a
 * single one of them falls on a January.
 */
export function bucketAxisMinInterval(bucket: ChartBucket): number {
    if (bucket === 'year') return 365 * 86_400_000;
    if (bucket === 'month') return 28 * 86_400_000;
    if (bucket === 'week' || bucket === 'day') return 86_400_000;
    return 3_600_000;
}

/** Local calendar granularity of a timestamp: `year` = exactly Jan 1st 00:00, and so on. */
function tsUnit(d: Date): ChartBucket | 'sub-hour' {
    if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) return 'sub-hour';
    if (d.getHours()) return 'hour';
    if (d.getDate() !== 1) return 'day';
    return d.getMonth() === 0 ? 'year' : 'month';
}

/**
 * X-axis label for one tick of a bucketed (`delta`) chart — `''` for a tick that is not on the
 * bucket grid (issue #570).
 *
 * A time axis labels every tick by the granularity of its own value, and echarts adds two ticks
 * of its own at the axis extremes — the bar padding around the outermost bar, a day or two off
 * the grid. Yearly bars therefore read "31 | 2026 | 2": the year plus the day numbers of the
 * padding. Anything below the bucket says nothing about a bar and is dropped.
 */
export function bucketAxisLabel(ts: number, bucket: ChartBucket, locale: string): string {
    const d = new Date(ts);
    const unit = tsUnit(d);
    const rank = (u: ChartBucket | 'sub-hour') => (u === 'sub-hour' ? -1 : BUCKET_ORDER.indexOf(u));
    // A week bucket has no unit of its own — its bars start at midnight, like a day's.
    const needed = bucket === 'week' ? 'day' : bucket;
    if (rank(unit) < rank(needed)) return '';
    if (bucket === 'year') return String(d.getFullYear());
    if (bucket === 'month') {
        const month = d.toLocaleDateString(locale, { month: 'short' });
        // January carries the year, so a multi-year window stays readable without a second row.
        return d.getMonth() === 0 ? `${month} ${d.getFullYear()}` : month;
    }
    if (bucket === 'hour' && unit !== 'hour') {
        // Midnight marks the day inside an hourly window, exactly as echarts does by default.
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    }
    if (bucket === 'hour') return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** Tooltip headline for one bar of a bucketed chart — the bucket, not the second it started at. */
export function bucketTooltipLabel(ts: number, bucket: ChartBucket, locale: string): string {
    const d = new Date(ts);
    if (bucket === 'year') return String(d.getFullYear());
    if (bucket === 'month') return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    if (bucket === 'week' || bucket === 'day') return d.toLocaleDateString(locale, { dateStyle: 'medium' });
    return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
