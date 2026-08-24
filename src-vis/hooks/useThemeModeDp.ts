import { useCallback, useEffect, useState } from 'react';
import { getStateDirect, setStateDirect, subscribeStateDirect } from './useIoBroker';
import { NS } from '../utils/namespace';
import type { ThemeMode } from '../utils/themeModeCache';

const DP = `${NS}.config.themeMode.frontend`;

function toMode(val: unknown): ThemeMode | null {
    if (val === 'dark' || val === 'light') return val;
    if (val === true || val === 1) return 'dark'; // legacy boolean
    if (val === false || val === 0) return 'light'; // legacy boolean
    return null;
}

/**
 * Live value of `<ns>.config.themeMode.frontend` for the admin UI, plus a way to
 * clear it. The frontend applies this mode on top of the configured design, so
 * the admin needs it to explain why a design of the opposite brightness looks
 * like it is being ignored (#573).
 *
 * A bare subscription only yields *changes*, so the current value is primed once.
 */
export function useThemeModeDp(): { mode: ThemeMode | null; clear: () => void } {
    const [mode, setMode] = useState<ThemeMode | null>(null);

    useEffect(() => {
        let alive = true;
        const unsub = subscribeStateDirect(DP, (state) => {
            if (state?.val == null) return;
            setMode(toMode(state.val));
        });
        void getStateDirect(DP)
            .then((state) => {
                if (alive && state?.val != null) setMode(toMode(state.val));
            })
            .catch(() => {
                /* DP not created yet — no mode active */
            });
        return () => {
            alive = false;
            unsub();
        };
    }, []);

    const clear = useCallback(() => {
        setStateDirect(DP, '');
        setMode(null);
    }, []);

    return { mode, clear };
}
