/**
 * Colours taken from a datapoint (#747).
 *
 * Any colour option may hold a binding instead of a colour:
 *
 *   `{wled.0.seg.0.col}`    the same spelling the text templates use
 *   `[[wled.0.seg.0.col]]`  the title spelling
 *
 * and each half of a light/dark pair may be one as well:
 * `light-dark({a.b.c}, #93c5fd)`. WidgetFrame resolves the pair first and then the
 * binding of the half that applies, so a pair needs nothing extra here.
 *
 * Only a value that is ENTIRELY one binding counts, and only under a colour key
 * (`color`, `iconColor`, `colors[]`, `firstColBg` …). Text options use the same
 * `{dp}` syntax for live values, and a value text that happens to be just `{dp}`
 * must never be read as a colour.
 *
 * Datapoints deliver colours in many shapes — WLED, Hue, Shelly and scripts each
 * have their own — so dpColorToCss turns the common ones into CSS.
 */
import { parseDual, pickDual } from './dualColor';

/** `{ref}` or `[[ref]]` — a ref has no blanks, braces, commas or parentheses. */
const BINDING_RE = /^\s*(?:\{([^\s{}[\](),;]+)\}|\[\[([^\s{}[\](),;]+)\]\])\s*$/;

/** The datapoint ref of a colour binding, or null when `value` is anything else. */
export function colorBindingRef(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const m = value.match(BINDING_RE);
    return m ? (m[1] ?? m[2]) : null;
}

/** True when `value` is a binding — or a light/dark pair with a binding in either half. */
export function hasColorBinding(value: unknown): boolean {
    if (colorBindingRef(value) !== null) return true;
    const pair = parseDual(value);
    return !!pair && (colorBindingRef(pair.light) !== null || colorBindingRef(pair.dark) !== null);
}

/** Keys whose string values are colours. */
export function isColorKey(key: string | undefined): boolean {
    if (!key) return false;
    return /colou?r/i.test(key) || /Bg$/.test(key) || key === 'bg';
}

const hex2 = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');

function fromChannels(parts: number[]): string {
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return '';
    const [r, g, b] = parts;
    if (parts.length >= 4 && Number.isFinite(parts[3])) {
        // 0..1 is an alpha; anything bigger is a fourth channel (RGBW) — ignore it.
        const a = parts[3];
        if (a >= 0 && a <= 1)
            return a >= 1 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}`;
    }
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** CSS colour functions and keywords that pass through unchanged. */
const CSS_FN_RE = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|var)\(.*\)$/i;

/**
 * A datapoint value as a CSS colour, or `''` when it is not one — an empty string
 * makes every option fall back to its default instead of painting garbage.
 *
 * Accepted: `#rgb`/`#rrggbb`/`#rrggbbaa` (with or without `#`), `r,g,b`,
 * `[r,g,b]`, `{r,g,b}`, an integer 0xRRGGBB, CSS functions and colour keywords.
 */
export function dpColorToCss(value: unknown, depth = 0): string {
    if (value === null || value === undefined || typeof value === 'boolean') return '';
    if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffff) return '';
        return `#${value.toString(16).padStart(6, '0')}`;
    }
    if (Array.isArray(value)) return fromChannels(value.map(Number));
    if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        const r = o.r ?? o.red;
        const g = o.g ?? o.green;
        const b = o.b ?? o.blue;
        if (r === undefined || g === undefined || b === undefined) return '';
        return fromChannels([Number(r), Number(g), Number(b), ...(o.a !== undefined ? [Number(o.a)] : [])]);
    }
    if (typeof value !== 'string') return '';
    const s = value.trim();
    if (!s) return '';
    // useTemplateStates hands arrays and objects over as JSON text.
    if (depth === 0 && (s.startsWith('[') || s.startsWith('{'))) {
        try {
            return dpColorToCss(JSON.parse(s), 1);
        } catch {
            return '';
        }
    }
    const hex = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (hex) return `#${hex[1].toLowerCase()}`;
    const list = s.split(/\s*[,; ]\s*/);
    if (list.length >= 3 && list.length <= 4 && list.every((p) => /^\d+(\.\d+)?$/.test(p)))
        return fromChannels(list.map(Number));
    if (CSS_FN_RE.test(s)) return s;
    if (/^[a-z]+$/i.test(s)) return s.toLowerCase();
    return '';
}

