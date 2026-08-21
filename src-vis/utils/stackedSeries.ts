/**
 * Stacking support for the advanced chart (issue #541).
 *
 * ECharts stacks series by DATA INDEX, not by x value. On a category axis those are the same thing,
 * but the timeseries mode plots `[timestamp, value]` pairs and every series fetches its history on
 * its own — different bucket counts, timestamps a few seconds apart, gaps where nothing was logged.
 * Handing those arrays to ECharts unaligned stacks point 5 of A onto point 5 of B no matter which
 * moments those two belong to, and the sum silently becomes fiction.
 *
 * `alignStackedSeries` therefore resamples every series of a stack onto the union of their
 * timestamps before the stack is handed over.
 */

/** The bits of a series config that decide whether and where it stacks, and how it is drawn. */
export interface StackableSeries {
    stack?: boolean;
    yAxisIndex?: 0 | 1;
    chartType?: 'line' | 'bar' | 'area' | 'scatter';
    lineWidth?: number;
    stackOutline?: boolean;
    areaOpacity?: number;
}

/** A plotted point: `[timestamp, value]`, `null` where the series has nothing to show. */
export type StackPoint = [number, number | null];

/**
 * ECharts `stack` id of a series, or `undefined` when it isn't stacked.
 *
 * Grouped by y axis on purpose: adding a value read against the left axis onto one read against
 * the right axis produces a number that means nothing, so each axis stacks for itself.
 */
export function stackIdFor(s: StackableSeries): string | undefined {
    return s.stack ? `aura-stack-${s.yAxisIndex ?? 0}` : undefined;
}

/**
 * Stroke width of a series' curve.
 *
 * A stacked area is read as a band, not as a curve: its outline runs along the top edge of the band
 * below it, so a series sitting at 0 draws a full-width line with nothing under it — it looks like a
 * series with data instead of one contributing nothing (issue #541 follow-up). Stacked bands are
 * therefore drawn without an outline unless `stackOutline` asks for one. The 0 itself stays in the
 * data, in the tooltip and in the stack total; only the line that made it look like a curve is gone.
 *
 * A stacked *line* keeps its stroke — there is no fill, so without it the series would vanish.
 */
export function outlineWidthFor(s: StackableSeries): number {
    if (s.stack && s.chartType === 'area' && !s.stackOutline) return 0;
    return s.lineWidth ?? 2;
}

/**
 * Fill opacity of an area series, 0–1.
 *
 * A stack is drawn opaque: its bands sit on top of each other and never overlap, so transparency
 * reveals nothing — it only mixes the series colour with the background, and the band ends up a
 * paler shade than the colour picked in the editor and shown in the legend (issue #557). An
 * unstacked area does overlap the series behind it and therefore stays a wash to see through.
 *
 * The series' own `areaOpacity` (percent, next to its colour in the editor) replaces both defaults.
 */
export function areaOpacityFor(s: StackableSeries): number {
    if (typeof s.areaOpacity === 'number' && Number.isFinite(s.areaOpacity)) {
        return Math.min(1, Math.max(0, s.areaOpacity / 100));
    }
    return s.stack ? 1 : 0.2;
}

/**
 * Value of a series at `ts`: the last point at or before it, `null` before the series starts.
 * `cursor` walks forward across calls, so a whole timeline costs one pass over the points.
 */
function valueAt(points: StackPoint[], ts: number, cursor: { i: number }): number | null {
    if (points.length === 0) return null;
    while (cursor.i + 1 < points.length && points[cursor.i + 1][0] <= ts) cursor.i++;
    // Only true while `ts` is still ahead of the very first point — nothing to carry forward yet.
    if (points[cursor.i][0] > ts) return null;
    return points[cursor.i][1];
}

/**
 * Resample the members of each stack onto their shared timeline.
 *
 * Series that don't stack, and stacks with a single member, are passed through untouched — there is
 * nothing to line them up with. Within a stack every series gets one point per timestamp any of them
 * logged; the value is the last one that series actually reported (a datapoint holds its value until
 * it changes, so carrying it forward is what the curve already implies). Timestamps before a series'
 * first record stay `null` rather than 0 — it had no value yet, and inventing a zero would add a
 * phantom floor to the stack.
 *
 * Expects each input series sorted by timestamp, which is how the history hook delivers them.
 */
export function alignStackedSeries(series: StackableSeries[], data: StackPoint[][]): StackPoint[][] {
    const groups = new Map<string, number[]>();
    series.forEach((s, idx) => {
        const id = stackIdFor(s);
        if (!id || !data[idx]) return;
        const g = groups.get(id);
        if (g) g.push(idx);
        else groups.set(id, [idx]);
    });

    const out = data.slice();

    for (const members of groups.values()) {
        if (members.length < 2) continue;

        const timeline = [...new Set(members.flatMap((idx) => data[idx].map((p) => p[0])))].sort((a, b) => a - b);
        if (timeline.length === 0) continue;

        for (const idx of members) {
            const points = data[idx];
            const cursor = { i: 0 };
            out[idx] = timeline.map((ts): StackPoint => [ts, valueAt(points, ts, cursor)]);
        }
    }

    return out;
}

/** A plotted value as the chart hands it over: `[timestamp, value]` on a time axis, a bare
 *  number on a category axis, `null` where the series has nothing to show. */
export type StackDatum = StackPoint | number | null;

/** The number behind a plotted value, `null` where the series has nothing at that index. */
function numberOf(p: StackDatum): number | null {
    const v = Array.isArray(p) ? p[1] : p;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Share each stacked value has of its stack's total, per series and data index, `0`–`1`
 * (issue #569).
 *
 * The share is `|value| / Σ|values of that stack at that index|`: taking magnitudes keeps the
 * shares of a stack adding up to 100 % even when one member went negative (a battery charging
 * against discharging bars), where a plain sum would blow the percentages past 100 or divide by
 * a near-zero total.
 *
 * `null` wherever a percentage would be a lie: a series that isn't stacked, an index the series
 * has no value at, a stack whose total is 0, and a stack with a single member — that one is
 * always 100 % of itself. Expects the data already aligned (`alignStackedSeries`), since
 * ECharts stacks by index and so does this.
 */
export function stackShares(series: StackableSeries[], data: StackDatum[][]): (number | null)[][] {
    const out: (number | null)[][] = series.map((_, idx) => (data[idx] ?? []).map(() => null));

    const groups = new Map<string, number[]>();
    series.forEach((s, idx) => {
        const id = stackIdFor(s);
        if (!id || !data[idx]) return;
        const g = groups.get(id);
        if (g) g.push(idx);
        else groups.set(id, [idx]);
    });

    for (const members of groups.values()) {
        if (members.length < 2) continue;
        const totals: number[] = [];
        for (const idx of members) {
            data[idx].forEach((p, i) => {
                const v = numberOf(p);
                if (v !== null) totals[i] = (totals[i] ?? 0) + Math.abs(v);
            });
        }
        for (const idx of members) {
            out[idx] = data[idx].map((p, i) => {
                const v = numberOf(p);
                const total = totals[i] ?? 0;
                return v === null || total === 0 ? null : Math.abs(v) / total;
            });
        }
    }

    return out;
}
