/**
 * Editor for the free-form list filters (utils/listFilter) — the content of the
 * "Filter verwalten" dialog both list config panels open.
 *
 * One card per filter, one card per rule inside it. A rule names what it reads
 * (main datapoint / the extra datapoints of the second line / both), an operator and
 * a comparison value. The value field is a free-text input WITH a datalist of the
 * values those datapoints currently hold, so a filter can be clicked together from
 * what is really there instead of typed blind.
 *
 * Everything is evaluated live against the configured entries, so each card shows how
 * many rows it currently matches — a filter that matches nothing is the mistake this
 * editor has to make visible immediately.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { IconPickerModal } from '../IconPickerModal';
import { useTemplateValues } from '../../../hooks/useTemplateValues';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';
import {
    LIST_FILTER_OPERATORS,
    SOURCE_LABELS,
    collectFilterValueOptions,
    collectSubKeyOptions,
    countPresetMatches,
    newPresetId,
    operatorNeedsValue,
    presetMatches,
    type ListFilterOperator,
    type ListFilterPreset,
    type ListFilterRow,
    type ListFilterRule,
    type ListFilterSource,
} from '../../../utils/listFilter';

/** One list row as the CONFIG knows it — values are read live in here. */
export interface EditorFilterRow {
    id: string;
    label?: string;
    subs: { id: string; label?: string }[];
}

/**
 * Cap on the rows the editor subscribes to. A dynamic list can hold hundreds of
 * discovered datapoints; the preview only has to be representative, and the widget
 * itself applies the filter to every row regardless.
 */
const PREVIEW_ROW_LIMIT = 80;

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

const SOURCES: ListFilterSource[] = ['main', 'sub', 'both', 'name'];

