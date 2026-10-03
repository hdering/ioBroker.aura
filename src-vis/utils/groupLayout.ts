import type { WidgetConfig } from '../types';
import { usesContentAutoHeight } from './autoHeight';

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

/**
 * Group children with "Höhe automatisch an Inhalt anpassen" (#741): the child
 * reports its content px to autoHeightStore like on the tab, and its row count on
 * the group's inner grid is derived from that instead of the stored gridPos.h.
 * Every place that lays the children out or sizes the group box (GroupWidget,
 * Dashboard's hug, the group panel's fit) runs on these derived rows, so the
 * group grows and shrinks with the list. Without a measurement yet (first paint,
 * popup cells, condition-hidden children) the stored h stays.
 *
 * @param children the group's children
 * @param heights  autoHeightStore.heights (child id → content px)
 * @param padding  widget padding (px) — the child's frame adds it top and bottom
 * @param cellSize outer grid row height (px)
 * @param margin   outer grid gap (px)
 */
export function withContentHeights(
    children: WidgetConfig[],
    heights: Record<string, number>,
    padding: number,
    cellSize: number,
    margin: number,
): WidgetConfig[] {
    let changed = false;
    const rowPx = groupRowHeight(cellSize, margin);
    const next = children.map((c) => {
        if (!usesContentAutoHeight(c)) return c;
        const px = heights[c.id];
        if (!px || px <= 0) return c;
        // Frame chrome: padding top+bottom plus the 1px border on each side. A
        // child of h rows is h·rowPx + (h-1)·GROUP_GAP tall.
        const total = px + padding * 2 + 2;
        const h = Math.max(1, Math.ceil((total + GROUP_GAP) / (rowPx + GROUP_GAP)));
        if (h === c.gridPos.h) return c;
        changed = true;
        return { ...c, gridPos: { ...c.gridPos, h } };
    });
    return changed ? next : children;
}

/**
 * The measured content heights of a group's children, keyed by child id — what
 * withContentHeights reads. Inside a device card (#743) each child measures under
 * its per-card runtime id (`${scope}~${id}`), so the map is re-keyed for it.
 */
export function heightsForScope(
    children: WidgetConfig[],
    heights: Record<string, number>,
    scope: string | null | undefined,
): Record<string, number> {
    if (!scope) return heights;
    const out: Record<string, number> = {};
    for (const c of children) {
        const px = heights[`${scope}~${c.id}`];
        if (px !== undefined) out[c.id] = px;
    }
    return out;
}
