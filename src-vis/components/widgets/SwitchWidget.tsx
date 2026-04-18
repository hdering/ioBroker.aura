import { Power, Lightbulb, ToggleRight } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle, titleTextAlign } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';

export function SwitchWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const isOn = Boolean(value);
  const layout = config.layout ?? 'default';
  const toggle = () => setState(config.datapoint, !isOn);
  const CompactIcon = getWidgetIcon(config.options?.icon as string | undefined, Power);

  // --- CARD: Vollflächige farbige Karte mit großem Icon ---
  if (layout === 'card') {
    return (
      <button
        onClick={toggle}
        className="w-full h-full flex flex-col items-center justify-center gap-3 rounded-widget transition-all duration-300"
        style={{
          position: 'relative',
          background: isOn ? 'linear-gradient(135deg, var(--accent-green), color-mix(in srgb, var(--accent-green) 60%, black))' : 'var(--app-bg)',
          border: `2px solid ${isOn ? 'var(--accent-green)' : 'var(--app-border)'}`,
        }}
      >
        <Lightbulb
          size={36}
          strokeWidth={1.5}
          style={{ color: isOn ? '#fff' : 'var(--text-secondary)', filter: isOn ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'none' }}
        />
        <div className="text-center">
          <p className="font-bold text-sm" style={{ color: isOn ? '#fff' : 'var(--text-secondary)' }}>{config.title}</p>
          <p className="text-xs opacity-70" style={{ color: isOn ? '#fff' : 'var(--text-secondary)' }}>{isOn ? 'AN' : 'AUS'}</p>
        </div>
        <StatusBadges config={config} />
      </button>
    );
  }

  // --- COMPACT: Zeile mit Icon + Titel + Toggle ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full" style={{ position: 'relative' }}>
        <CompactIcon size={18} style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }} />
        <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{config.title}</span>
        <button onClick={toggle}
          className="relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none"
          style={{ background: isOn ? 'var(--accent-green)' : 'var(--app-border)' }}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- MINIMAL: Nur großer Toggle-Button ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ position: 'relative' }}>
        <button onClick={toggle} className="focus:outline-none transition-transform active:scale-95">
          <ToggleRight
            size={48}
            strokeWidth={1.5}
            style={{
              color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)',
              transform: isOn ? 'none' : 'scaleX(-1)',
              transition: 'all 0.2s',
            }}
          />
        </button>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- DEFAULT ---
  const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);
  const titlePos = config.options?.titlePosition as string | undefined;
  const titleStyle = titlePositionStyle(titlePos);
  const titleAlign = titleTextAlign(titlePos);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      <div className="flex items-center gap-2" style={titleStyle}>
        <Power size={14} style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }} />
        <p className="text-xs" style={{ color: 'var(--text-secondary)', textAlign: titleAlign, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.title}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold" style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
          {isOn ? 'AN' : 'AUS'}
        </span>
        <button onClick={toggle}
          className="relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none"
          style={{ background: isOn ? 'var(--accent-green)' : 'var(--app-border)' }}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>
      <StatusBadges config={config} />
    </div>
  );
}
