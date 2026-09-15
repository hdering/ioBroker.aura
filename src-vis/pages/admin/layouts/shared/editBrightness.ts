import { create } from 'zustand';
import type { VarScope } from '../../../../utils/themeVars';

/**
 * Which half of a light/dark pair the Design page is working on (#640).
 *
 * The preset grid, the variable editor and "save the current look as an own
 * theme" all need the same answer, and each of them used to find its own: two
 * independent brightness tabs (one above, one below the save button) plus a save
 * that read the ADMIN browser's `prefers-color-scheme`. Editing the dark half and
 * pressing save therefore produced a LIGHT theme carrying the light overrides —
 * the dark work was not in it at all.
 *
 * Deliberately not persisted: it is a "where am I right now", not a setting.
 */
interface EditBrightnessState {
    scope: VarScope;
    /** True once the user picked a half — the page stops deciding for them then. */
    picked: boolean;
    setScope: (scope: VarScope) => void;
    /** Opening choice, ignored as soon as the user has picked one (useStartBrightness). */
    startAt: (scope: VarScope) => void;
    /** Back to "nothing chosen" — the Design page calls it when it goes away. */
    forget: () => void;
}

export const useEditBrightness = create<EditBrightnessState>((set) => ({
    scope: 'base',
    picked: false,
    setScope: (scope) => set({ scope, picked: true }),
    startAt: (scope) => set((s) => (s.picked || s.scope === scope ? s : { ...s, scope })),
    forget: () => set({ scope: 'base', picked: false }),
}));

/** The half this browser would show — the starting point where nothing is chosen. */
export function browserBrightness(): 'light' | 'dark' {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
