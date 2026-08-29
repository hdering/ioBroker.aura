import { useT } from '../../../i18n';

export type EChartMode = 'timeseries' | 'comparison' | 'json';

const MODES = [
    { id: 'timeseries', label: 'echart.modeTimeseries', hint: 'echart.modeTimeseriesHint' },
    { id: 'comparison', label: 'echart.modeComparison', hint: 'echart.modeComparisonHint' },
    { id: 'json', label: 'echart.modeJson', hint: 'echart.modeJsonHint' },
] as const;

/**
 * "Modus" tab of the chart's "Datenpunkte verwalten" dialog: the three modes plus what each one
 * is for. The mode decides which fields a series shows at all, so it opens the dialog — and the
 * hints are spelled out for all three, not just the active one: the difference between a timeline
 * and a bar-per-datapoint comparison is exactly what a user has to decide here.
 */
export function ChartModePanel({ mode, onChange }: { mode: EChartMode; onChange: (mode: EChartMode) => void }) {
    const t = useT();
    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <div className="aura-chart-mode flex items-center gap-2">
                <label className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.mode')}
                </label>
                <div className="flex gap-1">
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => onChange(m.id)}
                            className="text-[11px] px-3 py-1 rounded-md hover:opacity-80 transition-opacity"
                            style={{
                                background: mode === m.id ? 'var(--accent)' : 'var(--app-bg)',
                                color: mode === m.id ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${mode === m.id ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {t(m.label)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {MODES.map((m) => (
                    <div
                        key={m.id}
                        className="rounded-lg px-2.5 py-2"
                        style={{
                            background: 'var(--app-bg)',
                            border: `1px solid ${mode === m.id ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        <p
                            className="text-[11px] font-semibold mb-0.5"
                            style={{ color: mode === m.id ? 'var(--accent)' : 'var(--text-secondary)' }}
                        >
                            {t(m.label)}
                        </p>
                        <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {t(m.hint)}
                        </p>
                    </div>
                ))}
            </div>

            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {t('echart.modeKeepsSeries')}
            </p>
        </div>
    );
}
