/**
 * Editor fields for one menu extra (clock / datapoint / text / widget).
 *
 * The header, the tab bar and the section menu host the same element shapes, so
 * these fields are shared: before this existed the clock and datapoint blocks
 * were duplicated verbatim in TabBarSection and LayoutMenuSection, and the
 * header had no element list at all.
 */

import { useState } from 'react';
import { Search, Pencil, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useT } from '../../../../i18n';
import { AutoGrowTextarea } from './SettingControls';
import { DatapointPicker } from '../../../../components/config/DatapointPicker';
import { MenuWidgetEditDialog } from '../../../../components/config/MenuWidgetEditDialog';
import { useDashboardStore } from '../../../../store/dashboardStore';
import type { MenuItemContent } from '../../../../store/dashboardStore';
import {
    MENU_FRIENDLY_TYPES,
    MENU_WIDGET_DEFAULT_H,
    MENU_WIDGET_DEFAULT_W,
    makeMenuWidget,
    resolveMenuWidget,
} from '../../../../utils/menuItems';
import { WIDGET_BY_TYPE, WIDGET_REGISTRY } from '../../../../widgetRegistry';
import type { WidgetType } from '../../../../types';

const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

/**
 * Composite widgets keep their children in the RAM-only groupDefsStore, so an
 * item-owned instance of one would come back empty from a backup. Referencing a
 * group that lives on a dashboard is fine — that one is saved with its tab.
 */
const NO_OWN_INSTANCE = new Set<WidgetType>(['group', 'panels']);

