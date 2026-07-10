import { useConfigStore } from '../../../../store/configStore';
import { useT } from '../../../../i18n';
import { Card, ToggleRow } from '../shared/SettingControls';

// Global frontend behavior toggles. Rendered as a card on the Settings page.
// (Idle-return lives in Design → Navigation; this card keeps optimistic updates.)
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
