import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type {
    ConditionElement,
    ConditionPart,
    WidgetCondition,
    ConditionClause,
    ConditionOperator,
    ConditionSlot,
    ConditionStyle,
} from '../../types';
import {
    clauseSourceOptions,
    dropOwnDpToken,
    hasListAnyClause,
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
// Free text here meant guessing a unit and a plausible size. The steps below are
// what a card can usefully take; an older, hand-typed value survives as an extra
// option (see SelectField) instead of being silently dropped.
const STYLE_TEXT_FIELDS: {
    key: TextKey;
    labelKey: string;
    hintKey?: string;
    options: { v: string; label?: string }[];
}[] = [
    {
        key: 'borderWidth',
        labelKey: 'cond.styleBorderWidth',
        options: [{ v: '0px' }, { v: '1px' }, { v: '2px' }, { v: '3px' }, { v: '4px' }, { v: '6px' }, { v: '8px' }],
    },
    {
        key: 'radius',
        labelKey: 'cond.styleRadius',
        options: [
            { v: '0px' },
            { v: '4px' },
            { v: '8px' },
            { v: '12px' },
            { v: '16px' },
            { v: '20px' },
            { v: '24px' },
            { v: '999px', label: 'rund' },
        ],
    },
    {
        key: 'opacity',
        labelKey: 'cond.styleOpacity',
        // It multiplies with the alpha of the colours above — worth saying, because
        // the two look like they do the same thing and then compound.
        hintKey: 'cond.styleOpacityHint',
        options: [
            { v: '1', label: '100 %' },
            { v: '0.9', label: '90 %' },
            { v: '0.75', label: '75 %' },
            { v: '0.5', label: '50 %' },
            { v: '0.35', label: '35 %' },
            { v: '0.25', label: '25 %' },
            { v: '0.1', label: '10 %' },
        ],
    },
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
    compact,
    onChange,
}: {
    label: string;
    value: string | undefined;
    /**
     * Swatch only, no hex field. For rows where the colour is the whole point —
     * the picker shows and takes the code. Costs the ability to type a CSS
     * variable there, which the card-wide fields keep.
     */
    compact?: boolean;
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
            {!compact && (
                <input
                    type="text"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value || undefined)}
                    placeholder="auto"
                    className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0 font-mono"
                    style={inputStyle}
                />
            )}
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
            {/* Without the hex field the row would otherwise stretch the delete button
                to the far right, away from the swatch it belongs to. */}
            {compact && <span className="flex-1" />}
        </div>
    );
}

// ── "Anzeige überschreiben" fields ────────────────────────────────────────────
// The colour effects above travel as CSS variables and therefore reach every widget
// type. These do not: they replace a value the widget reads out of its own config,
// so widgetRegistry declares per type which of them actually arrive (issue #96).

function LabeledRow({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5">
            <label
                className="text-[10px] w-16 shrink-0 truncate"
                title={title}
                style={{ color: 'var(--text-secondary)' }}
            >
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
    onChange,
}: {
    label: string;
    value: string | undefined;
    placeholder: string;
    /** For rows that continue the one above and therefore carry no visible label. */
    title?: string;
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
        </LabeledRow>
    );
}

/**
 * A pick-list for the numeric card properties. A value that is not among the steps
 * — typed before these were a select, or written by hand into the layout JSON —
 * is offered as an extra option, so opening the dialog never rewrites it.
 */
