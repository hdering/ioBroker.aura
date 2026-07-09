import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { useConfigStore } from './store/configStore';
import { getTheme } from './themes';

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
    }, [theme, customVars, fontScale]);

    return <>{children}</>;
}
