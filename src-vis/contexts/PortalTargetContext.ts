import { createContext, useContext } from 'react';

/**
 * Provides the DOM element that portals (PortalDropdown, CenteredModal) should
 * render into.  When inside AdminLayout the target is a div that lives inside
 * the admin container, so the portals inherit the admin theme's CSS variables.
 * Outside AdminLayout (frontend) the context is null and portals fall back to
 * document.body, which inherits the root-level CSS variables set by ThemeProvider.
 */
export const PortalTargetContext = createContext<Element | null>(null);

export function usePortalTarget(): Element {
  return useContext(PortalTargetContext) ?? document.body;
}
