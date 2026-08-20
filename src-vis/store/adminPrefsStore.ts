import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Upper bound for the auto-backup ring, shared with the settings stepper and
 *  with configureBackup(). Listing the backups only reads a small summary
 *  sidecar per entry, so the limit is about disk (~60 KB per gzipped backup)
 *  rather than page-load cost — the old limit of 20 existed because the list
 *  used to read every payload. */
export const MAX_BACKUP_COUNT = 100;

interface AdminPrefs {
    autoSave: boolean;
    autoSaveDelay: number; // seconds
    backupCount: number; // max number of auto-backups to keep (1…MAX_BACKUP_COUNT)
    setAutoSave: (v: boolean) => void;
    setAutoSaveDelay: (v: number) => void;
    setBackupCount: (v: number) => void;
}

export const useAdminPrefsStore = create<AdminPrefs>()(
    persist(
        (set) => ({
            autoSave: false,
            autoSaveDelay: 30,
            backupCount: 20,
            setAutoSave: (autoSave) => set({ autoSave }),
            setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
            setBackupCount: (backupCount) => set({ backupCount: Math.max(1, Math.min(MAX_BACKUP_COUNT, backupCount)) }),
        }),
        // Plain localStorage — not managed by persistManager, never marks dashboard dirty
        { name: 'aura-admin-prefs', storage: createJSONStorage(() => localStorage) },
    ),
);
