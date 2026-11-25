import { useEffect, useState } from 'react';

/**
 * Is the window a landscape screen no taller than `maxHeight` px — a phone turned
 * sideways (#1030)? Decided by a media query, not by reading innerHeight on every
 * resize: the phone's bars coming and going change the height by ~70 px, both
 * values stay well below the threshold, and the query only fires when the answer
 * flips. `maxHeight` ≤ 0 = never.
 */
export function useLandscapeLow(maxHeight: number): boolean {
    const query = maxHeight > 0 ? `(orientation: landscape) and (max-height: ${Math.round(maxHeight)}px)` : null;
    const read = () =>
        !!query && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(query).matches
            : false;
    const [matches, setMatches] = useState(read);
    useEffect(() => {
        if (!query || typeof window.matchMedia !== 'function') {
            setMatches(false);
            return;
        }
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}
