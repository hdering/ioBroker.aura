/**
 * Optional status datapoints of the fill widget (#671, #691).
 *
 * A battery is more than its level: HmIP-style devices carry a second datapoint for
 * "is it charging" and a third for "is it still reachable". All of them are optional,
 * all of them only report — nothing here is ever written back.
 *
 * The comparison is configurable because the same statement comes in four shapes in
 * the wild: a boolean `CHARGING`, an inverted `UNREACH` (true means *gone*), and a
 * charge/discharge power that is positive while charging and negative while feeding
 * back. `true`/`false` read a flag, `gt0`/`lt0` read a number.
 *
 * Discharging (#691) is the same rule a second time, and deliberately its own datapoint
 * rather than "charging, inverted": a signed `packPower` answers both questions from one
 * id (`gt0` here, `lt0` there), while a device with two separate flags keeps them apart.
 * Standing still is then neither — which is exactly what an inverted flag could not say.
 */

export type FillCondition = 'true' | 'false' | 'gt0' | 'lt0';
export type FillChargeEffect = 'none' | 'blink' | 'scan';

/** Every condition, in the order the editor offers them. */
export const FILL_CONDITIONS: FillCondition[] = ['true', 'false', 'gt0', 'lt0'];

const TRUE_WORDS = new Set(['true', 'on', 'yes', 'ja', 'an', '1']);
const FALSE_WORDS = new Set(['false', 'off', 'no', 'nein', 'aus', '0']);

/** The raw value as a number, or null when it is nothing a comparison can use. */
function asNumber(raw: unknown): number | null {
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (s === '') return null;
        if (TRUE_WORDS.has(s.toLowerCase())) return 1;
        if (FALSE_WORDS.has(s.toLowerCase())) return 0;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }
    return null;
}

/**
 * Does the live value satisfy the configured condition?
 *
 * A value that has not arrived yet (null/undefined/empty, or text no comparison can
 * read) is never a match — not even for `false`. "Nothing known" must not light up a
 * charging bolt, and it must not declare a device offline either.
 */
/**
 * Is there anything a comparison could read? False for a datapoint that has not
 * reported yet — the difference between "not connected" and "nothing known".
 */
export function hasUsableValue(raw: unknown): boolean {
    return asNumber(raw) !== null;
}

export function conditionMet(raw: unknown, cond: FillCondition = 'true'): boolean {
    const n = asNumber(raw);
    if (n === null) return false;
    switch (cond) {
        case 'false':
            return n === 0;
        case 'gt0':
            return n > 0;
        case 'lt0':
            return n < 0;
        case 'true':
        default:
            return n !== 0;
    }
}

/** The default rule for the discharge datapoint — the signed-power case is the common one. */
export const DEFAULT_DISCHARGE_CONDITION: FillCondition = 'lt0';

export interface FillStatusOptions {
    chargeDatapoint?: string;
    chargeCondition?: FillCondition;
    chargeEffect?: FillChargeEffect;
    showChargeIcon?: boolean;
    chargeColor?: string;
    dischargeDatapoint?: string;
    dischargeCondition?: FillCondition;
    dischargeEffect?: FillChargeEffect;
    showDischargeIcon?: boolean;
    dischargeColor?: string;
    connectedDatapoint?: string;
    connectedCondition?: FillCondition;
    showOfflineIcon?: boolean;
    offlineColor?: string;
    offlineDim?: boolean;
}

export interface FillStatus {
    /** A charge datapoint is configured and its condition is met. */
    charging: boolean;
    /** A discharge datapoint is configured and its condition is met (#691). */
    discharging: boolean;
    /** true/false once a connection datapoint is configured, null when there is none. */
    connected: boolean | null;
    /** Short for `connected === false` — the only state that changes the picture. */
    offline: boolean;
    /** The effect to run on the fill; 'none' unless it is actually charging or discharging. */
    effect: FillChargeEffect;
    /** Which of the two the running effect belongs to — it decides its colour. */
    effectSource: 'charge' | 'discharge' | null;
}

/**
 * Resolves both status datapoints against their live values.
 *
 * `values` is keyed by datapoint ref, exactly like the limits take it. An unconfigured
 * datapoint leaves its side of the status neutral, which is what keeps this feature
 * invisible for every widget that does not use it.
 */
export function resolveFillStatus(opts: FillStatusOptions, values: Record<string, unknown>): FillStatus {
    const chargeDp = opts.chargeDatapoint?.trim() ?? '';
    const dischargeDp = opts.dischargeDatapoint?.trim() ?? '';
    const connDp = opts.connectedDatapoint?.trim() ?? '';
    const charging = !!chargeDp && conditionMet(values[chargeDp], opts.chargeCondition ?? 'true');
    const discharging =
        !!dischargeDp && conditionMet(values[dischargeDp], opts.dischargeCondition ?? DEFAULT_DISCHARGE_CONDITION);
    // A configured datapoint whose value has not arrived yet stays `null`, not `false`:
    // declaring a device offline for the first seconds after a reload would grey out
    // every battery on the dashboard on every page load.
    const connected =
        connDp && hasUsableValue(values[connDp])
            ? conditionMet(values[connDp], opts.connectedCondition ?? 'true')
            : null;
    // Two separate flags can both be set at once (a badly behaved device, or a bench
    // test). Charging wins the fill — one animation at a time — while both badges show.
    const effect = charging ? (opts.chargeEffect ?? 'none') : discharging ? (opts.dischargeEffect ?? 'none') : 'none';
    const effectSource = effect === 'none' ? null : charging ? 'charge' : 'discharge';
    return { charging, discharging, connected, offline: connected === false, effect, effectSource };
}
