import { useState, useRef, useEffect, useCallback } from 'react';

// ── Scrollable horizontal row + custom "more content" indicator ───────────────
// Wraps a horizontally scrolling row. On mobile the native (flickering, low)
// scrollbar is hidden and replaced with a static thumb that tracks the scroll
// position and sits just under the content. See .aura-tab-scroll-* in index.css.
// Shared by the tab bar and the docked horizontal section bar so both scroll and
// hide the mobile scrollbar identically.

export function ScrollRow({
    isMobile,
    hideIndicator = false,
    outerClassName = '',
    scrollClassName = '',
    children,
}: {
    isMobile: boolean;
    hideIndicator?: boolean;
    outerClassName?: string;
    scrollClassName?: string;
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

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        recompute();
        const ro = new ResizeObserver(recompute);
        ro.observe(el);
        const inner = el.firstElementChild;
        if (inner) ro.observe(inner);
        el.addEventListener('scroll', recompute, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener('scroll', recompute);
        };
    }, [recompute]);

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
