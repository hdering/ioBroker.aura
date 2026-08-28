import { useT } from '../../../i18n';
import type { EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import { JsonAxisBoundsHint, JsonShapeHint } from '../JsonChartHints';
import { JsonKeySelect, inputCls, inputStyle, type JsonProbe } from './chartShared';

/**
 * "JSON-Quelle" of one series: where the array sits in the payload, which keys hold label and
 * value, and whether the payload's own min/max block drives the y axis (issue #550).
 *
 * Two of the switches are widget-level on purpose — the axis type and the bounds belong to the
 * payload shape, not to a single series, and they show the same state in every series panel.
 * `echartJsonTimeAxis` is only a choice in the JSON mode; a timeseries chart always has a time
 * axis, so a JSON series mixed into it has nothing to pick (issue #595).
 */
export function ChartSeriesJsonPanel({
    s,
    probe,
    isJson,
    jsonTimeAxis,
    jsonAxisBounds,
    update,
    onWidgetOption,
}: {
    s: EChartSeriesConfig;
    probe?: JsonProbe;
    /** Widget mode is `json` — then the axis type is the user's choice. */
    isJson: boolean;
    jsonTimeAxis: boolean;
    jsonAxisBounds: boolean;
    update: (patch: Partial<EChartSeriesConfig>) => void;
    onWidgetOption: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    // A JSON series on a timeseries chart's shared axis needs timestamp labels — a category label
    // has no x coordinate there and its point is dropped. Only reported once the payload was read.
    const mixedProbe = !isJson && probe?.done && !probe.invalid ? probe : null;
    return (
        <div>
            <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('echart.jsonSection')}
            </p>
            <div className="flex flex-col gap-2">
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.jsonPath')}
                    </label>
                    <input
                        type="text"
                        value={s.jsonPath ?? ''}
                        onChange={(e) =>
                            update({
                                jsonPath: e.target.value || undefined,
                            })
                        }
                        placeholder={t('echart.jsonPathPlaceholder')}
                        className={inputCls}
                        style={inputStyle}
                    />
                    <JsonShapeHint />
                </div>
                {/* Widget-level, and only a choice in the JSON mode: a
                    timeseries chart always has a time axis, so a JSON
                    series mixed into it (issue #595) has nothing to pick. */}
                {isJson && (
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={jsonTimeAxis}
                                onChange={(e) =>
                                    onWidgetOption({
                                        echartJsonTimeAxis: e.target.checked,
                                    })
                                }
                                className="accent-[var(--accent)]"
                            />
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('echart.jsonTimeAxis')}
                            </span>
                        </label>
                        <p
                            className="text-[11px] mt-1"
                            style={{
                                color: 'var(--text-secondary)',
                                opacity: 0.7,
                            }}
                        >
                            {t('echart.jsonTimeAxisHint')}
                        </p>
                    </div>
                )}
                {/* Mixed into a timeseries chart the labels have to BE
                    timestamps — anything else has no place on the axis. */}
                {mixedProbe && (
                    <p
                        className="text-[11px]"
                        style={{
                            color: mixedProbe.timeLike ? 'var(--text-secondary)' : 'var(--danger, #ef4444)',
                            opacity: mixedProbe.timeLike ? 0.8 : 1,
                        }}
                    >
                        {mixedProbe.timeLike ? t('echart.jsonMixedTimeOk') : t('echart.jsonMixedNeedsTime')}
                    </p>
                )}
                <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.jsonLabelKey')}
                        </label>
                        <JsonKeySelect
                            value={s.jsonLabelKey}
                            detected={probe?.labelKey}
                            keys={probe?.keys ?? []}
                            onChange={(v) => update({ jsonLabelKey: v })}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.jsonValueKey')}
                        </label>
                        <JsonKeySelect
                            value={s.jsonValueKey}
                            detected={probe?.valueKey}
                            keys={probe?.keys ?? []}
                            onChange={(v) => update({ jsonValueKey: v })}
                        />
                    </div>
                </div>
                {/* Widget-level, like the axis type above: the
                    payload's bounds belong to the payload, so the switch
                    sits with it and not down in the axis section. */}
                <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={jsonAxisBounds}
                            onChange={(e) =>
                                onWidgetOption({
                                    echartJsonAxisBounds: e.target.checked,
                                })
                            }
                            className="accent-[var(--accent)]"
                        />
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.jsonAxisBounds')}
                        </span>
                    </label>
                    <p
                        className="text-[11px] mt-1"
                        style={{
                            color: 'var(--text-secondary)',
                            opacity: 0.7,
                        }}
                    >
                        {t('echart.jsonAxisBoundsHint')}
                    </p>
                </div>
                {jsonAxisBounds && (
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.jsonAxisPath')}
                        </label>
                        <input
                            type="text"
                            value={s.jsonAxisPath ?? ''}
                            onChange={(e) =>
                                update({
                                    jsonAxisPath: e.target.value || undefined,
                                })
                            }
                            placeholder={t('echart.jsonAxisPathPlaceholder')}
                            className={inputCls}
                            style={inputStyle}
                        />
                        <JsonAxisBoundsHint />
                        {/* Only once the payload was actually read — an
                            unreadable datapoint already says so below. */}
                        {probe?.done && !probe.invalid && (
                            <p
                                className="text-[11px] mt-1"
                                style={{
                                    color: 'var(--text-secondary)',
                                    opacity: 0.8,
                                }}
                            >
                                {probe.bounds
                                    ? t('echart.jsonAxisFound', {
                                          min: probe.bounds.min ?? t('echart.jsonAxisAuto'),
                                          max: probe.bounds.max ?? t('echart.jsonAxisAuto'),
                                      })
                                    : t('echart.jsonAxisNone')}
                            </p>
                        )}
                    </div>
                )}
                {probe?.done && probe.invalid && (
                    <div>
                        <p className="text-[11px]" style={{ color: 'var(--danger, #ef4444)' }}>
                            {t('echart.jsonNoArray')}
                        </p>
                        {!!probe.arrayPaths?.length && (
                            <p
                                className="text-[11px] mt-0.5"
                                style={{
                                    color: 'var(--text-secondary)',
                                    opacity: 0.85,
                                }}
                            >
                                {t('echart.jsonPathSuggest', {
                                    paths: probe.arrayPaths.join(', '),
                                })}
                            </p>
                        )}
                    </div>
                )}
                {probe?.done && !probe.invalid && (
                    <p
                        className="text-[11px]"
                        style={{
                            color: 'var(--text-secondary)',
                            opacity: 0.8,
                        }}
                    >
                        {t('echart.jsonPreview', {
                            count: probe.entries,
                            label: probe.sampleLabel ?? '?',
                            value: probe.sampleValue ?? '?',
                        })}
                    </p>
                )}
            </div>
        </div>
    );
}
