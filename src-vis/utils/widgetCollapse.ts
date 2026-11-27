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
    /** Editor: folds only when the widget also opts in via `collapseInEditor`. */
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
 * True when this widget folds in the current context. In the editor the content
 * has to stay reachable, so the widget stays open there unless it also carries
 * `collapseInEditor` — then the editor shows the same header row and a click on it
 * opens the content for editing (session only, the stored height is untouched).
 * A widget that fills its tab has nothing below it to move up.
 */
export function collapsibleWidget(
    type: string,
    options: Record<string, unknown> | undefined,
    ctx: CollapseContext,
): boolean {
    if (!supportsCollapse(type)) return false;
    if (options?.defaultCollapsed !== true) return false;
    if (options?.fillTab) return false;
    if (ctx.inGroup || ctx.fullscreen || ctx.probe) return false;
    if (ctx.editMode && options?.collapseInEditor !== true) return false;
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
 * Vertical padding of the folded card. The full widget padding (16 px by default)
 * made a folded card three grid rows tall while a folded group — whose header
 * carries 10 px above and below — fits in two; the folded card takes the group's
 * measure so every collapsed widget is as slim as the group. It does NOT follow
 * the dashboard's widget padding downwards: a dense board (padding 0–6) folded the
 * card onto the bare text row, which left the corner buttons hanging out of the
 * card (#676 follow-up). Horizontal padding stays the widget's, so the header row
 * aligns with the title of an open card.
 */
export const COLLAPSED_PAD_Y = 10;

export function collapsedPadY(): number {
    return COLLAPSED_PAD_Y;
}

/**
 * Smallest folded card, in px: the corner buttons (edit chrome, fold button) sit
 * 6 px inside the corner and are 28 px tall, so anything flatter than this lets
 * them spill over the card edge onto the widget below.
 */
export const COLLAPSED_MIN_PX = 40;

/**
 * Grid rows a collapsed (non-group) widget occupies: the measured header row plus
 * the card's reduced vertical padding (collapsedPadY) and border, never below the
 * corner buttons' own height, rounded up to whole rows. Same arithmetic as the
 * content auto-height path in Dashboard, so the two never disagree. Pass the
 * vertical padding actually applied.
 */
export function collapsedRows(headerPx: number, padY: number, cellSize: number, margin: number): number {
    const total = Math.max(headerPx + padY * 2 + 2, COLLAPSED_MIN_PX);
    return Math.max(1, Math.ceil((total + margin) / (cellSize + margin)));
}

/** Fallback header height (px) until the frame has measured its own row. */
export const COLLAPSED_HEADER_FALLBACK_PX = 20;

export type CollapsePosition = FullscreenPosition;

/**
 * Slot of the fold button in its corner (0 = outermost, see cornerInset). In the
 * frontend it steps behind the fullscreen button when both share a corner. In the
 * editor the top-right corner belongs to the edit chrome (two buttons) and the
 * bottom-right to the grid's resize handle, so the button steps past those.
 */
export function collapseButtonSlot(
    pos: CollapsePosition,
    ctx: { editMode: boolean; fullscreenSameCorner: boolean },
): number {
    if (ctx.editMode) return pos === 'tr' ? 2 : pos === 'br' ? 1 : 0;
    return ctx.fullscreenSameCorner ? 1 : 0;
}

/** Corner of the fold button while the widget is expanded; same ladder as the fullscreen button. */
export function collapsePosition(options: Record<string, unknown> | undefined): CollapsePosition {
    const raw = options?.collapsePosition;
    return (FULLSCREEN_POSITIONS as readonly string[]).includes(raw as string) ? (raw as CollapsePosition) : 'tr';
}

// ── Link groups (issue #1038) ────────────────────────────────────────────────
// Collapsible widgets with the same `collapseGroup` name react to each other:
// `collapseGroupMode: 'exclusive'` (default) folds every other member when one
// opens — at most one open at a time, like an accordion; `'together'` opens and
// folds the whole group at once. The mode of the widget the user tapped decides.
// Only mounted, collapsible members take part (they register in the collapse
// store), so a widget without a group or one that does not fold is never touched.

export type CollapseGroupMode = 'exclusive' | 'together';

export interface CollapseLink {
    group: string;
    mode: CollapseGroupMode;
}

/** The widget's link group, or null when it has none (blank name = none). */
export function collapseLink(options: Record<string, unknown> | undefined): CollapseLink | null {
    const raw = options?.collapseGroup;
    const group = typeof raw === 'string' ? raw.trim() : '';
    if (!group) return null;
    return { group, mode: options?.collapseGroupMode === 'together' ? 'together' : 'exclusive' };
}

/**
 * Collapsed map after the user toggled `id`: the widget flips, and the members of
 * its link group follow the group mode. Returns a new map; untouched entries keep
 * their identity.
 */
export function applyCollapseToggle(
    collapsed: Record<string, boolean>,
    links: Record<string, CollapseLink>,
    id: string,
): Record<string, boolean> {
    const next = !collapsed[id];
    const out: Record<string, boolean> = { ...collapsed, [id]: next };
    const link = links[id];
    if (!link) return out;
    for (const [other, l] of Object.entries(links)) {
        if (other === id || l.group !== link.group) continue;
        if (link.mode === 'together') out[other] = next;
        else if (!next) out[other] = true;
    }
    return out;
}

/** Same link (or both none) — lets the store skip a no-op registration. */
export function sameCollapseLink(a: CollapseLink | null | undefined, b: CollapseLink | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    return a.group === b.group && a.mode === b.mode;
}
