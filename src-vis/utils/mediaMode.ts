/**
 * Shuffle / repeat datapoints of the media player (issue #782).
 *
 * Adapters expose these modes in three shapes:
 *  - a plain button (`role: button…`, Yamaha `…Toggle`) → write `true`, no state to show
 *  - a boolean switch (Sonos `shuffle`, Alexa `controlShuffle`) → write the opposite
 *  - an enum (Sonos `repeat` 0/1/2, Spotify `repeat` off/context/track) → step to the
 *    next entry of `common.states`
 * Writing `true` to all of them – what the widget used to do – switched a boolean
 * shuffle on and never off again, and the button never showed the current mode.
 */

export interface ModeMeta {
    type?: string;
    role?: string;
    /** Normalised `common.states` (value → label), keys in declaration order. */
    states?: Record<string, string>;
}

export interface ModeView {
    /** The mode is on (shuffle on, repeat anything but off). */
    active: boolean;
    /** Repeat is on the single track – the button shows the "1" variant. */
    one: boolean;
}

const OFF_WORDS = new Set(['', '0', 'false', 'off', 'none', 'no', 'aus', 'disabled']);
const ONE_RE = /\b(one|track|single|song|einzel|titel)\b/i;

function isButton(meta: ModeMeta | null): boolean {
    const role = meta?.role ?? '';
    return role === 'button' || role.startsWith('button.');
}

function isOffValue(value: unknown): boolean {
    if (value === null || value === undefined || value === false || value === 0) return true;
    return OFF_WORDS.has(String(value).trim().toLowerCase());
}

/** What the button shows for the datapoint's current value. */
export function modeView(value: unknown, meta: ModeMeta | null): ModeView {
    if (isButton(meta)) return { active: false, one: false };
    const states = meta?.states;
    if (states) {
        const key = String(value);
        const label = states[key];
        if (label === undefined) return { active: !isOffValue(value), one: false };
        const active = !isOffValue(key) && !isOffValue(label);
        return { active, one: active && ONE_RE.test(label) };
    }
    return { active: !isOffValue(value), one: false };
}

/** The value a click writes, given the datapoint's current value. */
export function nextModeValue(value: unknown, meta: ModeMeta | null): boolean | number | string {
    if (isButton(meta)) return true;
    const states = meta?.states;
    const numeric = meta?.type === 'number' || typeof value === 'number';
    if (states && meta?.type !== 'boolean') {
        const keys = Object.keys(states);
        if (keys.length > 0) {
            const i = keys.indexOf(String(value));
            const next = keys[(i + 1) % keys.length];
            return numeric && next.trim() !== '' && Number.isFinite(Number(next)) ? Number(next) : next;
        }
    }
    if (typeof value === 'boolean' || meta?.type === 'boolean') return !(value === true || value === 'true');
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'on') return 'off';
        if (v === 'off') return 'on';
    }
    if (typeof value === 'number') return value === 0 ? 1 : 0;
    // Nothing known about it (no value yet, no object): behave like a button.
    return true;
}
