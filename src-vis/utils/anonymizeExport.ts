// Anonymises an export payload (widget / tab / layout / popup) before it is
// serialised to JSON. Each selected data class is scrubbed while the overall
// structure stays intact, so the file remains re-importable and usable as a
// template. Same source value → same placeholder within one export (consistent
// mapping), which preserves links such as a datapoint referenced both in a
// widget and in one of its conditions.

/** Which data classes to scrub. All default to off (= verbatim export). */
export interface AnonymizeOptions {
    /** ioBroker object IDs anywhere in the tree → datapoint.0.dp_N */
    datapoints?: boolean;
    /** Titles / labels / free text under known keys → Text N */
    titles?: boolean;
    /** http(s)/rtsp(s)/ws(s) URLs (incl. embedded credentials) → https://example.invalid/N */
    urls?: boolean;
    /** Geo coordinates → 0 and custom JS/CSS → placeholder comment */
    geoAndCode?: boolean;
}

export function anyAnonymize(opts: AnonymizeOptions | undefined): boolean {
    return !!(opts && (opts.datapoints || opts.titles || opts.urls || opts.geoAndCode));
}

// ioBroker object id: <adapter>.<instance>.<path…> — the first segment must
// contain at least one letter (excludes bare IPs like 192.168.188.168), the
// second segment is the numeric instance, the rest is the (possibly dotted) path.
const DP_ID_RE = /^(?=[\w-]*[a-zA-Z])[\w-]+\.\d+\.[\w.#-]+$/;
const URL_RE = /^(https?|rtsps?|wss?):\/\//i;

// Free-text keys that may carry room / person names or other identifying text.
const TITLE_KEYS = new Set([
    'title',
    'name',
    'label',
    'text',
    'confirmText',
    'popupTitle',
    'trueText',
    'falseText',
    'address',
    'subtitle',
    'caption',
]);
// Keys whose string value is a URL even if the value-based test misses it.
const URL_KEYS = new Set(['url', 'streamUrl', 'imageUrl']);
// Numeric geo keys.
const GEO_NUM_KEYS = new Set(['latitude', 'longitude', 'lat', 'lon', 'lng']);
// Arbitrary user code that may embed tokens or reveal logic.
const CODE_KEYS = new Set(['customJS', 'customCSS']);

/**
 * Returns a scrubbed deep clone of `payload`. The original is never mutated.
 */
export function anonymizePayload<T>(payload: T, opts: AnonymizeOptions): T {
    const clone = structuredClone(payload);

    const dpMap = new Map<string, string>();
    const titleMap = new Map<string, string>();
    const urlMap = new Map<string, string>();

    const mapVia = (cache: Map<string, string>, key: string, make: (n: number) => string): string => {
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        const placeholder = make(cache.size + 1);
        cache.set(key, placeholder);
        return placeholder;
    };

    const scrubString = (s: string, key?: string): string => {
        if (!s) return s;
        // Custom code first — key-based, unambiguous.
        if (opts.geoAndCode && key && CODE_KEYS.has(key)) return '/* removed on export */';
        // URLs — value-based, plus a few known keys (covers relative/odd URLs).
        if (opts.urls && (URL_RE.test(s) || (key !== undefined && URL_KEYS.has(key)))) {
            return mapVia(urlMap, s, (n) => `https://example.invalid/${n}`);
        }
        // Datapoint ids — value-based, so untyped options.* and future widgets
        // are covered automatically without maintaining a key list.
        if (opts.datapoints && DP_ID_RE.test(s)) {
            return mapVia(dpMap, s, (n) => `datapoint.0.dp_${n}`);
        }
        // Free text — key-based.
        if (opts.titles && key !== undefined && TITLE_KEYS.has(key)) {
            return mapVia(titleMap, s, (n) => `Text ${n}`);
        }
        return s;
    };

    const walk = (node: unknown, key?: string): unknown => {
        if (Array.isArray(node)) return node.map((el) => walk(el, key));
        if (node && typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            for (const k of Object.keys(obj)) obj[k] = walk(obj[k], k);
            return obj;
        }
        if (typeof node === 'string') return scrubString(node, key);
        if (typeof node === 'number' && opts.geoAndCode && key !== undefined && GEO_NUM_KEYS.has(key)) {
            return 0;
        }
        return node;
    };

    return walk(clone) as T;
}
