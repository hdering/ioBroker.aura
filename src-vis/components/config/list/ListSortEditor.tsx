/**
 * Editor for the list sort chain (utils/listSort) — the content of the "Sortierung"
 * dialog both list config panels open.
 *
 * Built like the filter editor next door: one card per criterion, evaluated live
 * against the configured entries. What a filter card shows as "matches 7 of 12", a
 * sort card shows as the resulting ORDER — a sort setting is only ever wrong in a
 * way you see, so the preview is the point of the dialog.
 *
 * Beside name and main value a criterion reads one datapoint of the second line, per
 * entry or resolved from the list-wide template, which is what makes "worst battery
 * first" configurable at all.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useTemplateValues } from '../../../hooks/useTemplateValues';
import { collectSubKeyOptions, type ListFilterRow } from '../../../utils/listFilter';
import {
    SORT_MODES,
    SORT_SOURCE_LABELS,
    collectSortValues,
    newSortRule,
    orderLabels,
    ruleValue,
    sortPreview,
    type ListSortMode,
    type ListSortRule,
    type ListSortSource,
} from '../../../utils/listSort';
import type { EditorFilterRow } from './ListFilterEditor';

/**
 * Cap on the rows the editor subscribes to — same reasoning as the filter editor:
 * a dynamic list can hold hundreds of discovered datapoints and the preview only
 * has to be representative.
 */
const PREVIEW_ROW_LIMIT = 80;
/** Rows shown in the order preview. Enough to see what the chain does. */
const PREVIEW_SHOWN = 8;

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

const SOURCES: ListSortSource[] = ['value', 'name', 'sub'];

function pill(active: boolean): React.CSSProperties {
    return {
        background: active ? 'var(--accent)' : 'var(--app-bg)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
    };
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="relative w-8 h-4 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
                style={{ left: on ? '17px' : '2px' }}
            />
        </button>
    );
}

/** Short name of a row for the preview — the same fallback chain the widgets use. */
function rowName(row: ListFilterRow): string {
    return row.label || row.id.split('.').pop() || row.id;
}

function valueText(val: unknown): string {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return '—';
        }
    }
    return String(val);
}

