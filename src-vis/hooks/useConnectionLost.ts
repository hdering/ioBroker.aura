import { useEffect, useState } from 'react';
import { getDisconnectedSince, onDisconnectedSinceChange } from './useIoBroker';
import { isScreenshotMode } from '../store/persistManager';

/** How long the socket may be gone before the dashboard admits it. The web adapter
 *  recycles the connection every few minutes and a reconnect takes well under a
 *  second — that must not flash a warning across every widget. */
export const CONNECTION_LOST_GRACE_MS = 5000;

// The screenshot harness runs against a dead proxy target on purpose, so in
// screenshot mode the real socket state is ignored — every shot would otherwise
// come out greyed with the offline banner. `__auraShot.connectionLost(true)`
// fakes an outage for the test that exercises it.
let forcedSince: number | null = null;
const forcedListeners = new Set<() => void>();

export function __devForceConnectionLost(on: boolean): void {
    forcedSince = on ? Date.now() - 60_000 : null;
    forcedListeners.forEach((fn) => fn());
}

function currentSince(): number | null {
    return isScreenshotMode() ? forcedSince : getDisconnectedSince();
}

/**
 * Epoch ms since which the connection to ioBroker is lost, once that has lasted
 * longer than the grace period — null while connected (or still within the grace).
 *
 * Everything on screen keeps showing the last value it received, which is the right
 * thing to render but the wrong thing to believe: a status widget then still says
 * "all fine" although nothing is being watched any more.
 */
export function useConnectionLost(graceMs = CONNECTION_LOST_GRACE_MS): number | null {
    const [since, setSince] = useState(currentSince);
    const [expired, setExpired] = useState(() => {
        const s = currentSince();
        return s !== null && Date.now() - s >= graceMs;
    });

    useEffect(() => {
        const sync = () => setSince(currentSince());
        sync();
        forcedListeners.add(sync);
        const off = onDisconnectedSinceChange(sync);
        return () => {
            forcedListeners.delete(sync);
            off();
        };
    }, []);

    useEffect(() => {
        if (since === null) {
            setExpired(false);
            return;
        }
        const left = since + graceMs - Date.now();
        if (left <= 0) {
            setExpired(true);
            return;
        }
        setExpired(false);
        const t = setTimeout(() => setExpired(true), left);
        return () => clearTimeout(t);
    }, [since, graceMs]);

    return expired ? since : null;
}
