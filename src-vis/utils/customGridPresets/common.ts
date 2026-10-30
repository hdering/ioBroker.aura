import type { CustomCell, CustomCellAlign } from '../../types';
import type { GridBuilder } from './gridBuilder';

export type Opts = Record<string, unknown>;

// Pixel sizes of the Tailwind steps the standard layouts use (at font scale 1).
export const FS = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 } as const;

// Colours a widget hands to its custom grid as CSS variables (CustomGridView
// `cssVars`). A preset cell refers to them instead of a fixed colour, so the
// state-dependent colour of the standard layout (on/off, threshold, heating …)
// carries over. The fallback keeps the cell readable in a widget without them.
export const STATE_COLOR = 'var(--aura-state-color, var(--accent))';
export const VALUE_COLOR = 'var(--aura-value-color, var(--text-primary))';
export const SECONDARY = 'var(--text-secondary)';
export const PRIMARY = 'var(--text-primary)';

// The coloured card face of the card layouts (gradient when active, outline in the
// state colour). The widget hands the current colours over as variables, the grid
// paints them through CustomGridDef.bg / borderColor and the cells' colours.
export const CARD = {
    bg: 'var(--aura-card-bg, var(--app-bg))',
    border: 'var(--aura-card-border, var(--aura-state-color, var(--accent)))',
    icon: 'var(--aura-card-icon, var(--aura-state-color, var(--accent)))',
    title: 'var(--aura-card-title, var(--text-primary))',
    label: 'var(--aura-card-label, var(--aura-state-color, var(--accent)))',
} as const;

export const showTitleOf = (o: Opts) => o.showTitle !== false;
export const showIconOf = (o: Opts) => o.showIcon !== false;

export function titleAlignOf(o: Opts): CustomCellAlign {
    const a = o.titleAlign as string | undefined;
    return a === 'center' || a === 'right' ? a : 'left';
}

export function titleCell(o: Opts, extra: Partial<CustomCell> = {}): CustomCell {
    return {
        type: 'title',
        fontSize: FS.xs,
        color: SECONDARY,
        align: titleAlignOf(o),
        valign: 'middle',
        ...extra,
    };
}

/**
 * Track of the icon column: the icon plus the cell's 2px padding on both sides. A
 * fixed width instead of 'auto' — a cell spanning the icon column and the next
 * one (the value under the title row) would otherwise widen both and push the
 * title away from the icon.
 */
export function iconCol(o: Opts, fallback = 20, extra = 0): string {
    return `${(Number(o.iconSize) || fallback) + 4 + extra}px`;
}

export function iconCell(extra: Partial<CustomCell> = {}): CustomCell {
    // allowOverflow: in a compact row the icon is taller than the content box and, like in
    // the standard layout, reaches into the widget padding instead of being clipped.
    return { type: 'component', componentKey: 'icon', align: 'left', valign: 'middle', allowOverflow: true, ...extra };
}

/** Battery / reach / window / lock DPs or own status symbols configured, and the badges not switched off? */
export function hasStatusBadges(o: Opts): boolean {
    if (o.showStatusBadges === false) return false;
    const items = Array.isArray(o.statusItems) && o.statusItems.length > 0;
    return !!(o.batteryDp || o.unreachDp || o.lockDp || o.windowDp || items);
}

/**
 * The standard layouts draw the status badges as an overlay in the bottom-right
 * corner. The grid has no overlay, so the badges take the bottom-right slot when
 * it is free, otherwise a narrow column of their own on the right — a row of their
 * own would push the bottom-aligned value of the layout upwards.
 */
export function addStatusBadges(b: GridBuilder, o: Opts) {
    if (!hasStatusBadges(o)) return;
    // allowOverflow: like the overlay, the badges may reach up out of a thin spacer row.
    const cell: CustomCell = {
        type: 'component',
        componentKey: 'status-badges',
        align: 'right',
        valign: 'bottom',
        allowOverflow: true,
    };
    const lastRow = b.rowCount - 1;
    if (!b.isFree(lastRow, b.colCount - 1)) b.appendColumn('auto');
    b.put(lastRow, b.colCount - 1, cell);
}

/** The card layouts' coloured bar on the left edge, spanning `rows` rows (component 'accent-bar'). */
export function accentBar(rows: number): CustomCell {
    return { type: 'component', componentKey: 'accent-bar', align: 'left', valign: 'middle', rowSpan: rows };
}

// Threshold colour if one matches, otherwise the state colour — the value of the
// minimal layouts that light up with the state (dimmer, …).
export const THRESHOLD_OR_STATE = 'var(--aura-threshold-color, var(--aura-state-color, var(--accent)))';

/** One component cell (centred unless `extra` says otherwise). */
export function comp(componentKey: string, extra: Partial<CustomCell> = {}): CustomCell {
    return { type: 'component', componentKey, align: 'center', valign: 'middle', ...extra };
}

/** One field cell. */
export function field(fieldKey: string, extra: Partial<CustomCell> = {}): CustomCell {
    return { type: 'field', fieldKey, valign: 'middle', ...extra };
}

/**
 * Height of a title row: as tall as the icon, like the layouts' flex row. An 'auto'
 * row adds the cells' 2px padding on top and bottom and pushes everything below
 * 4px down. Without an icon the row is as tall as the text-xs title line (16px).
 */
export function titleRowSize(o: Opts, fallback = 20): string {
    return showIconOf(o) ? `${Math.max(Number(o.iconSize) || fallback, 16)}px` : '16px';
}

/**
 * Empty row standing in for a flex gap of `px` between two stacked cells. Two cells
 * are 6px apart already (padding 2 + grid gap 2 + padding 2); the empty row adds
 * its own height plus one more grid gap.
 */
export function gapRow(b: GridBuilder, px: number) {
    if (px > 6) b.row(`${Math.max(0, px - 8)}px`, []);
}

/** The layouts' content position option (tl … br, see contentPositionClass) split into its axes. */
export function contentPosOf(
    pos: unknown,
    fallback: string | undefined,
): { v: 'between' | 'start' | 'center' | 'end'; h: CustomCellAlign | undefined } {
    const p = typeof pos === 'string' && /^[tcb][lcr]$/.test(pos) ? pos : fallback;
    if (!p) return { v: 'between', h: undefined };
    const v = p[0] === 't' ? 'start' : p[0] === 'c' ? 'center' : 'end';
    const h = p[1] === 'l' ? 'left' : p[1] === 'c' ? 'center' : 'right';
    return { v, h };
}
