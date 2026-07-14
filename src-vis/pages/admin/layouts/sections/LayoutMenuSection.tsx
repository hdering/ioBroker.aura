import { useState } from 'react';
import { Plus, X, Search } from 'lucide-react';
import type { LayoutMenuItem, LayoutSettings } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';
import { ToggleRow, SubGroup } from '../shared/SettingControls';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { DatapointPicker } from '../../../../components/config/DatapointPicker';

// layoutDrawer* keys reset together by the per-scope "reset" button.
const DRAWER_KEYS: (keyof LayoutSettings)[] = [
    'layoutDrawerEnabled',
    'layoutDrawerShowSingle',
    'layoutDrawerSize',
    'layoutDrawerAutoHide',
    'layoutDrawerPlacement',
    'layoutDrawerWidth',
    'layoutDrawerTopOffset',
    'layoutDrawerBottomOffset',
    'layoutDrawerShowTitle',
    'layoutDrawerTitle',
    'layoutDrawerTitleMarginTop',
    'layoutDrawerTitleMarginBottom',
    'layoutDrawerEntryStyle',
    'layoutDrawerEntryHeight',
    'layoutDrawerIndicatorStyle',
    'layoutDrawerFontSize',
    'layoutDrawerIconSize',
    'layoutDrawerBarAlignment',
    'layoutDrawerHideMobileScrollbar',
    'layoutDrawerItems',
];

// ── LayoutMenuItemRow ─────────────────────────────────────────────────────────
// Editor row for one extra menu element (clock / datapoint / text). Mirrors the
// tab-bar item editor, but the position toggle is top / bottom instead of L/M/R.

