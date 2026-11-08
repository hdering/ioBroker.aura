/**
 * Reference lines of the advanced chart (issue #959): a horizontal line at a fixed value or at the
 * value of a datapoint (a setpoint, a limit), optionally widened into a band between two values.
 */

/** One reference line or band, configured in the "Linien" tab of "Datenpunkte verwalten". */
export interface EChartRefLine {
    id: string;
    /** Fixed value of the line. */
    value?: number;
    /** Datapoint whose value places the line — wins over `value`; empty or non-numeric falls back to it. */
    valueDp?: string;
    /** End of a band: with it the line becomes a shaded area from the value up to this one. */
    valueTo?: number;
    /** Datapoint for the band's end — wins over `valueTo`. */
    valueToDp?: string;
    /** Y axis the value is read against: 0 = left (default), 1 = right. Without series on the right it falls back to the left. */
    axis?: number;
    /** Colour, a token like 'var(--accent-red)' or a fixed value. Default a muted red. */
    color?: string;
    /** Stroke of the line. Default `dashed`. */
    lineType?: 'solid' | 'dashed' | 'dotted';
    /** Text at the right end of the line, e.g. "Soll". */
    label?: string;
    /** Append the current value (with the axis unit) to the text. */
    showValue?: boolean;
}

/** A line whose value is known — lines without one are not drawn. */
export interface ResolvedRefLine {
    line: EChartRefLine;
    /** Index into the configured list — the colour list is aligned to it. */
    index: number;
    axis: 0 | 1;
    from: number;
    /** Set for a band. */
    to?: number;
}

export const DEFAULT_REF_LINE_COLOR = '#ef4444';

/** A datapoint value as a number, or undefined when there is none. */
function num(v: unknown): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.trim().replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

/** Every datapoint the lines read — subscribed once by the widget. */
export function refLineDatapoints(lines: EChartRefLine[]): string[] {
    const ids = lines.flatMap((l) => [l.valueDp, l.valueToDp]).filter((id): id is string => !!id?.trim());
    return [...new Set(ids.map((id) => id.trim()))];
}

/**
 * The lines with their current values. A datapoint wins over the typed value — but an empty or
 * non-numeric one does not blank the line, the typed value stays the fallback.
 */
export function resolveRefLines(
    lines: EChartRefLine[],
    dpValue: (id: string) => unknown,
    hasRightAxis: boolean,
): ResolvedRefLine[] {
    const out: ResolvedRefLine[] = [];
    lines.forEach((line, index) => {
        const read = (dp: string | undefined, fixed: number | undefined) =>
            (dp?.trim() ? num(dpValue(dp.trim())) : undefined) ?? num(fixed);
        const from = read(line.valueDp, line.value);
        if (from === undefined) return;
        const to = read(line.valueToDp, line.valueTo);
        out.push({ line, index, axis: line.axis === 1 && hasRightAxis ? 1 : 0, from, to });
    });
    return out;
}

/**
 * One invisible scatter series per axis that carries the lines (markLine) and bands (markArea).
 *
 * A markLine alone does not count for the axis range: a limit at 25 °C over data up to 22 °C would
 * sit above the plot and never show. The carrier therefore holds the line values as points of size
 * zero at `x` (a timestamp, or category index 0), which pulls them into the axis' extent.
 *
 * `x` undefined (no data yet) leaves the points out — the lines still draw within the range.
 */
export function refLineCarriers(
    resolved: ResolvedRefLine[],
    x: number | undefined,
    colorOf: (r: ResolvedRefLine) => string,
    textOf: (r: ResolvedRefLine) => string,
): Record<string, unknown>[] {
    return ([0, 1] as const).flatMap((axis) => {
        const onAxis = resolved.filter((r) => r.axis === axis);
        if (onAxis.length === 0) return [];
        const label = (r: ResolvedRefLine, position: string) => {
            const text = textOf(r);
            return text
                ? { show: true, position, formatter: () => text, color: colorOf(r), fontSize: 10 }
                : { show: false };
        };
        const lines = onAxis.filter((r) => r.to === undefined);
        const bands = onAxis.filter((r) => r.to !== undefined);
        return [
            {
                type: 'scatter',
                name: '',
                yAxisIndex: axis,
                symbolSize: 0,
                silent: true,
                animation: false,
                tooltip: { show: false },
                data: x === undefined ? [] : onAxis.flatMap((r) => [r.from, r.to ?? r.from].map((v) => [x, v])),
                markLine: {
                    symbol: 'none',
                    silent: true,
                    animation: false,
                    data: lines.map((r) => ({
                        yAxis: r.from,
                        lineStyle: { color: colorOf(r), type: r.line.lineType ?? 'dashed', width: 1.5 },
                        label: label(r, 'insideEndTop'),
                    })),
                },
                markArea: {
                    silent: true,
                    animation: false,
                    data: bands.map((r) => [
                        {
                            yAxis: Math.min(r.from, r.to as number),
                            itemStyle: { color: colorOf(r), opacity: 0.12 },
                            label: label(r, 'insideTopRight'),
                        },
                        { yAxis: Math.max(r.from, r.to as number) },
                    ]),
                },
            },
        ];
    });
}

/** First x value of the plotted data — `[x, y]` pairs or `{ value: [x, y] }` items. */
export function firstX(dataLists: unknown[][]): number | undefined {
    for (const list of dataLists) {
        for (const item of list) {
            const pair = Array.isArray(item)
                ? item
                : item && typeof item === 'object' && Array.isArray((item as { value?: unknown }).value)
                  ? ((item as { value: unknown[] }).value as unknown[])
                  : null;
            if (pair && typeof pair[0] === 'number' && Number.isFinite(pair[0])) return pair[0];
        }
    }
    return undefined;
}
