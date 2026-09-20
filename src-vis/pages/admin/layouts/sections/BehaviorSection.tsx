import { useConfigStore } from '../../../../store/configStore';
import { useT } from '../../../../i18n';
import { Card, ToggleRow } from '../shared/SettingControls';

// Global frontend behavior toggles — the „Verhalten“ group of the Design page's
// global band (idle-return lives in Design → Navigation, it is per layout/section).
export function BehaviorSection() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();

    return (
        <Card title={t('settings.behavior.title')}>
            <ToggleRow
                label={t('settings.frontend.optimisticUpdates')}
                hint={t('settings.frontend.optimisticUpdatesHint')}
                value={frontend.optimisticUpdates !== false}
                onChange={(v) => updateFrontend({ optimisticUpdates: v })}
            />
        </Card>
    );
}
