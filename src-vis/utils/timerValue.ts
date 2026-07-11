/**
 * Helpers for interpreting a Zeitschaltuhr event's target value.
 *
 * Kept in sync with the backend scheduler's `_parseValue` (main.js): a stored
 * string is coerced to boolean / number / string exactly the same way, so the
 * on/off indicator the UI shows matches what actually gets written.
 */

/** Mirror of main.js `_parseValue` — turn the stored string into its typed value. */
export function parseTimerValue(raw: string): boolean | number | string {
    const s = raw.trim();
    if (s === '') return '';
    if (s.toLowerCase() === 'true') return true;
    if (s.toLowerCase() === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
}

export type TimerValueKind = 'on' | 'off' | 'other';

/** Classify a raw value string for display: boolean → on/off, everything else → other. */
export function classifyTimerValue(raw: string | undefined): TimerValueKind {
    const v = parseTimerValue(raw ?? '');
    if (v === true) return 'on';
    if (v === false) return 'off';
    return 'other';
}

/**
 * The value an event actually writes: the per-event override when the admin
 * enabled overrides and it is set, otherwise the widget default (which the
 * backend treats as `'true'` when unset).
 */
export function effectiveEventValue(
    eventValue: string | undefined,
    widgetDefault: string | undefined,
    allowEventValue: boolean,
): string {
    if (allowEventValue && typeof eventValue === 'string' && eventValue !== '') return eventValue;
    return widgetDefault != null && widgetDefault !== '' ? widgetDefault : 'true';
}
