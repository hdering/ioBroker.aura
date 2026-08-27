/**
 * Y-axis rules of the advanced chart that depend on WHAT is plotted, not on how it looks.
 *
 * Both were reported together (issue #594): a series drawn below the zero line had no zero line to
 * hang from, and a chart whose series all sat on the right axis had no horizontal grid lines at all.
 */

/** The bits of a series these rules read. */
export interface AxisSeries {
    yAxisIndex?: 0 | 1;
    stack?: boolean;
    chartType?: string;
    aggregate?: string;
}

const on = (s: AxisSeries, axis: 0 | 1) => (s.yAxisIndex ?? 0) === axis;

/** Does anything at all hang on this axis? */
export function axisHasSeries(series: AxisSeries[], axis: 0 | 1): boolean {
    return series.some((s) => on(s, axis));
}

/**
 * Must this axis keep zero in view?
 *
 * A BAR is read from the zero line — its length IS the value. Let the axis start at the smallest
 * bar and a chart of 20…25 kWh draws its 21 as a fifth of its 25, and a series drawn downwards
 * (value factor ×−1) loses its baseline entirely: the axis ends at the smallest bar and the zero
 * line leaves the plot with it. A stack says "these parts add up to that whole", which only reads
 * from zero for the same reason.
 *
 * A LINE is the other way round: fitting it to its own range is what makes it readable — a curve
 * at 200–250 forced to include zero sits squashed against the top edge. So a pure line/area/
 * scatter axis keeps its free scale.
 *
 * `delta` ("Verbrauch") is always drawn as bars, whatever the stored chart type says.
 */
export function axisIsZeroBased(series: AxisSeries[], axis: 0 | 1): boolean {
    return series.some((s) => on(s, axis) && (s.stack || s.chartType === 'bar' || s.aggregate === 'delta'));
}

/**
 * Which axis draws the horizontal grid lines.
 *
 * Only ONE may: two sets at different scales cross-hatch the plot. The left axis owns them, which
 * is right until every series sits on the right one — an axis with no series has no extent to space
 * lines over, and echarts then draws none at all rather than falling back to the other axis.
 */
export function gridLineAxis(series: AxisSeries[]): 0 | 1 {
    return axisHasSeries(series, 0) || !axisHasSeries(series, 1) ? 0 : 1;
}
