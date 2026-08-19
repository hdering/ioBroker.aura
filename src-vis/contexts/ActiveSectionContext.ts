import { createContext, useContext } from 'react';

/**
 * Provides the id of the section a dashboard renders to all descendants — the
 * companion of {@link ActiveLayoutContext}. The frontend resolves it from the URL,
 * the admin editor from the section being edited, so widgets whose content depends
 * on the surrounding view (MenuWidget) get the right one without prop drilling and
 * without re-deriving it from the URL (which the /admin route does not carry).
 * undefined = no dashboard above (widget designer, preset preview).
 */
export const ActiveSectionContext = createContext<string | undefined>(undefined);

export function useActiveSectionId(): string | undefined {
    return useContext(ActiveSectionContext);
}
