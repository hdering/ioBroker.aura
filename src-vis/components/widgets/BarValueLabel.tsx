import type { CSSProperties, ReactNode } from 'react';

/** Where a value bar prints its number: over the bar or next to it (#719). */
export type BarValuePlacement = 'inside' | 'outside';

/** Fallback text colours of a value printed inside the bar (#720). */
export const BAR_VALUE_FILLED_COLOR = '#ffffff';
export const BAR_VALUE_EMPTY_COLOR = 'var(--text-primary)';

/**
 * The value printed over a bar in two colours — one over the filled part, one over
 * the empty rest (#720). A single colour is unreadable on one side or the other as
 * soon as fill and track differ much in brightness; black ink with white text reads,
 * the same white on the light grey track does not.
 *
 * Drawn twice on top of each other: the lower copy in the "empty" colour, the upper
 * one in the "filled" colour and clipped to the filled share. Both copies share the
 * same box, so the glyphs line up exactly and the colour changes right at the edge
 * of the fill — including a digit that straddles it.
 *
 * Shared by the fill widget's bar layout and the Universal widget's progress cell,
 * so the two cannot drift apart.
 */
export function BarValueLabel({
    ratio,
    vertical,
    filledColor,
    emptyColor,
    textStyle,
    children,
}: {
    /** Filled share, 0 … 1. */
    ratio: number;
    vertical: boolean;
    filledColor: string;
    emptyColor: string;
    /** Font styling shared by both copies (size, weight …); its `color` is ignored. */
    textStyle?: CSSProperties;
    children: ReactNode;
}) {
    const r = Math.max(0, Math.min(1, ratio));
    const rest = `${((1 - r) * 100).toFixed(3)}%`;
    // Font first, box after: a cell's text style carries position/z-index of its own
    // (allowOverflow), and a spread `position: undefined` would unpin both copies.
    const layer = (color: string, clip?: string): CSSProperties => ({
        ...textStyle,
        position: 'absolute',
        inset: 0,
        zIndex: undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        paddingBottom: undefined,
        color,
        ...(clip ? { clipPath: clip } : null),
    });
    return (
        <>
            <div data-aura-bar-value="empty" style={layer(emptyColor)}>
                {children}
            </div>
            <div
                data-aura-bar-value="filled"
                aria-hidden
                style={layer(filledColor, vertical ? `inset(${rest} 0 0 0)` : `inset(0 ${rest} 0 0)`)}
            >
                {children}
            </div>
        </>
    );
}
