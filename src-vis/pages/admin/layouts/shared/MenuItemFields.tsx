/**
 * Editor fields for one menu extra (clock / datapoint / text / widget).
 *
 * The header, the tab bar and the section menu host the same element shapes, so
 * these fields are shared: before this existed the clock and datapoint blocks
 * were duplicated verbatim in TabBarSection and LayoutMenuSection, and the
 * header had no element list at all.
 */

import { useRef, useState } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useT } from '../../../../i18n';
import { AutoGrowTextarea } from './SettingControls';
import { DatapointPicker } from '../../../../components/config/DatapointPicker';
import { useDashboardStore } from '../../../../store/dashboardStore';
import type { MenuItemContent } from '../../../../store/dashboardStore';
import { useConfigStore } from '../../../../store/configStore';
import { createThrottle } from '../../../../utils/throttleCommit';
import {
    MENU_FRIENDLY_TYPES,
    MENU_WIDGET_DEFAULT_H,
    MENU_WIDGET_DEFAULT_W,
    MENU_WIDGET_MAX_H,
    MENU_WIDGET_MAX_W,
    MENU_WIDGET_MIN_PX,
    makeMenuWidget,
    menuWidgetDefaultSize,
    resolveMenuWidget,
} from '../../../../utils/menuItems';
import { MenuWidgetSlot } from '../../../../components/layout/MenuWidgetSlot';
import { IDLE_RETURN_DEFAULT_MINUTES } from '../../../../components/layout/MenuItemView';
import { ActiveLayoutContext } from '../../../../contexts/ActiveLayoutContext';
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

/**
 * The element's slot at exactly the size it gets in the menu — and the size
 * control itself (#634).
 *
 * The box is dragged by its bottom-right corner, the way a widget is resized on
 * the dashboard grid; here the box is px rather than cells, so it is
 * pixel-precise. This replaced the width/height number fields: two numbers to
 * guess at for a box that is right there on screen.
 *
 * While dragging, the size lives in local state and only the throttled copy goes
 * into the config — a pointer move fires ~60×/s and every one of them would
 * serialize the whole dashboard (see utils/throttleCommit).
 */
