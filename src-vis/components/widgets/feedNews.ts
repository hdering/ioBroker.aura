/**
 * News widget (#854, phase 2) — which articles are new. Pure, so the test runs
 * it in Node (tools/tests/feed-news.mjs).
 *
 * The rule for both uses: a feed seen for the first time only sets the
 * baseline — its articles are not "new", otherwise the very first load would
 * flag (or read aloud) everything. After that, an article id that is not known
 * is new.
 *
 *   - announcing (speakNew): known = what this mount has seen; an arrival is
 *     announced once and becomes known right away.
 *   - marking (markNew): known = what this device has read, kept per widget in
 *     localStorage; an article stays new until it is opened or "all read".
 */

export interface FeedIds {
    /** The feed's address or datapoint — identifies the source across reloads. */
    key: string;
    ids: string[];
}

/**
 * Ids of `feeds` that `known` does not hold. A feed whose key is not in
 * `baselined` is taken as the baseline instead: its ids join `known`, none of
 * them is returned. Mutates `known` and `baselined`, never adds the result.
 */
export function unknownIds(known: Set<string>, baselined: Set<string>, feeds: FeedIds[]): string[] {
    const out = new Set<string>();
    for (const f of feeds) {
        if (!baselined.has(f.key)) {
            baselined.add(f.key);
            for (const id of f.ids) known.add(id);
            continue;
        }
        for (const id of f.ids) if (!known.has(id)) out.add(id);
    }
    return [...out];
}

/** Read ids kept per widget; more than this and the oldest go (feeds hold far fewer). */
export const SEEN_MAX = 2000;

export interface SeenStore {
    ids: string[];
    sources: string[];
}

export function seenKey(widgetId: string): string {
    return `aura-feed-seen:${widgetId}`;
}

export function loadSeen(widgetId: string, storage: Pick<Storage, 'getItem'> | null): SeenStore {
    try {
        const raw = storage?.getItem(seenKey(widgetId));
        const parsed = raw ? (JSON.parse(raw) as Partial<SeenStore>) : null;
        return {
            ids: Array.isArray(parsed?.ids) ? parsed.ids.filter((x) => typeof x === 'string') : [],
            sources: Array.isArray(parsed?.sources) ? parsed.sources.filter((x) => typeof x === 'string') : [],
        };
    } catch {
        return { ids: [], sources: [] };
    }
}

export function saveSeen(
    widgetId: string,
    seen: Set<string>,
    sources: Set<string>,
    storage: Pick<Storage, 'setItem'> | null,
): void {
    // Sets keep insertion order: the oldest reads are the first to go.
    const ids = [...seen].slice(-SEEN_MAX);
    try {
        storage?.setItem(seenKey(widgetId), JSON.stringify({ ids, sources: [...sources] }));
    } catch {
        /* storage full or blocked: the marks live until the page reloads */
    }
}