function ChoiceRow<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { key: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex gap-1 flex-wrap">
            {options.map((o) => {
                const active = value === o.key;
                return (
                    <button
                        key={o.key}
                        onClick={() => onChange(o.key)}
                        className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{
                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </p>
    );
}

// ── Widget fields ────────────────────────────────────────────────────────────

function WidgetFields({
    item,
    onUpdate,
    variant,
}: {
    item: MenuItemContent;
    onUpdate: (patch: Partial<MenuItemContent>) => void;
    variant: 'bar' | 'block';
}) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const [search, setSearch] = useState('');
    const [showAllTypes, setShowAllTypes] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    const mode: 'own' | 'ref' = item.widget ? 'own' : 'ref';
    const resolved = resolveMenuWidget(item, layouts);

    const allWidgets = layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs.flatMap((tab) => tab.widgets)));
    const filtered = allWidgets
        .slice()
        .sort((a, b) => (a.title || a.type).localeCompare(b.title || b.type, 'de'))
        .filter((w) => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                (w.title || w.type).toLowerCase().includes(q) ||
                w.id.toLowerCase().includes(q) ||
                w.type.toLowerCase().includes(q)
            );
        });

    const typeList = (showAllTypes ? WIDGET_REGISTRY.filter((m) => !m.hidden).map((m) => m.type) : MENU_FRIENDLY_TYPES)
        .filter((ty) => !NO_OWN_INSTANCE.has(ty))
        .filter((ty) => WIDGET_BY_TYPE[ty]);

    return (
        <>
            <div>
                <FieldLabel>{t('menuItem.widget.source')}</FieldLabel>
                <ChoiceRow
                    value={mode}
                    options={[
                        { key: 'ref', label: t('menuItem.widget.sourceRef') },
                        { key: 'own', label: t('menuItem.widget.sourceOwn') },
                    ]}
                    onChange={(v) =>
                        v === 'own'
                            ? onUpdate({ widget: makeMenuWidget('value'), widgetId: undefined })
                            : onUpdate({ widget: undefined })
                    }
                />
            </div>

            {mode === 'ref' && (
                <div>
                    <FieldLabel>{t('menuItem.widget.pick')}</FieldLabel>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('menuItem.widget.searchPh')}
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none mb-1"
                        style={iSty}
                    />
                    <div style={{ ...iSty, padding: 4, maxHeight: 160, overflowY: 'auto', borderRadius: 8 }}>
                        {filtered.length === 0 && (
                            <div className="px-2 py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {t('menuItem.widget.noWidgets')}
                            </div>
                        )}
                        {filtered.map((w) => {
                            const active = item.widgetId === w.id;
                            return (
                                <div
                                    key={w.id}
                                    onClick={() => onUpdate({ widgetId: w.id })}
                                    className="grid gap-x-2 px-2 py-0.5 rounded text-xs cursor-pointer"
                                    style={{
                                        gridTemplateColumns: '1fr 80px',
                                        background: active ? 'var(--accent)' : 'transparent',
                                        color: active ? '#fff' : 'var(--text-primary)',
                                    }}
                                >
                                    <span className="truncate">{w.title || w.id}</span>
                                    <span className="truncate opacity-70">
                                        {WIDGET_BY_TYPE[w.type]?.shortLabel ?? w.type}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {item.widgetId && !resolved && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--accent-red, #ef4444)' }}>
                            {t('menuItem.widget.missing')}
                        </p>
                    )}
                </div>
            )}

            {mode === 'own' && (
                <div>
                    <FieldLabel>{t('menuItem.widget.type')}</FieldLabel>
                    <div className="flex gap-1 flex-wrap mb-2">
                        {typeList.map((ty) => {
                            const meta = WIDGET_BY_TYPE[ty];
                            const active = item.widget?.type === ty;
                            return (
                                <button
                                    key={ty}
                                    onClick={() => onUpdate({ widget: makeMenuWidget(ty) })}
                                    className="px-2 py-1 rounded-lg text-[11px] font-medium hover:opacity-80"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {meta.shortLabel}
                                </button>
                            );
                        })}
                    </div>
                    <label
                        className="flex items-center gap-1.5 text-[11px] cursor-pointer mb-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <input
                            type="checkbox"
                            checked={showAllTypes}
                            onChange={(e) => setShowAllTypes(e.target.checked)}
                        />
                        {t('menuItem.widget.showAll')}
                    </label>
                    <button
                        onClick={() => setEditOpen(true)}
                        disabled={!item.widget}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-40"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {item.widget ? <Pencil size={12} /> : <Plus size={12} />}
                        {t('menuItem.widget.configure')}
                    </button>
                    {editOpen && item.widget && (
                        <MenuWidgetEditDialog
                            item={item}
                            variant={variant}
                            onSave={(patch) => onUpdate(patch)}
                            onClose={() => setEditOpen(false)}
                        />
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <FieldLabel>{t('menuItem.widget.width')}</FieldLabel>
                    <input
                        type="number"
                        min={0}
                        max={1200}
                        value={item.widgetWidth ?? ''}
                        placeholder={variant === 'bar' ? String(MENU_WIDGET_DEFAULT_W.bar) : '100%'}
                        onChange={(e) =>
                            onUpdate({
                                widgetWidth: e.target.value ? Math.min(1200, Number(e.target.value)) : undefined,
                            })
                        }
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={iSty}
                    />
                </div>
                <div>
                    <FieldLabel>{t('menuItem.widget.height')}</FieldLabel>
                    <input
                        type="number"
                        min={0}
                        max={800}
                        value={item.widgetHeight ?? ''}
                        placeholder={String(MENU_WIDGET_DEFAULT_H[variant])}
                        onChange={(e) =>
                            onUpdate({
                                widgetHeight: e.target.value ? Math.min(800, Number(e.target.value)) : undefined,
                            })
                        }
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={iSty}
                    />
                </div>
            </div>
            <label
                className="flex items-center gap-1.5 text-[11px] cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
            >
                <input
                    type="checkbox"
                    checked={item.widgetCard ?? false}
                    onChange={(e) => onUpdate({ widgetCard: e.target.checked })}
                />
                {t('menuItem.widget.card')}
            </label>
        </>
    );
}

// ── All fields ───────────────────────────────────────────────────────────────

export function MenuItemFields({
    item,
    onUpdate,
    variant = 'bar',
}: {
    item: MenuItemContent;
    onUpdate: (patch: Partial<MenuItemContent>) => void;
    /** Shape of the host the item sits in — decides the widget slot defaults. */
    variant?: 'bar' | 'block';
}) {
    const t = useT();
    const [pickerOpen, setPickerOpen] = useState(false);

    if (item.type === 'clock') {
        return (
            <>
                <div>
                    <FieldLabel>{t('settings.tabBar.clockDisplay')}</FieldLabel>
                    <ChoiceRow
                        value={item.clockDisplay ?? 'time'}
                        options={[
                            { key: 'time', label: t('wf.clock.timeOnly') },
                            { key: 'date', label: t('wf.clock.dateOnly') },
                            { key: 'datetime', label: t('wf.clock.datetime') },
                        ]}
                        onChange={(v) => onUpdate({ clockDisplay: v })}
                    />
                </div>
                {(item.clockDisplay ?? 'time') !== 'date' && (
                    <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.tabBar.clockSeconds')}
                        </span>
                        <button
                            onClick={() => onUpdate({ clockShowSeconds: !item.clockShowSeconds })}
                            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                            style={{ background: item.clockShowSeconds ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: item.clockShowSeconds ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                )}
                {(item.clockDisplay ?? 'time') !== 'time' && (
                    <div>
                        <FieldLabel>{t('settings.tabBar.clockDateLen')}</FieldLabel>
                        <ChoiceRow
                            value={item.clockDateLength ?? 'short'}
                            options={[
                                { key: 'short', label: t('wf.clock.short') },
                                { key: 'long', label: t('wf.clock.long') },
                            ]}
                            onChange={(v) => onUpdate({ clockDateLength: v })}
                        />
                    </div>
                )}
                <div>
                    <FieldLabel>{t('settings.tabBar.clockCustom')}</FieldLabel>
                    <input
                        type="text"
                        value={item.clockCustomFormat ?? ''}
                        onChange={(e) => onUpdate({ clockCustomFormat: e.target.value || undefined })}
                        placeholder="HH:mm:ss"
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                        style={iSty}
                    />
                </div>
            </>
        );
    }

    if (item.type === 'datapoint') {
        return (
            <>
                <div>
                    <FieldLabel>{t('settings.tabBar.datapointId')}</FieldLabel>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={item.datapointId ?? ''}
                            onChange={(e) => onUpdate({ datapointId: e.target.value || undefined })}
                            placeholder="hm-rpc.0.ABC.1.TEMPERATURE"
                            className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                            style={iSty}
                        />
                        <button
                            onClick={() => setPickerOpen(true)}
                            title={t('dp.picker.title')}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <Search size={13} />
                        </button>
                    </div>
                    {pickerOpen && (
                        <DatapointPicker
                            currentValue={item.datapointId ?? ''}
                            onSelect={(id) => onUpdate({ datapointId: id || undefined })}
                            onClose={() => setPickerOpen(false)}
                        />
                    )}
                </div>
                <div>
                    <FieldLabel>{t('settings.tabBar.datapointTemplate')}</FieldLabel>
                    <AutoGrowTextarea
                        value={item.datapointTemplate ?? ''}
                        onChange={(v) => onUpdate({ datapointTemplate: v || undefined })}
                        placeholder="{dp} °C"
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                        style={iSty}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        {t('settings.tabBar.datapointTemplateHint')}
                    </p>
                </div>
            </>
        );
    }

    if (item.type === 'widget') {
        return <WidgetFields item={item} onUpdate={onUpdate} variant={variant} />;
    }

    return (
        <div>
            <FieldLabel>{t('settings.tabBar.staticText')}</FieldLabel>
            <input
                type="text"
                value={item.text ?? ''}
                onChange={(e) => onUpdate({ text: e.target.value || undefined })}
                placeholder="Mein Dashboard"
                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={iSty}
            />
        </div>
    );
}

/** i18n key of the type label shown in an element's collapsed row. */
export function menuItemTypeLabelKey(type: MenuItemContent['type']) {
    return type === 'clock'
        ? ('settings.tabBar.itemTypeClock' as const)
        : type === 'datapoint'
          ? ('settings.tabBar.itemTypeDatapoint' as const)
          : type === 'widget'
            ? ('settings.tabBar.itemTypeWidget' as const)
            : ('settings.tabBar.itemTypeText' as const);
}

// ── Collapsible editor row ───────────────────────────────────────────────────

/**
 * One element in an admin element list: position toggles, reorder arrows, a
 * remove button and the collapsed/expanded fields. The tab bar and the section
 * menu keep their own rows (they carry extra per-host controls); the header uses
 * this one.
 */
export function MenuItemRow<T extends MenuItemContent & { position: string }>({
    item,
    positions,
    onUpdate,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
    variant = 'bar',
}: {
    item: T;
    positions: { key: T['position']; label: string }[];
    onUpdate: (patch: Partial<T>) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    variant?: 'bar' | 'block';
}) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <div className="flex gap-0.5 shrink-0">
                    {positions.map((pos) => {
                        const active = item.position === pos.key;
                        return (
                            <button
                                key={pos.key}
                                onClick={() => onUpdate({ position: pos.key } as Partial<T>)}
                                className="px-1.5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-surface)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {pos.label}
                            </button>
                        );
                    })}
                </div>
                <span className="text-xs flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t(menuItemTypeLabelKey(item.type))}
                </span>
                <button
                    onClick={() => onMove(-1)}
                    disabled={!canMoveUp}
                    title={t('common.moveUp')}
                    className="shrink-0 disabled:opacity-25 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowUp size={12} />
                </button>
                <button
                    onClick={() => onMove(1)}
                    disabled={!canMoveDown}
                    title={t('common.moveDown')}
                    className="shrink-0 disabled:opacity-25 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowDown size={12} />
                </button>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {expanded ? '▲' : '▼'}
                </button>
                <button onClick={onRemove} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                    <X size={13} />
                </button>
            </div>
            {expanded && (
                <div className="px-2 py-2 space-y-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
                    <MenuItemFields
                        item={item}
                        onUpdate={onUpdate as (patch: Partial<MenuItemContent>) => void}
                        variant={variant}
                    />
                </div>
            )}
        </div>
    );
}
