import { useEffect, useRef } from 'react';
import { version as bundledVersion } from '../../package.json';
import { useIoBroker, getObjectDirect, subscribeObjectDirect } from './useIoBroker';
import { NS } from '../utils/namespace';

/** Long enough for the restarts of an update to settle, so the reload does not hit a 502. */
const RELOAD_DELAY_MS = 3000;
const RELOAD_MARK_KEY = 'aura-version-reload-mark';
const INSTANCE_ID = `system.adapter.${NS}`;

function versionOf(obj: unknown): string | null {
    return (obj as { common?: { version?: string } } | null)?.common?.version ?? null;
}

/**
 * Compares the bundled package.json version with the version of the running Aura
 * instance and reloads the page once they differ: the served bundle is stale
 * (the adapter was updated), the reload fetches the new assets.
 *
 * The instance object is read on every (re-)connect AND subscribed: an update
 * writes the new version into it while the socket may well stay connected
 * (web extension with hot reload), or only after the reconnect - a check on
 * connect alone missed both.
 *
 * Skipped in dev: the dev bundle's version may legitimately differ from the
 * running adapter's installed version.
 */
export function useVersionGuard(): void {
    const { connected } = useIoBroker();
    const reloadingRef = useRef(false);

    useEffect(() => {
        if (import.meta.env.DEV) return;
        if (!connected) return;
        let cancelled = false;

        const check = (live: string | null): void => {
            if (cancelled || !live || reloadingRef.current) return;
            if (live === bundledVersion) {
                // Versions match again — clear any stale reload mark from a prior cycle.
                try {
                    sessionStorage.removeItem(RELOAD_MARK_KEY);
                } catch {
                    /* ignore */
                }
                return;
            }
            // Suppress a reload loop: if we already reloaded once in this tab session
            // for exactly this live/bundled pair, the mismatch is permanent (e.g.
            // adapter installed from GitHub without rebuilding www/, or the user
            // bumped package.json locally). Reloading again won't fix it.
            const mark = `${live}=>${bundledVersion}`;
            let alreadyTried = false;
            try {
                alreadyTried = sessionStorage.getItem(RELOAD_MARK_KEY) === mark;
            } catch {
                /* ignore */
            }
            reloadingRef.current = true;
            if (alreadyTried) {
                console.warn(
                    `[Aura] adapter ${live} ≠ bundle ${bundledVersion} after reload — staying on stale bundle to avoid loop`,
                );
                return;
            }
            try {
                sessionStorage.setItem(RELOAD_MARK_KEY, mark);
            } catch {
                /* ignore */
            }
            console.info(`[Aura] adapter version ${live} differs from bundle ${bundledVersion} — reloading once`);
            globalThis.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
        };

        const unsubscribe = subscribeObjectDirect(INSTANCE_ID, (obj) => check(versionOf(obj)));
        void getObjectDirect(INSTANCE_ID, { skipCache: true })
            .then((obj) => check(versionOf(obj)))
            .catch(() => {});
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [connected]);
}
