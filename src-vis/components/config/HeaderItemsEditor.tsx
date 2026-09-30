/**
 * Editor of a widget's header items (issue #676) — opened from Darstellung →
 * „Kopfzeile“ in its own popup. A slot map on top (tap a slot = new item there),
 * the item list below. See utils/headerItems for slots, sources and visibility.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Database, Plus, Shapes, Trash2, type LucideIcon } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { ClauseList, ColorField } from './ConditionEditor';
import {
    DEFAULT_HEADER_SLOT,
    HEADER_SLOTS,
    groupBySlot,
    headerSourceCtx,
    newHeaderItem,
    widgetValueOptions,
    type IconPlace,
} from '../../utils/headerItems';
import type {
    WidgetHeaderItem,
    WidgetHeaderShow,
    WidgetHeaderSource,
    WidgetHeaderSlot,
    WidgetConfig,
} from '../../types';
import { useT, type TranslationKey } from '../../i18n';
import { AuraIcon } from '../common/AuraIcon';
import { getWidgetIcon } from '../../utils/widgetIconMap';

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const labelCls = 'text-[10px] w-16 shrink-0';

const SOURCES: WidgetHeaderSource[] = ['dp', 'widget', 'text', 'action'];
const SHOWS: WidgetHeaderShow[] = ['always', 'collapsed', 'expanded'];

const slotKey = (s: WidgetHeaderSlot) => `hdr.slot.${s}` as TranslationKey;

/** One-line summary of an item for the slot map. */
function itemSummary(item: WidgetHeaderItem, t: ReturnType<typeof useT>, config: WidgetConfig): string {
    if (item.source === 'dp') return item.dp?.split('.').pop() || t('hdr.src.dp');
    if (item.source === 'text') return item.text || t('hdr.src.text');
    if (item.source === 'action') return t('hdr.src.action');
    const opt = widgetValueOptions(config).find((o) => o.key === item.widgetValue);
    return opt ? (opt.detail ? `${t(opt.labelKey)} ${opt.detail}` : t(opt.labelKey)) : t('hdr.src.widget');
}

/**
 * A px size as a slider, like the widget symbol's own size under Darstellung. It drags
 * on a local draft and commits on release — every commit serialises the dashboard.
 * Unset = the item's default size; ↩ goes back to it.
 */
