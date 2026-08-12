/**
 * The filter block of both list config panels: which filter the widget starts with
 * (backend preview / frontend), the admin's own filters behind a dialog, and the
 * labels & switches around the filter chip.
 *
 * Both panels carried identical copies of a three-button segmented control that could
 * only ever say Alle / Nur aktive / Nur inaktive. Since the choices are now open-ended
 * (utils/listFilter), it is one <select> fed from the same list the widget's chip
 * shows — and one component instead of two copies.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { buildFilterChoices, type ListFilterOptions, type ListFilterPreset } from '../../../utils/listFilter';
import type { EditorFilterRow } from './ListFilterEditor';

// Lazy: the editor pulls in the icon picker and the live-value subscription and is
// only needed once the user actually opens it.
const ListFilterModal = lazy(() => import('./ListFilterModal').then((m) => ({ default: m.ListFilterModal })));

/** The option fields this section owns, across both list widgets. */
export interface ListFilterSectionOptions extends ListFilterOptions {
    valueFilter?: string;
    backendValueFilter?: string;
    hideFilterButton?: boolean;
}

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                style={{ left: on ? '18px' : '2px' }}
            />
        </button>
    );
}

export function ListFilterSection({
    opts,
    setOpts,
    rows,
    storageKey,
    showChipToggle,
}: {
    opts: ListFilterSectionOptions;
    setOpts: (patch: Partial<ListFilterSectionOptions>) => void;
    /** Configured rows — the editor reads their live values for value lists & preview. */
    rows: EditorFilterRow[];
    /** localStorage key for the dialog size. */
    storageKey: string;
    /** Only the static list can hide the filter chip in the frontend. */
    showChipToggle?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const presets = opts.filterPresets ?? [];
    const choices = buildFilterChoices(opts);

    const setPresets = (next: ListFilterPreset[] | undefined) => setOpts({ filterPresets: next });

    return (
        <>
            <div>
                <button
                    ref={buttonRef}
                    onClick={() => setOpen(true)}
                    className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                    style={{
                        background: presets.length ? 'var(--accent)' : 'var(--app-bg)',
                        border: `1px solid ${presets.length ? 'transparent' : 'var(--app-border)'}`,
                        color: presets.length ? '#fff' : 'var(--text-primary)',
                    }}
                >
                    <span className="flex items-center gap-1.5">
                        <Filter size={13} /> Eigene Filter
                    </span>
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                            background: presets.length ? 'rgba(255,255,255,0.25)' : 'var(--app-border)',
                            color: presets.length ? '#fff' : 'var(--text-secondary)',
                        }}
                    >
                        {presets.length}
                    </span>
                </button>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    Regeln auf Haupt-Datenpunkt und/oder die weiteren Datenpunkte der zweiten Zeile.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Filter im Editor
                    </label>
                    <select
                        value={opts.backendValueFilter ?? 'all'}
                        onChange={(e) =>
                            setOpts({ backendValueFilter: e.target.value === 'all' ? undefined : e.target.value })
                        }
                        className="w-full text-[11px] rounded px-2 py-1.5 focus:outline-none"
                        style={iSty}
                        title="Was die Vorschau im Editor zeigt"
                    >
                        {choices.map((c) => (
                            <option key={c.key} value={c.key}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Filter im Frontend
                    </label>
                    <select
                        value={opts.valueFilter ?? 'all'}
                        onChange={(e) => setOpts({ valueFilter: e.target.value })}
                        className="w-full text-[11px] rounded px-2 py-1.5 focus:outline-none"
                        style={iSty}
                        title="Womit die Liste im Frontend startet – Betrachter können umschalten"
                    >
                        {choices.map((c) => (
                            <option key={c.key} value={c.key}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {showChipToggle && (
                <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        Filter-Button im Frontend anzeigen
                    </label>
                    <Toggle
                        on={!(opts.hideFilterButton ?? false)}
                        onClick={() => setOpts({ hideFilterButton: !(opts.hideFilterButton ?? false) })}
                    />
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Freitext-Suche im Filter-Menü
                </label>
                <Toggle
                    on={!(opts.hideFilterSearch ?? false)}
                    onClick={() => setOpts({ hideFilterSearch: !(opts.hideFilterSearch ?? false) })}
                />
            </div>
            {!opts.hideFilterSearch && (
                <input
                    className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                    style={iSty}
                    placeholder="Platzhalter der Suche (Standard: Suchen …)"
                    value={opts.filterSearchPlaceholder ?? ''}
                    onChange={(e) => setOpts({ filterSearchPlaceholder: e.target.value || undefined })}
                />
            )}

            <div className="flex items-center justify-between gap-2">
                <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    „Nur aktive/inaktive“ im Menü anbieten
                </label>
                <Toggle
                    on={!(opts.hideBuiltinFilters ?? false)}
                    onClick={() => setOpts({ hideBuiltinFilters: !(opts.hideBuiltinFilters ?? false) })}
                />
            </div>
            {!opts.hideBuiltinFilters && (
                <div className="grid grid-cols-2 gap-1.5">
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;aktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={iSty}
                            placeholder="Nur aktive"
                            value={opts.filterActiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterActiveLabel: e.target.value || undefined })}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;inaktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={iSty}
                            placeholder="Nur inaktive"
                            value={opts.filterInactiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterInactiveLabel: e.target.value || undefined })}
                        />
                    </div>
                </div>
            )}

            {open && (
                <Suspense
                    fallback={
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Lädt …
                        </div>
                    }
                >
                    <ListFilterModal
                        presets={presets}
                        rows={rows}
                        storageKey={storageKey}
                        onChange={setPresets}
                        onClose={() => {
                            setOpen(false);
                            // Hand focus back to the trigger — the dialog portals out of
                            // the panel, so it would land on <body> otherwise.
                            buttonRef.current?.focus();
                        }}
                    />
                </Suspense>
            )}
        </>
    );
}
