/**
 * Slat tilt (Neigung) maths shared by the shutter widget, its popup body and the
 * tilt popover.
 *
 * Devices report the slat angle on very different scales — 0…100 %, 0…1 (hm-rpc
 * without scaling), -90…90 or 0…180 degrees — and some count the other way
 * round. Everything above the datapoint layer therefore works with one fixed
 * convention:
 *
 *   0 % = slats closed (no view through), 100 % = slats open / horizontal.
 *
 * `tiltMin`/`tiltMax`/`invertTilt` map that convention onto the device.
 */

export interface TiltRange {
    /** Raw value that means "slats closed" (before `invert`). */
    min: number;
    /** Raw value that means "slats open" (before `invert`). */
    max: number;
    invert: boolean;
}

export const clampPct = (v: number): number => Math.max(0, Math.min(100, v));

export function tiltRange(opts: Record<string, unknown> | undefined): TiltRange {
    const min = typeof opts?.tiltMin === 'number' ? (opts.tiltMin as number) : 0;
    const max = typeof opts?.tiltMax === 'number' ? (opts.tiltMax as number) : 100;
    return { min, max, invert: !!opts?.invertTilt };
}

/** Raw datapoint value → 0…100 %. Null while the DP holds no finite number. */
export function rawToTiltPct(raw: unknown, r: TiltRange): number | null {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const span = r.max - r.min || 1;
    const pct = ((raw - r.min) / span) * 100;
    return clampPct(r.invert ? 100 - pct : pct);
}

/** 0…100 % → raw datapoint value. Spans of 1 or less keep three decimals. */
export function tiltPctToRaw(pct: number, r: TiltRange): number {
    const span = r.max - r.min || 1;
    const p = r.invert ? 100 - clampPct(pct) : clampPct(pct);
    const raw = r.min + (p / 100) * span;
    return Math.abs(span) <= 1 ? Math.round(raw * 1000) / 1000 : Math.round(raw);
}
