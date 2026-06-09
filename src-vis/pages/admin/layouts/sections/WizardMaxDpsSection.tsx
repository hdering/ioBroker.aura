import { useConfigStore } from '../../../../store/configStore';
import { SliderSetting } from '../shared/SliderSetting';
import { useT } from '../../../../i18n';

export function WizardMaxDpsSection() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();

    return (
        <div
            className="rounded-xl p-4"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <SliderSetting
                label={t('settings.grid.wizardMaxDp')}
                value={frontend.wizardMaxDatapoints ?? 500}
                min={100}
                max={5000}
                step={100}
                onChange={(v) => updateFrontend({ wizardMaxDatapoints: v })}
                presets={[
                    { label: '200', value: 200 },
                    { label: '500', value: 500 },
                    { label: '1k', value: 1000 },
                    { label: '2k', value: 2000 },
                    { label: '5k', value: 5000 },
                ]}
            />
        </div>
    );
}
