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
 *
 * The explanations ARE the choice — a separate row of mode buttons above them only said the same
 * three words twice and left two things highlighted for one selection.
 */
export function ChartModePanel({ mode, onChange }: { mode: EChartMode; onChange: (mode: EChartMode) => void }) {
    const t = useT();
    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {t('echart.mode')}
            </label>

            <div className="aura-chart-mode flex flex-col gap-2">
                {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onChange(m.id)}
                            aria-pressed={active}
                            className="text-left rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : undefined,
                            }}
                        >
                            <p
                                className="text-[11px] font-semibold mb-0.5"
                                style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                            >
                                {t(m.label)}
                            </p>
                            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                                {t(m.hint)}
                            </p>
                        </button>
                    );
                })}
            </div>

            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {t('echart.modeKeepsSeries')}
            </p>
        </div>
    );
}
