import { useGlobalSettingsStore } from '../../../../store/globalSettingsStore';
import { NUMBER_FORMATS, NUMBER_FORMAT_SAMPLES, type NumberFormat } from '../../../../utils/formatValue';
import { Card, ToggleRow } from '../shared/SettingControls';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useT } from '../../../../i18n';

const DEFAULT_DECIMALS = 2;
const DEFAULT_FORMAT: NumberFormat = 'plain';

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** Card header row: title is rendered by <Card>, so this only holds the reset action. */
function ResetRow({ onReset, disabled }: { onReset: () => void; disabled: boolean }) {
    return (
        <div className="flex justify-end -mt-1">
            <ResetDefaultsButton onReset={onReset} disabled={disabled} />
        </div>
    );
}

function DecimalsCard() {
    const t = useT();
    const { defaultDecimals, setDefaultDecimals } = useGlobalSettingsStore();
    return (
        <Card title={t('values.decimals.title')}>
            <ResetRow
                onReset={() => setDefaultDecimals(DEFAULT_DECIMALS)}
                disabled={defaultDecimals === DEFAULT_DECIMALS}
            />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('values.decimals.hint')}
            </p>
            <div className="flex items-center gap-3">
                <input
                    type="number"
                    min={0}
                    max={6}
                    value={defaultDecimals}
                    onChange={(e) => setDefaultDecimals(Math.min(6, Math.max(0, Number(e.target.value))))}
                    className="w-20 rounded-lg px-3 py-2 text-sm focus:outline-none text-center"
                    style={inputStyle}
                />
                <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((n) => (
                        <button
                            key={n}
                            onClick={() => setDefaultDecimals(n)}
                            className="w-8 h-8 rounded-lg text-sm font-medium hover:opacity-80"
                            style={{
                                background: defaultDecimals === n ? 'var(--accent)' : 'var(--app-bg)',
                                color: defaultDecimals === n ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${defaultDecimals === n ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>
        </Card>
    );
}

function ThousandsCard() {
    const t = useT();
    const { numberFormat, setNumberFormat } = useGlobalSettingsStore();
    const current = numberFormat ?? DEFAULT_FORMAT;
    return (
        <Card title={t('values.thousands.title')}>
            <ResetRow onReset={() => setNumberFormat(DEFAULT_FORMAT)} disabled={current === DEFAULT_FORMAT} />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('values.thousands.hint')}
            </p>
            <div className="flex gap-1.5 flex-wrap">
                {NUMBER_FORMATS.map((f) => {
                    const active = current === f;
                    return (
                        <button
                            key={f}
                            onClick={() => setNumberFormat(f)}
                            className="px-3 py-2 rounded-lg text-xs font-mono hover:opacity-80"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {f === 'plain' ? t('values.thousands.plain') : NUMBER_FORMAT_SAMPLES[f]}
                        </button>
                    );
                })}
            </div>
        </Card>
    );
}

function DpNamesCard() {
    const t = useT();
    const { dpNameSuffixes, dpNameReplaceDots, setDpNameSuffixes, setDpNameReplaceDots } = useGlobalSettingsStore();
    return (
        <Card title={t('values.dpNames.title')}>
            <ResetRow
                onReset={() => {
                    setDpNameSuffixes('');
                    setDpNameReplaceDots(false);
                }}
                disabled={!dpNameSuffixes && !dpNameReplaceDots}
            />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('values.dpNames.hint')}
            </p>
            <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('values.dpNames.suffixes')}
                </label>
                <input
                    value={dpNameSuffixes}
                    onChange={(e) => setDpNameSuffixes(e.target.value)}
                    placeholder=".STATE, .LEVEL, :1, :2, :3"
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                    style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {t('values.dpNames.suffixesHint')}
                </p>
            </div>
            <ToggleRow
                label={t('values.dpNames.replaceDots')}
                value={dpNameReplaceDots}
                onChange={setDpNameReplaceDots}
            />
        </Card>
    );
}

/**
 * Global-scope-only design tab: number formatting and DP name cleanup.
 * These live in the globalSettingsStore, so there is no layout/section override.
 */
export function ValueFormatSection() {
    const t = useT();
    return (
        <div className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('values.hint')}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <DecimalsCard />
                <ThousandsCard />
                <DpNamesCard />
            </div>
        </div>
    );
}
