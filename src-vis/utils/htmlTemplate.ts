/**
 * Token support for the value widget's custom HTML template.
 *
 * The template may contain tokens in curly braces:
 *   {dp}                                         → the widget's own (main) datapoint value
 *   {alias.0.Raeume.Draussen.Suedseite.ACTUAL}   → any other datapoint by state ID
 *
 * A datapoint token is any `{…}` whose content looks like a state ID (starts
 * with a namespace char, has at least one dot-separated segment, no whitespace)
 * and may carry the usual `?<jsonPath>` suffix (see dpRef.ts). Braces that don't
 * match — e.g. inline CSS `{ color: red; }` — are left untouched.
 */

const TOKEN_RE = /\{([^{}]+)\}/g;

// State ID: namespace char + at least one further dot-segment, no whitespace,
// optional `?<jsonPath>` suffix.
const DP_TOKEN_RE = /^[A-Za-z0-9_][\w-]*(?:\.[\w-]+)+(?:\?[^{}\s]+)?$/;

function isDpToken(tok: string): boolean {
    return tok !== 'dp' && DP_TOKEN_RE.test(tok);
}

/**
 * Collect the distinct datapoint refs referenced via `{<id>}` tokens.
 * The reserved `{dp}` token (main datapoint) is excluded.
 */
export function extractTemplateDpRefs(template: string | undefined | null): string[] {
    if (!template) return [];
    const refs = new Set<string>();
    for (const m of template.matchAll(TOKEN_RE)) {
        const tok = m[1].trim();
        if (isDpToken(tok)) refs.add(tok);
    }
    return [...refs];
}

/**
 * Replace tokens in the template.
 *
 * `vars` holds reserved, non-datapoint tokens — e.g. `{dp}` (main value),
 * `{color}` (threshold color), `{unit}` — and takes precedence. Any other token
 * that looks like a state ID is passed to `resolve(ref)` for its live value.
 * Braces that match neither are returned verbatim.
 */
export function renderTemplate(
    template: string,
    vars: Record<string, string>,
    resolve: (ref: string) => string,
): string {
    return template.replace(TOKEN_RE, (full, inner) => {
        const tok = String(inner).trim();
        if (Object.prototype.hasOwnProperty.call(vars, tok)) return vars[tok];
        if (isDpToken(tok)) return resolve(tok);
        return full;
    });
}
