/**
 * Calls `onIdle` once nobody has touched the page for `ms` — the same activity the tab idle-return
 * listens to (pointer, keys, touch, wheel, scroll). `ms <= 0` = off. Used by the charts to fall
 * back to their configured range after browsing (#932); arm it only while there is something to
 * undo, so an untouched chart costs no listeners.
 */
import { useEffect, useRef } from 'react';

export function useIdleTimeout(ms: number, onIdle: () => void): void {
    const cb = useRef(onIdle);
    cb.current = onIdle;
    useEffect(() => {
        if (!(ms > 0)) return;
        let timer: ReturnType<typeof setTimeout>;
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => cb.current(), ms);
        };
        // `scroll` in the capture phase: the dashboard scrolls inside its own container (#638).
        const events = ['pointermove', 'keydown', 'touchstart', 'click', 'wheel'] as const;
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        window.addEventListener('scroll', reset, { passive: true, capture: true });
        reset();
        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
            window.removeEventListener('scroll', reset, { capture: true });
        };
    }, [ms]);
}
