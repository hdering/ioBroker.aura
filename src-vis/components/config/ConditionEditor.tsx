import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type {
    ConditionPart,
    ConditionPartStyle,
    WidgetCondition,
    ConditionClause,
    ConditionOperator,
    ConditionSet,
    ConditionSlot,
    ConditionStyle,
} from '../../types';
import {
    clauseSourceOptions,
    dropOwnDpToken,
    normalizeSourceToken,
    type DpSourceCtx,
    type SourceOption,
} from '../../utils/conditionSources';
import { useT, t } from '../../i18n';
import { ColorPicker } from '../common/ColorPicker';
import { ConfigModal } from './ConfigModal';
import { MessageBuilder, emptyDraft } from './MessageBuilder';

// ── Constants ─────────────────────────────────────────────────────────────────

const OPERATORS: { value: ConditionOperator; label: () => string; noValue?: boolean }[] = [
    { value: '==', label: () => t('cond.equal') },
    { value: '!=', label: () => t('cond.notEqual') },
    { value: '>', label: () => t('cond.greater') },
    { value: '>=', label: () => t('cond.greaterEq') },
    { value: '<', label: () => t('cond.less') },
    { value: '<=', label: () => t('cond.lessEq') },
    { value: 'contains', label: () => t('cond.contains') },
    { value: 'true', label: () => t('cond.isTrue'), noValue: true },
    { value: 'false', label: () => t('cond.isFalse'), noValue: true },
    { value: 'active', label: () => t('cond.isActive'), noValue: true },
    { value: 'inactive', label: () => t('cond.isInactive'), noValue: true },
    // Transition, not a state — only the widget-condition path tracks which
    // datapoint just delivered a value, so it stays out of cell/badge clauses.
    { value: 'changed', label: () => t('cond.changed'), noValue: true },
];

const CHANGED_ONLY = new Set<ConditionOperator>(['changed']);

/** Stable empty default — a fresh array each render would remount the rule list. */
const NO_SLOTS: ConditionSlot[] = [];

/** ConditionStyle keys that hold a colour resp. a plain CSS value. */
type ColorKey = 'accent' | 'bg' | 'border' | 'textPrimary' | 'textSecondary';
type TextKey = 'borderWidth' | 'radius' | 'opacity';

const STYLE_FIELDS: { key: ColorKey; labelKey: string }[] = [
    { key: 'accent', labelKey: 'cond.colorAccent' },
    { key: 'bg', labelKey: 'cond.colorBg' },
    { key: 'border', labelKey: 'cond.colorBorder' },
    { key: 'textPrimary', labelKey: 'cond.colorText' },
    { key: 'textSecondary', labelKey: 'cond.colorText2' },
];

// Not colours, so not ColorField: these take a CSS length resp. a factor and mirror
// the same three keys the static "Erweitert" panel offers (WidgetFrame STYLE_FIELDS).
const STYLE_TEXT_FIELDS: { key: TextKey; labelKey: string; placeholder: string }[] = [
    { key: 'borderWidth', labelKey: 'cond.styleBorderWidth', placeholder: '2px' },
    { key: 'radius', labelKey: 'cond.styleRadius', placeholder: '18px' },
    { key: 'opacity', labelKey: 'cond.styleOpacity', placeholder: '0.5' },
];

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

export function newClause(): ConditionClause {
    return { datapoint: '', operator: '==', value: '' };
}

function newCondition(): WidgetCondition {
    return {
        id: `cond-${Date.now()}`,
        label: '',
        logic: 'AND',
        clauses: [newClause()],
        style: {},
        effect: 'none',
    };
}

// ── Source select ─────────────────────────────────────────────────────────────

/**
 * Picks where a datapoint field takes its value from: a plain state id (default),
 * the widget's main datapoint or — on list widgets — an aggregate over the list
 * entries. The choice is stored as a token inside the datapoint string itself.
 */
export function DpSourceSelect({
    value,
    options,
    onChange,
    width = '108px',
}: {
    value: string;
    options: SourceOption[];
    onChange: (token: string) => void;
    width?: string;
}) {
    const t = useT();
    return (
        <select
            value={normalizeSourceToken(value)}
            onChange={(e) => onChange(e.target.value)}
            className={`${cls} shrink-0`}
            style={{ ...inputStyle, width }}
            title={t('cond.source')}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                </option>
            ))}
        </select>
    );
}

// ── Clause row ────────────────────────────────────────────────────────────────

