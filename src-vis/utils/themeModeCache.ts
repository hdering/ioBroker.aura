import { useThemeStore } from '../store/themeStore';
import { withSuppressedDirty } from '../store/persistManager';

export type ThemeMode = 'dark' | 'light';

// Module-level cache of the active themeMode.frontend DP override. Lets the DP
// listener win over delayed config rehydrations and the followBrowser effect,
// which would otherwise overwrite the DP-driven setTheme call.
export const themeModeOverride: { value: ThemeMode | null } = { value: null };

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

/** themeId the store had before applyCachedThemeMode() seeded the cached mode. */
let themeIdBeforeSeed: string | null = null;
let seededMode: ThemeMode | null = null;

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
 * Apply the cached DP mode synchronously — call before React mounts so the very
 * first paint uses it. Writes through zustand persist (hence localStorage), but
 * with the dirty flag suppressed: a DP-driven theme is per-device viewing state,
 * not an unsaved config edit.
 */
export function applyCachedThemeMode(): void {
    const mode = readCachedThemeMode();
    if (!mode) return;
    themeModeOverride.value = mode;
    const current = useThemeStore.getState().themeId;
    if (current === mode) return;
    themeIdBeforeSeed = current;
    seededMode = mode;
    withSuppressedDirty(() => useThemeStore.setState({ themeId: mode }));
}

/**
 * Undo the seed when the DP turns out to be cleared while this device was off.
 * Only reverts when nothing else has picked a theme since — a config load or an
 * explicit switch is a better answer than the pre-seed value.
 */
export function revertSeededThemeMode(): void {
    const prev = themeIdBeforeSeed;
    const seeded = seededMode;
    themeIdBeforeSeed = null;
    seededMode = null;
    if (!prev || !seeded) return;
    if (useThemeStore.getState().themeId !== seeded) return;
    withSuppressedDirty(() => useThemeStore.setState({ themeId: prev }));
}
