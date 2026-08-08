import { useEffect, useState } from 'react';
import { onWake } from '../utils/wakeSignal';

/**
 * Counter that increments every time the app wakes from standby / suspend.
 *
 * Mix it into the `key` of an embedded element to force a fresh load after the
 * device comes back — see `wakeSignal.ts` for why a stream cannot recover on
 * its own (issue #526). Returns a stable 0 while `enabled` is false, so widgets
 * with the option switched off never remount.
 */
export function useWakeReload(enabled: boolean): number {
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        return onWake(() => setNonce((n) => n + 1));
    }, [enabled]);

    return enabled ? nonce : 0;
}
