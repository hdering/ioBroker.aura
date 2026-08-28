import ReactECharts from 'echarts-for-react';
import { useRef, useState, useEffect } from 'react';
import { BarChart2, CalendarDays, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import {
    useMultiSeriesData,
    useAutoHistoryInstances,
    rangeToMs,
    parseTimeLabel,
    type EChartSeriesConfig,
    type EChartTimeRange,
    type JsonAxisBounds,
} from '../../hooks/useMultiSeriesData';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { samplePreviewSeries } from '../../utils/sampleChartData';
import {
    bucketAxisLabel,
    bucketAxisMinInterval,
    bucketTooltipLabel,
    coarsestBucket,
    type ChartBucket,
} from '../../utils/chartFormat';
import {
    alignStackedSeries,
    areaOpacityFor,
    outlineWidthFor,
    stackIdFor,
    stackShares,
    type StackDatum,
} from '../../utils/stackedSeries';
import { openNativePicker } from '../common/DateTimeInput';
import { transformSign } from '../../utils/valueTransform';
import { axisIsZeroBased, gridLineAxis } from '../../utils/chartAxis';
import { useT } from '../../i18n';
import { RANGE_LABELS } from '../../hooks/useChartHistory';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Margin left over *outside* the axis labels. The grid runs with containLabel, so echarts
// measures the labels itself instead of us reserving a fixed 60px strip — short labels no
// longer leave a wide empty band next to the axis, long ones no longer get clipped (issue #541).
const AXIS_GAP = 6;
// containLabel does not know that the outermost y label sticks out half a line above and below
// the grid, so top/bottom keep a line's worth of room — otherwise the "0" is cut off.
const AXIS_GAP_V = 14;

const PRESET_RANGES: EChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d', '1y', 'total'];

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const s = source[key];
        const t = result[key];
        const sIsPlainObj = !!s && typeof s === 'object' && !Array.isArray(s);
        if (sIsPlainObj && Array.isArray(t)) {
            // Object override on array target: apply object as defaults to each item
            // (e.g. `series: { type: 'line', step: 'end' }` applied to all series entries)
            result[key] = (t as unknown[]).map((item) =>
                item && typeof item === 'object' && !Array.isArray(item)
                    ? deepMerge(item as Record<string, unknown>, s as Record<string, unknown>)
                    : item,
            );
        } else if (sIsPlainObj && t && typeof t === 'object' && !Array.isArray(t)) {
            result[key] = deepMerge(t as Record<string, unknown>, s as Record<string, unknown>);
        } else {
            result[key] = s;
        }
    }
    return result;
}

/**
 * An axis bound read from a datapoint, as a number — `undefined` when the datapoint is unset,
 * empty or holds something non-numeric, so the next fallback in the chain takes over.
 */
function boundValue(v: boolean | number | string | null | undefined): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return undefined;
}