function SelectField({
    label,
    value,
    options,
    hint,
    onChange,
}: {
    label: string;
    value: string | undefined;
    options: { v: string; label?: string }[];
    hint?: string;
    onChange: (v: string | undefined) => void;
}) {
    const t = useT();
    const known = options.some((o) => o.v === value);
    return (
        <LabeledRow label={label} title={hint}>
            <select
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                title={hint}
                className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0"
                style={inputStyle}
            >
                <option value="">{t('cond.setUnchanged')}</option>
                {options.map((o) => (
                    <option key={o.v} value={o.v}>
                        {o.label ?? o.v}
                    </option>
                ))}
                {value && !known && <option value={value}>{value}</option>}
            </select>
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
const PART_ORDER: ConditionPart[] = ['title', 'icon', 'value'];

/** True once a rule says anything at all about this element. */
function elementTouched(el: ConditionElement | undefined): boolean {
    return !!el && Object.values(el).some((v) => v !== undefined);
}

/**
 * Everything one element of a widget can be told to do, in one place: whether it is
 * shown, what it shows, how it looks. Splitting that across two blocks meant hiding
 * existed twice and one element had to be configured in two spots.
 *
 * Visibility and content ride the render copy of the config (utils/conditionSet);
 * colour and weight become a class on the frame root, read by the .aura-cond-* rules
 * against the class every widget puts on its title/icon/value.
 */
function ElementBlock({
    part,
    el,
    current,
    onChange,
}: {
    part: ConditionPart;
    el: ConditionElement | undefined;
    current?: ConditionSetCurrent;
    onChange: (next: ConditionElement | undefined) => void;
}) {
    const t = useT();
    const e = el ?? {};
    const touched = elementTouched(el);
    const [open, setOpen] = useState(touched);
    const isIcon = part === 'icon';

    const set = (patch: Partial<ConditionElement>) => {
        const next = { ...e, ...patch } as Record<string, unknown>;
        for (const k of Object.keys(next)) {
            // `show: false` is a decision (hide); a false flag is just "off".
            if (next[k] === undefined || (next[k] === false && k !== 'show')) delete next[k];
        }
        onChange(Object.keys(next).length ? (next as ConditionElement) : undefined);
    };

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] hover:opacity-80"
                style={{ background: 'var(--app-surface)', color: 'var(--text-primary)' }}
            >
                <span style={{ color: 'var(--text-secondary)' }}>
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="flex-1 text-left">{PART_LABELS[part]}</span>
                {touched && (
                    <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: e.color || 'var(--accent)' }}
                    />
                )}
            </button>
            {open && (
                <div className="p-2 space-y-1.5" style={{ background: 'var(--app-bg)' }}>
                    <TriStateField
                        label={t('cond.elVisible')}
                        value={e.show}
                        // Back to "unverändert" means the rule stops touching the content
                        // too — a text left behind an untouched element would still paint.
                        onChange={(v) =>
                            set(
                                v === undefined
                                    ? { show: undefined, text: undefined, icon: undefined, iconSize: undefined }
                                    : { show: v },
                            )
                        }
                    />
                    {/* Content only once the element is actively shown. */}
                    {e.show === true &&
                        (isIcon ? (
                            <LabeledRow label="">
                                <IconButton
                                    value={e.icon}
                                    fallback={current?.icon}
                                    placeholder={t('cond.setIconPlaceholder')}
                                    onChange={(v) => set({ icon: v })}
                                />
                                <input
                                    type="number"
                                    min={8}
                                    max={200}
                                    value={e.iconSize ?? ''}
                                    onChange={(ev) =>
                                        set({ iconSize: ev.target.value === '' ? undefined : Number(ev.target.value) })
                                    }
                                    placeholder={current?.iconSize ? String(current.iconSize) : 'px'}
                                    title={t('cond.setIconSize')}
                                    className="w-11 shrink-0 text-[10px] rounded px-1.5 py-1 focus:outline-none text-center"
                                    style={inputStyle}
                                />
                            </LabeledRow>
                        ) : (
                            <TextField
                                label=""
                                title={part === 'title' ? t('cond.setTitle') : t('cond.setValueText')}
                                value={e.text}
                                placeholder={
                                    part === 'title'
                                        ? current?.title || t('cond.setTitlePlaceholder')
                                        : t('cond.setValueTextPlaceholder')
                                }
                                onChange={(v) => set({ text: v })}
                            />
                        ))}
                    {/* Appearance is NOT gated on "anzeigen": colouring an element must
                        not force it visible. Hidden, though, there is nothing to paint. */}
                    {e.show !== false && (
                        <>
                            {/* Above the colour: size is the coarser decision of the two,
                                and the icon's own size sits above its colour as well. */}
                            {!isIcon && (
                                <LabeledRow label={t('cond.styleFontSize')} title={t('cond.styleFontSizeHint')}>
                                    <input
                                        type="number"
                                        min={6}
                                        max={200}
                                        value={e.fontSize ?? ''}
                                        onChange={(ev) => {
                                            // 0 or a typo is "no override", not a text of
                                            // zero pixels — same guard the icon size uses.
                                            const n = Number(ev.target.value);
                                            set({ fontSize: ev.target.value !== '' && n > 0 ? n : undefined });
                                        }}
                                        placeholder="px"
                                        title={t('cond.styleFontSizeHint')}
                                        className="aura-cond-fontsize w-11 shrink-0 text-[10px] rounded px-1.5 py-1 focus:outline-none text-center"
                                        style={inputStyle}
                                    />
                                </LabeledRow>
                            )}
                            <ColorField
                                label={isIcon ? t('cond.partIconColor') : t('cond.partColor')}
                                value={e.color}
                                compact
                                onChange={(v) => set({ color: v })}
                            />
                            {!isIcon && (
                                <div className="flex items-center gap-1.5 pt-0.5">
                                    <StyleToggle
                                        on={!!e.bold}
                                        onClick={() => set({ bold: !e.bold })}
                                        label={t('cond.styleBold')}
                                    />
                                    <StyleToggle
                                        on={!!e.italic}
                                        onClick={() => set({ italic: !e.italic })}
                                        label={t('cond.styleItalic')}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
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

    // A cleared element must disappear from the map, not linger as an empty object:
    // the runtime merges by "key present".
    const setElement = (part: ConditionPart, next: ConditionElement | undefined) => {
        const els = { ...(condition.elements ?? {}) };
        if (next) els[part] = next;
        else delete els[part];
        onChange({ ...condition, elements: Object.keys(els).length ? els : undefined });
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
    // A `{list:any}` rule sends one message per triggering entry (issue #605); the
    // sample datapoint lets the builder preview what `{{parent}}` & co. resolve to.
    const notifyPerRow = !!sourceCtx?.listRefs?.length && hasListAnyClause(condition);
    const notifySampleDp = notifyPerRow ? sourceCtx?.listRefs?.[0] : sourceCtx?.ownDp;

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
                                    compact
                                    onChange={(v) => setStyle({ [key]: v })}
                                />
                            ))}
                            {context !== 'tab' &&
                                STYLE_TEXT_FIELDS.map(({ key, labelKey, hintKey, options }) => (
                                    <SelectField
                                        key={key}
                                        label={t(labelKey as Parameters<typeof t>[0])}
                                        value={condition.style[key]}
                                        options={options}
                                        hint={hintKey ? t(hintKey as Parameters<typeof t>[0]) : undefined}
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
                            {/* A section of its own — as one line with a stub label it read
                                like a leftover of the block above. */}
                            <div className="h-px mt-2" style={{ background: 'var(--app-border)' }} />
                            <p
                                className="text-[10px] font-semibold uppercase tracking-wider pt-1"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {t('cond.effect')}
                            </p>
                            <select
                                value={condition.effect ?? 'none'}
                                onChange={(e) =>
                                    onChange({ ...condition, effect: e.target.value as WidgetCondition['effect'] })
                                }
                                className="w-full text-[11px] rounded-lg px-2 py-1.5 focus:outline-none"
                                style={inputStyle}
                            >
                                <option value="none">{t('cond.noEffect')}</option>
                                <option value="pulse">{t('cond.pulse')}</option>
                                <option value="blink">{t('cond.blink')}</option>
                                <option value="border">{t('cond.borderPulse')}</option>
                            </select>
                            {/* Only this effect has a ring to colour. */}
                            {condition.effect === 'border' && (
                                <ColorField
                                    label={t('cond.ringColor')}
                                    value={condition.style.ringColor}
                                    compact
                                    onChange={(v) => setStyle({ ringColor: v })}
                                />
                            )}
                        </div>

                        {/* Override what the widget shows — icon, title, value (issue #96) */}
                        {context !== 'tab' && slots.length > 0 && (
                            <div className="space-y-1.5">
                                <p
                                    className="text-[10px] font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('cond.elements')}
                                </p>
                                {/* Fixed reading order, not the order the registry happens to
                                    declare the slots in. */}
                                {PART_ORDER.filter((part) => slots.includes(part)).map((part) => (
                                    <ElementBlock
                                        key={part}
                                        part={part}
                                        el={condition.elements?.[part]}
                                        current={current}
                                        onChange={(next) => setElement(part, next)}
                                    />
                                ))}
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
                            {condition.notify && notifyPerRow && (
                                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('cond.notifyPerRow')}
                                </p>
                            )}
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
                                rowDp={notifySampleDp}
                                perRow={notifyPerRow}
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
