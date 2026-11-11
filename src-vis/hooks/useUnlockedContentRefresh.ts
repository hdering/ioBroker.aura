import { useEffect } from 'react';
import { getStateDirect, subscribeStateDirect } from './useIoBroker';
import { NS } from '../utils/namespace';
import { pinContent } from '../utils/pinApi';
import { useUnlockContentStore } from '../store/unlockContentStore';
import { usePinStore } from '../store/pinStore';

/**
 * Keeps unlocked PIN views current.
 *
 * The frontend gets a protected view's content once, from /pin/unlock. Changes to
 * it go into the server-side vault, never into `config.dashboard` — so an MCP
 * write into an open protected tab (new widgets, a new tab in a protected section)
 * stayed invisible until a reload, and the tab bar even showed a new tab with
 * nothing behind it.
 *
 * The adapter stamps info.vaultRevision on every vault write; on a new stamp each
 * held view is read again with its unlock grant. A grant that no longer holds (PIN
 * changed, expired) or a view the vault forgot (PIN removed) closes the view.
 * The 30 s poll is the fallback for setups where subscriptions do not arrive.
 */
async function refreshHeld(): Promise<void> {
    const { content, setContent, clear } = useUnlockContentStore.getState();
    await Promise.all(
        Object.entries(content).map(async ([key, entry]) => {
            if (!entry.token) return;
            const res = await pinContent(key, entry.token);
            // The view may have been closed (or re-unlocked) while the request ran.
            const now = useUnlockContentStore.getState().content[key];
            if (!now || now.token !== entry.token) return;
            if (res.ok) {
                if (JSON.stringify(res.content) !== JSON.stringify(now.content)) {
                    setContent(key, res.content, now.relock);
                }
                return;
            }
            if (res.reason === 'error') return; // network hiccup — keep what is shown
            clear(key);
            usePinStore.getState().lock(key);
        }),
    );
}

let running: Promise<void> | null = null;
let again = false;

/** One refresh at a time; a stamp that arrives meanwhile runs one more pass after it. */
function scheduleRefresh(): void {
    if (running) {
        again = true;
        return;
    }
    running = refreshHeld()
        .catch(() => {})
        .finally(() => {
            running = null;
            if (again) {
                again = false;
                scheduleRefresh();
            }
        });
}

const hasHeld = () => Object.values(useUnlockContentStore.getState().content).some((e) => !!e.token);

export function useUnlockedContentRefresh(connected: boolean): void {
    useEffect(() => {
        if (!connected) return;
        const id = `${NS}.info.vaultRevision`;
        let seen: unknown;
        const onStamp = (val: unknown) => {
            if (val === undefined || val === null) return;
            const changed = seen !== undefined && val !== seen;
            seen = val;
            if (changed && hasHeld()) scheduleRefresh();
        };
        const unsub = subscribeStateDirect(id, (state) => onStamp(state?.val));
        void getStateDirect(id).then((st) => onStamp(st?.val));
        const timer = globalThis.setInterval(() => {
            if (hasHeld()) void getStateDirect(id).then((st) => onStamp(st?.val));
        }, 30_000);
        return () => {
            unsub();
            clearInterval(timer);
        };
    }, [connected]);
}
