import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AdminPrefs {
  autoSave: boolean;
  autoSaveDelay: number; // seconds
  backupCount: number;   // max number of auto-backups to keep (1–20)
  setAutoSave: (v: boolean) => void;
  setAutoSaveDelay: (v: number) => void;
  setBackupCount: (v: number) => void;
}

export const useAdminPrefsStore = create<AdminPrefs>()(
  persist(
    (set) => ({
      autoSave: false,
      autoSaveDelay: 30,
      backupCount: 5,
      setAutoSave: (autoSave) => set({ autoSave }),
      setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
      setBackupCount: (backupCount) => set({ backupCount: Math.max(1, Math.min(20, backupCount)) }),
    }),
    // Plain localStorage — not managed by persistManager, never marks dashboard dirty
    { name: 'aura-admin-prefs', storage: createJSONStorage(() => localStorage) },
  ),
);
