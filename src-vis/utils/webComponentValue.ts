/**
 * The value of an ioBroker web component bound to a datapoint (`wcValueDp` of the
 * webcomponent widget): the state becomes the `value` property of the element, the
 * `iob-change` event of the element is written to the state. Kept free of React and
 * of the socket so it can be tested on its own.
 *
 * - `editsValue` - whether the manifest of a component declares that it edits a value.
 * - `fromStateValue` - the value of a state as the element gets it (JSON text of a
 *   json/object/array state becomes the object or array it describes).
 * - `toStateValue` - the value of the element as the state takes it (objects and
 *   arrays as JSON text).
 * - `sameValue` - whether two values are equal as JSON, key order aside.
 * - `createEchoGuard` - tells the element's own writes coming back from the ones
 *   that are news, so the element is not reset to an older value.
 */

/**
 * Whether a component declares in its manifest that it edits a value. Missing means
 * no. The cast goes once `@iobroker/web-components` with `editsValue` is released.
 *
 * @param manifest the manifest of the component
 */
export function editsValue(manifest: object): boolean {
    return (manifest as { editsValue?: unknown }).editsValue === true;
}

/** `common.type` of a state whose value is JSON text */
const JSON_TYPES = new Set(['json', 'object', 'array']);

/**
 * The value of the state as the element gets it.
 *
 * A string is parsed when the state is declared as JSON (`common.type` json, object
 * or array) - any JSON, and the string itself if it is none - or when it holds a JSON
 * object or array (an adapter that stores a list in a `string` or `mixed` state).
 * Numbers, booleans, null and objects stay as they are.
 *
 * @param val `val` of the state
 * @param commonType `common.type` of its object, if known
 */
export function fromStateValue(val: unknown, commonType?: string | null): unknown {
    if (typeof val !== 'string') return val === undefined ? null : val;
    const text = val.trim();
    if (commonType && JSON_TYPES.has(commonType)) {
        if (!text) return val;
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return val;
        }
    }
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
        try {
            const parsed = JSON.parse(text) as unknown;
            if (parsed !== null && typeof parsed === 'object') return parsed;
        } catch {
            // not JSON after all: the text itself
        }
    }
    return val;
}

/** What a state can hold */
export type StateValue = string | number | boolean | null;

/**
 * The value of the element as the state takes it.
 *
 * Objects and arrays become JSON text (js-controller wants json, object and array
 * states stringified). For a state declared as JSON a number or boolean becomes its
 * JSON text as well, so it reads back as the same value; a string stays as it is.
 * For a `number`, `boolean` or `string` state a value of another primitive type is
 * converted when that is unambiguous. `undefined` becomes null.
 *
 * @param value `detail` of the `iob-change` event
 * @param commonType `common.type` of the object of the state, if known
 */
export function toStateValue(value: unknown, commonType?: string | null): StateValue {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
    switch (commonType) {
        case 'json':
        case 'object':
        case 'array':
            return typeof value === 'string' ? value : JSON.stringify(value);
        case 'string':
            return String(value);
        case 'number': {
            if (typeof value === 'number') return value;
            if (typeof value === 'boolean') return value ? 1 : 0;
            const text = value.trim().replace(',', '.');
            const num = Number(text);
            return text && Number.isFinite(num) ? num : value;
        }
        case 'boolean':
            if (typeof value === 'boolean') return value;
            if (value === 1 || value === 'true' || value === '1') return true;
            if (value === 0 || value === 'false' || value === '0') return false;
            return value;
        default:
            return value;
    }
}

/**
 * JSON text with the keys of every object sorted - the same for equal values,
 * whatever order their keys were written in.
 *
 * @param value any JSON value
 */
export function stableJson(value: unknown): string {
    if (value === undefined) return 'undefined';
    return JSON.stringify(value, (_key, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
            : v,
    );
}

/**
 * Whether two values are the same as JSON: the element is set again only when the
 * stored value differs from the one it holds, not for a new object with equal content.
 *
 * @param a one value
 * @param b the other
 */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    try {
        return stableJson(a) === stableJson(b);
    } catch {
        return false;
    }
}

export interface EchoGuard {
    /**
     * The widget wrote this state value for the element
     *
     * @param val the value written
     */
    wrote(val: StateValue): void;
    /**
     * A state value arrived: false if it is an echo of an own write that a later own
     * write overtakes - handing it to the element would jump back to an older value.
     *
     * @param val `val` of the state
     */
    accept(val: unknown): boolean;
}

/**
 * Keeps the element on the newest own value while its writes come back.
 *
 * A write comes back at least once (Aura's local echo, then the server, maybe once
 * more confirmed by the device). After two quick changes A and B the late echo of A
 * would reset the element to A until B arrives; the guard drops it. A value that is
 * no own write is always news. Own writes are forgotten after `ttlMs`, so a write the
 * server never answered does not hold back later values.
 *
 * @param ttlMs how long an own write is expected back
 * @param now the clock, for tests
 */
export function createEchoGuard(ttlMs = 5000, now: () => number = Date.now): EchoGuard {
    let pending: { key: string; at: number }[] = [];
    const keyOf = (val: unknown): string => {
        try {
            return stableJson(val);
        } catch {
            return String(val);
        }
    };
    return {
        wrote(val: StateValue): void {
            pending.push({ key: keyOf(val), at: now() });
            if (pending.length > 50) pending = pending.slice(-50);
        },
        accept(val: unknown): boolean {
            const t = now();
            pending = pending.filter((p) => t - p.at < ttlMs);
            const key = keyOf(val);
            let index = -1;
            for (let i = pending.length - 1; i >= 0; i--) {
                if (pending[i].key === key) {
                    index = i;
                    break;
                }
            }
            // an own value overtaken by a later own write: stale
            return index === -1 || index === pending.length - 1;
        },
    };
}
