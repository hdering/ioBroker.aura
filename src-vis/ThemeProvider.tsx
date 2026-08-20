import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { useConfigStore } from './store/configStore';
import { getTheme } from './themes';
import { BOOT_COLORS_KEY } from './utils/themeModeCache';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { themeId, customVars } = useThemeStore();
    const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);
    const theme = getTheme(themeId);

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
    }, [theme, customVars, fontScale]);

    return <>{children}</>;
}
