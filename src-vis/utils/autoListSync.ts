/**
 * The periodic sync of the dynamic list (autolist): merges what the filters find
 * into the stored entries. Pure, so it can be tested without the widget.
 */
import { NOT_INHERITED } from './listDisplayDefaults';

/** What a sync-added entry carries — anything beyond this is the user's own setting. */
const SYNC_KEYS = new Set(['id', 'label', 'rooms', 'unit', 'role', 'writable']);

/**
 * Takes back what earlier versions leaked into the stored entries: the sync used to
 * write the rows *with* the list-wide display folded in, so every entry carried
 * `displayType`, `states` … of `entryDisplay` — counted as the user's own setting, it
 * blocked syncRemove and froze the rows against later changes of the list-wide block
 * (#886). A field is dropped when the entry shows the list's display type and the value
 * equals the list's own; a row set up by hand the same way looks the same afterwards.
 */
export function stripInheritedDisplay<E extends object>(
    entries: E[],
    listDisplay?: Record<string, unknown>,
): { entries: E[]; cleaned: number } {
    if (!listDisplay?.displayType) return { entries, cleaned: 0 };
    const list = listDisplay;
    let cleaned = 0;
    const out = entries.map((e) => {
        const rec = e as Record<string, unknown>;
        if (rec.displayType !== list.displayType) return e;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rec)) {
            const inherited = !NOT_INHERITED.has(k) && k in list && JSON.stringify(v) === JSON.stringify(list[k]);
            if (!inherited) next[k] = v;
        }
        cleaned++;
        return next as E;
    });
    return cleaned ? { entries: out, cleaned } : { entries, cleaned: 0 };
}

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

interface SyncOptions {
    entries?: SyncEntry[];
    entryDisplay?: unknown;
    filterRelevant?: boolean;
    syncRemove?: boolean;
}

/**
 * One whole sync round over what the filters found: drops the leaked list-wide display
 * (#886), adds the new hits and — with `syncRemove` — takes out the vanished ones.
 * `changed` false = nothing to write. Shared by the widget and the adapter (#893).
 */
export function autoListSyncRound<E extends SyncEntry>(
    opts: SyncOptions,
    found: (FoundDp & { isRelevant?: boolean })[],
): { entries: E[]; added: number; removed: number; cleaned: number; changed: boolean } {
    const filtered = (opts.filterRelevant ?? true) ? found.filter((d) => d.isRelevant) : found;
    // The stored entries, not the rendered ones: those carry the list-wide display folded
    // in, and writing that back made every row look hand-configured (#886).
    const stored = stripInheritedDisplay(
        ((opts.entries ?? []) as E[]).filter((e) => !!e?.id),
        opts.entryDisplay as Record<string, unknown> | undefined,
    );
    const next = syncEntries(stored.entries, filtered, opts.syncRemove === true);
    return {
        ...next,
        cleaned: stored.cleaned,
        changed: next.added > 0 || next.removed > 0 || stored.cleaned > 0,
    };
}
