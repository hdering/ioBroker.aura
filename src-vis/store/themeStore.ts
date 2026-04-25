import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import { DEFAULT_THEME_ID, type ThemeVars } from '../themes';

interface ThemeState {
  themeId: string;
  customVars: Partial<ThemeVars>;
  adminThemeId: string;
  followBrowser: boolean;
  browserDarkThemeId: string;
  browserLightThemeId: string;
  setTheme: (id: string) => void;
  setCustomVar: (key: keyof ThemeVars, value: string) => void;
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
      setCustomVar: (key, value) =>
        set((s) => ({ customVars: { ...s.customVars, [key]: value } })),
      resetCustom: () => set({ customVars: {} }),
      setAdminTheme: (id) => set({ adminThemeId: id }),
      setFollowBrowser: (v) => set({ followBrowser: v }),
      setBrowserDarkThemeId: (id) => set({ browserDarkThemeId: id }),
      setBrowserLightThemeId: (id) => set({ browserLightThemeId: id }),
    }),
    { name: 'aura-theme', storage: createJSONStorage(() => managedStorage) },
  ),
);
