import { useState, useRef, useEffect, useCallback } from 'react';

// ── Scrollable horizontal row + custom "more content" indicator ───────────────
// Wraps a horizontally scrolling row. On mobile the native (flickering, low)
// scrollbar is hidden and replaced with a static thumb that tracks the scroll
// position and sits just under the content. See .aura-tab-scroll-* in index.css.
// Shared by the tab bar and the docked horizontal section bar so both scroll and
// hide the mobile scrollbar identically.
//
// `activeKey` keeps the active entry in view (#979): whenever it changes, the row
// scrolls the child marked `data-aura-active` to its middle - smoothly, except for
// the very first time (page load). A row the user moved by hand stays where it is
// until the active entry changes again.

export function ScrollRow({
    isMobile,
    hideIndicator = false,
    outerClassName = '',
    scrollClassName = '',
    activeKey,
    children,
}: {
    isMobile: boolean;
    hideIndicator?: boolean;
    outerClassName?: string;
    scrollClassName?: string;
    activeKey?: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [ind, setInd] = useState<{ show: boolean; left: number; width: number }>({
        show: false,
        left: 0,
        width: 0,
    });

    const recompute = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const { scrollWidth, clientWidth, scrollLeft } = el;
        const overflow = scrollWidth - clientWidth;
        if (overflow <= 2) {
            setInd((p) => (p.show ? { show: false, left: 0, width: 0 } : p));
            return;
        }
        const width = Math.max((clientWidth / scrollWidth) * 100, 15);
        const left = (scrollLeft / overflow) * (100 - width);
        setInd({ show: true, left, width });
    }, []);

    // Key the row was last centred on, and whether the user has moved it by hand since.
    const centeredKey = useRef<string | undefined>(undefined);
    const userMoved = useRef(false);

    const centerActive = useCallback((smooth: boolean): boolean => {
        const el = ref.current;
        if (!el) return false;
        const active = el.querySelector<HTMLElement>('[data-aura-active]');
        if (!active) return false;
        const overflow = el.scrollWidth - el.clientWidth;
        if (overflow <= 2) return true;
        const sr = el.getBoundingClientRect();
        const ar = active.getBoundingClientRect();
        const target = el.scrollLeft + (ar.left - sr.left) - (el.clientWidth - ar.width) / 2;
        const left = Math.max(0, Math.min(overflow, Math.round(target)));
        if (Math.abs(left - el.scrollLeft) < 1) return true;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
        return true;
    }, []);

    useEffect(() => {
        if (activeKey === undefined || activeKey === centeredKey.current) return;
        const first = centeredKey.current === undefined;
        // After the paint, so the new tab's own styles (bold, padding) are in its width.
        const raf = requestAnimationFrame(() => {
            if (centerActive(!first)) {
                centeredKey.current = activeKey;
                userMoved.current = false;
            }
        });
        return () => cancelAnimationFrame(raf);
    }, [activeKey, centerActive]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        recompute();
        const onResize = () => {
            recompute();
            // Icons and fonts arrive after the first paint and shift the tabs. Until the
            // user touches the row, keep the active entry in the middle; an entry that
            // only shows up later (condition, slow mount) is centred once it exists.
            if (activeKey === undefined || userMoved.current) return;
            if (centerActive(false)) centeredKey.current = activeKey;
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        const inner = el.firstElementChild;
        if (inner) ro.observe(inner);
        el.addEventListener('scroll', recompute, { passive: true });
        const onUser = () => {
            userMoved.current = true;
        };
        el.addEventListener('pointerdown', onUser, { passive: true });
        el.addEventListener('wheel', onUser, { passive: true });
        el.addEventListener('touchstart', onUser, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener('scroll', recompute);
            el.removeEventListener('pointerdown', onUser);
            el.removeEventListener('wheel', onUser);
            el.removeEventListener('touchstart', onUser);
        };
    }, [recompute, centerActive, activeKey]);

    // Outer must be a flex container so the scroll row is stretched to the bar height
    // via align-items:stretch. The scroll row carries .aura-badge-room (padding 14 /
    // margin -14 so corner badges aren't clipped); when stretched, that yields a content
    // box equal to the bar height, so its inner `items-center` centers the content. A fixed
    // height (h-full) would shrink the content box by the 28px padding and break both the
    // centering and clip the vertical axis — do not add one.
    return (
        <div className={`relative flex ${outerClassName}`}>
            <div
                ref={ref}
                className={`aura-scroll aura-badge-room overflow-x-auto ${isMobile ? 'aura-tab-scroll--mobile' : ''} ${scrollClassName}`}
            >
                {children}
            </div>
            {isMobile && !hideIndicator && ind.show && (
                <div className="aura-tab-scroll-ind" style={{ left: `${ind.left}%`, width: `${ind.width}%` }} />
            )}
        </div>
    );
}
