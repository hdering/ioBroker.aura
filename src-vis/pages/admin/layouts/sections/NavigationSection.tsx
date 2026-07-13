import { useT } from '../../../../i18n';
import { ToggleRow } from '../shared/SettingControls';
import { useLayoutSetting } from '../shared/useLayoutSetting';

// Frontend navigation behavior (auto-return to the layout default after
// inactivity). Scope-aware: global or per layout (contextId = null | layout id).
export function NavigationSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, set, clear } = useLayoutSetting(contextId);
    const [enabled, enabledOv] = eff('idleReturnEnabled');
    const [delay, delayOv] = eff('idleReturnDelay');
    const overridden = enabledOv || delayOv;

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.nav')}
                </h2>
                {overridden && (
                    <button
                        onClick={() => {
                            clear('idleReturnEnabled');
                            clear('idleReturnDelay');
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-full hover:opacity-80"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        title={t('layouts.scope.resetHint')}
                    >
                        {t('layouts.scope.reset')}
                    </button>
                )}
            </div>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.nav.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.idleReturn')}
                value={enabled ?? false}
                onChange={(v) => set('idleReturnEnabled', v)}
            />
            {enabled && (
                <div className="pt-1 space-y-2">
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
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.idleReturnHint')}
                    </p>
                </div>
            )}
        </div>
    );
}
