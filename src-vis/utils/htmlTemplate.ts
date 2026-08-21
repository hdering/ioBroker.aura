/**
 * Token support for free HTML written by the user — the value widget's custom
 * template and the HTML widget's content.
 *
 * The template may contain tokens in curly braces:
 *   {dp}                                         → reserved var, e.g. the widget's own value
 *   {alias.0.Raeume.Draussen.Suedseite.ACTUAL}   → any other datapoint by state ID
 *
 * A datapoint token is any `{…}` whose content looks like a state ID (starts
 * with a namespace char, has at least one dot-separated segment, no whitespace).
 * Braces that don't match — e.g. inline CSS `{ color: red; }` — are left untouched.
 *
 * A JSON path into an object/array value may be appended in three equivalent ways:
 *   {0_userdata.0.batterie?soc}       canonical (see dpRef.ts)
 *   {0_userdata.0.batterie#soc}       `#` inside the braces
 *   {0_userdata.0.batterie}#soc       `#` after the closing brace
 * The `#` forms also work on reserved vars (`{dp}#battery.soc`). An all-uppercase
 * segment after the `#` is never read as a path: that keeps ids that carry a `#`
 * themselves (Shelly: `shelly.0.SHSW-25#XXXXXX#1.Relay0.Switch`) and anchors
 * (`href="{dp}#TOP"`) intact — such cases need the `?` form for a path. A LOWER
 * case anchor right after a token (`href="{dp}#top"`) is read as a path, so write
 * that one as `{dp?…}` or move the anchor out of the token's way.
 */

import { joinDpRef } from './dpRef';

// `{…}` plus an optional `#<json path>` right after the closing brace.
const TOKEN_RE = /\{([^{}]+)\}(#[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*)?/g;

// State ID: namespace char + at least one further dot-segment, no whitespace.
// `#` is allowed inside a segment because some adapters use it (Shelly).
const DP_ID_RE = /^[A-Za-z0-9_][\w#-]*(?:\.[\w#-]+)+$/;

// A `#…` tail only counts as a JSON path if it reads like one.
const HASH_PATH_RE = /^[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*$/;

// All-uppercase first segment → serial/MAC part of the id (Shelly), not a path.
const ID_PART_RE = /^[0-9A-Z][0-9A-Z_-]*$/;

interface Token {
    /** Reserved var name (`dp`, `color`, …) when the token is not a state ID. */
    varName: string | null;
    /** Canonical datapoint ref (incl. `?path`), or null for reserved vars. */
    ref: string | null;
    /** JSON path, when the token carried one. */
    path: string | null;
    /** true when the `#…` after the closing brace was consumed as that path. */
    suffixUsed: boolean;
}

/** true for a `#…` tail that reads like a JSON path rather than part of an id
 *  (Shelly serial) or an HTML anchor — both are conventionally upper case. */
function isHashPath(rest: string): boolean {
    if (!HASH_PATH_RE.test(rest)) return false;
    return !ID_PART_RE.test(rest.split(/[.[]/)[0]);
}

/** Split `id#path` — only where the tail really looks like a JSON path. */
function splitHashPath(tok: string): { base: string; path: string | null } {
    const i = tok.indexOf('#');
    if (i <= 0) return { base: tok, path: null };
    const rest = tok.slice(i + 1);
    if (!isHashPath(rest)) return { base: tok, path: null };
    return { base: tok.slice(0, i), path: rest };
}

function parseToken(inner: string, suffix: string | undefined): Token | null {
    const trimmed = inner.trim();
    // Whitespace inside means CSS or prose, never a token: `{ color: red; }`.
    if (!trimmed || /\s/.test(trimmed)) return null;

    let base = trimmed;
    let path: string | null = null;
    const q = trimmed.indexOf('?');
    if (q > 0) {
        base = trimmed.slice(0, q);
        path = trimmed.slice(q + 1).trim() || null;
    } else if (q < 0) {
        const h = splitHashPath(trimmed);
        base = h.base;
        path = h.path;
    }

    let suffixUsed = false;
    if (!path && suffix && isHashPath(suffix.slice(1))) {
        path = suffix.slice(1);
        suffixUsed = true;
    }

    // A var name is a single word, so anything with a dot-segment is a state ID.
    if (DP_ID_RE.test(base)) return { varName: null, ref: joinDpRef(base, path), path, suffixUsed };
    return { varName: base, ref: null, path, suffixUsed };
}

/**
 * Collect the distinct datapoint refs referenced via `{<id>}` tokens.
 * Reserved vars such as `{dp}` are excluded.
 */
export function extractTemplateDpRefs(template: string | undefined | null): string[] {
    if (!template) return [];
    const refs = new Set<string>();
    for (const m of template.matchAll(TOKEN_RE)) {
        const tok = parseToken(m[1], m[2]);
        if (tok?.ref) refs.add(tok.ref);
    }
    return [...refs];
}

/**
 * Replace tokens in the template.
 *
 * `vars` holds reserved, non-datapoint tokens — e.g. `{dp}` (main value),
 * `{color}` (threshold color), `{unit}` — and takes precedence. Any other token
 * that looks like a state ID is passed to `resolve(ref)` for its live value.
 * `resolveVarPath` answers a reserved var that carries a JSON path
 * (`{dp}#battery.soc`); without it the plain var value is used.
 * Braces that match nothing are returned verbatim.
 */
export function renderTemplate(
    template: string,
    vars: Record<string, string>,
    resolve: (ref: string) => string,
    resolveVarPath?: (name: string, path: string) => string,
): string {
    return template.replace(TOKEN_RE, (full, inner, suffix) => {
        const tok = parseToken(String(inner), suffix as string | undefined);
        if (!tok) return full;
        // A `#…` tail we did not use as a path stays part of the output.
        const tail = tok.suffixUsed ? '' : ((suffix as string | undefined) ?? '');
        if (tok.ref) return resolve(tok.ref) + tail;
        const name = tok.varName as string;
        if (!Object.prototype.hasOwnProperty.call(vars, name)) return full;
        if (tok.path && resolveVarPath) return resolveVarPath(name, tok.path) + tail;
        return vars[name] + tail;
    });
}
