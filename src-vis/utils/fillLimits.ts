/**
 * Limits ("Grenzen") on a fill-level scale — issue #613.
 *
 * A limit is a live line across the bar: a charge ceiling, a discharge floor, a
 * priority threshold. Its value comes from its own datapoint, so the dashboard can
 * both show and MOVE it, and the sections between two limits can carry their own
 * colour and icon (the evcc battery look).
 *
 * Everything here is pure so the arithmetic can be tested without a browser: the
 * renderer only turns fractions into pixels.
 */

/** One configured limit. Everything but `id` is optional — an empty row draws nothing. */
export interface FillLimit {
    /** Stable key, also used to address the row in the editor. */
    id: string;
    label?: string;
    /** Datapoint holding the limit. Empty = the fixed `value` below. */
    datapoint?: string;
    /** Fixed limit, used when no datapoint is set. */
    value?: number;
    /** Marker/handle colour. Empty = `--accent`. */
    color?: string;
    /** Icon for the section ABOVE this limit. */
    icon?: string;
    /** Draggable at runtime. Needs `datapoint` — a fixed value is configuration. */
    editable?: boolean;
    /** Snap while dragging, in display units. */
    step?: number;
    /** Show the limit's value next to its marker. */
    showValue?: boolean;
    /** Fill colour once the live value reaches this limit. */
    reachedColor?: string;
    /** Colour of the section ABOVE this limit. */
    bandColor?: string;
}

/** A limit with its live value resolved into display space. */
export interface ResolvedLimit extends FillLimit {
    /** Display-space value. */
    at: number;
    /** Position on the scale, 0..1, clamped to the track. */
    frac: number;
    /** Can be dragged right now: own datapoint + editable + widget not read-only. */
    draggable: boolean;
    /**
     * Index in the configuration, kept through the sort. The overlay renders in THIS
     * order: the sorted order changes while a limit is dragged past its neighbour,
     * and reordering the siblings moves the handle in the DOM — which makes Chrome
     * drop the pointer capture mid-drag, so the release never arrives.
     */
    order: number;
}

/** A section of the scale between two limits (or a scale end). */
export interface FillBand {
    /** Lower edge, 0..1. */
    from: number;
    /** Upper edge, 0..1. */
    to: number;
    /** Undefined = no own colour, the section uses the normal fill colour. */
    color?: string;
    icon?: string;
}

export interface LimitScale {
    min: number;
    max: number;
}

/** Position of a display-space value on the scale, clamped to 0..1. */
export function limitFrac(at: number, { min, max }: LimitScale): number {
    if (!(max > min)) return 0;
    return Math.max(0, Math.min(1, (at - min) / (max - min)));
}

/** A number out of a datapoint value, or null when there is nothing usable yet. */
export function numericOrNull(raw: unknown): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return isNaN(n) ? null : n;
}

/**
 * Resolves the configured limits against their live datapoint values and sorts them
 * up the scale. Rows without a usable value are dropped — there is nothing to draw
 * and nothing to drag.
 *
 * `values` is keyed by datapoint ref (what useTemplateStates returns); `tx` maps a
 * raw datapoint value into display space, exactly like the widget's own value.
 */
export function resolveLimits(
    limits: FillLimit[],
    opts: {
        scale: LimitScale;
        values: Record<string, unknown>;
        /** Raw → display transform (valueFactor / valueOffset). */
        tx: (n: number) => number;
        /** Master switch: false makes every limit read-only. */
        editable: boolean;
        /**
         * Display value of the limit currently being dragged. Applied before sorting so
         * the section edges follow the handle instead of waiting for the datapoint to
         * come back — without it a dragged limit visibly lags its own marker.
         */
        override?: { id: string; at: number } | null;
    },
): ResolvedLimit[] {
    const out: ResolvedLimit[] = [];
    for (let i = 0; i < limits.length; i++) {
        const limit = limits[i];
        const dp = limit.datapoint?.trim();
        let at: number | null;
        if (opts.override && opts.override.id === limit.id) {
            at = opts.override.at;
        } else if (dp) {
            const live = numericOrNull(opts.values[dp]);
            at = live === null ? null : opts.tx(live);
        } else {
            at = numericOrNull(limit.value);
        }
        if (at === null) continue;
        out.push({
            ...limit,
            at,
            frac: limitFrac(at, opts.scale),
            draggable: opts.editable && !!dp && limit.editable !== false,
            order: i,
        });
    }
    return out.sort((a, b) => a.at - b.at);
}

/**
 * Turns N sorted limits into the N+1 sections they divide the scale into.
 *
 * The icon and colour of a limit describe the section ABOVE it, so the lowest
 * section has no limit to hang on — that is what `baseIcon` / `baseColor` are for
 * (the house symbol below evcc's lowest threshold).
 */
