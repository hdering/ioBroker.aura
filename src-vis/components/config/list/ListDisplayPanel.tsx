/**
 * The dynamic list's "Darstellung", configured ONCE for every row.
 *
 * Same reasoning as the icon tab next to it (see ListIconPanel): the rows come from a
 * filter and change on every sync, so a per-datapoint display can only ever cover the
 * rows that happen to exist right now. This panel sets what every discovered row is
 * rendered as — a switch, a slider, a value mapping … — including that display's own
 * options.
 *
 * Precedence is all-or-nothing per row (see utils/listDisplayDefaults): a datapoint that
 * picked a display of its own in the tab "Einträge" is configured completely on its own
 * and ignores this block.
 */
import { useMemo } from 'react';
import { EntryControlsConfig, entryDisplayTypeLabel } from '../EntryControlsConfig';
import { rowSpecificDps } from '../../../utils/listDisplayDefaults';
import type { EntryControlConfig } from '../../widgets/entryControls';
import type { AutoListOptions } from '../../widgets/AutoListWidget';

const PREVIEW_ROWS = 6;

export function ListDisplayPanel({
    opts,
    onOptsChange,
    resolvedNames,
}: {
    opts: AutoListOptions;
    onOptsChange: (patch: Partial<AutoListOptions>) => void;
    /** `id → name` from the config panel's datapoint cache, for the preview labels. */
    resolvedNames: Record<string, string>;
}) {
    const entries = (opts.entries ?? []).filter((e) => !!e?.id);
    const display = (opts.entryDisplay ?? {}) as EntryControlConfig;
    const ownCount = entries.filter((e) => !!e.displayType).length;
    // A sample row, so the editor's live bits work here too: the date/time preview
    // reads a real value and "Wertzuordnung" can prefill from common.states.
    const sampleId = entries.find((e) => !e.displayType)?.id ?? entries[0]?.id;
    const rowDps = rowSpecificDps(display);

    const previewKey = entries.map((e) => `${e.id}|${e.displayType ?? ''}`).join(',');
    const preview = useMemo(
        () =>
            entries.slice(0, PREVIEW_ROWS).map((e) => ({
                id: e.id,
                name: e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id,
                own: !!e.displayType,
                type: entryDisplayTypeLabel(e.displayType ?? display.displayType),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [previewKey, display.displayType, resolvedNames],
    );

    const label = { color: 'var(--text-secondary)' } as React.CSSProperties;
    const box: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    const patchDisplay = (patch: Partial<EntryControlConfig>) => {
        const next = { ...display, ...patch } as Record<string, unknown>;
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        // Back to "Auto" means: no list-wide display at all — drop the whole block so a
        // row is exactly what it was before the option existed.
        onOptsChange({ entryDisplay: next.displayType ? (next as EntryControlConfig) : undefined });
    };

    /** Drop every per-datapoint display, so the list-wide one is what shows. */
    const clearOwn = () =>
        onOptsChange({ entries: (opts.entries ?? []).map((e) => ({ ...e, displayType: undefined })) });

    return (
        <div className="aura-list-display space-y-3">
            <p className="text-[11px]" style={{ ...label, opacity: 0.85 }}>
                Wie die Datenpunkte dargestellt werden — für <strong>alle</strong> Einträge der Liste. Die Datenpunkte
                kommen aus einem Filter und ändern sich beim Abgleich, deshalb wird die Darstellung hier einmal zentral
                gesetzt. Ein Datenpunkt mit eigener Darstellung (Tab {'„Einträge“'}) behält seine — samt deren
                Einstellungen.
            </p>

            <div className="rounded-lg px-2.5 py-2" style={{ border: '1px solid var(--app-border)' }}>
                <EntryControlsConfig
                    entry={{ ...display, id: sampleId }}
                    onUpdate={patchDisplay}
                    autoLabel="Auto (keine Vorgabe)"
                />
            </div>

            {rowDps.length > 0 && (
                <p className="text-[10px] rounded-lg px-2.5 py-2" style={{ ...label, border: '1px solid #f59e0b' }}>
                    Achtung: {rowDps.join(', ')} zeigt auf einen festen Datenpunkt und gilt so für <em>jede</em> Zeile.
                    Solche Befehls- und Status-Datenpunkte gehören pro Eintrag gesetzt.
                </p>
            )}

            {ownCount > 0 && (
                <div className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ border: '1px solid var(--app-border)' }}>
                    <p className="text-[10px]" style={{ ...label, opacity: 0.85 }}>
                        {ownCount} von {entries.length} Datenpunkten haben eine eigene Darstellung und ignorieren die
                        Vorgabe oben.
                    </p>
                    <button onClick={clearOwn} className="text-[10px] rounded px-2 py-1 hover:opacity-80" style={box}>
                        Eigene Darstellungen entfernen ({ownCount})
                    </button>
                </div>
            )}

            {preview.length > 0 && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <div
                        className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ ...label, borderBottom: '1px solid var(--app-border)' }}
                    >
                        Vorschau ({preview.length} von {entries.length})
                    </div>
                    <div>
                        {preview.map((p, i) => (
                            <div
                                key={p.id}
                                className="px-2 py-1 flex items-center gap-1.5"
                                style={{ borderTop: i ? '1px solid var(--app-border)' : undefined }}
                            >
                                <span className="text-[10px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                                    {p.name}
                                </span>
                                <span className="text-[9px] shrink-0" style={{ ...label, opacity: p.own ? 1 : 0.7 }}>
                                    {p.type}
                                    {p.own ? ' (eigene)' : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {entries.length === 0 && (
                <p className="text-[11px]" style={label}>
                    Noch keine Datenpunkte – im Tab {'„Suchen & Filter“'} welche finden.
                </p>
            )}
        </div>
    );
}
