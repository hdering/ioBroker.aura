import React from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useRef, useMemo } from 'react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';

// Shutter visual: horizontal slat lines filling from top = how much is closed
function ShutterViz({
  closedFrac, accentColor, isMoving, className, style,
}: {
  closedFrac: number;
  accentColor: string;
  isMoving: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{
      background: 'var(--app-bg)',
      border: '1px solid var(--app-border)',
      borderRadius: '6px',
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}>
      {/* Slat area fills from top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: `${closedFrac * 100}%`,
        transition: 'height 0.4s ease',
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 6px, color-mix(in srgb, var(--text-secondary) 35%, transparent) 6px, color-mix(in srgb, var(--text-secondary) 35%, transparent) 8px)',
      }} />
      {/* Edge indicator at the bottom of the blind */}
      {closedFrac > 0.01 && closedFrac < 0.99 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: `${closedFrac * 100}%`,
          height: '2px',
          background: accentColor,
          transition: 'top 0.4s ease, background 0.3s',
          boxShadow: `0 0 4px ${accentColor}66`,
        }} />
      )}
      {/* Pulsing dot when moving */}
      {isMoving && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: accentColor }} />
        </div>
      )}
    </div>
  );
}

function BtnRow({ onUp, onStop, onDown, size = 'md', vertical = false }: {
  onUp: () => void; onStop: () => void; onDown: () => void;
  size?: 'sm' | 'md' | 'lg'; vertical?: boolean;
}) {
  const iconSz = size === 'sm' ? 13 : size === 'lg' ? 20 : 16;
  const padCls = size === 'sm' ? 'p-1 rounded' : size === 'lg' ? 'p-3 rounded-xl' : 'p-2 rounded-lg';
  const btnStyle = { background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' };
  return (
    <div className={`flex ${vertical ? 'flex-col' : ''} gap-1`}>
      <button onClick={onUp}   className={`${padCls} hover:opacity-80 transition-opacity`} style={btnStyle}><ChevronUp   size={iconSz} /></button>
      <button onClick={onStop} className={`${padCls} hover:opacity-80 transition-opacity`} style={btnStyle}><Square      size={iconSz} /></button>
      <button onClick={onDown} className={`${padCls} hover:opacity-80 transition-opacity`} style={btnStyle}><ChevronDown size={iconSz} /></button>
    </div>
  );
}

export function ShutterWidget({ config }: WidgetProps) {
  const opts = config.options ?? {};
  const { value, setValue } = useDatapoint(config.datapoint);
  const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
  const { value: directionVal } = useDatapoint((opts.directionDp as string) ?? '');
  const { setState } = useIoBroker();
  const layout = config.layout ?? 'default';

  // Normalize position: 0 = closed, 100 = open
  const rawPos = typeof value === 'number' ? Math.round(value) : 0;
  const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
  const closedFrac = Math.max(0, Math.min(1, (100 - pos) / 100));

  const isMoving = activityVal === true || activityVal === 1 || activityVal === '1' || activityVal === 'true';
  const movingDir: 'up' | 'down' | null =
    directionVal === 1 || directionVal === '1' ? 'up' :
    directionVal === 2 || directionVal === '2' ? 'down' : null;

  // Save the raw position just before a move command so stop can reference it.
  // This avoids the race where rawPos has already changed to the new target (e.g. 0)
  // by the time the user clicks stop, which would send 0 again (no-op) or the old
  // position back (causing the blind to reverse).
  const preMoveRawRef = useRef(rawPos);

  const writePos = (p: number) => {
    preMoveRawRef.current = rawPos;   // snapshot before command
    const raw = (opts.invertPosition as boolean) ? 100 - p : p;
    setValue(raw);
  };
  const openFully  = () => writePos(100);
  const closeFully = () => writePos(0);
  const stop = () => {
    const stopDp = opts.stopDp as string | undefined;
    if (stopDp) {
      // Dedicated stop datapoint (e.g. HomeMatic STOP channel)
      setState(stopDp, true);
    } else {
      // Fallback: write the pre-move position so the actuator targets where the
      // blind was before the command, effectively cancelling the movement.
      // If rawPos has already been updated to the actual live position mid-move
      // (some adapters do this), using rawPos would be more accurate – but
      // preMoveRawRef is safer against the race condition.
      const stopTarget = isMoving && rawPos !== preMoveRawRef.current ? rawPos : preMoveRawRef.current;
      setState(config.datapoint, stopTarget);
    }
  };

  const accentColor = isMoving ? 'var(--accent-yellow)' : pos > 0 ? 'var(--accent)' : 'var(--text-secondary)';

  const thresholds = opts.colorThresholds as Array<[number, string]> | undefined;
  const thresholdColor = useMemo(() => {
    if (!thresholds?.length) return undefined;
    for (const [thresh, color] of thresholds) {
      if (pos < thresh) return color;
    }
    return thresholds[thresholds.length - 1][1];
  }, [thresholds, pos]);
  const valueColor = thresholdColor ?? 'var(--text-primary)';

  const showTitle    = opts.showTitle    !== false;
  const showValue    = opts.showValue    !== false;
  const showControls = opts.showControls !== false;
  const showSlider   = opts.showSlider   !== false;
  const customIconName = opts.icon as string | undefined;
  const CustomIcon = customIconName ? getWidgetIcon(customIconName, Square) : null;

  const statusText = isMoving
    ? (movingDir === 'up' ? '▲ Fährt auf' : movingDir === 'down' ? '▼ Fährt zu' : '↕ Fährt...')
    : pos === 100 ? 'Geöffnet' : pos === 0 ? 'Geschlossen' : `${pos}% geöffnet`;

  const slider = (
    <input type="range" min={0} max={100} step={1} value={pos}
      onChange={(e) => writePos(Number(e.target.value))}
      style={{ accentColor: 'var(--accent)' }}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer" />
  );

  if (layout === 'custom') {
    const btnStyle: React.CSSProperties = { background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer' };
    return (
      <CustomGridView
        config={config}
        value={`${pos}`}
        extraFields={{
          position:  `${pos}%`,
          status:    statusText,
          moving:    isMoving ? 'Ja' : 'Nein',
        }}
        extraComponents={{
          'btn-up':   <button className="nodrag" style={btnStyle} onClick={openFully}><ChevronUp   size={14} /></button>,
          'btn-stop': <button className="nodrag" style={btnStyle} onClick={stop}><Square      size={14} /></button>,
          'btn-down': <button className="nodrag" style={btnStyle} onClick={closeFully}><ChevronDown size={14} /></button>,
        }}
      />
    );
  }

  // ── CARD ──────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="flex flex-col h-full gap-2" style={{ position: 'relative' }}>
        {showTitle && (
          <div className="flex items-center justify-between">
            <p className="text-xs truncate font-medium" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
            {isMoving && <span className="text-[10px] animate-pulse" style={{ color: 'var(--accent-yellow)' }}>
              {movingDir === 'up' ? '▲' : movingDir === 'down' ? '▼' : '↕'}
            </span>}
          </div>
        )}
        <ShutterViz closedFrac={closedFrac} accentColor={accentColor} isMoving={isMoving} className="flex-1" />
        <div className="flex items-center justify-between">
          {showValue && <span className="text-xl font-black" style={{ color: valueColor }}>{pos}%</span>}
          {showControls && <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} size="md" />}
        </div>
        {showSlider && slider}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2 h-full" style={{ position: 'relative' }}>
        {CustomIcon
          ? <CustomIcon size={16} style={{ color: accentColor, flexShrink: 0 }} />
          : <ShutterViz closedFrac={closedFrac} accentColor={accentColor} isMoving={isMoving}
              style={{ width: 22, height: 22, flexShrink: 0 }} />
        }
        {showTitle && <span className="flex-1 text-sm truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
        {!showTitle && <span className="flex-1" />}
        {showValue && <span className="text-sm font-bold shrink-0" style={{ color: thresholdColor ?? (isMoving ? 'var(--accent-yellow)' : 'var(--text-primary)') }}>{pos}%</span>}
        {showControls && <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} size="sm" />}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5" style={{ position: 'relative' }}>
        {showControls && (
          <button onClick={openFully} className="p-2 rounded-xl hover:opacity-80 transition-opacity"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            <ChevronUp size={18} />
          </button>
        )}
        {showValue && (
          <div className="text-center">
            <p className="text-2xl font-black leading-none" style={{ color: valueColor }}>{pos}%</p>
            {isMoving && <p className="text-[10px] animate-pulse mt-0.5" style={{ color: 'var(--accent-yellow)' }}>
              {movingDir === 'up' ? '▲' : '▼'}
            </p>}
          </div>
        )}
        {showControls && (
          <>
            <button onClick={stop} className="px-3 py-1 rounded-lg hover:opacity-80 transition-opacity"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              <Square size={12} />
            </button>
            <button onClick={closeFully} className="p-2 rounded-xl hover:opacity-80 transition-opacity"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              <ChevronDown size={18} />
            </button>
          </>
        )}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-2" style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            {CustomIcon && <CustomIcon size={13} style={{ color: accentColor, flexShrink: 0 }} />}
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
          </div>
          {isMoving && <span className="text-[10px] animate-pulse shrink-0" style={{ color: 'var(--accent-yellow)' }}>
            {movingDir === 'up' ? '▲' : movingDir === 'down' ? '▼' : '↕'}
          </span>}
        </div>
      )}
      <div className="flex gap-2 flex-1 min-h-0">
        <ShutterViz closedFrac={closedFrac} accentColor={accentColor} isMoving={isMoving} className="flex-1" />
        {showControls && <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} size="sm" vertical />}
      </div>
      {(showValue || showSlider) && (
        <div>
          {showValue && (
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[11px]" style={{ color: isMoving ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>{statusText}</span>
              <span className="text-sm font-bold" style={{ color: valueColor }}>{pos}%</span>
            </div>
          )}
          {showSlider && slider}
        </div>
      )}
      <StatusBadges config={config} />
    </div>
  );
}
