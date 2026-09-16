/**
 * dpScale — the value range a widget takes over from the datapoint it shows.
 *
 * ioBroker objects carry their working range in `common.min` / `common.max`: a
 * room setpoint runs 10…30 °C, an AV receiver's volume -80.5…16.5 dB. Widgets
 * with a fixed scale (Gauge, Drehregler, Füllstand, Schieberegler) used to start
 * on the placeholder 0…100 no matter what the object said, so a 21 °C setpoint
 * sat just above the bottom of the dial and dragging it wrote 0…100 back into a
 * datapoint that only accepts 10…30 (issue #665).
 *
 * The range is copied into the widget's options once — when the widget is
 * created from a datapoint, and when its datapoint is exchanged while the scale
 * is still the untouched default. It is never copied over bounds somebody typed
 * in themselves: `scalePatchFromDatapoint` leaves those alone.
 */
import type { DatapointEntry } from '../hooks/useDatapointList';

/** Option keys a widget type uses for its scale, plus the values it falls back to. */
const SCALE_KEYS: Record<
    string,
    { min: string; max: string; step?: string; defaultMin?: number; defaultMax?: number; defaultStep?: number }
> = {
    gauge: { min: 'minValue', max: 'maxValue', defaultMin: 0, defaultMax: 100 },
    knob: { min: 'minValue', max: 'maxValue', step: 'step', defaultMin: 0, defaultMax: 100, defaultStep: 1 },
    fill: { min: 'minValue', max: 'maxValue', defaultMin: 0, defaultMax: 100 },
    slider: { min: 'min', max: 'max', step: 'step', defaultMin: 0, defaultMax: 100, defaultStep: 1 },
    // Number input: no scale of its own, the bounds are optional and unset by default.
    input: { min: 'min', max: 'max', step: 'step' },
};

/** Widget types that show a value on a scale and can adopt the datapoint's range. */
export function hasScaleFromDatapoint(type: string | undefined): boolean {
    return !!type && type in SCALE_KEYS;
}

function finite(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** The datapoint's own range, or null when it declares none usable. */
type DpRange = { min: number; max: number; step?: number };

function rangeOf(entry: Pick<DatapointEntry, 'min' | 'max' | 'step'> | null | undefined): DpRange | null {
    if (!entry) return null;
    const min = finite(entry.min);
    const max = finite(entry.max);
    // A range needs both ends and has to be a range — an object that reports
    // min 0 / max 0 (or max below min) says nothing a widget could scale into.
    if (min === undefined || max === undefined || max <= min) return null;
    const step = finite(entry.step);
    return step !== undefined && step > 0 ? { min, max, step } : { min, max };
}

/**
 * Options for a widget that is being created on `entry` — the full range, since
 * there is nothing yet that could be overwritten. `{}` when the type has no
 * scale or the datapoint declares no usable range.
 */
export function scaleOptionsFromDatapoint(
    type: string | undefined,
    entry: Pick<DatapointEntry, 'min' | 'max' | 'step'> | null | undefined,
): Record<string, number> {
    const keys = type ? SCALE_KEYS[type] : undefined;
    const range = rangeOf(entry);
    if (!keys || !range) return {};
    const out: Record<string, number> = { [keys.min]: range.min, [keys.max]: range.max };
    if (keys.step && range.step !== undefined) out[keys.step] = range.step;
    return out;
}

/** An option is free to be filled when it is unset or still on the type's default. */
function untouched(current: unknown, fallback: number | undefined): boolean {
    return current === undefined || current === null || (fallback !== undefined && current === fallback);
}

/**
 * Options for a widget whose datapoint is being exchanged. Min and max are only
 * written when BOTH are still untouched — a scale somebody set by hand stays put,
 * and a half-adopted range (new min, old max) can never happen.
 */
export function scalePatchFromDatapoint(
    type: string | undefined,
    entry: Pick<DatapointEntry, 'min' | 'max' | 'step'> | null | undefined,
    options: Record<string, unknown> | undefined,
): Record<string, number> {
    const keys = type ? SCALE_KEYS[type] : undefined;
    const range = rangeOf(entry);
    if (!keys || !range) return {};
    const o = options ?? {};
    if (!untouched(o[keys.min], keys.defaultMin) || !untouched(o[keys.max], keys.defaultMax)) return {};
    const out: Record<string, number> = { [keys.min]: range.min, [keys.max]: range.max };
    if (keys.step && range.step !== undefined && untouched(o[keys.step], keys.defaultStep)) {
        out[keys.step] = range.step;
    }
    return out;
}
