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

/**
 * Shortest a bucket ever gets, in ms — the band echarts reserves around a bar.
 *
 * Unlike `bucketAxisMinInterval` this is about the DATA, not the ticks: a weekly bar spans a week
 * even though its ticks are day-aligned. Calendar buckets vary in length (February, a leap year,
 * the 23-hour DST day), and echarts sizes the band from the shortest gap it sees, so the shortest
 * form of each unit is the one to take.
 */
export function bucketBandMs(bucket: ChartBucket): number {
    if (bucket === 'year') return 365 * 86_400_000;
    if (bucket === 'month') return 28 * 86_400_000;
    if (bucket === 'week') return 7 * 86_400_000;
    if (bucket === 'day') return 86_400_000;
    return 3_600_000;
}

/**
 * `xAxis.max` for a rolling bucketed chart, so its axis ends at the newest point (issue #598).
 *
 * As soon as a bar series is on a time axis, echarts reserves half a band at BOTH ends so the
 * outermost bars are not cut in half. On the left the leading delta bar sits in that reserve. On
 * the right nothing does — the newest bar is stamped at the START of the bucket that is still
 * running — so the axis ran on half a bucket past the last point and the chart looked like it
 * carried on past its own data.
 *
 * The reserve cannot be switched off, and it is added on top of an explicit `max` rather than
 * instead of it. So the value returned here is the axis end MINUS the reserve, which echarts then
 * adds back: the axis lands exactly where it is wanted.
 *
 * `pad` is the room the newest marker and its value label need to be drawn rather than clipped.
 * Taken as a share of the plotted span it comes to the same handful of pixels at every range.
 *
 * `lastBucket` is the newest bar. Right after a bucket edge (a "24 h" chart at 08:03) the newest
 * point is only minutes past it, and trimming to that point would slice the bar in half — so the
 * bar's own reserve is the floor.
 */
export function bucketAxisMax(dataMin: number, dataMax: number, lastBucket: number, bucket: ChartBucket): number {
    const pad = Math.max(0, (dataMax - dataMin) / 60);
    return Math.max(dataMax + pad - bucketBandMs(bucket) / 2, lastBucket);
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
