import { create } from 'zustand';
import { getTheme } from '../themes';

export type ThemeMode = 'dark' | 'light';

// ── Datapoint-driven dark/light mode ─────────────────────────────────────────
// `<ns>.config.themeMode.frontend` carries a *mode*, not a theme: it says
// "show something dark now", it does not pick the design. Kept in its own
// (non-persisted) store so every consumer re-renders when it changes without
// the mode ever touching the saved themeId — writing it into themeStore used to
// overwrite the design chosen in the admin, so a device that had ever used the
// header sun/moon button ignored every theme preset from then on (#573).
interface ThemeModeState {
    mode: ThemeMode | null;
    setMode: (mode: ThemeMode | null) => void;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
    mode: null,
    setMode: (mode) => set({ mode }),
}));

/** Non-React accessor for the active mode (effects, event handlers, boot code). */
export const themeModeOverride = {
    get value(): ThemeMode | null {
        return useThemeModeStore.getState().mode;
    },
    set value(mode: ThemeMode | null) {
        useThemeModeStore.getState().setMode(mode);
    },
};

/**
 * Resolve a saved theme id against an active dark/light mode.
 *
 * A design whose polarity already matches the requested mode is kept as is — a
 * dark mode does not have to mean the plain `dark` preset. Only when the design
 * has the wrong polarity does the configured counterpart (the same pair the
 * browser sync uses) step in.
 */
export function resolveThemeModeId(
    themeId: string,
    mode: ThemeMode | null,
    darkThemeId: string,
    lightThemeId: string,
): string {
    if (!mode) return themeId;
    const wantDark = mode === 'dark';
    if (getTheme(themeId).dark === wantDark) return themeId;
    return wantDark ? darkThemeId : lightThemeId;
}

// Last value seen on <ns>.config.themeMode.frontend, remembered per device.
// The DP only reaches the app once the socket is connected and the initial
// getState pass has run — several hundred ms after the first paint. Until then
// the frontend renders whatever theme localStorage / the remote config carry,
// which is why a tablet reloading at night flashed the daytime theme before
// snapping to dark. Seeding from this cache makes the first paint already
// correct; the DP value still has the final say once it arrives.
const CACHE_KEY = 'aura-theme-mode';

// Colours of the theme last rendered on this device, written by ThemeProvider
// and read by the inline boot script in index.html so the pre-React splash
// matches the theme instead of always being dark.
export const BOOT_COLORS_KEY = 'aura-boot-colors';

export function readCachedThemeMode(): ThemeMode | null {
    try {
        const v = localStorage.getItem(CACHE_KEY);
        return v === 'dark' || v === 'light' ? v : null;
    } catch {
        return null;
    }
}

export function writeCachedThemeMode(mode: ThemeMode | null): void {
    try {
        if (mode) localStorage.setItem(CACHE_KEY, mode);
        else localStorage.removeItem(CACHE_KEY);
    } catch {
        /* quota / private mode */
    }
}

/**
 * Apply the cached DP mode — call before React mounts so the very first paint
 * uses it. Only the mode store is touched, so a stale cache can no longer
 * outlive the datapoint: as soon as the DP arrives (or turns out to be empty)
 * the mode is corrected and the saved design reappears untouched.
 */
export function applyCachedThemeMode(): void {
    const mode = readCachedThemeMode();
    if (mode) useThemeModeStore.setState({ mode });
}
