import { useMemo, useState } from 'react';
import { Database, Search } from 'lucide-react';
import { EntryListItem, type ManagedEntry } from './EntryListItem';

/** Above this many entries a local filter box appears. */
const SEARCH_THRESHOLD = 8;

export function entryDisplayName(entry: ManagedEntry, resolvedNames: Record<string, string>): string {
    return entry.label || resolvedNames[entry.id] || entry.id?.split('.').pop() || entry.id || '(ohne ID)';
}

/**
 * Left column of the datapoint dialog: every entry at a glance, one of them selected.
 * Unlike the old accordion this list is never truncated to a fixed height - it fills
 * the dialog and scrolls on its own.
 */
export function EntryMasterList({
    entries,
    resolvedNames,
    selectedId,
    onSelect,
    onRemove,
    onRemoveAll,
    onAdd,
    addLabel = 'Datenpunkt hinzufügen',
    onReorder,
    sortHint,
}: {
    entries: ManagedEntry[];
    resolvedNames: Record<string, string>;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
    onRemoveAll: () => void;
    onAdd?: () => void;
    addLabel?: string;
    onReorder?: (from: number, to: number) => void;
    /** Set while a sort order makes manual ordering pointless - shown as a footer. */
    sortHint?: string;
}) {
    const [query, setQuery] = useState('');
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const showSearch = entries.length > SEARCH_THRESHOLD;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entries.map((e, i) => ({ entry: e, index: i }));
        return entries
            .map((e, i) => ({ entry: e, index: i }))
            .filter(
                ({ entry }) =>
                    entry.id.toLowerCase().includes(q) ||
                    entryDisplayName(entry, resolvedNames).toLowerCase().includes(q),
            );
    }, [entries, query, resolvedNames]);

    // Drag indexes address the UNFILTERED array, so reordering a filtered view would
    // move the wrong entries. Same for an active sort order, where manual order is
    // ignored by the widget anyway.
    const filterActive = query.trim().length > 0;
    const canDrag = !!onReorder && !filterActive && !sortHint;

    const handleDrop = (toIdx: number) => {
        if (onReorder && dragIdx !== null && dragIdx !== toIdx) onReorder(dragIdx, toIdx);
        setDragIdx(null);
        setDragOverIdx(null);
    };

    return (
        <div className="flex flex-col h-full min-h-0 gap-1.5">
            <div className="flex items-center justify-between shrink-0">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Datenpunkte ({entries.length})
                </label>
                {entries.length > 0 && (
                    <button
                        onClick={onRemoveAll}
                        className="text-[10px] hover:opacity-70"
                        style={{ color: 'var(--accent-red, #ef4444)' }}
                    >
                        Alle löschen
                    </button>
                )}
            </div>

            {showSearch && (
                <div className="relative shrink-0">
                    <Search
                        size={11}
                        className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-secondary)' }}
                    />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Liste filtern…"
                        className="w-full text-[11px] rounded-lg pl-6 pr-2 py-1.5 focus:outline-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    />
                </div>
            )}

            <div className="aura-scroll flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
                {filtered.map(({ entry, index }) => (
                    <EntryListItem
                        key={entry.id}
                        entry={entry}
                        displayName={entryDisplayName(entry, resolvedNames)}
                        selected={entry.id === selectedId}
                        onSelect={() => onSelect(entry.id)}
                        onRemove={() => onRemove(entry.id)}
                        drag={
                            onReorder
                                ? {
                                      index,
                                      isDragging: dragIdx === index,
                                      isDragTarget: dragOverIdx === index && dragIdx !== null && dragIdx !== index,
                                      onDragStart: canDrag ? setDragIdx : undefined,
                                      onDragOver: setDragOverIdx,
                                      onDragEnd: () => {
                                          setDragIdx(null);
                                          setDragOverIdx(null);
                                      },
                                      onDrop: handleDrop,
                                  }
                                : undefined
                        }
                    />
                ))}
                {entries.length > 0 && filtered.length === 0 && (
                    <p className="text-[10px] px-1 py-2" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Kein Eintrag passt zum Filter.
                    </p>
                )}
            </div>

            {(sortHint || (filterActive && onReorder)) && (
                <p className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {sortHint ?? 'Reihenfolge lässt sich nur in der ungefilterten Liste ändern.'}
                </p>
            )}

            {onAdd && (
                <button
                    onClick={onAdd}
                    className="shrink-0 w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                >
                    <Database size={12} /> {addLabel}
                </button>
            )}
        </div>
    );
}
