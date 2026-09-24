/**
 * The sort block of the JSON table panel (#706): a button that opens the rule dialog,
 * plus a one-line summary — built like the static list's ListSortSection, and the
 * dialog like its ListSortEditor: one card per criterion, evaluated live against the
 * datapoint's current rows. A criterion reads a column instead of a datapoint.
 */
import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Plus, X } from 'lucide-react';
import { ConfigModal } from './ConfigModal';
import { useT } from '../../i18n';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatCellValue } from '../../utils/jsonTableFormat';
import {
    JSON_SORT_MODES,
    jsonOrderLabels,
    jsonSortSummary,
    sortJsonRows,
    usableJsonSortRules,
    type JsonSortMode,
    type JsonSortRule,
} from '../../utils/jsonTableSort';
import type { JsonColumnDef } from '../widgets/JsonTableWidget';

/** Rows shown in the order preview. Enough to see what the chain does. */
const PREVIEW_SHOWN = 8;

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

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

export function JsonTableSortSection({
    rules,
    onChange,
    keys,
    colDefs,
    rows,
}: {
    rules: JsonSortRule[];
    onChange: (next: JsonSortRule[] | undefined) => void;
    /** Column keys to offer — configured columns, else what the data holds. */
    keys: string[];
    colDefs: JsonColumnDef[];
    /** Current rows of the datapoint, for the preview. */
    rows: Record<string, unknown>[];
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const labelOf = (key: string) => colDefs.find((c) => c.key === key)?.label || key;
    const summary = jsonSortSummary(rules, labelOf);

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
                    {summary || 'Ohne Kriterium bleibt die Reihenfolge der Daten.'}
                </p>
            </div>

            {open && (
                <ConfigModal
                    title="Sortierung"
                    maxWidth={640}
                    maxHeight={760}
                    padded
                    storageKey="aura-jsontable-sort-modal"
                    onClose={() => {
                        setOpen(false);
                        // The dialog portals out of the panel — hand focus back to the trigger.
                        buttonRef.current?.focus();
                    }}
                >
                    <JsonTableSortEditor
                        rules={rules}
                        onChange={onChange}
                        keys={keys}
                        colDefs={colDefs}
                        rows={rows}
                        labelOf={labelOf}
                    />
                </ConfigModal>
            )}
        </>
    );
}

function JsonTableSortEditor({
    rules,
    onChange,
    keys,
    colDefs,
    rows,
    labelOf,
}: {
    rules: JsonSortRule[];
    onChange: (next: JsonSortRule[] | undefined) => void;
    keys: string[];
    colDefs: JsonColumnDef[];
    rows: Record<string, unknown>[];
    labelOf: (key: string) => string;
}) {
    const t = useT();
    const numFmt = useGlobalSettingsStore((s) => s.numberFormat);
    const [openIdx, setOpenIdx] = useState<number>(0);

    const commit = (next: JsonSortRule[]) => onChange(next.length ? next : undefined);
    const patch = (idx: number, p: Partial<JsonSortRule>) =>
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
        // A fresh rule picks the first column nothing sorts by yet.
        const used = new Set(rules.map((r) => r.column));
        const column = keys.find((k) => !used.has(k)) ?? keys[0] ?? '';
        commit([...rules, { column }]);
        setOpenIdx(rules.length);
    };

    const ordered = useMemo(
        () => sortJsonRows(rows, usableJsonSortRules(rules, [...new Set([...keys, ...rows.flatMap(Object.keys)])])),
        [rows, rules, keys],
    );
    // Preview line: the first column nothing sorts by names the row, the cells the
    // rules read stand beside it — so a tie-breaker is visible too.
    const ruleCols = [...new Set(rules.map((r) => r.column).filter(Boolean))];
    const nameKey = keys.find((k) => !ruleCols.includes(k)) ?? keys[0];
    const cell = (key: string | undefined, row: Record<string, unknown>) => {
        if (!key) return '';
        return formatCellValue(colDefs.find((c) => c.key === key) ?? {}, row[key], t, numFmt);
    };

    return (
        <div className="space-y-2">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Kriterien von oben nach unten: das erste entscheidet, die folgenden nur bei Gleichstand. Ist
                „Sortierbar“ an, übernimmt ein Klick auf einen Spaltenkopf die Führung; der dritte Klick kehrt hierher
                zurück.
            </p>

            {rules.length === 0 && (
                <p
                    className="text-[11px] rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    Keine Sortierung – die Tabelle bleibt in der Reihenfolge der Daten.
                </p>
            )}

            {rules.map((rule, idx) => {
                const open = openIdx === idx;
                const mode = rule.mode ?? 'auto';
                const order = rule.order ?? 'asc';
                const labels = jsonOrderLabels(mode);
                const modeHint = JSON_SORT_MODES.find((m) => m.value === mode)?.hint;
                const options = rule.column && !keys.includes(rule.column) ? [...keys, rule.column] : keys;
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
                                    {rule.column ? labelOf(rule.column) : 'Spalte wählen'}
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
                                <div className="flex items-center gap-1 mt-1.5">
                                    <select
                                        value={rule.column}
                                        onChange={(e) => patch(idx, { column: e.target.value })}
                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                        style={iSty}
                                        title="Nach welcher Spalte sortiert wird"
                                        data-testid="jsontable-sort-column"
                                    >
                                        {!rule.column && <option value="">Spalte wählen</option>}
                                        {options.map((k) => (
                                            <option key={k} value={k}>
                                                {labelOf(k)}
                                                {labelOf(k) !== k ? ` (${k})` : ''}
                                                {keys.includes(k) ? '' : ' – nicht in den Daten'}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={mode}
                                        onChange={(e) =>
                                            patch(idx, {
                                                mode:
                                                    e.target.value === 'auto'
                                                        ? undefined
                                                        : (e.target.value as JsonSortMode),
                                            })
                                        }
                                        className="flex-1 min-w-0 text-[10px] rounded px-1.5 py-1 focus:outline-none"
                                        style={iSty}
                                        title={modeHint}
                                        data-testid="jsontable-sort-mode"
                                    >
                                        {JSON_SORT_MODES.map((m) => (
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
                disabled={keys.length === 0}
                className="w-full flex items-center justify-center gap-1 text-[11px] rounded-lg py-1.5 hover:opacity-80 disabled:opacity-40"
                style={{ ...iSty, color: 'var(--text-primary)' }}
            >
                <Plus size={12} /> Kriterium hinzufügen
            </button>
            {keys.length === 0 && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                    Keine Spalten bekannt – erst Spalten laden oder einen Datenpunkt mit Daten wählen.
                </p>
            )}

            {/* Live order — a sort setting is only ever wrong in a way you can see. */}
            <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Reihenfolge jetzt
                </p>
                {rows.length === 0 ? (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        Der Datenpunkt liefert gerade keine Zeilen – die Vorschau bleibt leer.
                    </p>
                ) : (
                    <ol className="space-y-0.5" data-testid="jsontable-sort-preview">
                        {ordered.slice(0, PREVIEW_SHOWN).map((row, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[10px]">
                                <span
                                    className="tabular-nums shrink-0 w-3 text-right"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                >
                                    {i + 1}
                                </span>
                                <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                                    {cell(nameKey, row)}
                                </span>
                                {ruleCols.length > 0 && (
                                    <span
                                        className="ml-auto shrink-0 tabular-nums font-mono"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {ruleCols.map((k) => cell(k, row) || '—').join(' · ')}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
                {ordered.length > PREVIEW_SHOWN && (
                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        … und {ordered.length - PREVIEW_SHOWN} weitere
                    </p>
                )}
            </div>
        </div>
    );
}
