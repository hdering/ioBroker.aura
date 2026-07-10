import { useConfigStore } from '../../../../store/configStore';
import { useT } from '../../../../i18n';
import { ToggleRow } from '../shared/SettingControls';

// Global layout menu (hamburger) configuration. Extracted from the former
// FrontendSection into its own prominent Design sub-tab: the enable toggle sits at
// the top and all options render directly below it (no nested SubGroup).
export function LayoutMenuSection() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('layouts.subtab.menu')}
            </h2>
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
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.layoutDrawerAutoHideHint')}
                    </p>
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.layoutDrawerPlacement')}
                        </p>
                        <div className="flex gap-1.5">
                            {(['floating', 'tabbar', 'sidebar'] as const).map((v) => {
                                const labels = {
                                    floating: t('settings.frontend.layoutDrawerPlacementFloating'),
                                    tabbar: t('settings.frontend.layoutDrawerPlacementTabbar'),
                                    sidebar: t('settings.frontend.layoutDrawerPlacementSidebar'),
                                };
                                const active = (frontend.layoutDrawerPlacement ?? 'floating') === v;
                                const autoHide = frontend.layoutDrawerAutoHide ?? false;
                                let disabledReason: string | undefined;
                                // 'sidebar' is a docked menu that works with or without the header — never disabled.
                                if (v !== 'sidebar' && frontend.showHeader) {
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
                    {frontend.layoutDrawerPlacement === 'sidebar' && (
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
                                        const v = Math.min(600, Math.max(120, parseInt(e.target.value) || 240));
                                        updateFrontend({ layoutDrawerWidth: v });
                                    }}
                                    className="w-24 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
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
                    )}
                    <ToggleRow
                        label={t('settings.frontend.layoutDrawerShowTitle')}
                        value={frontend.layoutDrawerShowTitle ?? true}
                        onChange={(v) => updateFrontend({ layoutDrawerShowTitle: v })}
                    />
                    {(frontend.layoutDrawerShowTitle ?? true) && (
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
                    )}
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
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
                                className="w-24 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
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
                                className="w-24 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
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
                                className="w-24 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
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
        </div>
    );
}