export function ClauseRow({
    clause: rawClause,
    isFirst,
    logic,
    onLogicToggle,
    onChange,
    onDelete,
    ownToken,
    sourceCtx,
    allowChanged,
}: {
    clause: ConditionClause;
    isFirst: boolean;
    logic: 'AND' | 'OR';
    onLogicToggle: () => void;
    onChange: (c: ConditionClause) => void;
    onDelete: () => void;
    /** When set (e.g. '{dp}'), a pill lets the clause reference the cell's own DP instead of typing it. */
    ownToken?: string;
    /** Widget value sources (main DP / list entries) offered as a source select. */
    sourceCtx?: DpSourceCtx;
    /** Offer the 'changed' operator. Only widget conditions evaluate it (issue #537). */
    allowChanged?: boolean;
}) {
    // In a widget/badge clause '{dp}' and an empty field are the same thing, so only
    // the empty field is offered. Cell clauses (ownToken set) keep the token — there
    // it means the cell's own value.
    const clause = ownToken ? rawClause : { ...rawClause, datapoint: dropOwnDpToken(rawClause.datapoint) };
    const t = useT();
    const [showPicker, setShowPicker] = useState(false);
    const [showValuePicker, setShowValuePicker] = useState(false);
    const op = OPERATORS.find((o) => o.value === clause.operator)!;
    // A clause that already uses a gated operator keeps it listed — otherwise the
    // select would render a value it has no option for and silently reset it.
    const operators = OPERATORS.filter(
        (o) => allowChanged || !CHANGED_ONLY.has(o.value) || o.value === clause.operator,
    );
    const isDpValue = clause.valueType === 'datapoint';
    const isOwn = !!ownToken && clause.datapoint === ownToken;

    // Widget context (conditions + badges): offer the main DP / list aggregates.
    const srcOptions = ownToken ? [] : clauseSourceOptions(sourceCtx);
    const hasSources = srcOptions.length > 1;
    const srcToken = hasSources ? normalizeSourceToken(clause.datapoint) : '';
    const srcLabel = srcToken ? t(srcOptions.find((o) => o.value === srcToken)?.labelKey ?? 'cond.srcDatapoint') : '';

    return (
        <div className="flex items-center gap-1.5">
            {/* AND/OR toggle or "WENN" label */}
            {isFirst ? (
                <span
                    className="text-[10px] font-semibold w-8 shrink-0 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('cond.when')}
                </span>
            ) : (
                <button
                    onClick={onLogicToggle}
                    className="text-[10px] font-bold w-8 h-6 rounded shrink-0 hover:opacity-80"
                    style={{
                        background: 'var(--accent)22',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)44',
                    }}
                >
                    {logic}
                </button>
            )}

            {/* Datapoint input + picker */}
            <div className="flex gap-0.5 flex-1 min-w-0">
                {ownToken && (
                    <button
                        onClick={() => onChange({ ...clause, datapoint: isOwn ? '' : ownToken })}
                        className="px-1.5 rounded-lg shrink-0 hover:opacity-80 text-[9px] font-bold font-mono"
                        style={{
                            background: isOwn ? 'var(--accent)22' : 'var(--app-bg)',
                            color: isOwn ? 'var(--accent)' : 'var(--text-secondary)',
                            border: `1px solid ${isOwn ? 'var(--accent)44' : 'var(--app-border)'}`,
                        }}
                        title={isOwn ? 'Anderen Datenpunkt angeben' : 'Eigenen Datenpunkt der Zelle verwenden'}
                    >
                        {ownToken}
                    </button>
                )}
                {hasSources && (
                    <DpSourceSelect
                        value={clause.datapoint}
                        options={srcOptions}
                        onChange={(token) => onChange({ ...clause, datapoint: token })}
                    />
                )}
                {isOwn ? (
                    <span
                        className={`${cls} flex-1 min-w-0 flex items-center`}
                        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                    >
                        Eigener Zellwert
                    </span>
                ) : srcToken ? (
                    <span
                        className={`${cls} flex-1 min-w-0 flex items-center`}
                        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                    >
                        {srcLabel}
                    </span>
                ) : (
                    <>
                        <input
                            type="text"
                            value={clause.datapoint}
                            onChange={(e) => onChange({ ...clause, datapoint: e.target.value })}
                            placeholder={sourceCtx?.ownDp ? t('cond.dpEmptyMain') : t('cond.datapointId')}
                            className={`${cls} flex-1 font-mono min-w-0`}
                            style={inputStyle}
                        />
                        <button
                            onClick={() => setShowPicker(true)}
                            className="px-1.5 rounded-lg hover:opacity-80 shrink-0"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                            title={t('cond.fromIoBroker')}
                        >
                            <Database size={11} />
                        </button>
                        <JsonPathButton
                            value={clause.datapoint}
                            onChange={(ref) => onChange({ ...clause, datapoint: ref })}
                            size={11}
                        />
                    </>
                )}
            </div>

            {/* Operator */}
            <select
                value={clause.operator}
                onChange={(e) => onChange({ ...clause, operator: e.target.value as ConditionOperator, value: '' })}
                className={`${cls} shrink-0`}
                style={{ ...inputStyle, width: '112px' }}
            >
                {operators.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label()}
                    </option>
                ))}
            </select>

            {/* Value (hidden for true/false operators) */}
            {!op?.noValue ? (
                <div className={`flex gap-0.5 shrink-0 ${isDpValue ? 'flex-1 min-w-0' : 'w-32'}`}>
                    <button
                        onClick={() =>
                            onChange({ ...clause, valueType: isDpValue ? 'static' : 'datapoint', value: '' })
                        }
                        className="px-1.5 rounded-lg shrink-0 hover:opacity-80 text-[9px] font-bold"
                        style={{
                            background: isDpValue ? 'var(--accent)22' : 'var(--app-bg)',
                            color: isDpValue ? 'var(--accent)' : 'var(--text-secondary)',
                            border: `1px solid ${isDpValue ? 'var(--accent)44' : 'var(--app-border)'}`,
                            minWidth: 22,
                        }}
                        title={isDpValue ? t('cond.toStatic') : t('cond.toDatapoint')}
                    >
                        {isDpValue ? 'DP' : '123'}
                    </button>
                    <input
                        type="text"
                        value={clause.value}
                        onChange={(e) => onChange({ ...clause, value: e.target.value })}
                        placeholder={isDpValue ? t('cond.datapointId') : t('cond.value')}
                        className={`${cls} flex-1 min-w-0 ${isDpValue ? 'font-mono' : ''}`}
                        style={inputStyle}
                    />
                    {isDpValue && (
                        <button
                            onClick={() => setShowValuePicker(true)}
                            className="px-1.5 rounded-lg hover:opacity-80 shrink-0"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                            title={t('cond.fromIoBroker')}
                        >
                            <Database size={11} />
                        </button>
                    )}
                    {isDpValue && (
                        <JsonPathButton
                            value={clause.value}
                            onChange={(ref) => onChange({ ...clause, value: ref })}
                            size={11}
                        />
                    )}
                </div>
            ) : (
                <div className="w-32 shrink-0" />
            )}

            <button
                onClick={onDelete}
                className="shrink-0 hover:opacity-70"
                style={{ color: 'var(--accent-red)' }}
                title={t('cond.removeClause')}
            >
                <Trash2 size={12} />
            </button>

            {showPicker && (
                <DatapointPicker
                    currentValue={clause.datapoint}
                    onSelect={(id) => {
                        onChange({ ...clause, datapoint: id });
                    }}
                    onClose={() => setShowPicker(false)}
                />
            )}
            {showValuePicker && (
                <DatapointPicker
                    currentValue={clause.value}
                    onSelect={(id) => {
                        onChange({ ...clause, value: id });
                    }}
                    onClose={() => setShowValuePicker(false)}
                />
            )}
        </div>
    );
}

