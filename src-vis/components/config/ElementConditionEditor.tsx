import { useState } from 'react';
import type React from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { ClauseRow, ColorField, newClause } from './ConditionEditor';
import { ConfigModal } from './ConfigModal';
import { IconPickerModal } from './IconPickerModal';
import { MessageBuilder, emptyDraft } from './MessageBuilder';
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

const fieldStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <p
            className={`text-[10px] font-semibold uppercase tracking-wider ${className}`}
            style={{ color: 'var(--text-secondary)' }}
        >
            {children}
        </p>
    );
}

/** Label column of the same width the shared ColorField uses, so rows line up. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5">
            <label className="text-[10px] w-16 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            {children}
        </div>
    );
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

type Mode = 'unchanged' | 'adjust' | 'hide';

function RuleEditor({
    rule,
    onChange,
    onDelete,
    targets,
    ownHint,
    allowIconSize,
    allowNotify,
    sampleDp,
}: {
    rule: ElementConditionRule;
    onChange: (r: ElementConditionRule) => void;
    onDelete: () => void;
    /** Offer a target select. Empty = the element has only one paintable part. */
    targets: ElementConditionTarget[];
    /** Explains what `{dp}` refers to in this context. */
    ownHint: string;
    /** The host renders the icon at a size a rule may override. */
    allowIconSize: boolean;
    /** Offer the "send a message" effect — only where the row engine evaluates the
     *  rule per element and can therefore raise one message per row (issue #605). */
    allowNotify: boolean;
    /** A datapoint the message's `{{parent}}` & co. resolve against in the preview. */
    sampleDp?: string;
}) {
    const [open, setOpen] = useState(true);
    const [showIcon, setShowIcon] = useState(false);
    const [editingNotify, setEditingNotify] = useState(false);
    const update = (patch: Partial<ElementConditionRule>) => onChange({ ...rule, ...patch });
    const updateClause = (i: number, c: ElementConditionRule['clauses'][number]) =>
        update({ clauses: rule.clauses.map((cl, j) => (j === i ? c : cl)) });
    const deleteClause = (i: number) => update({ clauses: rule.clauses.filter((_, j) => j !== i) });
    const addClause = () => update({ clauses: [...rule.clauses, newOwnClause()] });
    const toggleLogic = () => update({ logic: rule.logic === 'OR' ? 'AND' : 'OR' });

    // Same three-way switch as the widget rules. It is derived rather than stored:
    // a rule that overrides text or icon *is* adjusting the element, and "anpassen"
    // with nothing filled in yet has nothing worth persisting. Picking it only has
    // to survive until the fields are filled, so local state is enough.
    const derivedMode: Mode = rule.hide
        ? 'hide'
        : rule.text !== undefined || rule.icon || rule.iconSize !== undefined
          ? 'adjust'
          : 'unchanged';
    const [modePick, setModePick] = useState<Mode | null>(null);
    const mode = modePick ?? derivedMode;
    const setMode = (m: Mode) => {
        setModePick(m);
        // Back to "unverändert" drops the overrides — a text left behind an
        // untouched element would still paint.
        if (m === 'unchanged') update({ hide: undefined, text: undefined, icon: undefined, iconSize: undefined });
        else update({ hide: m === 'hide' ? true : undefined });
    };

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
                <div className="p-3 space-y-3 aura-rule-body" style={{ background: 'var(--app-bg)' }}>
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

                    {/* Same two-column split as the widget-wide rules: the style on the
                        left, what the element shows on the right. */}
                    <div className="aura-rule-cols">
                        <div className="space-y-1.5">
                            <SectionLabel>Stil wenn aktiv</SectionLabel>
                            {/* Above the colour: the size is the coarser decision of the
                                two, and the icon size sits above the icon colour too. */}
                            {paintsText && (
                                <Row label="Textgröße">
                                    <input
                                        type="number"
                                        min={6}
                                        max={200}
                                        value={rule.fontSize ?? ''}
                                        onChange={(e) => {
                                            // Same guard the icon size uses: 0 or a typo is
                                            // "no override", not a text of zero pixels.
                                            const n = Number(e.target.value);
                                            update({ fontSize: e.target.value !== '' && n > 0 ? n : undefined });
                                        }}
                                        placeholder="px"
                                        title="Textgröße in px — leer lässt die eingestellte Größe"
                                        className="aura-cond-fontsize w-11 shrink-0 text-[10px] rounded px-1.5 py-1 focus:outline-none text-center"
                                        style={fieldStyle}
                                    />
                                </Row>
                            )}
                            {paintsText && (
                                <ColorField
                                    label="Textfarbe"
                                    value={rule.color}
                                    compact
                                    onChange={(v) => update({ color: v })}
                                />
                            )}
                            {target === 'row' && (
                                <ColorField
                                    label="Hintergrund"
                                    value={rule.bg}
                                    compact
                                    onChange={(v) => update({ bg: v })}
                                />
                            )}
                            {paintsIcon && (
                                <ColorField
                                    label="Icon-Farbe"
                                    value={rule.iconColor}
                                    compact
                                    onChange={(v) => update({ iconColor: v })}
                                />
                            )}
                            {paintsText && (
                                <div className="flex items-center gap-1.5 pt-0.5">
                                    <Toggle
                                        on={!!rule.bold}
                                        onClick={() => update({ bold: !rule.bold })}
                                        label="Fett"
                                    />
                                    <Toggle
                                        on={!!rule.italic}
                                        onClick={() => update({ italic: !rule.italic })}
                                        label="Kursiv"
                                    />
                                </div>
                            )}

                            {/* A section of its own, as in the widget dialog — on one line
                                with a stub label it read like a leftover of the block above. */}
                            <div className="h-px mt-2" style={{ background: 'var(--app-border)' }} />
                            <SectionLabel className="pt-1">Effekt</SectionLabel>
                            {/* In a Row like every other field, even without a label of its
                                own — otherwise this one select runs the full column while
                                the fields opposite start 64 px in, and the two blocks stop
                                reading as the same grid. */}
                            <Row label="">
                                <select
                                    value={rule.effect ?? 'none'}
                                    onChange={(e) =>
                                        update({
                                            effect:
                                                e.target.value === 'none'
                                                    ? undefined
                                                    : (e.target.value as 'pulse' | 'blink'),
                                        })
                                    }
                                    className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                    style={fieldStyle}
                                >
                                    <option value="none">Kein Effekt</option>
                                    <option value="pulse">Pulsieren</option>
                                    <option value="blink">Blinken</option>
                                </select>
                            </Row>
                        </div>

                        <div className="space-y-1.5">
                            <SectionLabel>Element</SectionLabel>
                            {targets.length > 0 && (
                                <Row label="Wirkt auf">
                                    <select
                                        value={target}
                                        onChange={(e) => update({ target: e.target.value as ElementConditionTarget })}
                                        className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                        style={fieldStyle}
                                    >
                                        {targets.map((tg) => (
                                            <option key={tg} value={tg}>
                                                {TARGET_LABELS[tg]}
                                            </option>
                                        ))}
                                    </select>
                                </Row>
                            )}
                            <Row label="Sichtbar">
                                <select
                                    value={mode}
                                    onChange={(e) => setMode(e.target.value as Mode)}
                                    className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                    style={fieldStyle}
                                >
                                    <option value="unchanged">unverändert</option>
                                    <option value="adjust">anpassen</option>
                                    <option value="hide">ausblenden</option>
                                </select>
                            </Row>
                            {/* Content only once the element is actively adjusted — a field
                                behind the word "unverändert" would change it after all. */}
                            {mode === 'adjust' && paintsText && (
                                <Row label="Text">
                                    <input
                                        type="text"
                                        value={rule.text ?? ''}
                                        onChange={(e) => update({ text: e.target.value || undefined })}
                                        placeholder="unverändert"
                                        className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                        style={fieldStyle}
                                    />
                                </Row>
                            )}
                            {mode === 'adjust' && paintsIcon && (
                                <Row label="Icon">
                                    <button
                                        onClick={() => setShowIcon(true)}
                                        className="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1 rounded"
                                        style={fieldStyle}
                                    >
                                        {IconPrev ? (
                                            <IconPrev
                                                size={13}
                                                style={{
                                                    flexShrink: 0,
                                                    color: rule.iconColor || rule.color || 'var(--text-primary)',
                                                }}
                                            />
                                        ) : (
                                            <span
                                                style={{
                                                    width: 13,
                                                    height: 13,
                                                    display: 'inline-block',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        )}
                                        <span
                                            className="flex-1 truncate text-[10px] text-left"
                                            style={{
                                                color: rule.icon ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            }}
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
                                    {/* Size sits next to the picker, like in the widget dialog: it
                                        resizes whatever icon the element shows, an override of its
                                        own is not required. */}
                                    {allowIconSize && (
                                        <input
                                            type="number"
                                            min={6}
                                            max={200}
                                            value={rule.iconSize ?? ''}
                                            onChange={(e) => {
                                                // Same guard the entry editor uses: 0 or a typo is
                                                // "no override", not an icon of zero pixels.
                                                const n = Number(e.target.value);
                                                update({ iconSize: isFinite(n) && n > 0 ? n : undefined });
                                            }}
                                            placeholder="px"
                                            title="Icon-Größe in px — leer lässt die eingestellte Größe"
                                            className="w-11 shrink-0 text-[10px] rounded px-1.5 py-1 focus:outline-none text-center"
                                            style={fieldStyle}
                                        />
                                    )}
                                </Row>
                            )}
                        </div>
                    </div>

                    {/* Send a message (issue #605). Per element: a rule on the list fires
                        once for every row that starts matching, so the message can name
                        that row. Edge semantics as everywhere — matching keeps sending
                        nothing until the element stops matching and matches again. */}
                    {allowNotify && (
                        <>
                            <div className="h-px mt-2" style={{ background: 'var(--app-border)' }} />
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                        Meldung senden
                                    </p>
                                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                        {rule.notify
                                            ? 'Eine Meldung je Zeile, sobald die Regel dort zutrifft.'
                                            : 'Erzeugt eine Meldung, sobald die Regel zutrifft.'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {rule.notify && (
                                        <button
                                            onClick={() => setEditingNotify(true)}
                                            className="text-[10px] px-2 py-1 rounded-lg"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        >
                                            Bearbeiten
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            if (rule.notify) {
                                                update({ notify: undefined });
                                            } else {
                                                // Straight into the builder — an enabled but
                                                // empty message would be dropped silently.
                                                update({ notify: emptyDraft() });
                                                setEditingNotify(true);
                                            }
                                        }}
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{ background: rule.notify ? 'var(--accent)' : 'var(--app-border)' }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                            style={{ left: rule.notify ? '18px' : '2px' }}
                                        />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {editingNotify && rule.notify && (
                        <ConfigModal
                            title="Meldung senden"
                            maxWidth={980}
                            padded
                            storageKey="aura-row-cond-notify-modal"
                            onClose={() => setEditingNotify(false)}
                        >
                            <MessageBuilder
                                draft={rule.notify}
                                onChange={(draft) => update({ notify: draft })}
                                rowDp={sampleDp}
                                perRow
                            />
                        </ConfigModal>
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
    allowIconSize = false,
    allowNotify = false,
    sampleDp,
}: {
    rules: ElementConditionRule[];
    onChange: (next: ElementConditionRule[]) => void;
    /** Paintable parts of the element. Empty = one part only (a custom-grid cell). */
    targets?: ElementConditionTarget[];
    /** Explains what `{dp}` refers to here. */
    ownHint?: string;
    /** Shown instead of the generic empty-state text. */
    intro?: string;
    /**
     * Offer the icon size. Off by default: a custom-grid cell sizes its icon from the
     * cell box, so the field would be one that does nothing there.
     */
    allowIconSize?: boolean;
    /**
     * Offer the "send a message" effect (issue #605). Only the list rows run through
     * the row engine that fires it per element — a custom-grid cell is painted by a
     * different hook, so the switch would be dead there.
     */
    allowNotify?: boolean;
    /** Sample datapoint for the message preview: what `{{parent}}` & co. resolve to. */
    sampleDp?: string;
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
                    allowIconSize={allowIconSize}
                    allowNotify={allowNotify}
                    sampleDp={sampleDp}
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
