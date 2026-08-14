import { useState, type ReactNode } from 'react';
import { ConfigModal } from '../ConfigModal';
import { EntryMasterList } from './EntryMasterList';
import type { ManagedEntry } from './EntryListItem';

/** Handed to the detail renderer so it can retarget the selection. */
export interface DetailApi {
    /** Call right after the entry's id changed - otherwise the selection dangles. */
    select: (id: string | null) => void;
}

/** Handed to caller-supplied tabs so they can hand control back to the entry list. */
export interface TabApi extends DetailApi {
    goToEntries: () => void;
}

const TAB_ENTRIES = 'entries';

/**
 * "Datenpunkte verwalten" - the dialog both list widgets open from their config panel.
 *
 * Master-detail: the entry list stays visible on the left while the full editor of the
 * selected entry fills the right side. Tabs beyond "Einträge" are supplied by the
 * caller (datapoint search for the dynamic list, name display for both) and are kept
 * MOUNTED while hidden - the search tab holds unsaved filter drafts and results that
 * must survive a peek at an entry.
 */
export function DatapointManagerModal({
    title,
    storageKey,
    entries,
    resolvedNames,
    onRemove,
    onRemoveAll,
    onAdd,
    addLabel,
    onAddDivider,
    onReorder,
    sortHint,
    renderDetail,
    tabs = [],
    entriesTabIndex = 0,
    emptyState,
    onClose,
}: {
    title: string;
    storageKey: string;
    entries: ManagedEntry[];
    resolvedNames: Record<string, string>;
    onRemove: (id: string) => void;
    onRemoveAll: () => void;
    onAdd?: () => void;
    addLabel?: string;
    onAddDivider?: () => void;
    onReorder?: (from: number, to: number) => void;
    sortHint?: string;
    renderDetail: (id: string, api: DetailApi) => ReactNode;
    /** Additional tabs, in display order. */
    tabs?: { key: string; label: string; node: ReactNode | ((api: TabApi) => ReactNode) }[];
    /** Where the built-in "Einträge" tab slots into `tabs`. Default: first. */
    entriesTabIndex?: number;
    /** Shown in the detail pane while the list is empty. */
    emptyState?: ReactNode;
    onClose: () => void;
}) {
    // Derived, not synced by an effect: an effect would fight the user on every
    // options change (the panel re-renders on each keystroke).
    const [selectedId, setSelectedId] = useState<string | null>(() => entries[0]?.id ?? null);
    // An empty list with a tab in front of "Einträge" (the datapoint search) opens
    // there - that is the only place where anything can happen yet.
    const [activeTab, setActiveTab] = useState(() =>
        entries.length === 0 && entriesTabIndex > 0 ? tabs[0].key : TAB_ENTRIES,
    );
    const selected = entries.find((e) => e.id === selectedId) ?? null;

    const removeEntry = (id: string) => {
        if (id === selectedId) {
            // Pick the successor BEFORE removing, so the detail pane keeps content.
            const idx = entries.findIndex((e) => e.id === id);
            setSelectedId(entries[idx + 1]?.id ?? entries[idx - 1]?.id ?? null);
        }
        onRemove(id);
    };

    const removeAll = () => {
        setSelectedId(null);
        onRemoveAll();
    };

    const allTabs = [...tabs];
    allTabs.splice(Math.min(entriesTabIndex, allTabs.length), 0, {
        key: TAB_ENTRIES,
        label: `Einträge (${entries.filter((e) => !e.divider).length})`,
        node: null,
    });

    return (
        <ConfigModal title={title} maxWidth={1280} storageKey={storageKey} onClose={onClose}>
            <div className="flex flex-col h-full min-h-0">
                {allTabs.length > 1 && (
                    <div
                        className="flex items-center gap-1 px-3 pt-2.5 pb-2 shrink-0"
                        style={{ borderBottom: '1px solid var(--app-border)' }}
                    >
                        {allTabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className="text-xs rounded-lg px-3 py-1.5 transition-colors"
                                style={{
                                    background: activeTab === tab.key ? 'var(--accent)' : 'var(--app-bg)',
                                    color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${activeTab === tab.key ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Entries tab */}
                <div className={`flex-1 min-h-0 flex gap-3 p-3 ${activeTab === TAB_ENTRIES ? '' : 'hidden'}`}>
                    <div className="w-[300px] shrink-0 min-h-0">
                        <EntryMasterList
                            entries={entries}
                            resolvedNames={resolvedNames}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onRemove={removeEntry}
                            onRemoveAll={removeAll}
                            onAdd={onAdd}
                            addLabel={addLabel}
                            onAddDivider={onAddDivider}
                            onReorder={onReorder}
                            sortHint={sortHint}
                        />
                    </div>
                    <div
                        className="aura-scroll flex-1 min-w-0 overflow-y-auto rounded-lg p-3"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        {selected ? (
                            // key resets the detail's local state (open pickers, id draft)
                            // when the selection moves to another entry.
                            <div key={selected.id} className="space-y-2.5">
                                {renderDetail(selected.id, { select: setSelectedId })}
                            </div>
                        ) : (
                            <div
                                className="h-full flex items-center justify-center text-center text-xs px-6"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {entries.length > 0
                                    ? 'Links einen Datenpunkt wählen.'
                                    : (emptyState ?? 'Noch keine Datenpunkte.')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Caller-supplied tabs - mounted permanently, only hidden. */}
                {tabs.map((tab) => (
                    <div
                        key={tab.key}
                        className={`aura-scroll flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 ${
                            activeTab === tab.key ? '' : 'hidden'
                        }`}
                    >
                        {typeof tab.node === 'function'
                            ? tab.node({ select: setSelectedId, goToEntries: () => setActiveTab(TAB_ENTRIES) })
                            : tab.node}
                    </div>
                ))}
            </div>
        </ConfigModal>
    );
}
