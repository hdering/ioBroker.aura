import { Thermometer, Flame, Wind } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';

export function ThermostatWidget({ config }: WidgetProps) {
  const actualDp = (config.options?.actualDatapoint as string) ?? config.datapoint;
  const { value: actual } = useDatapoint(actualDp);
  const { value: target } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const targetTemp = typeof target === 'number' ? target : 20;
  const actualTemp = typeof actual === 'number' ? actual : null;
  const layout = config.layout ?? 'default';

  const isHeating = actualTemp !== null && targetTemp > actualTemp;
  const accentColor = isHeating ? 'var(--accent-red)' : 'var(--accent)';

  const plusMinus = (
    <div className="flex flex-col gap-1">
      <button onClick={() => setState(config.datapoint, targetTemp + 0.5)}
        className="w-8 h-8 rounded-lg font-bold text-lg transition-opacity hover:opacity-70 focus:outline-none"
        style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
      <button onClick={() => setState(config.datapoint, targetTemp - 0.5)}
        className="w-8 h-8 rounded-lg font-bold text-lg transition-opacity hover:opacity-70 focus:outline-none"
        style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
    </div>
  );

  // --- CARD: Großes Thermostat mit Heizungsindikator ---
  if (layout === 'card') {
    return (
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-center justify-between">
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          {isHeating
            ? <Flame size={14} style={{ color: 'var(--accent-red)' }} />
            : <Wind size={14} style={{ color: 'var(--text-secondary)' }} />}
        </div>
        <div className="flex items-center justify-between flex-1 py-2">
          <div>
            <p className="text-5xl font-black leading-none" style={{ color: accentColor }}>{targetTemp.toFixed(1)}</p>
            <p className="text-lg font-light" style={{ color: 'var(--text-secondary)' }}>°C Soll</p>
            {actualTemp !== null && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Ist: {actualTemp.toFixed(1)}°C</p>
            )}
          </div>
          {plusMinus}
        </div>
        {actualTemp !== null && (
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, (actualTemp / targetTemp) * 100))}%`, background: accentColor }} />
          </div>
        )}
      </div>
    );
  }

  // --- COMPACT ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full">
        <Thermometer size={18} style={{ color: accentColor, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {targetTemp.toFixed(1)}°
            {actualTemp !== null && <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-secondary)' }}>/ {actualTemp.toFixed(1)}°</span>}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setState(config.datapoint, targetTemp - 0.5)}
            className="w-7 h-7 rounded font-bold text-sm hover:opacity-70"
            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
          <button onClick={() => setState(config.datapoint, targetTemp + 0.5)}
            className="w-7 h-7 rounded font-bold text-sm hover:opacity-70"
            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
        </div>
      </div>
    );
  }

  // --- MINIMAL ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Thermometer size={24} style={{ color: accentColor }} />
        <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{targetTemp.toFixed(1)}°</span>
        <div className="flex gap-2">
          <button onClick={() => setState(config.datapoint, targetTemp - 0.5)}
            className="w-8 h-8 rounded-full font-bold hover:opacity-70"
            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
          <button onClick={() => setState(config.datapoint, targetTemp + 0.5)}
            className="w-8 h-8 rounded-full font-bold hover:opacity-70"
            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
        </div>
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex items-center gap-2">
        <Thermometer size={14} style={{ color: accentColor }} />
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{targetTemp.toFixed(1)}°</p>
          {actualTemp !== null && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ist: {actualTemp.toFixed(1)}°</p>}
        </div>
        {plusMinus}
      </div>
    </div>
  );
}
