/**
 * Tick scale for a slider (#643).
 *
 * The three slider implementations — the Schieberegler widget, the list rows
 * (`entryControls.tsx`) and the universal widget's slider cell — all want the
 * same scale under the track: a mark per step and a number on as many of them
 * as fit. The positions and the thinning live here so all three agree, and so
 * the arithmetic can be tested without a browser.
 */

export type SliderTick = {
    /** Value at this tick. */
    value: number;
    /** Position along the track, 0 = min, 1 = max. */
    ratio: number;
    /** Whether this tick carries a printed number. */
    labeled: boolean;
};

/**
 * Never draw more marks than this. A 0…255 dimmer at step 1 would otherwise
 * cost 256 nodes per slider — above the cap only the labelled positions are
 * drawn, on a round raster.
 */
export const MAX_TICK_MARKS = 120;

/** Label intervals that read well; the smallest one that fits is taken. */
const NICE_EVERY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Decimals implied by the step, so a step of 0.5 prints "21.5" and 1 prints "22". */
export function stepDecimals(step: number): number {
    if (!Number.isFinite(step) || Math.floor(step) === step) return 0;
    return Math.min(4, (String(step).split('.')[1] ?? '').length);
}

function roundTo(v: number, dec: number): number {
    const f = Math.pow(10, dec);
    return Math.round(v * f) / f;
}

/**
 * Smallest 1/2/5·10ⁿ interval that is at least `rough`, snapped up to a whole
 * multiple of `step` — a scale must not promise values the slider cannot take.
 */
export function niceInterval(rough: number, step: number): number {
    if (!(rough > 0) || !(step > 0)) return step > 0 ? step : 1;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    let chosen = pow * 10;
    for (const m of [1, 2, 5, 10]) {
        if (pow * m >= rough - 1e-9) {
            chosen = pow * m;
            break;
        }
    }
    return Math.max(step, Math.ceil(chosen / step - 1e-9) * step);
}

export type SliderTicksInput = {
    min: number;
    max: number;
    step: number;
    /** Label every n-th step. Empty/0 → as many labels as the track fits. */
    labelEvery?: number;
    /** Measured track length in px, thumb inset already deducted. 0 = not measured yet. */
    trackPx?: number;
    /** Room one label needs along the track, including the gap to its neighbour. */
    labelPx?: number;
};

/**
 * Tick positions for one slider. Min and max always carry a number — a scale
 * with blank ends says nothing about the range.
 */
export function sliderTicks({ min, max, step, labelEvery, trackPx = 0, labelPx = 28 }: SliderTicksInput): SliderTick[] {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const span = max - min;
    const raw = Number.isFinite(step) && step > 0 ? step : span / 10;
    const round = (v: number) => roundTo(v, stepDecimals(raw) + 4);

    // How many numbers fit. Before the first measurement assume a roomy track,
    // so a freshly mounted scale does not flash a min/max-only state.
    const budget = trackPx > 0 ? Math.max(2, Math.floor(trackPx / Math.max(1, labelPx)) + 1) : 11;

    const steps = span / raw;
    const stepCount = Math.round(steps);
    const onGrid = Math.abs(steps - stepCount) < 1e-6 && stepCount >= 1;

    const wanted = labelEvery && labelEvery >= 1 ? Math.floor(labelEvery) : 0;
    const every = wanted || niceEvery(Math.ceil(stepCount / Math.max(1, budget - 1)), stepCount);

    // Too fine for a mark per step (or a range that does not end on a step):
    // draw marks only where a number stands.
    if (!onGrid || stepCount > MAX_TICK_MARKS) {
        const iv = wanted ? wanted * raw : niceInterval(span / Math.max(1, budget - 1), raw);
        const out: SliderTick[] = [];
        const n = Math.min(MAX_TICK_MARKS, Math.floor(span / iv + 1e-9));
        for (let i = 0; i <= n; i++) {
            const v = round(min + i * iv);
            if (v >= max - iv * 0.5) break;
            out.push({ value: v, ratio: (v - min) / span, labeled: true });
        }
        out.push({ value: round(max), ratio: 1, labeled: true });
        return out;
    }

    const out: SliderTick[] = [];
    for (let i = 0; i <= stepCount; i++) {
        out.push({ value: round(min + i * raw), ratio: i / stepCount, labeled: i % every === 0 });
    }
    out[0].labeled = true;
    const last = out.length - 1;
    if (!out[last].labeled) {
        out[last].labeled = true;
        // …but not crowded against the label before it.
        for (let i = last - 1; i > 0 && last - i < every; i--) out[i].labeled = false;
    }
    return out;
}

/**
 * Round `needed` up to a readable label interval. A divisor of `stepCount` wins,
 * even a plain one like 3: it makes the last number land on max instead of
 * beside it, which is what turns "1 3 5 7 10" into "1 4 7 10".
 */
function niceEvery(needed: number, stepCount: number): number {
    const n = Math.max(1, needed);
    for (let d = n; d <= n * 2 && d <= stepCount; d++) if (stepCount % d === 0) return d;
    const fits = NICE_EVERY.filter((c) => c >= n);
    return fits.find((c) => stepCount % c === 0) ?? fits[0] ?? n;
}
