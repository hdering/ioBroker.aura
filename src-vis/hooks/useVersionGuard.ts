import { useEffect, useRef } from 'react';
import { version as bundledVersion } from '../../package.json';
import { useIoBroker, getObjectDirect, subscribeObjectDirect } from './useIoBroker';
import { NS } from '../utils/namespace';

const POLL_MS = 3000;
/** The new bundle never showed up (same build, only the version changed): reload anyway. */
const GIVE_UP_MS = 3 * 60 * 1000;
const RELOAD_MARK_KEY = 'aura-version-reload-mark';
const INSTANCE_ID = `system.adapter.${NS}`;
const BUNDLE_RE = /assets\/index-[\w-]+\.js/;

/** The entry bundle this page runs, e.g. `assets/index-Bcl2ubms.js`. */
function runningBundle(): string | null {
    for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))) {
        const m = BUNDLE_RE.exec(s.src);
        if (m) return m[0];
    }
    return null;
}

/**
 * The new version is written into the instance object before Aura restarts with
 * it - a reload right away lands in that restart (502 from the web extension).
 * Wait until the page address answers with an index.html of ANOTHER bundle, i.e.
 * the updated Aura is up and serving.
 */
async function reloadWhenServed(): Promise<void> {
    const running = runningBundle();
    const started = Date.now();
    const url = window.location.pathname + window.location.search;
    // With timestamps, so the reload of each device can be lined up with the ioBroker log.
    const say = (what: string) =>
        console.info(
            `[Aura] ${new Date().toLocaleTimeString()} ${what} (after ${Math.round((Date.now() - started) / 1000)} s)`,
        );
    let failed = 0;
    for (;;) {
        await new Promise((r) => globalThis.setTimeout(r, POLL_MS));
        if (!running || Date.now() - started > GIVE_UP_MS) {
            say(`new bundle not seen (${failed} failed requests) — reloading anyway`);
            break;
        }
        try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) {
                failed++;
                continue;
            }
            const html = await r.text();
            const served = BUNDLE_RE.exec(html)?.[0];
            if (html.includes('__AURA_NAMESPACE__') && served && served !== running) {
                say(`new bundle ${served} served (${failed} failed requests before) — reloading`);
                break;
            }
        } catch {
            /* Aura is restarting - next round */
            failed++;
        }
    }
    window.location.reload();
}

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
            console.info(
                `[Aura] adapter version ${live} differs from bundle ${bundledVersion} — reloading once the new bundle is served`,
            );
            void reloadWhenServed();
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
