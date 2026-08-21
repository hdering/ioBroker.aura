import { Fragment, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * A plain string is both the stored value and the shown text. The object form exists
 * for lists whose labels are not unique - the custom enum categories of the dynamic
 * list store the full enum id and show only the name, optionally under a `group`
 * heading (see utils/enumFilter).
 */
export type MultiSelectOption = string | { value: string; label: string; group?: string };

export function MultiSelect({
    label,
    options,
    selected,
    onChange,
    loading,
    placeholder,
}: {
    label: string;
    options: MultiSelectOption[];
    selected: string[];
    onChange: (v: string[]) => void;
    loading?: boolean;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o, group: undefined } : o));
    const q = search.toLowerCase();
    const filtered = norm.filter((o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q));
    const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
    // Unknown values (an enum deleted in ioBroker) still show, as the raw id - hiding
    // them would silently drop a filter the user cannot see any more.
    const selectedText = selected.map((v) => norm.find((o) => o.value === v)?.label ?? v).join(', ');

    return (
        <div className="relative">
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between text-xs rounded-lg px-3 py-2.5 focus:outline-none text-left"
                style={{
                    background: 'var(--app-bg)',
                    color: selected.length ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                }}
            >
                <span className="truncate flex-1 min-w-0">
                    {loading ? 'Lade…' : selected.length === 0 ? (placeholder ?? 'Alle') : selectedText}
                </span>
                <ChevronDown
                    size={11}
                    className={`shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--text-secondary)' }}
                />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
                    <div
                        className="absolute z-50 left-0 right-0 mt-1 rounded-lg shadow-2xl overflow-hidden"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        {options.length > 8 && (
                            <div className="p-1.5" style={{ borderBottom: '1px solid var(--app-border)' }}>
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Suchen…"
                                    className="w-full text-xs px-2 py-1 rounded focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: 'none',
                                    }}
                                />
                            </div>
                        )}
                        <div className="aura-scroll max-h-56 overflow-y-auto">
                            {filtered.length === 0 && (
                                <p className="text-[10px] p-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                                    Keine Ergebnisse
                                </p>
                            )}
                            {filtered.map((opt, i) => {
                                const on = selected.includes(opt.value);
                                const heading = opt.group && opt.group !== filtered[i - 1]?.group ? opt.group : null;
                                return (
                                    <Fragment key={opt.value}>
                                        {heading && (
                                            <p
                                                className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {heading}
                                            </p>
                                        )}
                                        <label
                                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:opacity-90"
                                            style={{
                                                background: on
                                                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                    : 'transparent',
                                            }}
                                        >
                                            <div
                                                className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                                                style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
                                            >
                                                {on && <Check size={9} color="#fff" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={on}
                                                onChange={() => toggle(opt.value)}
                                            />
                                            <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                                {opt.label}
                                            </span>
                                        </label>
                                    </Fragment>
                                );
                            })}
                        </div>
                        {selected.length > 0 && (
                            <div className="p-1.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                                <button
                                    type="button"
                                    onClick={() => onChange([])}
                                    className="text-[10px] hover:opacity-70 w-full text-center"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Auswahl aufheben
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
