import type { WidgetConfig } from '../types';

/**
 * The narrow-screen "flow" layouts share one rule set: the phone stacks the tab's
 * widgets in ONE column ordered by `mobileOrder`, the tablet flows them into N
 * columns ordered by `tabletOrder`. Renderer (Dashboard) and editor panel
 * (AdminEditor's OrderPanel) must sort identically, so the rule lives here once.
 */
export type FlowMode = 'mobile' | 'tablet';

/** Grid position as a single sortable number — the order the desktop shows, read
 *  row by row. The fallback for a widget that was never arranged by hand. */
export const gridOrderValue = (w: Pick<WidgetConfig, 'gridPos'>) => w.gridPos.y * 1000 + w.gridPos.x;

/**
 * Sort key of a widget in the given flow. The tablet falls back to the MOBILE
 * order before the grid: a tablet column is a phone-width column, and the
 * collaborator on #413 asked for exactly that — arrange the mobile order once,
 * the tablet follows, and `tabletOrder` only exists to fine-tune on top.
 */
export function flowOrderValue(
    w: Pick<WidgetConfig, 'gridPos' | 'mobileOrder' | 'tabletOrder'>,
    mode: FlowMode,
): number {
    if (mode === 'tablet') return w.tabletOrder ?? w.mobileOrder ?? gridOrderValue(w);
    return w.mobileOrder ?? gridOrderValue(w);
}

export function sortForFlow<T extends Pick<WidgetConfig, 'gridPos' | 'mobileOrder' | 'tabletOrder'>>(
    widgets: readonly T[],
    mode: FlowMode,
): T[] {
    return [...widgets].sort((a, b) => flowOrderValue(a, mode) - flowOrderValue(b, mode));
}

/** Which field a flow mode is arranged by — the editor panel writes this one. */
export const flowOrderField = (mode: FlowMode): 'mobileOrder' | 'tabletOrder' =>
    mode === 'tablet' ? 'tabletOrder' : 'mobileOrder';

/** Columns the tab's widgets actually use on the desktop grid — the width a widget's
 *  share is measured against. Floor 2 so a lone widget never divides by one column. */
export function tabExtentOf(widgets: readonly Pick<WidgetConfig, 'gridPos'>[]): number {
    return Math.max(2, ...widgets.map((w) => w.gridPos.x + w.gridPos.w));
}

/**
 * Columns a widget spans in an N-column flow: its share of the tab's used width,
 * rounded to whole columns and clamped to [1, cols]. Half of the tab in a 2-column
 * flow is one column, the full width is both; two thirds rounds down to one so
 * "roughly half" widgets still pack side by side.
 */
export function flowSpan(w: Pick<WidgetConfig, 'gridPos'>, tabExtent: number, cols: number): number {
    if (cols <= 1) return 1;
    return Math.min(cols, Math.max(1, Math.round((w.gridPos.w / Math.max(1, tabExtent)) * cols)));
}

/**
 * Is a viewport inside the tablet band? The band exists only when the tablet
 * breakpoint lies above the mobile one; 0 switches it off. It is measured against
 * the VIEWPORT, not the dashboard's own box: the number a user configures is the
 * device width they read off the resolution overlay, and a docked section menu
 * must not shift it — 240 px of menu plus padding turned "768" into "switches at
 * 1024" (#413). The section menu decides its tablet placement by the same rule.
 */
export function tabletBandActive(
    viewportWidth: number,
    opts: { mobileBreakpoint: number; tabletBreakpoint: number },
): boolean {
    return viewportWidth > 0 && opts.tabletBreakpoint > opts.mobileBreakpoint && viewportWidth < opts.tabletBreakpoint;
}

/**
 * Which flow (if any) the dashboard renders. Mobile is decided by the dashboard's
 * container width, as it always was — a docked menu that leaves only phone width
 * gets the phone stack. The tablet band is decided by the viewport, see
 * tabletBandActive. In the editor the tablet band is skipped — the tablet layout
 * is derived, its order is arranged in a side panel, and the editor's preview
 * column is narrower than the window, so a 1024 px breakpoint would otherwise
 * turn most editors into a non-draggable flow.
 */
export function flowModeFor(
    widths: { container: number; viewport: number },
    opts: { mobileBreakpoint: number; tabletBreakpoint: number; editMode?: boolean },
): FlowMode | null {
    if (!(widths.container > 0)) return null;
    if (widths.container < opts.mobileBreakpoint) return 'mobile';
    if (!opts.editMode && tabletBandActive(widths.viewport, opts)) return 'tablet';
    return null;
}
