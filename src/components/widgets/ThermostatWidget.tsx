import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Thermometer, Flame, Wind, X, Snowflake } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { lookupDatapointName } from '../../hooks/useDatapointList';
import type { WidgetProps, WidgetConfig } from '../../types';

// ── helpers ────────────────────────────────────────────────────────────────

function resolveTitle(config: WidgetConfig): string {
  if (config.title?.trim()) return config.title;
  return lookupDatapointName(config.datapoint)
    ?? config.datapoint.split('.').slice(-2).join(' ');
}

function clamp(v: number, min: number, max: number, step: number) {
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

// ── detail popup ───────────────────────────────────────────────────────────

function ThermostatDetail({ config, onClose }: { config: WidgetConfig; onClose: () => void }) {
  const { value: rawTarget } = useDatapoint(config.datapoint);
  const actualDpId = (config.options?.actualDatapoint as string) || '';
  const { value: rawActual } = useDatapoint(actualDpId);
  const { setState } = useIoBroker();

  const minTemp  = (config.options?.minTemp  as number) ?? 10;
  const maxTemp  = (config.options?.maxTemp  as number) ?? 30;
  const step     = (config.options?.step     as number) ?? 0.5;
  const presets  = (config.options?.presets  as number[]) ?? [18, 20, 22, 24];

  const target = typeof rawTarget === 'number' ? rawTarget : 20;
  const actual = typeof rawActual === 'number' ? rawActual : null;

  const isHeating  = actual !== null && target > actual + 0.2;
  const isCooling  = actual !== null && target < actual - 0.2;
  const accentColor = isHeating ? 'var(--accent-red)' : isCooling ? 'var(--accent)' : 'var(--text-secondary)';

  const setTemp = (v: number) => setState(config.datapoint, clamp(v, minTemp, maxTemp, step));

  const displayTitle = resolveTitle(config);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[200] p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-sm shadow-2xl"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex items-center gap-2">
            <Thermometer size={18} style={{ color: accentColor }} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{displayTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {isHeating && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--accent-red)22', color: 'var(--accent-red)' }}>
                <Flame size={10} /> Heizt
              </span>
            )}
            {isCooling && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                <Snowflake size={10} /> Kühlt
              </span>
            )}
            {!isHeating && !isCooling && actual !== null && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}>
                <Wind size={10} /> Standby
              </span>
            )}
            <button onClick={onClose} className="hover:opacity-60 ml-1" style={{ color: 'var(--text-secondary)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Ist-Temperatur */}
          {actual !== null && (
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-secondary)' }}>Isttemperatur</p>
              <p className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {actual.toFixed(1)}<span className="text-2xl">°C</span>
              </p>
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--app-border)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((actual - minTemp) / (maxTemp - minTemp)) * 100))}%`,
                    background: accentColor,
                  }} />
              </div>
            </div>
          )}

          {/* Soll-Temperatur Control */}
          <div>
            <p className="text-xs uppercase tracking-wider text-center mb-3" style={{ color: 'var(--text-secondary)' }}>Solltemperatur</p>
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setTemp(target - step)}
                disabled={target <= minTemp}
                className="w-16 h-16 rounded-2xl text-3xl font-bold hover:opacity-70 active:scale-95 transition-all disabled:opacity-25"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              >−</button>

              <div className="text-center flex-1">
                <p className="font-black leading-none" style={{ fontSize: 'calc(3.5rem * var(--font-scale, 1))', color: accentColor }}>
                  {target.toFixed(1)}
                </p>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>°C</p>
              </div>

              <button
                onClick={() => setTemp(target + step)}
                disabled={target >= maxTemp}
                className="w-16 h-16 rounded-2xl text-3xl font-bold hover:opacity-70 active:scale-95 transition-all disabled:opacity-25"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              >+</button>
            </div>
          </div>

          {/* Preset buttons */}
          {presets.length > 0 && (
            <div className="flex gap-2">
              {presets.map((p) => {
                const active = Math.abs(target - p) < step * 0.5;
                return (
                  <button key={p}
                    onClick={() => setTemp(p)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80 transition-all active:scale-95"
                    style={{
                      background: active ? accentColor : 'var(--app-bg)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${active ? accentColor : 'var(--app-border)'}`,
                    }}>
                    {p}°
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── main widget ────────────────────────────────────────────────────────────

