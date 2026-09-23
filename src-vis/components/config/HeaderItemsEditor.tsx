/**
 * Editor of a widget's header items (issue #676) — opened from Darstellung →
 * „Kopfzeile“ in its own popup. A slot map on top (tap a slot = new item there),
 * the item list below. See utils/headerItems for slots, sources and visibility.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Database, Plus, Trash2 } from 'lucide-react';
import { Icon } from '@iconify/react';
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
} from '../../utils/headerItems';
import type {
    WidgetHeaderItem,
    WidgetHeaderShow,
    WidgetHeaderSource,
    WidgetHeaderSlot,
    WidgetConfig,
} from '../../types';
import { useT, type TranslationKey } from '../../i18n';

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

function ItemRow({
    item,
    config,
    hasClickAction,
    index,
    count,
    onChange,
    onDelete,
    onMove,
}: {
    item: WidgetHeaderItem;
    config: WidgetConfig;
    hasClickAction: boolean;
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

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" hidden={item.source === 'action'}>
                    <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                        {t('hdr.icon')}
                    </label>
                    <button
                        onClick={() => setIconOpen(true)}
                        className="px-1.5 h-[26px] rounded-lg hover:opacity-80 flex items-center"
                        style={inputStyle}
                        data-header-item-icon=""
                    >
                        {item.icon ? <Icon icon={item.icon} width={13} height={13} /> : <Plus size={11} />}
                    </button>
                    {item.icon && (
                        <button
                            onClick={() => update({ icon: undefined })}
                            className="hover:opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <Trash2 size={11} />
                        </button>
                    )}
                </div>
                <ColorField label={t('hdr.color')} value={item.color} onChange={(v) => update({ color: v })} />
            </div>

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

export function HeaderItemsEditor({
    items,
    config,
    hasClickAction = false,
    onChange,
}: {
    items: WidgetHeaderItem[];
    config: WidgetConfig;
    /** Whether a click action resolves for the widget — the 'action' source needs one. */
    hasClickAction?: boolean;
    onChange: (items: WidgetHeaderItem[]) => void;
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

    const slotCell = (slot: WidgetHeaderSlot) => (
        <button
            key={slot}
            onClick={() => add(slot)}
            className="min-w-0 rounded-lg px-2 py-1.5 text-left hover:opacity-80"
            style={{ background: 'var(--app-bg)', border: '1px dashed var(--app-border)' }}
            title={t('hdr.addHere')}
            data-header-slot-add={slot}
        >
            <span className="block text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                {t(slotKey(slot))}
            </span>
            <span className="block text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
                {bySlot[slot].length ? (
                    bySlot[slot].map((it) => itemSummary(it, t, config)).join(' · ')
                ) : (
                    <Plus size={11} style={{ color: 'var(--text-secondary)' }} />
                )}
            </span>
        </button>
    );

    return (
        <div className="p-3 space-y-3" onMouseDown={(e) => e.stopPropagation()} data-header-items-editor="">
            <div className="space-y-1">
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('hdr.mapHint')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                    <div
                        className="min-w-0 rounded-lg px-2 py-1.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <span
                            className="block text-[9px] uppercase tracking-wide"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t('hdr.slot.title')}
                        </span>
                        <span className="block text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {config.title || '—'}
                        </span>
                    </div>
                    {slotCell('r1-center')}
                    {slotCell('r1-right')}
                    {slotCell('r2-left')}
                    {slotCell('r2-center')}
                    {slotCell('r2-right')}
                </div>
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
