import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Database, Plus, Trash2 } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';
import { IconPickerModal } from './IconPickerModal';
import { ColorPicker } from '../common/ColorPicker';
import { AuraIcon } from '../common/AuraIcon';
import {
    STATUS_FIXED_KEYS,
    STATUS_ITEM_COLOR_HEX,
    orderedStatusKeys,
    type StatusFixedKey,
} from '../widgets/StatusBadges';
import type { StatusItem } from '../../types';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n/de';

// Editor of a widget's own status symbols and of the order of the whole status
// row (#792). Built-in symbols (battery, reach, window, lock) keep their fields
// in the "Status-Datenpunkte" section; here they only take part in the order.

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

const FIXED_LABEL: Record<StatusFixedKey, TranslationKey> = {
    battery: 'statusItems.fixedBattery',
    reach: 'statusItems.fixedReach',
    window: 'statusItems.fixedWindow',
    lock: 'statusItems.fixedLock',
};
const FIXED_DP: Record<StatusFixedKey, string> = {
    battery: 'batteryDp',
    reach: 'unreachDp',
    window: 'windowDp',
    lock: 'lockDp',
};

function isFixed(key: string): key is StatusFixedKey {
    return (STATUS_FIXED_KEYS as readonly string[]).includes(key);
}

function newItemId(): string {
    return `si-${Date.now().toString(36)}`;
}

type PickFor = 'dp' | 'writeDp';
type IconFor = 'icon' | 'iconInactive';

