import { useT } from '../../../i18n';

/**
 * "Werte" tab of the chart's "Datenpunkte verwalten" dialog: the two settings that only make
 * sense next to the series.
 *
 * Both used to sit in the global settings of the options panel. The widget switch is the default
 * every series detail shows as "Auto (Aus)" — changing it belongs where that state is visible.
 * And the stack percentage only exists once a series stacks, which is configured in this dialog:
 * ticking "Stapeln" made an option appear in the panel behind the closed dialog.
 */
export function ChartValuesPanel({
    showValues,
    showStackPercent,
    anyStack,
    onChange,
}: {
    showValues: boolean;
    showStackPercent: boolean;
    /** At least one series stacks — without one the percentage has no total to relate to. */
    anyStack: boolean;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
        <button
            onClick={onClick}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: on ? '18px' : '2px' }}
            />
        </button>
    );
    return (
        <div className="flex flex-col gap-2 max-w-[520px]">
            <div>
                <div className="flex items-center justify-between gap-3">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.showValues')}
                    </label>
                    <Toggle on={showValues} onClick={() => onChange({ echartShowValues: !showValues })} />
                </div>
                <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {t('echart.showValuesHint')}
                </p>
            </div>

            {anyStack && (
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.showStackPercent')}
                        </label>
                        <Toggle
                            on={showStackPercent}
                            onClick={() => onChange({ echartShowStackPercent: !showStackPercent })}
                        />
                    </div>
                    {showStackPercent && (
                        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.showStackPercentHint')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
