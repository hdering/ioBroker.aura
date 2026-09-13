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
    setScope: (scope: VarScope) => void;
}

export const useEditBrightness = create<EditBrightnessState>((set) => ({
    scope: 'base',
    setScope: (scope) => set({ scope }),
}));

/** The half this browser would show — the starting point where nothing is chosen. */
export function browserBrightness(): 'light' | 'dark' {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
