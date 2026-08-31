/**
 * The `[[dp]]` token layer: finding the tokens in a text and turning them back
 * into text.
 *
 * Pure on purpose. Two very different callers need exactly these pieces:
 *   - components/widgets/DynamicTitle — the LIVE reading, re-rendering as the
 *     subscribed values change (a widget title, a row label, a message on screen).
 *   - utils/notifyTemplate — the FROZEN reading, applied once when a condition
 *     sends a message, so the archive keeps the value the datapoint had at that
 *     moment instead of drifting with it.
 *
 * The complementary static layer is `{{parent}}` & co. (utils/popupPlaceholders,
 * utils/nameFilter): it rewrites text and never reads a value. Both compose,
 * static first — `[[{{parent}}.Temp]]` becomes `[[0_userdata.0.X.Temp]]` and only
 * then a value.
 */

/** `[[…]]` with a non-empty, bracket-free body. */
const DP_TOKEN = /\[\[([^[\]]+)\]\]/g;

/** True when `text` carries at least one `[[dp]]` token. */
export function hasDpToken(text: string | undefined | null): boolean {
    return !!text && /\[\[[^[\]]+\]\]/.test(text);
}

/** Strips the tokens, leaving the static text — for places that need a plain string
 *  (published object names) rather than a live-updating one. */
export function stripDpTokens(text: string): string {
    return text
        .replace(DP_TOKEN, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Datapoint references used by `text`, de-duplicated and trimmed. */
export function dpTokenRefs(text: string): string[] {
    if (!hasDpToken(text)) return [];
    const refs = new Set<string>();
    for (const m of text.matchAll(DP_TOKEN)) {
        const ref = m[1].trim();
        if (ref) refs.add(ref);
    }
    return [...refs];
}

/** How a datapoint value reads inside a text. An unknown value renders as nothing,
 *  so the surrounding text stays intact while the state is still loading. */
export function dpValueText(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'AN' : 'AUS';
    if (typeof val === 'number' || typeof val === 'string') return String(val);
    try {
        return JSON.stringify(val);
    } catch {
        return '';
    }
}

/**
 * `text` with every token handed to `lookup`, which answers with the replacement.
 *
 * Returning `undefined` leaves that token in place — the frozen reading uses it for
 * a datapoint it could not read, so the live layer still gets its chance further
 * down the line instead of the reference being silently deleted.
 */
export function replaceDpTokens(text: string, lookup: (ref: string) => string | undefined): string {
    if (!hasDpToken(text)) return text;
    return text
        .replace(DP_TOKEN, (whole, ref: string) => lookup(ref.trim()) ?? whole)
        .replace(/\s{2,}/g, ' ')
        .trim();
}