function ItemFields({ item, onChange }: { item: StatusItem; onChange: (patch: Partial<StatusItem>) => void }) {
    const t = useT();
    const [pickFor, setPickFor] = useState<PickFor | null>(null);
    const [iconFor, setIconFor] = useState<IconFor | null>(null);
    // An empty text field stores nothing, so the runtime default applies.
    const text = (key: keyof StatusItem) => (v: string) => onChange({ [key]: v === '' ? undefined : v });

    const row = (label: string, body: React.ReactNode) => (
        <div className="flex items-center gap-2">
            <label className="text-[10px] w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex gap-1 flex-1 min-w-0 items-center">{body}</div>
        </div>
    );
    const dpField = (key: PickFor, placeholder: string) => (
        <>
            <input
                type="text"
                value={item[key] ?? ''}
                onChange={(e) => (key === 'dp' ? onChange({ dp: e.target.value }) : text(key)(e.target.value))}
                placeholder={placeholder}
                className={`${cls} flex-1 font-mono min-w-0`}
                style={inputStyle}
            />
            <button
                onClick={() => setPickFor(key)}
                className="px-1.5 h-[30px] rounded-lg hover:opacity-80 shrink-0"
                style={btnStyle}
                title={t('cond.fromIoBroker')}
            >
                <Database size={11} />
            </button>
        </>
    );
    const iconButton = (key: IconFor) => {
        const own = item[key];
        return (
            <>
                <button
                    onClick={() => setIconFor(key)}
                    className="px-2 h-[30px] rounded-lg hover:opacity-80 shrink-0 flex items-center gap-1 text-[10px]"
                    style={btnStyle}
                    title={t('statusItems.icon')}
                >
                    {own ? (
                        <AuraIcon icon={own} width={14} height={14} />
                    ) : key === 'iconInactive' && item.icon ? (
                        t('statusItems.iconSameAsActive')
                    ) : (
                        <Plus size={11} />
                    )}
                </button>
                {own && (
                    <button
                        onClick={() => onChange({ [key]: undefined })}
                        className="shrink-0 hover:opacity-60"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <Trash2 size={11} />
                    </button>
                )}
            </>
        );
    };
    // The default colour shows as the picked one, like the built-in symbols; ↺ goes back to it.
    const colorField = (key: 'color' | 'colorInactive', active: boolean) => {
        const own = item[key] || undefined;
        const dflt = STATUS_ITEM_COLOR_HEX[active ? 'active' : 'inactive'];
        return (
            <>
                <ColorPicker
                    value={own ?? dflt}
                    onChange={(v) => onChange({ [key]: v || undefined })}
                    title={t('statusItems.color')}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
                />
                <input
                    type="text"
                    value={own ?? dflt}
                    onChange={(e) => onChange({ [key]: e.target.value.trim() || undefined })}
                    className={`${cls} flex-1 font-mono min-w-0`}
                    style={inputStyle}
                />
                {own && (
                    <button
                        onClick={() => onChange({ [key]: undefined })}
                        className="px-1.5 rounded-lg hover:opacity-80 shrink-0 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                        title={t('statusItems.colorDefault')}
                    >
                        ↺
                    </button>
                )}
            </>
        );
    };
    const stateBlock = (active: boolean) => {
        const iconKey: IconFor = active ? 'icon' : 'iconInactive';
        const colorKey = active ? 'color' : 'colorInactive';
        const labelKey = active ? 'label' : 'labelInactive';
        return (
            <div className="space-y-1.5 pl-2" style={{ borderLeft: '2px solid var(--app-border)' }}>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t(active ? 'statusItems.active' : 'statusItems.inactive')}
                </p>
                {row(t('statusItems.icon'), iconButton(iconKey))}
                {row(t('statusItems.color'), colorField(colorKey, active))}
                {row(
                    t('statusItems.tooltip'),
                    <input
                        type="text"
                        value={item[labelKey] ?? ''}
                        onChange={(e) => text(labelKey)(e.target.value)}
                        className={`${cls} flex-1 min-w-0`}
                        style={inputStyle}
                    />,
                )}
            </div>
        );
    };

    return (
        <div className="p-3 space-y-2.5" style={{ background: 'var(--app-bg)' }}>
            {row(
                t('statusItems.datapoint'),
                <>
                    {dpField('dp', t('cond.datapointId'))}
                    <JsonPathButton value={item.dp} onChange={(ref) => onChange({ dp: ref })} size={11} />
                </>,
            )}
            {row(
                t('statusItems.activeValues'),
                <input
                    type="text"
                    value={item.activeValues ?? ''}
                    onChange={(e) => text('activeValues')(e.target.value)}
                    placeholder="true,1"
                    title={t('statusItems.activeValuesHint')}
                    className={`${cls} flex-1 font-mono min-w-0`}
                    style={inputStyle}
                />,
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {stateBlock(true)}
                {stateBlock(false)}
            </div>
            {row(
                t('statusItems.show'),
                <select
                    value={item.show ?? 'always'}
                    onChange={(e) =>
                        onChange({
                            show: e.target.value === 'always' ? undefined : (e.target.value as StatusItem['show']),
                        })
                    }
                    className={`${cls} flex-1`}
                    style={inputStyle}
                >
                    <option value="always">{t('statusItems.showAlways')}</option>
                    <option value="active">{t('statusItems.showActive')}</option>
                    <option value="inactive">{t('statusItems.showInactive')}</option>
                </select>,
            )}
            {row(
                t('statusItems.action'),
                <select
                    value={item.action ?? 'none'}
                    onChange={(e) => onChange({ action: e.target.value === 'toggle' ? 'toggle' : undefined })}
                    className={`${cls} flex-1`}
                    style={inputStyle}
                >
                    <option value="none">{t('statusItems.actionNone')}</option>
                    <option value="toggle">{t('statusItems.actionToggle')}</option>
                </select>,
            )}
            {item.action === 'toggle' && (
                <div
                    className="space-y-1.5 pl-2"
                    style={{ borderLeft: '2px solid color-mix(in srgb, var(--accent) 27%, transparent)' }}
                >
                    {row(t('statusItems.writeDp'), dpField('writeDp', t('statusItems.writeDpEmpty')))}
                    {row(
                        t('statusItems.onValue'),
                        <input
                            type="text"
                            value={item.onValue ?? ''}
                            onChange={(e) => text('onValue')(e.target.value)}
                            placeholder="true"
                            className={`${cls} flex-1 font-mono min-w-0`}
                            style={inputStyle}
                        />,
                    )}
                    {row(
                        t('statusItems.offValue'),
                        <input
                            type="text"
                            value={item.offValue ?? ''}
                            onChange={(e) => text('offValue')(e.target.value)}
                            placeholder="false"
                            className={`${cls} flex-1 font-mono min-w-0`}
                            style={inputStyle}
                        />,
                    )}
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('statusItems.valueHint')}
                    </p>
                </div>
            )}

            {pickFor && (
                <DatapointPicker
                    currentValue={item[pickFor] ?? ''}
                    onSelect={(id) => onChange({ [pickFor]: id })}
                    onClose={() => setPickFor(null)}
                />
            )}
            {iconFor && (
                <IconPickerModal
                    current={item[iconFor] ?? ''}
                    onSelect={(name) => {
                        onChange({ [iconFor]: name || undefined });
                        setIconFor(null);
                    }}
                    onClose={() => setIconFor(null)}
                />
            )}
        </div>
    );
}

