import type { StaticListEntry } from '../../widgets/ListWidget';
import { ColorField, DetailSection } from './listFieldUi';

/**
 * Detail pane of a separator row of the static list.
 *
 * A separator is an entry in its own right (see StaticListEntry.divider), so the dialog
 * shows this instead of the datapoint editor when one is selected — same master list,
 * same drag handle, same delete button.
 *
 * Must stay a module-level component, see StaticEntryDetail for why.
 */
export function DividerDetail({
    entry,
    onUpdate,
}: {
    entry: StaticListEntry;
    onUpdate: (patch: Partial<StaticListEntry>) => void;
}) {
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';
    const align = entry.dividerAlign ?? 'left';
    const line = entry.dividerLine !== false;

    return (
        <DetailSection title="Trennlinie">
            <div>
                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Überschrift (optional)
                </label>
                <input
                    className="w-full text-[10px] rounded px-2 py-0.5 focus:outline-none"
                    style={iSty}
                    placeholder="leer = nur Linie"
                    value={entry.dividerLabel ?? ''}
                    onChange={(e) => onUpdate({ dividerLabel: e.target.value || undefined })}
                />
            </div>

            <div>
                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Position
                </label>
                <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {(
                        [
                            ['left', 'Links'],
                            ['center', 'Mitte'],
                            ['right', 'Rechts'],
                        ] as const
                    ).map(([v, lbl]) => (
                        <button
                            key={v}
                            onClick={() => onUpdate({ dividerAlign: v === 'left' ? undefined : v })}
                            className="flex-1 text-[10px] py-1 transition-colors"
                            style={{
                                background: align === v ? 'var(--accent)' : 'var(--app-bg)',
                                color: align === v ? '#fff' : 'var(--text-secondary)',
                                borderRight: v !== 'right' ? '1px solid var(--app-border)' : undefined,
                            }}
                        >
                            {lbl}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-end gap-1.5">
                <div className="flex-1 min-w-0">
                    <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Schriftgröße (px)
                    </label>
                    <input
                        type="number"
                        min={6}
                        max={96}
                        className={iCls}
                        style={iSty}
                        placeholder="10"
                        value={entry.dividerFontSize ?? ''}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            onUpdate({ dividerFontSize: isFinite(n) && n > 0 ? n : undefined });
                        }}
                    />
                </div>
                <div className="shrink-0">
                    <ColorField
                        label="Textfarbe"
                        value={entry.dividerColor}
                        fallback="#94a3b8"
                        onChange={(v) => onUpdate({ dividerColor: v })}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between gap-2">
                <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Linie zeichnen
                </label>
                <button
                    onClick={() => onUpdate({ dividerLine: line ? false : undefined })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: line ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: line ? '18px' : '2px' }}
                    />
                </button>
            </div>

            <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                Trennt die Liste ab hier in einen neuen Abschnitt — per Drag &amp; Drop verschiebbar wie ein Datenpunkt.
                Bei aktiver Sortierung wird innerhalb der Abschnitte sortiert. Bleibt ein Abschnitt durch Wert-Filter
                oder Suche leer, entfällt seine Linie.
            </p>
        </DetailSection>
    );
}
