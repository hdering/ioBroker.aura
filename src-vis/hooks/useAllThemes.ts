import { useMemo } from 'react';
import { useThemeStore } from '../store/themeStore';
import { THEMES, materializeUserTheme, type Theme } from '../themes';

/**
 * Built-in presets plus the user's own themes (#640), as complete themes.
 *
 * The React counterpart of `allThemes()` in the themes module: that one serves
 * plain functions from a mirrored registry, this one re-renders a picker when
 * an own theme is added, renamed or deleted.
 */
export function useAllThemes(): Theme[] {
    const userThemes = useThemeStore((s) => s.userThemes);
    return useMemo(
        () => (userThemes.length ? [...THEMES, ...userThemes.map(materializeUserTheme)] : THEMES),
        [userThemes],
    );
}
