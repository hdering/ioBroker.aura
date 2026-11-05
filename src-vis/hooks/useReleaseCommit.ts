import { useEffect, useRef } from 'react';

/**
 * Finish a send-on-release drag no matter where or how it ends.
 *
 * A slider that writes only on release keeps the dragged value locally and shows
 * it instead of the live one until the release arrives. Listening for that release
 * on the slider alone (`mouseup`/`touchend`) misses it whenever the gesture ends
 * differently — finger lifted after the browser took the swipe as a scroll
 * (`touchcancel`), pointer released outside the element, a pen, the arrow keys,
 * the tab losing focus. The local value then stays put and covers every later
 * live update, so the widget freezes on the last dragged level (#935).
 *
 * While `active`, any of those endings anywhere in the window calls `commit`; the
 * latest `commit` is used, so it sees the current drag value.
 */
export function useReleaseCommit(active: boolean, commit: () => void): void {
    const commitRef = useRef(commit);
    commitRef.current = commit;

    useEffect(() => {
        if (!active) return;
        const finish = () => commitRef.current();
        const events = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel', 'keyup', 'blur'];
        // Deferred one task: the slider's own release handler (and the change event a
        // click on the track fires right before mouseup) run first, so the value they
        // set is the one committed — a commit already done turns this into a no-op.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onEnd = () => {
            clearTimeout(timer);
            timer = setTimeout(finish, 0);
        };
        events.forEach((e) => window.addEventListener(e, onEnd, true));
        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, onEnd, true));
        };
    }, [active]);
}
