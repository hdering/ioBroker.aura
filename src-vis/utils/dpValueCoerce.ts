/**
 * Fits a value to the datapoint's `common.type` before it is written.
 *
 * Widget options are typed as text, and the editors turn "1" into the number 1
 * and "true" into a boolean. A datapoint declared as `string` then logs
 * "has to be type string but received type number" (Mediola gateway, which
 * takes "1"/"2" for up/down). Only clear conversions happen; a value that does
 * not fit (text "AUF" for a number DP) stays as it is, so the adapter still sees
 * and reports it. `mixed`, missing or unknown types are left alone.
 */
export type DpWriteValue = boolean | number | string;

export function coerceToDpType(val: DpWriteValue, type: unknown): DpWriteValue {
    switch (type) {
        case 'string':
            return typeof val === 'string' ? val : String(val);
        case 'number': {
            if (typeof val === 'number') return val;
            if (typeof val === 'boolean') return val ? 1 : 0;
            const s = val.trim();
            const n = Number(s);
            return s !== '' && Number.isFinite(n) ? n : val;
        }
        case 'boolean': {
            if (typeof val === 'boolean') return val;
            if (typeof val === 'number') return val !== 0;
            const s = val.trim().toLowerCase();
            if (s === 'true' || s === '1' || s === 'on') return true;
            if (s === 'false' || s === '0' || s === 'off') return false;
            return val;
        }
        default:
            return val;
    }
}
