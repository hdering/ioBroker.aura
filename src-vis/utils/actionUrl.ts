import { extractTemplateDpRefs, renderTemplate } from './htmlTemplate';
import { resolveDpValue, splitDpRef } from './dpRef';

/**
 * Datapoint placeholders in the URL of a click action (`link-external`, `popup-iframe`)
 * and of a header/menu title link (#1006).
 *
 *   http://{dp}/              → value of the action's own datapoint (the clicked list
 *                               row, the widget's main datapoint)
 *   http://{hm-rpc.0.ip}:8080 → value of any other datapoint
 *
 * The RAW value goes in (no unit, no rounding) and it is not URL-encoded, so a
 * datapoint may hold a host, a host:port or a whole address.
 */

/** Raw value behind a ref (`id` or `id?path`); undefined = not known (yet). */
export type RawValueReader = (id: string) => unknown;

/** True when the URL carries at least one datapoint placeholder. */
export function hasUrlPlaceholders(url: string | undefined | null): boolean {
    if (!url || !url.includes('{')) return false;
    return /\{dp\}/.test(url) || extractTemplateDpRefs(url).length > 0;
}

/** Datapoints a URL template reads — `{dp}` stands for `dpId`. */
export function urlTemplateRefs(url: string | undefined | null, dpId?: string): string[] {
    if (!hasUrlPlaceholders(url)) return [];
    const refs = new Set(extractTemplateDpRefs(url));
    if (dpId && /\{dp\}/.test(url as string)) refs.add(dpId);
    return [...refs].map((r) => splitDpRef(r).id);
}

function rawToString(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v).trim();
}

/**
 * Resolves the placeholders of `url`.
 *
 * - No placeholder: the URL comes back untouched (configured as before).
 * - A placeholder whose value is empty / unknown: null — nothing to open.
 * - The result has no scheme: `http://` is put in front (`192.168.1.5` → `http://192.168.1.5`).
 * - With placeholders, only http/https may come out, so a datapoint value like
 *   `javascript:…` can never be run by a click.
 */
export function resolveActionUrl(url: string, dpId: string | undefined, read: RawValueReader): string | null {
    if (!hasUrlPlaceholders(url)) return url;
    let missing = false;
    const value = (ref: string): string => {
        const { id, path } = splitDpRef(ref);
        const s = rawToString(resolveDpValue(read(id), path));
        if (!s) missing = true;
        return s;
    };
    const rendered = renderTemplate(url, {
        vars: { dp: dpId && /\{dp\}/.test(url) ? value(dpId) : '' },
        resolve: value,
        // `{dp}#ip` — a field of a JSON value held by the own datapoint
        resolveVarPath: (name, path) => (name === 'dp' && dpId ? value(`${splitDpRef(dpId).id}?${path}`) : ''),
    }).trim();
    if (!dpId && /\{dp\}/.test(url)) missing = true;
    if (missing || !rendered) return null;

    // A relative address stays on the Aura origin; everything else needs http(s).
    if (rendered.startsWith('/') && !rendered.startsWith('//')) return rendered;
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(rendered) ? rendered : `http://${rendered.replace(/^\/\//, '')}`;
    try {
        const parsed = new URL(absolute);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch {
        return null;
    }
}
