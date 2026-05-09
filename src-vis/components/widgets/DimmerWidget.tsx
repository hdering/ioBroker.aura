import React, { useMemo, useState, type CSSProperties } from 'react';
import { SunDim } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

export function DimmerWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const { setState } = useIoBroker();
  const level = typeof value === 'number' ? Math.round(value) : 0;
  const layout = config.layout ?? 'default';
  const CompactIcon = useMemo(() => getWidgetIcon(config.options?.icon as string | undefined, SunDim), [config.options?.icon]);
  const o = config.options ?? {};
  const showTitle      = o.showTitle      !== false;
  const titleAlign     = (o.titleAlign    as string) ?? 'left';
  const showValue      = o.showValue      !== false;
  const showSlider     = o.showSlider     !== false;
  const showToggle     = o.showToggle     === true;
  const showIcon       = o.showIcon       !== false;
  const sendOnRelease  = o.sendOnRelease  !== false;
  const iconSize       = (o.iconSize as number) || 20;
  const barStyle       = !!o.barStyle;
  const barSize        = (o.barSize as number) ?? 100;

  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayLevel = dragValue ?? level;
  const fillRatio = displayLevel / 100;

  const handleSliderChange = (v: number) => {
    if (sendOnRelease) { setDragValue(v); } else { setState(config.datapoint, v); }
  };
  const handleSliderRelease = () => {
    if (sendOnRelease && dragValue !== null) {
      setState(config.datapoint, dragValue);
      setDragValue(null);
    }
  };

  const getBarValue = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  };
  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleSliderChange(getBarValue(e));
  };
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.buttons & 1)) return;
    handleSliderChange(getBarValue(e));
  };

  const thresholds = o.colorThresholds as Array<[number, string]> | undefined;
  const thresholdColor = useMemo(() => {
    if (!thresholds?.length) return undefined;
    for (const [thresh, color] of thresholds) {
      if (displayLevel < thresh) return color;
    }
    return thresholds[thresholds.length - 1][1];
  }, [thresholds, displayLevel]);
  const valueColor = thresholdColor ?? 'var(--text-primary)';

  const isOn = displayLevel > 0;
  const handleToggle = () => setState(config.datapoint, isOn ? 0 : 100);

  const toggleBtn = showToggle && (
    <button
      onClick={handleToggle}
      className="nodrag relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none"
      style={{ background: isOn ? 'var(--accent-green)' : 'var(--app-border)' }}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  const slider = (
    <input type="range" min={0} max={100} value={displayLevel}
      onChange={(e) => handleSliderChange(Number(e.target.value))}
      onMouseUp={handleSliderRelease} onTouchEnd={handleSliderRelease}
      style={{ '--slider-thumb-color': 'var(--accent-yellow)' } as CSSProperties}
      className="nodrag w-full h-2 rounded-lg appearance-none cursor-pointer" />
  );

  const barTrack = (
    <div
      className="nodrag relative rounded-2xl overflow-hidden cursor-pointer select-none"
      style={{
        width: '100%',
        height: `${barSize}%`,
        background: 'color-mix(in srgb, var(--accent-yellow) 20%, var(--app-bg))',
      }}
      onPointerDown={onBarPointerDown}
      onPointerMove={onBarPointerMove}
      onPointerUp={handleSliderRelease}
    >
      <div
        className="absolute top-0 left-0 bottom-0 rounded-r-2xl"
        style={{ width: `${fillRatio * 100}%`, background: 'var(--accent-yellow)' }}
      />
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          left: `${fillRatio * 100}%`,
          transform: 'translateX(-9px)',
          top: '20%', bottom: '20%',
          width: '3px',
          background: 'rgba(255,255,255,0.85)',
        }}
      />
    </div>
  );

  const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={`${level}`}
      rawValue={level}
      extraFields={{
        level:  `${level}%`,
        status: level === 0 ? 'Aus' : level === 100 ? 'Voll' : `${level}%`,
        on:     level > 0 ? 'Ein' : 'Aus',
        battery,
        reach,
      }}
      extraComponents={{
        icon:            showIcon ? <CompactIcon size={iconSize} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)', flexShrink: 0 }} /> : null,
        'battery-icon':  batteryIcon,
        'reach-icon':    reachIcon,
        'status-badges': statusBadges,
        slider: barStyle ? barTrack : (
          <input type="range" min={0} max={100} step={1} value={displayLevel}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            onMouseUp={handleSliderRelease} onTouchEnd={handleSliderRelease}
            style={{ width: '100%' }}
            className="nodrag h-1.5 rounded-full appearance-none cursor-pointer"
          />
        ),
        toggle: (
          <button
            onClick={handleToggle}
            className="nodrag relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none"
            style={{ background: isOn ? 'var(--accent-green)' : 'var(--app-border)' }}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        ),
      }}
    />
  );

  // --- CARD: Großes Glühbirnen-Icon, Helligkeit als Opacity ---
  if (layout === 'card') {
    const opacity = 0.2 + (level / 100) * 0.8;
    return (
      <div className="flex flex-col h-full justify-between" style={{ position: 'relative' }}>
        {showTitle && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          {showIcon && <CompactIcon size={iconSize} strokeWidth={1.5}
            style={{ color: 'var(--accent-yellow)', opacity, filter: level > 0 ? `drop-shadow(0 0 ${level / 10}px var(--accent-yellow))` : 'none', transition: 'all 0.3s' }} />}
          {showValue && <span className="text-2xl font-bold" style={{ color: valueColor }}>{level}%</span>}
        </div>
        {showSlider && (barStyle
          ? <div style={{ height: 40, width: '100%' }}>{barTrack}</div>
          : slider
        )}
        {toggleBtn && <div className="flex justify-center">{toggleBtn}</div>}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- COMPACT ---
  if (layout === 'compact') {
    return (
      <div className="flex flex-col justify-center h-full gap-1.5" style={{ position: 'relative' }}>
        <div className="flex items-center gap-2">
          {showIcon && <CompactIcon size={iconSize} style={{ color: displayLevel > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <span className="flex-1 text-sm truncate min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</span>}
          {!showTitle && <span className="flex-1" />}
          {showValue && <span className="text-sm font-bold shrink-0" style={{ color: valueColor }}>{displayLevel}%</span>}
          {toggleBtn}
        </div>
        {showSlider && (barStyle
          ? <div style={{ height: 40, width: '100%' }}>{barTrack}</div>
          : <input type="range" min={0} max={100} step={1} value={displayLevel}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              onMouseUp={handleSliderRelease} onTouchEnd={handleSliderRelease}
              style={{ '--slider-thumb-color': 'var(--accent-yellow)' } as CSSProperties}
              className="nodrag ml-6 h-1.5 rounded-full appearance-none cursor-pointer" />
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
        {showSlider && (barStyle
          ? <div style={{ height: 40, width: '100%' }}>{barTrack}</div>
          : slider
        )}
        {toggleBtn}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- DEFAULT ---
  return (
    <div className="flex flex-col h-full justify-between" style={{ position: 'relative' }}>
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2">
          {showIcon && <CompactIcon size={iconSize} style={{ color: level > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)' }} />}
          {showTitle && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'], flex: '1', minWidth: 0 }}>{config.title}</p>}
        </div>
      )}
      <div className="space-y-2">
        {showValue && (
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold" style={{ color: valueColor }}>{level}%</span>
            {showToggle
              ? toggleBtn
              : <div className="w-3 h-3 rounded-full transition-all"
                  style={{ background: level > 0 ? 'var(--accent-yellow)' : 'var(--app-border)', boxShadow: level > 0 ? '0 0 6px var(--accent-yellow)' : 'none' }} />
            }
          </div>
        )}
        {!showValue && toggleBtn && <div className="flex justify-end">{toggleBtn}</div>}
        {showSlider && (barStyle
          ? <div style={{ height: 40, width: '100%' }}>{barTrack}</div>
          : slider
        )}
      </div>
      <StatusBadges config={config} />
    </div>
  );
}
