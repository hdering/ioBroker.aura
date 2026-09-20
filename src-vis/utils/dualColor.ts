/**
 * Colours that differ between the light and the dark theme (issue #689).
 *
 * A widget colour is a single string in the config — one value that has to work
 * on both themes. An icon tuned to look right on a light dashboard disappears on
 * a dark one, and there was no way to say "this colour here, that one there"
 * short of inventing a custom theme variable by hand.
 *
 * The pair travels INSIDE the value, as CSS's own syntax:
 *
 *     light-dark(#1e3a8a, #93c5fd)
 *
 * so no option had to be duplicated — all ~80 colour keys, every nested cell,
 * threshold, badge and chart series get it at once, the stored config stays a
 * plain string, and nothing needs migrating. A value whose halves are equal is
 * never written as a pair (see makeDual), so a user who does not need this never
 * sees it.
 *
 * Resolved in JavaScript rather than left to the browser on purpose: the eCharts
 * canvas has no CSS (same reason utils/cssColor.ts exists), several editors take
 * colour strings apart (`startsWith('#')`, hexToRgb), and `light-dark()` is two
 * years younger than the `color-mix()` this project already relies on — old kiosk
 * WebViews are a real target here (#636). Resolving up front turns the pair back
 * into an ordinary colour that every existing path already understands.
 */

/** Only a string that is ENTIRELY a `light-dark()` call — not HTML that mentions one. */
const DUAL_RE = /^\s*light-dark\s*\(([\s\S]*)\)\s*$/i;

/** True when `value` carries a light/dark pair rather than a single colour. */
export function isDualColor(value: unknown): value is string {
    return typeof value === 'string' && DUAL_RE.test(value) && parseDual(value) !== null;
}

/**
 * Split the two halves of a pair, or null when `value` is an ordinary colour.
 *
 * The halves may themselves contain commas (`rgb(1, 2, 3)`, `color-mix(…)`), so
 * the split counts parentheses instead of using String.split.
 */
export function parseDual(value: unknown): { light: string; dark: string } | null {
    if (typeof value !== 'string') return null;
    const m = value.match(DUAL_RE);
    if (!m) return null;
    const inner = m[1];
    let depth = 0;
    let cut = -1;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            cut = i;
            break;
        }
    }
    if (cut < 0) return null;
    const light = inner.slice(0, cut).trim();
    const dark = inner.slice(cut + 1).trim();
    if (!light || !dark) return null;
    // A third argument is not `light-dark()` — leave the value alone rather than
    // guessing what it meant.
    if (dark.includes(',') && !/[([]/.test(dark)) return null;
    return { light, dark };
}

/**
 * The value to store for a light/dark choice.
 *
 * Two equal halves are stored as ONE colour: the pair syntax is a cost (longer
 * value, extra resolve step, something to explain in the docs) and it buys
 * nothing while both sides agree.
 */
export function makeDual(light: string, dark: string): string {
    const l = (light ?? '').trim();
    const d = (dark ?? '').trim();
    if (!l) return d;
    if (!d) return l;
    if (l.toLowerCase() === d.toLowerCase()) return l;
    return `light-dark(${l}, ${d})`;
}

/** The half that applies at the given brightness; any other value passes through. */
export function pickDual(value: string, dark: boolean): string {
    const pair = parseDual(value);
    if (!pair) return value;
    return dark ? pair.dark : pair.light;
}

/** Both halves of a value, whether or not it is a pair. Used by the colour picker. */
export function splitDual(value: string): { light: string; dark: string; isPair: boolean } {
    const pair = parseDual(value);
    if (pair) return { ...pair, isPair: true };
    return { light: value, dark: value, isPair: false };
}

/** Configs are plain JSON — anything else (Date, class instance) is left untouched. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        typeof v === 'object' &&
        v !== null &&
        (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
    );
}

/**
 * Deep copy with every colour pair replaced by the half that applies now.
 *
 * Returns the INPUT REFERENCE when nothing changed — which is the whole point:
 * WidgetFrame feeds the result into a useMemo whose consumers are memoised on
 * identity, so a fresh object on every render would undo the editor-drop work
 * (a new options blob per render re-renders every card).
 */
export function resolveDualDeep<T>(value: T, dark: boolean, depth = 0): T {
    if (typeof value === 'string') return (isDualColor(value) ? pickDual(value, dark) : value) as T;
    // Guard against a config that somehow nests forever; real ones are shallow.
    if (depth > 12) return value;
    if (Array.isArray(value)) {
        let out: unknown[] | null = null;
        for (let i = 0; i < value.length; i++) {
            const next = resolveDualDeep(value[i], dark, depth + 1);
            if (next !== value[i]) (out ??= [...value])[i] = next;
        }
        return (out ?? value) as T;
    }
    if (isPlainObject(value)) {
        let out: Record<string, unknown> | null = null;
        for (const key of Object.keys(value)) {
            const next = resolveDualDeep(value[key], dark, depth + 1);
            if (next !== value[key]) (out ??= { ...value })[key] = next;
        }
        return (out ?? value) as T;
    }
    return value;
}

/**
 * Put the pairs back on the write path.
 *
 * A widget body that calls onConfigChange spreads the config it was HANDED — the
 * resolved one. Without this, dragging a cell inside the grid view would write
 * the currently visible half back over the pair and silently destroy the other
 * colour. Walks `next` and `raw` in parallel: wherever `raw` holds a pair and
 * `next` still holds one of its two halves, the pair wins.
 *
 * Only for the body's write path. The config panel edits the RAW value, so a user
 * who deliberately collapses a pair to one colour must not have it restored.
 */
export function restoreDualDeep<T>(next: T, raw: unknown, depth = 0): T {
    if (typeof next === 'string') {
        const pair = parseDual(raw);
        if (!pair) return next;
        return (next === pair.light || next === pair.dark ? (raw as string) : next) as T;
    }
    if (depth > 12) return next;
    if (Array.isArray(next)) {
        if (!Array.isArray(raw)) return next;
        // Reordering is exactly what a body does to an array (dragging a cell), so
        // position alone would hand entry 3 the pair of entry 1. Cells, entries and
        // series carry an `id`; match on that first and fall back to the index.
        // Deliberately NOT matching by colour value: two entries that happen to be
        // the same colour today would start following each other's pair.
        const byId = new Map<string, unknown>();
        for (const item of raw) {
            if (isPlainObject(item) && typeof item.id === 'string') byId.set(item.id, item);
        }
        let out: unknown[] | null = null;
        for (let i = 0; i < next.length; i++) {
            const item = next[i];
            const counterpart =
                isPlainObject(item) && typeof item.id === 'string' && byId.has(item.id) ? byId.get(item.id) : raw[i];
            const restored = restoreDualDeep(item, counterpart, depth + 1);
            if (restored !== item) (out ??= [...next])[i] = restored;
        }
        return (out ?? next) as T;
    }
    if (isPlainObject(next)) {
        if (!isPlainObject(raw)) return next;
        let out: Record<string, unknown> | null = null;
        for (const key of Object.keys(next)) {
            const restored = restoreDualDeep(next[key], raw[key], depth + 1);
            if (restored !== next[key]) (out ??= { ...next })[key] = restored;
        }
        return (out ?? next) as T;
    }
    return next;
}