// ── Color field ───────────────────────────────────────────────────────────────

export function ColorField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <label className="text-[10px] w-16 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <ColorPicker
                value={value ?? '#3b82f6'}
                unset={!value}
                onChange={(v) => onChange(v)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
                title={label}
            />
            <input
                type="text"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                placeholder="auto"
                className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0 font-mono"
                style={inputStyle}
            />
            {/* Always rendered, only hidden — otherwise the input jumps in width the
                moment a colour is set or cleared. */}
            <button
                onClick={() => onChange(undefined)}
                className="shrink-0 hover:opacity-60"
                aria-hidden={!value}
                tabIndex={value ? 0 : -1}
                style={{
                    color: 'var(--text-secondary)',
                    visibility: value ? 'visible' : 'hidden',
                    pointerEvents: value ? 'auto' : 'none',
                }}
            >
                <Trash2 size={10} />
            </button>
        </div>
    );
}

// ── "Anzeige überschreiben" fields ────────────────────────────────────────────
// The colour effects above travel as CSS variables and therefore reach every widget
// type. These do not: they replace a value the widget reads out of its own config,
// so widgetRegistry declares per type which of them actually arrive (issue #96).

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5">
            <label className="text-[10px] w-16 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

function TextField({
    label,
    value,
    placeholder,
    title,
    trailingSlot,
    onChange,
}: {
    label: string;
    value: string | undefined;
    placeholder: string;
    /** For rows that continue the one above and therefore carry no visible label. */
    title?: string;
    /** Reserve the trailing delete-button slot, so this row lines up with the
     *  colour rows above it instead of reaching 31 px further right. */
    trailingSlot?: boolean;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <LabeledRow label={label}>
            <input
                type="text"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                placeholder={placeholder}
                title={title}
                className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                style={inputStyle}
            />
            {trailingSlot && <span aria-hidden className="shrink-0" style={{ width: 10 }} />}
        </LabeledRow>
    );
}

