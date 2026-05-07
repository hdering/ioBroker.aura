import { useRef, useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis } from 'recharts';
import { Thermometer, Loader, BarChart2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfigStore } from '../../store/configStore';
import { useChartHistory, type ChartTimeRange, RANGE_LABELS } from '../../hooks/useChartHistory';
import type { WidgetProps } from '../../types';

const PRESET_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

function formatLabel(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ComfortBadge({ temp, humidity }: { temp: number | null; humidity: number | null }) {
  const tempOk = temp !== null && temp >= 18 && temp <= 24;
  const humOk  = humidity !== null && humidity >= 40 && humidity <= 60;
  const bothOk = tempOk && humOk;
  const color  = bothOk ? '#22c55e' : '#f59e0b';
  const label  = bothOk ? 'Komfortabel' : 'Außerhalb Komfortzone';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium self-start"
      style={{ background: `${color}22`, color }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function ClimateWidget({ config }: WidgetProps) {
  const { subscribe, connected } = useIoBroker();
  const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);

  const o               = config.options ?? {};
  const showTitle       = o.showTitle !== false;
  const showActualTemp  = o.showActualTemp !== false;
  const showTargetTemp  = o.showTargetTemp === true;
  const showHumidity    = o.showHumidity !== false;
  const showComfort     = o.showComfort === true;
  const showChart       = o.showChart !== false;

  const unit            = (o.unit as string | undefined) ?? '°C';
  const humidityUnit    = (o.humidityUnit as string | undefined) ?? '%';
  const lineColor       = (o.lineColor as string | undefined) ?? 'var(--accent)';
  const historyInstance = (o.historyInstance as string | undefined);
  const cfgRange        = (o.historyRange as ChartTimeRange | undefined) ?? '24h';
  const customVal       = (o.historyRangeCustomValue as number | undefined) ?? 24;
  const customUnit      = (o.historyRangeCustomUnit as 'h' | 'd' | undefined) ?? 'h';
  const cfgCustomMs     = cfgRange === 'custom'
    ? customVal * (customUnit === 'd' ? 86_400_000 : 3_600_000)
    : undefined;
  const lockRange       = o.lockRange === true;

  const targetDpId   = (o.targetDatapoint   as string | undefined) ?? '';
  const humidityDpId = (o.humidityDatapoint as string | undefined) ?? '';

  const { value: rawActual  } = useDatapoint(config.datapoint);
  const { value: rawTarget  } = useDatapoint(targetDpId);
  const { value: rawHumidity} = useDatapoint(humidityDpId);

  const actualTemp  = typeof rawActual   === 'number' ? rawActual   : null;
  const targetTemp  = typeof rawTarget   === 'number' ? rawTarget   : null;
  const humidity    = typeof rawHumidity === 'number' ? rawHumidity : null;

  // Range selector state
  const [activeRange,    setActiveRange]    = useState<ChartTimeRange>(cfgRange);
  const [activeCustomMs, setActiveCustomMs] = useState<number | undefined>(cfgCustomMs);
  useEffect(() => { setActiveRange(cfgRange); setActiveCustomMs(cfgCustomMs); }, [cfgRange, cfgCustomMs]);

  const { history, loading } = useChartHistory(
    config.datapoint,
    historyInstance,
    activeRange,
    connected,
    subscribe,
    activeCustomMs,
  );

  // ResizeObserver guard (same pattern as ChartWidget)
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSize, setHasSize] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setHasSize(el.clientWidth > 0 && el.clientHeight > 0);
    const ro = new ResizeObserver(() => {
      const w = containerRef.current?.clientWidth ?? 0;
      const h = containerRef.current?.clientHeight ?? 0;
      setHasSize(w > 0 && h > 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tooltipStyle = {
    background:   'var(--app-surface)',
    border:       '1px solid var(--app-border)',
    borderRadius: 8,
    fontSize:     Math.round(11 * fontScale),
    color:        'var(--text-primary)',
  };

  const showChartSection = showChart && !!historyInstance;

  const rangeSelector = showChartSection && !lockRange ? (
    <div className="flex gap-1 flex-wrap">
      {PRESET_RANGES.map((r) => {
        const active = activeRange === r;
        return (
          <button
            key={r}
            className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
            style={{
              background: active ? 'var(--accent)' : 'var(--app-border)',
              color: active ? '#fff' : 'var(--text-secondary)',
            }}
            onClick={() => { setActiveRange(r); setActiveCustomMs(undefined); }}
          >
            {RANGE_LABELS[r]}
          </button>
        );
      })}
      {cfgRange === 'custom' && (
        <button
          className="nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
          style={{
            background: activeRange === 'custom' ? 'var(--accent)' : 'var(--app-border)',
            color: activeRange === 'custom' ? '#fff' : 'var(--text-secondary)',
          }}
          onClick={() => { setActiveRange('custom'); setActiveCustomMs(cfgCustomMs); }}
        >
          {customVal}{customUnit === 'd' ? 'd' : 'h'}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="flex flex-col h-full gap-1">

      {/* Title */}
      {showTitle && (
        <div className="flex items-center gap-1 min-w-0">
          <Thermometer size={13} strokeWidth={1.5} style={{ color: lineColor, flexShrink: 0 }} />
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        </div>
      )}

      {/* Main values */}
      {(showActualTemp || showHumidity || showTargetTemp) && (
        <div className="flex items-end justify-between gap-2">
          {showActualTemp && (
            <span className="font-black leading-none" style={{ fontSize: Math.round(30 * fontScale), color: 'var(--text-primary)' }}>
              {actualTemp !== null ? actualTemp.toLocaleString('de-DE') : '–'}
              <span className="ml-0.5 font-medium" style={{ fontSize: Math.round(16 * fontScale), color: 'var(--text-secondary)' }}>
                {unit}
              </span>
            </span>
          )}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {showTargetTemp && targetTemp !== null && (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
              >
                ↑ {targetTemp.toLocaleString('de-DE')}{unit}
              </span>
            )}
            {showHumidity && (
              <span className="font-medium" style={{ fontSize: Math.round(14 * fontScale), color: 'var(--text-secondary)' }}>
                💧 {humidity !== null ? humidity.toLocaleString('de-DE') : '–'}{humidityUnit}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Comfort badge */}
      {showComfort && <ComfortBadge temp={actualTemp} humidity={humidity} />}

      {/* Range selector */}
      {rangeSelector && <div>{rangeSelector}</div>}

      {/* Chart */}
      {showChartSection && (
        <div className="flex-1" style={{ minHeight: 1 }}>
          {history.length > 1 ? (
            hasSize ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id={`climate-grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={lineColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['auto', 'auto']} hide />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={formatLabel}
                    formatter={(v: number) => `${v.toLocaleString('de-DE')} ${unit}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={lineColor}
                    strokeWidth={2}
                    fill={`url(#climate-grad-${config.id})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
              {loading
                ? <Loader size={16} strokeWidth={1.5} className="animate-spin" />
                : <BarChart2 size={18} strokeWidth={1} />}
              <span className="text-xs">{loading ? 'Lade Verlauf…' : 'Warte auf Daten…'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
