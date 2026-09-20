import { useEffect, useState } from 'react';

/**
 * The live `window.innerWidth`. Breakpoints that mean "device width" — the number
 * a user reads off the resolution overlay — compare against this, not against a
 * box inside the page that a docked menu or a scrollbar gutter has already
 * narrowed (#413: a 240 px section menu turned a tablet breakpoint of 768 into
 * "switches at 1024").
 */
export function useViewportWidth(): number {
    const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
    useEffect(() => {
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);
    return width;
}