/** Configs are plain JSON — anything else is left untouched. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        typeof v === 'object' &&
        v !== null &&
        (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
    );
}

/**
 * Every datapoint ref bound in a colour option. Run on the config AFTER the
 * light/dark pairs were resolved, so only the half that applies is subscribed.
 */
export function collectColorBindingRefs(value: unknown, key?: string, out = new Set<string>(), depth = 0): string[] {
    if (typeof value === 'string') {
        if (isColorKey(key)) {
            const ref = colorBindingRef(value);
            if (ref) out.add(ref);
        }
    } else if (depth <= 12 && Array.isArray(value)) {
        for (const item of value) collectColorBindingRefs(item, key, out, depth + 1);
    } else if (depth <= 12 && isPlainObject(value)) {
        for (const k of Object.keys(value)) collectColorBindingRefs(value[k], k, out, depth + 1);
    }
    return [...out];
}

export type ColorLookup = (ref: string) => unknown;

/**
 * Deep copy with every bound colour replaced by the datapoint's colour.
 * Returns the INPUT REFERENCE when nothing is bound (see resolveDualDeep — the
 * render config's identity is what keeps the cards memoised).
 */
export function resolveColorBindingsDeep<T>(value: T, lookup: ColorLookup, key?: string, depth = 0): T {
    if (typeof value === 'string') {
        if (!isColorKey(key)) return value;
        const ref = colorBindingRef(value);
        return (ref ? dpColorToCss(lookup(ref)) : value) as T;
    }
    if (depth > 12) return value;
    if (Array.isArray(value)) {
        let out: unknown[] | null = null;
        for (let i = 0; i < value.length; i++) {
            const next = resolveColorBindingsDeep(value[i], lookup, key, depth + 1);
            if (next !== value[i]) (out ??= [...value])[i] = next;
        }
        return (out ?? value) as T;
    }
    if (isPlainObject(value)) {
        let out: Record<string, unknown> | null = null;
        for (const k of Object.keys(value)) {
            const next = resolveColorBindingsDeep(value[k], lookup, k, depth + 1);
            if (next !== value[k]) (out ??= { ...value })[k] = next;
        }
        return (out ?? value) as T;
    }
    return value;
}

/**
 * Put the bindings back on the widget's write path — the body spreads the config
 * it was handed, so without this a cell drag would store today's LED colour over
 * the binding. Run BEFORE restoreDualDeep: a pair whose current half is bound
 * comes back here as a whole, so restoreDualDeep then has nothing left to do.
 */
export function restoreColorBindingsDeep<T>(
    next: T,
    raw: unknown,
    lookup: ColorLookup,
    dark: boolean,
    key?: string,
    depth = 0,
): T {
    if (typeof next === 'string') {
        if (!isColorKey(key) || typeof raw !== 'string') return next;
        const half = parseDual(raw) ? pickDual(raw, dark) : raw;
        const ref = colorBindingRef(half);
        if (!ref) return next;
        return (next === dpColorToCss(lookup(ref)) ? raw : next) as T;
    }
    if (depth > 12) return next;
    if (Array.isArray(next)) {
        if (!Array.isArray(raw)) return next;
        // Same matching as restoreDualDeep: by id first, a body reorders arrays.
        const byId = new Map<string, unknown>();
        for (const item of raw) {
            if (isPlainObject(item) && typeof item.id === 'string') byId.set(item.id, item);
        }
        let out: unknown[] | null = null;
        for (let i = 0; i < next.length; i++) {
            const item = next[i];
            const counterpart =
                isPlainObject(item) && typeof item.id === 'string' && byId.has(item.id) ? byId.get(item.id) : raw[i];
            const restored = restoreColorBindingsDeep(item, counterpart, lookup, dark, key, depth + 1);
            if (restored !== item) (out ??= [...next])[i] = restored;
        }
        return (out ?? next) as T;
    }
    if (isPlainObject(next)) {
        if (!isPlainObject(raw)) return next;
        let out: Record<string, unknown> | null = null;
        for (const k of Object.keys(next)) {
            const restored = restoreColorBindingsDeep(next[k], raw[k], lookup, dark, k, depth + 1);
            if (restored !== next[k]) (out ??= { ...next })[k] = restored;
        }
        return (out ?? next) as T;
    }
    return next;
}
