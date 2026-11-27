/**
 * Datapoint id check, free of socket code so pure modules (and their esbuild
 * tests) can use it. Re-exported from hooks/useIoBroker.
 */

// js-controller's FORBIDDEN_CHARS — anything stricter silently drops live
// updates for real IDs (initial getState works, stateChange never arrives):
// '#' (Shelly), ' ' (0_userdata), ':' (lupusec, homekit-controller, #874).
// '?' stays forbidden, which keeps it free as the JSON-path separator (dpRef).
const FORBIDDEN_ID_CHARS = /[^._\-/ :!#$%&()+=@^{}|~*\p{Ll}\p{Lu}\p{Nd}]/u;

export function isValidStateId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && !FORBIDDEN_ID_CHARS.test(id) && !id.includes('://');
}
