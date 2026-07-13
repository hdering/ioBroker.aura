export function resolveAssetUrl(value: string): string {
    if (value.startsWith('aura-file:')) {
        return `/fs/read?path=${encodeURIComponent(value.slice('aura-file:'.length))}`;
    }
    return value;
}

/**
 * Rewrite `src="aura-file:…"` / `src='aura-file:…'` attributes in an HTML
 * fragment to the `/fs/read` endpoint, so hand-authored `<img>` tags in the
 * value widget's HTML template or a JSON table's HTML cell can reference files
 * from the ioBroker file system with the same `aura-file:` syntax used by the
 * image picker — no IP/port dependency. (issue #465)
 */
export function resolveHtmlAssets(html: string): string {
    return html.replace(/(\ssrc\s*=\s*)(["'])(aura-file:[^"']+)\2/gi, (_m, pre, q, url) => {
        return `${pre}${q}${resolveAssetUrl(url)}${q}`;
    });
}

/**
 * Route an absolute `http://` URL through aura's `/proxy` backend when the page
 * itself is served over HTTPS. Otherwise the browser refuses to load the plain
 * http resource as mixed content — images stay blank on mobile even though they
 * work on a PC accessed over http. Same-origin, https and non-http values are
 * returned untouched. (issue #464)
 */
export function proxifyIfMixed(url: string): string {
    if (typeof window === 'undefined') return url;
    if (window.location.protocol !== 'https:') return url;
    if (!/^http:\/\//i.test(url)) return url;
    return `/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Rewrite `src="http://…"` / `src='http://…'` attributes in an HTML fragment so
 * that plain-http assets (typically `<img>` tags authored by hand) survive on an
 * HTTPS page by going through aura's `/proxy`. No-op on http pages. (issue #464)
 */
export function proxifyHtmlAssets(html: string): string {
    if (typeof window === 'undefined' || window.location.protocol !== 'https:') return html;
    return html.replace(/(\ssrc\s*=\s*)(["'])(http:\/\/[^"']+)\2/gi, (_m, pre, q, url) => {
        return `${pre}${q}${proxifyIfMixed(url)}${q}`;
    });
}
