/**
 * Display-only value transformation.
 *
 * Applies `displayValue = rawValue * factor + offset` to numeric values before
 * formatting. The underlying datapoint is never modified — this only affects
 * what the widget shows. Non-numeric values pass through unchanged.
 */

export interface ValueTransformPreset {
    id: string;
    label: string;
    factor: number;
    offset: number;
    /** Suggested target unit, auto-filled into the unit field when selected (where applicable). */
    unit?: string;
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
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    return value * num(factor, 1) + num(offset, 0);
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
