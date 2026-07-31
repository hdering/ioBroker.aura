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

/** Uniform spacing inside a group: margin between children AND the inset from the
 *  group edge on every side. Matches the classic p-1 (4px) grid inset. */
export const GROUP_GAP = 4;

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
    // Children at their nominal cellSize, GROUP_GAP between them and GROUP_GAP
    // inset top+bottom, plus the widget border (1px each side).
    const gridAreaPx = maxBottom * cellSize + (maxBottom - 1) * GROUP_GAP + 2 * GROUP_GAP;
    const contentPx = titleBarH + gridAreaPx + 2;
    // Smallest whole row count that covers the content: P(h) = h*cellSize +
    // (h-1)*margin, so h = ceil((content+margin)/pitch) gives P(h) >= contentPx.
    return Math.max(1, Math.ceil((contentPx + margin) / (cellSize + margin)));
}
