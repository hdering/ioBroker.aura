/**
 * Placement rules for the frame-level fullscreen button (issue #644).
 *
 * Pure logic, kept out of WidgetFrame so the corner arithmetic can be unit-tested
 * (tools/tests/widget-fullscreen-logic.mjs) instead of eyeballed in a browser.
 */

export const FULLSCREEN_POSITIONS = ['tr', 'tl', 'br'] as const;
export type FullscreenPosition = (typeof FULLSCREEN_POSITIONS)[number];

export const DEFAULT_FULLSCREEN_POSITION: FullscreenPosition = 'tr';

/**
 * Widget types that already ship their own fullscreen control — iframe has the
 * `fullscreenButton` option, camera and echartsPreset open their own portal. A
 * second button beside those would only be confusing, and for the embedded
 * documents it would also start a second copy of the stream.
 */
export const FULLSCREEN_EXCLUDED_TYPES = new Set(['iframe', 'camera', 'echartsPreset']);

export function supportsFullscreenButton(type: string): boolean {
    return !FULLSCREEN_EXCLUDED_TYPES.has(type);
}

/** True when this widget should render the frame's fullscreen button. */
export function fullscreenButtonEnabled(type: string, options: Record<string, unknown> | undefined): boolean {
    return supportsFullscreenButton(type) && options?.fullscreenWidget === true;
}

export function fullscreenPosition(options: Record<string, unknown> | undefined): FullscreenPosition {
    const raw = options?.fullscreenPosition;
    return (FULLSCREEN_POSITIONS as readonly string[]).includes(raw as string)
        ? (raw as FullscreenPosition)
        : DEFAULT_FULLSCREEN_POSITION;
}

/** Card inset of the button itself, in px, by configured corner. */
export function fullscreenButtonInset(pos: FullscreenPosition): {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
} {
    if (pos === 'tl') return { top: 6, left: 6 };
    if (pos === 'br') return { bottom: 6, right: 6 };
    return { top: 6, right: 6 };
}

/** Distance from the card's right edge for the n-th button in the top-right corner. */
export function cornerRight(index: number): number {
    return 6 + index * 32;
}

/**
 * Where the embed action button (issue #527) goes once the corner may hold other
 * buttons. It is always the innermost one, so it steps aside for each occupant to
 * its right: the iframe widget's own fullscreen button and this frame's button
 * when that one is configured top-right.
 */
export function actionButtonRight(occupants: { iframeOwnFullscreen: boolean; fullscreenTopRight: boolean }): number {
    return cornerRight((occupants.iframeOwnFullscreen ? 1 : 0) + (occupants.fullscreenTopRight ? 1 : 0));
}
