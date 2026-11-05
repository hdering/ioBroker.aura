// The card's inner padding of one widget (#928).
//
// The layout sets one "Innenabstand der Widgets" for every card; a widget may
// override it with options.paddingY (top and bottom) and options.paddingX (left
// and right) — a slim bar of chips next to normal tiles, a chart that runs to
// the edge. Unset = the layout's value. Everything that does padding arithmetic
// (the frame, content auto-height, the group hug) reads it from here, so the
// grid rows a card asks for match the padding it draws.

/** Upper bound of a per-widget padding — more is a layout mistake, not a padding. */
export const CARD_PAD_MAX = 64;

function own(v: unknown): number | undefined {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(CARD_PAD_MAX, Math.round(n))) : undefined;
}

/** Padding top/bottom (y) and left/right (x) in px: the widget's own, else the layout's. */
export function cardPadding(options: Record<string, unknown> | undefined, layoutPad: number): { y: number; x: number } {
    return { y: own(options?.paddingY) ?? layoutPad, x: own(options?.paddingX) ?? layoutPad };
}
