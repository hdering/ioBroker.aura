/**
 * The sort block of both list config panels: one button that opens the rule dialog,
 * plus a one-line summary of what the list currently sorts by.
 *
 * Sorting used to be a stack of segmented controls inline in the panel — two keys,
 * two directions, nothing else fit. It is a dialog now, for the same reason the
 * filters became one: a criterion has more to say than a key (how to compare, where
 * empty rows go) and the panel has no room to say it.
 *
 * Options stored before that keep working untouched: effectiveSortRules() maps the
 * old `sortBy`/`sortBy2` pair onto the same rule chain, so the dialog opens with the
 * setting that is in effect, and the legacy keys are dropped on the first edit.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { effectiveSortRules, sortSummary, type ListSortOptions, type ListSortRule } from '../../../utils/listSort';
import type { EditorFilterRow } from './ListFilterEditor';

// Lazy: the editor subscribes to the live values of every configured datapoint and
// is only needed once the user actually opens it.
const ListSortModal = lazy(() => import('./ListSortModal').then((m) => ({ default: m.ListSortModal })));

export function ListSortSection({
    opts,
    setOpts,
    rows,
    storageKey,
    hint,
}: {
    opts: ListSortOptions;
    setOpts: (patch: Partial<ListSortOptions>) => void;
    /** Configured rows — the editor reads their live values for the order preview. */
    rows: EditorFilterRow[];
    /** localStorage key for the dialog size. */
    storageKey: string;
    /** Shown inside the dialog — the static list explains section-wise sorting here. */
    hint?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rules = effectiveSortRules(opts);
    const summary = sortSummary(opts);

    const setRules = (next: ListSortRule[] | undefined) =>
        setOpts({
            sortRules: next,
            // The chain now owns the sorting; leaving the old pair behind would make
            // the stored config say two different things.
            sortBy: undefined,
            sortOrder: undefined,
            sortBy2: undefined,
            sortOrder2: undefined,
        });

    return (
        <>
            <div>
                <button
                    ref={buttonRef}
                    onClick={() => setOpen(true)}
                    className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                    style={{
                        background: rules.length ? 'var(--accent)' : 'var(--app-bg)',
                        border: `1px solid ${rules.length ? 'transparent' : 'var(--app-border)'}`,
                        color: rules.length ? '#fff' : 'var(--text-primary)',
                    }}
                >
                    <span className="flex items-center gap-1.5">
                        <ArrowDownUp size={13} /> Sortierung
                    </span>
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                            background: rules.length ? 'rgba(255,255,255,0.25)' : 'var(--app-border)',
                            color: rules.length ? '#fff' : 'var(--text-secondary)',
                        }}
                    >
                        {rules.length}
                    </span>
                </button>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {summary || 'Ohne Kriterium bleibt die konfigurierte Reihenfolge.'}
                </p>
            </div>

            {open && (
                <Suspense
                    fallback={
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Lädt …
                        </div>
                    }
                >
                    <ListSortModal
                        rules={rules}
                        rows={rows}
                        storageKey={storageKey}
                        hint={hint}
                        onChange={setRules}
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
