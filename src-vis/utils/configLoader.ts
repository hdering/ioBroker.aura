/**
 * Loads config from separate ioBroker states in parallel.
 * Handles migration from the old single-blob format automatically.
 *
 * Old format: aura.0.config.dashboard contained all keys nested:
 *   { "aura-dashboard": "...", "aura-theme": "...", ... }
 * New format: each key has its own state (aura.0.config.theme etc.)
 */
import { getStateDirect, setStateDirect } from '../hooks/useIoBroker';
import {
    IOBROKER_STATE_MAP,
    type SyncStoreKey,
    hasDirtyFlag,
    clearDirtyFlag,
    isScreenshotMode,
} from '../store/persistManager';
import { hydrateGroupDefs } from '../store/groupDefsStore';
import { useDashboardStore } from '../store/dashboardStore';
import { useThemeStore } from '../store/themeStore';
import { useGroupStore } from '../store/groupStore';
import { useConfigStore } from '../store/configStore';
import { useGlobalSettingsStore } from '../store/globalSettingsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { NS } from './namespace';

type StoreKey = SyncStoreKey | 'aura-global-settings';

/** Apply a raw JSON string for a given key to localStorage + store.
 *  Also clears the _dirty flag — values pulled from ioBroker are by definition
 *  synced. */
export function applyRaw(key: StoreKey, raw: string): void {
    if (key === 'aura-group-defs') {
        hydrateGroupDefs(raw);
        clearDirtyFlag(key);
        return;
    }
    try {
        localStorage.setItem(key, raw);
    } catch {
        /* quota — in-memory only */
    }
    clearDirtyFlag(key);
}

/** Rehydrate all stores from localStorage / in-memory state. */
export function rehydrateAll(includeGlobalSettings = true): void {
    useDashboardStore.persist.rehydrate();
    useThemeStore.persist.rehydrate();
    useGroupStore.persist.rehydrate();
    useConfigStore.persist.rehydrate();
    usePopupConfigStore.persist.rehydrate();
    if (includeGlobalSettings) useGlobalSettingsStore.persist.rehydrate();
}

/**
 * Load all config states from ioBroker in parallel.
 * Returns true if any store was updated.
 * Automatically migrates from old single-blob format.
 *
 * Honors per-key _dirty flags: keys with cross-session unsaved edits are
 * skipped (their localStorage value wins; saveToIoBroker will push it).
 * Pass `ignoreDirty: true` from the read-only frontend to always pull remote.
 */
export async function loadConfigFromIoBroker(
    includeGlobalSettings = false,
    { ignoreDirty = false }: { ignoreDirty?: boolean } = {},
): Promise<boolean> {
    // Screenshot harness controls the layout entirely — never pull the real
    // instance config, otherwise it would race with / clobber the injected demo.
    if (isScreenshotMode()) return false;
    const keys = Object.keys(IOBROKER_STATE_MAP) as SyncStoreKey[];
    const extraKeys: StoreKey[] = includeGlobalSettings ? [...keys, 'aura-global-settings'] : keys;

    // Load all states in parallel
    const stateIds = extraKeys.map((key) =>
        key === 'aura-global-settings' ? `${NS}.config.global-settings` : IOBROKER_STATE_MAP[key as SyncStoreKey],
    );
    const results = await Promise.all(stateIds.map((id) => getStateDirect(id)));

    let changed = false;

    // Check if the dashboard state contains the old blob format
    const dashboardResult = results[stateIds.indexOf(`${NS}.config.dashboard`)];
    const dashboardRaw = dashboardResult?.val ? String(dashboardResult.val) : '';
    const isOldBlob = dashboardRaw.includes('"aura-dashboard"') || dashboardRaw.includes('"aura-theme"');

    if (isOldBlob) {
        // Migration: extract individual keys from the old blob and write to separate states
        try {
            const blob = JSON.parse(dashboardRaw) as Record<string, unknown>;
            for (const key of extraKeys) {
                // aura-group-defs is RAM-only (never written to localStorage), so a
                // page reload already wipes any unsaved edit — there is nothing to
                // preserve. Honouring its _dirty flag here would skip the load,
                // leave the store empty, and the next save would then overwrite the
                // real group children in ioBroker with {}. Always hydrate it from
                // remote; applyRaw clears the stale flag.
                if (!ignoreDirty && key !== 'aura-group-defs' && hasDirtyFlag(key)) continue; // preserve unsaved edits
                const val = blob[key];
                if (!val) continue;
                const raw = typeof val === 'string' ? val : JSON.stringify(val);
                if (!raw || raw.length < 3) continue;
                applyRaw(key, raw);
                // Write to new separate state so next load uses new format
                const stateId =
                    key === 'aura-global-settings'
                        ? `${NS}.config.global-settings`
                        : IOBROKER_STATE_MAP[key as SyncStoreKey];
                setStateDirect(stateId, raw);
                changed = true;
            }
        } catch {
            /* ignore malformed blob */
        }
    } else {
        // New format: each result maps directly to its key
        for (let i = 0; i < extraKeys.length; i++) {
            const key = extraKeys[i];
            // aura-group-defs is RAM-only: see note above. Skipping it on a dirty
            // flag empties the group-children store and lets the next save clobber
            // ioBroker with {}. Always hydrate it from remote.
            if (!ignoreDirty && key !== 'aura-group-defs' && hasDirtyFlag(key)) continue; // preserve unsaved edits
            const state = results[i];
            if (!state?.val) continue;
            const raw = String(state.val);
            if (!raw || raw.length < 3) continue;
            const current = key === 'aura-group-defs' ? null : localStorage.getItem(key);
            if (current === raw) continue;
            applyRaw(key, raw);
            changed = true;
        }
    }

    if (changed) rehydrateAll(includeGlobalSettings);
    return changed;
}
