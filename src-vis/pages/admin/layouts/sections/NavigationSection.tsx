import { useT } from '../../../../i18n';
import { ToggleRow, OVERRIDE_ROW_STYLE } from '../shared/SettingControls';
import { OverrideState } from '../shared/OverrideState';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import type { LayoutSettings } from '../../../../store/dashboardStore';
import { NS } from '../../../../utils/namespace';

const NAV_KEYS: (keyof LayoutSettings)[] = [
    'idleReturnEnabled',
    'idleReturnDelay',
    'idleStateEnabled',
    'idleStateDelay',
];

// Frontend navigation behavior (auto-return to the layout default after
// inactivity). Scope-aware: global or per layout (contextId = null | layout id).
export function NavigationSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, set, resetKeys, isDirty, level } = useLayoutSetting(contextId);
    const [enabled, enabledOv] = eff('idleReturnEnabled');
    const [delay, delayOv] = eff('idleReturnDelay');
    const [idleOn, idleOnOv] = eff('idleStateEnabled');
    const [idleDelay, idleDelayOv] = eff('idleStateDelay');

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.nav')}
                </h2>
                <ResetDefaultsButton
                    onReset={() => resetKeys(NAV_KEYS)}
                    disabled={!isDirty(NAV_KEYS)}
                    scoped={level !== 'global'}
                />
            </div>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.nav.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.idleReturn')}
                value={enabled ?? false}
                onChange={(v) => set('idleReturnEnabled', v)}
                isOverridden={enabledOv}
                info={
                    <OverrideState
                        contextId={contextId}
                        keys={['idleReturnEnabled']}
                        label={t('settings.frontend.idleReturn')}
                    />
                }
            />
            {enabled && (
                <div
                    className="pt-1 space-y-2"
                    style={delayOv ? OVERRIDE_ROW_STYLE : undefined}
                    data-overridden={delayOv ? 'true' : undefined}
                >
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('settings.frontend.idleReturnDelay')}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={5}
                            max={3600}
                            value={delay ?? 30}
                            onChange={(e) => set('idleReturnDelay', Math.max(5, parseInt(e.target.value) || 30))}
                            className="w-20 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {t('common.seconds')}
                        </span>
                    </div>
                    <OverrideState
                        contextId={contextId}
                        keys={['idleReturnDelay']}
                        label={t('settings.frontend.idleReturnDelay')}
                        format={(_, v) => `${v} s`}
                    />
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.idleReturnHint', { ns: NS })}
                    </p>
                </div>
            )}

            {/* Idle state of the device (#822) — the building block for a screensaver popup. */}
            <ToggleRow
                label={t('settings.frontend.idleState')}
                value={idleOn ?? true}
                onChange={(v) => set('idleStateEnabled', v)}
                isOverridden={idleOnOv}
                info={
                    <OverrideState
                        contextId={contextId}
                        keys={['idleStateEnabled']}
                        label={t('settings.frontend.idleState')}
                    />
                }
            />
            {(idleOn ?? true) && (
                <div
                    className="pt-1 space-y-2"
                    style={idleDelayOv ? OVERRIDE_ROW_STYLE : undefined}
                    data-overridden={idleDelayOv ? 'true' : undefined}
                >
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('settings.frontend.idleStateDelay')}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={5}
                            max={86400}
                            value={idleDelay ?? 120}
                            onChange={(e) => set('idleStateDelay', Math.max(5, parseInt(e.target.value) || 120))}
                            className="w-20 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {t('common.seconds')}
                        </span>
                    </div>
                    <OverrideState
                        contextId={contextId}
                        keys={['idleStateDelay']}
                        label={t('settings.frontend.idleStateDelay')}
                        format={(_, v) => `${v} s`}
                    />
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.idleStateHint', { ns: NS })}
                    </p>
                </div>
            )}
        </div>
    );
}