function WidgetSizeBox({
    item,
    type,
    variant,
    editMode,
    onUpdate,
}: {
    item: MenuItemContent;
    /** Type of the widget on screen — the reset goes back to its default box. */
    type: WidgetType | undefined;
    variant: 'bar' | 'block';
    editMode: boolean;
    onUpdate: (patch: Partial<MenuItemContent>) => void;
}) {
    const t = useT();
    const grid = useConfigStore((s) => s.frontend);
    const boxRef = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<{ w: number; h: number } | null>(null);
    // The throttle outlives the render that made it, so it must not close over
    // that render's onUpdate.
    const latest = useRef(onUpdate);
    latest.current = onUpdate;
    const commit = useRef(createThrottle<Partial<MenuItemContent>>((p) => latest.current(p), 60)).current;

    const clamp = (v: number, max: number) => Math.max(MENU_WIDGET_MIN_PX, Math.min(max, Math.round(v)));

    const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const box = boxRef.current;
        if (!box) return;
        e.preventDefault();
        e.stopPropagation();
        // Measure instead of reading the item: a block slot has no stored width
        // and is as wide as its host, and dragging has to start from what the
        // user sees.
        const rect = box.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);

        const move = (ev: PointerEvent) => {
            const next = {
                w: clamp(start.w + ev.clientX - start.x, MENU_WIDGET_MAX_W),
                h: clamp(start.h + ev.clientY - start.y, MENU_WIDGET_MAX_H),
            };
            setDrag(next);
            commit.push({ widgetWidth: next.w, widgetHeight: next.h });
        };
        const end = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            commit.flush();
            setDrag(null);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    // Live size wins over the stored one so the box follows the pointer even
    // though the config only sees every 60ms.
    const shown = drag ? { ...item, widgetWidth: drag.w, widgetHeight: drag.h } : item;
    const readW = drag?.w ?? item.widgetWidth ?? (variant === 'bar' ? MENU_WIDGET_DEFAULT_W.bar : undefined);
    const readH = drag?.h ?? item.widgetHeight ?? MENU_WIDGET_DEFAULT_H[variant];

    return (
        <div>
            <FieldLabel>{t('menuItem.widget.preview')}</FieldLabel>
            <div
                className="rounded-lg p-4 flex items-start"
                style={{ background: 'var(--app-bg)', border: '1px dashed var(--app-border)', overflow: 'auto' }}
            >
                <div
                    ref={boxRef}
                    style={{
                        position: 'relative',
                        display: variant === 'bar' ? 'inline-block' : 'block',
                        width: variant === 'bar' ? undefined : '100%',
                        flexShrink: 0,
                    }}
                >
                    {/* The element's own slot, not a lookalike, so the admin and
                        the bar can never drift apart. In `own` mode it carries the
                        widget's edit chrome, so its options panel opens right
                        here. */}
                    <ActiveLayoutContext.Provider value="">
                        <MenuWidgetSlot
                            item={shown}
                            variant={variant}
                            editMode={editMode}
                            onWidgetChange={(w) => onUpdate({ widget: w })}
                        />
                    </ActiveLayoutContext.Provider>
                    <div
                        onPointerDown={startDrag}
                        title={t('menuItem.widget.sizeDrag')}
                        className="aura-menu-size-handle"
                        data-aura-menu-size-handle=""
                        style={{
                            position: 'absolute',
                            right: -5,
                            bottom: -5,
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: 'var(--accent)',
                            border: '2px solid var(--app-bg)',
                            cursor: 'nwse-resize',
                            touchAction: 'none',
                            zIndex: 2,
                        }}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {readW ?? t('menuItem.widget.sizeAuto')} × {readH} px
                </span>
                {(item.widgetWidth !== undefined || item.widgetHeight !== undefined) && (
                    <button
                        onClick={() => onUpdate(menuWidgetDefaultSize(type, variant, grid))}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    >
                        {t('menuItem.widget.sizeReset')}
                    </button>
                )}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {t(editMode ? 'menuItem.widget.previewHintOwn' : 'menuItem.widget.previewHintRef')}
            </p>
        </div>
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
    const grid = useConfigStore((s) => s.frontend);
    const [search, setSearch] = useState('');
    const [showAllTypes, setShowAllTypes] = useState(false);

    const mode: 'own' | 'ref' = item.widget ? 'own' : 'ref';
    const resolved = resolveMenuWidget(item, layouts);
    // Layouts are per widget type, so the picker needs the type actually on
    // screen — the referenced widget's, or the item's own instance's.
    const shownType = resolved?.widget.type;

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

    // Alphabetical by the label on the button, in both lists — the registry order
    // is a maintenance order, and MENU_FRIENDLY_TYPES groups by what fits a bar;
    // neither is an order anybody can scan for a name.
    const typeList = (showAllTypes ? WIDGET_REGISTRY.filter((m) => !m.hidden).map((m) => m.type) : MENU_FRIENDLY_TYPES)
        .filter((ty) => !NO_OWN_INSTANCE.has(ty))
        .filter((ty) => WIDGET_BY_TYPE[ty])
        .sort((a, b) => WIDGET_BY_TYPE[a].shortLabel.localeCompare(WIDGET_BY_TYPE[b].shortLabel, 'de'));

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
                            ? onUpdate({
                                  widget: makeMenuWidget('value'),
                                  widgetId: undefined,
                                  ...menuWidgetDefaultSize('value', variant, grid),
                              })
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
                                    onClick={() =>
                                        // A picked widget starts at the box it has
                                        // on the dashboard (#634); its layout is the
                                        // one it carries there.
                                        onUpdate({ widgetId: w.id, ...menuWidgetDefaultSize(w.type, variant, grid) })
                                    }
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
                                    onClick={() =>
                                        onUpdate({
                                            widget: makeMenuWidget(ty),
                                            ...menuWidgetDefaultSize(ty, variant, grid),
                                        })
                                    }
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
                </div>
            )}

            {/* No layout picker here: the layout belongs to the widget and is set
                in its own options — on the original for a reference, through the
                preview's edit chrome for an own instance. */}

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

            {resolved && (
                <WidgetSizeBox
                    item={item}
                    type={shownType}
                    variant={variant}
                    editMode={mode === 'own'}
                    onUpdate={onUpdate}
                />
            )}
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

    if (item.type === 'idleReturn') {
        return (
            <div>
                <FieldLabel>{t('menuItem.idleReturn.minutes')}</FieldLabel>
                <input
                    type="number"
                    min={1}
                    max={1440}
                    value={item.idleReturnMinutes ?? IDLE_RETURN_DEFAULT_MINUTES}
                    onChange={(e) =>
                        onUpdate({
                            idleReturnMinutes: Math.max(1, Math.min(1440, Number(e.target.value) || 1)),
                        })
                    }
                    className="w-24 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                    style={iSty}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {t('menuItem.idleReturn.minutesHint')}
                </p>
            </div>
        );
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
            : type === 'idleReturn'
              ? ('settings.tabBar.itemTypeIdleReturn' as const)
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
    defaultExpanded = false,
}: {
    item: T;
    positions: { key: T['position']; label: string }[];
    onUpdate: (patch: Partial<T>) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    variant?: 'bar' | 'block';
    /** A just-added element opens itself — nothing to configure while closed. */
    defaultExpanded?: boolean;
}) {
    const t = useT();
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {/* The whole strip toggles, not just the caret — the caret is a 12px
                target for what the entire row is about. The controls on it stop
                the click so they keep doing their own job. */}
            <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                style={{ background: 'var(--app-bg)' }}
                onClick={() => setExpanded((e) => !e)}
                data-aura-menu-row-head={item.type}
            >
                <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                    onClick={(e) => {
                        e.stopPropagation();
                        onMove(-1);
                    }}
                    disabled={!canMoveUp}
                    title={t('common.moveUp')}
                    className="shrink-0 disabled:opacity-25 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowUp size={12} />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onMove(1);
                    }}
                    disabled={!canMoveDown}
                    title={t('common.moveDown')}
                    className="shrink-0 disabled:opacity-25 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowDown size={12} />
                </button>
                <span className="text-[10px] px-1.5 py-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {expanded ? '▲' : '▼'}
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="hover:opacity-70 shrink-0"
                    style={{ color: 'var(--accent-red)' }}
                >
                    <X size={13} />
                </button>
            </div>
            {expanded && (
                <div
                    className="px-2 py-2 space-y-2 border-t"
                    style={{ borderColor: 'var(--app-border)' }}
                    data-aura-menu-row-fields=""
                >
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
