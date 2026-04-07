import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import { DEFAULT_THEME_ID, type ThemeVars } from '../themes';

interface ThemeState {
  themeId: string;
  customVars: Partial<ThemeVars>;
  setTheme: (id: string) => void;
  setCustomVar: (key: keyof ThemeVars, value: string) => void;
  resetCustom: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      customVars: {},
      setTheme: (id) => set({ themeId: id }),
      setCustomVar: (key, value) =>
        set((s) => ({ customVars: { ...s.customVars, [key]: value } })),
      resetCustom: () => set({ customVars: {} }),
    }),
    { name: 'aura-theme', storage: createJSONStorage(() => managedStorage) },
  ),
);
