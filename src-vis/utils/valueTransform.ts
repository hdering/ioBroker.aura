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

// ── Drawing a value below the zero line (issue #594) ─────────────────────────────────────────
//
// "Show as negative" — feed-in and battery charging are logged as positive numbers and belong
// under the axis — is kept as the SIGN of `valueFactor`, not as a flag of its own. Every consumer
// of the factor then gets it without knowing about it, and it composes with a unit conversion:
// Wh → kWh drawn downwards is simply ×−0.001. Magnitude and sign are edited separately, so the
// two halves are split out here rather than being re-derived at each call site.

/** The sign a value is drawn with. Anything but a genuinely negative factor is upwards. */
export function transformSign(factor?: number): 1 | -1 {
    return typeof factor === 'number' && Number.isFinite(factor) && factor < 0 ? -1 : 1;
}

/** The conversion without its sign — `undefined` where no factor is configured. */
export function transformMagnitude(factor?: number): number | undefined {
    return typeof factor === 'number' && Number.isFinite(factor) ? Math.abs(factor) : undefined;
}

/** What a transform patch may carry; `unit` is a suggestion the caller may ignore. */
export interface ValueTransformPatchCore {
    valueTransform?: string;
    valueFactor?: number;
    valueOffset?: number;
    unit?: string;
}

/**
 * Which entry of the dropdown is showing. The stored preset id wins (several presets share a
 * factor, e.g. Wh→kWh and W→kW are both ×0.001); older configs fall back to matching, on the
 * MAGNITUDE — so a plain ×−1 reads as "Keine, negativ" instead of pushing the list to "Eigene…".
 */
export function selectedTransformPreset(presetId?: string, factor?: number, offset?: number): string {
    if (presetId === 'custom') return 'custom';
    if (presetId && VALUE_TRANSFORM_PRESETS.some((p) => p.id === presetId)) return presetId;
    return matchValueTransformPreset(transformMagnitude(factor), offset);
}

/** Picking a conversion — it carries the sign over, or "Wh → kWh" would undo the inversion. */
export function chooseTransformPreset(
    id: string,
    current: { factor?: number; offset?: number },
    explicitNone = false,
): ValueTransformPatchCore {
    const sign = transformSign(current.factor);
    if (id === 'custom') {
        return { valueTransform: 'custom', valueFactor: current.factor ?? sign, valueOffset: current.offset };
    }
    const p = VALUE_TRANSFORM_PRESETS.find((x) => x.id === id);
    if (!p || p.id === 'none') {
        // "Keine" and negative still is a conversion — ×−1 — so it must not be stored as the
        // literal 'none', which `resolveValueTransform` reads as "switch the wider default off"
        // and which would throw the sign away with it.
        return {
            valueTransform: sign === -1 ? undefined : explicitNone ? 'none' : undefined,
            valueFactor: sign === -1 ? -1 : undefined,
            valueOffset: undefined,
        };
    }
    return { valueTransform: p.id, valueFactor: p.factor * sign, valueOffset: p.offset || undefined, unit: p.unit };
}

/** Flipping the "negative" checkbox: the magnitude and the chosen preset stay put. */
export function toggleTransformSign(current: {
    factor?: number;
    offset?: number;
    presetId?: string;
}): ValueTransformPatchCore {
    const next = -(current.factor ?? 1);
    // Back at a plain ×1 nothing is configured any more — drop the factor rather than store the
    // no-op. 'none' may only stand again once there is no factor left for it to switch off.
    const plain = next === 1 && current.offset === undefined;
    return {
        valueTransform: plain || current.presetId !== 'none' ? current.presetId : undefined,
        valueFactor: plain ? undefined : next,
        valueOffset: current.offset,
    };
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
