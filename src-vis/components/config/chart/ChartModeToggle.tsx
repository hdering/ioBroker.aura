import { useT } from '../../../i18n';

export type EChartMode = 'timeseries' | 'comparison' | 'json';

/**
 * The chart's mode, as a row of three buttons. Sits in the header of the "Datenpunkte verwalten"
 * dialog: it applies to the whole widget, and it decides which fields a series shows — so the
 * effect of switching it has to be visible right where the series are edited.
 */
export function ChartModeToggle({ mode, onChange }: { mode: EChartMode; onChange: (mode: EChartMode) => void }) {
    const t = useT();
    return (
        <div className="aura-chart-mode flex items-center gap-2">
            <label className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {t('echart.mode')}
            </label>
            <div className="flex gap-1">
                {(['timeseries', 'comparison', 'json'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => onChange(m)}
                        className="text-[11px] px-3 py-1 rounded-md hover:opacity-80 transition-opacity"
                        style={{
                            background: mode === m ? 'var(--accent)' : 'var(--app-bg)',
                            color: mode === m ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        {m === 'timeseries'
                            ? t('echart.modeTimeseries')
                            : m === 'comparison'
                              ? t('echart.modeComparison')
                              : t('echart.modeJson')}
                    </button>
                ))}
            </div>
            {mode === 'json' && (
                <p className="text-[11px] min-w-0" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {t('echart.jsonHint')}
                </p>
            )}
        </div>
    );
}
