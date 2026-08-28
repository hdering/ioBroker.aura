import { useT } from '../../../i18n';
import type { EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import { inputCls, inputStyle, type SeriesAdapterState } from './chartShared';

/**
 * "Verlauf" of one series: which history adapter delivers it, how the records are aggregated and
 * — for `delta` — which calendar bucket a bar covers.
 *
 * A template datapoint (`{{dp}}`) can't be resolved to an object, so no adapter can be detected
 * for it; that case gets a free-text instance field instead of the dropdown.
 */
export function ChartSeriesHistoryPanel({
    s,
    adState,
    update,
    onDetect,
}: {
    s: EChartSeriesConfig;
    adState?: SeriesAdapterState;
    update: (patch: Partial<EChartSeriesConfig>) => void;
    /** Re-run adapter detection for this series' datapoint. */
    onDetect: () => void;
}) {
    const t = useT();
    const isTpl = (s.datapointId ?? '').includes('{{');
    return (
        <div>
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('echart.history')}
            </p>
            {!s.datapointId && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.selectDpFirst')}
                </p>
            )}
            {s.datapointId && isTpl && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.instance')}
                    </label>
                    <input
                        type="text"
                        placeholder={t('echart.templateInstancePlaceholder')}
                        value={s.historyInstance ?? ''}
                        onChange={(e) =>
                            update({
                                historyInstance: e.target.value || undefined,
                            })
                        }
                        className={inputCls}
                        style={inputStyle}
                    />
                    <p
                        className="text-[11px] mt-1"
                        style={{
                            color: 'var(--text-secondary)',
                            opacity: 0.7,
                        }}
                    >
                        {t('echart.templateInstanceHint')}
                    </p>
                </div>
            )}
            {s.datapointId && !isTpl && adState?.checking && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.checking')}
                </p>
            )}
            {s.datapointId && !isTpl && !adState?.checking && !adState && (
                <button
                    onClick={() => onDetect()}
                    className="text-[11px] hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                >
                    {t('echart.detect')}
                </button>
            )}
            {s.datapointId && !isTpl && adState && !adState.checking && adState.adapters.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.noAdapter')}
                </p>
            )}
            {s.datapointId && !isTpl && adState && !adState.checking && adState.adapters.length > 0 && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.instance')}
                    </label>
                    <select
                        value={s.historyInstance ?? ''}
                        onChange={(e) =>
                            update({
                                historyInstance: e.target.value || undefined,
                            })
                        }
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="">{t('echart.liveData')}</option>
                        {adState.adapters.map((a) => (
                            <option key={a.instance} value={a.instance}>
                                {a.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            {s.datapointId && s.historyInstance && (
                <div className="mt-1.5">
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.aggregation')}
                    </label>
                    <select
                        value={s.aggregate ?? 'average'}
                        onChange={(e) => {
                            const agg =
                                e.target.value === 'average'
                                    ? undefined
                                    : (e.target.value as EChartSeriesConfig['aggregate']);
                            update({
                                aggregate: agg,
                                // Per-bucket consumption reads as bars, not
                                // as a connected line — switch the type along
                                // unless one was deliberately chosen.
                                ...(agg === 'delta' && s.chartType !== 'bar' ? { chartType: 'bar' as const } : {}),
                            });
                        }}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="average">{t('echart.aggAverage')}</option>
                        <option value="minmax">{t('echart.aggMinmax')}</option>
                        <option value="max">{t('echart.aggMax')}</option>
                        <option value="min">{t('echart.aggMin')}</option>
                        <option value="total">{t('echart.aggTotal')}</option>
                        <option value="delta">{t('echart.aggDelta')}</option>
                        <option value="none">{t('echart.aggNone')}</option>
                    </select>
                </div>
            )}
            {s.datapointId && s.historyInstance && s.aggregate === 'delta' && (
                <div className="mt-1.5">
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.deltaBucket')}
                    </label>
                    <select
                        value={s.deltaBucket ?? 'hour'}
                        onChange={(e) =>
                            update({
                                deltaBucket: e.target.value as EChartSeriesConfig['deltaBucket'],
                            })
                        }
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="auto">{t('echart.bucketAuto')}</option>
                        <option value="hour">{t('echart.bucketHour')}</option>
                        <option value="day">{t('echart.bucketDay')}</option>
                        <option value="week">{t('echart.bucketWeek')}</option>
                        <option value="month">{t('echart.bucketMonth')}</option>
                        <option value="year">{t('echart.bucketYear')}</option>
                    </select>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {s.deltaBucket === 'auto' ? t('echart.bucketAutoHint') : t('echart.deltaHint')}
                    </p>
                </div>
            )}
        </div>
    );
}