/** on / off / "leave alone" — an unset override must not silently mean `false`. */
function TriStateField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: boolean | undefined;
    onChange: (v: boolean | undefined) => void;
}) {
    const t = useT();
    return (
        <LabeledRow label={label}>
            <select
                value={value === undefined ? '' : value ? '1' : '0'}
                onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === '1')}
                className={`${cls} flex-1`}
                style={inputStyle}
            >
                <option value="">{t('cond.setUnchanged')}</option>
                <option value="1">{t('cond.setOn')}</option>
                <option value="0">{t('cond.setOff')}</option>
            </select>
        </LabeledRow>
    );
}

/**
 * Icon chooser. With nothing chosen it previews `fallback` — the icon the widget
 * shows today — greyed out, so it is visible what an override would replace.
 */
export function IconButton({
    value,
    fallback,
    placeholder,
    onChange,
}: {
    value: string | undefined;
    /** The widget's own icon, shown as a ghost preview while `value` is unset. */
    fallback?: string;
    placeholder: string;
    onChange: (v: string | undefined) => void;
}) {
    const [open, setOpen] = useState(false);
    const shown = value || fallback;
    const Preview = shown ? getWidgetIcon(shown, null!) : null;
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={!value && fallback ? fallback : undefined}
                className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded text-[10px]"
                style={inputStyle}
            >
                {Preview ? (
                    <Preview size={13} style={{ flexShrink: 0, opacity: value ? 1 : 0.45 }} />
                ) : (
                    <span style={{ width: 13, height: 13, display: 'inline-block', flexShrink: 0 }} />
                )}
                <span
                    className="flex-1 truncate text-left"
                    style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                    {value ?? placeholder}
                </span>
            </button>
            {value && (
                <button
                    onClick={() => onChange(undefined)}
                    className="shrink-0 hover:opacity-60"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Trash2 size={10} />
                </button>
            )}
            {open && (
                <IconPickerModal
                    current={value ?? ''}
                    onSelect={(name) => {
                        onChange(name || undefined);
                        setOpen(false);
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

export function IconField(props: {
    label: string;
    value: string | undefined;
    fallback?: string;
    placeholder: string;
    onChange: (v: string | undefined) => void;
}) {
    const { label, ...rest } = props;
    return (
        <LabeledRow label={label}>
            <IconButton {...rest} />
        </LabeledRow>
    );
}

function StyleToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
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

/** What the widget shows today — previewed so an override has something to replace. */
export interface ConditionSetCurrent {
    title?: string;
    icon?: string;
    iconSize?: number;
}

const PART_LABELS: Record<ConditionPart, string> = { title: 'Titel', icon: 'Icon', value: 'Wert' };

/**
 * Paint ONE element instead of the whole card. The colours above are CSS variables
 * and therefore hit everything the widget draws; this reaches a single element
 * through the class it already carries.
 */
function ConditionPartFields({
    part,
    style,
    slots,
    onChange,
}: {
    part: ConditionPart | undefined;
    style: ConditionPartStyle | undefined;
    slots: ConditionSlot[];
    onChange: (patch: Pick<WidgetCondition, 'part' | 'partStyle'>) => void;
}) {
    const t = useT();
    const st = style ?? {};
    const set = (patch: Partial<ConditionPartStyle>) => {
        const next = { ...st, ...patch } as Record<string, unknown>;
        for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === false) delete next[k];
        onChange({ part, partStyle: Object.keys(next).length ? (next as ConditionPartStyle) : undefined });
    };
    return (
        <>
            <LabeledRow label={t('cond.partTarget')}>
                <select
                    value={part ?? ''}
                    // Switching the element drops what was set for the old one — it would
                    // otherwise keep painting from behind a select that no longer names it.
                    onChange={(e) =>
                        onChange({
                            part: (e.target.value || undefined) as ConditionPart | undefined,
                            partStyle: undefined,
                        })
                    }
                    className={`${cls} flex-1`}
                    style={inputStyle}
                >
                    <option value="">{t('cond.partNone')}</option>
                    {slots.map((sl) => (
                        <option key={sl} value={sl}>
                            {PART_LABELS[sl]}
                        </option>
                    ))}
                </select>
            </LabeledRow>
            {part && (
                <>
                    <ColorField
                        label={part === 'icon' ? t('cond.partIconColor') : t('cond.partColor')}
                        value={st.color}
                        onChange={(v) => set({ color: v })}
                    />
                    <div className="flex items-center gap-1.5 pt-0.5">
                        {/* An icon is an SVG — a font weight or slant does nothing to it. */}
                        {part !== 'icon' && (
                            <>
                                <StyleToggle
                                    on={!!st.bold}
                                    onClick={() => set({ bold: !st.bold })}
                                    label={t('cond.styleBold')}
                                />
                                <StyleToggle
                                    on={!!st.italic}
                                    onClick={() => set({ italic: !st.italic })}
                                    label={t('cond.styleItalic')}
                                />
                            </>
                        )}
                        <StyleToggle
                            on={!!st.hide}
                            onClick={() => set({ hide: !st.hide })}
                            label={t('cond.partHide')}
                        />
                    </div>
                </>
            )}
        </>
    );
}

function ConditionSetFields({
    set,
    slots,
    current,
    onChange,
}: {
    set: ConditionSet | undefined;
    slots: ConditionSlot[];
    current?: ConditionSetCurrent;
    onChange: (patch: Partial<ConditionSet>) => void;
}) {
    const t = useT();
    const s = set ?? {};
    // "… zeigen" is the gate for the whole block: `unverändert` means the rule does
    // not touch the title/icon at all, so its detail fields are not offered — and
    // switching back to it clears what was entered. Leaving a stored override behind
    // an "unverändert" select would be exactly the lie the label denies.
    return (
        <div className="space-y-1.5">
            {slots.includes('title') && (
                <>
                    <TriStateField
                        label={t('cond.setShowTitle')}
                        value={s.showTitle}
                        onChange={(v) =>
                            onChange(v === undefined ? { showTitle: v, title: undefined } : { showTitle: v })
                        }
                    />
                    {s.showTitle === true && (
                        <TextField
                            label=""
                            title={t('cond.setTitle')}
                            value={s.title}
                            placeholder={current?.title || t('cond.setTitlePlaceholder')}
                            onChange={(v) => onChange({ title: v })}
                        />
                    )}
                </>
            )}
            {slots.includes('icon') && (
                <>
                    <TriStateField
                        label={t('cond.setShowIcon')}
                        value={s.showIcon}
                        onChange={(v) =>
                            onChange(
                                v === undefined
                                    ? { showIcon: v, icon: undefined, iconSize: undefined }
                                    : { showIcon: v },
                            )
                        }
                    />
                    {s.showIcon === true && (
                        <LabeledRow label="">
                            <IconButton
                                value={s.icon}
                                fallback={current?.icon}
                                placeholder={t('cond.setIconPlaceholder')}
                                onChange={(v) => onChange({ icon: v })}
                            />
                            <input
                                type="number"
                                min={8}
                                max={200}
                                value={s.iconSize ?? ''}
                                onChange={(e) =>
                                    onChange({ iconSize: e.target.value === '' ? undefined : Number(e.target.value) })
                                }
                                placeholder={current?.iconSize ? String(current.iconSize) : 'px'}
                                title={t('cond.setIconSize')}
                                className="w-11 shrink-0 text-[10px] rounded px-1.5 py-1 focus:outline-none text-center"
                                style={inputStyle}
                            />
                        </LabeledRow>
                    )}
                </>
            )}
            {slots.includes('value') && (
                <>
                    <TriStateField
                        label={t('cond.setShowValue')}
                        value={s.showValue}
                        onChange={(v) =>
                            onChange(v === undefined ? { showValue: v, valueText: undefined } : { showValue: v })
                        }
                    />
                    {s.showValue === true && (
                        <TextField
                            label=""
                            title={t('cond.setValueText')}
                            value={s.valueText}
                            placeholder={t('cond.setValueTextPlaceholder')}
                            onChange={(v) => onChange({ valueText: v })}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// ── Single condition rule ─────────────────────────────────────────────────────

function ConditionRule({
    condition,
    onChange,
    onDelete,
    context = 'widget',
    sourceCtx,
    slots,
    current,
}: {
    condition: WidgetCondition;
    onChange: (c: WidgetCondition) => void;
    onDelete: () => void;
    context?: 'widget' | 'tab';
    sourceCtx?: DpSourceCtx;
    slots: ConditionSlot[];
    current?: ConditionSetCurrent;
}) {
    const t = useT();
    const [open, setOpen] = useState(true);

    const setStyle = (patch: Partial<ConditionStyle>) =>
        onChange({ ...condition, style: { ...condition.style, ...patch } });

    // A cleared field must disappear from the set, not linger as `undefined`: the
    // runtime merges by "key present", and an empty object would keep the rule
    // marked as overriding something.
    const setSet = (patch: Partial<ConditionSet>) => {
        const next = { ...(condition.set ?? {}), ...patch } as Record<string, unknown>;
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        onChange({ ...condition, set: Object.keys(next).length ? (next as ConditionSet) : undefined });
    };

    const updateClause = (i: number, c: ConditionClause) =>
        onChange({ ...condition, clauses: condition.clauses.map((cl, j) => (j === i ? c : cl)) });

    const deleteClause = (i: number) =>
        onChange({ ...condition, clauses: condition.clauses.filter((_, j) => j !== i) });

    const addClause = () => onChange({ ...condition, clauses: [...condition.clauses, newClause()] });

    const toggleLogic = () => onChange({ ...condition, logic: condition.logic === 'AND' ? 'OR' : 'AND' });

    const hasActiveStyle = Object.values(condition.style).some(Boolean);
    // Drives the hint under the reload toggle: a 'changed' rule reloads on every
    // value, everything else only when the rule flips to true.
    const hasChangedClause = condition.clauses.some((c) => c.operator === 'changed');
    const [editingNotify, setEditingNotify] = useState(false);

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {/* Header */}
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
                    value={condition.label ?? ''}
                    onChange={(e) => onChange({ ...condition, label: e.target.value })}
                    placeholder="Regelname (optional)"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-xs bg-transparent focus:outline-none"
                    style={{ color: 'var(--text-primary)' }}
                />
                {hasActiveStyle && (
                    <div className="flex gap-1 shrink-0">
                        {Object.entries(condition.style)
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                                <div
                                    key={k}
                                    className="w-3 h-3 rounded-full border"
                                    style={{ background: v as string, borderColor: 'var(--app-border)' }}
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
                        {condition.clauses.map((clause, i) => (
                            <ClauseRow
                                key={i}
                                clause={clause}
                                isFirst={i === 0}
                                logic={condition.logic}
                                onLogicToggle={toggleLogic}
                                onChange={(c) => updateClause(i, c)}
                                onDelete={() => deleteClause(i)}
                                sourceCtx={sourceCtx}
                                allowChanged={context === 'widget'}
                            />
                        ))}
                    </div>
                    <button
                        onClick={addClause}
                        className="flex items-center gap-1 text-[10px] hover:opacity-80"
                        style={{ color: 'var(--accent)' }}
                    >
                        <Plus size={11} /> {t('cond.addClause')}
                    </button>

                    {/* Separator */}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {/* Two columns of effects. A colour row is label + swatch + hex and does
                        not need the full 1024 px; spanning it only made the panel taller and
                        harder to scan. Both columns fill their half exactly — capping them
                        left a void on the right, which read as a cut-off panel. Stacks again
                        below `md`. */}
                    <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <p
                                className="text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {t('cond.activeStyle')}
                            </p>
                            {STYLE_FIELDS.map(({ key, labelKey }) => (
                                <ColorField
                                    key={key}
                                    label={t(labelKey as Parameters<typeof t>[0])}
                                    value={condition.style[key]}
                                    onChange={(v) => setStyle({ [key]: v })}
                                />
                            ))}
                            {context !== 'tab' &&
                                STYLE_TEXT_FIELDS.map(({ key, labelKey, placeholder }) => (
                                    <TextField
                                        key={key}
                                        label={t(labelKey as Parameters<typeof t>[0])}
                                        value={condition.style[key]}
                                        placeholder={placeholder}
                                        trailingSlot
                                        onChange={(v) => setStyle({ [key]: v })}
                                    />
                                ))}
                            {/* The same two the element rules offer — kept in step on purpose. */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                                <StyleToggle
                                    on={!!condition.style.bold}
                                    onClick={() => setStyle({ bold: condition.style.bold ? undefined : true })}
                                    label={t('cond.styleBold')}
                                />
                                <StyleToggle
                                    on={!!condition.style.italic}
                                    onClick={() => setStyle({ italic: condition.style.italic ? undefined : true })}
                                    label={t('cond.styleItalic')}
                                />
                            </div>
                            {context !== 'tab' && slots.length > 0 && (
                                <>
                                    <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                                    <ConditionPartFields
                                        part={condition.part}
                                        style={condition.partStyle}
                                        slots={slots}
                                        onChange={(patch) => onChange({ ...condition, ...patch })}
                                    />
                                </>
                            )}

                            {/* Belongs to the style, so it sits in the style column. */}
                            <div className="flex items-center gap-1.5">
                                <label
                                    className="text-[10px] w-16 shrink-0 truncate"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('cond.effect')}
                                </label>
                                <select
                                    value={condition.effect ?? 'none'}
                                    onChange={(e) =>
                                        onChange({ ...condition, effect: e.target.value as WidgetCondition['effect'] })
                                    }
                                    className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                                    style={inputStyle}
                                >
                                    <option value="none">{t('cond.noEffect')}</option>
                                    <option value="pulse">{t('cond.pulse')}</option>
                                    <option value="blink">{t('cond.blink')}</option>
                                </select>
                            </div>
                        </div>

                        {/* Override what the widget shows — icon, title, value (issue #96) */}
                        {context !== 'tab' && slots.length > 0 && (
                            <div className="space-y-1.5">
                                <p
                                    className="text-[10px] font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('cond.overrideDisplay')}
                                </p>
                                <ConditionSetFields
                                    set={condition.set}
                                    slots={slots}
                                    current={current}
                                    onChange={setSet}
                                />
                            </div>
                        )}
                    </div>

                    {/* Reload widget — embedded content (iframe/camera/image) re-fetches */}
                    {context !== 'tab' && (
                        <>
                            <div className="h-px" style={{ background: 'var(--app-border)' }} />
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {t('cond.refreshWidget')}
                                    </p>
                                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                        {condition.refreshWidget && hasChangedClause
                                            ? t('cond.refreshWidgetOnChange')
                                            : condition.refreshWidget
                                              ? t('cond.refreshWidgetOnMatch')
                                              : t('cond.refreshWidgetHint')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => onChange({ ...condition, refreshWidget: !condition.refreshWidget })}
                                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                    style={{
                                        background: condition.refreshWidget ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                        style={{ left: condition.refreshWidget ? '18px' : '2px' }}
                                    />
                                </button>
                            </div>
                        </>
                    )}

                    {/* Send a message (issue #429) — same edge rules as "reload widget":
                        a state rule fires once when it starts matching, a 'changed'
                        clause on every value arrival. */}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('cond.notify')}
                            </p>
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {condition.notify
                                    ? hasChangedClause
                                        ? t('cond.notifyOnChange')
                                        : t('cond.notifyOnMatch')
                                    : t('cond.notifyHint')}
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {condition.notify && (
                                <button
                                    onClick={() => setEditingNotify(true)}
                                    className="text-[10px] px-2 py-1 rounded-lg"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {t('common.edit')}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (condition.notify) {
                                        onChange({ ...condition, notify: undefined });
                                    } else {
                                        // Open the builder straight away — an enabled but
                                        // empty message would be silently dropped.
                                        onChange({ ...condition, notify: emptyDraft() });
                                        setEditingNotify(true);
                                    }
                                }}
                                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                style={{ background: condition.notify ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                <span
                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                    style={{ left: condition.notify ? '18px' : '2px' }}
                                />
                            </button>
                        </div>
                    </div>
                    {editingNotify && condition.notify && (
                        <ConfigModal
                            title={t('cond.notify')}
                            maxWidth={980}
                            padded
                            storageKey="aura-cond-notify-modal"
                            onClose={() => setEditingNotify(false)}
                        >
                            <MessageBuilder
                                draft={condition.notify}
                                onChange={(draft) => onChange({ ...condition, notify: draft })}
                            />
                        </ConfigModal>
                    )}

                    {/* Hide widget / tab */}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                {context === 'tab' ? t('cond.controlTabVisibility') : t('cond.controlVisibility')}
                            </p>
                            {!condition.hideWidget && (
                                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {context === 'tab'
                                        ? t('cond.controlTabVisibilityHint')
                                        : t('cond.controlVisibilityHint')}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() =>
                                onChange({
                                    ...condition,
                                    hideWidget: !condition.hideWidget,
                                    reflow: condition.hideWidget ? false : condition.reflow,
                                })
                            }
                            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                            style={{ background: condition.hideWidget ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: condition.hideWidget ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                    {condition.hideWidget && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    {t('cond.mode')}
                                </label>
                                <select
                                    value={condition.visibilityMode ?? 'hideOnMatch'}
                                    onChange={(e) =>
                                        onChange({
                                            ...condition,
                                            visibilityMode: e.target.value as WidgetCondition['visibilityMode'],
                                        })
                                    }
                                    className={`${cls} flex-1`}
                                    style={inputStyle}
                                >
                                    <option value="hideOnMatch">{t('cond.hideOnMatch')}</option>
                                    <option value="showOnMatch">{t('cond.showOnMatch')}</option>
                                </select>
                            </div>
                            <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                                {(condition.visibilityMode ?? 'hideOnMatch') === 'showOnMatch'
                                    ? t(context === 'tab' ? 'cond.showOnMatchTabHint' : 'cond.showOnMatchHint')
                                    : t(context === 'tab' ? 'cond.hideOnMatchTabHint' : 'cond.hideOnMatchHint')}
                            </p>
                        </div>
                    )}
                    {context !== 'tab' && condition.hideWidget && (
                        <div
                            className="flex items-center justify-between pl-3 border-l-2"
                            style={{ borderColor: 'var(--accent)44' }}
                        >
                            <div>
                                <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {t('cond.pushOthers')}
                                </p>
                                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('cond.pushOthersHint')}
                                </p>
                            </div>
                            <button
                                onClick={() => onChange({ ...condition, reflow: !condition.reflow })}
                                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                style={{ background: condition.reflow ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                <span
                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                    style={{ left: condition.reflow ? '18px' : '2px' }}
                                />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface ConditionEditorProps {
    conditions: WidgetCondition[];
    onChange: (conditions: WidgetCondition[]) => void;
    context?: 'widget' | 'tab';
    /** Value sources of the owning widget (main DP / list entries). Omitted for tabs. */
    sourceCtx?: DpSourceCtx;
    /**
     * Override slots the owning widget type honours — conditionSlotsFor(type).
     * Empty (the default) hides the "Anzeige uberschreiben" block entirely, which is
     * what tabs and sections want.
     */
    slots?: ConditionSlot[];
    /** What the widget shows today — previewed behind the override fields. */
    current?: ConditionSetCurrent;
    style?: React.CSSProperties;
}

export function ConditionEditor({
    conditions,
    onChange,
    context = 'widget',
    sourceCtx,
    slots = NO_SLOTS,
    current,
    style,
}: ConditionEditorProps) {
    const t = useT();
    const update = (i: number, c: WidgetCondition) => onChange(conditions.map((x, j) => (j === i ? c : x)));

    const remove = (i: number) => onChange(conditions.filter((_, j) => j !== i));

    return (
        <div className="p-3 space-y-2.5" style={{ width: '100%', ...style }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('cond.rules')}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('cond.rulesHint')}
                </p>
            </div>

            {conditions.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('cond.noRules')}
                </p>
            )}

            {conditions.map((cond, i) => (
                <ConditionRule
                    key={cond.id}
                    condition={cond}
                    onChange={(c) => update(i, c)}
                    onDelete={() => remove(i)}
                    context={context}
                    sourceCtx={sourceCtx}
                    slots={slots}
                    current={current}
                />
            ))}

            <button
                onClick={() => onChange([...conditions, newCondition()])}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                style={{
                    background: 'var(--app-surface)',
                    color: 'var(--accent)',
                    border: '1px dashed var(--accent)55',
                }}
            >
                <Plus size={13} /> {t('cond.newRule')}
            </button>
        </div>
    );
}
