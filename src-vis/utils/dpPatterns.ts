/**
 * Datapoint allow-lists as patterns (Scenes widget, #825).
 *
 * - `hm-rpc.0` (no `*`) = this id and everything below it — a whole instance, device or channel.
 * - `*` matches any characters, dots included: `*.STATE`, `zigbee.0.*.state`, `0_userdata.0.licht*`.
 *
 * An empty list allows everything.
 */

const cache = new Map<string, RegExp>();

function toRegExp(pattern: string): RegExp {
    let re = cache.get(pattern);
    if (!re) {
        const body = pattern
            .split('*')
            .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
        re = new RegExp(`^${body}$`);
        cache.set(pattern, re);
    }
    return re;
}

/** Trimmed, non-empty patterns; trailing dots dropped (`hm-rpc.0.` = `hm-rpc.0`). */
export function cleanDpPatterns(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const p of raw) {
        if (typeof p !== 'string') continue;
        const s = p.trim().replace(/\.+$/, '');
        if (s && !out.includes(s)) out.push(s);
    }
    return out;
}

export function matchesDpPattern(id: string, pattern: string): boolean {
    if (pattern.includes('*')) return toRegExp(pattern).test(id);
    return id === pattern || id.startsWith(`${pattern}.`);
}

/** True when `patterns` is empty or one of them matches. */
export function matchesDpPatterns(id: string, patterns: string[]): boolean {
    return patterns.length === 0 || patterns.some((p) => matchesDpPattern(id, p));
}
