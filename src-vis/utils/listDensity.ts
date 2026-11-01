/**
 * Row density of the static and dynamic list (#890).
 *
 * The vertical padding of a row is fixed px — only the text inside it grows with
 * the font scale — so a long list stays airy however small the text is set.
 * Three steps instead of a free value: the metrics measure each one, and
 * aura_measure adds the measured delta instead of guessing a curve.
 */
export type ListRowDensity = 'compact' | 'normal' | 'comfortable';

export const LIST_ROW_DENSITIES: readonly ListRowDensity[] = ['compact', 'normal', 'comfortable'];

/** Vertical padding of a row in the standard layout (`normal` is the old fixed py-2). */
const STANDARD_PAD_Y: Record<ListRowDensity, string> = {
    compact: 'py-1',
    normal: 'py-2',
    comfortable: 'py-3',
};

/** Vertical padding of a cell in the two-column compact layout (`normal` is the old py-1.5). */
const COMPACT_PAD_Y: Record<ListRowDensity, string> = {
    compact: 'py-0.5',
    normal: 'py-1.5',
    comfortable: 'py-2.5',
};

function normalize(d: unknown): ListRowDensity {
    return d === 'compact' || d === 'comfortable' ? d : 'normal';
}

export function standardRowPadY(d: unknown): string {
    return STANDARD_PAD_Y[normalize(d)];
}

export function compactCellPadY(d: unknown): string {
    return COMPACT_PAD_Y[normalize(d)];
}
