import { NUMBER_FORMATS, NUMBER_FORMAT_SAMPLES, type NumberFormat } from '../../utils/formatValue';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { useT } from '../../i18n';

interface ValueFormatRowProps {
    /** Current unit. Pass together with onUnitChange to show the unit field. */
    unit?: string;
    unitPlaceholder?: string;
    onUnitChange?: (v: string | undefined) => void;
    /** undefined = inherit the global default */
    decimals: number | undefined;
    /** undefined = inherit the global default */
    numberFormat: NumberFormat | undefined;
    onChange: (patch: { decimals?: number; numberFormat?: NumberFormat }) => void;
    /** Panel input styling (iSty / gSty / kSty / inputStyle …). */
    inputStyle?: React.CSSProperties;
    /** Panel input classes; defaults to the standard widget-options input. */
    inputClassName?: string;
    /** Tighter label size used by the list/entry panels. */
    compact?: boolean;
}

/**
 * One row combining the three settings that describe how a numeric value reads:
 * unit, decimal places and thousands separator. Decimals and separator both fall
 * back to the global default (Frontend-Design → Werte & Formatierung) while empty
 * / "Global" is selected, so an untouched widget simply follows the global setting.
 */
export function ValueFormatRow({
    unit,
    unitPlaceholder,
    onUnitChange,
    decimals,
    numberFormat,
    onChange,
    inputStyle,
    inputClassName = 'w-full text-xs rounded-lg px-2 py-2 focus:outline-none',
    compact = false,
}: ValueFormatRowProps) {
    const t = useT();
    const { defaultDecimals, numberFormat: globalFormat } = useGlobalSettingsStore();

    const sty: React.CSSProperties = inputStyle ?? {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };
    const labelCls = compact ? 'text-[9px] block mb-0.5 truncate' : 'text-[11px] mb-1 block truncate';
    const labelSty = { color: 'var(--text-secondary)' };

    return (
        <div className="flex gap-1.5 items-end">
            {onUnitChange && (
                <div className="flex-1 min-w-0">
                    <label className={labelCls} style={labelSty} title={t('config.unit.label')}>
                        {t('config.unit.label')}
                    </label>
                    <input
                        type="text"
                        value={unit ?? ''}
                        onChange={(e) => onUnitChange(e.target.value || undefined)}
                        placeholder={unitPlaceholder}
                        className={inputClassName}
                        style={sty}
                    />
                </div>
            )}
            <div className="shrink-0" style={{ width: 62 }}>
                <label className={labelCls} style={labelSty} title={t('config.decimals.label')}>
                    {t('config.decimals.label')}
                </label>
                {/* Empty = inherit; the placeholder shows the global value that applies then. */}
                <input
                    type="number"
                    min={0}
                    max={6}
                    value={decimals ?? ''}
                    placeholder={String(defaultDecimals)}
                    title={decimals === undefined ? t('config.decimals.globalActive') : undefined}
                    onChange={(e) => onChange({ decimals: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className={`${inputClassName} text-center`}
                    style={sty}
                />
            </div>
            <div className="flex-1 min-w-0">
                <label className={labelCls} style={labelSty} title={t('config.numberFormat.label')}>
                    {t('config.numberFormat.labelShort')}
                </label>
                <select
                    value={numberFormat ?? 'global'}
                    onChange={(e) =>
                        onChange({
                            numberFormat: e.target.value === 'global' ? undefined : (e.target.value as NumberFormat),
                        })
                    }
                    className={inputClassName}
                    style={sty}
                >
                    <option value="global">
                        {globalFormat && globalFormat !== 'plain'
                            ? NUMBER_FORMAT_SAMPLES[globalFormat]
                            : t('values.thousands.plain')}{' '}
                        ({t('config.numberFormat.global')})
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
