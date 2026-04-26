import { Power } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle, titleTextAlign } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

export function SwitchWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const isOn = Boolean(value);
  const layout = config.layout ?? 'default';
  const o = config.options ?? {};
  const momentary      = (o.momentary      as boolean) ?? false;
  const momentaryDelay = (o.momentaryDelay as number)  ?? 500;

  const toggle = () => {
    if (momentary) {
      setState(config.datapoint, true);
      setTimeout(() => setState(config.datapoint, false), momentaryDelay);
    } else {
      setState(config.datapoint, !isOn);
    }
  };

  const WidgetIcon = getWidgetIcon(config.options?.icon as string | undefined, Power);
  const showTitle = o.showTitle !== false;
  const showLabel = o.showLabel !== false;

  const iconSize = (o.iconSize as number) || 36;
  const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={isOn ? 'AN' : 'AUS'}
      extraFields={{ battery, reach }}
      extraComponents={{
        icon:            <WidgetIcon size={iconSize} style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }} />,
        'battery-icon':  batteryIcon,
        'reach-icon':    reachIcon,
        'status-badges': statusBadges,
        toggle: (
          <button
            onClick={toggle}
            className="nodrag relative w-10 h-5 rounded-full transition-colors focus:outline-none"
            style={{ background: isOn ? 'var(--accent)' : 'var(--app-border)' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
              style={{ left: isOn ? '22px' : '2px' }}
            />
          </button>
        ),
      }}
    />
  );

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
        <WidgetIcon
          size={iconSize}
          style={{ color: isOn ? '#fff' : 'var(--text-secondary)', filter: isOn ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'none' }}
        />
        <div className="text-center">
          {showTitle && <p className="font-bold text-sm" style={{ color: isOn ? '#fff' : 'var(--text-secondary)' }}>{config.title}</p>}
          {showLabel && <p className="text-xs opacity-70" style={{ color: isOn ? '#fff' : 'var(--text-secondary)' }}>{isOn ? 'AN' : 'AUS'}</p>}
        </div>
        <StatusBadges config={config} />
      </button>
    );
  }

  // --- COMPACT: Zeile mit Icon + Titel + Toggle ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2 h-full" style={{ position: 'relative' }}>
        <WidgetIcon size={iconSize} style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }} />
        {showTitle && <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{config.title}</span>}
        {!showTitle && <span className="flex-1" />}
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
          <WidgetIcon
            size={iconSize}
            style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)' }}
          />
        </button>
        {showTitle && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
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
      {showTitle && (
        <div className="flex items-center gap-2" style={titleStyle}>
          <WidgetIcon size={iconSize} style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)', textAlign: titleAlign, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.title}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        {showLabel && (
          <span className="text-2xl font-bold" style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
            {isOn ? 'AN' : 'AUS'}
          </span>
        )}
        <button onClick={toggle}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${!showLabel ? 'ml-auto' : ''}`}
          style={{ background: isOn ? 'var(--accent-green)' : 'var(--app-border)' }}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>
      <StatusBadges config={config} />
    </div>
  );
}
