import { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { TrendingUp, BarChart2 } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps, ioBrokerState } from '../../types';

interface DataPoint { t: number; v: number; }

export function ChartWidget({ config }: WidgetProps) {
  const { subscribe, connected } = useIoBroker();
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const unit = config.options?.unit as string | undefined;
  const layout = config.layout ?? 'default';

  useEffect(() => {
    if (!config.datapoint || !connected) return;
    const unsubscribe = subscribe(config.datapoint, (state: ioBrokerState) => {
      if (typeof state.val === 'number') {
        setCurrent(state.val);
        setHistory((prev) => [...prev, { t: state.ts, v: state.val as number }].slice(-60));
      }
    });
    return unsubscribe;
  }, [config.datapoint, connected, subscribe]);

  const tooltipStyle = {
    background: 'var(--app-surface)',
    border: '1px solid var(--app-border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
  };

  const noData = (
    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
      <BarChart2 size={24} strokeWidth={1} />
      <span className="text-xs">Warte auf Daten…</span>
    </div>
  );

  // --- CARD: Großes Area-Chart mit Gradient ---
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
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-h-0">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ''}`, '']} />
                <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#grad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </div>
    );
  }

  // --- COMPACT: Sparkline + aktueller Wert ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full">
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          {current !== null && (
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {current.toLocaleString('de-DE')}{unit && <span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
            </p>
          )}
        </div>
        <div className="w-20 h-full">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-full"><BarChart2 size={16} style={{ color: 'var(--text-secondary)' }} /></div>}
        </div>
      </div>
    );
  }

  // --- MINIMAL: Nur Zahl ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        {current !== null
          ? <span className="font-black text-center" style={{ color: 'var(--accent)', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
              {current.toLocaleString('de-DE')}{unit && <span className="text-base ml-1" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
            </span>
          : <BarChart2 size={24} style={{ color: 'var(--text-secondary)' }} />}
        <span className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        {current !== null && (
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            {current.toLocaleString('de-DE')}{unit ? ` ${unit}` : ''}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ''}`, '']} />
              <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : noData}
      </div>
    </div>
  );
}
