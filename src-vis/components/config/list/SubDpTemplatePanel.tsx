/**
 * The dynamic list's second line, configured ONCE for every row.
 *
 * The static list has the same feature per entry — which is the right shape there,
 * because those entries are hand-picked. Here the rows come from a filter, so the
 * template addresses them by pattern: `{{parent}}.BATTERY` is resolved against each
 * row's own datapoint (see utils/subDpTemplate). A single entry can still override
 * the result with its own datapoints in the entry detail pane.
 *
 * A sample entry drives both the sibling quick-picks and the preview, so the pattern
 * can be built by clicking instead of by typing tokens.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AutoListOptions } from '../../widgets/AutoListWidget';
import { SubDpFields } from './SubDpFields';
import { resolveSubDpTemplate } from '../../../utils/subDpTemplate';
import { ensureDatapointCache } from '../../../hooks/useDatapointList';

const PREVIEW_ROWS = 6;

export function SubDpTemplatePanel({
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
    const template = opts.subDpTemplate ?? [];
    const hideMissing = opts.subDpTemplateHideMissing !== false;

    const [sampleId, setSampleId] = useState<string>(entries[0]?.id ?? '');
    // The chosen sample can disappear when entries are removed in the other tab.
    useEffect(() => {
        if (sampleId && entries.some((e) => e.id === sampleId)) return;
        setSampleId(entries[0]?.id ?? '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries.map((e) => e.id).join(',')]);

    const [knownIds, setKnownIds] = useState<Set<string> | null>(null);
    useEffect(() => {
        ensureDatapointCache()
            .then((cache) => setKnownIds(new Set(cache.map((c) => c.id))))
            .catch(() => {
                /* offline — the preview then just omits the existence hint */
            });
    }, []);

    const templateKey = JSON.stringify(template.map((s) => s.id));
    const preview = useMemo(
        () =>
            entries.slice(0, PREVIEW_ROWS).map((e) => ({
                id: e.id,
                name: e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id,
                own: (e.subDps ?? []).filter((s) => !!s?.id).length,
                resolved: resolveSubDpTemplate(template, e.id).map((s) => s.id),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [entries.map((e) => `${e.id}|${e.subDps?.length ?? 0}`).join(','), templateKey, resolvedNames],
    );

    const label = { color: 'var(--text-secondary)' } as React.CSSProperties;
    const box: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="space-y-3">
            <p className="text-[11px]" style={{ ...label, opacity: 0.85 }}>
                Zusätzliche Datenpunkte in einer zweiten Zeile — für <strong>alle</strong> Einträge der Liste. Die
                Datenpunkt-ID darf die Platzhalter <span className="font-mono">{'{{parent}}'}</span> (Strang ohne
                letztes Segment), <span className="font-mono">{'{{dp}}'}</span> (ganze ID) und{' '}
                <span className="font-mono">{'{{name}}'}</span> (letztes Segment) enthalten; sie werden pro Zeile gegen
                deren eigenen Datenpunkt aufgelöst. Beispiel: <span className="font-mono">{'{{parent}}.BATTERY'}</span>.
                Ohne Platzhalter gilt derselbe Datenpunkt für jede Zeile. Nicht im Badges-Layout.
            </p>

            {entries.length === 0 ? (
                <p className="text-[11px]" style={label}>
                    Noch keine Datenpunkte – im Tab „Suchen &amp; Filter“ welche finden.
                </p>
            ) : (
                <div>
                    <label className="text-[10px] block mb-0.5" style={label}>
                        Beispiel-Eintrag (für Auswahl und Vorschau)
                    </label>
                    <select
                        value={sampleId}
                        onChange={(e) => setSampleId(e.target.value)}
                        className="w-full text-[11px] rounded-lg px-2 py-1.5 focus:outline-none"
                        style={box}
                    >
                        {entries.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.label || resolvedNames[e.id] || e.id}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="space-y-1.5">
                <SubDpFields
                    subDps={template}
                    mainDpId={sampleId}
                    listHasTransform={
                        opts.valueTransform !== undefined ||
                        opts.valueFactor !== undefined ||
                        opts.valueTimeFormat !== undefined
                    }
                    templateMode
                    onChange={(next) => onOptsChange({ subDpTemplate: next })}
                />
            </div>

            <div className="flex items-center justify-between gap-2">
                <label className="text-[11px]" style={label}>
                    Fehlende Datenpunkte ausblenden
                </label>
                <button
                    onClick={() => onOptsChange({ subDpTemplateHideMissing: !hideMissing })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: hideMissing ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: hideMissing ? '18px' : '2px' }}
                    />
                </button>
            </div>
            <p className="text-[9px] -mt-2" style={{ ...label, opacity: 0.65 }}>
                Aus: Zeilen ohne den Datenpunkt zeigen einen Strich. An: sie bleiben leer — sinnvoll, wenn nur ein Teil
                der Geräte z. B. eine Batterie hat.
            </p>

            {template.length > 0 && preview.length > 0 && (
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
                                className="px-2 py-1"
                                style={{ borderTop: i ? '1px solid var(--app-border)' : undefined }}
                            >
                                <div className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                                    {p.name}
                                </div>
                                {p.own > 0 ? (
                                    <div className="text-[9px]" style={{ ...label, opacity: 0.7 }}>
                                        eigene Datenpunkte ({p.own}) – Vorlage gilt hier nicht
                                    </div>
                                ) : p.resolved.length === 0 ? (
                                    <div className="text-[9px]" style={{ ...label, opacity: 0.7 }}>
                                        keine Platzhalter auflösbar – zweite Zeile bleibt leer
                                    </div>
                                ) : (
                                    p.resolved.map((id) => {
                                        const missing = knownIds ? !knownIds.has(id) : false;
                                        return (
                                            <div
                                                key={id}
                                                className="text-[9px] font-mono truncate"
                                                style={{
                                                    ...label,
                                                    opacity: missing ? 0.45 : 0.8,
                                                    textDecoration: missing ? 'line-through' : undefined,
                                                }}
                                                title={missing ? `${id} – nicht vorhanden` : id}
                                            >
                                                {id}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
