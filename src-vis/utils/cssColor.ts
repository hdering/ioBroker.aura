/**
 * Resolve a configured colour into something a canvas accepts.
 *
 * Every widget but the eCharts one paints DOM, where `var(--accent)` is exactly
 * the right thing to configure: it follows the user's theme. A canvas has no CSS
 * — measured in the browser, `ctx.fillStyle = 'var(--accent)'` is DROPPED (the
 * fallback inside the var() too), so the shape keeps whatever colour was set
 * last. A series configured with a token was therefore invisible.
 *
 * Rather than forbidding tokens in charts, the value is resolved here first:
 * `getComputedStyle` answers with what the token is worth AT THIS ELEMENT, so a
 * layout- or section-scoped theme and a per-widget `styleOverride` are included,
 * and chains (`--x: var(--y)`) are already resolved by the browser.
 *
 * Pure: element in, string out. The re-reading on a theme switch is the hook's
 * job (hooks/useResolvedColors.ts).
 */

/** A token reference, with the optional CSS fallback after the comma. */
const VAR_CALL = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/;

/**
 * The value `color` really has at `cs`, or undefined when it cannot be resolved.
 *
 * Undefined is a deliberate answer, not a failure: the caller knows its own
 * default (the chart palette) and picking it is better than handing the canvas a
 * string it silently drops. A token that no theme defines answers `""` in the
 * computed style, which lands here as undefined.
 */
export function resolveCssColor(color: string | undefined | null, cs: CSSStyleDeclaration): string | undefined {
    const raw = typeof color === 'string' ? color.trim() : '';
    if (!raw) return undefined;
    // `currentColor` is the element's own text colour — the one CSS keyword a
    // canvas cannot look up either.
    if (/^currentcolor$/i.test(raw)) return cs.color || undefined;
    const m = raw.match(VAR_CALL);
    if (!m) return raw;
    const value = cs.getPropertyValue(m[1]).trim();
    if (value) return value;
    // Unset token: fall back to what the var() itself offers, which may be
    // another var() — that is legal CSS, so it is resolved the same way.
    return m[2] === undefined ? undefined : resolveCssColor(m[2], cs);
}

/** True for a value that only CSS can read — the ones worth resolving at all. */
export function needsCssResolve(color: string | undefined | null): boolean {
    return typeof color === 'string' && /var\(\s*--|^\s*currentcolor\s*$/i.test(color);
}
