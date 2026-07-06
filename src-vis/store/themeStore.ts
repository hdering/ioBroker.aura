import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import { DEFAULT_THEME_ID, type AllVars } from '../themes';

interface ThemeState {
    themeId: string;
    customVars: Partial<AllVars>;
    adminThemeId: string;
    followBrowser: boolean;
    browserDarkThemeId: string;
    browserLightThemeId: string;
    setTheme: (id: string) => void;
    applyThemePreset: (id: string) => void;
    setCustomVar: (key: keyof AllVars, value: string) => void;
    resetCustom: () => void;
    setAdminTheme: (id: string) => void;
    setFollowBrowser: (v: boolean) => void;
    setBrowserDarkThemeId: (id: string) => void;
    setBrowserLightThemeId: (id: string) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            themeId: DEFAULT_THEME_ID,
            customVars: {},
            adminThemeId: 'light',
            followBrowser: false,
            browserDarkThemeId: 'dark',
            browserLightThemeId: 'light',
            setTheme: (id) => set({ themeId: id }),
            // Atomic preset switch: set the theme AND clear custom overrides in a
            // single persist write. Doing this as two calls (setTheme + resetCustom)
            // produced a byte-identical aura-theme blob on the second write whenever
            // customVars was already empty, which managedStorage's no-op detection
            // treated as a revert and cleared the just-set dirty flag → no save button.
            applyThemePreset: (id) => set({ themeId: id, customVars: {} }),
            setCustomVar: (key, value) => set((s) => ({ customVars: { ...s.customVars, [key]: value } })),
            resetCustom: () => set({ customVars: {} }),
            setAdminTheme: (id) => set({ adminThemeId: id }),
            setFollowBrowser: (v) => set({ followBrowser: v }),
            setBrowserDarkThemeId: (id) => set({ browserDarkThemeId: id }),
            setBrowserLightThemeId: (id) => set({ browserLightThemeId: id }),
        }),
        { name: 'aura-theme', storage: createJSONStorage(() => managedStorage) },
    ),
);
