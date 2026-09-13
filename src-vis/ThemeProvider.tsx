import { useEffect, useMemo } from 'react';
import { useThemeStore } from './store/themeStore';
import { useConfigStore } from './store/configStore';
import { useGlobalThemeId } from './hooks/useEffectiveSettings';
import { getTheme } from './themes';
import { BOOT_COLORS_KEY } from './utils/themeModeCache';
import { bumpThemeEpoch } from './store/themeEpoch';
import { resolveThemeVars } from './utils/themeVars';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Three separate selectors on purpose: building the VarSets object inside a
    // selector would hand zustand a new reference on every store change.
    const baseVars = useThemeStore((s) => s.customVars);
    const lightVars = useThemeStore((s) => s.customVarsLight);
    const darkVars = useThemeStore((s) => s.customVarsDark);
    const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);
    // Global theme with the dark/light-mode datapoint applied — the saved
    // themeId itself is never rewritten by the mode (#573).
    const theme = getTheme(useGlobalThemeId());
    // Own overrides for THIS brightness: the shared set plus the light/dark half
    // that matches the theme actually being rendered (#640).
    const customVars = useMemo(
        () => resolveThemeVars(theme.dark, { base: baseVars, light: lightVars, dark: darkVars }),
        [theme.dark, baseVars, lightVars, darkVars],
    );

    useEffect(() => {
        const root = document.documentElement;
        const vars = { ...theme.vars, ...customVars };
        Object.entries(vars).forEach(([k, v]) => {
            if (v) root.style.setProperty(k, v);
        });
        root.style.setProperty('--font-scale', String(fontScale));
        root.classList.toggle('dark', theme.dark);
        // Match native form-control chrome to the theme (like AdminLayout does).
        // Without this, dark themes keep color-scheme:light, so a native
        // <input type=range> gets a WHITE UA background — the semi-transparent
        // dimmer rail then composites over white and looks far brighter than the
        // admin backend (which sets color-scheme:dark). Also fixes scrollbars /
        // selects / date pickers to render dark in dark themes.
        root.style.colorScheme = theme.dark ? 'dark' : 'light';
        // Hand the current colours to the pre-React boot splash (inline script in
        // index.html). Without this the splash is always dark, so a light-theme
        // device flashes dark → light on every reload.
        try {
            const bg = vars['--app-bg'];
            const fg = vars['--text-secondary'];
            if (bg && fg) localStorage.setItem(BOOT_COLORS_KEY, `${bg}|${fg}`);
        } catch {
            /* quota / private mode */
        }
        // The variables are in the DOM now — whoever has to read one in
        // JavaScript (a canvas colour) can do it from here on (store/themeEpoch).
        bumpThemeEpoch();
    }, [theme, customVars, fontScale]);

    return <>{children}</>;
}
