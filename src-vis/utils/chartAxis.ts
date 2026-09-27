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

/**
 * Value-to-text mapping of an axis (issue #718), typed as `0=An; 1=Aus`: entries split at `;` or a
 * line break, key and text at the first `=`. `true`/`false` stand for 1/0, and a decimal comma is
 * read as a point. Entries without a number or without a text are skipped.
 */
export function parseValueLabels(text: string | undefined): Map<number, string> {
    const map = new Map<number, string>();
    if (!text) return map;
    for (const entry of text.split(/[;\n]/)) {
        const eq = entry.indexOf('=');
        if (eq < 0) continue;
        const rawKey = entry.slice(0, eq).trim().toLowerCase();
        const label = entry.slice(eq + 1).trim();
        if (!rawKey || !label) continue;
        const key = rawKey === 'true' ? 1 : rawKey === 'false' ? 0 : Number(rawKey.replace(',', '.'));
        if (Number.isFinite(key)) map.set(key, label);
    }
    return map;
}

/**
 * Does this axis carry nothing but booleans (issue #718)? Then it spans exactly 0…1 in one step,
 * instead of echarts' 0.2 grid. `isBool` decides per series — see the widget for what counts.
 */
export function axisIsBoolean<S extends AxisSeries>(series: S[], axis: 0 | 1, isBool: (s: S) => boolean): boolean {
    const onAxis = series.filter((s) => on(s, axis));
    return onAxis.length > 0 && onAxis.every(isBool);
}