export function EChartWidget({ config, editMode }: WidgetProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const t = useT();

    const layout = config.layout ?? 'default';

    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, BarChart2);
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const numFmt = (o.numberFormat as NumberFormat | undefined) ?? globalNumFmt;
    const echartSeries = (o.echartSeries as EChartSeriesConfig[] | undefined) ?? [];
    const echartShowLegend = (o.echartShowLegend as boolean | undefined) ?? true;
    const echartLeftUnit = (o.echartLeftUnit as string | undefined) ?? '';
    const echartRightUnit = (o.echartRightUnit as string | undefined) ?? '';
    const echartLeftMin = o.echartLeftMin as number | string | undefined;
    const echartLeftMax = o.echartLeftMax as number | string | undefined;
    const echartRightMin = o.echartRightMin as number | string | undefined;
    const echartRightMax = o.echartRightMax as number | string | undefined;
    const echartJsonExtra = (o.echartJsonExtra as string | undefined) ?? '';
    // Both axis bounds can come from outside the config instead of being typed in: one datapoint
    // per bound (any mode), and in JSON mode a min/max block inside the payload itself (issue #550).
    const echartJsonAxisBounds = (o.echartJsonAxisBounds as boolean | undefined) ?? false;
    const leftMinDp = useDatapoint((o.echartLeftMinDp as string | undefined) ?? '');
    const leftMaxDp = useDatapoint((o.echartLeftMaxDp as string | undefined) ?? '');
    const rightMinDp = useDatapoint((o.echartRightMinDp as string | undefined) ?? '');
    const rightMaxDp = useDatapoint((o.echartRightMaxDp as string | undefined) ?? '');
    const echartShowYAxis = (o.echartShowYAxis as boolean | undefined) ?? true;
    // The right axis can be silenced on its own: a second series often only needs its own scale,
    // not a second set of numbers eating widget width (issue #541). Master switch still wins.
    const echartShowYAxisRight = echartShowYAxis && ((o.echartShowYAxisRight as boolean | undefined) ?? true);
    const echartShowXAxis = (o.echartShowXAxis as boolean | undefined) ?? true;
    const echartShowGridLines = (o.echartShowGridLines as boolean | undefined) ?? true;
    // Charts whose values, axes and time span keep changing look broken while echarts morphs
    // one state into the next, so the animation can be switched off entirely (issue #574).
    const echartAnimation = (o.echartAnimation as boolean | undefined) ?? true;
    const echartShowCurrent = (o.echartShowCurrent as boolean | undefined) ?? true;
    // Rolling payloads can be sorted newest-first, so the "current" value is then the leftmost
    // point instead of the rightmost one (issue #549). Position of the block is free as well.
    const echartCurrentFrom = (o.echartCurrentFrom as 'last' | 'first' | undefined) ?? 'last';
    const echartCurrentAlign = (o.echartCurrentAlign as 'right' | 'left' | undefined) ?? 'right';
    const currentBlockCls = `flex items-center gap-2 shrink-0 ${echartCurrentAlign === 'left' ? 'order-first' : 'ml-auto'}`;
    const echartMode = (o.echartMode as string | undefined) ?? 'timeseries';
    // Value labels at the data points. Comparison charts have always drawn them, so they stay
    // on there unless switched off explicitly; timeseries and JSON default to off (issue #543).
    const echartShowValues = (o.echartShowValues as boolean | undefined) ?? echartMode === 'comparison';
    /**
     * Per series the widget switch is only the default: bars usually want their numbers while the
     * temperature line over them reads better as a plain curve (issue #584).
     */
    const seriesShowValues = (s?: { showValues?: boolean }) => s?.showValues ?? echartShowValues;
    // Share of the stack total at the same data point, next to the value or instead of it
    // (issue #569). Only stacked series get one — see `stackShares`.
    const echartShowStackPercent = (o.echartShowStackPercent as boolean | undefined) ?? false;
    const isGauge = config.layout === ('gauge' as string);

    /** A stack share as a percentage. Whole percent is what a stack is read in; below 10 % one
     *  decimal keeps the thin slices apart instead of rounding a batch of them to the same 0 %. */
    const formatShare = (share: number) => `${formatNum(share * 100, share * 100 < 10 ? 1 : 0, numFmt)} %`;

    /**
     * Percentage suffix for the tooltip rows: each value's share of its stack at the hovered
     * index, computed from the rows echarts hands the formatter (issue #569). Stays empty while
     * the option is off, and for a stack only one series has a value at — 100 % of itself says
     * nothing.
     */
    const tooltipShare = (rows: { seriesIndex: number; num: number | null }[]) => {
        if (!echartShowStackPercent) return () => '';
        const acc = new Map<string, { total: number; count: number }>();
        for (const r of rows) {
            const cfg = echartSeries[r.seriesIndex];
            const id = cfg ? stackIdFor(cfg) : undefined;
            if (!id || r.num === null) continue;
            const a = acc.get(id) ?? { total: 0, count: 0 };
            a.total += Math.abs(r.num);
            a.count++;
            acc.set(id, a);
        }
        return (seriesIndex: number, num: number | null) => {
            const cfg = echartSeries[seriesIndex];
            const id = cfg ? stackIdFor(cfg) : undefined;
            const a = id ? acc.get(id) : undefined;
            if (!a || a.count < 2 || a.total === 0 || num === null) return '';
            return ` <span style="opacity:.7">${formatShare(Math.abs(num) / a.total)}</span>`;
        };
    };

    /**
     * Data-point labels, identical in every mode: the tooltip's formatter and the axis' unit.
     * `share` yields this series' share of its stack at a data index, and is only passed for
     * series that are actually stacked.
     */
    const valueLabel = (
        unit: string,
        opts: {
            /** Write the label into the mark instead of above it. */
            inside?: boolean;
            share?: (dataIndex: number) => number | null;
            /** Series the label belongs to — brings its own switch and its label interval. */
            series?: EChartSeriesConfig;
            /**
             * Point count of that series, so "every n-th" counts back from the newest point.
             * Omitted where one data item is a whole series (comparison mode) and thinning out
             * would silence entire bars.
             */
            count?: number;
        } = {},
    ) => {
        const { inside = false, share, series, count } = opts;
        const show = seriesShowValues(series);
        const withShare = echartShowStackPercent && !!share;
        if (!show && !withShare) return { show: false };
        // A dense series turns into a wall of numbers; every second or third point is enough to
        // read it by (issue #584). Counted from the last point, which keeps its label.
        const interval = count === undefined ? 1 : Math.max(1, Math.round(series?.labelInterval ?? 1));
        // A series drawn below the zero line (value factor ×−1, issue #594) has its "top" AT the
        // axis, so a label placed there lands inside the bars above it — put it under the mark.
        const drawsNegative = transformSign(series?.valueFactor) === -1;
        return {
            show: true,
            position: inside ? 'inside' : drawsNegative ? 'bottom' : 'top',
            color: inside ? '#fff' : '#888',
            fontSize: 10,
            formatter: (p: { value: number | [number, number] | null; dataIndex: number }) => {
                const v = Array.isArray(p.value) ? p.value[1] : p.value;
                if (v === null || v === undefined) return '';
                if (interval > 1 && ((count ?? 0) - 1 - p.dataIndex) % interval !== 0) return '';
                const parts: string[] = [];
                if (show) parts.push(`${formatNum(v, decimals, numFmt)}${unit ? ` ${unit}` : ''}`);
                if (withShare) {
                    const s = share(p.dataIndex);
                    // Both on: the percentage is the aside, so it goes in brackets behind the value.
                    if (s !== null) parts.push(show ? `(${formatShare(s)})` : formatShare(s));
                }
                return parts.join(' ');
            },
        };
    };
    // Dense series would otherwise stamp a label on every single point; echarts drops the
    // ones that would collide and keeps the rest readable.
    const valueLabelLayout =
        echartSeries.some((s) => seriesShowValues(s)) || echartShowStackPercent ? { hideOverlap: true } : undefined;
    /** Line labels hang on the symbols — echarts creates none while `showSymbol` is off. A
     *  percentage-only chart therefore needs them on the stacked series, and only there. */
    const labelSymbols = (s: EChartSeriesConfig) => seriesShowValues(s) || (echartShowStackPercent && !!s.stack);

    // ── Single widget-level range shared by all series (frontend-switchable unless locked) ──
    // Falls back to the first series' former per-series range so upgraded widgets keep their window.
    const cfgRange = (o.echartRange as EChartTimeRange | undefined) ?? echartSeries[0]?.historyRange ?? '24h';
    const cfgCustomVal =
        (o.echartRangeCustomValue as number | undefined) ?? echartSeries[0]?.historyRangeCustomValue ?? 24;
    const cfgCustomUnit =
        (o.echartRangeCustomUnit as 'h' | 'd' | undefined) ?? echartSeries[0]?.historyRangeCustomUnit ?? 'h';
    const lockRange = o.lockRange === true;
    // Which presets the frontend selector offers (config-selectable; default: all).
    const cfgVisibleRanges = o.echartVisibleRanges as EChartTimeRange[] | undefined;
    const visibleRanges =
        cfgVisibleRanges && cfgVisibleRanges.length > 0
            ? PRESET_RANGES.filter((r) => cfgVisibleRanges.includes(r))
            : PRESET_RANGES;

    const [activeRange, setActiveRange] = useState<EChartTimeRange>(cfgRange);
    const [activeCustomVal, setActiveCustomVal] = useState<number>(cfgCustomVal);
    const [activeCustomUnit, setActiveCustomUnit] = useState<'h' | 'd'>(cfgCustomUnit);

    // ── Day navigation (◀ Heute ▶): view a single calendar day, step day by day ──
    // null = normal rolling-range mode; number = offset in days from today (0 = today, -1 = yesterday …)
    const dayNav = o.echartDayNav === true;
    const [dayOffset, setDayOffset] = useState<number | null>(null);
    const dayWindow = (() => {
        if (!dayNav || dayOffset === null) return null;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + dayOffset);
        const e = new Date(d);
        e.setDate(e.getDate() + 1);
        return { start: d.getTime(), end: e.getTime() };
    })();
    const dayInputRef = useRef<HTMLInputElement>(null);

    // Reset frontend selection when the admin config changes
    useEffect(() => {
        setActiveRange(cfgRange);
        setActiveCustomVal(cfgCustomVal);
        setActiveCustomUnit(cfgCustomUnit);
    }, [cfgRange, cfgCustomVal, cfgCustomUnit]);

    // Popup charts opened from a value-display widget carry no history instance to inherit.
    // Detect the adapter per series from its resolved datapoint — auto-select the sole one,
    // or offer a selection field when several exist.
    const autoHistory = o.autoHistoryInstance === true;
    const { resolved, setPicked } = useAutoHistoryInstances(echartSeries, autoHistory);

    /**
     * Where a series takes its data from, with the mode having the last word. The JSON mode reads
     * every series out of its datapoint value — that is what the mode IS — so it overrides the
     * stored source instead of rewriting it: switching the mode has to be lossless, or a chart
     * that once passed through another mode comes back with its sources flattened.
     */
    const sourceOf = (s: EChartSeriesConfig): 'history' | 'json' =>
        echartMode === 'json' ? 'json' : (s.source ?? 'history');

    // All series share the single widget-level range; auto-resolved instances fill in where none
    // is configured.
    const effectiveSeries = echartSeries.map((s) => ({
        ...s,
        source: sourceOf(s),
        // JSON series never carry a history instance — auto-detection must not graft one on,
        // or the range selector would appear for data that has no time window.
        historyInstance: sourceOf(s) === 'json' ? undefined : (s.historyInstance ?? resolved[s.id]?.instance),
        historyRange: activeRange,
        historyRangeCustomValue: activeCustomVal,
        historyRangeCustomUnit: activeCustomUnit,
        // Day mode pins all series to one absolute calendar-day window.
        historyStart: dayWindow?.start,
        historyEnd: dayWindow?.end,
    }));

    const hasHistory = effectiveSeries.some((s) => !!s.historyInstance);

    // Series whose resolved DP has several history adapters → render a selection field each.
    const instancePickers = autoHistory
        ? echartSeries
              .filter((s) => !s.historyInstance && (resolved[s.id]?.adapters.length ?? 0) > 1)
              .map((s) => ({
                  id: s.id,
                  name: s.name,
                  adapters: resolved[s.id]!.adapters,
                  value: resolved[s.id]!.instance ?? '',
              }))
        : [];

    const seriesDataMap = useMultiSeriesData(effectiveSeries, connected, subscribe, getState);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hasSize, setHasSize] = useState(false);
    // Single ResizeObserver handles both initial sizing and tab-switch resize.
    // Avoids the two-effect race where the first effect returns early on visible
    // mount and the second effect never fires when switching to a hidden tab.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const check = () => {
            const w = containerRef.current?.clientWidth ?? 0;
            const h = containerRef.current?.clientHeight ?? 0;
            if (w > 0 && h > 0) {
                setHasSize(true);
                chartRef.current?.getEchartsInstance?.()?.resize?.();
            }
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (layout === 'custom') return <CustomGridView config={config} value="" />;

    const allLoading = echartSeries.length > 0 && echartSeries.every((s) => seriesDataMap.get(s.id)?.loading);
    // A JSON series fills `points`, never `data` — both count as "there is something to draw",
    // or a timeseries chart fed only by JSON payloads would claim to have no data (issue #595).
    const hasAnyData = echartSeries.some((s) => {
        const r = seriesDataMap.get(s.id);
        return (r?.data.length ?? 0) > 0 || (r?.points?.length ?? 0) > 0;
    });

    // In the popup editor the series datapoints are {{placeholders}} that can't resolve,
    // so there is no real data. Render representative sample curves instead of "Keine Daten".
    const isPreview =
        editMode &&
        echartSeries.length > 0 &&
        !hasAnyData &&
        echartSeries.some((s) => (s.datapointId ?? '').includes('{{'));
    const previewData = isPreview ? echartSeries.map((_, idx) => samplePreviewSeries(idx)) : null;
    // A window without records renders as a flat line instead of "Keine Daten":
    //   • day mode: flat zero — the browsed day simply had nothing to log (e.g. no rain);
    //   • rolling range: flat at the current value — a change-logged datapoint that
    //     didn't change in the window has been constant at its live value the whole time.
    const flatLineData = (current: number | null): [number, number][] => {
        const now = Date.now();
        if (dayWindow) {
            return [
                [dayWindow.start, 0],
                [Math.min(dayWindow.end, now), 0],
            ];
        }
        const val = current ?? 0;
        // `total` reports its floor (decades) rather than a real span — framing a flat line across
        // it would stretch the x axis over 20 empty years. With no records there is no recording
        // start to show anyway, so fall back to a day.
        const span = activeRange === 'total' ? 86_400_000 : rangeToMs(activeRange, activeCustomVal, activeCustomUnit);
        return [
            [now - span, val],
            [now, val],
        ];
    };
    /**
     * A JSON series' points as coordinates on the shared time axis (issue #595). Its labels are
     * timestamps rather than display labels, so the payload plots next to history data without
     * any resampling. Entries whose label is no timestamp are dropped: the time axis has no place
     * to put them, and the pure JSON mode's category axis is not available here.
     */
    const jsonTimePoints = (id: string): [number, number][] =>
        (seriesDataMap.get(id)?.points ?? [])
            .map((p): [number, number] | null => {
                const ts = parseTimeLabel(p.label);
                return ts === null ? null : [ts, p.value];
            })
            .filter((p): p is [number, number] => p !== null)
            .sort((a, b) => a[0] - b[0]);
    const seriesData = (idx: number, id: string): [number, number][] => {
        if (previewData) return previewData[idx];
        // JSON series bring their whole dataset in the datapoint value — no history, and hence
        // no flat-line fallback either: an empty payload simply has nothing to draw.
        const cfg = echartSeries[idx];
        if (cfg && sourceOf(cfg) === 'json') return jsonTimePoints(id);
        const r = seriesDataMap.get(id);
        const data = r?.data ?? [];
        // A delta series has no "constant since the last log" reading to draw flat — an empty
        // window simply means nothing was consumed, and no bars is the honest picture.
        if (echartSeries[idx]?.aggregate === 'delta') return data;
        if (data.length === 0 && r && !r.loading && (dayWindow !== null || !!effectiveSeries[idx]?.historyInstance)) {
            return flatLineData(r.current);
        }
        return data;
    };
    const seriesCurrent = (idx: number, id: string): number | null => {
        const fromFirst = echartCurrentFrom === 'first';
        if (previewData) {
            const pts = previewData[idx];
            return (fromFirst ? pts[0] : pts[pts.length - 1])[1];
        }
        // On the time axis a JSON payload is read in chronological order, not in the order the
        // array happens to be in — "last" has to mean the latest point, not the bottom row.
        const cfgCur = echartSeries[idx];
        if (cfgCur && sourceOf(cfgCur) === 'json') {
            const pts = jsonTimePoints(id);
            if (pts.length === 0) return seriesDataMap.get(id)?.current ?? null;
            return (fromFirst ? pts[0] : pts[pts.length - 1])[1];
        }
        const entry = seriesDataMap.get(id);
        let current = entry?.current ?? null;
        // "First" means the leftmost plotted point — the newest one for newest-first payloads.
        if (fromFirst) {
            const head = entry?.data?.[0]?.[1] ?? entry?.points?.[0]?.value;
            if (head !== undefined) current = head;
        }
        if (dayWindow && current === null && !entry?.loading) return 0;
        return current;
    };
    // Delta series draw no synthetic flat line, so "has history" alone doesn't mean there is
    // anything to render — an all-delta widget without bars must say "no data" rather than
    // show an empty axis frame.
    const allDelta = echartSeries.length > 0 && echartSeries.every((s) => s.aggregate === 'delta');
    const effHasData =
        isPreview ||
        hasAnyData ||
        (echartSeries.length > 0 && !allLoading && !allDelta && (dayWindow !== null || hasHistory));
    const effLoading = !isPreview && allLoading;

    // ── Shared y axes and current-value block (used by the timeseries and JSON branches) ──
    const hasRightAxis = echartSeries.some((s) => (s.yAxisIndex ?? 0) === 1);

    // Bounds a JSON payload asks for, per axis: the first series on that axis whose payload carries
    // a block wins — two payloads disagreeing about one axis cannot both be honoured.
    const jsonBoundsFor = (axis: 0 | 1): JsonAxisBounds | undefined => {
        if (!echartJsonAxisBounds) return undefined;
        for (const s of echartSeries) {
            if ((s.yAxisIndex ?? 0) !== axis) continue;
            const b = seriesDataMap.get(s.id)?.bounds;
            if (b && (b.min !== undefined || b.max !== undefined)) return b;
        }
        return undefined;
    };
    const jsonLeft = jsonBoundsFor(0);
    const jsonRight = jsonBoundsFor(1);
    // A bound datapoint is the most explicit choice, so it wins over the payload, and the payload
    // over the value typed into the config.
    const leftMin = boundValue(leftMinDp.value) ?? jsonLeft?.min ?? echartLeftMin;
    const leftMax = boundValue(leftMaxDp.value) ?? jsonLeft?.max ?? echartLeftMax;
    const rightMin = boundValue(rightMinDp.value) ?? jsonRight?.min ?? echartRightMin;
    const rightMax = boundValue(rightMaxDp.value) ?? jsonRight?.max ?? echartRightMax;
    // A stack is read as "these parts add up to that whole", which only works from a zero
    // baseline: cut the axis at 100 and the bottom band looks like it floats, while the band
    // heights stop being proportional to the values (issue #541). An explicit min still wins.
    // Bars and stacks are read from the zero line, and the grid lines have to come from an axis
    // that actually carries series — see utils/chartAxis (issue #594).
    const zeroBased = (axis: 0 | 1) => axisIsZeroBased(echartSeries, axis);
    const gridAxis = gridLineAxis(echartSeries);
    const showGridOn = (axis: 0 | 1) => echartShowYAxis && echartShowGridLines && gridAxis === axis;

    // `{value}` hands the tick through unformatted, and with min/max on "Auto" (`dataMin`/
    // `dataMax`) the outermost ticks are raw samples — 16.759028325055955 °C instead of
    // 16.76 °C (issue #548). Run every tick through the widget's decimals/number format.
    const axisLabelFormatter =
        (unit: string) =>
        (v: number): string =>
            `${formatNum(v, decimals, numFmt)}${unit ? ` ${unit}` : ''}`;

    const leftAxis: Record<string, unknown> = {
        type: 'value',
        // Fit the axis to the data range instead of forcing zero in — otherwise a
        // line at e.g. 200–250 sits at the top with the whole 0–200 band left blank.
        // Bars and stacks are the exception; see `zeroBased`.
        scale: !zeroBased(0) || leftMin !== undefined,
        axisLabel: {
            show: echartShowYAxis,
            color: '#888',
            fontSize: 10,
            formatter: axisLabelFormatter(echartLeftUnit),
        },
        axisTick: { show: echartShowYAxis },
        axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
        splitLine: { show: showGridOn(0), lineStyle: { color: '#333' } },
        ...(leftMin !== undefined ? { min: leftMin } : {}),
        ...(leftMax !== undefined ? { max: leftMax } : {}),
    };

    const rightAxis: Record<string, unknown> = hasRightAxis
        ? {
              type: 'value',
              scale: !zeroBased(1) || rightMin !== undefined,
              axisLabel: {
                  show: echartShowYAxisRight,
                  color: '#888',
                  fontSize: 10,
                  formatter: axisLabelFormatter(echartRightUnit),
              },
              axisTick: { show: echartShowYAxisRight },
              axisLine: { show: echartShowYAxisRight, lineStyle: { color: '#444' } },
              splitLine: { show: showGridOn(1), lineStyle: { color: '#333' } },
              ...(rightMin !== undefined ? { min: rightMin } : {}),
              ...(rightMax !== undefined ? { max: rightMax } : {}),
          }
        : { show: false };

    // Current value(s) shown top-right — one per series, tinted with its colour.
    const currentValues = echartSeries
        .map((s, idx) => ({
            value: seriesCurrent(idx, s.id),
            color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
            unit: (s.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit,
        }))
        .filter((c) => c.value !== null);

    const showCurrentBlock = echartShowCurrent && currentValues.length > 0;

    // Gauge mode: show first series' current value as a gauge
    if (isGauge) {
        const firstSeries = echartSeries[0];
        const gaugeValue = seriesCurrent(0, firstSeries?.id ?? '') ?? 0;
        const gaugeColor = firstSeries?.color ?? DEFAULT_COLORS[0];

        const gaugeOption: Record<string, unknown> = {
            backgroundColor: 'transparent',
            animation: echartAnimation,
            series: [
                {
                    type: 'gauge',
                    // The gauge is a y axis too, so it takes the same bounds — but only real
                    // numbers: `dataMin`/`dataMax` mean nothing without a data range to read them
                    // from, and echarts would draw an empty dial.
                    ...(typeof leftMin === 'number' ? { min: leftMin } : {}),
                    ...(typeof leftMax === 'number' ? { max: leftMax } : {}),
                    radius: '85%',
                    progress: { show: true, width: 12 },
                    axisLine: { lineStyle: { width: 12, color: [[1, '#333']] } },
                    axisTick: { show: false },
                    splitLine: { length: 8, lineStyle: { color: '#555', width: 1 } },
                    axisLabel: { color: '#888', fontSize: 10 },
                    pointer: { show: true, length: '60%', width: 4 },
                    itemStyle: { color: gaugeColor },
                    detail: {
                        formatter: (v: number) =>
                            `${formatNum(v, decimals, numFmt)}${echartLeftUnit ? ` ${echartLeftUnit}` : ''}`,
                        color: 'var(--text-primary)',
                        fontSize: 16,
                        offsetCenter: [0, '70%'],
                    },
                    title: { color: '#888', fontSize: 11 },
                    data: [{ value: gaugeValue, name: firstSeries?.name ?? '' }],
                },
            ],
        };

        let mergedGauge = gaugeOption;
        if (echartJsonExtra) {
            try {
                const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
                mergedGauge = deepMerge(gaugeOption, extra);
            } catch {
                // ignore invalid JSON
            }
        }

        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col w-full h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div className="flex-1 relative min-h-0">
                    {hasSize && (
                        <ReactECharts
                            ref={chartRef}
                            option={mergedGauge}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // Comparison mode: categorical bar chart — each series = one bar with its current value
    if (echartMode === 'comparison') {
        const categories = echartSeries.map((s) => s.name);
        // One bar per series, so the per-series label switch has to sit on the data item — the
        // series-level label below covers all bars at once (issue #584).
        const values = echartSeries.map((s, idx) => ({
            value: seriesCurrent(idx, s.id),
            itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
            label: valueLabel(echartLeftUnit, { series: s }),
        }));
        const hasData = values.some((v) => v.value !== null);

        const compOption: Record<string, unknown> = {
            backgroundColor: 'transparent',
            animation: echartAnimation,
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'var(--app-surface, #1e1e1e)',
                borderColor: 'var(--app-border, #333)',
                textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
                formatter: (params: unknown) => {
                    const items = params as { name: string; value: number; marker: string }[];
                    if (!items?.length) return '';
                    return items
                        .map((p) => {
                            const dispVal =
                                typeof p.value === 'number' ? formatNum(p.value, decimals, numFmt) : p.value;
                            return `${p.marker} ${p.name}: <b>${dispVal}${echartLeftUnit ? ` ${echartLeftUnit}` : ''}</b>`;
                        })
                        .join('<br/>');
                },
            },
            legend: { show: false },
            grid: {
                left: AXIS_GAP,
                right: AXIS_GAP,
                top: 16,
                bottom: AXIS_GAP_V,
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: categories,
                show: echartShowXAxis,
                axisLabel: { show: echartShowXAxis, color: '#888', fontSize: 10 },
                axisTick: { show: echartShowXAxis },
                axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    show: echartShowYAxis,
                    color: '#888',
                    fontSize: 10,
                    formatter: axisLabelFormatter(echartLeftUnit),
                },
                axisTick: { show: echartShowYAxis },
                axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
                splitLine: { show: echartShowYAxis, lineStyle: { color: '#333' } },
                ...(leftMin !== undefined ? { min: leftMin } : {}),
                ...(leftMax !== undefined ? { max: leftMax } : {}),
            },
            series: [
                {
                    type: 'bar',
                    data: values,
                    label: valueLabel(echartLeftUnit),
                    labelLayout: valueLabelLayout,
                },
            ],
        };

        let mergedComp = compOption;
        if (echartJsonExtra) {
            try {
                const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
                mergedComp = deepMerge(compOption, extra);
            } catch {
                /* ignore invalid JSON */
            }
        }

        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col w-full h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div className="flex-1 relative min-h-0">
                    {(echartSeries.length === 0 || !hasData) && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <BarChart2 size={28} strokeWidth={1.5} />
                            <span className="text-xs">{t('echart.noData')}</span>
                        </div>
                    )}
                    {hasSize && hasData && (
                        <ReactECharts
                            ref={chartRef}
                            option={mergedComp}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // JSON mode: each series reads a label/value array straight out of its datapoint. The labels
    // form the x axis — as plain categories, or as a real time axis when they are timestamps
    // (`{"ts": "1785362400000", "val": 0}`, issue #509).
    if (echartMode === 'json') {
        const pointsPerSeries = echartSeries.map((s) => seriesDataMap.get(s.id)?.points ?? []);
        const jsonTimeAxis = o.echartJsonTimeAxis === true;

        // Category order: first series wins, labels only present in later series are appended.
        const categories: string[] = [];
        const seen = new Set<string>();
        if (!jsonTimeAxis) {
            for (const points of pointsPerSeries) {
                for (const p of points) {
                    if (seen.has(p.label)) continue;
                    seen.add(p.label);
                    categories.push(p.label);
                }
            }
        }

        // Time axis: labels become x coordinates. Entries whose label isn't a timestamp are
        // dropped — plotting them at an arbitrary position would be worse than omitting them.
        const timePointsPerSeries = jsonTimeAxis
            ? pointsPerSeries.map((points) =>
                  points
                      .map((p): [number, number] | null => {
                          const ts = parseTimeLabel(p.label);
                          return ts === null ? null : [ts, p.value];
                      })
                      .filter((p): p is [number, number] => p !== null)
                      .sort((a, b) => a[0] - b[0]),
              )
            : [];

        // Labels missing from a series stay null so the line breaks instead of silently shifting
        // the remaining points onto the wrong categories.
        const jsonData: StackDatum[][] = echartSeries.map((_s, idx) => {
            if (jsonTimeAxis) return timePointsPerSeries[idx];
            const byLabel = new Map(pointsPerSeries[idx].map((p) => [p.label, p.value]));
            return categories.map((c) => byLabel.get(c) ?? null);
        });
        const jsonShares = stackShares(echartSeries, jsonData);

        const jsonSeriesList = echartSeries.map((s, idx) => {
            return {
                name: s.name,
                type: s.chartType === 'area' ? 'line' : s.chartType,
                // Stacked areas are read as bands, not as curves in front of each other, and are
                // therefore filled with the colour they were given — see `areaOpacityFor`.
                areaStyle: s.chartType === 'area' ? { opacity: areaOpacityFor(s) } : undefined,
                stack: stackIdFor(s),
                smooth: s.smooth ?? (s.chartType === 'line' || s.chartType === 'area'),
                smoothMonotone: 'x',
                // Stacked bands go without an outline — see `outlineWidthFor`.
                lineStyle: { width: outlineWidthFor(s) },
                itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
                data: jsonData[idx],
                yAxisIndex: s.yAxisIndex ?? 0,
                showSymbol: labelSymbols(s),
                // Above a stacked bar sits the next segment, so its label moves into the bar; on a
                // stacked line "inside" is the point itself, which is no better than "top".
                label: valueLabel((s.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit, {
                    inside: !!s.stack && s.chartType === 'bar',
                    share: s.stack ? (i: number) => jsonShares[idx]?.[i] ?? null : undefined,
                    series: s,
                    count: jsonData[idx].length,
                }),
                labelLayout: valueLabelLayout,
            };
        });

        const jsonHasData = jsonTimeAxis ? timePointsPerSeries.some((p) => p.length > 0) : categories.length > 0;

        // Own current-value block: the shared one is derived from history/preview data, which a
        // JSON series never has. Here "current" is simply the last point of the array.
        const jsonCurrentValues = echartSeries
            .map((s, idx) => {
                // On the time axis the points are sorted chronologically, so "last" means latest.
                const tp = timePointsPerSeries[idx] ?? [];
                const cp = pointsPerSeries[idx];
                const fromFirst = echartCurrentFrom === 'first';
                const tail = jsonTimeAxis
                    ? tp.length > 0
                        ? (fromFirst ? tp[0] : tp[tp.length - 1])[1]
                        : null
                    : cp.length > 0
                      ? (fromFirst ? cp[0] : cp[cp.length - 1]).value
                      : null;
                return {
                    value: tail,
                    color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                    unit: (s.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit,
                };
            })
            .filter((c) => c.value !== null);
        const showJsonCurrent = echartShowCurrent && jsonCurrentValues.length > 0;

        const jsonOption: Record<string, unknown> = {
            backgroundColor: 'transparent',
            animation: echartAnimation,
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'var(--app-surface, #1e1e1e)',
                borderColor: 'var(--app-border, #333)',
                textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
                formatter: (params: unknown) => {
                    const items = params as {
                        axisValue: string | number;
                        seriesName: string;
                        value: number | [number, number] | null;
                        marker: string;
                        seriesIndex: number;
                    }[];
                    if (!items?.length) return '';
                    const rows = items
                        .map((p) => ({ ...p, num: Array.isArray(p.value) ? p.value[1] : p.value }))
                        .filter((p) => p.num !== null && p.num !== undefined);
                    const shareOf = tooltipShare(rows);
                    const lines = rows.map((p) => {
                        const seriesCfg = echartSeries[p.seriesIndex];
                        const unit = (seriesCfg?.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit;
                        return `${p.marker} ${p.seriesName}: <b>${formatNum(p.num as number, decimals, numFmt)}${
                            unit ? `\u202F${unit}` : ''
                        }</b>${shareOf(p.seriesIndex, p.num as number)}`;
                    });
                    const head = jsonTimeAxis
                        ? new Date(Number(items[0].axisValue)).toLocaleString(t('echart.dateLocale'), {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                          })
                        : items[0].axisValue;
                    return `${head}<br/>${lines.join('<br/>')}`;
                },
            },
            legend: echartShowLegend
                ? { show: true, textStyle: { color: '#888', fontSize: 11 }, top: 4 }
                : { show: false },
            grid: {
                left: AXIS_GAP,
                right: AXIS_GAP,
                top: echartShowLegend ? 30 : AXIS_GAP_V,
                bottom: AXIS_GAP_V,
                containLabel: true,
            },
            xAxis: jsonTimeAxis
                ? {
                      type: 'time',
                      show: echartShowXAxis,
                      axisLabel: { show: echartShowXAxis, color: '#888', fontSize: 10 },
                      axisTick: { show: echartShowXAxis },
                      axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
                      splitLine: { show: false },
                  }
                : {
                      type: 'category',
                      data: categories,
                      show: echartShowXAxis,
                      boundaryGap: echartSeries.some((s) => s.chartType === 'bar'),
                      axisLabel: { show: echartShowXAxis, color: '#888', fontSize: 10 },
                      axisTick: { show: echartShowXAxis },
                      axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
                      splitLine: { show: false },
                  },
            yAxis: [leftAxis, rightAxis],
            series: jsonSeriesList,
        };

        let mergedJson = jsonOption;
        if (echartJsonExtra) {
            try {
                const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
                mergedJson = deepMerge(jsonOption, extra);
            } catch {
                /* ignore invalid JSON */
            }
        }

        return (
            <div ref={containerRef} className="aura-widget-row flex flex-col w-full h-full">
                {(showTitle || showIcon || showJsonCurrent) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                        {showJsonCurrent && (
                            <div className={currentBlockCls}>
                                {jsonCurrentValues.map((c, i) => (
                                    <span key={i} className="text-sm font-bold leading-none" style={{ color: c.color }}>
                                        {formatNum(c.value as number, decimals, numFmt)}
                                        {c.unit ? ` ${c.unit}` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="flex-1 relative min-h-0">
                    {!jsonHasData && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <BarChart2 size={28} strokeWidth={1.5} />
                            <span className="text-xs">{t('echart.noData')}</span>
                        </div>
                    )}
                    {hasSize && jsonHasData && (
                        <ReactECharts
                            ref={chartRef}
                            option={mergedJson}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                            notMerge
                        />
                    )}
                </div>
            </div>
        );
    }

    // Stacked series are resampled onto their shared timeline first: ECharts stacks by data index,
    // and each series brings its own history timestamps (issue #541).
    const alignedData = alignStackedSeries(
        echartSeries,
        echartSeries.map((s, idx) => seriesData(idx, s.id)),
    );
    const hasStack = echartSeries.some((s) => s.stack);
    const shares = stackShares(echartSeries, alignedData);

    // Bars of a `delta` series sit on a calendar grid (one per hour/day/…/year), so the axis must
    // label that grid instead of whatever days echarts' own ticks happen to fall on (issue #570).
    // The bucket comes from the fetch — an `auto` bucket over a `total` window depends on the
    // probed recording length. The coarsest wins: it is the one that needs the sparser labels.
    const axisBucket = isPreview
        ? undefined
        : coarsestBucket(
              echartSeries
                  .filter((s) => s.aggregate === 'delta')
                  .map((s) => seriesDataMap.get(s.id)?.deltaBucket as ChartBucket | undefined),
          );
    const dateLocale = t('echart.dateLocale');

    const seriesList = echartSeries.map((s, idx) => {
        const data = alignedData[idx];
        return {
            name: s.name,
            type: s.chartType === 'area' ? 'line' : s.chartType,
            // A band is filled with the colour it was given, a single area stays a wash — see
            // `areaOpacityFor`; the series' own `areaOpacity` overrides both.
            areaStyle: s.chartType === 'area' ? { opacity: areaOpacityFor(s) } : undefined,
            stack: stackIdFor(s),
            smooth: s.smooth ?? (s.chartType === 'line' || s.chartType === 'area'),
            // Monotone smoothing never overshoots the data — a flat run of equal values
            // (e.g. dry days at 0) stays exactly flat instead of wobbling around it.
            smoothMonotone: 'x',
            // Stacked bands go without an outline — see `outlineWidthFor`.
            lineStyle: { width: outlineWidthFor(s) },
            itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
            data,
            yAxisIndex: s.yAxisIndex ?? 0,
            showSymbol: labelSymbols(s),
            // Above a stacked bar sits the next segment, so its label moves into the bar; on a
            // stacked line "inside" is the point itself, which is no better than "top".
            label: valueLabel((s.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit, {
                inside: !!s.stack && s.chartType === 'bar',
                share: s.stack ? (i: number) => shares[idx]?.[i] ?? null : undefined,
                series: s,
                count: data.length,
            }),
            labelLayout: valueLabelLayout,
            // A lone delta bar (one bucket logged so far) would otherwise be stretched across
            // the whole plot area, since echarts derives bar width from the point spacing.
            ...(s.aggregate === 'delta' ? { barMaxWidth: 40 } : {}),
        };
    });

    const option: Record<string, unknown> = {
        backgroundColor: 'transparent',
        animation: echartAnimation,
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'var(--app-surface, #1e1e1e)',
            borderColor: 'var(--app-border, #333)',
            textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
            formatter: (params: unknown) => {
                const items = params as {
                    axisValue: number;
                    seriesName: string;
                    value: [number, number | null];
                    marker: string;
                    seriesIndex: number;
                }[];
                if (!items?.length) return '';
                const ts = items[0].axisValue;
                // A bucketed bar is a whole year / month / day of consumption — its headline is the
                // bucket, not the second it happens to start at.
                const timeStr = bucketTooltipLabel(ts, axisBucket ?? 'hour', dateLocale);
                // Aligning a stack pads the series that hadn't started yet with nulls \u2014 a row
                // reading "null" is noise, the series simply has nothing at this moment.
                const shown = hasStack ? items.filter((p) => typeof p.value?.[1] === 'number') : items;
                if (!shown.length) return '';
                const unitOf = (idx: number) =>
                    (echartSeries[idx]?.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit;
                const shareOf = tooltipShare(shown.map((p) => ({ seriesIndex: p.seriesIndex, num: p.value[1] })));
                const lines = shown.map((p) => {
                    const unit = unitOf(p.seriesIndex);
                    // Stacked or not, echarts hands the formatter the series' own value, never the
                    // stacked one \u2014 the total is added below instead.
                    const raw = p.value[1];
                    const dispVal = typeof raw === 'number' ? formatNum(raw, decimals, numFmt) : raw;
                    return `${p.marker} ${p.seriesName}: <b>${dispVal}${unit ? `\u202F${unit}` : ''}</b>${shareOf(
                        p.seriesIndex,
                        typeof raw === 'number' ? raw : null,
                    )}`;
                });
                // The point of stacking is the sum (150 W battery + 50 W grid = 200 W house), so
                // spell it out \u2014 one line per stack, since each y axis stacks for itself.
                if (hasStack) {
                    const sums = new Map<string, { total: number; count: number; unit: string }>();
                    for (const p of shown) {
                        const cfg = echartSeries[p.seriesIndex];
                        const stackId = cfg ? stackIdFor(cfg) : undefined;
                        if (!stackId) continue;
                        const acc = sums.get(stackId) ?? { total: 0, count: 0, unit: unitOf(p.seriesIndex) };
                        acc.total += p.value[1] as number;
                        acc.count++;
                        sums.set(stackId, acc);
                    }
                    for (const acc of sums.values()) {
                        if (acc.count < 2) continue;
                        lines.push(
                            `<span style="opacity:.7">\u03A3</span> ${t('echart.stackTotal')}: <b>${formatNum(
                                acc.total,
                                decimals,
                                numFmt,
                            )}${acc.unit ? `\u202F${acc.unit}` : ''}</b>`,
                        );
                    }
                }
                return `${timeStr}<br/>${lines.join('<br/>')}`;
            },
        },
        legend: echartShowLegend ? { show: true, textStyle: { color: '#888', fontSize: 11 }, top: 4 } : { show: false },
        grid: {
            left: AXIS_GAP,
            right: AXIS_GAP,
            top: echartShowLegend ? 30 : AXIS_GAP_V,
            bottom: AXIS_GAP_V,
            containLabel: true,
        },
        xAxis: {
            type: 'time',
            show: echartShowXAxis,
            axisLabel: {
                show: echartShowXAxis,
                color: '#888',
                fontSize: 10,
                // Monthly bars over several years put a label at every month start — echarts drops
                // the ones that would collide instead of overprinting them.
                hideOverlap: !!axisBucket,
                formatter: axisBucket ? (v: number) => bucketAxisLabel(v, axisBucket, dateLocale) : null,
            },
            axisTick: { show: echartShowXAxis },
            axisLine: { show: echartShowXAxis, lineStyle: { color: '#444' } },
            splitLine: { show: false },
            // Ticks have to land ON the bucket grid, or the formatter above finds nothing to label:
            // a two-bar yearly chart would otherwise get month ticks, none of them a January.
            minInterval: axisBucket ? bucketAxisMinInterval(axisBucket) : 0,
            // Day mode: frame exactly the selected calendar day, even when data is sparse.
            // Written unconditionally — `setOption` MERGES, so a key that is merely omitted keeps
            // the value of the previous option. Leaving day mode for a rolling range would then
            // stay framed on that one day and hide every other bar (issue #594).
            min: dayWindow ? dayWindow.start : null,
            max: dayWindow ? dayWindow.end : null,
        },
        yAxis: [leftAxis, rightAxis],
        series: seriesList,
    };

    let merged = option;
    if (echartJsonExtra) {
        try {
            const extra = JSON.parse(echartJsonExtra) as Record<string, unknown>;
            merged = deepMerge(option, extra);
        } catch {
            // ignore invalid JSON
        }
    }

    // Frontend range selector — shown when at least one series has history and not locked.
    const rangeSelector =
        hasHistory && !lockRange ? (
            // nowrap + horizontal scroll: keeps the chips on one line next to the
            // day-nav controls; on very narrow widgets the chips scroll (swipe)
            // instead of wrapping the day-nav into a second row.
            <div className="nodrag flex gap-1 min-w-0 overflow-x-auto aura-no-scrollbar">
                {visibleRanges.map((r) => {
                    const active = dayOffset === null && activeRange === r;
                    return (
                        <button
                            key={r}
                            className="nodrag shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-border)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                            }}
                            onClick={() => {
                                setDayOffset(null);
                                setActiveRange(r);
                            }}
                        >
                            {RANGE_LABELS[r]}
                        </button>
                    );
                })}
                {cfgRange === 'custom' && (
                    <button
                        className="nodrag shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: activeRange === 'custom' ? 'var(--accent)' : 'var(--app-border)',
                            color: activeRange === 'custom' ? '#fff' : 'var(--text-secondary)',
                        }}
                        onClick={() => {
                            setDayOffset(null);
                            setActiveRange('custom');
                            setActiveCustomVal(cfgCustomVal);
                            setActiveCustomUnit(cfgCustomUnit);
                        }}
                    >
                        {cfgCustomVal}{' '}
                        {cfgCustomUnit === 'd'
                            ? cfgCustomVal === 1
                                ? t('echart.daySingular')
                                : t('echart.dayPlural')
                            : t('echart.unitHoursShort')}
                    </button>
                )}
            </div>
        ) : null;

    // Day navigation (◀ Heute ▶) — step through single calendar days, "Heute" returns to the current day.
    const navBtnStyle = (active: boolean): React.CSSProperties => ({
        background: active ? 'var(--accent)' : 'var(--app-border)',
        color: active ? '#fff' : 'var(--text-secondary)',
    });
    // …and jump straight to a date instead of stepping there (issue #594). `dayOffset` stays the one
    // source of truth, so a picked date is only turned into its distance from today. Rounded, because
    // the two DST switch days are 23 and 25 hours long.
    const isoDay = (ms: number): string => {
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const midnight = (d: Date): number => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x.getTime();
    };
    const pickDay = (iso: string) => {
        if (!iso) return;
        const [y, m, d] = iso.split('-').map(Number);
        if (!y || !m || !d) return;
        const picked = midnight(new Date(y, m - 1, d));
        setDayOffset(Math.min(0, Math.round((picked - midnight(new Date())) / 86_400_000)));
    };
    const dayNavControls =
        dayNav && hasHistory ? (
            <div className="flex items-center gap-1 shrink-0">
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={navBtnStyle(false)}
                    title={t('echart.dayPrevTitle')}
                    onClick={() => setDayOffset((prev) => (prev ?? 0) - 1)}
                >
                    <ChevronLeft size={12} />
                </button>
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={navBtnStyle(dayOffset === 0)}
                    title={t('echart.dayTodayTitle')}
                    onClick={() => setDayOffset(0)}
                >
                    {t('echart.today')}
                </button>
                <button
                    className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
                    style={navBtnStyle(false)}
                    title={t('echart.dayNextTitle')}
                    disabled={dayOffset === null || dayOffset >= 0}
                    onClick={() => setDayOffset((prev) => (prev !== null && prev < 0 ? prev + 1 : prev))}
                >
                    <ChevronRight size={12} />
                </button>
                {/* The date is the picker's trigger — a field of its own would not fit the header on
                    a narrow widget. The input has to stay rendered for showPicker(), so it is
                    collapsed rather than hidden, and sits under the button it belongs to. */}
                <span className="relative inline-flex items-center ml-1">
                    <input
                        ref={dayInputRef}
                        type="date"
                        className="nodrag absolute bottom-0 left-0 w-0 h-0 p-0 border-0 opacity-0 pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                        value={dayWindow ? isoDay(dayWindow.start) : ''}
                        max={isoDay(Date.now())}
                        onChange={(e) => pickDay(e.target.value)}
                    />
                    <button
                        className="nodrag flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap hover:opacity-80 transition-opacity"
                        style={navBtnStyle(false)}
                        title={t('echart.dayPickTitle')}
                        onClick={() => openNativePicker(dayInputRef.current)}
                    >
                        <CalendarDays size={12} />
                        {dayWindow &&
                            new Date(dayWindow.start).toLocaleDateString(t('echart.dateLocale'), {
                                weekday: 'short',
                                day: '2-digit',
                                month: '2-digit',
                            })}
                    </button>
                </span>
            </div>
        ) : null;

    return (
        <div ref={containerRef} className="flex flex-col w-full h-full">
            {(showTitle || showIcon || showCurrentBlock) && (
                <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                    {showIcon && (
                        <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    )}
                    {showTitle && (
                        <p
                            className="text-xs truncate flex-1 min-w-0"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                    {showCurrentBlock && (
                        <div className={currentBlockCls}>
                            {currentValues.map((c, i) => (
                                <span key={i} className="text-sm font-bold leading-none" style={{ color: c.color }}>
                                    {formatNum(c.value as number, decimals, numFmt)}
                                    {c.unit ? ` ${c.unit}` : ''}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {(rangeSelector || dayNavControls) && (
                <div className="shrink-0 mb-1 flex items-center justify-between gap-2 min-w-0">
                    {rangeSelector ?? <span />}
                    {dayNavControls}
                </div>
            )}
            {instancePickers.length > 0 && (
                <div className="shrink-0 mb-1 flex items-center gap-1 flex-wrap">
                    {instancePickers.map((p) => (
                        <select
                            key={p.id}
                            className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium focus:outline-none"
                            style={{
                                background: 'var(--app-border)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                            value={p.value}
                            onChange={(e) => setPicked(p.id, e.target.value)}
                            title={echartSeries.length > 1 ? p.name : t('echart.historyInstance')}
                        >
                            {p.adapters.map((a) => (
                                <option key={a.instance} value={a.instance}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    ))}
                </div>
            )}
            <div className="flex-1 relative min-h-0">
                {isPreview && (
                    <span
                        className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-medium pointer-events-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('echart.preview')}
                    </span>
                )}
                {effLoading && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!effLoading && (echartSeries.length === 0 || !effHasData) && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">{t('echart.noData')}</span>
                    </div>
                )}
                {hasSize && effHasData && (
                    <ReactECharts
                        ref={chartRef}
                        option={merged}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                    />
                )}
            </div>
        </div>
    );
}
