import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AdminPrefs {
  autoSave: boolean;
  autoSaveDelay: number; // seconds
  setAutoSave: (v: boolean) => void;
  setAutoSaveDelay: (v: number) => void;
}

export const useAdminPrefsStore = create<AdminPrefs>()(
  persist(
    (set) => ({
      autoSave: false,
      autoSaveDelay: 30,
      setAutoSave: (autoSave) => set({ autoSave }),
      setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
    }),
    // Plain localStorage — not managed by persistManager, never marks dashboard dirty
    { name: 'aura-admin-prefs', storage: createJSONStorage(() => localStorage) },
  ),
);
