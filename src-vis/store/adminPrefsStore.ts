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
    /** Editor control lock: widgets are inert while designing (issue #655).
     *  On by default — clicking a switch in the editor used to flip the real lamp. */
    lockWidgets: boolean;
    /** The "Getting started" card on the admin overview was dismissed in this
     *  browser. Plain preference, never part of the dashboard config. */
    gettingStartedDismissed: boolean;
    /** The MCP (AI access) card on the admin overview was dismissed — same
     *  kind of browser-local preference as `gettingStartedDismissed`. */
    mcpCardDismissed: boolean;
    setAutoSave: (v: boolean) => void;
    setAutoSaveDelay: (v: number) => void;
    setBackupCount: (v: number) => void;
    setLockWidgets: (v: boolean) => void;
    setGettingStartedDismissed: (v: boolean) => void;
    setMcpCardDismissed: (v: boolean) => void;
}

export const useAdminPrefsStore = create<AdminPrefs>()(
    persist(
        (set) => ({
            autoSave: false,
            autoSaveDelay: 30,
            backupCount: 20,
            lockWidgets: true,
            gettingStartedDismissed: false,
            mcpCardDismissed: false,
            setAutoSave: (autoSave) => set({ autoSave }),
            setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
            setBackupCount: (backupCount) => set({ backupCount: Math.max(1, Math.min(MAX_BACKUP_COUNT, backupCount)) }),
            setLockWidgets: (lockWidgets) => set({ lockWidgets }),
            setGettingStartedDismissed: (gettingStartedDismissed) => set({ gettingStartedDismissed }),
            setMcpCardDismissed: (mcpCardDismissed) => set({ mcpCardDismissed }),
        }),
        // Plain localStorage — not managed by persistManager, never marks dashboard dirty
        { name: 'aura-admin-prefs', storage: createJSONStorage(() => localStorage) },
    ),
);
