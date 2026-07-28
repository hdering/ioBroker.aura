import { createContext, useContext } from 'react';

/**
 * True when a widget is rendered inside a popup-view whose dialog height is "auto"
 * (no explicit popupHeight) AND the widget is of a content-driven type. Such widgets
 * (e.g. the list) then render their FULL content without an internal scrollbar, so the
 * popup grid — and thus the auto-sized dialog — can grow to fit the whole content
 * instead of clipping it. Defaults to false (dashboard + fixed-height popups behave
 * exactly as before: fill the fixed cell and scroll internally).
 */
export const PopupAutoHeightContext = createContext(false);

export function usePopupAutoHeight(): boolean {
    return useContext(PopupAutoHeightContext);
}
