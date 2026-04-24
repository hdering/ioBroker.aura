import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Thermometer, Flame, Wind, X, Snowflake } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { lookupDatapointName } from '../../hooks/useDatapointList';
import type { WidgetProps, WidgetConfig } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

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
  const t = useT();
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
                <Flame size={10} /> {t('thermo.heating')}
              </span>
            )}
            {isCooling && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                <Snowflake size={10} /> {t('thermo.cooling')}
              </span>
            )}
            {!isHeating && !isCooling && actual !== null && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}>
                <Wind size={10} /> {t('thermo.standby')}
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
  const t = useT();
  const [showDetail, setShowDetail] = useState(false);

  const actualDpId = (config.options?.actualDatapoint as string) || '';
  const { value: rawActual } = useDatapoint(actualDpId);
  const { value: rawTarget } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();

  const minTemp = (config.options?.minTemp as number) ?? 10;
  const maxTemp = (config.options?.maxTemp as number) ?? 30;
  const step    = (config.options?.step    as number) ?? 0.5;
  const clickable = (config.options?.clickable as boolean) ?? false;
  const o = config.options ?? {};
  const showTitle      = o.showTitle      !== false;
  const showSetpoint   = o.showSetpoint   !== false;
  const showActualTemp = o.showActualTemp !== false;
  const showControls   = o.showControls   !== false;
  const ThermoIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
  const iconSize   = (o.iconSize as number) || 36;

  const target = typeof rawTarget === 'number' ? rawTarget : 20;
  const actual = typeof rawActual === 'number' ? rawActual : null;

  const isHeating  = actual !== null && target > actual + 0.2;
  const isCooling  = actual !== null && target < actual - 0.2;
  const accentColor = isHeating ? 'var(--accent-red)' : isCooling ? 'var(--accent)' : 'var(--text-secondary)';

  const thresholds = o.colorThresholds as Array<[number, string]> | undefined;
  const thresholdNum = actual ?? target;
  const thresholdColor = useMemo(() => {
    if (!thresholds?.length) return undefined;
    for (const [thresh, color] of thresholds) {
      if (thresholdNum < thresh) return color;
    }
    return thresholds[thresholds.length - 1][1];
  }, [thresholds, thresholdNum]);
  const valueColor = thresholdColor ?? accentColor;

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
  const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

  if (layout === 'custom') {
    const btnSty: React.CSSProperties = { background: 'var(--app-border)', color: 'var(--text-primary)', borderRadius: 6, width: 28, height: 28, fontWeight: 'bold', fontSize: 16, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };
    return (
      <CustomGridView
        config={config}
        value={typeof rawTarget === 'number' ? rawTarget.toFixed(1) : '–'}
        extraFields={{
          setpoint: typeof rawTarget === 'number' ? rawTarget.toFixed(1) : '–',
          actual:   actual !== null ? actual.toFixed(1) : '–',
          status:   isHeating ? 'Heizend' : isCooling ? 'Kühlend' : 'Inaktiv',
          battery,
          reach,
        }}
        extraComponents={{
          icon:            <ThermoIcon size={iconSize} style={{ color: accentColor, flexShrink: 0 }} />,
          'btn-plus':      <button className="nodrag" style={btnSty} onClick={() => setTemp(target + step)}>+</button>,
          'btn-minus':     <button className="nodrag" style={btnSty} onClick={() => setTemp(target - step)}>−</button>,
          'battery-icon':  batteryIcon,
          'reach-icon':    reachIcon,
          'status-badges': statusBadges,
        }}
      />
    );
  }

  // ── CARD ──────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <>
        <div className={`flex flex-col h-full justify-between ${wrapperCls}`} style={{ position: 'relative' }} onClick={handleClick}>
          {showTitle && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</p>
              <StatusIcon />
            </div>
          )}
          <div className="flex items-center justify-between flex-1 py-3">
            <div>
              {showSetpoint && (
                <>
                  <p className="font-black leading-none" style={{ fontSize: 'calc(3.5rem * var(--font-scale, 1))', color: valueColor }}>
                    {target.toFixed(1)}
                  </p>
                  <p className="text-base font-light mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('thermo.setPoint')}</p>
                </>
              )}
              {showActualTemp && actual !== null && (
                <p className="text-sm mt-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {t('thermo.actual')}: <span style={{ color: 'var(--text-primary)' }}>{actual.toFixed(1)}°C</span>
                </p>
              )}
            </div>
            {showControls && <PlusMinus />}
          </div>
          {showActualTemp && actual !== null && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, Math.max(0, ((actual - minTemp) / (maxTemp - minTemp)) * 100))}%`,
                  background: accentColor,
                }} />
            </div>
          )}
          <StatusBadges config={config} />
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <>
        <div className={`flex items-center gap-2 h-full ${wrapperCls}`} style={{ position: 'relative' }} onClick={handleClick}>
          <ThermoIcon size={iconSize} style={{ color: accentColor, flexShrink: 0 }} />
          {showTitle && <span className="flex-1 text-sm truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</span>}
          {!showTitle && <span className="flex-1" />}
          {showSetpoint && (
            <span className="text-sm font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
              {target.toFixed(1)}°
              {showActualTemp && actual !== null && (
                <span className="font-normal text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>
                  / {actual.toFixed(1)}°
                </span>
              )}
            </span>
          )}
          {showControls && (
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setTemp(target - step)}
                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
              <button onClick={() => setTemp(target + step)}
                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
            </div>
          )}
          <StatusBadges config={config} />
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <>
        <div className={`flex flex-col items-center justify-center h-full gap-2 ${wrapperCls}`} style={{ position: 'relative' }} onClick={handleClick}>
          <ThermoIcon size={iconSize} style={{ color: accentColor }} />
          {showSetpoint && (
            <span className="font-black" style={{ fontSize: 'calc(2.5rem * var(--font-scale, 1))', color: valueColor, lineHeight: 1 }}>
              {target.toFixed(1)}°
            </span>
          )}
          {showActualTemp && actual !== null && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('thermo.actual')} {actual.toFixed(1)}°</span>
          )}
          {showControls && (
            <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setTemp(target - step)}
                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>−</button>
              <button onClick={() => setTemp(target + step)}
                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}>+</button>
            </div>
          )}
          <StatusBadges config={config} />
        </div>
        {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
      </>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className={`flex flex-col h-full gap-2 ${wrapperCls}`} style={{ position: 'relative' }} onClick={handleClick}>
        {/* Title row */}
        {showTitle && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <ThermoIcon size={iconSize} style={{ color: accentColor, flexShrink: 0 }} />
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{displayTitle}</p>
            </div>
            <StatusIcon />
          </div>
        )}

        {/* Temperature */}
        <div className="flex items-center justify-between flex-1">
          <div>
            {showSetpoint && (
              <>
                <p className="font-black leading-none" style={{ fontSize: 'calc(2.8rem * var(--font-scale, 1))', color: valueColor }}>
                  {target.toFixed(1)}
                </p>
                <p className="text-sm font-light" style={{ color: 'var(--text-secondary)' }}>{t('thermo.setPoint')}</p>
              </>
            )}
            {showActualTemp && actual !== null && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('thermo.actual')}: <span style={{ color: 'var(--text-primary)' }}>{actual.toFixed(1)}°C</span>
              </p>
            )}
          </div>
          {showControls && (
            <div onClick={(e) => e.stopPropagation()}>
              <PlusMinus />
            </div>
          )}
        </div>

        {/* Progress bar */}
        {showActualTemp && actual !== null && (
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(0, ((actual - minTemp) / (maxTemp - minTemp)) * 100))}%`,
                background: accentColor,
              }} />
          </div>
        )}
        <StatusBadges config={config} />
      </div>
      {showDetail && <ThermostatDetail config={config} onClose={() => setShowDetail(false)} />}
    </>
  );
}
