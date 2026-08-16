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
