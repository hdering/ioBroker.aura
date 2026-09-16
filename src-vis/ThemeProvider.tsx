import { useEffect, useMemo, useRef } from 'react';
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

    // Keys this effect put on <html> last time — see the removal below.
    const appliedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const root = document.documentElement;
        const vars = { ...theme.vars, ...customVars };
        const applied = new Set<string>();
        Object.entries(vars).forEach(([k, v]) => {
            if (!v) return;
            root.style.setProperty(k, v);
            applied.add(k);
        });
        // Whatever the previous theme/half wrote and this one does not: take it
        // off again. The base palette is complete in every theme and overwrites
        // itself, but an element var only exists while someone sets it — so a
        // `--nav-bg` from the light half stayed on <html> after the header's
        // sun/moon button switched to dark, where no own value is set (#640).
        appliedRef.current.forEach((k) => {
            if (!applied.has(k)) root.style.removeProperty(k);
        });
        appliedRef.current = applied;
        root.style.setProperty('--font-scale', String(fontScale));
        root.classList.toggle('dark', theme.dark);
        // Match native form-control chrome to the theme (like AdminLayout does).
        // Without this, dark themes keep color-scheme:light, so a native
        // <input type=range> gets a WHITE UA background — the semi-transparent
        // dimmer rail then composites over white and looks far brighter than the
        // admin backend (which sets color-scheme:dark). Also fixes scrollbars /
        // selects / date pickers to render dark in dark themes.
        root.style.colorScheme = theme.dark ? 'dark' : 'light';
        // Colour the system bars of an installed web app take: the tab bar's, because
        // that is the chrome bordering them. A literal value only — `theme-color` is
        // read by the OS, which knows nothing about CSS vars (#662).
        const navBg = vars['--nav-bg'] || vars['--app-surface'] || vars['--app-bg'];
        const meta = document.getElementById('aura-theme-color');
        if (meta && navBg && /^(#|rgb|hsl|oklch|lab|lch|color\()/i.test(navBg.trim())) {
            meta.setAttribute('content', navBg.trim());
        }
        // Hand the current colours to the pre-React boot splash (inline script in
        // index.html). Without this the splash is always dark, so a light-theme
        // device flashes dark → light on every reload.
        try {
            const bg = vars['--app-bg'];
            const fg = vars['--text-secondary'];
            if (bg && fg) localStorage.setItem(BOOT_COLORS_KEY, `${bg}|${fg}|${navBg ?? bg}`);
        } catch {
            /* quota / private mode */
        }
        // The variables are in the DOM now — whoever has to read one in
        // JavaScript (a canvas colour) can do it from here on (store/themeEpoch).
        bumpThemeEpoch();
    }, [theme, customVars, fontScale]);

    return <>{children}</>;
}
