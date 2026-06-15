/**
 * Synthetic preview data for the popup editor.
 *
 * A chart placed in a popup view binds to a {{placeholder}} datapoint that only
 * resolves when the popup actually opens (against the triggering widget). In the
 * admin editor there is no trigger, so real history cannot be loaded. To still give
 * editors a representative preview, these helpers generate a smooth, deterministic
 * sample series. Used only in edit mode — never on the live frontend.
 */

const SAMPLE_POINTS = 48;
const SAMPLE_RANGE_MS = 86_400_000; // 24 h

/** `[timestamp, value][]` over the last 24 h. `seed` varies the curve so multiple
 *  series in one chart look distinct. Deterministic for a given seed (no randomness). */
export function samplePreviewSeries(seed = 0, now = Date.now()): [number, number][] {
    const step = SAMPLE_RANGE_MS / (SAMPLE_POINTS - 1);
    const base = 18 + seed * 4;
    const out: [number, number][] = [];
    for (let i = 0; i < SAMPLE_POINTS; i++) {
        const t = Math.round(now - SAMPLE_RANGE_MS + step * i);
        const phase = (i / SAMPLE_POINTS) * Math.PI * 2;
        const v = base + Math.sin(phase + seed) * 5 + Math.sin(phase * 3.3 + seed * 2) * 1.5;
        out.push([t, Math.round(v * 10) / 10]);
    }
    return out;
}

/** Same sample as `samplePreviewSeries`, shaped as `{ t, v }[]` for the simple ChartWidget. */
export function samplePreviewHistory(seed = 0, now = Date.now()): { t: number; v: number }[] {
    return samplePreviewSeries(seed, now).map(([t, v]) => ({ t, v }));
}
