/**
 * Filter control in the header of the static and the dynamic list.
 *
 * Both widgets carried byte-identical copies of the button + dropdown, hard-wired to
 * the three built-in modes. It now renders whatever choices it is handed (built-ins
 * plus the admin's presets, see utils/listFilter) and — unless switched off — a
 * free-text field above them.
 *
 * The free text lives here rather than in the widget header: a search box in the
 * header would eat the row a narrow list does not have, and the chip already is the
 * place users go to for filtering.
 */
import { useEffect, useRef, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import type { ListFilterChoice } from '../../utils/listFilter';
import { getWidgetIcon } from '../../utils/widgetIconMap';

export function ListFilterChip({
    choices,
    value,
    onChange,
    search,
    onSearchChange,
    showSearch,
    searchPlaceholder,
    label,
}: {
    choices: ListFilterChoice[];
    /** Active mode key ('all' | 'active' | 'inactive' | preset id). */
    value: string;
    onChange: (key: string) => void;
    search: string;
    onSearchChange: (term: string) => void;
    showSearch?: boolean;
    searchPlaceholder?: string;
    /** Text on the chip while a filter is active. Empty = icon only. */
    label: string;
}) {
    const [open, setOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    // Opening the menu to type is the common case once a search field is there.
    useEffect(() => {
        if (open && showSearch) searchRef.current?.focus();
    }, [open, showSearch]);

    const active = value !== 'all' || !!search.trim();
    const chipText = search.trim() ? `„${search.trim()}“` : label;

    return (
        <div className="relative shrink-0">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:opacity-80 max-w-[120px]"
                style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'}`,
                }}
                title="Filter"
            >
                <Filter size={10} className="shrink-0" />
                {active && !!chipText && <span className="truncate">{chipText}</span>}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div
                        className="absolute right-0 top-6 rounded-lg shadow-xl z-20 overflow-hidden min-w-[150px] max-w-[240px]"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        {showSearch && (
                            <div
                                className="flex items-center gap-1 px-2 py-1.5"
                                style={{ borderBottom: '1px solid var(--app-border)' }}
                            >
                                <Search size={11} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
                                <input
                                    ref={searchRef}
                                    value={search}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    placeholder={searchPlaceholder || 'Suchen …'}
                                    className="flex-1 min-w-0 bg-transparent text-[11px] focus:outline-none"
                                    style={{ color: 'var(--text-primary)' }}
                                />
                                {!!search && (
                                    <button
                                        onClick={() => onSearchChange('')}
                                        title="Suche leeren"
                                        className="shrink-0 hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <X size={11} />
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="max-h-[240px] overflow-auto aura-scroll">
                            {choices.map((choice) => {
                                const Icon = choice.icon ? getWidgetIcon(choice.icon, null) : null;
                                const selected = value === choice.key;
                                return (
                                    <button
                                        key={choice.key}
                                        onClick={() => {
                                            onChange(choice.key);
                                            setOpen(false);
                                        }}
                                        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-left hover:opacity-80"
                                        style={{
                                            background: selected
                                                ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                : 'transparent',
                                            color: selected ? 'var(--accent)' : 'var(--text-primary)',
                                        }}
                                    >
                                        {Icon && <Icon size={12} className="shrink-0" />}
                                        <span className="truncate">{choice.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
