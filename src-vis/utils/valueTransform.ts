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

// ── Two-way conversion for controls that also WRITE (issue #682) ──────────────────────────────
//
// A slider on a datapoint that stores seconds should be able to work in minutes: the scale, the
// step and the printed value are all minutes, and only the two ends of the pipe convert — read
// `raw × factor + offset`, write `(display − offset) ÷ factor`. That keeps every existing option
// (min/max/step/unit/scale labels) in the unit the user actually configured and leaves the
// datapoint in its own, so no helper script is needed to translate between them.

// Tidying binary-float noise (300 s × 1/60 = 5.000000000000001) is what keeps a converted control
// readable — but the two directions can't round to the same width. Cutting the DISPLAYED value to
// 12 digits already loses more than the inverse can recover: 7 s reads as 0.116666666667 min and
// writes back 7.00000000002 s. So the display keeps 15 digits, which is wide enough to invert and
// still narrow enough to swallow the noise, and only the value that actually reaches the datapoint
// is cut to 12 — nothing reads it further.
const DISPLAY_DIGITS = 15;
const WRITE_DIGITS = 12;

/** Rounds binary-float noise away at the given significant width. */
function tidy(n: number, digits: number): number {
    if (!Number.isFinite(n)) return n;
    const r = Number(n.toPrecision(digits));
    return Object.is(r, -0) ? 0 : r;
}

/**
 * Trims the binary-float noise a conversion leaves behind (300 s x 1/60 = 5.000000000000001)
 * without rounding the value itself away. For display paths that have no decimal-places
 * setting of their own to fall back on.
 */
export function tidyDisplayNumber(n: number): number {
    return tidy(n, DISPLAY_DIGITS);
}

/** Inverse of {@link applyValueTransform} — a display value back in datapoint units. */
export function invertValueTransform(value: number, factor?: number, offset?: number): number {
    const f = typeof factor === 'number' && Number.isFinite(factor) && factor !== 0 ? factor : 1;
    return tidy((value - num(offset, 0)) / f, WRITE_DIGITS);
}

export interface ControlValueTransform {
    /** Configured multiplier, `1` while nothing is set up. */
    factor: number;
    /** Configured summand, `0` while nothing is set up. */
    offset: number;
    /** False while the conversion is a no-op — callers can keep their untouched path. */
    active: boolean;
    /** Datapoint value → the value the control, its scale and its label work in. */
    toDisplay<T>(value: T): T | number;
    /** Control value → what gets written back into the datapoint. */
    toRaw(value: number): number;
}

/**
 * Reads the widget-level conversion off an options object and hands back both directions.
 *
 * A factor of 0 has no inverse — writing back through it would put Infinity into the datapoint —
 * so it counts as "nothing configured" rather than as a conversion.
 */
export function controlValueTransform(options?: Record<string, unknown>): ControlValueTransform {
    const rawFactor = Number(options?.valueFactor ?? 1);
    const rawOffset = Number(options?.valueOffset ?? 0);
    const factor = Number.isFinite(rawFactor) && rawFactor !== 0 ? rawFactor : 1;
    const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
    const active = options?.valueTransform !== 'none' && (factor !== 1 || offset !== 0);
    return {
        factor: active ? factor : 1,
        offset: active ? offset : 0,
        active,
        toDisplay<T>(value: T): T | number {
            if (!active) return value;
            const out = applyValueTransform(value, factor, offset);
            return typeof out === 'number' ? tidy(out, DISPLAY_DIGITS) : out;
        },
        toRaw(value: number): number {
            return active ? invertValueTransform(value, factor, offset) : value;
        },
    };
}

/**
 * Widget types whose datapoint row offers a conversion at all — the read-only displays plus,
 * since #682, the controls. Kept here so the editor, the widgets and the docs generator all
 * read the same list.
 */
export const TRANSFORMABLE_WIDGET_TYPES: readonly string[] = [
    'value',
    'gauge',
    'fill',
    'chart',
    'slider',
    'knob',
    'dimmer',
    'input',
];

/** Of those, the ones that also WRITE their datapoint — there the conversion runs both ways. */
export const WRITABLE_TRANSFORM_WIDGET_TYPES: readonly string[] = ['slider', 'knob', 'dimmer', 'input'];
