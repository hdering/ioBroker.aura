/**
 * The periodic sync of the dynamic list (autolist): merges what the filters find
 * into the stored entries. Pure, so it can be tested without the widget.
 */

/** What a sync-added entry carries — anything beyond this is the user's own setting. */
const SYNC_KEYS = new Set(['id', 'label', 'rooms', 'unit', 'role', 'writable']);

interface SyncEntry {
    id: string;
    label?: string;
}

interface FoundDp {
    id: string;
    rooms: string[];
    unit?: string;
    role?: string;
    write?: boolean;
}

/**
 * True when an entry holds nothing but what the sync wrote itself: no own label,
 * no own colours/icon/format/… — removing it loses nothing the user set.
 */
export function isSyncOnlyEntry(e: SyncEntry): boolean {
    if (e.label) return false;
    return Object.entries(e).every(([k, v]) => SYNC_KEYS.has(k) || v === undefined);
}

/**
 * Adds the found datapoints that are not in the list yet and, with `remove`, drops
 * sync-only entries the filters no longer find. An empty search result never removes
 * anything — a lost connection or an empty object view must not wipe the list.
 */
export function syncEntries<E extends SyncEntry>(
    entries: E[],
    found: FoundDp[],
    remove: boolean,
): { entries: E[]; added: number; removed: number } {
    const existing = new Set(entries.map((e) => e.id));
    const added = found
        .filter((d) => !existing.has(d.id))
        .map(
            (d) =>
                ({
                    id: d.id,
                    label: undefined,
                    rooms: d.rooms,
                    unit: d.unit,
                    role: d.role,
                    writable: d.write,
                }) as unknown as E,
        );
    let kept = entries;
    if (remove && found.length > 0) {
        const foundIds = new Set(found.map((d) => d.id));
        kept = entries.filter((e) => foundIds.has(e.id) || !isSyncOnlyEntry(e));
    }
    return {
        entries: added.length || kept.length !== entries.length ? [...kept, ...added] : entries,
        added: added.length,
        removed: entries.length - kept.length,
    };
}
