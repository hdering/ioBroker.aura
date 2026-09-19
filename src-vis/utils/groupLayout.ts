// Shared layout math for group widgets.
//
// A group's children live on the outer grid pitch, but the group also wants a
// small uniform inset on all four sides and the same gap between children. Since
// any fixed inset would round the outer box up a whole row (children are exactly
// one pitch tall), the children are instead scaled to fill the box (see
// GroupWidget's `fillRowHeight`) with GROUP_GAP used as both the RGL margin and
// containerPadding. `groupRows` picks the smallest outer-grid row count that still
// covers the group's natural content, so the fill only nudges children a little —
// and never has to squash them, which in the editor (fixed child pitch, no fill)
// would clip the last row and raise the group's inner scrollbar.
//
// Row parity (#680): one grid row is worth the same pixels inside a group as on
// the tab. With GROUP_GAP between the children instead of the outer margin, a
// child spanning h rows used to lose (h-1)·(margin-GROUP_GAP) px against the same
// widget outside — 12 px for a 3-row card on the default grid — so content that
// fit on the tab was cut off inside a group, and the loss grew with the outer gap.
// `groupRowHeight` folds that difference into the row: a child is now exactly
// (margin-GROUP_GAP) px taller than outside, for every h, and never smaller.
//
// The hug is a floor, not a fixed height. A gridPos.h stored above it is the
// user's stretch (the group was dragged taller in the editor so the children get
// more room); Dashboard honours it in both views and the fill spreads the extra
// rows evenly over the children.

/** Uniform spacing inside a group: margin between children AND the inset from the
 *  group edge on every side. Matches the classic p-1 (4px) grid inset. */
export const GROUP_GAP = 4;

/**
 * Nominal row height of a filled group's inner grid — the pitch the children are
 * measured on before the fill rounds them up to the outer box.
 *
 * A child spanning h rows must never end up shorter than the same widget on the
 * tab grid, h·cellSize + (h-1)·margin. The inner grid keeps GROUP_GAP between the
 * rows, so the missing (margin - GROUP_GAP) is added to every row instead. Grids
 * whose margin is below GROUP_GAP keep the plain cell size: there the 4 px pitch
 * is already the wider one.
 */
export function groupRowHeight(cellSize: number, margin: number): number {
    return cellSize + Math.max(0, margin - GROUP_GAP);
}

/**
 * Outer-grid row count for a group box that hugs its children.
 *
 * @param maxBottom  lowest child edge in grid rows (max of y + h)
 * @param hasHeader  whether the group renders a header bar
 * @param titled     whether that header shows a title (37px vs 36px bar)
 * @param cellSize   outer grid row height (px)
 * @param margin     outer grid gap (px)
 * @param measuredHeaderPx  actual header height reported by the rendered group
 *                   (autoHeightStore.groupHeaders). The 36/37px fallback below is
 *                   only a guess — a bar with a 20px icon or a master control is
 *                   taller, and being a few px short shows the inner scrollbar.
 */
export function groupRows(
    maxBottom: number,
    hasHeader: boolean,
    titled: boolean,
    cellSize: number,
    margin: number,
    measuredHeaderPx?: number,
): number {
    if (maxBottom <= 0) return 1;
    const titleBarH =
        measuredHeaderPx !== undefined && measuredHeaderPx >= 0 ? measuredHeaderPx : hasHeader ? (titled ? 37 : 36) : 0;
    // Children on the parity pitch (groupRowHeight), GROUP_GAP between them and
    // GROUP_GAP inset top+bottom, plus the widget border (1px each side).
    const gridAreaPx = maxBottom * groupRowHeight(cellSize, margin) + (maxBottom - 1) * GROUP_GAP + 2 * GROUP_GAP;
    const contentPx = titleBarH + gridAreaPx + 2;
    // Smallest whole row count that covers the content: P(h) = h*cellSize +
    // (h-1)*margin, so h = ceil((content+margin)/pitch) gives P(h) >= contentPx.
    return Math.max(1, Math.ceil((contentPx + margin) / (cellSize + margin)));
}
