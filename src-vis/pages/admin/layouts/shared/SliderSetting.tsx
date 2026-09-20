import { useT } from '../../../../i18n';
import { OVERRIDE_COLOR, OVERRIDE_TINT } from './scopeBands';

interface SliderSettingProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
    presets: { label: string; value: number }[];
    /** This scope sets its own value — the control turns orange. */
    isOverridden?: boolean;
    onClearOverride?: () => void;
    /** Override state line (usually an <OverrideState>); replaces the built-in "set here" affordance. */
    info?: React.ReactNode;
}

export function SliderSetting({
    label,
    value,
    min,
    max,
    step,
    unit = '',
    onChange,
    presets,
    isOverridden,
    onClearOverride,
    info,
}: SliderSettingProps) {
    const t = useT();
    const accent = isOverridden ? OVERRIDE_COLOR : 'var(--accent)';
    return (
        <div
            className={isOverridden ? 'rounded-r-lg pl-3 -ml-3' : undefined}
            style={
                isOverridden
                    ? {
                          boxShadow: `inset 3px 0 0 ${OVERRIDE_COLOR}`,
                          background: `linear-gradient(90deg, ${OVERRIDE_TINT}, transparent 45%)`,
                      }
                    : undefined
            }
            data-overridden={isOverridden ? 'true' : undefined}
        >
            <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </p>
                <span
                    className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                    style={{
                        background: isOverridden ? OVERRIDE_TINT : 'var(--app-bg)',
                        color: accent,
                        border: `1px solid ${isOverridden ? OVERRIDE_COLOR : 'var(--app-border)'}`,
                    }}
                >
                    {value}
                    {unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full mb-2"
                style={{ accentColor: accent }}
            />
            <div className="flex gap-1.5 flex-wrap">
                {presets.map((p) => {
                    const active = value === p.value;
                    return (
                        <button
                            key={p.value}
                            onClick={() => onChange(p.value)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                            style={{
                                background: active ? accent : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? accent : 'var(--app-border)'}`,
                            }}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>
            {info ? (
                <div className="mt-2">{info}</div>
            ) : (
                isOverridden &&
                onClearOverride && (
                    <button
                        onClick={onClearOverride}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] hover:opacity-80"
                        style={{ color: OVERRIDE_COLOR }}
                        title={t('design.override.clear')}
                    >
                        <span className="w-[7px] h-[7px] rounded-full" style={{ background: OVERRIDE_COLOR }} />
                        {t('design.override.setHere')} ✕
                    </button>
                )
            )}
        </div>
    );
}
