/**
 * Subscription patterns of ioBroker IDs, as js-controller understands them: `*`
 * stands for any run of characters (dots included), everything else is literal -
 * `system.adapter.*`, `hm-rpc.0.*.STATE`.
 *
 * The server sends an event to a connection once, however many of its
 * subscriptions match the ID; the frontend then hands it to every subscriber
 * whose ID or pattern matches.
 */

/**
 * Whether a subscription names a pattern rather than one ID
 *
 * @param id an ID or a pattern
 */
export function isIdPattern(id: string): boolean {
    return id.includes('*');
}

/**
 * The regular expression of a pattern - the same as js-controller's
 * `pattern2RegEx`, so the frontend matches exactly the IDs the server sends.
 *
 * @param pattern e.g. `system.adapter.*`
 */
export function idPatternToRegExp(pattern: string): RegExp {
    const startsWithWildcard = pattern.startsWith('*');
    const endsWithWildcard = pattern.endsWith('*');
    const body = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`${startsWithWildcard ? '' : '^'}${body}${endsWithWildcard ? '' : '$'}`);
}
