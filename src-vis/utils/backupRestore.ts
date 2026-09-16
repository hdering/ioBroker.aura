/**
 * Putting a backup back — from the auto-backup ring, a downloaded file or the
 * history menu. One code path, two safety nets: the current state is snapshotted
 * into the ring first, and the whole switch is one undo entry.
 */
import { applyRaw, rehydrateAll } from './configLoader';
import {
    IOBROKER_STATE_MAP,
    saveAll,
    saveToIoBroker,
    writeSafetyBackup,
    type SyncStoreKey,
} from '../store/persistManager';
import { historyGroup } from '../store/editHistory';

const BACKUP_SYNC_KEYS = Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[];

/**
 * Write a backup payload ({ _ts, 'aura-dashboard': …, … }) into the stores and
 * push it to ioBroker. Returns false when the payload holds nothing usable.
 */
export function applyBackupPayload(payload: Record<string, unknown>): boolean {
    let changed = false;
    BACKUP_SYNC_KEYS.forEach((key) => {
        const val = payload[key];
        if (!val) return;
        const str = typeof val === 'string' ? val : JSON.stringify(val);
        if (str.length < 3) return;
        applyRaw(key as Parameters<typeof applyRaw>[0], str);
        changed = true;
    });
    if (!changed) return false;
    rehydrateAll(true);
    // Force ALL sync keys to ioBroker — otherwise keys whose post-rehydrate value
    // byte-matches the restored value aren't marked dirty and stay un-synced,
    // letting the next page load pull stale ioBroker data and silently undo the
    // restore.
    try {
        saveAll();
        saveToIoBroker({ all: true });
    } catch {
        /* quota – non-fatal */
    }
    return true;
}

/**
 * Restore with both nets: a snapshot of the CURRENT state (unsaved edits
 * included) goes into the backup ring first, so the restore stays reversible
 * from the list even after a reload — and the switch is one history entry, so
 * Ctrl+Z reverses it right away.
 */
export async function restoreBackupPayload(payload: Record<string, unknown>): Promise<boolean> {
    await writeSafetyBackup();
    return historyGroup(() => applyBackupPayload(payload));
}
