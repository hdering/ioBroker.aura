import { useMemo } from 'react';
import { Sun, SunDim } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';

export function DimmerWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const level = typeof value === 'number' ? Math.round(value) : 0;
  const layout = config.layout ?? 'default';
  const CompactIcon = getWidgetIcon(config.options?.icon as string | undefined, SunDim);
  const o = config.options ?? {};
  const showTitle  = o.showTitle  !== false;
  const showValue  = o.showValue  !== false;
  const showSlider = o.showSlider !== false;

  const thresholds = o.colorThresholds as Array<[number, string]> | undefined;
  const thresholdColor = useMemo(() => {
    if (!thresholds?.length) return undefined;
    for (const [thresh, color] of thresholds) {
      if (level < thresh) return color;
    }
    return thresholds[thresholds.length - 1][1];
  }, [thresholds, level]);
  const valueColor = thresholdColor ?? 'var(--text-primary)';

  const slider = (
    <input type="range" min={0} max={100} value={level}
      onChange={(e) => setState(config.datapoint, Number(e.target.value))}
      style={{ accentColor: 'var(--accent-yellow)' }}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer" />
  );

  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={`${level}`}
      extraFields={{
        level:  `${level}%`,
        status: level === 0 ? 'Aus' : level === 100 ? 'Voll' : `${level}%`,
        on:     level > 0 ? 'Ein' : 'Aus',
      }}
      extraComponents={{
        slider: (
          <input type="range" min={0} max={100} step={1} value={level}
            onChange={(e) => setState(config.datapoint, Number(e.target.value))}
            style={{ accentColor: 'var(--accent)', width: '100%' }}
            className="nodrag h-1.5 rounded-full appearance-none cursor-pointer"
          />
        ),
      }}
    />
  );

  // --- CARD: Großes Glühbirnen-Icon, Helligkeit als Opacity ---
  if (layout === 'card') {
    const opacity = 0.2 + (level / 100) * 0.8;
    return (
      <div className="flex flex-col h-full justify-between" style={{ position: 'relative' }}>
        {showTitle && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>}
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          <Sun size={40} strokeWidth={1.5}
            style={{ color: 'var(--accent-yellow)', opacity, filter: level > 0 ? `drop-shadow(0 0 ${level / 10}px var(--accent-yellow))` : 'none', transition: 'all 0.3s' }} />
          {showValue && <span className="text-2xl font-bold" style={{ color: valueColor }}>{level}%</span>}
        </div>
        {showSlider && slider}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- COMPACT ---
  if (layout === 'compact') {
    return (
      <div className="flex flex-col justify-center h-full gap-1.5" style={{ position: 'relative' }}>
        <div className="flex items-center gap-2">
          <CompactIcon size={16} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)', flexShrink: 0 }} />
          {showTitle && <span className="flex-1 text-sm truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
          {!showTitle && <span className="flex-1" />}
          {showValue && <span className="text-sm font-bold shrink-0" style={{ color: valueColor }}>{level}%</span>}
        </div>
        {showSlider && (
          <input type="range" min={0} max={100} step={1} value={level}
            onChange={(e) => setState(config.datapoint, Number(e.target.value))}
            style={{ accentColor: 'var(--accent-yellow)' }}
            className="ml-6 h-1.5 rounded-full appearance-none cursor-pointer" />
        )}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- MINIMAL: Nur Slider + Prozentzahl ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ position: 'relative' }}>
        {showValue && <span className="text-3xl font-black" style={{ color: thresholdColor ?? (level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)') }}>{level}%</span>}
        {showSlider && slider}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full justify-between" style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center gap-2">
          <SunDim size={14} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)' }} />
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        </div>
      )}
      <div className="space-y-2">
        {showValue && (
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold" style={{ color: valueColor }}>{level}%</span>
            <div className="w-3 h-3 rounded-full transition-all"
              style={{ background: level > 0 ? 'var(--accent-yellow)' : 'var(--app-border)', boxShadow: level > 0 ? '0 0 6px var(--accent-yellow)' : 'none' }} />
          </div>
        )}
        {showSlider && slider}
      </div>
      <StatusBadges config={config} />
    </div>
  );
}
