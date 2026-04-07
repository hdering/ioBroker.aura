import { Sun, SunDim } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';

export function DimmerWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const level = typeof value === 'number' ? Math.round(value) : 0;
  const layout = config.layout ?? 'default';

  const slider = (
    <input type="range" min={0} max={100} value={level}
      onChange={(e) => setState(config.datapoint, Number(e.target.value))}
      style={{ accentColor: 'var(--accent-yellow)' }}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer" />
  );

  // --- CARD: Großes Glühbirnen-Icon, Helligkeit als Opacity ---
  if (layout === 'card') {
    const opacity = 0.2 + (level / 100) * 0.8;
    return (
      <div className="flex flex-col h-full justify-between">
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          <Sun size={40} strokeWidth={1.5}
            style={{ color: 'var(--accent-yellow)', opacity, filter: level > 0 ? `drop-shadow(0 0 ${level / 10}px var(--accent-yellow))` : 'none', transition: 'all 0.3s' }} />
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{level}%</span>
        </div>
        {slider}
      </div>
    );
  }

  // --- COMPACT ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full">
        <SunDim size={16} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)', flexShrink: 0 }} />
        <div className="flex-1 space-y-1">
          <div className="flex justify-between">
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{level}%</span>
          </div>
          {slider}
        </div>
      </div>
    );
  }

  // --- MINIMAL: Nur Slider + Prozentzahl ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-3xl font-black" style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>{level}%</span>
        {slider}
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex items-center gap-2">
        <SunDim size={14} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)' }} />
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{level}%</span>
          <div className="w-3 h-3 rounded-full transition-all"
            style={{ background: level > 0 ? 'var(--accent-yellow)' : 'var(--app-border)', boxShadow: level > 0 ? '0 0 6px var(--accent-yellow)' : 'none' }} />
        </div>
        {slider}
      </div>
    </div>
  );
}
