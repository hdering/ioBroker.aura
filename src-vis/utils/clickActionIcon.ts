/**
 * The click-action icon of a widget (issue #702): a small button that shows a widget
 * has a click action and runs it on a tap.
 *
 * It grew out of the embed action button (issue #527). An iframe-bodied widget
 * swallows every click in its foreign document, so there the button is the only way
 * to reach the action and is always shown. Every other widget shows it when the user
 * set a click action on the widget itself; the admin's per-type popup defaults and the
 * built-in fallback do not bring it along unless `clickActionIcon` is set to true —
 * otherwise every lamp with a type popup would sprout an icon after an update.
 *
 * Pure logic, kept out of WidgetFrame so it is testable without a browser
 * (tools/tests/click-action-icon-logic.mjs).
 */
import type { ClickAction } from '../types';
import { DEFAULT_FULLSCREEN_POSITION, FULLSCREEN_POSITIONS, type FullscreenPosition } from './fullscreenButton';

/** Same three corners as the fullscreen and fold buttons, sharing their ladder. */
export type ClickActionIconPosition = FullscreenPosition;

/** True when the widget carries a click action of its own (not a type default). */
export function hasOwnClickAction(options: Record<string, unknown> | undefined): boolean {
    const action = options?.clickAction as ClickAction | undefined;
    return !!action && action.kind !== 'none';
}

/**
 * Whether the frame renders the icon.
 *   hasClickAction – the resolved action (all three levels) is not 'none'
 *   embed          – the body is a foreign document that needs the button (#527)
 */
export function clickActionIconEnabled(
    options: Record<string, unknown> | undefined,
    ctx: { hasClickAction: boolean; embed: boolean },
): boolean {
    if (!ctx.hasClickAction) return false;
    if (ctx.embed) return true;
    const flag = options?.clickActionIcon;
    if (flag === false) return false;
    if (flag === true) return true;
    return hasOwnClickAction(options);
}

export function clickActionIconPosition(options: Record<string, unknown> | undefined): ClickActionIconPosition {
    const raw = options?.clickActionIconPosition;
    return (FULLSCREEN_POSITIONS as readonly string[]).includes(raw as string)
        ? (raw as ClickActionIconPosition)
        : DEFAULT_FULLSCREEN_POSITION;
}

/**
 * Slot of the icon in its corner (0 = outermost). It is always the innermost
 * occupant: it steps inwards once for the frame's fullscreen button and once for
 * the fold button when either shares its corner, and once more top-right for the
 * iframe widget's own fullscreen button.
 */
export function clickActionIconSlot(
    pos: ClickActionIconPosition,
    occupants: { iframeOwnFullscreen: boolean; fullscreenSameCorner: boolean; collapseSameCorner: boolean },
): number {
    return (
        (occupants.iframeOwnFullscreen && pos === 'tr' ? 1 : 0) +
        (occupants.fullscreenSameCorner ? 1 : 0) +
        (occupants.collapseSameCorner ? 1 : 0)
    );
}
