import { lazy, Suspense, useRef, useState, type ComponentProps } from 'react';
import { Database } from 'lucide-react';

// Lazy: the dialog pulls in the whole per-entry editor tree (EntryControlsConfig
// alone is ~870 lines) and is only needed once the user actually opens it.
const DatapointManagerModal = lazy(() =>
    import('./DatapointManagerModal').then((m) => ({ default: m.DatapointManagerModal })),
);

type ModalProps = ComponentProps<typeof DatapointManagerModal>;

/**
 * The button that replaces the entry list in the widget's options panel, plus the
 * lazily mounted dialog behind it. Styled like the name-filter trigger in
 * NameDisplayFields so both sub-editors read as the same kind of control.
 */
export function DatapointManagerField({
    label = 'Datenpunkte verwalten',
    hint,
    count,
    ...modalProps
}: Omit<ModalProps, 'onClose'> & { label?: string; hint?: string; count: number }) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    return (
        <div>
            <button
                ref={buttonRef}
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                style={{
                    background: count ? 'var(--accent)' : 'var(--app-bg)',
                    border: `1px solid ${count ? 'transparent' : 'var(--app-border)'}`,
                    color: count ? '#fff' : 'var(--text-primary)',
                }}
            >
                <span className="flex items-center gap-1.5">
                    <Database size={13} /> {label}
                </span>
                <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                        background: count ? 'rgba(255,255,255,0.25)' : 'var(--app-border)',
                        color: count ? '#fff' : 'var(--text-secondary)',
                    }}
                >
                    {count}
                </span>
            </button>
            {hint && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {hint}
                </p>
            )}
            {open && (
                <Suspense
                    fallback={
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Lädt …
                        </div>
                    }
                >
                    <DatapointManagerModal
                        {...modalProps}
                        onClose={() => {
                            setOpen(false);
                            // Give the focus back to the trigger - the dialog portals
                            // out of the panel, so it would land on <body> otherwise.
                            buttonRef.current?.focus();
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}
