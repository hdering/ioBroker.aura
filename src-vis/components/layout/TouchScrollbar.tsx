import { useCallback, useEffect, useRef, useState } from 'react';

interface ScrollMetrics {
    hasX: boolean;
    hasY: boolean;
    thumbW: number;
    thumbX: number;
    thumbH: number;
    thumbY: number;
}

const EMPTY: ScrollMetrics = { hasX: false, hasY: false, thumbW: 0, thumbX: 0, thumbH: 0, thumbY: 0 };
const MIN_THUMB = 28; // px — keep the thumb grabbable even on very long content
const BAR = 8; // px thickness
const EDGE = 3; // px inset from the viewport edge

/**
 * Always-visible, draggable scrollbar overlay for touch devices.
 *
 * Android/iOS use overlay scrollbars that fade out, and Blink ignores
 * ::-webkit-scrollbar in overlay mode (including the DevTools device toolbar),
 * so a horizontally overflowing dashboard gives no hint it can be scrolled.
 * This renders custom thumbs that mirror `target`'s scroll position and can be
 * dragged. Mount it ONLY on coarse-pointer devices — desktop keeps native bars.
 * The parent element must be `position: relative` and the scroll `target` must
 * fill it (inset-0), so the thumbs align with the scroll viewport.
 *
 * `revision` — bump whenever the scroll content size may have changed (tab
 * switch, layout width) so the thumbs recompute without waiting for a scroll.
 */
export function TouchScrollbar({ target, revision }: { target: HTMLElement | null; revision?: string | number }) {
    const [m, setM] = useState<ScrollMetrics>(EMPTY);
    const rafRef = useRef(0);
    const dragRef = useRef<{ axis: 'x' | 'y'; start: number; startScroll: number; ratio: number } | null>(null);

    const measure = useCallback(() => {
        const el = target;
        if (!el) {
            setM(EMPTY);
            return;
        }
        const { scrollWidth, clientWidth, scrollLeft, scrollHeight, clientHeight, scrollTop } = el;
        const hasX = scrollWidth - clientWidth > 1;
        const hasY = scrollHeight - clientHeight > 1;
        const thumbW = hasX ? Math.max(MIN_THUMB, (clientWidth / scrollWidth) * clientWidth) : 0;
        const thumbX = hasX ? (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - thumbW) : 0;
        const thumbH = hasY ? Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight) : 0;
        const thumbY = hasY ? (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbH) : 0;
        setM({ hasX, hasY, thumbW, thumbX, thumbH, thumbY });
    }, [target]);

    const scheduleMeasure = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            measure();
        });
    }, [measure]);

    useEffect(() => {
        const el = target;
        if (!el) return;
        measure();
        // Second pass after layout settles (lazy widget chunks, web fonts).
        const raf = requestAnimationFrame(measure);
        el.addEventListener('scroll', scheduleMeasure, { passive: true });
        // Observe the viewport AND its children so content growth (RGL height,
        // width) is caught even without a scroll or window resize.
        const ro = new ResizeObserver(scheduleMeasure);
        ro.observe(el);
        for (const child of Array.from(el.children)) ro.observe(child);
        window.addEventListener('resize', scheduleMeasure);
        window.addEventListener('orientationchange', scheduleMeasure);
        return () => {
            cancelAnimationFrame(raf);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            el.removeEventListener('scroll', scheduleMeasure);
            ro.disconnect();
            window.removeEventListener('resize', scheduleMeasure);
            window.removeEventListener('orientationchange', scheduleMeasure);
        };
    }, [target, revision, measure, scheduleMeasure]);

    const onThumbDown = (axis: 'x' | 'y') => (e: React.PointerEvent) => {
        const el = target;
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* capture unsupported — drag still works via window-less move on the thumb */
        }
        if (axis === 'x') {
            const track = el.clientWidth - m.thumbW;
            dragRef.current = {
                axis,
                start: e.clientX,
                startScroll: el.scrollLeft,
                ratio: track > 0 ? (el.scrollWidth - el.clientWidth) / track : 0,
            };
        } else {
            const track = el.clientHeight - m.thumbH;
            dragRef.current = {
                axis,
                start: e.clientY,
                startScroll: el.scrollTop,
                ratio: track > 0 ? (el.scrollHeight - el.clientHeight) / track : 0,
            };
        }
    };

    const onThumbMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        const el = target;
        if (!d || !el) return;
        e.preventDefault();
        if (d.axis === 'x') el.scrollLeft = d.startScroll + (e.clientX - d.start) * d.ratio;
        else el.scrollTop = d.startScroll + (e.clientY - d.start) * d.ratio;
    };

    const onThumbUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* nothing captured */
        }
    };

    if (!target || (!m.hasX && !m.hasY)) return null;

    const thumbBg = 'color-mix(in srgb, var(--accent, #888) 55%, transparent)';
    const common: React.CSSProperties = {
        position: 'absolute',
        borderRadius: 99,
        background: thumbBg,
        touchAction: 'none',
        cursor: 'pointer',
        zIndex: 50,
    };

    return (
        <>
            {m.hasX && (
                <div
                    role="scrollbar"
                    aria-orientation="horizontal"
                    aria-hidden
                    onPointerDown={onThumbDown('x')}
                    onPointerMove={onThumbMove}
                    onPointerUp={onThumbUp}
                    onPointerCancel={onThumbUp}
                    style={{ ...common, bottom: EDGE, left: m.thumbX, width: m.thumbW, height: BAR }}
                />
            )}
            {m.hasY && (
                <div
                    role="scrollbar"
                    aria-orientation="vertical"
                    aria-hidden
                    onPointerDown={onThumbDown('y')}
                    onPointerMove={onThumbMove}
                    onPointerUp={onThumbUp}
                    onPointerCancel={onThumbUp}
                    style={{ ...common, right: EDGE, top: m.thumbY, width: BAR, height: m.thumbH }}
                />
            )}
        </>
    );
}
