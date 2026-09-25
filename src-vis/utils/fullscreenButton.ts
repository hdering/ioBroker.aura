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

/**
 * Card inset of the n-th button in a corner, in px. Index 0 is the outermost
 * button; every further occupant of the same corner steps one slot inwards.
 */
export function cornerInset(
    pos: FullscreenPosition,
    index = 0,
): {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
} {
    const along = cornerRight(index);
    if (pos === 'tl') return { top: 6, left: along };
    if (pos === 'br') return { bottom: 6, right: along };
    return { top: 6, right: along };
}

/** Card inset of the fullscreen button itself, in px, by configured corner. */
export function fullscreenButtonInset(pos: FullscreenPosition): {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
} {
    return cornerInset(pos, 0);
}

/** Distance from the card's right edge for the n-th button in the top-right corner. */
export function cornerRight(index: number): number {
    return 6 + index * 32;
}

/**
 * True when the overlay should also take the whole screen through the browser's
 * Fullscreen API, hiding the address bar and the OS task bar (issue #711).
 * Only meaningful together with the button itself.
 */
export function fullscreenScreenEnabled(options: Record<string, unknown> | undefined): boolean {
    return options?.fullscreenWidget === true && options?.fullscreenScreen === true;
}

/** The slice of `document` the screen helpers touch — a stub in the unit test. */
export interface FullscreenDoc {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
    documentElement: {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => void;
    };
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => void;
}

export function screenIsFullscreen(doc: FullscreenDoc): boolean {
    return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Asks the browser for fullscreen on the whole page. Must run inside the click
 * handler — browsers only grant it during a user gesture.
 *
 * The page, not the overlay element: in native fullscreen only the subtree of the
 * fullscreen element is painted, and popovers a widget portals into `document.body`
 * would vanish. The overlay is `inset-0` anyway, so the result looks the same.
 *
 * Returns true when Aura made the request and so owns the fullscreen state. False
 * when the page already was fullscreen (F11, kiosk app) — then closing the overlay
 * must leave it alone — or when the API is missing (iPhone). A refused request
 * (old WebView, permissions policy) is swallowed: the overlay then simply stays
 * inside the window, as it did before #711.
 */
export function enterScreenFullscreen(doc: FullscreenDoc): boolean {
    if (screenIsFullscreen(doc)) return false;
    const root = doc.documentElement;
    try {
        if (typeof root.requestFullscreen === 'function') {
            root.requestFullscreen().catch(() => {});
            return true;
        }
        if (typeof root.webkitRequestFullscreen === 'function') {
            root.webkitRequestFullscreen();
            return true;
        }
    } catch {
        // Some engines throw synchronously instead of rejecting.
    }
    return false;
}

/** Leaves fullscreen again — only call when {@link enterScreenFullscreen} returned true. */
export function exitScreenFullscreen(doc: FullscreenDoc): void {
    if (!screenIsFullscreen(doc)) return;
    try {
        if (typeof doc.exitFullscreen === 'function') doc.exitFullscreen().catch(() => {});
        else if (typeof doc.webkitExitFullscreen === 'function') doc.webkitExitFullscreen();
    } catch {
        // Already left (e.g. the browser's own Esc won the race).
    }
}
