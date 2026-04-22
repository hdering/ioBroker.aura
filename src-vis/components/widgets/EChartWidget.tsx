import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig, type FixedTimeRange } from '../../hooks/useMultiSeriesData';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function EChartWidget({ config, editMode }: WidgetProps) {
  const { subscribe, connected } = useIoBroker();

  const layout = config.layout ?? 'default';

  const o = config.options ?? {};
  const showTitle = o.showTitle !== false;
  const echartSeries = (o.echartSeries as EChartSeriesConfig[] | undefined) ?? [];
  const echartShowLegend = (o.echartShowLegend as boolean | undefined) ?? true;
  const echartLeftUnit = (o.echartLeftUnit as string | undefined) ?? '';
  const echartRightUnit = (o.echartRightUnit as string | undefined) ?? '';
  const echartLeftMin = o.echartLeftMin as number | undefined;
  const echartLeftMax = o.echartLeftMax as number | undefined;
  const echartRightMin = o.echartRightMin as number | undefined;
  const echartRightMax = o.echartRightMax as number | undefined;
  const echartJsonExtra   = (o.echartJsonExtra   as string  | undefined) ?? '';
  const echartShowYAxis   = (o.echartShowYAxis   as boolean | undefined) ?? true;
  const echartFixedRange  = (o.echartFixedRange  as boolean | undefined) ?? false;
  const echartFixedStart  = (o.echartFixedStart  as string  | undefined) ?? '00:00';
  const echartFixedEnd    = (o.echartFixedEnd    as string  | undefined) ?? '23:59';
  const isGauge = config.layout === 'gauge' as string;

  const fixedTimeRange = useMemo<FixedTimeRange | undefined>(() => {
    if (!echartFixedRange) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = today.getTime();
    const parseHHMM = (s: string) => {
      const [h, m] = s.split(':').map(Number);
      return base + (isNaN(h) ? 0 : h) * 3_600_000 + (isNaN(m) ? 0 : m) * 60_000;
    };
    return { start: parseHHMM(echartFixedStart), end: parseHHMM(echartFixedEnd) };
  }, [echartFixedRange, echartFixedStart, echartFixedEnd]);

  const seriesDataMap = useMultiSeriesData(echartSeries, connected, subscribe, fixedTimeRange);

  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  const allLoading = echartSeries.length > 0 && echartSeries.every((s) => seriesDataMap.get(s.id)?.loading);
  const hasAnyData = echartSeries.some((s) => (seriesDataMap.get(s.id)?.data.length ?? 0) > 0);

  if (allLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <Loader size={20} className="animate-spin" />
      </div>
    );
  }

  if (echartSeries.length === 0 || !hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <BarChart2 size={28} strokeWidth={1.5} />
        <span className="text-xs">Keine Daten</span>
        {editMode && showTitle && config.title && (
          <span className="absolute top-1 left-2 text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            {config.title}
          </span>
        )}
      </div>
    );
  }

  // Gauge mode: show first series' current value as a gauge
  if (isGauge) {
    const firstSeries = echartSeries[0];
    const firstData = seriesDataMap.get(firstSeries?.id ?? '');
    const gaugeValue = firstData?.current ?? 0;
    const gaugeColor = firstSeries?.color ?? DEFAULT_COLORS[0];

    const gaugeOption: Record<string, unknown> = {
      backgroundColor: 'transparent',
      series: [
        {
          type: 'gauge',
          radius: '85%',
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12, color: [[1, '#333']] } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { color: '#555', width: 1 } },
          axisLabel: { color: '#888', fontSize: 10 },
          pointer: { show: true, length: '60%', width: 4 },
          itemStyle: { color: gaugeColor },
          detail: {
            formatter: `{value}${echartLeftUnit ? ' ' + echartLeftUnit : ''}`,
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
      <div className="relative w-full h-full">
        {editMode && showTitle && config.title && (
          <span className="absolute top-1 left-2 text-[10px] font-medium z-10" style={{ color: 'var(--text-secondary)' }}>
            {config.title}
          </span>
        )}
        <ReactECharts
          option={mergedGauge}
          style={{ width: '100%', height: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    );
  }

  const hasRightAxis = echartSeries.some((s) => (s.yAxisIndex ?? 0) === 1);

  const leftAxis: Record<string, unknown> = {
    type: 'value',
    axisLabel: {
      show: echartShowYAxis,
      color: '#888',
      fontSize: 10,
      formatter: echartLeftUnit ? `{value} ${echartLeftUnit}` : '{value}',
    },
    axisTick: { show: echartShowYAxis },
    axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
    splitLine: { show: echartShowYAxis, lineStyle: { color: '#333' } },
    ...(echartLeftMin !== undefined ? { min: echartLeftMin } : {}),
    ...(echartLeftMax !== undefined ? { max: echartLeftMax } : {}),
  };

  const rightAxis: Record<string, unknown> = hasRightAxis
    ? {
        type: 'value',
        axisLabel: {
          show: echartShowYAxis,
          color: '#888',
          fontSize: 10,
          formatter: echartRightUnit ? `{value} ${echartRightUnit}` : '{value}',
        },
        axisTick: { show: echartShowYAxis },
        axisLine: { show: echartShowYAxis, lineStyle: { color: '#444' } },
        splitLine: { show: false },
        ...(echartRightMin !== undefined ? { min: echartRightMin } : {}),
        ...(echartRightMax !== undefined ? { max: echartRightMax } : {}),
      }
    : { show: false };

  const seriesList = echartSeries.map((s, idx) => {
    const data = seriesDataMap.get(s.id)?.data ?? [];
    return {
      name: s.name,
      type: s.chartType === 'area' ? 'line' : s.chartType,
      areaStyle: s.chartType === 'area' ? { opacity: 0.2 } : undefined,
      smooth: s.smooth ?? (s.chartType === 'line' || s.chartType === 'area'),
      lineStyle: { width: s.lineWidth ?? 2 },
      itemStyle: { color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length] },
      data,
      yAxisIndex: s.yAxisIndex ?? 0,
      showSymbol: false,
    };
  });

  const option: Record<string, unknown> = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--app-surface, #1e1e1e)',
      borderColor: 'var(--app-border, #333)',
      textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
      formatter: (params: unknown) => {
        const items = params as { axisValue: number; seriesName: string; value: [number, number]; marker: string; seriesIndex: number }[];
        if (!items?.length) return '';
        const ts = items[0].axisValue;
        const date = new Date(ts);
        const timeStr = date.toLocaleString('de-DE', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
        const lines = items.map((p) => {
          const seriesCfg = echartSeries[p.seriesIndex];
          const unit = (seriesCfg?.yAxisIndex ?? 0) === 1 ? echartRightUnit : echartLeftUnit;
          const raw = p.value[1];
          const dispVal = typeof raw === 'number' ? parseFloat(raw.toFixed(2)) : raw;
          return `${p.marker} ${p.seriesName}: <b>${dispVal}${unit ? '\u202F' + unit : ''}</b>`;
        });
        return `${timeStr}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: echartShowLegend
      ? { show: true, textStyle: { color: '#888', fontSize: 11 }, top: 4 }
      : { show: false },
    grid: {
      left: echartShowYAxis ? 60 : 12,
      right: hasRightAxis && echartShowYAxis ? 60 : 12,
      top: echartShowLegend ? 30 : 16,
      bottom: 40,
      containLabel: false,
    },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#888', fontSize: 10 },
      axisLine: { lineStyle: { color: '#444' } },
      splitLine: { show: false },
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

  return (
    <div className="relative w-full h-full">
      {editMode && config.title && (
        <span className="absolute top-1 left-2 text-[10px] font-medium z-10" style={{ color: 'var(--text-secondary)' }}>
          {config.title}
        </span>
      )}
      <ReactECharts
        option={merged}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
