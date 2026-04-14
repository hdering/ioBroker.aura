import { useState, useEffect } from 'react';
import { ChevronDown, Database, Plus, Trash2, ChevronUp } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { detectHistoryAdapters, RANGE_LABELS, type DetectedAdapter } from '../../hooks/useChartHistory';
import type { EChartSeriesConfig, EChartTimeRange } from '../../hooks/useMultiSeriesData';
import { useT, t } from '../../i18n';

interface EChartConfigProps {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
}

const CHART_RANGES: EChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

const CHART_TYPES: { id: EChartSeriesConfig['chartType']; label: () => string }[] = [
  { id: 'line',    label: () => t('echart.line') },
  { id: 'area',    label: () => t('echart.area') },
  { id: 'bar',     label: () => t('echart.bar') },
  { id: 'scatter', label: () => t('echart.scatter') },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
};

interface SeriesAdapterState {
  adapters: DetectedAdapter[];
  checking: boolean;
}

export function EChartConfig({ config, onConfigChange }: EChartConfigProps) {
  const t = useT();
  const o = config.options ?? {};
  const series = (o.echartSeries as EChartSeriesConfig[] | undefined) ?? [];
  const echartShowLegend = (o.echartShowLegend as boolean | undefined) ?? true;
  const echartLeftUnit = (o.echartLeftUnit as string | undefined) ?? '';
  const echartRightUnit = (o.echartRightUnit as string | undefined) ?? '';
  const echartLeftMin = (o.echartLeftMin as string | undefined) ?? '';
  const echartLeftMax = (o.echartLeftMax as string | undefined) ?? '';
  const echartRightMin = (o.echartRightMin as string | undefined) ?? '';
  const echartRightMax = (o.echartRightMax as string | undefined) ?? '';
  const echartJsonExtra = (o.echartJsonExtra as string | undefined) ?? '';

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerForSeries, setPickerForSeries] = useState<string | null>(null);
  const [adapterStates, setAdapterStates] = useState<Record<string, SeriesAdapterState>>({});
  const [jsonOpen, setJsonOpen] = useState(false);

  const setO = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const setSeries = (next: EChartSeriesConfig[]) => setO({ echartSeries: next });

  const updateSeries = (id: string, patch: Partial<EChartSeriesConfig>) => {
    setSeries(series.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSeries = () => {
    const newId = generateId();
    const newSeries: EChartSeriesConfig = {
      id: newId,
      name: `Serie ${series.length + 1}`,
      datapointId: '',
      chartType: 'line',
      color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][series.length % 6],
      historyRange: '24h',
      smooth: true,
      yAxisIndex: 0,
      lineWidth: 2,
    };
    setSeries([...series, newSeries]);
    setExpandedId(newId);
  };

  const removeSeries = (id: string) => {
    setSeries(series.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const moveSeries = (id: string, dir: -1 | 1) => {
    const idx = series.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...series];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSeries(next);
  };

  // Detect history adapters when datapoint changes
  useEffect(() => {
    for (const s of series) {
      if (!s.datapointId) continue;
      const existing = adapterStates[s.id];
      // Only re-detect if we haven't already
      if (existing) continue;
      setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters: [], checking: true } }));
      getObjectDirect(s.datapointId).then((obj) => {
        const custom = obj?.common?.custom;
        const adapters = custom
          ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>)
          : [];
        setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters, checking: false } }));
      }).catch(() => {
        setAdapterStates((prev) => ({ ...prev, [s.id]: { adapters: [], checking: false } }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.map((s) => s.datapointId).join(',')]);

  const refreshAdapters = (id: string, datapointId: string) => {
    if (!datapointId) return;
    setAdapterStates((prev) => ({ ...prev, [id]: { adapters: [], checking: true } }));
    getObjectDirect(datapointId).then((obj) => {
      const custom = obj?.common?.custom;
      const adapters = custom
        ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>)
        : [];
      setAdapterStates((prev) => ({ ...prev, [id]: { adapters, checking: false } }));
    }).catch(() => {
      setAdapterStates((prev) => ({ ...prev, [id]: { adapters: [], checking: false } }));
    });
  };

  return (
    <div
      className="flex flex-col gap-0 overflow-y-auto"
      style={{ maxHeight: '80vh' }}
    >
      {/* ── Series list ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('echart.series')}</p>
          <button
            onClick={addSeries}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md hover:opacity-80 transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={11} />
            {t('echart.addSeries')}
          </button>
        </div>

        {series.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('echart.noSeries')}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {series.map((s, idx) => {
            const isExpanded = expandedId === s.id;
            const adState = adapterStates[s.id];
            return (
              <div
                key={s.id}
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--app-border)' }}
              >
                {/* Series header row */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none"
                  style={{ background: 'var(--app-bg)' }}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  {/* Color dot */}
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: s.color ?? '#3b82f6' }}
                  />
                  <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                    {s.name || `Serie ${idx + 1}`}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {(CHART_TYPES.find((ct) => ct.id === s.chartType)?.label ?? (() => s.chartType))()}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => moveSeries(s.id, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:opacity-80 disabled:opacity-30"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Nach oben"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      onClick={() => moveSeries(s.id, 1)}
                      disabled={idx === series.length - 1}
                      className="p-0.5 rounded hover:opacity-80 disabled:opacity-30"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Nach unten"
                    >
                      <ChevronDown size={11} />
                    </button>
                    <button
                      onClick={() => removeSeries(s.id)}
                      className="p-0.5 rounded hover:opacity-80"
                      style={{ color: 'var(--accent-red, #ef4444)' }}
                      title={t('echart.deleteSeries')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <ChevronDown
                    size={12}
                    style={{ color: 'var(--text-secondary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                  />
                </div>

                {/* Expanded series config */}
                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-1.5 flex flex-col gap-2" style={{ borderTop: '1px solid var(--app-border)' }}>
                    {/* Name */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.name')}</label>
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => updateSeries(s.id, { name: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>

                    {/* Datapoint */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.datapoint')}</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={s.datapointId}
                          onChange={(e) => {
                            updateSeries(s.id, { datapointId: e.target.value });
                            if (e.target.value) {
                              // Clear cache so effect re-detects
                              setAdapterStates((prev) => {
                                const n = { ...prev };
                                delete n[s.id];
                                return n;
                              });
                            }
                          }}
                          placeholder={t('echart.dpPlaceholder')}
                          className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                          style={inputStyle}
                        />
                        <button
                          onClick={() => setPickerForSeries(s.id)}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                          title={t('echart.fromIoBroker')}
                        >
                          <Database size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Chart type */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.chartType')}</label>
                      <div className="flex gap-1">
                        {CHART_TYPES.map((ct) => (
                          <button
                            key={ct.id}
                            onClick={() => updateSeries(s.id, { chartType: ct.id })}
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

                    {/* Color */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.color')}</label>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="color"
                          value={s.color ?? '#3b82f6'}
                          onChange={(e) => updateSeries(s.id, { color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={s.color ?? '#3b82f6'}
                          onChange={(e) => updateSeries(s.id, { color: e.target.value })}
                          className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                          style={inputStyle}
                          placeholder="#3b82f6"
                        />
                      </div>
                    </div>

                    {/* Y-Axis */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.yAxis')}</label>
                      <div className="flex gap-1">
                        {([0, 1] as const).map((yi) => (
                          <button
                            key={yi}
                            onClick={() => updateSeries(s.id, { yAxisIndex: yi })}
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

                    {/* Smooth (only for line/area) */}
                    {(s.chartType === 'line' || s.chartType === 'area') && (
                      <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('echart.smooth')}</label>
                        <button
                          onClick={() => updateSeries(s.id, { smooth: !(s.smooth ?? true) })}
                          className="relative w-9 h-5 rounded-full transition-colors"
                          style={{ background: (s.smooth ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: (s.smooth ?? true) ? '18px' : '2px' }}
                          />
                        </button>
                      </div>
                    )}

                    {/* Line width (line/area) */}
                    {(s.chartType === 'line' || s.chartType === 'area') && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                          {t('echart.lineWidth', { value: s.lineWidth ?? 2 })}
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={1}
                          value={s.lineWidth ?? 2}
                          onChange={(e) => updateSeries(s.id, { lineWidth: Number(e.target.value) })}
                          className="w-full accent-[var(--accent)]"
                        />
                      </div>
                    )}

                    {/* History adapter detection */}
                    <div>
                      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('echart.history')}</p>
                      {!s.datapointId && (
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('echart.selectDpFirst')}</p>
                      )}
                      {s.datapointId && adState?.checking && (
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('echart.checking')}</p>
                      )}
                      {s.datapointId && !adState?.checking && !adState && (
                        <button
                          onClick={() => refreshAdapters(s.id, s.datapointId)}
                          className="text-[11px] hover:opacity-80"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t('echart.detect')}
                        </button>
                      )}
                      {s.datapointId && adState && !adState.checking && adState.adapters.length === 0 && (
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {t('echart.noAdapter')}
                        </p>
                      )}
                      {s.datapointId && adState && !adState.checking && adState.adapters.length > 0 && (
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.instance')}</label>
                          <select
                            value={s.historyInstance ?? ''}
                            onChange={(e) => updateSeries(s.id, { historyInstance: e.target.value || undefined })}
                            className={inputCls}
                            style={inputStyle}
                          >
                            <option value="">{t('echart.liveData')}</option>
                            {adState.adapters.map((a) => (
                              <option key={a.instance} value={a.instance}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {s.historyInstance && (
                        <div className="mt-1.5">
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('echart.timeRange')}</label>
                          <div className="flex gap-1 flex-wrap">
                            {CHART_RANGES.map((r) => (
                              <button
                                key={r}
                                onClick={() => updateSeries(s.id, { historyRange: r })}
                                className="flex-1 text-[11px] py-1 rounded-md hover:opacity-80 transition-opacity"
                                style={{
                                  background: (s.historyRange ?? '24h') === r ? 'var(--accent)' : 'var(--app-bg)',
                                  color: (s.historyRange ?? '24h') === r ? '#fff' : 'var(--text-secondary)',
                                  border: `1px solid ${(s.historyRange ?? '24h') === r ? 'var(--accent)' : 'var(--app-border)'}`,
                                  minWidth: 36,
                                }}
                              >
                                {RANGE_LABELS[r]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Global settings ──────────────────────────────────────────────── */}
      <div className="mt-3">
        <div className="h-px mb-2" style={{ background: 'var(--app-border)' }} />
        <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('echart.globalSettings')}</p>

        {/* Show legend */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('echart.showLegend')}</label>
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

        {/* Left Y-Axis */}
        <div className="mb-2">
          <p className="text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>{t('echart.yAxisLeft')}</p>
          <div className="flex gap-1.5 mb-1">
            <input
              type="text"
              value={echartLeftUnit}
              onChange={(e) => setO({ echartLeftUnit: e.target.value || undefined })}
              placeholder={t('echart.unitLeft')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              value={echartLeftMin}
              onChange={(e) => setO({ echartLeftMin: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder={t('echart.min')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
            />
            <input
              type="number"
              value={echartLeftMax}
              onChange={(e) => setO({ echartLeftMax: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder={t('echart.max')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Right Y-Axis */}
        <div className="mb-2">
          <p className="text-[11px] mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>{t('echart.yAxisRight')}</p>
          <div className="flex gap-1.5 mb-1">
            <input
              type="text"
              value={echartRightUnit}
              onChange={(e) => setO({ echartRightUnit: e.target.value || undefined })}
              placeholder={t('echart.unitRight')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              value={echartRightMin}
              onChange={(e) => setO({ echartRightMin: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder={t('echart.min')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
            />
            <input
              type="number"
              value={echartRightMax}
              onChange={(e) => setO({ echartRightMax: e.target.value !== '' ? Number(e.target.value) : undefined })}
              placeholder={t('echart.max')}
              className={inputCls + ' flex-1'}
              style={inputStyle}
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
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
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
      {pickerForSeries && (
        <DatapointPicker
          currentValue={series.find((s) => s.id === pickerForSeries)?.datapointId ?? ''}
          onSelect={(id) => {
            updateSeries(pickerForSeries, { datapointId: id });
            // Invalidate adapter cache for this series so effect re-detects
            setAdapterStates((prev) => {
              const n = { ...prev };
              delete n[pickerForSeries];
              return n;
            });
            setPickerForSeries(null);
          }}
          onClose={() => setPickerForSeries(null)}
        />
      )}
    </div>
  );
}
