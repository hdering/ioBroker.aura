import { useState, useEffect } from 'react';
import { ChevronDown, Database, Trash2 } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';
import { ValueFormatRow } from './ValueFormatRow';
import type { NumberFormat } from '../../utils/formatValue';
import { getObjectDirect, getStateDirect } from '../../hooks/useIoBroker';
import { detectHistoryAdapters, RANGE_LABELS } from '../../hooks/useChartHistory';
import {
    detectJsonKeys,
    parseJsonAxisBounds,
    parseTimeLabel,
    resolveJsonArray,
    suggestJsonArrayPaths,
    type EChartSeriesConfig,
    type EChartTimeRange,
} from '../../hooks/useMultiSeriesData';
import { useT } from '../../i18n';
import { DatapointManagerField } from './list/DatapointManagerField';
import type { ManagedEntry } from './list/EntryListItem';
import { ChartModeToggle, type EChartMode } from './chart/ChartModeToggle';
import { ChartSeriesDetail } from './chart/ChartSeriesDetail';
import { ChartValuesPanel } from './chart/ChartValuesPanel';
import { CHART_TYPES, inputCls, inputStyle, type JsonProbe, type SeriesAdapterState } from './chart/chartShared';

interface EChartConfigProps {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const CHART_RANGES: EChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d', '1y', 'total', 'custom'];

function generateId(): string {
    return Math.random().toString(36).slice(2, 9);
}

/**
 * One y-axis bound (min or max). Three sources, in the order they win at runtime: a datapoint that
 * delivers the bound live, the payload's own min/max block in JSON mode, the fixed number typed in
 * here (issue #550). `dataMin`/`dataMax` leave the bound to the data.
 *
 * A picked datapoint replaces the number field instead of sitting beside it — it overrules the
 * number anyway, and showing both invites the reading that they are added up.
 */
function AxisBoundRow({
    valueKey,
    dpKey,
    autoToken,
    placeholder,
    o,
    setO,
    onPickDp,
}: {
    valueKey: string;
    dpKey: string;
    autoToken: 'dataMin' | 'dataMax';
    placeholder: string;
    o: Record<string, unknown>;
    setO: (patch: Record<string, unknown>) => void;
    onPickDp: () => void;
}) {
    const tr = useT();
    const raw = (o[valueKey] as string | number | undefined) ?? '';
    const dpId = (o[dpKey] as string | undefined) ?? '';
    const isAuto = raw === autoToken;
    return (
        <div className="flex gap-1.5 items-center">
            {dpId ? (
                <div
                    className="flex-1 min-w-0 flex items-center gap-1 text-[11px] px-2.5 py-2 rounded-lg font-mono"
                    style={inputStyle}
                    title={dpId}
                >
                    <span className="truncate">{dpId}</span>
                    <button
                        onClick={() => setO({ [dpKey]: undefined })}
                        className="ml-auto shrink-0 hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                        title={tr('echart.boundDpClear')}
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            ) : isAuto ? (
                <div className="flex-1 text-[11px] px-2.5 py-2 rounded-lg font-mono" style={inputStyle}>
                    {autoToken}
                </div>
            ) : (
                <input
                    type="number"
                    value={String(raw)}
                    onChange={(e) => setO({ [valueKey]: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    placeholder={placeholder}
                    className={`${inputCls} flex-1`}
                    style={inputStyle}
                />
            )}
            <button
                onClick={onPickDp}
                className="px-2 py-1.5 rounded-lg shrink-0 hover:opacity-80"
                style={{
                    background: dpId ? 'var(--accent)' : 'var(--app-bg)',
                    color: dpId ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${dpId ? 'var(--accent)' : 'var(--app-border)'}`,
                }}
                title={tr('echart.boundFromDp')}
            >
                <Database size={12} />
            </button>
            {!dpId && (
                <button
                    onClick={() => setO({ [valueKey]: isAuto ? undefined : autoToken })}
                    className="text-[10px] px-2 py-1.5 rounded-lg shrink-0"
                    style={{
                        background: isAuto ? 'var(--accent)' : 'var(--app-bg)',
                        color: isAuto ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${isAuto ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                >
                    Auto
                </button>
            )}
        </div>
    );
}

export function EChartConfig({ config, onConfigChange }: EChartConfigProps) {
    const t = useT();
    const o = config.options ?? {};
    const series = (o.echartSeries as EChartSeriesConfig[] | undefined) ?? [];
    const echartMode = (o.echartMode as string | undefined) ?? 'timeseries';
    const isComparison = echartMode === 'comparison';
    const isJson = echartMode === 'json';
    const jsonTimeAxis = (o.echartJsonTimeAxis as boolean | undefined) ?? false;
    const echartShowLegend = (o.echartShowLegend as boolean | undefined) ?? true;
    const echartShowYAxis = (o.echartShowYAxis as boolean | undefined) ?? true;
    const echartShowYAxisRight = (o.echartShowYAxisRight as boolean | undefined) ?? true;
    // The right-axis switch only means something once a series actually sits on that axis.
    const usesRightAxis = series.some((s) => (s.yAxisIndex ?? 0) === 1);
    const echartShowXAxis = (o.echartShowXAxis as boolean | undefined) ?? true;
    const echartShowGridLines = (o.echartShowGridLines as boolean | undefined) ?? true;
    const echartAnimation = (o.echartAnimation as boolean | undefined) ?? true;
    const echartShowCurrent = (o.echartShowCurrent as boolean | undefined) ?? true;
    const echartCurrentFrom = (o.echartCurrentFrom as 'last' | 'first' | undefined) ?? 'last';
    const echartCurrentAlign = (o.echartCurrentAlign as 'right' | 'left' | undefined) ?? 'right';
    // Comparison charts have always labelled their bars — keep that as their default (issue #543).
    const echartShowValues = (o.echartShowValues as boolean | undefined) ?? isComparison;
    // Share of the stack total at the data point (issue #569) — only offered once something stacks.
    const echartShowStackPercent = (o.echartShowStackPercent as boolean | undefined) ?? false;
    const anyStack = series.some((s) => s.stack);
    // Single widget-level range (replaces the former per-series ranges). Falls back to the
    // first series' old range so existing widgets keep their configured window after upgrade.
    const echartRange = (o.echartRange as EChartTimeRange | undefined) ?? series[0]?.historyRange ?? '24h';
    const echartRangeCustomValue =
        (o.echartRangeCustomValue as number | undefined) ?? series[0]?.historyRangeCustomValue ?? 24;
    const echartRangeCustomUnit =
        (o.echartRangeCustomUnit as 'h' | 'd' | undefined) ?? series[0]?.historyRangeCustomUnit ?? 'h';
    const lockRange = (o.lockRange as boolean | undefined) ?? false;
    const dayNav = (o.echartDayNav as boolean | undefined) ?? false;
    // Which presets the frontend range selector offers (default: all).
    const frontendPresets = CHART_RANGES.filter((r) => r !== 'custom');
    const visibleRanges = (o.echartVisibleRanges as EChartTimeRange[] | undefined) ?? frontendPresets;
    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    /**
     * The mode NEVER touches the series. It used to normalise their data sources — every series
     * to `json` in the JSON mode, back to `history` in the other two — which quietly flattened a
     * configured chart: a look into another mode and back left a JSON series reading history.
     * The JSON mode overrides the source where the data is read instead (see `sourceOf` in
     * EChartWidget), so switching the mode is lossless in every direction.
     */
    const setMode = (mode: 'timeseries' | 'comparison' | 'json') => setO({ echartMode: mode });
    const toggleVisibleRange = (r: EChartTimeRange) => {
        const next = visibleRanges.includes(r)
            ? visibleRanges.filter((x) => x !== r)
            : frontendPresets.filter((x) => visibleRanges.includes(x) || x === r);
        if (next.length === 0) return; // keep at least one preset selectable
        setO({ echartVisibleRanges: next });
    };
    const anyHistory = series.some((s) => !!s.historyInstance);
    /**
     * The series as rows of the dialog's master list. A series is named by hand, so `label` is
     * always set and the resolved-name lookup stays empty; its datapoint goes on the second line,
     * because a list of names alone says nothing about what is plotted.
     */
    const managedEntries: ManagedEntry[] = series.map((s) => {
        const typeLabel = CHART_TYPES.find((ct) => ct.id === s.chartType)?.label() ?? s.chartType;
        const source = s.source === 'json' || isJson ? t('echart.sourceJson') : null;
        const dp = s.datapointId || t('echart.noDatapoint');
        return {
            id: s.id,
            label: s.name,
            color: s.color ?? '#3b82f6',
            sublabel: [source ?? typeLabel, dp].join(' · '),
        };
    });
    const echartLeftUnit = (o.echartLeftUnit as string | undefined) ?? '';
    const echartRightUnit = (o.echartRightUnit as string | undefined) ?? '';
    const jsonAxisBounds = (o.echartJsonAxisBounds as boolean | undefined) ?? false;
    const echartJsonExtra = (o.echartJsonExtra as string | undefined) ?? '';

    /** Option key of the axis bound whose datapoint is being picked, e.g. `echartLeftMaxDp`. */
    const [pickerForBound, setPickerForBound] = useState<string | null>(null);
    const [adapterStates, setAdapterStates] = useState<Record<string, SeriesAdapterState>>({});
    const [jsonOpen, setJsonOpen] = useState(false);
    const [jsonProbes, setJsonProbes] = useState<Record<string, JsonProbe>>({});

    const setSeries = (next: EChartSeriesConfig[]) => setO({ echartSeries: next });

    const updateSeries = (id: string, patch: Partial<EChartSeriesConfig>) => {
        setSeries(series.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    };

    /**
     * Store a series' value conversion (issue #540). A preset's suggested unit lands on the axis
     * the series is plotted against — the unit lives on the widget, not on the series, so picking
     * "W → kW" relabels the axis in one go. Both halves go into a single onConfigChange: series and
     * unit sit in the same options object, so two separate calls would overwrite each other.
     */
    const setSeriesTransform = (
        id: string,
        patch: { valueTransform?: string; valueFactor?: number; valueOffset?: number; unit?: string },
    ) => {
        const { unit, ...rest } = patch;
        const next = series.map((s) => (s.id === id ? { ...s, ...rest } : s));
        const target = series.find((s) => s.id === id);
        const axisKey = (target?.yAxisIndex ?? 0) === 1 ? 'echartRightUnit' : 'echartLeftUnit';
        setO(unit ? { echartSeries: next, [axisKey]: unit } : { echartSeries: next });
    };

    const addSeries = () => {
        const newId = generateId();
        const newSeries: EChartSeriesConfig = {
            id: newId,
            name: `Serie ${series.length + 1}`,
            datapointId: '',
            chartType: 'line',
            color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][series.length % 6],
            source: isJson ? 'json' : 'history',
            historyRange: '24h',
            smooth: true,
            yAxisIndex: 0,
            lineWidth: 2,
        };
        setSeries([...series, newSeries]);
    };

    const removeSeries = (id: string) => {
        setSeries(series.filter((s) => s.id !== id));
    };

    /** Drag & drop in the dialog's master list: move one series to another position. */
    const reorderSeries = (from: number, to: number) => {
        if (from === to || from < 0 || from >= series.length) return;
        const next = [...series];
        const [moved] = next.splice(from, 1);
        next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
        setSeries(next);
    };

    /**
     * A series got a new datapoint. The cached adapter detection is keyed by series id, so it has
     * to go — otherwise the new datapoint would keep the old datapoint's history instances.
     */
    const changeSeriesDatapoint = (id: string, datapointId: string) => {
        updateSeries(id, { datapointId });
        if (!datapointId) return;
        setAdapterStates((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    // Read the actual datapoint value of every JSON series to learn its structure: which keys
    // exist, which ones hold label and value, and whether the labels are timestamps. Without
    // this the two key fields are pure guesswork for anyone who hasn't read the docs.
    // Probed per series, not per mode: a timeseries chart may hold JSON series next to history
    // ones (issue #595), so the source flag decides — with the JSON mode forcing it on.
    const jsonSeries = series.filter((s) => isJson || s.source === 'json');
    const jsonProbeKey = jsonSeries
        .map((s) => `${s.id}:${s.datapointId}:${s.jsonPath ?? ''}:${s.jsonAxisPath ?? ''}`)
        .join(',');
    useEffect(() => {
        for (const s of jsonSeries) {
            if (!s.datapointId || s.datapointId.includes('{{')) continue;
            getStateDirect(s.datapointId)
                .then((state) => {
                    const arr = resolveJsonArray(state?.val, s.jsonPath);
                    if (!arr) {
                        setJsonProbes((prev) => ({
                            ...prev,
                            [s.id]: {
                                done: true,
                                invalid: true,
                                // Say where the arrays actually are instead of only that this
                                // path holds none (issue #550).
                                arrayPaths: suggestJsonArrayPaths(state?.val),
                                keys: [],
                                entries: 0,
                                timeLike: false,
                            },
                        }));
                        return;
                    }
                    const first = arr.find((i) => !!i && typeof i === 'object' && !Array.isArray(i)) as
                        | Record<string, unknown>
                        | undefined;
                    const keys = first ? Object.keys(first) : [];
                    const detected = first ? detectJsonKeys(first) : {};
                    const labelKey = s.jsonLabelKey || detected.labelKey;
                    const valueKey = s.jsonValueKey || detected.valueKey;
                    // Sample the first entries rather than all of them — enough to tell a
                    // timestamp column from a text one without walking a 1000-point array.
                    const sample = arr.slice(0, 10).filter((i) => !!i && typeof i === 'object') as Record<
                        string,
                        unknown
                    >[];
                    const labels = labelKey ? sample.map((i) => String(i[labelKey] ?? '')) : [];
                    const timeLike = labels.length > 0 && labels.every((l) => parseTimeLabel(l) !== null);
                    setJsonProbes((prev) => ({
                        ...prev,
                        [s.id]: {
                            done: true,
                            keys,
                            labelKey,
                            valueKey,
                            sampleLabel: labelKey && first ? String(first[labelKey] ?? '') : undefined,
                            sampleValue: valueKey && first ? String(first[valueKey] ?? '') : undefined,
                            bounds: parseJsonAxisBounds(state?.val, s),
                            entries: arr.length,
                            timeLike,
                        },
                    }));
                })
                .catch(() => {
                    setJsonProbes((prev) => ({
                        ...prev,
                        [s.id]: { done: true, invalid: true, keys: [], entries: 0, timeLike: false },
                    }));
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jsonProbeKey]);

    // Timestamp labels only make sense on a time axis — switch it on the first time we see them,
    // unless the user has already made a choice.
    useEffect(() => {
        if (!isJson || o.echartJsonTimeAxis !== undefined) return;
        const probes = series.map((s) => jsonProbes[s.id]).filter((p) => p?.done && !p.invalid);
        if (probes.length > 0 && probes.every((p) => p.timeLike)) setO({ echartJsonTimeAxis: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isJson, jsonProbes, o.echartJsonTimeAxis]);

    // Detect history adapters when datapoint changes
    useEffect(() => {
        for (const s of series) {
            // Template datapoints ({{dp}}, {{parent}}.x) can't be resolved to a real object,
            // so adapter detection is skipped — a free-text instance field is shown instead.
            if (!s.datapointId || s.datapointId.includes('{{')) continue;
            // JSON series read the datapoint value directly — no history adapter involved.
            // In the JSON mode that goes for every series, whatever its stored source says.
            if (isJson || s.source === 'json') continue;
            const existing = adapterStates[s.id];
            // Only re-detect if we haven't already
            if (existing) continue;
            setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters: [], checking: true } }));
            getObjectDirect(s.datapointId)
                .then((obj) => {
                    const custom = obj?.common?.custom;
                    const adapters = custom
                        ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>)
                        : [];
                    setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters, checking: false } }));
                    // Auto-select the only history adapter when none is chosen yet.
                    if (adapters.length === 1 && !s.historyInstance) {
                        updateSeries(s.id, { historyInstance: adapters[0].instance });
                    }
                })
                .catch(() => {
                    setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters: [], checking: false } }));
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series.map((s) => s.datapointId).join(',')]);

    const refreshAdapters = (id: string, datapointId: string) => {
        if (!datapointId) return;
        setAdapterStates((prev) => ({ ...prev, [id]: { adapters: [], checking: true } }));
        getObjectDirect(datapointId)
            .then((obj) => {
                const custom = obj?.common?.custom;
                const adapters = custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : [];
                setAdapterStates((prev) => ({ ...prev, [id]: { adapters, checking: false } }));
                // Auto-select the only history adapter when none is chosen yet.
                const cur = series.find((x) => x.id === id);
                if (adapters.length === 1 && !cur?.historyInstance) {
                    updateSeries(id, { historyInstance: adapters[0].instance });
                }
            })
            .catch(() => {
                setAdapterStates((prev) => ({ ...prev, [id]: { adapters: [], checking: false } }));
            });
    };

    return (
        <div className="aura-scroll flex flex-col gap-0 overflow-y-auto" style={{ maxHeight: '80vh' }}>
            {/* ── Mode + series ───────────────────────────────────────────────────
                Both live in the "Datenpunkte verwalten" dialog: the series editor alone had
                grown past a thousand lines and pushed the global settings out of reach. */}
            <div className="mb-3">
                <DatapointManagerField
                    title={t('echart.manageSeries')}
                    label={t('echart.manageSeries')}
                    storageKey="aura-echart-dp-modal"
                    hint={t('echart.manageSeriesHint')}
                    count={series.length}
                    entries={managedEntries}
                    resolvedNames={{}}
                    entriesTabLabel={t('echart.seriesTab')}
                    selectHint={t('echart.pickSeries')}
                    emptyState={t('echart.noSeriesYet')}
                    addLabel={t('echart.addSeries')}
                    header={<ChartModeToggle mode={echartMode as EChartMode} onChange={setMode} />}
                    tabs={[
                        {
                            key: 'values',
                            label: t('echart.valuesTab'),
                            node: (
                                <ChartValuesPanel
                                    showValues={echartShowValues}
                                    showStackPercent={echartShowStackPercent}
                                    anyStack={anyStack}
                                    onChange={setO}
                                />
                            ),
                        },
                    ]}
                    onAdd={addSeries}
                    onRemove={removeSeries}
                    onRemoveAll={() => setO({ echartSeries: [] })}
                    onReorder={reorderSeries}
                    renderDetail={(id) => {
                        const s = series.find((x) => x.id === id);
                        if (!s) return null;
                        return (
                            <ChartSeriesDetail
                                s={s}
                                isComparison={isComparison}
                                isJson={isJson}
                                echartShowValues={echartShowValues}
                                jsonTimeAxis={jsonTimeAxis}
                                jsonAxisBounds={jsonAxisBounds}
                                probe={jsonProbes[s.id]}
                                adState={adapterStates[s.id]}
                                update={(patch) => updateSeries(s.id, patch)}
                                onTransform={(patch) => setSeriesTransform(s.id, patch)}
                                onDatapointChange={(dpId) => changeSeriesDatapoint(s.id, dpId)}
                                onDetect={() => refreshAdapters(s.id, s.datapointId)}
                                onWidgetOption={setO}
                            />
                        );
                    }}
                />
            </div>

            {/* ── Global settings ──────────────────────────────────────────────── */}
            <div className="mt-3">
                <div className="h-px mb-2" style={{ background: 'var(--app-border)' }} />
                <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.globalSettings')}
                </p>

                {/* Show legend */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.showLegend')}
                    </label>
                    <button
                        onClick={() => setO({ echartShowLegend: !echartShowLegend })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartShowLegend ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartShowLegend ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Show Y-axis scale */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.showYAxis')}
                    </label>
                    <button
                        onClick={() => setO({ echartShowYAxis: !echartShowYAxis })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartShowYAxis ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartShowYAxis ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Show right Y-axis scale (only relevant when a series uses it) */}
                {usesRightAxis && echartShowYAxis && (
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.showYAxisRight')}
                        </label>
                        <button
                            onClick={() => setO({ echartShowYAxisRight: !echartShowYAxisRight })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: echartShowYAxisRight ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: echartShowYAxisRight ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                )}

                {/* Show X-axis scale */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.showXAxis')}
                    </label>
                    <button
                        onClick={() => setO({ echartShowXAxis: !echartShowXAxis })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartShowXAxis ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartShowXAxis ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Horizontal grid lines */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.gridLines')}
                    </label>
                    <button
                        onClick={() => setO({ echartShowGridLines: !echartShowGridLines })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartShowGridLines ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartShowGridLines ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Animation */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.animation')}
                    </label>
                    <button
                        onClick={() => setO({ echartAnimation: !echartAnimation })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartAnimation ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartAnimation ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Show current value */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.showCurrentValue')}
                    </label>
                    <button
                        onClick={() => setO({ echartShowCurrent: !echartShowCurrent })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: echartShowCurrent ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: echartShowCurrent ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Which point counts as "current", and where the block sits */}
                {echartShowCurrent && (
                    <div className="mb-2 pl-2" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.currentValueSource')}
                        </label>
                        <div className="flex gap-1">
                            {(['last', 'first'] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setO({ echartCurrentFrom: v })}
                                    className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                    style={{
                                        background: echartCurrentFrom === v ? 'var(--accent)' : 'var(--app-bg)',
                                        color: echartCurrentFrom === v ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${echartCurrentFrom === v ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {v === 'last' ? t('echart.currentValueLast') : t('echart.currentValueFirst')}
                                </button>
                            ))}
                        </div>
                        <label className="text-[11px] mt-2 mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.currentValueAlign')}
                        </label>
                        <div className="flex gap-1">
                            {(['left', 'right'] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setO({ echartCurrentAlign: v })}
                                    className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                    style={{
                                        background: echartCurrentAlign === v ? 'var(--accent)' : 'var(--app-bg)',
                                        color: echartCurrentAlign === v ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${echartCurrentAlign === v ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {v === 'left' ? t('echart.alignLeft') : t('echart.alignRight')}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Time range — one window shared by all series, frontend-switchable unless locked */}
                {anyHistory && (
                    <div className="mb-2">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.timeRange')}
                        </label>
                        <div className="flex gap-1 flex-wrap">
                            {CHART_RANGES.map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setO({ echartRange: r })}
                                    className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                    style={{
                                        background: echartRange === r ? 'var(--accent)' : 'var(--app-bg)',
                                        color: echartRange === r ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${echartRange === r ? 'var(--accent)' : 'var(--app-border)'}`,
                                        minWidth: 36,
                                    }}
                                >
                                    {RANGE_LABELS[r]}
                                </button>
                            ))}
                        </div>
                        {echartRange === 'custom' && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={echartRangeCustomValue}
                                    onChange={(e) =>
                                        setO({ echartRangeCustomValue: Math.max(1, Number(e.target.value) || 1) })
                                    }
                                    className="w-16 text-xs rounded-md px-2 py-1 text-center focus:outline-none"
                                    style={inputStyle}
                                />
                                {(['h', 'd'] as const).map((u) => (
                                    <button
                                        key={u}
                                        onClick={() => setO({ echartRangeCustomUnit: u })}
                                        className="text-[11px] px-2 py-1 rounded-md transition-opacity hover:opacity-80"
                                        style={{
                                            background: echartRangeCustomUnit === u ? 'var(--accent)' : 'var(--app-bg)',
                                            color: echartRangeCustomUnit === u ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${echartRangeCustomUnit === u ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {u === 'h' ? t('echart.unitHoursShort') : t('echart.unitDaysShort')}
                                    </button>
                                ))}
                            </div>
                        )}
                        {!lockRange && (
                            <div className="mt-2">
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    {t('echart.visibleRanges')}
                                </label>
                                <div className="flex gap-1 flex-wrap">
                                    {frontendPresets.map((r) => {
                                        const active = visibleRanges.includes(r);
                                        return (
                                            <button
                                                key={r}
                                                onClick={() => toggleVisibleRange(r)}
                                                className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                    minWidth: 36,
                                                }}
                                            >
                                                {RANGE_LABELS[r]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={lockRange}
                                onChange={(e) => setO({ lockRange: e.target.checked })}
                                className="rounded"
                            />
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('echart.lockRangeToggle')}
                            </span>
                        </label>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={dayNav}
                                onChange={(e) => setO({ echartDayNav: e.target.checked })}
                                className="rounded"
                            />
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('echart.dayNavToggle')}
                            </span>
                        </label>
                    </div>
                )}

                {/* Decimal places + thousands separator */}
                <div className="mb-2">
                    <ValueFormatRow
                        decimals={o.decimals as number | undefined}
                        numberFormat={o.numberFormat as NumberFormat | undefined}
                        onChange={setO}
                    />
                </div>

                {/* Left Y-Axis */}
                <div className="mb-2">
                    <p className="text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.yAxisLeft')}
                    </p>
                    <div className="flex gap-1.5 mb-1">
                        <input
                            type="text"
                            value={echartLeftUnit}
                            onChange={(e) => setO({ echartLeftUnit: e.target.value || undefined })}
                            placeholder={t('echart.unitLeft')}
                            className={`${inputCls} flex-1`}
                            style={inputStyle}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <AxisBoundRow
                            valueKey="echartLeftMin"
                            dpKey="echartLeftMinDp"
                            autoToken="dataMin"
                            placeholder={t('echart.min')}
                            o={o}
                            setO={setO}
                            onPickDp={() => setPickerForBound('echartLeftMinDp')}
                        />
                        <AxisBoundRow
                            valueKey="echartLeftMax"
                            dpKey="echartLeftMaxDp"
                            autoToken="dataMax"
                            placeholder={t('echart.max')}
                            o={o}
                            setO={setO}
                            onPickDp={() => setPickerForBound('echartLeftMaxDp')}
                        />
                    </div>
                </div>

                {/* Right Y-Axis */}
                <div className="mb-2">
                    <p className="text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.yAxisRight')}
                    </p>
                    <div className="flex gap-1.5 mb-1">
                        <input
                            type="text"
                            value={echartRightUnit}
                            onChange={(e) => setO({ echartRightUnit: e.target.value || undefined })}
                            placeholder={t('echart.unitRight')}
                            className={`${inputCls} flex-1`}
                            style={inputStyle}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <AxisBoundRow
                            valueKey="echartRightMin"
                            dpKey="echartRightMinDp"
                            autoToken="dataMin"
                            placeholder={t('echart.min')}
                            o={o}
                            setO={setO}
                            onPickDp={() => setPickerForBound('echartRightMinDp')}
                        />
                        <AxisBoundRow
                            valueKey="echartRightMax"
                            dpKey="echartRightMaxDp"
                            autoToken="dataMax"
                            placeholder={t('echart.max')}
                            o={o}
                            setO={setO}
                            onPickDp={() => setPickerForBound('echartRightMaxDp')}
                        />
                    </div>
                </div>
            </div>

            {/* ── JSON Override ─────────────────────────────────────────────────── */}
            <div className="mt-1">
                <div className="h-px mb-2" style={{ background: 'var(--app-border)' }} />
                <button
                    onClick={() => setJsonOpen((v) => !v)}
                    className="flex items-center gap-1.5 w-full text-[11px] font-semibold mb-1 hover:opacity-80 text-left"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ChevronDown
                        size={12}
                        style={{ transform: jsonOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                    />
                    {t('echart.jsonOverride')}
                    {echartJsonExtra && (
                        <span
                            className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                        >
                            {t('echart.active')}
                        </span>
                    )}
                </button>
                {jsonOpen && (
                    <>
                        <p className="text-[10px] mb-1 leading-tight" style={{ color: 'var(--text-secondary)' }}>
                            {t('echart.jsonOverrideHint')}
                        </p>
                        <textarea
                            value={echartJsonExtra}
                            onChange={(e) => setO({ echartJsonExtra: e.target.value || undefined })}
                            placeholder={'{\n  "series": [...]\n}'}
                            rows={6}
                            className="w-full text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none resize-y"
                            style={inputStyle}
                        />
                    </>
                )}
            </div>

            {/* Datapoint Picker Modal */}
            {/* Datapoint picker for an axis bound */}
            {pickerForBound && (
                <DatapointPicker
                    currentValue={(o[pickerForBound] as string | undefined) ?? ''}
                    onSelect={(id) => {
                        setO({ [pickerForBound]: id || undefined });
                        setPickerForBound(null);
                    }}
                    onClose={() => setPickerForBound(null)}
                />
            )}
        </div>
    );
}
