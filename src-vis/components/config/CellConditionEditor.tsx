import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { ClauseRow, ColorField, newClause } from './ConditionEditor';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { OWN_VALUE_TOKEN } from '../../hooks/useCellConditionStyle';
import type { CellConditionRule } from '../../types';

/** A new clause that references the cell's own DP by default ({dp} token). */
function newOwnClause() {
    return { ...newClause(), datapoint: OWN_VALUE_TOKEN };
}

// Per-cell conditional-formatting editor for the Universal Widget's custom grid.
// Reuses ClauseRow / ColorField / newClause from ConditionEditor so the operator
// dropdown, datapoint picker, JSON-path and AND/OR logic behave identically to the
// widget-wide conditions. The *effects* differ (text/bg/bold/icon/hide per cell
// instead of widget-level CSS variables), so this is a separate, lightweight editor.

function newCellRule(): CellConditionRule {
    return {
        id: `ccr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        logic: 'AND',
        clauses: [newOwnClause()],
    };
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
                background: on ? 'var(--accent)' : 'var(--app-bg)',
                color: on ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
        >
            {label}
        </button>
    );
}

function CellRuleEditor({
    rule,
    onChange,
    onDelete,
}: {
    rule: CellConditionRule;
    onChange: (r: CellConditionRule) => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(true);
    const [showIcon, setShowIcon] = useState(false);
    const update = (patch: Partial<CellConditionRule>) => onChange({ ...rule, ...patch });
    const updateClause = (i: number, c: CellConditionRule['clauses'][number]) =>
        update({ clauses: rule.clauses.map((cl, j) => (j === i ? c : cl)) });
    const deleteClause = (i: number) => update({ clauses: rule.clauses.filter((_, j) => j !== i) });
    const addClause = () => update({ clauses: [...rule.clauses, newOwnClause()] });
    const toggleLogic = () => update({ logic: rule.logic === 'OR' ? 'AND' : 'OR' });

    const IconPrev = rule.icon ? getWidgetIcon(rule.icon, HelpCircle) : null;
    const swatches = [rule.color, rule.bg].filter(Boolean) as string[];

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:opacity-80"
                style={{ background: 'var(--app-surface)' }}
                onClick={() => setOpen(!open)}
            >
                <span style={{ color: 'var(--text-secondary)' }}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <input
                    type="text"
                    value={rule.label ?? ''}
                    onChange={(e) => update({ label: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Regelname (optional)"
                    className="flex-1 text-xs bg-transparent focus:outline-none"
                    style={{ color: 'var(--text-primary)' }}
                />
                {swatches.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {swatches.map((c, i) => (
                            <div
                                key={i}
                                className="w-3 h-3 rounded-full border"
                                style={{ background: c, borderColor: 'var(--app-border)' }}
                            />
                        ))}
                    </div>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="hover:opacity-70 shrink-0"
                    style={{ color: 'var(--accent-red)' }}
                >
                    <Trash2 size={13} />
                </button>
            </div>

            {open && (
                <div className="p-3 space-y-3" style={{ background: 'var(--app-bg)' }}>
                    {/* Clauses */}
                    <div className="space-y-1.5">
                        {rule.clauses.map((clause, i) => (
                            <ClauseRow
                                key={i}
                                clause={clause}
                                isFirst={i === 0}
                                logic={rule.logic ?? 'AND'}
                                onLogicToggle={toggleLogic}
                                onChange={(c) => updateClause(i, c)}
                                onDelete={() => deleteClause(i)}
                                ownToken={OWN_VALUE_TOKEN}
                            />
                        ))}
                    </div>
                    <button
                        onClick={addClause}
                        className="flex items-center gap-1 text-[10px] hover:opacity-80"
                        style={{ color: 'var(--accent)' }}
                    >
                        <Plus size={11} /> Bedingung hinzufügen
                    </button>
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-mono">{OWN_VALUE_TOKEN}</span> = eigener Zellwert (kein erneutes Eintragen
                        des DP); Pille umschalten für einen anderen Datenpunkt.
                    </p>

                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {/* Effects */}
                    <p
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Wenn erfüllt
                    </p>
                    <div className="space-y-1.5">
                        <ColorField label="Textfarbe" value={rule.color} onChange={(v) => update({ color: v })} />
                        <ColorField label="Hintergrund" value={rule.bg} onChange={(v) => update({ bg: v })} />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Toggle on={!!rule.bold} onClick={() => update({ bold: !rule.bold })} label="Fett" />
                        <Toggle on={!!rule.italic} onClick={() => update({ italic: !rule.italic })} label="Kursiv" />
                        <Toggle on={!!rule.hide} onClick={() => update({ hide: !rule.hide })} label="Ausblenden" />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Icon
                        </label>
                        <button
                            onClick={() => setShowIcon(true)}
                            className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {IconPrev ? (
                                <IconPrev
                                    size={14}
                                    style={{ flexShrink: 0, color: rule.color || 'var(--text-primary)' }}
                                />
                            ) : (
                                <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />
                            )}
                            <span
                                className="flex-1 truncate text-[11px] text-left"
                                style={{ color: rule.icon ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                                {rule.icon ?? 'Icon wählen… (nur Icon-Zellen)'}
                            </span>
                        </button>
                        {rule.icon && (
                            <button
                                onClick={() => update({ icon: undefined })}
                                className="shrink-0 hover:opacity-60"
                                style={{ color: 'var(--text-secondary)' }}
                                title="Icon entfernen"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                    {showIcon && (
                        <IconPickerModal
                            current={rule.icon ?? ''}
                            onSelect={(name) => {
                                update({ icon: name || undefined });
                                setShowIcon(false);
                            }}
                            onClose={() => setShowIcon(false)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

export function CellConditionEditor({
    rules,
    onChange,
}: {
    rules: CellConditionRule[];
    /** The cell's own DP id — shown as a hint for "own value" clauses. */
    ownDpId?: string;
    onChange: (next: CellConditionRule[]) => void;
}) {
    const update = (i: number, r: CellConditionRule) => onChange(rules.map((x, j) => (j === i ? r : x)));
    const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));

    return (
        <div className="p-3 space-y-2.5" style={{ width: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Bedingungen
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Reagieren auf Werte — nur diese Zelle
                </p>
            </div>

            {rules.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    Noch keine Regel. Regeln reagieren auf den Zellwert (oder einen fremden Datenpunkt) und ändern
                    Farbe, Hintergrund, Schrift, Icon oder blenden die Zelle aus.
                </p>
            )}

            {rules.map((rule, i) => (
                <CellRuleEditor key={rule.id} rule={rule} onChange={(r) => update(i, r)} onDelete={() => remove(i)} />
            ))}

            <button
                onClick={() => onChange([...rules, newCellRule()])}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                style={{
                    background: 'var(--app-surface)',
                    color: 'var(--accent)',
                    border: '1px dashed var(--accent)55',
                }}
            >
                <Plus size={13} /> Neue Regel
            </button>
        </div>
    );
}
