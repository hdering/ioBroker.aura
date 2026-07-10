import { useConfigStore } from '../../../../store/configStore';
import { useT } from '../../../../i18n';
import { ToggleRow } from '../shared/SettingControls';

// Global frontend navigation behavior (auto-return to the default tab after
// inactivity). Lives in the Design "global frame" group.
export function NavigationSection() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('layouts.subtab.nav')}
            </h2>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.nav.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.idleReturn')}
                value={frontend.idleReturnEnabled ?? false}
                onChange={(v) => updateFrontend({ idleReturnEnabled: v })}
            />
            {frontend.idleReturnEnabled && (
                <div className="pt-1 space-y-2">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('settings.frontend.idleReturnDelay')}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={5}
                            max={3600}
                            value={frontend.idleReturnDelay ?? 30}
                            onChange={(e) => {
                                const v = Math.max(5, parseInt(e.target.value) || 30);
                                updateFrontend({ idleReturnDelay: v });
                            }}
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
