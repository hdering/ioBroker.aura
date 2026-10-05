import { createContext, useContext } from 'react';

/**
 * Whether the view a widget sits in is on screen. Visited tabs and sections stay
 * mounted, only hidden (Dashboard / App), so a widget that should drop its
 * content while out of sight cannot tell from mounting alone — an iframe without
 * `keepAlive` unloads here and loads fresh when its tab shows again (#65).
 * true = no dashboard above (widget designer, preset preview, App-level popups).
 */
export const ViewVisibleContext = createContext<boolean>(true);

export function useViewVisible(): boolean {
    return useContext(ViewVisibleContext);
}
