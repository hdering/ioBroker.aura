import { Activity, TrendingUp, Hash } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';

export function ValueWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const unit = config.options?.unit as string | undefined;
  const layout = config.layout ?? 'default';

  const displayValue = value === null ? '–'
    : typeof value === 'number' ? value.toLocaleString('de-DE')
    : String(value);

  // --- CARD: Akzent-Leiste links, großer Wert zentriert ---
  if (layout === 'card') {
    return (
      <div className="flex h-full gap-3">
        <div className="w-1 rounded-full self-stretch" style={{ background: 'var(--accent)' }} />
        <div className="flex flex-col justify-between flex-1">
          <div className="flex items-center gap-2">
            <Activity size={14} style={{ color: 'var(--accent)' }} />
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          </div>
          <div>
            <span className="text-4xl font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{displayValue}</span>
            {unit && <span className="text-lg ml-1 font-medium" style={{ color: 'var(--accent)' }}>{unit}</span>}
          </div>
        </div>
      </div>
    );
  }

  // --- COMPACT: Inline-Darstellung ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center justify-between h-full gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Hash size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
        </div>
        <span className="text-xl font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
          {displayValue}{unit && <span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
        </span>
      </div>
    );
  }

  // --- MINIMAL: Nur Zahl, sehr groß ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="font-black text-center leading-none" style={{ color: 'var(--accent)', fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}>{displayValue}</span>
        {unit && <span className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
        <span className="text-xs mt-2 truncate max-w-full" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex items-center gap-2">
        <TrendingUp size={14} style={{ color: 'var(--text-secondary)' }} />
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{displayValue}</span>
        {unit && <span className="text-sm mb-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
      </div>
    </div>
  );
}
