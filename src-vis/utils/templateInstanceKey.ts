/**
 * Backend keys for widgets inside a shared template (#778).
 *
 * A popup view or a device card renders ONE stored widget for many devices. A
 * widget with its own adapter channel (timer, countdown) would share that channel
 * across all of them, so each device gets its own under `<base>_<hash>`, where
 * the hash covers what the widget's `{{…}}` placeholders resolved to.
 */

/** FNV-1a, base36 — short, stable, safe in an object id. */
function hashKey(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

/** Backend key of one device. Base keys (UUID / t-… / c-…) contain no '_'. */
export function instanceBackendKey(baseKey: string, instanceKey: string): string {
    return `${baseKey}_${hashKey(instanceKey)}`;
}

/** Base key a backend key belongs to — itself for a plain widget. */
export function instanceBase(backendKey: string): string {
    return backendKey.split('_')[0];
}

/** Which device a templated widget runs for: its resolved target DPs. Null when
 *  there are none or a `{{…}}` token is unresolved. */
export function templateInstanceKey(targets: string[]): string | null {
    if (targets.length === 0 || targets.some((t) => t.includes('{{'))) return null;
    return targets.join('|');
}
