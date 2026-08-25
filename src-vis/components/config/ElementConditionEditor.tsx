import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { ClauseRow, ColorField, newClause } from './ConditionEditor';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { OWN_DP_TOKEN } from '../../utils/conditionEval';
import { ELEMENT_TARGETS } from '../../utils/rowConditions';
import type { ElementConditionRule, ElementConditionTarget } from '../../types';

// Conditional formatting of a single element — a custom-grid cell, a list row, or a
// datapoint of a row's second line.
//
// Reuses ClauseRow / ColorField / newClause from ConditionEditor so the operator
// dropdown, datapoint picker, JSON path and AND/OR logic behave exactly like the
// widget-wide conditions. Only the *effects* differ: an element is painted, not a
// whole card, and a list row has four paintable parts instead of one.

/** A new clause that references the element's own DP by default ({dp} token). */
function newOwnClause() {
    return { ...newClause(), datapoint: OWN_DP_TOKEN };
}

export function newElementRule(target?: ElementConditionTarget): ElementConditionRule {
    return {
        id: `ccr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        logic: 'AND',
        clauses: [newOwnClause()],
        ...(target ? { target } : null),
    };
}

const TARGET_LABELS: Record<ElementConditionTarget, string> = {
    row: 'Ganze Zeile',
    name: 'Name',
    value: 'Wert',
    icon: 'Icon',
};

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

function RuleEditor({
    rule,
    onChange,
    onDelete,
    targets,
    ownHint,
}: {
    rule: ElementConditionRule;
    onChange: (r: ElementConditionRule) => void;
    onDelete: () => void;
    /** Offer a target select. Empty = the element has only one paintable part. */
    targets: ElementConditionTarget[];
    /** Explains what `{dp}` refers to in this context. */
    ownHint: string;
}) {
    const [open, setOpen] = useState(true);
    const [showIcon, setShowIcon] = useState(false);
    const update = (patch: Partial<ElementConditionRule>) => onChange({ ...rule, ...patch });
    const updateClause = (i: number, c: ElementConditionRule['clauses'][number]) =>
        update({ clauses: rule.clauses.map((cl, j) => (j === i ? c : cl)) });
    const deleteClause = (i: number) => update({ clauses: rule.clauses.filter((_, j) => j !== i) });
    const addClause = () => update({ clauses: [...rule.clauses, newOwnClause()] });
    const toggleLogic = () => update({ logic: rule.logic === 'OR' ? 'AND' : 'OR' });

    const target = rule.target ?? 'row';
    const paintsIcon = targets.length === 0 || target === 'row' || target === 'icon';
    const paintsText = targets.length === 0 || target !== 'icon';
    const IconPrev = rule.icon ? getWidgetIcon(rule.icon, HelpCircle) : null;
    const swatches = [rule.color, rule.bg, rule.iconColor].filter(Boolean) as string[];

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
                {targets.length > 0 && (
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {TARGET_LABELS[target]}
                    </span>
                )}
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
                                ownToken={OWN_DP_TOKEN}
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
                    <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {ownHint}
                    </p>

                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {targets.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                Wirkt auf
                            </label>
                            <select
                                value={target}
                                onChange={(e) => update({ target: e.target.value as ElementConditionTarget })}
                                className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {targets.map((tg) => (
                                    <option key={tg} value={tg}>
                                        {TARGET_LABELS[tg]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Effects */}
                    <p
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Wenn erfüllt
                    </p>
                    <div className="space-y-1.5">
                        {paintsText && (
                            <ColorField label="Textfarbe" value={rule.color} onChange={(v) => update({ color: v })} />
                        )}
                        {target === 'row' && (
                            <ColorField label="Hintergrund" value={rule.bg} onChange={(v) => update({ bg: v })} />
                        )}
                        {paintsIcon && (
                            <ColorField
                                label="Icon-Farbe"
                                value={rule.iconColor}
                                onChange={(v) => update({ iconColor: v })}
                            />
                        )}
                    </div>
                    {paintsText && (
                        <div className="flex items-center gap-1.5">
                            <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                Text
                            </label>
                            <input
                                type="text"
                                value={rule.text ?? ''}
                                onChange={(e) => update({ text: e.target.value || undefined })}
                                placeholder="unverändert"
                                className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <Toggle on={!!rule.bold} onClick={() => update({ bold: !rule.bold })} label="Fett" />
                        <Toggle on={!!rule.italic} onClick={() => update({ italic: !rule.italic })} label="Kursiv" />
                        <Toggle on={!!rule.hide} onClick={() => update({ hide: !rule.hide })} label="Ausblenden" />
                    </div>
                    {/* The same two the widget rules offer — kept in step on purpose. */}
                    <div className="flex items-center gap-1.5">
                        <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Effekt
                        </label>
                        <select
                            value={rule.effect ?? 'none'}
                            onChange={(e) =>
                                update({
                                    effect:
                                        e.target.value === 'none' ? undefined : (e.target.value as 'pulse' | 'blink'),
                                })
                            }
                            className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <option value="none">Kein Effekt</option>
                            <option value="pulse">Pulsieren</option>
                            <option value="blink">Blinken</option>
                        </select>
                    </div>
                    {paintsIcon && (
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
                                        style={{
                                            flexShrink: 0,
                                            color: rule.iconColor || rule.color || 'var(--text-primary)',
                                        }}
                                    />
                                ) : (
                                    <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />
                                )}
                                <span
                                    className="flex-1 truncate text-[11px] text-left"
                                    style={{ color: rule.icon ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                                >
                                    {rule.icon ?? 'Icon wählen …'}
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
                    )}
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

export function ElementConditionEditor({
    rules,
    onChange,
    targets = [],
    ownHint,
    intro,
}: {
    rules: ElementConditionRule[];
    onChange: (next: ElementConditionRule[]) => void;
    /** Paintable parts of the element. Empty = one part only (a custom-grid cell). */
    targets?: ElementConditionTarget[];
    /** Explains what `{dp}` refers to here. */
    ownHint?: string;
    /** Shown instead of the generic empty-state text. */
    intro?: string;
}) {
    const update = (i: number, r: ElementConditionRule) => onChange(rules.map((x, j) => (j === i ? r : x)));
    const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));
    const hint =
        ownHint ??
        `${OWN_DP_TOKEN} = eigener Wert (kein erneutes Eintragen des DP); Pille umschalten für einen anderen Datenpunkt.`;

    return (
        <div className="p-3 space-y-2.5" style={{ width: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Bedingungen
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Mehrere Regeln greifen der Reihe nach — die letzte gewinnt je Eigenschaft
                </p>
            </div>

            {rules.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {intro ??
                        'Noch keine Regel. Regeln reagieren auf den eigenen Wert (oder einen fremden Datenpunkt) und ändern Farbe, Hintergrund, Schrift, Icon oder Text.'}
                </p>
            )}

            {rules.map((rule, i) => (
                <RuleEditor
                    key={rule.id}
                    rule={rule}
                    onChange={(r) => update(i, r)}
                    onDelete={() => remove(i)}
                    targets={targets}
                    ownHint={hint}
                />
            ))}

            <button
                onClick={() => onChange([...rules, newElementRule(targets[0])])}
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

/** Targets a list row offers — all four parts. */
export const ROW_TARGETS = ELEMENT_TARGETS;
