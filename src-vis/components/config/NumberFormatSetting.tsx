import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { NUMBER_FORMATS, NUMBER_FORMAT_SAMPLES, type NumberFormat } from '../../utils/formatValue';
import { useT } from '../../i18n';

interface NumberFormatSettingProps {
    /** undefined = inherit the global default */
    decimals: number | undefined;
    /** undefined = inherit the global default */
    numberFormat: NumberFormat | undefined;
    onChange: (patch: { decimals?: number; numberFormat?: NumberFormat }) => void;
    /** Input styling of the surrounding options panel (iSty / gSty / kSty / inputStyle …). */
    inputStyle?: React.CSSProperties;
    /** Override the decimals label (e.g. "Dezimalstellen (Tooltip)" in the chart config). */
    decimalsLabel?: string;
}

/**
 * Decimals + thousands-separator override, used by every widget/cell/entry options
 * panel. Both fall back to the global setting (Frontend-Design → Werte & Formatierung)
 * while the respective value is undefined.
 */
export function NumberFormatSetting({
    decimals,
    numberFormat,
    onChange,
    inputStyle,
    decimalsLabel,
}: NumberFormatSettingProps) {
    const t = useT();
    const { defaultDecimals, numberFormat: globalFormat } = useGlobalSettingsStore();
    const isGlobalDecimals = decimals === undefined;
    const baseStyle: React.CSSProperties = inputStyle ?? {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="flex gap-1.5 items-end">
            <div className="shrink-0" style={{ width: 108 }}>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {decimalsLabel ?? t('config.decimals.label')}
                </label>
                <div className="flex gap-1">
                    <input
                        type="number"
                        min={0}
                        max={4}
                        disabled={isGlobalDecimals}
                        value={decimals ?? defaultDecimals}
                        onChange={(e) => onChange({ decimals: Number(e.target.value) })}
                        className="w-full min-w-0 text-xs rounded-lg px-2 py-2 focus:outline-none"
                        style={{ ...baseStyle, opacity: isGlobalDecimals ? 0.5 : 1 }}
                    />
                    <button
                        onClick={() => onChange({ decimals: isGlobalDecimals ? defaultDecimals : undefined })}
                        title={
                            isGlobalDecimals ? t('config.decimals.globalActive') : t('config.decimals.resetToGlobal')
                        }
                        className="px-1.5 rounded text-[10px] font-bold shrink-0"
                        style={{
                            background: isGlobalDecimals ? 'var(--accent)' : 'var(--app-border)',
                            color: isGlobalDecimals ? '#fff' : 'var(--text-secondary)',
                        }}
                    >
                        {t('config.decimals.global')}
                    </button>
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <label className="text-[11px] mb-1 block truncate" style={{ color: 'var(--text-secondary)' }}>
                    {t('config.numberFormat.label')}
                </label>
                <select
                    value={numberFormat ?? 'global'}
                    onChange={(e) =>
                        onChange({
                            numberFormat: e.target.value === 'global' ? undefined : (e.target.value as NumberFormat),
                        })
                    }
                    className="w-full text-xs rounded-lg px-2 py-2 focus:outline-none"
                    style={baseStyle}
                >
                    <option value="global">
                        {t('config.numberFormat.global')} (
                        {globalFormat === 'plain' || !globalFormat
                            ? t('values.thousands.plain')
                            : NUMBER_FORMAT_SAMPLES[globalFormat]}
                        )
                    </option>
                    {NUMBER_FORMATS.map((f) => (
                        <option key={f} value={f}>
                            {f === 'plain' ? t('values.thousands.plain') : NUMBER_FORMAT_SAMPLES[f]}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