export function StatusItemsEditor({
    options,
    onChange,
}: {
    options: Record<string, unknown>;
    /** Patch of `statusItems` / `statusOrder`; undefined removes the key. */
    onChange: (patch: { statusItems?: StatusItem[]; statusOrder?: string[] }) => void;
}) {
    const t = useT();
    const items = Array.isArray(options.statusItems) ? (options.statusItems as StatusItem[]) : [];
    const [openId, setOpenId] = useState<string | null>(null);

    // Every key in display order, drafts (no datapoint yet) included; built-in
    // symbols only while their datapoint is set — the others cannot show anyway.
    const order = orderedStatusKeys(
        options.statusOrder,
        items.map((it) => it.id),
    );
    const listed = order.filter((k) => !isFixed(k) || !!options[FIXED_DP[k]]);

    const writeItems = (next: StatusItem[], nextOrder?: string[]) =>
        onChange({
            statusItems: next.length ? next : undefined,
            statusOrder: nextOrder ?? (options.statusOrder as string[] | undefined),
        });
    const updateItem = (id: string, patch: Partial<StatusItem>) =>
        writeItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const removeItem = (id: string) => {
        const own = options.statusOrder as string[] | undefined;
        writeItems(
            items.filter((it) => it.id !== id),
            own?.filter((k) => k !== id),
        );
    };
    const addItem = (item: StatusItem) => {
        // A new symbol lands at the end of an order the user has already set.
        const own = options.statusOrder as string[] | undefined;
        writeItems([...items, item], own ? [...order, item.id] : undefined);
        setOpenId(item.id);
    };
    // Swaps two listed neighbours inside the full order, so hidden built-in keys keep their place.
    const move = (idx: number, dir: -1 | 1) => {
        const a = listed[idx];
        const b = listed[idx + dir];
        if (!a || !b) return;
        const next = [...order];
        const ia = next.indexOf(a);
        const ib = next.indexOf(b);
        next[ia] = b;
        next[ib] = a;
        onChange({ statusItems: items.length ? items : undefined, statusOrder: next });
    };

    return (
        <div className="p-3 space-y-2.5" style={{ width: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {t('statusItems.orderHint')}
            </p>

            {listed.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('statusItems.empty')}
                </p>
            )}

            {listed.map((key, idx) => {
                const item = isFixed(key) ? null : items.find((it) => it.id === key);
                const open = !!item && openId === key;
                return (
                    <div
                        key={key}
                        className="rounded-xl overflow-hidden"
                        style={{ border: '1px solid var(--app-border)' }}
                        data-status-row={key}
                    >
                        <div
                            className={`flex items-center gap-2 px-3 py-2 ${item ? 'cursor-pointer hover:opacity-80' : ''}`}
                            style={{ background: 'var(--app-surface)' }}
                            onClick={() => item && setOpenId(open ? null : key)}
                        >
                            <span className="w-[13px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                {item && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                            </span>
                            <span className="w-4 shrink-0 flex justify-center">
                                {item?.icon && <AuraIcon icon={item.icon} width={14} height={14} />}
                            </span>
                            <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                {isFixed(key)
                                    ? t(FIXED_LABEL[key])
                                    : item?.label || item?.dp || t('statusItems.unnamed')}
                            </span>
                            {isFixed(key) && (
                                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    {t('statusItems.fixed')}
                                </span>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    move(idx, -1);
                                }}
                                disabled={idx === 0}
                                className="shrink-0 hover:opacity-70 disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                                title={t('statusItems.moveUp')}
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    move(idx, 1);
                                }}
                                disabled={idx === listed.length - 1}
                                className="shrink-0 hover:opacity-70 disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                                title={t('statusItems.moveDown')}
                            >
                                <ChevronRight size={14} />
                            </button>
                            {item && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeItem(key);
                                    }}
                                    className="hover:opacity-70 shrink-0"
                                    style={{ color: 'var(--accent-red)' }}
                                    title={t('common.delete')}
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                        {open && item && <ItemFields item={item} onChange={(patch) => updateItem(key, patch)} />}
                    </div>
                );
            })}

            <div className="flex gap-2">
                <button
                    onClick={() => addItem({ id: newItemId(), dp: '' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                    style={{
                        background: 'var(--app-surface)',
                        color: 'var(--accent)',
                        border: '1px dashed color-mix(in srgb, var(--accent) 33%, transparent)',
                    }}
                >
                    <Plus size={13} /> {t('statusItems.add')}
                </button>
                <button
                    onClick={() =>
                        addItem({
                            id: newItemId(),
                            dp: '',
                            icon: 'mdi:motion-sensor-off',
                            iconInactive: 'mdi:motion-sensor',
                            label: t('statusItems.motionLockLabel'),
                            labelInactive: t('statusItems.motionLockLabelInactive'),
                            action: 'toggle',
                        })
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                    style={{
                        background: 'var(--app-surface)',
                        color: 'var(--accent)',
                        border: '1px dashed color-mix(in srgb, var(--accent) 33%, transparent)',
                    }}
                >
                    <AuraIcon icon="mdi:motion-sensor-off" width={13} height={13} /> {t('statusItems.addMotionLock')}
                </button>
            </div>
        </div>
    );
}
