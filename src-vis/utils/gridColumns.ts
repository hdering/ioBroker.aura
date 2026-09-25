/**
 * Column count and render width of the desktop grid (react-grid-layout).
 *
 * `fixed` (the classic behaviour): a column is always ≈ snapX px wide, so the
 * column count follows the container width. A window narrower than the design
 * scrolls horizontally, a wider one leaves empty space on the right.
 *
 * `fluid` (#413, opt-in): the column count is fixed to the design and the column
 * WIDTH follows the container, so the widgets always fill the window. Stored
 * positions stay untouched — only the drawing is stretched or squeezed. Heights
 * and gaps stay in px. Below `minScale` it stops squeezing and scrolls like the
 * fixed grid; above `maxScale` (0 = no cap) it stops stretching.
 */
export type GridWidthMode = 'fixed' | 'fluid';

export interface GridColumnsInput {
    mode: GridWidthMode;
    /** Width available to the grid, px. */
    width: number;
    snapX: number;
    gap: number;
    /** Highest column any widget of the section occupies (x + w). */
    usedCols: number;
    /** Fluid: design width in px; 0 = the width the section's content occupies. */
    designWidth?: number;
    /** Fluid: smallest factor the grid is squeezed to. */
    minScale?: number;
    /** Fluid: largest factor the grid is stretched to; 0 = no cap. */
    maxScale?: number;
}

export interface GridColumns {
    cols: number;
    /** Width handed to react-grid-layout; above `width` the scroller scrolls. */
    rglWidth: number;
    /** Rendered column pitch against the design pitch — 1 on the fixed grid. */
    scale: number;
    fluid: boolean;
}

/** Width in px a grid of `cols` columns takes at its design pitch. */
export const gridWidthPx = (cols: number, snapX: number, gap: number) => cols * (snapX + gap) + gap;

/** Columns that fit into `width` at the design pitch (floor 2). */
export const colsForWidth = (width: number, snapX: number, gap: number) =>
    Math.max(2, Math.floor((width - gap) / (snapX + gap)));

export function gridColumns(input: GridColumnsInput): GridColumns {
    const { width, snapX, gap } = input;
    const usedCols = Math.max(2, input.usedCols);

    if (input.mode === 'fluid' && width > 0) {
        const designWidth = input.designWidth ?? 0;
        // Never fewer columns than the content uses — nothing may be clamped.
        const cols = Math.max(usedCols, designWidth > 0 ? colsForWidth(designWidth, snapX, gap) : 0);
        const designPx = gridWidthPx(cols, snapX, gap);
        const minScale = Math.max(0, input.minScale ?? 0);
        const maxScale = Math.max(0, input.maxScale ?? 0);
        const fit = width / designPx;
        let scale = fit;
        if (minScale > 0 && scale < minScale) scale = minScale;
        if (maxScale > 0 && scale > maxScale) scale = Math.max(maxScale, minScale);
        // Unclamped the grid takes exactly the container width (no rounding drift).
        return { cols, rglWidth: scale === fit ? width : Math.round(designPx * scale), scale, fluid: true };
    }

    const cols = width > 0 ? colsForWidth(width, snapX, gap) : 12;
    const effectiveCols = Math.max(cols, usedCols);
    // When the content needs more columns than fit, RGL gets a wider virtual
    // width so the cells keep their design size and the scroller scrolls.
    const rglWidth = effectiveCols > cols ? gridWidthPx(effectiveCols, snapX, gap) : width;
    return { cols: effectiveCols, rglWidth, scale: 1, fluid: false };
}
