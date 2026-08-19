/**
 * Colour thresholds, shared by every widget that offers them (Werte-Anzeige,
 * Dimmer, Rollladen, Thermostat, both lists).
 *
 * A scale is a list of `[maxExclusive, colour]` bands: the first band the value
 * stays below wins, and a value above the top threshold keeps the top band's
 * colour. The editors let the rows be entered in any order, so matching always
 * runs against a sorted copy — an unsorted scale would otherwise answer with
 * whichever row happens to sit above the value first (issue #559).
 */

export type ColorThreshold = [number, string];

/** Ascending copy — never sorts in place, the config arrays are shared state. */
export function sortColorThresholds(thresholds: readonly ColorThreshold[]): ColorThreshold[] {
    return [...thresholds].sort((a, b) => a[0] - b[0]);
}

/** The colour for `val`, or undefined for an empty scale / a non-numeric value. */
export function getThresholdColor(val: unknown, thresholds?: readonly ColorThreshold[]): string | undefined {
    if (!thresholds?.length) return undefined;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    if (isNaN(num)) return undefined;
    const sorted = sortColorThresholds(thresholds);
    for (const [thresh, color] of sorted) {
        if (num < thresh) return color;
    }
    return sorted[sorted.length - 1][1];
}
