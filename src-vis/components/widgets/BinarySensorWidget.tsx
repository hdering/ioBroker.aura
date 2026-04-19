import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';

// Preset configurations per sensor sub-type
export const BINARY_SENSOR_PRESETS: Record<string, {
  labelOn: string; labelOff: string;
  colorOn: string; colorOff: string;
}> = {
  motion:    { labelOn: 'Bewegung',  labelOff: 'Ruhig',  colorOn: '#f59e0b', colorOff: 'var(--accent-green)' },
  smoke:     { labelOn: 'Alarm!',    labelOff: 'OK',     colorOn: 'var(--accent-red, #ef4444)', colorOff: 'var(--accent-green)' },
  doorbell:  { labelOn: 'Klingelt',  labelOff: 'Ruhig',  colorOn: '#f59e0b', colorOff: 'var(--text-secondary)' },
  vibration: { labelOn: 'Vibration', labelOff: 'Ruhig',  colorOn: '#f59e0b', colorOff: 'var(--accent-green)' },
  flood:     { labelOn: 'Wasser!',   labelOff: 'Trocken',colorOn: 'var(--accent-red, #ef4444)', colorOff: 'var(--accent-green)' },
  generic:   { labelOn: 'Aktiv',     labelOff: 'Inaktiv',colorOn: 'var(--accent-green)', colorOff: 'var(--text-secondary)' },
};

export function BinarySensorWidget({ config }: WidgetProps) {
  const opts = config.options ?? {};
  const { value } = useDatapoint(config.datapoint);

  const isActive = Boolean(value);
  const layout = config.layout ?? 'default';

  const preset = BINARY_SENSOR_PRESETS[(opts.sensorType as string) ?? 'generic'];
  const labelOn  = (opts.labelOn  as string) || preset.labelOn;
  const labelOff = (opts.labelOff as string) || preset.labelOff;
  const colorOn  = (opts.colorOn  as string) || preset.colorOn;
  const colorOff = (opts.colorOff as string) || preset.colorOff;

  const label = isActive ? labelOn : labelOff;
  const color = isActive ? colorOn : colorOff;
  const Icon = isActive ? ShieldAlert : CheckCircle2;
  const showTitle = opts.showTitle !== false;
  const showLabel = opts.showLabel !== false;

  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={isActive ? labelOn : labelOff}
      extraFields={{
        label:    isActive ? labelOn : labelOff,
        labelOn:  labelOn,
        labelOff: labelOff,
        active:   isActive ? 'Ja' : 'Nein',
      }}
    />
  );

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-widget"
        style={{
          position: 'relative',
          background: isActive
            ? `linear-gradient(135deg, ${colorOn}, color-mix(in srgb, ${colorOn} 60%, black))`
            : 'var(--app-bg)',
          border: `2px solid ${color}`,
        }}>
        <Icon size={36} style={{ color: isActive ? '#fff' : color }} />
        <div className="text-center">
          {showTitle && <p className="font-bold text-sm" style={{ color: isActive ? '#fff' : 'var(--text-primary)' }}>{config.title}</p>}
          {showLabel && <p className="text-xs opacity-80" style={{ color: isActive ? '#fff' : color }}>{label}</p>}
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── COMPACT ──────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full" style={{ position: 'relative' }}>
        <Icon size={18} style={{ color, flexShrink: 0 }} />
        {showTitle && (
          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {config.title}
          </span>
        )}
        {!showTitle && <span className="flex-1" />}
        {showLabel && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
            {label}
          </span>
        )}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1" style={{ position: 'relative' }}>
        <Icon size={36} style={{ color }} />
        {showLabel && <span className="text-xs font-medium" style={{ color }}>{label}</span>}
        {showTitle && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  const posClass = contentPositionClass(opts.contentPosition as string | undefined);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color, flexShrink: 0 }} />
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        </div>
      )}
      {showLabel && <span className="text-2xl font-bold" style={{ color }}>{label}</span>}
      <StatusBadges config={config} />
    </div>
  );
}
