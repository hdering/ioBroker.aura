import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import { DEFAULT_THEME_ID, type ThemeVars } from '../themes';

interface ThemeState {
  themeId: string;
  customVars: Partial<ThemeVars>;
  adminThemeId: string;
  setTheme: (id: string) => void;
  setCustomVar: (key: keyof ThemeVars, value: string) => void;
  resetCustom: () => void;
  setAdminTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      customVars: {},
      adminThemeId: 'light',
      setTheme: (id) => set({ themeId: id }),
      setCustomVar: (key, value) =>
        set((s) => ({ customVars: { ...s.customVars, [key]: value } })),
      resetCustom: () => set({ customVars: {} }),
      setAdminTheme: (id) => set({ adminThemeId: id }),
    }),
    { name: 'aura-theme', storage: createJSONStorage(() => managedStorage) },
  ),
);
