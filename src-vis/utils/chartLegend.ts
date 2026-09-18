// Echarts lays a horizontal legend out itself and wraps it onto as many rows as it needs, but it
// never tells the grid about it — a chart with several series drew its second legend row straight
// over the plot (issue #673). These are the numbers `LegendView`/`boxLayout` use, so we can count
// the rows up front and reserve exactly the room the legend is going to take.
const ITEM_WIDTH = 25; // legend.itemWidth
const ICON_TEXT_GAP = 5; // LegendView places the label at itemWidth + 5
const ITEM_GAP = 10; // legend.itemGap — between items and between rows
// legend.itemHeight. It is the tallest a row gets: a bar series shows a 14px roundRect, a line
// series only a thin line plus its 11px label. Reserving the tall variant for every row leaves a
// couple of pixels of air on a line-only chart and never lets the legend into the plot.
const ROW_HEIGHT = 14;
const PADDING = 5; // legend.padding
/** Where the legend itself sits — kept in sync with the `legend.top` the widget writes. */
export const LEGEND_TOP = 4;
/** Breathing room between the last legend row and the top of the grid. */
const CHART_GAP = 7;
/** Height one legend row costs the grid — one row plus the gap that follows it. */
export const LEGEND_ROW_STEP = ROW_HEIGHT + ITEM_GAP;

let ctx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, fontSize: number): number {
    if (ctx === undefined) {
        ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    }
    // No canvas (tests, SSR): a rough average advance width is still far better than assuming
    // everything fits on one row.
    if (!ctx) return text.length * fontSize * 0.55;
    ctx.font = `${fontSize}px sans-serif`;
    return ctx.measureText(text).width;
}

/**
 * Number of rows a horizontal legend of `names` needs inside `width` pixels.
 * Mirrors echarts' `boxLayout`: items are placed left to right, `itemGap` apart, and the next item
 * starts a new row as soon as it would cross the available width.
 */
export function legendRowCount(names: string[], width: number, fontSize = 11, measure = textWidth): number {
    const labels = names.filter((n) => !!n);
    if (!labels.length) return 0;
    const max = width - 2 * PADDING;
    if (!(max > 0)) return 1;
    let rows = 1;
    let x = 0;
    labels.forEach((name, i) => {
        const w = ITEM_WIDTH + ICON_TEXT_GAP + measure(name, fontSize);
        if (i > 0 && x + w > max) {
            rows++;
            x = w + ITEM_GAP;
        } else {
            x += w + ITEM_GAP;
        }
    });
    return rows;
}

/**
 * `grid.top` that clears the legend. With a single row this is the 30px the widget used to hard-code,
 * so charts that never wrapped keep their proportions.
 */
export function legendGridTop(
    names: string[],
    width: number,
    fallback: number,
    fontSize = 11,
    measure = textWidth,
): number {
    const rows = legendRowCount(names, width, fontSize, measure);
    if (!rows) return fallback;
    return LEGEND_TOP + PADDING + rows * ROW_HEIGHT + (rows - 1) * ITEM_GAP + CHART_GAP;
}
