import { createContext, useContext } from 'react';

/**
 * True for the widget rendered inside the fullscreen overlay (issue #644). Lets a
 * widget drop what only makes sense in the small tile — the iframe lifts its
 * click-action blocker there, so the embedded page stays operable (#813).
 */
export const WidgetFullscreenContext = createContext<boolean>(false);

export function useInWidgetFullscreen(): boolean {
    return useContext(WidgetFullscreenContext);
}
