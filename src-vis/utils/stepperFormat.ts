/**
 * Value formats of the −/+ stepper (#827).
 *
 * Some adapters keep a duration as a time string: Sprinkle Control shows the
 * running time as "05:00" and expects the new time as minutes, others want the
 * "MM:SS" string itself. The stepper therefore counts in a plain number (its
 * unit: seconds, minutes or hours) and only converts at the edges:
 *
 *   read   DP value → number   time strings are parsed ("05:00" → 5 min), plain numbers taken as they are
 *   show   number   → text     in the time format, when one is set
 *   write  number   → DP value number, number as text, or the time string
 */

export type StepperTimeFormat = 'mm:ss' | 'hh:mm' | 'hh:mm:ss';
export type StepperUnit = 's' | 'min' | 'h';
export type StepperWrite = 'number' | 'string' | 'time';

export interface StepperFormatSettings {
    stepTimeFormat?: StepperTimeFormat;
    stepUnit?: StepperUnit;
    stepWrite?: StepperWrite;
}

const UNIT_SECONDS: Record<StepperUnit, number> = { s: 1, min: 60, h: 3600 };

const pad = (n: number): string => String(n).padStart(2, '0');

/** Unit the stepper counts in: set explicitly, else the smallest field of the time format. */
export function stepperUnit(s: StepperFormatSettings): StepperUnit {
    if (s.stepUnit) return s.stepUnit;
    return s.stepTimeFormat === 'hh:mm' ? 'min' : 's';
}

/**
 * Seconds of a time string. The fields are read from the right, so "05:00" in
 * mm:ss is five minutes and "1:5:03" (Sprinkle Control above one hour) works too.
 * `hh:mm` has no seconds field. Undefined when the text is no time.
 */
export function parseDuration(text: string, format: StepperTimeFormat): number | undefined {
    const parts = text.trim().split(':');
    if (parts.length < 2 || parts.length > 3) return undefined;
    const nums = parts.map((p) => (/^\s*-?\d+(\.\d+)?\s*$/.test(p) ? Number(p) : NaN));
    if (nums.some((n) => !Number.isFinite(n))) return undefined;
    const weights = format === 'hh:mm' ? [3600, 60] : [3600, 60, 1];
    // Right-align the fields on the weights: mm:ss = [60, 1], hh:mm:ss = [3600, 60, 1].
    const w = weights.slice(weights.length - nums.length);
    if (w.length !== nums.length) return undefined;
    return nums.reduce((sum, n, i) => sum + n * w[i], 0);
}

/** Seconds as text in the time format. The leading field keeps counting (90:00 in mm:ss). */
export function formatDuration(seconds: number, format: StepperTimeFormat): string {
    const neg = seconds < 0;
    let s = Math.round(Math.abs(seconds));
    let out: string;
    if (format === 'hh:mm') {
        const m = Math.round(s / 60);
        out = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    } else if (format === 'hh:mm:ss') {
        const h = Math.floor(s / 3600);
        s -= h * 3600;
        out = `${pad(h)}:${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    } else {
        out = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    }
    return neg ? `-${out}` : out;
}

/** DP value → the stepper's number. Undefined when nothing usable is there ("-", empty, null). */
export function readStepperValue(val: unknown, s: StepperFormatSettings): number | undefined {
    if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
    if (typeof val === 'boolean' || val === null || val === undefined) return undefined;
    const text = String(val).trim();
    if (text === '') return undefined;
    if (s.stepTimeFormat && text.includes(':')) {
        const sec = parseDuration(text, s.stepTimeFormat);
        return sec === undefined ? undefined : sec / UNIT_SECONDS[stepperUnit(s)];
    }
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
}

/** The stepper's number → the value written to the DP. */
export function writeStepperValue(n: number, s: StepperFormatSettings): number | string {
    const write = s.stepWrite ?? 'number';
    if (write === 'string') return String(n);
    if (write === 'time') return formatDuration(n * UNIT_SECONDS[stepperUnit(s)], s.stepTimeFormat ?? 'mm:ss');
    return n;
}

/** The text between the buttons when a time format is set; undefined = show the number as before. */
export function showStepperValue(n: number, s: StepperFormatSettings): string | undefined {
    if (!s.stepTimeFormat) return undefined;
    return formatDuration(n * UNIT_SECONDS[stepperUnit(s)], s.stepTimeFormat);
}
