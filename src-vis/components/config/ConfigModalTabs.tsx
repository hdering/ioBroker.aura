import { useState, type ReactNode } from 'react';
import { ConfigModal } from './ConfigModal';

export interface ConfigModalTab {
    key: string;
    label: string;
}

/** The tab row of the big config dialogs (list datapoints, status overview). */
export function ConfigModalTabBar({
    tabs,
    active,
    onSelect,
}: {
    tabs: ConfigModalTab[];
    active: string;
    onSelect: (key: string) => void;
}) {
    return (
        <div
            className="aura-config-modal-tabs flex flex-wrap items-center gap-1 px-3 pt-2.5 pb-2 shrink-0"
            style={{ borderBottom: '1px solid var(--app-border)' }}
            role="tablist"
        >
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active === tab.key}
                    data-config-tab={tab.key}
                    onClick={() => onSelect(tab.key)}
                    className="text-xs rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                    style={{
                        background: active === tab.key ? 'var(--accent)' : 'var(--app-bg)',
                        color: active === tab.key ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${active === tab.key ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

export interface TabbedConfigTab extends ConfigModalTab {
    /** `goTo` switches to another tab, e.g. from a "→ Kategorien" link. */
    node: ReactNode | ((goTo: (key: string) => void) => ReactNode);
    /** The pane brings its own padding/scrolling (master-detail). */
    bare?: boolean;
}

/**
 * A config dialog that is nothing but tabs. A tab mounts on its first visit and then
 * stays mounted while hidden, so drafts and scroll positions survive a look elsewhere.
 */
export function TabbedConfigModal({
    title,
    storageKey,
    tabs,
    active,
    onActiveChange,
    maxWidth = 1100,
    onClose,
}: {
    title: string;
    storageKey: string;
    tabs: TabbedConfigTab[];
    active: string;
    onActiveChange: (key: string) => void;
    maxWidth?: number;
    onClose: () => void;
}) {
    const [visited, setVisited] = useState<Set<string>>(() => new Set([active]));
    if (!visited.has(active)) setVisited(new Set(visited).add(active));
    const goTo = (key: string) => onActiveChange(key);
    return (
        <ConfigModal title={title} maxWidth={maxWidth} storageKey={storageKey} onClose={onClose}>
            <div className="flex flex-col h-full min-h-0">
                <ConfigModalTabBar tabs={tabs} active={active} onSelect={goTo} />
                {tabs.map((tab) =>
                    visited.has(tab.key) || tab.key === active ? (
                        <div
                            key={tab.key}
                            role="tabpanel"
                            data-config-pane={tab.key}
                            className={`flex-1 min-h-0 ${
                                tab.bare ? 'flex flex-col' : 'aura-scroll overflow-y-auto p-3 space-y-2.5'
                            } ${active === tab.key ? '' : 'hidden'}`}
                        >
                            {typeof tab.node === 'function' ? tab.node(goTo) : tab.node}
                        </div>
                    ) : null,
                )}
            </div>
        </ConfigModal>
    );
}