function SizeSlider({
    label,
    value,
    fallback,
    min,
    max,
    step = 1,
    onChange,
    testId,
}: {
    label: string;
    value: number | undefined;
    fallback: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number | undefined) => void;
    testId: string;
}) {
    const t = useT();
    const [draft, setDraft] = useState<number | null>(null);
    const shown = draft ?? value ?? fallback;
    const commit = () => {
        if (draft === null) return;
        onChange(draft);
        setDraft(null);
    };
    return (
        <label className="flex items-center gap-1.5 flex-1 min-w-[180px]" data-header-item-size={testId}>
            <span className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                {label}
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={shown}
                onChange={(e) => setDraft(Number(e.target.value))}
                onPointerUp={commit}
                onKeyUp={commit}
                onBlur={commit}
                className="h-1 flex-1 min-w-0"
            />
            <span
                className="text-[10px] w-9 text-right tabular-nums shrink-0"
                style={{
                    color: value === undefined && draft === null ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
            >
                {shown} px
            </span>
            <button
                onClick={(e) => {
                    e.preventDefault();
                    setDraft(null);
                    onChange(undefined);
                }}
                className="text-[10px] px-0.5 hover:opacity-70 shrink-0"
                style={{ color: 'var(--text-secondary)', visibility: value === undefined ? 'hidden' : undefined }}
                title={t('common.auto')}
            >
                ↩
            </button>
        </label>
    );
}

/** What the widget's own title and symbol allow — Darstellung used to carry these (#725). */
export interface HeaderHeadProps {
    iconAllowed: boolean;
    titleAllowed: boolean;
    /** The symbol can be chosen (the window contact draws its own). */
    iconPickable: boolean;
    /** Writes plain widget options: showIcon, icon, iconSize, showTitle. */
    onChange: (patch: Record<string, unknown>) => void;
}

function Toggle({ on, onFlip, attr }: { on: boolean; onFlip: () => void; attr: string }) {
    return (
        <button
            onClick={onFlip}
            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
            data-display-toggle={attr}
        >
            <span
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                style={{ left: on ? '14px' : '2px' }}
            />
        </button>
    );
}

/**
 * The widget's own title and symbol: on/off, the symbol and its size. Where they sit
 * is set on the map above; everything about the header lives in this one dialog.
 */
function HeadRows({
    config,
    head,
    defaultIcon,
}: {
    config: WidgetConfig;
    head: HeaderHeadProps;
    defaultIcon?: LucideIcon;
}) {
    const t = useT();
    const o = config.options ?? {};
    const [pickerOpen, setPickerOpen] = useState(false);
    const iconOn = o.showIcon !== false;
    const titleOn = o.showTitle !== false;
    const Icon = getWidgetIcon(o.icon as string | undefined, defaultIcon ?? Shapes) ?? Shapes;
    return (
        <div
            className="rounded-xl p-2.5 space-y-2"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            data-header-head=""
        >
            {head.titleAllowed && (
                <div className="flex items-center gap-1.5" data-head-title="">
                    <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                        {t('hdr.chip.title')}
                    </label>
                    <Toggle on={titleOn} onFlip={() => head.onChange({ showTitle: !titleOn })} attr="title" />
                </div>
            )}
            {head.iconAllowed && (
                <div className="flex items-center gap-3 flex-wrap" data-head-icon="">
                    <div className="flex items-center gap-1.5">
                        <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                            {t('hdr.icon')}
                        </label>
                        <Toggle on={iconOn} onFlip={() => head.onChange({ showIcon: !iconOn })} attr="icon" />
                        {iconOn && head.iconPickable && (
                            <button
                                onClick={() => setPickerOpen(true)}
                                className="ml-1.5 w-7 h-7 shrink-0 flex items-center justify-center rounded-lg hover:opacity-80"
                                style={inputStyle}
                                title={(o.icon as string | undefined) ?? t('hdr.pickIcon')}
                                aria-label={t('hdr.pickIcon')}
                                data-icon-pick=""
                            >
                                <Icon size={15} />
                            </button>
                        )}
                    </div>
                    {iconOn && (
                        <SizeSlider
                            label={t('hdr.iconSize')}
                            value={o.iconSize as number | undefined}
                            fallback={20}
                            min={12}
                            max={256}
                            step={4}
                            onChange={(v) => head.onChange({ iconSize: v })}
                            testId="main-icon"
                        />
                    )}
                </div>
            )}
            {pickerOpen && (
                <IconPickerModal
                    current={(o.icon as string | undefined) ?? ''}
                    onSelect={(name) => {
                        head.onChange({ icon: name || undefined });
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
}

function ItemRow({
    item,
    config,
    hasClickAction,
    titleCentered,
    index,
    count,
    onChange,
    onDelete,
    onMove,
}: {
    item: WidgetHeaderItem;
    config: WidgetConfig;
    hasClickAction: boolean;
    /** titleAlign 'center': a centre item picks its side of the title. */
    titleCentered: boolean;
    index: number;
    count: number;
    onChange: (item: WidgetHeaderItem) => void;
    onDelete: () => void;
    onMove: (dir: -1 | 1) => void;
}) {
    const t = useT();
    const [pickerFor, setPickerFor] = useState<'dp' | 'text' | null>(null);
    const [iconOpen, setIconOpen] = useState(false);
    const update = (patch: Partial<WidgetHeaderItem>) => onChange({ ...item, ...patch });
    const valueOptions = widgetValueOptions(config);
    const isList = config.type === 'list' || config.type === 'autolist';

    const numberField = (
        <input
            type="number"
            min={0}
            max={6}
            value={item.decimals ?? ''}
            placeholder={t('hdr.decimalsAuto')}
            onChange={(e) => update({ decimals: e.target.value === '' ? undefined : Number(e.target.value) })}
            className={`${cls} w-20 shrink-0`}
            style={inputStyle}
            title={t('hdr.decimals')}
            data-header-item-decimals=""
        />
    );
    const unitField = (
        <input
            type="text"
            value={item.unit ?? ''}
            placeholder={t('hdr.unit')}
            onChange={(e) => update({ unit: e.target.value || undefined })}
            className={`${cls} w-20 shrink-0`}
            style={inputStyle}
            data-header-item-unit=""
        />
    );

    return (
        <div
            className="rounded-xl p-2.5 space-y-2"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            data-header-item-row={item.id}
        >
            <div className="flex items-center gap-1.5 flex-wrap">
                <select
                    value={item.source}
                    onChange={(e) => update({ source: e.target.value as WidgetHeaderSource })}
                    className={cls}
                    style={inputStyle}
                    data-header-item-source=""
                >
                    {SOURCES.map((s) => (
                        <option
                            key={s}
                            value={s}
                            disabled={(s === 'widget' && !valueOptions.length) || (s === 'action' && !hasClickAction)}
                        >
                            {t(`hdr.src.${s}` as TranslationKey)}
                        </option>
                    ))}
                </select>
                <select
                    value={item.slot}
                    onChange={(e) => update({ slot: e.target.value as WidgetHeaderSlot })}
                    className={cls}
                    style={inputStyle}
                    data-header-item-slot=""
                >
                    {HEADER_SLOTS.map((s) => (
                        <option key={s} value={s}>
                            {t(slotKey(s))}
                        </option>
                    ))}
                </select>
                {titleCentered && (item.slot === 'r1-center' || item.slot === 'r2-center') && (
                    // Below the title is the second row's centre — one place, so height and
                    // aura_measure keep counting it as row 2.
                    <select
                        value={item.slot === 'r2-center' ? 'below' : (item.titleSide ?? 'after')}
                        onChange={(e) => {
                            const v = e.target.value;
                            update(
                                v === 'below'
                                    ? { slot: 'r2-center', titleSide: undefined }
                                    : { slot: 'r1-center', titleSide: v === 'before' ? 'before' : undefined },
                            );
                        }}
                        className={cls}
                        style={inputStyle}
                        title={t('hdr.titleSide')}
                        data-header-item-title-side=""
                    >
                        <option value="before">{t('hdr.titleSide.before')}</option>
                        <option value="after">{t('hdr.titleSide.after')}</option>
                        <option value="below">{t('hdr.titleSide.below')}</option>
                    </select>
                )}
                <select
                    value={item.show ?? 'always'}
                    onChange={(e) => {
                        const v = e.target.value as WidgetHeaderShow;
                        update({ show: v === 'always' ? undefined : v });
                    }}
                    className={cls}
                    style={inputStyle}
                    data-header-item-show=""
                >
                    {SHOWS.map((s) => (
                        <option key={s} value={s}>
                            {t(`hdr.show.${s}` as TranslationKey)}
                        </option>
                    ))}
                </select>
                <div className="flex-1" />
                <button
                    onClick={() => onMove(-1)}
                    disabled={index === 0}
                    className="p-1 rounded hover:opacity-70 disabled:opacity-30"
                    style={{ color: 'var(--text-secondary)' }}
                    title={t('hdr.moveUp')}
                >
                    <ArrowUp size={12} />
                </button>
                <button
                    onClick={() => onMove(1)}
                    disabled={index === count - 1}
                    className="p-1 rounded hover:opacity-70 disabled:opacity-30"
                    style={{ color: 'var(--text-secondary)' }}
                    title={t('hdr.moveDown')}
                >
                    <ArrowDown size={12} />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: 'var(--accent-red, #ef4444)' }}
                    title={t('common.delete')}
                    data-header-item-delete=""
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {item.source === 'dp' && (
                <div className="flex items-center gap-1.5">
                    <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                        {t('hdr.src.dp')}
                    </label>
                    <input
                        type="text"
                        value={item.dp ?? ''}
                        onChange={(e) => update({ dp: e.target.value || undefined })}
                        placeholder={t('cond.datapointId')}
                        className={`${cls} flex-1 min-w-0 font-mono`}
                        style={inputStyle}
                        data-header-item-dp=""
                    />
                    <button
                        onClick={() => setPickerFor('dp')}
                        className="px-1.5 h-[30px] rounded-lg hover:opacity-80 shrink-0"
                        style={inputStyle}
                        title={t('hdr.pickDp')}
                    >
                        <Database size={11} />
                    </button>
                    {numberField}
                    {unitField}
                </div>
            )}

            {item.source === 'widget' && (
                <div className="flex items-center gap-1.5">
                    <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                        {t('hdr.value')}
                    </label>
                    <select
                        value={item.widgetValue ?? ''}
                        onChange={(e) => update({ widgetValue: e.target.value || undefined })}
                        className={`${cls} flex-1 min-w-0`}
                        style={inputStyle}
                        data-header-item-value=""
                    >
                        <option value="">{t('hdr.valuePick')}</option>
                        {valueOptions.map((o) => (
                            <option key={o.key} value={o.key}>
                                {o.detail ? `${t(o.labelKey)} ${o.detail}` : t(o.labelKey)}
                            </option>
                        ))}
                    </select>
                    {item.widgetValue !== 'list:count' && item.widgetValue !== 'list:active' && numberField}
                    {unitField}
                </div>
            )}

            {item.source === 'text' && (
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                            {t('hdr.src.text')}
                        </label>
                        <input
                            type="text"
                            value={item.text ?? ''}
                            onChange={(e) => update({ text: e.target.value || undefined })}
                            placeholder={t('hdr.textPlaceholder')}
                            className={`${cls} flex-1 min-w-0`}
                            style={inputStyle}
                            data-header-item-text=""
                        />
                        {/* Appends a `{id}` binding instead of replacing the text. */}
                        <button
                            onClick={() => setPickerFor('text')}
                            className="px-1.5 h-[30px] rounded-lg hover:opacity-80 shrink-0"
                            style={inputStyle}
                            title={t('hdr.insertDp')}
                        >
                            <Database size={11} />
                        </button>
                    </div>
                    <p className="text-[9px] pl-[72px]" style={{ color: 'var(--text-secondary)' }}>
                        {isList ? t('hdr.textHintList') : t('hdr.textHint')}
                    </p>
                </div>
            )}

            {item.source === 'action' && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {hasClickAction ? t('hdr.actionHint') : t('hdr.actionNone')}
                </p>
            )}

            {item.source === 'action' ? (
                <ColorField label={t('hdr.color')} value={item.color} onChange={(v) => update({ color: v })} />
            ) : (
                <>
                    {/* Icon and text each take their own colour and size; an unset icon
                        colour follows the text colour. */}
                    <div className="flex items-center gap-3 flex-wrap" data-header-item-icon-row="">
                        <div className="flex items-center gap-1.5">
                            <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                                {t('hdr.icon')}
                            </label>
                            <button
                                onClick={() => setIconOpen(true)}
                                className="px-1.5 h-[26px] rounded-lg hover:opacity-80 flex items-center"
                                style={inputStyle}
                                data-header-item-icon=""
                            >
                                {item.icon ? <AuraIcon icon={item.icon} width={13} height={13} /> : <Plus size={11} />}
                            </button>
                            {item.icon && (
                                <button
                                    onClick={() =>
                                        update({ icon: undefined, iconSize: undefined, iconColor: undefined })
                                    }
                                    className="hover:opacity-60"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                        {item.icon && (
                            <>
                                <ColorField
                                    label={t('hdr.iconColor')}
                                    value={item.iconColor}
                                    onChange={(v) => update({ iconColor: v })}
                                />
                                <SizeSlider
                                    label={t('hdr.iconSize')}
                                    value={item.iconSize}
                                    fallback={13}
                                    min={8}
                                    max={64}
                                    onChange={(v) => update({ iconSize: v })}
                                    testId="icon"
                                />
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <ColorField
                            label={t('hdr.textColor')}
                            value={item.color}
                            onChange={(v) => update({ color: v })}
                        />
                        <SizeSlider
                            label={t('hdr.textSize')}
                            value={item.textSize}
                            fallback={12}
                            min={8}
                            max={40}
                            onChange={(v) => update({ textSize: v })}
                            testId="text"
                        />
                    </div>
                </>
            )}

            {/* Condition (step 4): the item only shows while its clauses hold — same
                clause editor and value sources as markers (own datapoint, list tokens). */}
            {(() => {
                const condOn = Array.isArray(item.clauses);
                const sourceCtx = headerSourceCtx(config);
                return (
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={condOn}
                                onChange={(e) =>
                                    update(
                                        e.target.checked
                                            ? { clauses: [], logic: item.logic }
                                            : { clauses: undefined, logic: undefined },
                                    )
                                }
                                data-header-item-cond=""
                            />
                            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                {t('hdr.cond')}
                            </span>
                        </label>
                        {condOn && (
                            <div
                                className="space-y-1.5 pl-3 border-l-2"
                                style={{ borderColor: 'color-mix(in srgb, var(--accent) 27%, transparent)' }}
                            >
                                <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                                    {sourceCtx.ownDp ? t('badge.visConditionHint') : t('badge.visConditionHintNoMain')}
                                </p>
                                <ClauseList
                                    clauses={item.clauses ?? []}
                                    logic={item.logic ?? 'AND'}
                                    onChange={(next) => update({ clauses: next })}
                                    sourceCtx={sourceCtx}
                                />
                            </div>
                        )}
                    </div>
                );
            })()}

            {pickerFor && (
                <DatapointPicker
                    currentValue={(pickerFor === 'dp' ? item.dp : '') ?? ''}
                    onSelect={(id, unit) =>
                        pickerFor === 'dp'
                            ? update({ dp: id, unit: item.unit ?? (unit || undefined) })
                            : update({ text: `${item.text ? `${item.text} ` : ''}{${id}}` })
                    }
                    onClose={() => setPickerFor(null)}
                />
            )}
            {iconOpen && (
                <IconPickerModal
                    current={item.icon ?? ''}
                    onSelect={(name) => {
                        update({ icon: name || undefined });
                        setIconOpen(false);
                    }}
                    onClose={() => setIconOpen(false)}
                />
            )}
        </div>
    );
}

/** Title and symbol placement — plain widget options the map writes. */
export interface HeaderLayoutPatch {
    titleAlign?: 'left' | 'center' | 'right';
    iconPlace?: Exclude<IconPlace, 'lead'>;
    titleRow?: 2;
}

type Picked = 'title' | 'icon' | null;
type IconPlaceKey = IconPlace;
const SLOT_ALIGN: Record<WidgetHeaderSlot, 'left' | 'center' | 'right'> = {
    'r1-left': 'left',
    'r1-center': 'center',
    'r1-right': 'right',
    'r2-left': 'left',
    'r2-center': 'center',
    'r2-right': 'right',
};

export function HeaderItemsEditor({
    items,
    config,
    hasClickAction = false,
    iconFixed = false,
    defaultIcon,
    head,
    onChange,
    onLayoutChange,
}: {
    items: WidgetHeaderItem[];
    config: WidgetConfig;
    /** Whether a click action resolves for the widget — the 'action' source needs one. */
    hasClickAction?: boolean;
    /** The widget draws its symbol in a fixed spot when expanded (no TitleRow in this layout). */
    iconFixed?: boolean;
    /** The type's own symbol, for a widget without options.icon. */
    defaultIcon?: LucideIcon;
    /** Title and symbol settings (on/off, symbol, size). Absent: not shown. */
    head?: HeaderHeadProps;
    onChange: (items: WidgetHeaderItem[]) => void;
    /** Moves title / symbol (titleAlign, iconPlace). Absent: the two tiles are not shown. */
    onLayoutChange?: (patch: HeaderLayoutPatch) => void;
}) {
    const t = useT();
    const bySlot = groupBySlot(items);
    const hasValues = widgetValueOptions(config).length > 0;
    const add = (slot: WidgetHeaderSlot = DEFAULT_HEADER_SLOT) => {
        const item = newHeaderItem(slot, hasValues ? 'widget' : 'dp');
        if (hasValues) item.widgetValue = widgetValueOptions(config)[0].key;
        onChange([...items, item]);
    };
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    // A centred title stands in the middle of the row and the r1-center items right
    // behind it (TitleRow) — the map shows the row that way.
    const titleCentered = config.options?.titleAlign === 'center';
    const titleAlign = (config.options?.titleAlign as string) ?? 'left';
    const titleRow2 = config.options?.titleRow === 2;
    const titleSlot =
        `${titleRow2 ? 'r2' : 'r1'}-${titleAlign === 'center' || titleAlign === 'right' ? titleAlign : 'left'}` as WidgetHeaderSlot;
    const iconPlace = ((config.options?.iconPlace as string) ?? 'lead') as IconPlaceKey;
    const titleOn = config.options?.showTitle !== false;
    const iconOn = config.options?.showIcon !== false;
    const movable = !!onLayoutChange;
    const MapIcon = getWidgetIcon(config.options?.icon as string | undefined, defaultIcon ?? Shapes) ?? Shapes;

    // Title and symbol are tiles: tap (or drag) one, then tap where it goes.
    const [picked, setPicked] = useState<Picked>(null);
    const moveTitle = (slot: WidgetHeaderSlot) => {
        // Row 2 costs the card a row of height, as row-2 items do.
        onLayoutChange?.({ titleAlign: SLOT_ALIGN[slot], titleRow: slot.startsWith('r2-') ? 2 : undefined });
        setPicked(null);
    };
    const moveIcon = (place: IconPlaceKey) => {
        onLayoutChange?.({ iconPlace: place === 'lead' ? undefined : place });
        setPicked(null);
    };

    const summary = (list: WidgetHeaderItem[]) =>
        list.length ? (
            <span className="truncate">{list.map((it) => itemSummary(it, t, config)).join(' · ')}</span>
        ) : null;
    const plus = <Plus size={11} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />;

    const chip = (kind: 'title' | 'icon') => {
        const on = kind === 'title' ? titleOn : iconOn;
        const active = picked === kind;
        const hint = !on ? t('hdr.chip.hidden') : t(kind === 'title' ? 'hdr.chip.moveTitle' : 'hdr.chip.moveIcon');
        const toggle = () => setPicked(active ? null : kind);
        return (
            <span
                role="button"
                tabIndex={0}
                draggable
                onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle();
                    }
                }}
                onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', kind);
                    e.dataTransfer.effectAllowed = 'move';
                    setPicked(kind);
                }}
                onDragEnd={() => setPicked(null)}
                className="inline-flex items-center gap-1 min-w-0 shrink rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                    cursor: 'grab',
                    background: active ? 'var(--accent)' : 'var(--app-surface)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                    opacity: on ? 1 : 0.45,
                }}
                title={hint}
                data-header-chip={kind}
                data-chip-off={on ? undefined : ''}
            >
                {kind === 'icon' ? (
                    <MapIcon size={12} className="shrink-0" />
                ) : (
                    <span className="truncate">{config.title || t('hdr.chip.title')}</span>
                )}
            </span>
        );
    };

    /** A drop mark for the symbol, shown while the symbol is picked. */
    const iconTarget = (place: IconPlaceKey) =>
        picked === 'icon' ? (
            <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                    e.stopPropagation();
                    moveIcon(place);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        moveIcon(place);
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    moveIcon(place);
                }}
                className="inline-flex items-center justify-center shrink-0 rounded-md w-5 h-5"
                style={{
                    border: '1px dashed var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                }}
                title={t(`wf.edit.iconPlace.${place}` as TranslationKey)}
                data-icon-target={place}
            >
                <Plus size={10} style={{ color: 'var(--accent)' }} />
            </span>
        ) : null;
    /** The symbol at a place: the tile itself, or a drop mark while it is being moved. */
    const iconAt = (place: IconPlaceKey) => {
        if (!movable) return null;
        if (iconPlace === place || (place === 'beforeTitle' && iconPlace === titleSlot)) return chip('icon');
        // A slot place in the title's own cell is 'beforeTitle' there.
        if (place === titleSlot) return null;
        return iconTarget(place);
    };

    /** Where the symbol goes when its whole cell is tapped: that cell's place, in front of the title in the title's. */
    const cellIconPlace = (slot: WidgetHeaderSlot): IconPlaceKey =>
        slot === 'r1-left'
            ? 'lead'
            : slot === titleSlot
              ? 'beforeTitle'
              : slot === 'r1-right'
                ? 'trail'
                : (slot as IconPlaceKey);

    const cellContent = (slot: WidgetHeaderSlot): ReactNode[] => {
        const list = bySlot[slot];
        const parts: ReactNode[] = [];
        const titleGroup =
            movable && slot === titleSlot ? [iconAt('beforeTitle'), chip('title'), iconAt('afterTitle')] : [];
        // The symbol can go to every cell (#725): its own place there, or right beside
        // the title in the title's cell.
        if (slot === 'r1-left') parts.push(summary(list), iconAt('lead'), ...titleGroup);
        else if (slot === 'r1-center' && titleGroup.length)
            parts.push(
                summary(list.filter((it) => it.titleSide === 'before')),
                ...titleGroup,
                summary(list.filter((it) => it.titleSide !== 'before')),
            );
        else if (slot === 'r1-center') parts.push(iconAt('r1-center'), summary(list));
        else if (slot === 'r1-right') parts.push(...titleGroup, summary(list), iconAt('trail'));
        else if (slot === 'r2-right') parts.push(summary(list), ...(titleGroup.length ? titleGroup : [iconAt(slot)]));
        else parts.push(...(titleGroup.length ? titleGroup : [iconAt(slot as IconPlaceKey)]), summary(list));
        if (!list.length && !parts.some(Boolean)) parts.push(plus);
        return parts;
    };

    const slotCell = (slot: WidgetHeaderSlot) => {
        const titleTarget = picked === 'title' && slot !== titleSlot;
        const iconTargetCell = picked === 'icon';
        const act = () => {
            if (titleTarget) moveTitle(slot);
            else if (iconTargetCell) moveIcon(cellIconPlace(slot));
            else if (picked) setPicked(null);
            else add(slot);
        };
        return (
            <div
                key={slot}
                role="button"
                tabIndex={0}
                onClick={act}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        act();
                    }
                }}
                onDragOver={(e) => {
                    if (titleTarget || iconTargetCell) e.preventDefault();
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    if (titleTarget) moveTitle(slot);
                    else if (iconTargetCell) moveIcon(cellIconPlace(slot));
                }}
                className="min-w-0 rounded-lg px-2 py-1.5 text-left hover:opacity-80 cursor-pointer select-none"
                style={{
                    background: titleTarget ? 'color-mix(in srgb, var(--accent) 10%, var(--app-bg))' : 'var(--app-bg)',
                    border: `1px dashed ${titleTarget ? 'var(--accent)' : 'var(--app-border)'}`,
                }}
                title={titleTarget ? t('hdr.chip.titleHere') : picked ? undefined : t('hdr.addHere')}
                data-header-slot-add={slot}
                data-title-target={titleTarget ? '' : undefined}
            >
                <span className="block text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    {t(slotKey(slot))}
                </span>
                <span
                    className="flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap text-[11px]"
                    style={{ color: 'var(--text-primary)', minHeight: 20 }}
                >
                    {cellContent(slot).map((part, i) => (part ? <Fragment key={i}>{part}</Fragment> : null))}
                </span>
            </div>
        );
    };

    return (
        <div className="p-3 space-y-3" onMouseDown={(e) => e.stopPropagation()} data-header-items-editor="">
            {head && (head.iconAllowed || head.titleAllowed) && (
                <HeadRows config={config} head={head} defaultIcon={defaultIcon} />
            )}

            <div className="space-y-1">
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }} data-header-map-hint="">
                    {picked === 'title'
                        ? t('hdr.pickHint.title')
                        : picked === 'icon'
                          ? t('hdr.pickHint.icon')
                          : movable
                            ? t('hdr.mapHintTiles')
                            : t('hdr.mapHint')}
                </p>
                <div className="grid grid-cols-3 gap-1.5" data-title-centered={titleCentered ? '' : undefined}>
                    {HEADER_SLOTS.map((slot) => slotCell(slot))}
                </div>
                {titleCentered && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('hdr.centerHint')}
                    </p>
                )}
                {movable && iconFixed && iconOn && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }} data-icon-fixed-hint="">
                        {t('hdr.iconFixedHint')}
                    </p>
                )}
            </div>

            {items.length === 0 && (
                <p className="text-xs text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('hdr.empty')}
                </p>
            )}

            {items.map((item, i) => (
                <ItemRow
                    key={item.id}
                    item={item}
                    config={config}
                    hasClickAction={hasClickAction}
                    titleCentered={titleCentered}
                    index={i}
                    count={items.length}
                    onChange={(next) => onChange(items.map((x) => (x.id === next.id ? next : x)))}
                    onDelete={() => onChange(items.filter((x) => x.id !== item.id))}
                    onMove={(dir) => move(i, dir)}
                />
            ))}

            <button
                onClick={() => add()}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                style={{
                    background: 'var(--app-surface)',
                    color: 'var(--accent)',
                    border: '1px dashed color-mix(in srgb, var(--accent) 35%, transparent)',
                }}
                data-header-item-add=""
            >
                <Plus size={13} /> {t('hdr.add')}
            </button>

            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {t('hdr.foldHint')}
            </p>
        </div>
    );
}
