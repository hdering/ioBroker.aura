interface SliderSettingProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
    presets: { label: string; value: number }[];
    isOverridden?: boolean;
    onClearOverride?: () => void;
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
}: SliderSettingProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {label}
                    </p>
                    {isOverridden && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                color: 'var(--accent)',
                            }}
                        >
                            Layout
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {isOverridden && onClearOverride && (
                        <button
                            onClick={onClearOverride}
                            className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            ↩ Global
                        </button>
                    )}
                    <span
                        className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--accent)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {value}
                        {unit}
                    </span>
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-[var(--accent)] mb-2"
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
                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