export function ListFilterEditor({
    presets,
    rows,
    onChange,
}: {
    presets: ListFilterPreset[];
    rows: EditorFilterRow[];
    onChange: (next: ListFilterPreset[] | undefined) => void;
}) {
    const [openId, setOpenId] = useState<string | null>(() => presets[0]?.id ?? null);
    const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

    const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT);
    const refs = useMemo(
        () => [...new Set(previewRows.flatMap((r) => [r.id, ...r.subs.map((s) => s.id)]).filter(Boolean))],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [previewRows.map((r) => `${r.id}|${r.subs.map((s) => s.id).join('+')}`).join(',')],
    );
    const values = useTemplateValues(refs);
    const liveRows = useMemo<ListFilterRow[]>(
        () =>
            previewRows.map((r) => ({
                id: r.id,
                label: r.label,
                value: values[r.id] ?? null,
                subs: r.subs.map((s) => ({ id: s.id, label: s.label, value: values[s.id] ?? null })),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [refs, values],
    );
    const subKeys = useMemo(() => collectSubKeyOptions(liveRows), [liveRows]);

    const commit = (next: ListFilterPreset[]) => onChange(next.length ? next : undefined);
    const patchPreset = (id: string, patch: Partial<ListFilterPreset>) =>
        commit(presets.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const patchRule = (id: string, idx: number, patch: Partial<ListFilterRule>) => {
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        patchPreset(id, { rules: preset.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
    };

    const addPreset = () => {
        // Pre-filled with one rule: an empty card would not show what a filter is made of.
        const preset: ListFilterPreset = {
            id: newPresetId(),
            label: `Filter ${presets.length + 1}`,
            rules: [{ source: 'main', operator: 'active' }],
        };
        commit([...presets, preset]);
        setOpenId(preset.id);
    };

    const duplicate = (p: ListFilterPreset) => {
        const copy: ListFilterPreset = {
            ...p,
            id: newPresetId(),
            label: `${p.label} (Kopie)`,
            rules: p.rules.map((r) => ({ ...r })),
        };
        commit([...presets, copy]);
        setOpenId(copy.id);
    };

    const move = (idx: number, dir: -1 | 1) => {
        const to = idx + dir;
        if (to < 0 || to >= presets.length) return;
        const next = [...presets];
        [next[idx], next[to]] = [next[to], next[idx]];
        commit(next);
    };

    return (
        <div className="space-y-2">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Eigene Filter für das Filter-Menü der Liste. Jede Regel prüft den Haupt-Datenpunkt einer Zeile, die
                weiteren Datenpunkte der zweiten Zeile – oder beide.
            </p>

            {presets.length === 0 && (
                <p
                    className="text-[11px] rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    Noch keine eigenen Filter. Das Menü zeigt nur {'„Alle“'}, {'„Nur aktive“'} und {'„Nur inaktive“'}.
                </p>
            )}

            {presets.map((preset, pIdx) => {
                const open = openId === preset.id;
                const matches = countPresetMatches(preset, liveRows);
                const samples = liveRows
                    .filter((r) => presetMatches(preset, r))
                    .slice(0, 4)
                    .map((r) => r.label || r.id.split('.').pop() || r.id);
                const PresetIcon = preset.icon ? toIconifyId(preset.icon) : null;
                return (
                    <div
                        key={preset.id}
                        className="rounded-lg overflow-hidden"
                        style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
                    >
                        <div className="flex items-center gap-1 px-2 py-1.5">
                            <button
                                onClick={() => setOpenId(open ? null : preset.id)}
                                className="shrink-0 hover:opacity-70"
                                title={open ? 'Zuklappen' : 'Aufklappen'}
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <ChevronRight
                                    size={13}
                                    className="transition-transform"
                                    style={{ transform: open ? 'rotate(90deg)' : undefined }}
                                />
                            </button>
                            <button
                                onClick={() => setIconPickerFor(preset.id)}
                                title={preset.icon || 'Icon wählen'}
                                className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                                style={{ ...iSty, width: 26, height: 24 }}
                            >
                                {PresetIcon ? (
                                    <Icon icon={PresetIcon} width={13} height={13} />
                                ) : (
                                    <Plus size={11} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                )}
                            </button>
                            <input
                                value={preset.label}
                                onChange={(e) => patchPreset(preset.id, { label: e.target.value })}
                                placeholder="Filtername"
                                className="flex-1 min-w-0 text-[11px] rounded px-2 py-1 focus:outline-none"
                                style={iSty}
                            />
                            <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
                                title={
                                    samples.length
                                        ? `z. B. ${samples.join(', ')}`
                                        : 'Kein konfigurierter Eintrag passt aktuell'
                                }
                                style={{
                                    background: matches
                                        ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                                        : 'var(--app-border)',
                                    color: matches ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                            >
                                {matches}/{liveRows.length}
                            </span>
                            <button
                                onClick={() => move(pIdx, -1)}
                                disabled={pIdx === 0}
                                title="Nach oben"
                                className="shrink-0 w-4 text-[10px] disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => move(pIdx, 1)}
                                disabled={pIdx === presets.length - 1}
                                title="Nach unten"
                                className="shrink-0 w-4 text-[10px] disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => duplicate(preset)}
                                title="Duplizieren"
                                className="shrink-0 hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Copy size={11} />
                            </button>
                            <button
                                onClick={() => {
                                    commit(presets.filter((p) => p.id !== preset.id));
                                    if (openId === preset.id) setOpenId(null);
                                }}
                                title="Filter löschen"
                                className="shrink-0 hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>

                        {open && (
                            <div className="px-2 pb-2 space-y-1.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                                {preset.rules.length > 1 && (
                                    <div className="flex items-center gap-1.5 pt-1.5">
                                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            Regeln verknüpfen
                                        </span>
                                        <div
                                            className="flex rounded overflow-hidden"
                                            style={{ border: '1px solid var(--app-border)' }}
                                        >
                                            {(['AND', 'OR'] as const).map((v) => {
                                                const active = (preset.logic ?? 'AND') === v;
                                                return (
                                                    <button
                                                        key={v}
                                                        onClick={() =>
                                                            patchPreset(preset.id, {
                                                                logic: v === 'AND' ? undefined : v,
                                                            })
                                                        }
                                                        className="text-[10px] px-2 py-0.5 transition-colors"
                                                        style={{
                                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                            color: active ? '#fff' : 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {v === 'AND' ? 'UND (alle)' : 'ODER (eine)'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {preset.rules.map((rule, rIdx) => {
                                    const source = rule.source ?? 'main';
                                    const valueOptions = collectFilterValueOptions(liveRows, source, rule.subKey);
                                    const listId = `aura-flt-${preset.id}-${rIdx}`;
                                    return (
                                        <div
                                            key={rIdx}
                                            className="rounded p-1.5 space-y-1.5"
                                            style={{
                                                border: '1px solid var(--app-border)',
                                                background: 'var(--app-surface)',
                                            }}
                                        >
                                            <div className="flex items-center gap-1">
                                                <div
                                                    className="flex flex-1 min-w-0 rounded overflow-hidden"
                                                    style={{ border: '1px solid var(--app-border)' }}
                                                >
                                                    {SOURCES.map((v) => {
                                                        const active = source === v;
                                                        return (
                                                            <button
                                                                key={v}
                                                                onClick={() =>
                                                                    patchRule(preset.id, rIdx, {
                                                                        source: v === 'main' ? undefined : v,
                                                                    })
                                                                }
                                                                className="flex-1 text-[10px] py-1 transition-colors truncate"
                                                                style={{
                                                                    background: active
                                                                        ? 'var(--accent)'
                                                                        : 'var(--app-bg)',
                                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                                }}
                                                                title={SOURCE_LABELS[v]}
                                                            >
                                                                {SOURCE_LABELS[v]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        patchPreset(preset.id, {
                                                            rules: preset.rules.filter((_, i) => i !== rIdx),
                                                        })
                                                    }
                                                    title="Regel entfernen"
                                                    className="shrink-0 hover:opacity-70"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>

                                            {source !== 'main' && source !== 'name' && (
                                                <div className="flex items-center gap-1">
                                                    <select
                                                        value={
                                                            subKeys.some((k) => k.key === rule.subKey)
                                                                ? rule.subKey
                                                                : ''
                                                        }
                                                        onChange={(e) =>
                                                            patchRule(preset.id, rIdx, {
                                                                subKey: e.target.value || undefined,
                                                            })
                                                        }
                                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                                        style={iSty}
                                                        title="Auf welchen weiteren Datenpunkt die Regel schaut"
                                                    >
                                                        <option value="">Alle weiteren DPs</option>
                                                        {subKeys.map((k) => (
                                                            <option key={k.key} value={k.key}>
                                                                {k.key}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        value={rule.subKey ?? ''}
                                                        onChange={(e) =>
                                                            patchRule(preset.id, rIdx, {
                                                                subKey: e.target.value || undefined,
                                                            })
                                                        }
                                                        placeholder="oder Bezeichnung / DP-Endung"
                                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none font-mono"
                                                        style={iSty}
                                                    />
                                                </div>
                                            )}

                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={rule.operator}
                                                    onChange={(e) =>
                                                        patchRule(preset.id, rIdx, {
                                                            operator: e.target.value as ListFilterOperator,
                                                        })
                                                    }
                                                    className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                                    style={iSty}
                                                >
                                                    {LIST_FILTER_OPERATORS.map((op) => (
                                                        <option key={op.value} value={op.value}>
                                                            {op.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {operatorNeedsValue(rule.operator) && (
                                                    <input
                                                        list={valueOptions.length ? listId : undefined}
                                                        value={rule.value ?? ''}
                                                        onChange={(e) =>
                                                            patchRule(preset.id, rIdx, { value: e.target.value })
                                                        }
                                                        placeholder="Wert"
                                                        title={
                                                            valueOptions.length
                                                                ? `Freitext – oder aus ${valueOptions.length} aktuellen Werten wählen`
                                                                : 'Vergleichswert'
                                                        }
                                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                                        style={iSty}
                                                    />
                                                )}
                                                {operatorNeedsValue(rule.operator) && valueOptions.length > 0 && (
                                                    <datalist id={listId}>
                                                        {valueOptions.map((v) => (
                                                            <option key={v} value={v} />
                                                        ))}
                                                    </datalist>
                                                )}
                                            </div>

                                            {source !== 'main' && source !== 'name' && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <label
                                                        className="text-[9px]"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    >
                                                        Alle geprüften Werte müssen passen
                                                        <span className="opacity-60"> (sonst genügt einer)</span>
                                                    </label>
                                                    <button
                                                        onClick={() =>
                                                            patchRule(preset.id, rIdx, {
                                                                every: rule.every ? undefined : true,
                                                            })
                                                        }
                                                        className="relative w-8 h-4 rounded-full transition-colors shrink-0"
                                                        style={{
                                                            background: rule.every
                                                                ? 'var(--accent)'
                                                                : 'var(--app-border)',
                                                        }}
                                                    >
                                                        <span
                                                            className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
                                                            style={{ left: rule.every ? '17px' : '2px' }}
                                                        />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <button
                                    onClick={() =>
                                        patchPreset(preset.id, {
                                            rules: [...preset.rules, { source: 'main', operator: 'active' }],
                                        })
                                    }
                                    className="w-full flex items-center justify-center gap-1 text-[10px] rounded py-1 hover:opacity-80"
                                    style={{ ...iSty, color: 'var(--text-secondary)' }}
                                >
                                    <Plus size={10} /> Regel
                                </button>

                                <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                                    {liveRows.length === 0
                                        ? 'Noch keine Datenpunkte in der Liste – die Vorschau bleibt leer.'
                                        : samples.length
                                          ? `Trifft aktuell zu: ${samples.join(', ')}${matches > samples.length ? ` … (+${matches - samples.length})` : ''}`
                                          : 'Trifft aktuell auf keinen Eintrag zu.'}
                                    {rows.length > previewRows.length
                                        ? ` Vorschau auf Basis der ersten ${previewRows.length} von ${rows.length} Einträgen.`
                                        : ''}
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}

            <button
                onClick={addPreset}
                className="w-full flex items-center justify-center gap-1 text-[11px] rounded-lg py-1.5 hover:opacity-80"
                style={{ ...iSty, color: 'var(--text-primary)' }}
            >
                <Plus size={12} /> Filter hinzufügen
            </button>

            {iconPickerFor !== null && (
                <IconPickerModal
                    current={presets.find((p) => p.id === iconPickerFor)?.icon ?? ''}
                    onSelect={(name) => {
                        patchPreset(iconPickerFor, { icon: name || undefined });
                        setIconPickerFor(null);
                    }}
                    onClose={() => setIconPickerFor(null)}
                />
            )}
        </div>
    );
}
