import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../hooks/useMultiSeriesData';
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
  if (layout === 'custom') return <CustomGridView config={config} value="" />;

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
  const echartJsonExtra = (o.echartJsonExtra as string | undefined) ?? '';
  const isGauge = config.layout === 'gauge' as string;

  const seriesDataMap = useMultiSeriesData(echartSeries, connected, subscribe);

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
      color: '#888',
      fontSize: 10,
      formatter: echartLeftUnit ? `{value} ${echartLeftUnit}` : '{value}',
    },
    axisLine: { lineStyle: { color: '#444' } },
    splitLine: { lineStyle: { color: '#333' } },
    ...(echartLeftMin !== undefined ? { min: echartLeftMin } : {}),
    ...(echartLeftMax !== undefined ? { max: echartLeftMax } : {}),
  };

  const rightAxis: Record<string, unknown> = hasRightAxis
    ? {
        type: 'value',
        axisLabel: {
          color: '#888',
          fontSize: 10,
          formatter: echartRightUnit ? `{value} ${echartRightUnit}` : '{value}',
        },
        axisLine: { lineStyle: { color: '#444' } },
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
        const items = params as { axisValue: number; seriesName: string; value: [number, number]; marker: string }[];
        if (!items?.length) return '';
        const ts = items[0].axisValue;
        const date = new Date(ts);
        const timeStr = date.toLocaleString('de-DE', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
        const lines = items.map((p) => `${p.marker} ${p.seriesName}: <b>${p.value[1]}</b>`);
        return `${timeStr}<br/>${lines.join('<br/>')}`;
      },
    },
    legend: echartShowLegend
      ? { show: true, textStyle: { color: '#888', fontSize: 11 }, top: 4 }
      : { show: false },
    grid: {
      left: 60,
      right: hasRightAxis ? 60 : 20,
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
