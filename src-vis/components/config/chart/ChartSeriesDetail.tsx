import { useState } from 'react';
import { Database } from 'lucide-react';
import { useT } from '../../../i18n';
import type { EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import { ColorPicker } from '../../common/ColorPicker';
import { ValueFormatRow } from '../ValueFormatRow';
import type { NumberFormat } from '../../../utils/formatValue';
import { DatapointPicker } from '../DatapointPicker';
import { ValueTransformButton } from '../ValueTransformButton';
import { JsonShapeHint } from '../JsonChartHints';
import { ChartSeriesJsonPanel } from './ChartSeriesJsonPanel';
import { ChartSeriesHistoryPanel } from './ChartSeriesHistoryPanel';
import {
    CHART_TYPES,
    SERIES_VALUE_MODES,
    inputCls,
    inputStyle,
    type JsonProbe,
    type SeriesAdapterState,
} from './chartShared';

/**
 * Everything about ONE series — the detail pane of the chart's "Datenpunkte verwalten" dialog.
 *
 * Was the accordion body inside the options panel until mode and series moved into the dialog;
 * the panel had grown past 2000 lines and the series editor was the bulk of it. The datapoint
 * picker is mounted here rather than up in the panel because it has to open ON TOP of the dialog
 * (it portals to z-10050, the dialog sits at 10000) — same as the list widgets' entry detail.
 */
export function ChartSeriesDetail({
    s,
    isComparison,
    isJson,
    allSeriesJson,
    echartShowValues,
    chartDecimals,
    chartNumberFormat,
    jsonTimeAxis,
    jsonAxisBounds,
    probe,
    adState,
    update,
    onTransform,
    onDatapointChange,
    onDetect,
    onWidgetOption,
}: {
    s: EChartSeriesConfig;
    isComparison: boolean;
    isJson: boolean;
    /** Every series of this widget reads a payload — then the mode may be swapped safely. */
    allSeriesJson: boolean;
    /** Widget-level default of the value labels, shown as the "Auto" state. */
    echartShowValues: boolean;
    /** Chart-wide number format, already resolved — what this series shows while it inherits. */
    chartDecimals: number;
    chartNumberFormat: NumberFormat;
    jsonTimeAxis: boolean;
    jsonAxisBounds: boolean;
    probe?: JsonProbe;
    adState?: SeriesAdapterState;
    update: (patch: Partial<EChartSeriesConfig>) => void;
    onTransform: (patch: {
        valueTransform?: string;
        valueFactor?: number;
        valueOffset?: number;
        unit?: string;
    }) => void;
    /** New datapoint id — also drops the cached adapter detection for this series. */
    onDatapointChange: (id: string) => void;
    onDetect: () => void;
    onWidgetOption: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const [pickerOpen, setPickerOpen] = useState(false);
    // The JSON mode forces every series onto the payload source; in a timeseries chart each
    // series decides for itself (issue #595).
    const seriesIsJson = isJson || s.source === 'json';
    // A JSON series on a timeseries chart's shared axis needs timestamp labels — a category label
    // has no x coordinate there and its point is dropped. Only judged once the payload was read.
    const mixedProbe = !isComparison && !isJson && seriesIsJson && probe?.done && !probe.invalid ? probe : null;
    return (
        <>
            {/* Name */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.name')}
                </label>
                <input
                    type="text"
                    value={s.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                />
            </div>

            {/* Datapoint */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.datapoint')}
                </label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={s.datapointId}
                        onChange={(e) => onDatapointChange(e.target.value)}
                        placeholder={t('echart.dpPlaceholder')}
                        className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                        style={inputStyle}
                    />
                    <button
                        onClick={() => setPickerOpen(true)}
                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('echart.fromIoBroker')}
                    >
                        <Database size={13} />
                    </button>
                    <ValueTransformButton
                        factor={s.valueFactor}
                        offset={s.valueOffset}
                        presetId={s.valueTransform}
                        dpId={s.datapointId}
                        fillUnit
                        onPatch={(patch) => onTransform(patch)}
                    />
                </div>
            </div>

            {/* Data source — a timeseries chart draws history and JSON
                payloads on the same time axis (issue #595). The other
                two modes have exactly one source, so they offer no choice. */}
            {!isComparison && !isJson && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.seriesSource')}
                    </label>
                    <div className="aura-series-source flex gap-1">
                        {(['history', 'json'] as const).map((src) => {
                            const active = (s.source ?? 'history') === src;
                            return (
                                <button
                                    key={src}
                                    onClick={() => update({ source: src })}
                                    className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {src === 'history' ? t('echart.sourceHistory') : t('echart.sourceJson')}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Mixed into a timeseries chart the labels have to BE timestamps —
                "01" is a month, and the time axis has nowhere to put it, so every
                entry is dropped and the chart stays empty. Said right here at the
                datapoint, not down in the "JSON-Quelle" section where it used to
                sit: by then the chart is already blank for no visible reason. */}
            {mixedProbe && (
                <div>
                    <p
                        className="text-[11px]"
                        style={{
                            color: mixedProbe.timeLike ? 'var(--text-secondary)' : 'var(--danger, #ef4444)',
                            opacity: mixedProbe.timeLike ? 0.8 : 1,
                        }}
                    >
                        {mixedProbe.timeLike
                            ? t('echart.jsonMixedTimeOk')
                            : t('echart.jsonMixedNeedsTime', {
                                  label: mixedProbe.sampleLabel ?? '?',
                              })}
                    </p>
                    {/* One click out of the dead end — but only when no history
                        series would be dragged onto the payload source with it. */}
                    {!mixedProbe.timeLike && allSeriesJson && (
                        <button
                            onClick={() => onWidgetOption({ echartMode: 'json' })}
                            className="mt-1.5 text-[11px] px-2.5 py-1 rounded-md hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {t('echart.jsonUseCategoryMode')}
                        </button>
                    )}
                </div>
            )}

            {/* What the payload has to look like. Used to sit far down in the
                "JSON-Quelle" section under the path field, so a freshly added
                series left the user guessing which JSON the datapoint above
                needs. Starts unfolded until the payload actually parsed. */}
            {!isComparison && seriesIsJson && <JsonShapeHint open={!probe?.done || !!probe.invalid} />}

            {/* Chart type — hidden in comparison mode */}
            {!isComparison && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.chartType')}
                    </label>
                    <div className="flex gap-1">
                        {CHART_TYPES.map((ct) => (
                            <button
                                key={ct.id}
                                onClick={() => update({ chartType: ct.id })}
                                className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                style={{
                                    background: s.chartType === ct.id ? 'var(--accent)' : 'var(--app-bg)',
                                    color: s.chartType === ct.id ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${s.chartType === ct.id ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {ct.label()}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Colour and number format (issue #600) share one row: three narrow controls that would
                otherwise each claim the full width of the detail pane — the separator select in
                particular. The format is unset by default and then follows the chart-wide setting;
                a kWh line and a percentage line rarely want the same precision. */}
            <div className="aura-series-format flex gap-1.5 items-end" style={{ maxWidth: 540 }}>
                <div className="shrink-0" style={{ width: 168 }}>
                    <label className="text-[11px] mb-1 block truncate" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.color')}
                    </label>
                    <div className="flex gap-1.5 items-center">
                        <ColorPicker
                            value={s.color ?? '#3b82f6'}
                            onChange={(v) => update({ color: v })}
                            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent shrink-0"
                        />
                        <input
                            type="text"
                            value={s.color ?? '#3b82f6'}
                            onChange={(e) => update({ color: e.target.value })}
                            className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                            style={inputStyle}
                            placeholder="#3b82f6"
                        />
                    </div>
                </div>
                <ValueFormatRow
                    decimals={s.decimals}
                    numberFormat={s.numberFormat}
                    onChange={(patch) => update(patch)}
                    inheritDecimals={chartDecimals}
                    inheritFormat={chartNumberFormat}
                    inheritLabel={t('echart.formatFollowChart')}
                    className="flex-1 min-w-0"
                />
            </div>

            {/* Y-Axis, Smooth, LineWidth, History — hidden in comparison mode */}
            {!isComparison && (
                <>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.yAxis')}
                        </label>
                        <div className="flex gap-1">
                            {([0, 1] as const).map((yi) => (
                                <button
                                    key={yi}
                                    onClick={() => update({ yAxisIndex: yi })}
                                    className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                    style={{
                                        background: (s.yAxisIndex ?? 0) === yi ? 'var(--accent)' : 'var(--app-bg)',
                                        color: (s.yAxisIndex ?? 0) === yi ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${(s.yAxisIndex ?? 0) === yi ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {yi === 0 ? t('echart.yLeft') : t('echart.yRight')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {s.chartType !== 'scatter' && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.stack')}
                                </label>
                                <button
                                    onClick={() => update({ stack: !s.stack })}
                                    className="relative w-9 h-5 rounded-full transition-colors"
                                    style={{
                                        background: s.stack ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                        style={{ left: s.stack ? '18px' : '2px' }}
                                    />
                                </button>
                            </div>
                            {s.stack && (
                                <p
                                    className="text-[10px] mt-1 leading-tight"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('echart.stackHint')}
                                </p>
                            )}
                            {/* A band outline sits on the band below it, so a series at 0
                                shows up as a line without an area — off by default. */}
                            {s.stack && s.chartType === 'area' && (
                                <>
                                    <div className="flex items-center justify-between mt-2">
                                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                            {t('echart.stackOutline')}
                                        </label>
                                        <button
                                            onClick={() =>
                                                update({
                                                    stackOutline: !s.stackOutline,
                                                })
                                            }
                                            className="relative w-9 h-5 rounded-full transition-colors"
                                            style={{
                                                background: s.stackOutline ? 'var(--accent)' : 'var(--app-border)',
                                            }}
                                        >
                                            <span
                                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                                style={{
                                                    left: s.stackOutline ? '18px' : '2px',
                                                }}
                                            />
                                        </button>
                                    </div>
                                    {!s.stackOutline && (
                                        <p
                                            className="text-[10px] mt-1 leading-tight"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {t('echart.stackOutlineHint')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {(s.chartType === 'line' || s.chartType === 'area') && (
                        <div className="flex items-center justify-between">
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('echart.smooth')}
                            </label>
                            <button
                                onClick={() => update({ smooth: !(s.smooth ?? true) })}
                                className="relative w-9 h-5 rounded-full transition-colors"
                                style={{
                                    background: (s.smooth ?? true) ? 'var(--accent)' : 'var(--app-border)',
                                }}
                            >
                                <span
                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                    style={{ left: (s.smooth ?? true) ? '18px' : '2px' }}
                                />
                            </button>
                        </div>
                    )}

                    {/* A stacked band without an outline draws no line at all, so the
                        width would have nothing to act on. */}
                    {(s.chartType === 'line' || s.chartType === 'area') &&
                        !(s.chartType === 'area' && s.stack && !s.stackOutline) && (
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {(s.lineWidth ?? 2) === 0
                                        ? t('echart.lineWidthNone')
                                        : t('echart.lineWidth', {
                                              value: s.lineWidth ?? 2,
                                          })}
                                </label>
                                <input
                                    type="range"
                                    min={0}
                                    max={4}
                                    step={1}
                                    value={s.lineWidth ?? 2}
                                    onChange={(e) =>
                                        update({
                                            lineWidth: Number(e.target.value),
                                        })
                                    }
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        )}

                    {/* Fill strength of the area. Auto = a stacked band shows the colour
                        it was given, a single area stays a wash (issue #557). */}
                    {s.chartType === 'area' && (
                        <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                {s.areaOpacity === undefined
                                    ? t('echart.areaOpacityAuto', {
                                          value: s.stack ? 100 : 20,
                                      })
                                    : t('echart.areaOpacity', { value: s.areaOpacity })}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    step={5}
                                    value={s.areaOpacity ?? (s.stack ? 100 : 20)}
                                    onChange={(e) =>
                                        update({
                                            areaOpacity: Number(e.target.value),
                                        })
                                    }
                                    className="flex-1 accent-[var(--accent)]"
                                />
                                <button
                                    onClick={() => update({ areaOpacity: undefined })}
                                    className="text-[10px] px-2 py-1 rounded-lg shrink-0"
                                    style={{
                                        background: s.areaOpacity === undefined ? 'var(--accent)' : 'var(--app-bg)',
                                        color: s.areaOpacity === undefined ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${s.areaOpacity === undefined ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    Auto
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Values at the data points, per series: the bars want their
                        numbers, the temperature line over them does not (issue #584). */}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.seriesShowValues')}
                        </label>
                        <div className="flex gap-1">
                            {SERIES_VALUE_MODES.map((m) => {
                                const active = s.showValues === m.value;
                                return (
                                    <button
                                        key={m.key}
                                        onClick={() => update({ showValues: m.value })}
                                        className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {m.value === undefined
                                            ? t('echart.seriesShowValuesAuto', {
                                                  value: echartShowValues ? t('common.on') : t('common.off'),
                                              })
                                            : t(m.value ? 'common.on' : 'common.off')}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Thinning out one bar of a comparison chart would drop the
                            whole series, so the interval stays out of that mode. */}
                        {!isComparison && (s.showValues ?? echartShowValues) && (
                            <div className="mt-1.5">
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {(s.labelInterval ?? 1) > 1
                                        ? t('echart.labelInterval', {
                                              value: s.labelInterval ?? 1,
                                          })
                                        : t('echart.labelIntervalAll')}
                                </label>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={s.labelInterval ?? 1}
                                    onChange={(e) =>
                                        update({
                                            labelInterval: Number(e.target.value),
                                        })
                                    }
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        )}
                    </div>

                    {seriesIsJson && (
                        <ChartSeriesJsonPanel
                            s={s}
                            probe={probe}
                            isJson={isJson}
                            jsonTimeAxis={jsonTimeAxis}
                            jsonAxisBounds={jsonAxisBounds}
                            update={update}
                            onWidgetOption={onWidgetOption}
                        />
                    )}

                    {!seriesIsJson && (
                        <ChartSeriesHistoryPanel s={s} adState={adState} update={update} onDetect={onDetect} />
                    )}
                </>
            )}

            {pickerOpen && (
                <DatapointPicker
                    currentValue={s.datapointId ?? ''}
                    onSelect={(id) => {
                        onDatapointChange(id);
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </>
    );
}
