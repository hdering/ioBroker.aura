/**
 * Display-only value transformation.
 *
 * Applies `displayValue = rawValue * factor + offset` to numeric values before
 * formatting. The underlying datapoint is never modified — this only affects
 * what the widget shows. Non-numeric values pass through unchanged.
 */

import { hasTimeDisplay } from './timeDisplay';

export interface ValueTransformPreset {
    id: string;
    label: string;
    factor: number;
    offset: number;
    /** Suggested target unit, auto-filled into the unit field when selected (where applicable). */
    unit?: string;
}

/**
 * The option keys a transform is stored under. Identical on the widget options
 * (Werte-Anzeige) and on a list entry, so both can be fed to the same editor.
 */
export interface ValueTransformSettings {
    /** Preset id, 'custom', or 'none' — the latter switches a list-wide default off. */
    valueTransform?: string;
    valueFactor?: number;
    valueOffset?: number;
    /** Time output preset id (or 'custom'); undefined / 'none' = plain value. */
    valueTimeFormat?: string;
    /** Token pattern, only used when `valueTimeFormat` is 'custom'. */
    valueTimePattern?: string;
}

export interface ResolvedValueTransform {
    factor?: number;
    offset?: number;
    timeFormat?: string;
    timePattern?: string;
    /** True when anything is configured at all — callers can keep their untouched path. */
    active: boolean;
}

/** Built-in conversions so users don't have to compute factors themselves. */
export const VALUE_TRANSFORM_PRESETS: ValueTransformPreset[] = [
    { id: 'none', label: 'Keine', factor: 1, offset: 0 },
    { id: 's-min', label: 'Sekunden → Minuten', factor: 1 / 60, offset: 0, unit: 'min' },
    { id: 's-h', label: 'Sekunden → Stunden', factor: 1 / 3600, offset: 0, unit: 'h' },
    { id: 'ms-s', label: 'Millisekunden → Sekunden', factor: 1 / 1000, offset: 0, unit: 's' },
    { id: 'wh-kwh', label: 'Wh → kWh', factor: 0.001, offset: 0, unit: 'kWh' },
    { id: 'w-kw', label: 'W → kW', factor: 0.001, offset: 0, unit: 'kW' },
    { id: 'b-kb', label: 'Bytes → KB', factor: 1 / 1024, offset: 0, unit: 'KB' },
    { id: 'b-mb', label: 'Bytes → MB', factor: 1 / (1024 * 1024), offset: 0, unit: 'MB' },
    { id: 'b-gb', label: 'Bytes → GB', factor: 1 / (1024 * 1024 * 1024), offset: 0, unit: 'GB' },
    { id: 'ratio-pct', label: '0..1 → Prozent', factor: 100, offset: 0, unit: '%' },
    { id: 'c-f', label: '°C → °F', factor: 1.8, offset: 32, unit: '°F' },
];

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Applies factor/offset to a numeric value; non-numeric values pass through unchanged. */
export function applyValueTransform<T>(value: T, factor?: number, offset?: number): T | number {
    // No transform configured → never touch the value. Coercing here would turn a
    // genuine string DP (e.g. "0x004", which Number() parses as hex → 4) into a
    // number and silently rewrite what the user sees (issue #494).
    const hasFactor = typeof factor === 'number' && Number.isFinite(factor) && factor !== 1;
    const hasOffset = typeof offset === 'number' && Number.isFinite(offset) && offset !== 0;
    if (!hasFactor && !hasOffset) return value;
    // Some adapters (e.g. upnp) store number datapoints as strings — coerce those
    // so the transform still applies. Genuine text values pass through unchanged.
    let n: number | null = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        n = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) n = parsed;
    }
    if (n === null) return value;
    return n * num(factor, 1) + num(offset, 0);
}

function close(a: number, b: number): boolean {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Returns the preset id matching the given factor/offset, or 'custom' if none matches. */
export function matchValueTransformPreset(factor?: number, offset?: number): string {
    const f = num(factor, 1);
    const o = num(offset, 0);
    const hit = VALUE_TRANSFORM_PRESETS.find((p) => close(p.factor, f) && close(p.offset, o));
    return hit ? hit.id : 'custom';
}

/**
 * Merge a per-datapoint transform with a list-wide default. The two halves
 * (factor/offset and time format) resolve independently, each taken as a whole
 * from whichever level configured it — an explicitly selected 'none' on the
 * datapoint switches the corresponding list default off for that entry.
 */
export function resolveValueTransform(
    own?: ValueTransformSettings,
    listDefault?: ValueTransformSettings,
): ResolvedValueTransform {
    const ownsScale =
        own?.valueTransform !== undefined || own?.valueFactor !== undefined || own?.valueOffset !== undefined;
    const scale = ownsScale ? own! : (listDefault ?? {});
    const scaleOff = scale.valueTransform === 'none';

    const time = own?.valueTimeFormat !== undefined ? own : (listDefault ?? {});
    const timeFormat = hasTimeDisplay(time.valueTimeFormat) ? time.valueTimeFormat : undefined;

    const factor = scaleOff ? undefined : scale.valueFactor;
    const offset = scaleOff ? undefined : scale.valueOffset;
    return {
        factor,
        offset,
        timeFormat,
        timePattern: time.valueTimePattern,
        active: factor !== undefined || offset !== undefined || timeFormat !== undefined,
    };
}