export function ThermostatWidget({ config, editMode }: WidgetProps) {
  const [showDetail, setShowDetail] = useState(false);

  const actualDpId = (config.options?.actualDatapoint as string) || '';
  const { value: rawActual } = useDatapoint(actualDpId);
  const { value: rawTarget } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();

  const minTemp = (config.options?.minTemp as number) ?? 10;
  const maxTemp = (config.options?.maxTemp as number) ?? 30;
  const step    = (config.options?.step    as number) ?? 0.5;
  const clickable = (config.options?.clickable as boolean) ?? false;

  const target = typeof rawTarget === 'number' ? rawTarget : 20;
  const actual = typeof rawActual === 'number' ? rawActual : null;

  const isHeating  = actual !== null && target > actual + 0.2;
  const isCooling  = actual !== null && target < actual - 0.2;
  const accentColor = isHeating ? 'var(--accent-red)' : isCooling ? 'var(--accent)' : 'var(--text-secondary)';

  const displayTitle = resolveTitle(config);

  const setTemp = (v: number) => setState(config.datapoint, clamp(v, minTemp, maxTemp, step));

  const handleClick = () => {
    if (!editMode && clickable) setShowDetail(true);
  };

  const PlusMinus = () => (
    <div className="flex flex-col gap-1 shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setTemp(target + step); }}
        className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
        style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
      <button
        onClick={(e) => { e.stopPropagation(); setTemp(target - step); }}
        className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
        style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
    </div>
  );

  const StatusIcon = () => isHeating
    ? <Flame size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
    : isCooling
      ? <Snowflake size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      : <Wind size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.5 }} />;

  const layout = config.layout ?? 'default';
  const wrapperCls = `${clickable && !editMode ? 'cursor-pointer' : ''}`;

  // ── CARD ──────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <>
        <div className={`flex flex-col h-full justify-between ${wrapperCls}`} onClick={handleClick}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</p>
            <StatusIcon />
          </div>
          <div className="flex items-center justify-between flex-1 py-3">
            <div>
              <p className="font-black leading-none" style={{ fontSize: 'calc(3.5rem * var(--font-scale, 1))', color: accentColor }}>
                {target.toFixed(1)}
              </p>
              <p className="text-base font-light mt-0.5" style={{ color: 'var(--text-secondary)' }}>°C Soll</p>
              {actual !== null && (
                <p className="text-sm mt-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Ist: <span style={{ color: 'var(--text-primary)' }}>{actual.toFixed(1)}°C</span>
                </p>
              )}
            </div>
            <PlusMinus />
          </div>
          {actual !== null && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, Math.max(0, ((actual - minTemp) / (maxTemp - minTemp)) * 100))}%`,
                  background: accentColor,
                }} />
            </div>
          )}
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <>
        <div className={`flex items-center gap-3 h-full ${wrapperCls}`} onClick={handleClick}>
          <Thermometer size={18} style={{ color: accentColor, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {target.toFixed(1)}°
              {actual !== null && (
                <span className="text-sm font-normal ml-1.5" style={{ color: 'var(--text-secondary)' }}>
                  / {actual.toFixed(1)}°
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setTemp(target - step)}
              className="w-7 h-7 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
              style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
            <button onClick={() => setTemp(target + step)}
              className="w-7 h-7 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
              style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
          </div>
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <>
        <div className={`flex flex-col items-center justify-center h-full gap-2 ${wrapperCls}`} onClick={handleClick}>
          <Thermometer size={22} style={{ color: accentColor }} />
          <span className="font-black" style={{ fontSize: 'calc(2.5rem * var(--font-scale, 1))', color: 'var(--text-primary)', lineHeight: 1 }}>
            {target.toFixed(1)}°
          </span>
          {actual !== null && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ist {actual.toFixed(1)}°</span>
          )}
          <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setTemp(target - step)}
              className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
              style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
            <button onClick={() => setTemp(target + step)}
              className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
              style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
          </div>
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className={`flex flex-col h-full gap-2 ${wrapperCls}`} onClick={handleClick}>
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Thermometer size={13} style={{ color: accentColor, flexShrink: 0 }} />
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</p>
          </div>
          <StatusIcon />
        </div>

        {/* Temperature */}
        <div className="flex items-center justify-between flex-1">
          <div>
            <p className="font-black leading-none" style={{ fontSize: 'calc(2.8rem * var(--font-scale, 1))', color: accentColor }}>
              {target.toFixed(1)}
            </p>
            <p className="text-sm font-light" style={{ color: 'var(--text-secondary)' }}>°C Soll</p>
            {actual !== null && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Ist: <span style={{ color: 'var(--text-primary)' }}>{actual.toFixed(1)}°C</span>
              </p>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <PlusMinus />
          </div>
        </div>

        {/* Progress bar */}
        {actual !== null && (
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(0, ((actual - minTemp) / (maxTemp - minTemp)) * 100))}%`,
                background: accentColor,
              }} />
          </div>
        )}
      </div>
      {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
    </>
  );
}
