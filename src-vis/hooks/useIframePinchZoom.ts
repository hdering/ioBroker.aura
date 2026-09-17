import { useEffect, useRef, type RefObject } from 'react';
import { pinchDistance, zoomFromPinch } from '../utils/iframeZoom';

/**
 * Two-finger zoom over an embedded frame. (issue #667)
 *
 * Only ever active where the host still sees the touches — i.e. with the
 * interaction blocker of `action` mode over the frame. An operable cross-document
 * iframe consumes its own touch events and the embedder never learns they
 * happened, so there is nothing to listen to; those modes keep the +/− controls.
 *
 * The listeners are native and non-passive because React registers `touchmove` on
 * the root as passive, where `preventDefault()` is a no-op — and without it the
 * browser answers the pinch by zooming the whole dashboard.
 *
 * `onPreview` fires per frame, `onCommit` once the fingers leave: persisting the
 * level belongs to the end of the gesture, not to every move.
 */
export function useIframePinchZoom(
    ref: RefObject<HTMLElement | null>,
    enabled: boolean,
    getZoom: () => number,
    onPreview: (percent: number) => void,
    onCommit: (percent: number) => void,
): void {
    const cb = useRef({ getZoom, onPreview, onCommit });
    cb.current = { getZoom, onPreview, onCommit };

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;

        let startDistance = 0;
        let base = 100;
        let latest = 100;

        const onStart = (e: TouchEvent) => {
            if (e.touches.length !== 2) return;
            startDistance = pinchDistance(e.touches[0], e.touches[1]);
            base = cb.current.getZoom();
            latest = base;
            e.preventDefault();
        };
        const onMove = (e: TouchEvent) => {
            if (!startDistance || e.touches.length !== 2) return;
            e.preventDefault();
            latest = zoomFromPinch(base, startDistance, pinchDistance(e.touches[0], e.touches[1]));
            cb.current.onPreview(latest);
        };
        const onEnd = () => {
            if (!startDistance) return;
            startDistance = 0;
            if (latest !== base) cb.current.onCommit(latest);
        };

        el.addEventListener('touchstart', onStart, { passive: false });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
        el.addEventListener('touchcancel', onEnd);
        return () => {
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
            el.removeEventListener('touchcancel', onEnd);
        };
    }, [ref, enabled]);
}
