import { useEffect, useState, type RefObject } from 'react';
import { resolveCssColor, needsCssResolve } from '../utils/cssColor';
import { useThemeEpoch } from '../store/themeEpoch';

/**
 * Configured colours, resolved against the DOM — for the one renderer that has
 * no CSS: the eCharts canvas.
 *
 * The theme is read at `ref`, so a layout- or section-scoped design and the
 * widget's own `styleOverride` are all included. Re-read whenever the theme epoch
 * changes — that subscription is what causes a commit at all when the user
 * switches theme; without it a chart kept the colours of the theme it mounted in
 * — and whenever the caller hands over a new `colors` array, which a caller that
 * builds it inline does on every render.
 *
 * The returned array keeps its identity while the values are unchanged, so the
 * setState in the effect cannot loop.
 *
 * Values without a token pass straight through, and a token no theme defines
 * comes back as undefined: the caller's own palette is a better answer than a
 * string the canvas silently drops.
 */
export function useResolvedColors(
    ref: RefObject<HTMLElement | null>,
    colors: readonly (string | undefined)[],
): (string | undefined)[] {
    const epoch = useThemeEpoch();
    const [resolved, setResolved] = useState<(string | undefined)[]>(() => colors.map((c) => c ?? undefined));

    useEffect(() => {
        const el = ref.current;
        const next = el
            ? (() => {
                  // One computed style for the whole list — it is the expensive part.
                  const cs = getComputedStyle(el);
                  return colors.map((c) => (needsCssResolve(c) ? resolveCssColor(c, cs) : (c ?? undefined)));
              })()
            : colors.map((c) => (needsCssResolve(c) ? undefined : (c ?? undefined)));
        setResolved((prev) => (prev.length === next.length && prev.every((p, i) => p === next[i]) ? prev : next));
        // `epoch` is what brings us here after a theme switch; `colors` is built
        // fresh by the caller on every render, so this also re-reads after a
        // styleOverride edit. The identity comparison above is what keeps a
        // setState in an effect from looping.
    }, [epoch, ref, colors]);

    return resolved;
}
