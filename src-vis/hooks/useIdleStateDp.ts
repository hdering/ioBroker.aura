import { useEffect, useRef, useState } from 'react';
import { setStateDirect, subscribeDpValue } from './useIoBroker';
import { NS } from '../utils/namespace';
import { toDelayOverride } from '../utils/idleReturn';

const IDLE_RESTART_EVENT = 'aura-idle-restart';

/**
 * Restart the idle cycle as if someone had touched the screen: `idle.active` goes
 * back to false and the idle delay starts over. A popup that closes itself calls
 * this — the screensaver popup opened by `idle.active` would otherwise leave the
 * datapoint stuck at true and never come back (#856).
 */
export function restartIdleState(): void {
    window.dispatchEvent(new Event(IDLE_RESTART_EVENT));
}

/**
 * Idle state of this device (issue #822).
 *
 * Writes `<ns>.clients.<id>.idle.active` = true once nobody has touched, clicked,
 * scrolled or typed for the idle delay, and back to false on the next input. The
 * datapoint itself does nothing — a popup trigger on it is the screensaver, a
 * script may dim the display. Kept separate from the auto-return timer (#638):
 * that one navigates and is exempted on some tabs, this one only reports.
 *
 * `<ns>.clients.<id>.idle.delay` overrides the dashboard setting for this device
 * (-1 = follow the setting, 0 = off, > 0 = seconds) — same rules as idleReturn.delay.
 *
 * Only transitions are written: a wall tablet must not hammer the instance with
 * a write per touch. A stale `true` left behind by a reload is cleared on mount.
 */
export function useIdleStateDp(opts: {
    clientId: string;
    /** The id is anchored — before that it may still be swapped for an adopted one. */
    clientReady: boolean;
    connected: boolean;
    enabled: boolean;
    delaySec: number;
}): void {
    const { clientId, clientReady, connected, enabled, delaySec } = opts;
    const activeId = `${NS}.clients.${clientId}.idle.active`;
    const delayId = `${NS}.clients.${clientId}.idle.delay`;

    const [override, setOverride] = useState<number | null>(null);
    useEffect(() => {
        setOverride(null);
        if (!clientId) return;
        return subscribeDpValue(delayId, (v) => setOverride(toDelayOverride(v)));
    }, [clientId, delayId]);

    // What the datapoint currently holds, as far as this device knows.
    const shownRef = useRef<boolean | null>(null);
    useEffect(() => {
        shownRef.current = null;
        if (!clientId) return;
        return subscribeDpValue(activeId, (v) => {
            shownRef.current = v === true || v === 'true';
        });
    }, [clientId, activeId]);

    const effDelay = override ?? (enabled ? delaySec : 0);

    useEffect(() => {
        if (!connected || !clientReady || !clientId) return;
        const write = (idle: boolean) => {
            if (shownRef.current === idle) return;
            shownRef.current = idle;
            setStateDirect(activeId, idle);
        };
        // Switched off (or a stale true from before a reload) → the device is not idle.
        if (shownRef.current) write(false);
        if (!(effDelay > 0)) return;

        let timer: ReturnType<typeof setTimeout>;
        const reset = () => {
            write(false);
            clearTimeout(timer);
            timer = setTimeout(() => write(true), effDelay * 1000);
        };
        // Same input set as the auto-return timer; `scroll` in the capture phase
        // because the dashboard scrolls inside its own container.
        const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'click', 'wheel'] as const;
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        window.addEventListener('scroll', reset, { passive: true, capture: true });
        window.addEventListener(IDLE_RESTART_EVENT, reset);
        reset();
        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
            window.removeEventListener('scroll', reset, { capture: true });
            window.removeEventListener(IDLE_RESTART_EVENT, reset);
        };
    }, [connected, clientReady, clientId, activeId, effDelay]);
}
