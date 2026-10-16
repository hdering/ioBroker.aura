/**
 * Icon identifiers — the pure part of the Iconify integration.
 *
 * Kept free of `@iconify/react` so the icon inventory (#290) can be unit-tested
 * in Node without bundling the icon runtime, and so `iconifyLoader.ts` (which
 * registers the API provider as a side effect) is never pulled in by accident.
 */

/** Iconify's own naming rule for prefixes and icon names: `lucide:zap-off`. */
export const ICONIFY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A stored icon is either a full Iconify ID or a legacy PascalCase Lucide name. */
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * True for a string that is a complete Iconify ID. A prefix without a letter
 * is rejected on purpose: `08:30` is a time, not an icon set.
 */
export function isIconifyId(value: unknown): value is string {
    if (typeof value !== 'string' || !ICONIFY_ID_RE.test(value)) return false;
    return /[a-z]/.test(value.slice(0, value.indexOf(':')));
}

/** True for a legacy PascalCase Lucide name such as `ZapOff` or `Home`. */
export function isLucidePascalName(value: unknown): value is string {
    return typeof value === 'string' && PASCAL_RE.test(value);
}

/**
 * Segments of a Lucide component name: a capitalised word, a number with a
 * lowercase tail (`3d`, `2x2`) or a bare number. Digits start their own
 * segment — `Trash2` is `trash-2`, not `trash2` (#787).
 */
const LUCIDE_SEGMENT_RE = /[A-Z][a-z]*|[0-9]+[a-z][a-z0-9]*|[0-9]+/g;

/** Convert PascalCase Lucide name to Iconify "lucide:kebab-case" ID.
 *  e.g. "ZapOff" → "lucide:zap-off", "Trash2" → "lucide:trash-2", "Grid3x3" → "lucide:grid-3x3" */
export function lucidePascalToIconify(name: string): string {
    if (name.includes(':')) return name;
    const segments = name.match(LUCIDE_SEGMENT_RE) ?? [name];
    return `lucide:${segments.join('-').toLowerCase()}`;
}