export function limitBands(limits: ResolvedLimit[], base?: { icon?: string; color?: string }): FillBand[] {
    if (!limits.length) return [];
    const bands: FillBand[] = [{ from: 0, to: limits[0].frac, color: base?.color, icon: base?.icon }];
    for (let i = 0; i < limits.length; i++) {
        bands.push({
            from: limits[i].frac,
            to: i + 1 < limits.length ? limits[i + 1].frac : 1,
            color: limits[i].bandColor,
            icon: limits[i].icon,
        });
    }
    return bands.filter((b) => b.to > b.from);
}

/**
 * Fill colour contributed by the highest limit the value has reached, or undefined.
 * Reads the UNCLAMPED value for the same reason `overThreshold` does (#607): a value
 * capped at `max` cannot tell "exactly at the top limit" from "well past it".
 */
export function reachedLimitColor(limits: ResolvedLimit[], value: number): string | undefined {
    if (isNaN(value)) return undefined;
    let color: string | undefined;
    for (const limit of limits) {
        if (limit.reachedColor && value >= limit.at) color = limit.reachedColor;
    }
    return color;
}

/**
 * The filled part of each section, ready to paint. Sections are clipped to the
 * current fill level, so a half-full section is drawn half — same behaviour the
 * colour zones already have.
 */
export function bandSegments(
    bands: FillBand[],
    fillFrac: number,
    fallback: string,
): { from: number; to: number; color: string }[] {
    const out: { from: number; to: number; color: string }[] = [];
    for (const band of bands) {
        const to = Math.min(band.to, fillFrac);
        if (to <= band.from) continue;
        out.push({ from: band.from, to, color: band.color || fallback });
    }
    return out;
}

/**
 * The limits directly below and above `limit`, by VALUE. Captured once when a drag
 * starts and held for its duration: reading the neighbours live would defeat the
 * clamp the moment two values touch, because the dragged limit then sorts past the
 * one that was supposed to stop it and inherits ITS neighbour instead.
 */
export function neighbourBounds(limits: ResolvedLimit[], limit: ResolvedLimit): { lower?: number; upper?: number } {
    let lower: number | undefined;
    let upper: number | undefined;
    for (const other of limits) {
        if (other.id === limit.id) continue;
        if (other.at <= limit.at && (lower === undefined || other.at > lower)) lower = other.at;
        if (other.at >= limit.at && (upper === undefined || other.at < upper)) upper = other.at;
    }
    return { lower, upper };
}

/**
 * Where a dragged limit may land: snapped to `step`, inside the scale, and — with
 * `clampNeighbours` — not past the limits either side of it. Everything in display
 * space; the caller converts back to raw before writing.
 */
export function snapLimit(
    display: number,
    opts: {
        scale: LimitScale;
        step?: number;
        /** Value of the limit below, when it must not be overtaken. */
        lower?: number;
        /** Value of the limit above, when it must not be overtaken. */
        upper?: number;
    },
): number {
    const step = opts.step && opts.step > 0 ? opts.step : 1;
    // Snap relative to the scale start, so a min of 5 with a step of 10 gives
    // 5/15/25 rather than an off-grid 10/20/30.
    const snapped = opts.scale.min + Math.round((display - opts.scale.min) / step) * step;
    let lo = opts.scale.min;
    let hi = opts.scale.max;
    if (opts.lower !== undefined) lo = Math.max(lo, opts.lower);
    if (opts.upper !== undefined) hi = Math.min(hi, opts.upper);
    // A neighbour outside the scale (or two crossed neighbours) must not produce an
    // empty range — the scale always wins.
    if (hi < lo) return Math.max(opts.scale.min, Math.min(opts.scale.max, snapped));
    return Math.max(lo, Math.min(hi, snapped));
}

/**
 * Display space back to raw, undoing valueFactor/valueOffset before the write. The
 * transform is display-only (see FillWidget), so a limit dragged to "50 %" on a
 * scale built with a factor must not write 50 into the datapoint.
 *
 * Rounded to 6 decimals: 0.1-steps through a division otherwise write
 * 30.000000000000004 into ioBroker.
 */
export function toRawLimit(display: number, factor: number, offset: number): number {
    const f = factor === 0 || !isFinite(factor) ? 1 : factor;
    return Number(((display - offset) / f).toFixed(6));
}

/** Fraction a pointer is at along the track, 0..1. */
export function pointerFrac(
    e: { clientX: number; clientY: number },
    rect: { left: number; top: number; width: number; height: number },
    orientation: 'vertical' | 'horizontal',
): number {
    const raw =
        orientation === 'vertical'
            ? rect.height > 0
                ? 1 - (e.clientY - rect.top) / rect.height
                : 0
            : rect.width > 0
              ? (e.clientX - rect.left) / rect.width
              : 0;
    return Math.max(0, Math.min(1, raw));
}
