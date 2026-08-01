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

/** Paths aura's own HTTP server answers itself — these must never be rerouted
 *  to the web adapter. Everything else with a leading slash (`/adapter/…`,
 *  `/vis.0/…`, `/<adapter>.admin/…`) only exists on the web backend. */
const AURA_LOCAL_PATH = /^\/(assets|fs|webfs|socket\.io|echarts|lib)\/|^\/(proxy|favicon\.svg|index\.html)([?#]|$)/i;

/** Base64 payloads use the base64 alphabet only, are long and carry no file
 *  extension — a path always has a dot. Note that JPEG base64 starts with
 *  `/9j/`, so this check must run *before* the leading-slash path branch. */
function looksLikeBase64(v: string): boolean {
    return v.length > 100 && !v.includes('.') && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
}

/** Guess the mime type from the base64 magic prefix so SVG/PNG payloads are not
 *  mislabelled as JPEG (browsers refuse to render those). */
function base64Mime(v: string): string {
    if (v.startsWith('iVBOR')) return 'image/png';
    if (v.startsWith('R0lGOD')) return 'image/gif';
    if (v.startsWith('UklGR')) return 'image/webp';
    if (v.startsWith('PHN2Zw') || v.startsWith('PD94bW')) return 'image/svg+xml';
    return 'image/jpeg';
}

/**
 * Resolve an image value — a datapoint value or a configured URL — into a src
 * the browser can actually load:
 *  - `data:` / `blob:` → as-is
 *  - `http(s)://` / `//` → as-is (plain http proxied on HTTPS pages)
 *  - `aura-file:…` → `/fs/read` endpoint
 *  - raw base64 blob → `data:` URI with a sniffed mime type
 *  - any other path (`/adapter/pirate-weather/icons/…`, `sonos/coverImage/x.png`)
 *    → `/webfs/…`. Such paths are served by the ioBroker web adapter, not by
 *    aura's own HTTP server, so loading them against `window.location.origin`
 *    would 404. (issue #519)
 */
export function resolveImageSource(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const v = raw.trim();
    if (!v) return '';
    if (v.startsWith('data:') || v.startsWith('blob:')) return v;
    if (/^(https?:)?\/\//i.test(v)) return proxifyIfMixed(v);
    if (v.startsWith('aura-file:')) return resolveAssetUrl(v);
    if (looksLikeBase64(v)) return `data:${base64Mime(v)};base64,${v}`;
    if (v.startsWith('/')) return AURA_LOCAL_PATH.test(v) ? v : `/webfs${v}`;
    return `/webfs/${v}`;
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