function LayoutMenuItemRow({
    item,
    onUpdate,
    onRemove,
    t,
}: {
    item: LayoutMenuItem;
    onUpdate: (patch: Partial<LayoutMenuItem>) => void;
    onRemove: () => void;
    t: ReturnType<typeof useT>;
}) {
    const [expanded, setExpanded] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const posLabels: Record<'top' | 'bottom', string> = {
        top: t('settings.frontend.layoutDrawerItemPosTop'),
        bottom: t('settings.frontend.layoutDrawerItemPosBottom'),
    };
    const typeLabel =
        item.type === 'clock'
            ? t('settings.tabBar.itemTypeClock')
            : item.type === 'datapoint'
              ? t('settings.tabBar.itemTypeDatapoint')
              : t('settings.tabBar.itemTypeText');

    const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <div className="flex gap-0.5 shrink-0">
                    {(['top', 'bottom'] as const).map((pos) => (
                        <button
                            key={pos}
                            onClick={() => onUpdate({ position: pos })}
                            className="px-1.5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
                            style={{
                                background: item.position === pos ? 'var(--accent)' : 'var(--app-surface)',
                                color: item.position === pos ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${item.position === pos ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {posLabels[pos]}
                        </button>
                    ))}
                </div>
                <span className="text-xs flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {typeLabel}
                </span>
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
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.frontend.layoutDrawerItemMarginTop')}
                            </p>
                            <input
                                type="number"
                                min={0}
                                max={200}
                                value={item.marginTop ?? 0}
                                onChange={(e) =>
                                    onUpdate({ marginTop: Math.min(200, Math.max(0, parseInt(e.target.value) || 0)) })
                                }
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={iSty}
                            />
                        </div>
                        <div>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.frontend.layoutDrawerItemMarginBottom')}
                            </p>
                            <input
                                type="number"
                                min={0}
                                max={200}
                                value={item.marginBottom ?? 0}
                                onChange={(e) =>
                                    onUpdate({
                                        marginBottom: Math.min(200, Math.max(0, parseInt(e.target.value) || 0)),
                                    })
                                }
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={iSty}
                            />
                        </div>
                    </div>
                    {item.type === 'clock' && (
                        <>
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.clockDisplay')}
                                </p>
                                <div className="flex gap-1 flex-wrap">
                                    {(['time', 'date', 'datetime'] as const).map((v) => {
                                        const labels = {
                                            time: t('wf.clock.timeOnly'),
                                            date: t('wf.clock.dateOnly'),
                                            datetime: t('wf.clock.datetime'),
                                        };
                                        const active = (item.clockDisplay ?? 'time') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => onUpdate({ clockDisplay: v })}
                                                className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {labels[v]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {(item.clockDisplay ?? 'time') !== 'date' && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.tabBar.clockSeconds')}
                                    </span>
                                    <button
                                        onClick={() => onUpdate({ clockShowSeconds: !item.clockShowSeconds })}
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{
                                            background: item.clockShowSeconds ? 'var(--accent)' : 'var(--app-border)',
                                        }}
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
                                    <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.tabBar.clockDateLen')}
                                    </p>
                                    <div className="flex gap-1">
                                        {(['short', 'long'] as const).map((v) => {
                                            const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                                            const active = (item.clockDateLength ?? 'short') === v;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => onUpdate({ clockDateLength: v })}
                                                    className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                    style={{
                                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                        color: active ? '#fff' : 'var(--text-secondary)',
                                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                    }}
                                                >
                                                    {labels[v]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.clockCustom')}
                                </p>
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
                    )}
                    {item.type === 'datapoint' && (
                        <>
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.datapointId')}
                                </p>
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
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.datapointTemplate')}
                                </p>
                                <textarea
                                    rows={2}
                                    value={item.datapointTemplate ?? ''}
                                    onChange={(e) => onUpdate({ datapointTemplate: e.target.value || undefined })}
                                    placeholder="<b>{dp}</b> °C"
                                    className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono resize-y"
                                    style={iSty}
                                />
                                <p
                                    className="text-[10px] mt-1"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                >
                                    {t('settings.tabBar.datapointTemplateHint')}
                                </p>
                            </div>
                        </>
                    )}
                    {item.type === 'text' && (
                        <div>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.tabBar.staticText')}
                            </p>
                            <input
                                type="text"
                                value={item.text ?? ''}
                                onChange={(e) => onUpdate({ text: e.target.value || undefined })}
                                placeholder="Mein Dashboard"
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={iSty}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Global layout menu (hamburger) configuration. Extracted from the former
// FrontendSection into its own prominent Design sub-tab: the enable toggle sits at
// the top and all options render directly below it (no nested SubGroup).
export function LayoutMenuSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, setPatch, clear, level } = useLayoutSetting(contextId);

    // Effective view + patch-writer so the existing markup keeps working while
    // reads/writes route to the active scope (global or per layout).
    const frontend = {
        layoutDrawerEnabled: eff('layoutDrawerEnabled')[0],
        layoutDrawerShowSingle: eff('layoutDrawerShowSingle')[0],
        layoutDrawerSize: eff('layoutDrawerSize')[0],
        layoutDrawerAutoHide: eff('layoutDrawerAutoHide')[0],
        layoutDrawerPlacement: eff('layoutDrawerPlacement')[0],
        layoutDrawerWidth: eff('layoutDrawerWidth')[0],
        layoutDrawerTopOffset: eff('layoutDrawerTopOffset')[0],
        layoutDrawerBottomOffset: eff('layoutDrawerBottomOffset')[0],
        layoutDrawerShowTitle: eff('layoutDrawerShowTitle')[0],
        layoutDrawerTitle: eff('layoutDrawerTitle')[0],
        layoutDrawerTitleMarginTop: eff('layoutDrawerTitleMarginTop')[0],
        layoutDrawerTitleMarginBottom: eff('layoutDrawerTitleMarginBottom')[0],
        layoutDrawerEntryStyle: eff('layoutDrawerEntryStyle')[0],
        layoutDrawerEntryHeight: eff('layoutDrawerEntryHeight')[0],
        layoutDrawerIndicatorStyle: eff('layoutDrawerIndicatorStyle')[0],
        layoutDrawerFontSize: eff('layoutDrawerFontSize')[0],
        layoutDrawerIconSize: eff('layoutDrawerIconSize')[0],
        layoutDrawerBarAlignment: eff('layoutDrawerBarAlignment')[0],
        layoutDrawerHideMobileScrollbar: eff('layoutDrawerHideMobileScrollbar')[0],
        layoutDrawerItems: eff('layoutDrawerItems')[0],
        showHeader: eff('showHeader')[0],
    };
    const updateFrontend = (patch: Partial<LayoutSettings>) => setPatch(patch);
    const overridden = level !== 'global' && DRAWER_KEYS.some((k) => eff(k as 'layoutDrawerEnabled')[1]);

    const items = frontend.layoutDrawerItems ?? [];
    const updateItem = (id: string, patch: Partial<LayoutMenuItem>) => {
        updateFrontend({ layoutDrawerItems: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
    };
    const removeItem = (id: string) => {
        updateFrontend({ layoutDrawerItems: items.filter((it) => it.id !== id) });
    };
    const addItem = (type: LayoutMenuItem['type']) => {
        const newItem: LayoutMenuItem = {
            id: `lmi-${Date.now()}`,
            type,
            position: 'top',
            ...(type === 'clock' ? { clockDisplay: 'datetime' as const } : {}),
        };
        updateFrontend({ layoutDrawerItems: [...items, newItem] });
    };

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.menu')}
                </h2>
                {overridden && (
                    <button
                        onClick={() => DRAWER_KEYS.forEach((k) => clear(k))}
                        className="text-[10px] px-2 py-0.5 rounded-full hover:opacity-80"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        title={t('layouts.scope.resetHint')}
                    >
                        {t('layouts.scope.reset')}
                    </button>
                )}
            </div>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.menu.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.layoutDrawer')}
                hint={t('settings.frontend.layoutDrawerHint')}
                value={frontend.layoutDrawerEnabled ?? false}
                onChange={(v) => updateFrontend({ layoutDrawerEnabled: v })}
            />
            {frontend.layoutDrawerEnabled && (
                <div className="space-y-3 pt-1">
                    <ToggleRow
                        label={t('settings.frontend.layoutDrawerShowSingle')}
                        hint={t('settings.frontend.layoutDrawerShowSingleHint')}
                        value={frontend.layoutDrawerShowSingle ?? false}
                        onChange={(v) => updateFrontend({ layoutDrawerShowSingle: v })}
                    />
                    <ToggleRow
                        label={t('settings.frontend.layoutDrawerShowTitle')}
                        value={frontend.layoutDrawerShowTitle ?? true}
                        onChange={(v) => updateFrontend({ layoutDrawerShowTitle: v })}
                    />
                    {(frontend.layoutDrawerShowTitle ?? true) && (
                        <SubGroup>
                            <div>
                                <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.frontend.layoutDrawerTitle')}
                                </p>
                                <input
                                    type="text"
                                    value={frontend.layoutDrawerTitle ?? ''}
                                    onChange={(e) => updateFrontend({ layoutDrawerTitle: e.target.value })}
                                    placeholder={t('layoutDrawer.title')}
                                    className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.layoutDrawerItemMarginTop')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            max={200}
                                            value={frontend.layoutDrawerTitleMarginTop ?? 0}
                                            onChange={(e) =>
                                                updateFrontend({
                                                    layoutDrawerTitleMarginTop: Math.min(
                                                        200,
                                                        Math.max(0, parseInt(e.target.value) || 0),
                                                    ),
                                                })
                                            }
                                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            px
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.layoutDrawerItemMarginBottom')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            max={200}
                                            value={frontend.layoutDrawerTitleMarginBottom ?? 0}
                                            onChange={(e) =>
                                                updateFrontend({
                                                    layoutDrawerTitleMarginBottom: Math.min(
                                                        200,
                                                        Math.max(0, parseInt(e.target.value) || 0),
                                                    ),
                                                })
                                            }
                                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            px
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </SubGroup>
                    )}
                    {/* Placement decides the menu type first (floating / tab-bar / docked sidebar). */}
                    <div>
                        <p className="text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.frontend.layoutDrawerPlacement')}
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                            {(['floating', 'tabbar', 'sidebar', 'top', 'bottom'] as const).map((v) => {
                                const labels = {
                                    floating: t('settings.frontend.layoutDrawerPlacementFloating'),
                                    tabbar: t('settings.frontend.layoutDrawerPlacementTabbar'),
                                    sidebar: t('settings.frontend.layoutDrawerPlacementSidebar'),
                                    top: t('settings.frontend.layoutDrawerPlacementTop'),
                                    bottom: t('settings.frontend.layoutDrawerPlacementBottom'),
                                };
                                const active = (frontend.layoutDrawerPlacement ?? 'floating') === v;
                                const autoHide = frontend.layoutDrawerAutoHide ?? false;
                                let disabledReason: string | undefined;
                                // Docked placements (sidebar / top / bottom) work with or without the
                                // header — only the hamburger placements are hidden while it shows.
                                if ((v === 'floating' || v === 'tabbar') && frontend.showHeader) {
                                    disabledReason = t('settings.frontend.layoutDrawerPlacementDisabledHeader');
                                } else if (v === 'tabbar' && autoHide) {
                                    disabledReason = t('settings.frontend.layoutDrawerPlacementTabbarDisabledAutoHide');
                                }
                                const disabled = !!disabledReason;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => {
                                            if (!disabled) updateFrontend({ layoutDrawerPlacement: v });
                                        }}
                                        disabled={disabled}
                                        title={disabledReason}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium ${disabled ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            opacity: disabled ? 0.4 : 1,
                                        }}
                                    >
                                        {labels[v]}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                            {t('settings.frontend.layoutDrawerPlacementHint')}
                        </p>
                    </div>
                    {/* Placement-dependent options as an indented sub-group directly under the
                        placement chooser — makes clear which settings depend on the chosen placement.
                        Docked bar placements (top / bottom) have no extra options, so the group is
                        omitted for them to avoid a dangling accent rail. */}
                    {(frontend.layoutDrawerPlacement ?? 'floating') !== 'top' &&
                        (frontend.layoutDrawerPlacement ?? 'floating') !== 'bottom' && (
                            <SubGroup>
                                {((frontend.layoutDrawerPlacement ?? 'floating') === 'floating' ||
                                    (frontend.layoutDrawerPlacement ?? 'floating') === 'tabbar') && (
                                    <>
                                        <p
                                            className="text-[11px] font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {t('settings.frontend.layoutDrawerHamburger')}
                                        </p>
                                        <div>
                                            <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('settings.frontend.layoutDrawerSize')}
                                            </p>
                                            <div className="flex gap-1.5">
                                                {(['sm', 'md', 'lg'] as const).map((v) => {
                                                    const labels = {
                                                        sm: t('common.sizeSmall'),
                                                        md: t('common.sizeMedium'),
                                                        lg: t('common.sizeLarge'),
                                                    };
                                                    const active = (frontend.layoutDrawerSize ?? 'md') === v;
                                                    return (
                                                        <button
                                                            key={v}
                                                            onClick={() => updateFrontend({ layoutDrawerSize: v })}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                            style={{
                                                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                                color: active ? '#fff' : 'var(--text-secondary)',
                                                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                            }}
                                                        >
                                                            {labels[v]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <ToggleRow
                                            label={t('settings.frontend.layoutDrawerAutoHide')}
                                            value={frontend.layoutDrawerAutoHide ?? false}
                                            onChange={(v) => updateFrontend({ layoutDrawerAutoHide: v })}
                                        />
                                        <p
                                            className="text-[10px]"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            {t('settings.frontend.layoutDrawerAutoHideHint')}
                                        </p>
                                    </>
                                )}
                                {frontend.layoutDrawerPlacement === 'sidebar' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('settings.frontend.layoutDrawerWidth')}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={120}
                                                    max={600}
                                                    value={frontend.layoutDrawerWidth ?? 240}
                                                    onChange={(e) => {
                                                        const v = Math.min(
                                                            600,
                                                            Math.max(120, parseInt(e.target.value) || 240),
                                                        );
                                                        updateFrontend({ layoutDrawerWidth: v });
                                                    }}
                                                    className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-primary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                />
                                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                    px
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('settings.frontend.layoutDrawerTopOffset')}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={400}
                                                    value={frontend.layoutDrawerTopOffset ?? 0}
                                                    onChange={(e) => {
                                                        const v = Math.min(
                                                            400,
                                                            Math.max(0, parseInt(e.target.value) || 0),
                                                        );
                                                        updateFrontend({ layoutDrawerTopOffset: v });
                                                    }}
                                                    className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-primary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                />
                                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                    px
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('settings.frontend.layoutDrawerBottomOffset')}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={400}
                                                    value={frontend.layoutDrawerBottomOffset ?? 0}
                                                    onChange={(e) => {
                                                        const v = Math.min(
                                                            400,
                                                            Math.max(0, parseInt(e.target.value) || 0),
                                                        );
                                                        updateFrontend({ layoutDrawerBottomOffset: v });
                                                    }}
                                                    className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-primary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                />
                                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                    px
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </SubGroup>
                        )}
                    {/* Bar-only options (placement top / bottom): the section bar mirrors the
                        tab bar, so it exposes the same alignment + hide-mobile-scrollbar controls. */}
                    {((frontend.layoutDrawerPlacement ?? 'floating') === 'top' ||
                        (frontend.layoutDrawerPlacement ?? 'floating') === 'bottom') && (
                        <SubGroup>
                            <div>
                                <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.tabsAlignment')}
                                </p>
                                <div className="flex gap-1.5">
                                    {(['left', 'center', 'right'] as const).map((v) => {
                                        const labels = {
                                            left: t('settings.tabBar.alignLeft'),
                                            center: t('settings.tabBar.alignCenter'),
                                            right: t('settings.tabBar.alignRight'),
                                        };
                                        const active = (frontend.layoutDrawerBarAlignment ?? 'left') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => updateFrontend({ layoutDrawerBarAlignment: v })}
                                                className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {labels[v]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <ToggleRow
                                label={t('settings.tabBar.hideMobileScrollbar')}
                                value={frontend.layoutDrawerHideMobileScrollbar ?? false}
                                onChange={(v) => updateFrontend({ layoutDrawerHideMobileScrollbar: v })}
                            />
                            <div>
                                <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.frontend.layoutDrawerIndicatorStyle')}
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {(['text', 'underline', 'filled', 'pills'] as const).map((v) => {
                                        const labels = {
                                            text: t('settings.tabBar.styleText'),
                                            underline: t('settings.tabBar.styleUnderline'),
                                            filled: t('settings.tabBar.styleFilled'),
                                            pills: t('settings.tabBar.stylePills'),
                                        };
                                        const active = (frontend.layoutDrawerIndicatorStyle ?? 'filled') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => updateFrontend({ layoutDrawerIndicatorStyle: v })}
                                                className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {labels[v]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Size fields side by side */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.layoutDrawerFontSize')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={10}
                                            max={28}
                                            value={frontend.layoutDrawerFontSize ?? 14}
                                            onChange={(e) => {
                                                const v = Math.min(28, Math.max(10, parseInt(e.target.value) || 14));
                                                updateFrontend({ layoutDrawerFontSize: v });
                                            }}
                                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            px
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.layoutDrawerIconSize')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={10}
                                            max={40}
                                            value={frontend.layoutDrawerIconSize ?? 16}
                                            onChange={(e) => {
                                                const v = Math.min(40, Math.max(10, parseInt(e.target.value) || 16));
                                                updateFrontend({ layoutDrawerIconSize: v });
                                            }}
                                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            px
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.layoutDrawerEntryHeight')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={32}
                                            max={120}
                                            value={frontend.layoutDrawerEntryHeight ?? 48}
                                            onChange={(e) => {
                                                const v = Math.min(120, Math.max(32, parseInt(e.target.value) || 48));
                                                updateFrontend({ layoutDrawerEntryHeight: v });
                                            }}
                                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                                            style={{
                                                background: 'var(--app-bg)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            px
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </SubGroup>
                    )}
                    <div>
                        <p className="text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.frontend.layoutDrawerEntryStyle')}
                        </p>
                        <div className="flex gap-1.5">
                            {(['iconAndName', 'iconOnly', 'nameOnly', 'bulletAndName'] as const).map((v) => {
                                const labels = {
                                    iconAndName: t('settings.frontend.layoutDrawerEntryStyleIconAndName'),
                                    iconOnly: t('settings.frontend.layoutDrawerEntryStyleIconOnly'),
                                    nameOnly: t('settings.frontend.layoutDrawerEntryStyleNameOnly'),
                                    bulletAndName: t('settings.frontend.layoutDrawerEntryStyleBulletAndName'),
                                };
                                const active = (frontend.layoutDrawerEntryStyle ?? 'iconAndName') === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => updateFrontend({ layoutDrawerEntryStyle: v })}
                                        className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {labels[v]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
                        <p className="text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.frontend.layoutDrawerItems')}
                        </p>
                        <div className="space-y-1.5">
                            {items.map((item) => (
                                <LayoutMenuItemRow
                                    key={item.id}
                                    item={item}
                                    onUpdate={(patch) => updateItem(item.id, patch)}
                                    onRemove={() => removeItem(item.id)}
                                    t={t}
                                />
                            ))}
                        </div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                            {(['clock', 'datapoint', 'text'] as const).map((type) => {
                                const label =
                                    type === 'clock'
                                        ? t('settings.tabBar.itemTypeClock')
                                        : type === 'datapoint'
                                          ? t('settings.tabBar.itemTypeDatapoint')
                                          : t('settings.tabBar.itemTypeText');
                                return (
                                    <button
                                        key={type}
                                        onClick={() => addItem(type)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <Plus size={11} /> {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
