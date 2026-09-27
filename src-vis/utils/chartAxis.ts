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
 * Value-to-text mapping of a series (issue #718), typed as `0=An; 1=Aus`: entries split at `;` or a
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
 * Value texts a datapoint declares itself in `common.states` (issue #718) — either an object
 * (`{"0":"Aus","1":"An"}`, `{"true":"An","false":"Aus"}`) or the legacy string form
 * (`0:Aus;1:An`). Only numeric keys count: the chart plots numbers, a key like `HEAT` has no place
 * on its axis.
 */
export function parseCommonStates(states: unknown): Map<number, string> {
    const map = new Map<number, string>();
    const add = (rawKey: string, label: unknown) => {
        const k = rawKey.trim().toLowerCase();
        const key = k === 'true' ? 1 : k === 'false' ? 0 : k === '' ? NaN : Number(k);
        const text = typeof label === 'string' || typeof label === 'number' ? String(label).trim() : '';
        if (Number.isFinite(key) && text) map.set(key, text);
    };
    if (typeof states === 'string') {
        for (const entry of states.split(';')) {
            const colon = entry.indexOf(':');
            if (colon > 0) add(entry.slice(0, colon), entry.slice(colon + 1));
        }
    } else if (states && typeof states === 'object' && !Array.isArray(states)) {
        for (const [k, v] of Object.entries(states as Record<string, unknown>)) add(k, v);
    }
    return map;
}

/**
 * The texts an AXIS can carry: those of its series, when every series on it has texts and they all
 * agree. "Heizung An/Aus" next to "Fenster offen/zu" on one axis cannot label the same tick twice —
 * the axis then shows numbers, while tooltip and current value keep each series' own texts.
 */
export function axisValueLabels<S extends AxisSeries>(
    series: S[],
    axis: 0 | 1,
    labelsOf: (s: S) => Map<number, string>,
): Map<number, string> {
    const maps = series.filter((s) => on(s, axis)).map(labelsOf);
    if (maps.length === 0 || maps.some((m) => m.size === 0)) return new Map();
    const key = (m: Map<number, string>) => JSON.stringify([...m.entries()].sort((a, b) => a[0] - b[0]));
    const first = key(maps[0]);
    return maps.every((m) => key(m) === first) ? maps[0] : new Map();
}

/**
 * Does this axis carry nothing but booleans (issue #718)? Then it spans exactly 0…1 in one step,
 * instead of echarts' 0.2 grid. `isBool` decides per series — see the widget for what counts.
 */
export function axisIsBoolean<S extends AxisSeries>(series: S[], axis: 0 | 1, isBool: (s: S) => boolean): boolean {
    const onAxis = series.filter((s) => on(s, axis));
    return onAxis.length > 0 && onAxis.every(isBool);
}
