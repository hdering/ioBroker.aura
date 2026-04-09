import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis } from 'recharts';
import { TrendingUp, BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfigStore } from '../../store/configStore';
import { useChartHistory, type ChartTimeRange, RANGE_LABELS } from '../../hooks/useChartHistory';
import type { WidgetProps } from '../../types';

function formatTick(ts: number, range: ChartTimeRange): string {
  const d = new Date(ts);
  if (range === '7d' || range === '30d') {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatLabel(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function ChartWidget({ config }: WidgetProps) {
  const { subscribe, connected } = useIoBroker();
  const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);

  const unit            = (config.options?.unit as string | undefined);
  const historyInstance = (config.options?.historyInstance as string | undefined);
  const timeRange       = ((config.options?.historyRange as ChartTimeRange | undefined) ?? '24h');
  const layout          = config.layout ?? 'default';

  const { history, current, loading } = useChartHistory(
    config.datapoint,
    historyInstance,
    timeRange,
    connected,
    subscribe,
  );

  const tooltipStyle = {
    background:   'var(--app-surface)',
    border:       '1px solid var(--app-border)',
    borderRadius: 8,
    fontSize:     Math.round(11 * fontScale),
    color:        'var(--text-primary)',
  };

  const tickStyle = { fontSize: Math.round(10 * fontScale), fill: 'var(--text-secondary)' };

  const noData = (
    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
      {loading
        ? <Loader size={20} strokeWidth={1.5} className="animate-spin" />
        : <BarChart2 size={24} strokeWidth={1} />}
      <span className="text-xs">{loading ? 'Lade Verlauf…' : 'Warte auf Daten…'}</span>
    </div>
  );

  const rangeLabel = historyInstance ? RANGE_LABELS[timeRange] : null;

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
            {current !== null && (
              <p className="text-3xl font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
                {current.toLocaleString('de-DE')}
                {unit && <span className="text-lg ml-1 font-medium" style={{ color: 'var(--accent)' }}>{unit}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {rangeLabel && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{rangeLabel}</span>}
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={['auto', 'auto']} hide />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" hide />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={formatLabel}
                  formatter={(v: number) => [`${v.toLocaleString('de-DE')}${unit ? ` ${unit}` : ''}`, '']} />
                <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2}
                  fill="url(#grad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full">
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          {current !== null && (
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {current.toLocaleString('de-DE')}
              {unit && <span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
            </p>
          )}
          {rangeLabel && <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{rangeLabel}</p>}
        </div>
        <div className="w-20 h-full">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5}
                  dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-full">
            {loading
              ? <Loader size={14} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              : <BarChart2 size={16} style={{ color: 'var(--text-secondary)' }} />}
          </div>}
        </div>
      </div>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        {current !== null
          ? <span className="font-black text-center" style={{ color: 'var(--accent)', fontSize: 'calc(clamp(1.5rem, 3vw, 2.5rem) * var(--font-scale, 1))' }}>
              {current.toLocaleString('de-DE')}
              {unit && <span className="text-base ml-1" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
            </span>
          : <BarChart2 size={24} style={{ color: 'var(--text-secondary)' }} />}
        <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {rangeLabel && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{rangeLabel}</span>}
          {current !== null && (
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {current.toLocaleString('de-DE')}{unit ? ` ${unit}` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={['auto', 'auto']} hide />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(ts) => formatTick(ts, timeRange)}
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={formatLabel}
                formatter={(v: number) => [`${v.toLocaleString('de-DE')}${unit ? ` ${unit}` : ''}`, '']} />
              <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2}
                dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : noData}
      </div>
    </div>
  );
}
