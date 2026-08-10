import { lazy, Suspense, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { NameFilterRule, NameSource } from '../../utils/nameFilter';
import { ConfigModal } from './ConfigModal';

// Lazy — the rule editor is only needed once the sub-editor is opened.
const NameFilterEditor = lazy(() => import('./NameFilterEditor').then((m) => ({ default: m.NameFilterEditor })));

const EMPTY_RULES: NameFilterRule[] = [];

/**
 * The "name display" pair shared by every widget that labels datapoints: the name-pattern
 * template plus the name-filter sub-editor that reshapes the placeholder texts. Kept in one
 * component so status overview, static list and dynamic list stay in sync.
 *
 * `samples` are real datapoints of the owning widget — the sub-editor previews the rules on
 * them with the same formatItemName the widget renders with, so the preview cannot drift.
 */
export function NameDisplayFields({
    pattern,
    rules,
    samples,
    sampleTotal,
    onChange,
    inline,
}: {
    pattern?: string;
    rules?: NameFilterRule[];
    samples: NameSource[];
    /** How many datapoints exist in total (samples is a slice of them). */
    sampleTotal: number;
    onChange: (patch: { namePattern?: string; nameFilters?: NameFilterRule[] }) => void;
    /** Render the rule editor right here instead of behind a button. Used inside the
     *  datapoint dialog, where there is room and a second ConfigModal on the same
     *  z-tier would only stack overlays for no gain. */
    inline?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const count = rules?.length ?? 0;

    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Namensmuster (leer = Standard)
            </label>
            <input
                type="text"
                value={pattern ?? ''}
                onChange={(e) => onChange({ namePattern: e.target.value || undefined })}
                placeholder="<Raum> <Gerät>"
                className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                }}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                Platzhalter: &lt;Raum&gt;, &lt;Gerät&gt;, &lt;DPName&gt;, &lt;Name&gt;, &lt;ID&gt;. Beispiel:{' '}
                {'„<Raum> <Gerät>“'}.
            </p>
            {inline ? (
                <div className="mt-3">
                    <Suspense
                        fallback={
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                Lädt …
                            </div>
                        }
                    >
                        <NameFilterEditor
                            rules={rules ?? EMPTY_RULES}
                            pattern={pattern}
                            samples={samples}
                            sampleTotal={sampleTotal}
                            onChange={(next) => onChange({ nameFilters: next.length ? next : undefined })}
                        />
                    </Suspense>
                </div>
            ) : (
                <>
                    <button
                        onClick={() => setOpen(true)}
                        className="mt-1.5 w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                        style={{
                            background: count ? 'var(--accent)' : 'var(--app-bg)',
                            border: `1px solid ${count ? 'transparent' : 'var(--app-border)'}`,
                            color: count ? '#fff' : 'var(--text-primary)',
                        }}
                    >
                        <span className="flex items-center gap-1.5">
                            <SlidersHorizontal size={13} /> Namens-Filter
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
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        Schneidet die Platzhalter-Texte zurecht (z. B. {'„ACTUAL_TEMPERATURE“'} → {'„Temperatur“'}) — in
                        Klartext oder per Regex, mit Vorschau. Ohne eigenes Muster wird &lt;Name&gt; angenommen.
                    </p>
                    {open && (
                        <ConfigModal
                            title="Namens-Filter"
                            maxWidth={640}
                            maxHeight={700}
                            padded
                            storageKey="aura-name-filter-modal"
                            onClose={() => setOpen(false)}
                        >
                            <Suspense
                                fallback={
                                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                        Lädt …
                                    </div>
                                }
                            >
                                <NameFilterEditor
                                    rules={rules ?? EMPTY_RULES}
                                    pattern={pattern}
                                    samples={samples}
                                    sampleTotal={sampleTotal}
                                    onChange={(next) => onChange({ nameFilters: next.length ? next : undefined })}
                                />
                            </Suspense>
                        </ConfigModal>
                    )}
                </>
            )}
        </div>
    );
}
