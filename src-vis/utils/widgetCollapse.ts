/**
 * Collapsible widgets (issue #676).
 *
 * Every widget may start collapsed: `options.defaultCollapsed` folds the card down
 * to a header row of icon + title, a tap on it expands the content and the widgets
 * below move up (the Dashboard shrinks the grid item, RGL compacts). The group
 * widget had this first and keeps drawing its own header (with the chevron in it);
 * for every other type the WidgetFrame renders the collapsed header and a corner
 * button to fold the widget again.
 *
 * Pure logic, kept out of WidgetFrame/Dashboard so the rules can be unit-tested
 * (tools/tests/widget-collapse-logic.mjs).
 */

import { FULLSCREEN_POSITIONS, type FullscreenPosition } from './fullscreenButton';

/**
 * Types that never collapse: the section title draws no card (nothing to fold to),
 * and a mirror follows whatever its source does.
 */
export const COLLAPSE_EXCLUDED_TYPES = new Set(['header']);

export function supportsCollapse(type: string): boolean {
    return !COLLAPSE_EXCLUDED_TYPES.has(type);
}

export interface CollapseContext {
    editMode: boolean;
    /** Child of a group: the group lays its children out on its own pitch, so a
     *  collapsed child would leave its cell empty instead of shrinking it. */
    inGroup?: boolean;
    /** Inside the fullscreen overlay — the whole point there is to see the content. */
    fullscreen?: boolean;
    /** Off-screen measurement probe. */
    probe?: boolean;
}

/**
 * True when this widget folds in the current context. Collapse is a frontend
 * feature: in the editor the content has to stay reachable, and a widget that
 * fills its tab has nothing below it to move up.
 */
export function collapsibleWidget(
    type: string,
    options: Record<string, unknown> | undefined,
    ctx: CollapseContext,
): boolean {
    if (!supportsCollapse(type)) return false;
    if (options?.defaultCollapsed !== true) return false;
    if (options?.fillTab) return false;
    if (ctx.editMode || ctx.inGroup || ctx.fullscreen || ctx.probe) return false;
    return true;
}

/**
 * Current collapsed state: the session toggle when the user has touched it,
 * otherwise the configured default (which is `true` — that is what makes the
 * widget collapsible in the first place).
 */
export function isCollapsedNow(collapsed: Record<string, boolean>, id: string): boolean {
    return collapsed[id] ?? true;
}

/**
 * Grid rows a collapsed (non-group) widget occupies: the measured header row plus
 * the card's own padding and border, rounded up to whole rows. Same arithmetic as
 * the content auto-height path in Dashboard, so the two never disagree.
 */
export function collapsedRows(headerPx: number, widgetPadding: number, cellSize: number, margin: number): number {
    const total = headerPx + widgetPadding * 2 + 2;
    return Math.max(1, Math.ceil((total + margin) / (cellSize + margin)));
}

/** Fallback header height (px) until the frame has measured its own row. */
export const COLLAPSED_HEADER_FALLBACK_PX = 20;

export type CollapsePosition = FullscreenPosition;

/** Corner of the fold button while the widget is expanded; same ladder as the fullscreen button. */
export function collapsePosition(options: Record<string, unknown> | undefined): CollapsePosition {
    const raw = options?.collapsePosition;
    return (FULLSCREEN_POSITIONS as readonly string[]).includes(raw as string) ? (raw as CollapsePosition) : 'tr';
}