export function ListSortEditor({
    rules,
    rows,
    onChange,
    /** The static list sorts within a section — said here, where the order is decided. */
    hint,
}: {
    rules: ListSortRule[];
    rows: EditorFilterRow[];
    onChange: (next: ListSortRule[] | undefined) => void;
    hint?: React.ReactNode;
}) {
    const [openIdx, setOpenIdx] = useState<number>(0);

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

    const commit = (next: ListSortRule[]) => onChange(next.length ? next : undefined);
    const patch = (idx: number, p: Partial<ListSortRule>) =>
        commit(rules.map((r, i) => (i === idx ? { ...r, ...p } : r)));
    const move = (idx: number, dir: -1 | 1) => {
        const to = idx + dir;
        if (to < 0 || to >= rules.length) return;
        const next = [...rules];
        [next[idx], next[to]] = [next[to], next[idx]];
        commit(next);
        setOpenIdx(to);
    };
    const add = () => {
        commit([...rules, newSortRule()]);
        setOpenIdx(rules.length);
    };

    const ordered = useMemo(() => sortPreview(rules, liveRows), [rules, liveRows]);
    const firstRule = rules[0];

    return (
        <div className="space-y-2">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Kriterien von oben nach unten: das erste entscheidet, die folgenden nur bei Gleichstand. Jedes liest den
                Namen, den Wert der Zeile – oder einen der weiteren Datenpunkte der zweiten Zeile.
            </p>
            {hint}

            {rules.length === 0 && (
                <p
                    className="text-[11px] rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    Keine Sortierung – die Liste bleibt in der Reihenfolge aus „Datenpunkte verwalten“.
                </p>
            )}

            {rules.map((rule, idx) => {
                const open = openIdx === idx;
                const source = rule.source ?? 'value';
                const mode = rule.mode ?? 'auto';
                const order = rule.order ?? 'asc';
                const labels = orderLabels(mode);
                const modeHint = SORT_MODES.find((m) => m.value === mode)?.hint;
                const seen = mode === 'custom' ? collectSortValues(rule, liveRows) : [];
                const list = rule.values ?? [];
                return (
                    <div
                        key={idx}
                        className="rounded-lg overflow-hidden"
                        style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
                    >
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                            <button
                                onClick={() => setOpenIdx(open ? -1 : idx)}
                                className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:opacity-80"
                            >
                                <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
                                    style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                                >
                                    {idx === 0 ? '1.' : `dann ${idx + 1}.`}
                                </span>
                                <span className="text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
                                    {source === 'sub'
                                        ? `2. Zeile: ${(rule.subKey ?? '').trim() || 'erster DP'}`
                                        : SORT_SOURCE_LABELS[source]}
                                </span>
                                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    {order === 'desc' ? labels.desc : labels.asc}
                                </span>
                            </button>
                            <button
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                title="Nach oben"
                                className="shrink-0 disabled:opacity-25 hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <ArrowUp size={11} />
                            </button>
                            <button
                                onClick={() => move(idx, 1)}
                                disabled={idx === rules.length - 1}
                                title="Nach unten"
                                className="shrink-0 disabled:opacity-25 hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <ArrowDown size={11} />
                            </button>
                            <button
                                onClick={() => {
                                    commit(rules.filter((_, i) => i !== idx));
                                    setOpenIdx(-1);
                                }}
                                title="Kriterium entfernen"
                                className="shrink-0 hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={12} />
                            </button>
                        </div>

                        {open && (
                            <div className="px-2 pb-2 space-y-1.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                                <div
                                    className="flex rounded overflow-hidden mt-1.5"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    {SOURCES.map((v) => (
                                        <button
                                            key={v}
                                            onClick={() =>
                                                patch(idx, {
                                                    source: v,
                                                    // A key from the previous source would silently read nothing.
                                                    subKey: v === 'sub' ? rule.subKey : undefined,
                                                })
                                            }
                                            className="flex-1 text-[10px] py-1 transition-colors truncate"
                                            style={{
                                                background: source === v ? 'var(--accent)' : 'var(--app-bg)',
                                                color: source === v ? '#fff' : 'var(--text-secondary)',
                                            }}
                                            title={SORT_SOURCE_LABELS[v]}
                                        >
                                            {SORT_SOURCE_LABELS[v]}
                                        </button>
                                    ))}
                                </div>

                                {source === 'sub' && (
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={subKeys.some((k) => k.key === rule.subKey) ? rule.subKey : ''}
                                            onChange={(e) => patch(idx, { subKey: e.target.value || undefined })}
                                            className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                            style={iSty}
                                            title="Nach welchem weiteren Datenpunkt sortiert wird"
                                        >
                                            <option value="">Erster weiterer DP</option>
                                            {subKeys.map((k) => (
                                                <option key={k.key} value={k.key}>
                                                    {k.key}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            value={rule.subKey ?? ''}
                                            onChange={(e) => patch(idx, { subKey: e.target.value || undefined })}
                                            placeholder="oder Bezeichnung / DP-Endung"
                                            className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none font-mono"
                                            style={iSty}
                                        />
                                    </div>
                                )}

                                <div className="flex items-center gap-1">
                                    <select
                                        value={mode}
                                        onChange={(e) => patch(idx, { mode: e.target.value as ListSortMode })}
                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                        style={iSty}
                                        title={modeHint}
                                    >
                                        {SORT_MODES.map((m) => (
                                            <option key={m.value} value={m.value}>
                                                {m.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-1">
                                    {(['asc', 'desc'] as const).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => patch(idx, { order: v === 'asc' ? undefined : v })}
                                            className="flex-1 text-[10px] py-1 rounded transition-colors"
                                            style={pill(order === v)}
                                        >
                                            {v === 'asc' ? labels.asc : labels.desc}
                                        </button>
                                    ))}
                                </div>

                                {mode === 'custom' && (
                                    <div className="space-y-1">
                                        <textarea
                                            rows={Math.min(6, Math.max(3, list.length + 1))}
                                            value={list.join('\n')}
                                            onChange={(e) =>
                                                patch(idx, {
                                                    values: e.target.value.split('\n'),
                                                })
                                            }
                                            placeholder={'ERROR\nWARN\nOK'}
                                            className="w-full text-[10px] rounded px-1.5 py-1 focus:outline-none font-mono"
                                            style={iSty}
                                            title="Ein Wert pro Zeile. Werte, die hier fehlen, sortieren dahinter."
                                        />
                                        {seen.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {seen.map((v) => {
                                                    const already = list.some(
                                                        (x) => x.trim().toLowerCase() === v.toLowerCase(),
                                                    );
                                                    return (
                                                        <button
                                                            key={v}
                                                            disabled={already}
                                                            onClick={() =>
                                                                patch(idx, {
                                                                    values: [...list.filter((x) => x.trim() !== ''), v],
                                                                })
                                                            }
                                                            className="text-[9px] px-1.5 py-0.5 rounded-full disabled:opacity-30 hover:opacity-80"
                                                            style={iSty}
                                                            title={already ? 'Steht schon in der Liste' : 'Anhängen'}
                                                        >
                                                            {v}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <p
                                            className="text-[9px]"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.75 }}
                                        >
                                            Ein Wert pro Zeile, oben zuerst. Was nicht aufgeführt ist, folgt dahinter.
                                        </p>
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                                        Zeilen ohne Wert nach oben
                                        <span className="opacity-60"> (sonst ans Ende, in beiden Richtungen)</span>
                                    </label>
                                    <Toggle
                                        on={rule.empty === 'first'}
                                        onClick={() =>
                                            patch(idx, { empty: rule.empty === 'first' ? undefined : 'first' })
                                        }
                                    />
                                </div>

                                {modeHint && (
                                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                                        {modeHint}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            <button
                onClick={add}
                className="w-full flex items-center justify-center gap-1 text-[11px] rounded-lg py-1.5 hover:opacity-80"
                style={{ ...iSty, color: 'var(--text-primary)' }}
            >
                <Plus size={12} /> Kriterium hinzufügen
            </button>

            {/* Live order — a sort setting is only ever wrong in a way you can see. */}
            <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Reihenfolge jetzt
                </p>
                {liveRows.length === 0 ? (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        Noch keine Datenpunkte in der Liste – die Vorschau bleibt leer.
                    </p>
                ) : (
                    <ol className="space-y-0.5">
                        {ordered.slice(0, PREVIEW_SHOWN).map((row, i) => (
                            <li key={row.id} className="flex items-center gap-1.5 text-[10px]">
                                <span
                                    className="tabular-nums shrink-0 w-3 text-right"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                >
                                    {i + 1}
                                </span>
                                <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                                    {rowName(row)}
                                </span>
                                {firstRule && (
                                    <span
                                        className="ml-auto shrink-0 tabular-nums font-mono"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {valueText(ruleValue(firstRule, row))}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
                {ordered.length > PREVIEW_SHOWN && (
                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        … und {ordered.length - PREVIEW_SHOWN} weitere
                        {rows.length > previewRows.length ? ` (von ${rows.length} Einträgen)` : ''}
                    </p>
                )}
            </div>
        </div>
    );
}
