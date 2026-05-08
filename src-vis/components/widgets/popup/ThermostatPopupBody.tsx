import { useState } from 'react';
import { Thermometer, Flame, Snowflake, Minus, Plus } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import type { WidgetConfig } from '../../../types';
import type { ClickAction } from '../../../types';
import { useGlobalSettingsStore } from '../../../store/globalSettingsStore';
import { formatNum } from '../../../utils/formatValue';

interface Props {
  widget: WidgetConfig;
  action: Extract<ClickAction, { kind: 'popup-thermostat' }>;
}

function clamp(v: number, min: number, max: number, step: number) {
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

export function ThermostatPopupBody({ widget, action }: Props) {
  const setpointDp = action.setpointDp || widget.datapoint;
  const modeDp = action.modeDp || (widget.options?.actualDatapoint as string) || '';

  const { value: rawTarget } = useDatapoint(setpointDp);
  const { value: rawActual } = useDatapoint(modeDp);
  const { setState } = useIoBroker();

  const minTemp = (widget.options?.minTemp as number) ?? 10;
  const maxTemp = (widget.options?.maxTemp as number) ?? 30;
  const step    = (widget.options?.step    as number) ?? 0.5;
  const { defaultDecimals } = useGlobalSettingsStore();
  const decimals = (widget.options?.decimals as number) ?? defaultDecimals;

  const target = typeof rawTarget === 'number' ? rawTarget : 20;
  const actual = typeof rawActual === 'number' ? rawActual : null;

  const [draft, setDraft] = useState<number | null>(null);
  const display = draft ?? target;

  const isHeating = actual !== null && target > actual + 0.2;
  const isCooling = actual !== null && target < actual - 0.2;

  const setTemp = (v: number) => {
    const clamped = clamp(v, minTemp, maxTemp, step);
    setState(setpointDp, clamped);
    setDraft(null);
  };

  const accentColor = isHeating ? 'var(--accent-red, #ef4444)' : isCooling ? 'var(--accent)' : 'var(--text-secondary)';

  return (
    <div className="flex flex-col items-center gap-6 py-4 px-2">
      {/* Status badges */}
      <div className="flex gap-2">
        {isHeating && (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent-red, #ef4444)22', color: 'var(--accent-red, #ef4444)' }}>
            <Flame size={11} /> Heizt
          </span>
        )}
        {isCooling && (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
            <Snowflake size={11} /> Kühlt
          </span>
        )}
        {!isHeating && !isCooling && (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}>
            <Thermometer size={11} /> Standby
          </span>
        )}
      </div>

      {/* Temperatures */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-bold tabular-nums" style={{ color: accentColor }}>
            {formatNum(display, decimals)}
          </span>
          <span className="text-xl mb-1.5" style={{ color: 'var(--text-secondary)' }}>°C</span>
        </div>
        {actual !== null && (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ist: {formatNum(actual, decimals)} °C
          </span>
        )}
      </div>

      {/* +/- buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setTemp(display - step)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => setTemp(display + step)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
          style={{ background: accentColor, color: '#fff', border: 'none' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Slider */}
      <div className="w-full px-4">
        <input
          type="range" min={minTemp} max={maxTemp} step={step} value={display}
          onChange={(e) => setDraft(Number(e.target.value))}
          onMouseUp={() => { if (draft !== null) setTemp(draft); }}
          onTouchEnd={() => { if (draft !== null) setTemp(draft); }}
          style={{ accentColor }}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          <span>{minTemp}°</span><span>{maxTemp}°</span>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-2 flex-wrap justify-center">
        {((widget.options?.presets as number[]) ?? [18, 20, 22]).map((v) => (
          <button
            key={v}
            onClick={() => setTemp(v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            style={{
              background: Math.abs(display - v) < 0.1 ? accentColor : 'var(--app-bg)',
              color: Math.abs(display - v) < 0.1 ? '#fff' : 'var(--text-primary)',
              border: '1px solid var(--app-border)',
            }}
          >
            {v}°
          </button>
        ))}
      </div>
    </div>
  );
}
