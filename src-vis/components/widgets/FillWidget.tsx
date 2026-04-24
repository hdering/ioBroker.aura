import { useId } from 'react';
import { Droplets } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';

export interface ColorZone { max: number; color: string; }

type Orientation = 'vertical' | 'horizontal';

interface TankProps {
  pct:        number;
  value:      number;
  min:        number;
  max:        number;
  unit:       string;
  decimals:   number;
  fillColor:  string;
  zones:      ColorZone[];
  colorZones: boolean;
  showTicks:  boolean;
  showValue:  boolean;
  uid:        string;
}

// ── Vertical tank ──────────────────────────────────────────────────────────
function TankVertical({
  pct, value, min, max, unit, decimals,
  fillColor, zones, colorZones, showTicks, showValue, uid,
}: TankProps) {
  // Layout constants (viewBox 0 0 100 220)
  const bx = 32, by = 10, bw = 42, bh = 185, br = 13;
  const fillH   = Math.max(0, (pct / 100) * bh);
  const fillY   = by + bh - fillH;
  const clipId  = `fv-${uid}`;
  const labelY  = Math.max(fillY + 4, by + 12); // clamp so label stays inside viewBox

  const displayVal = isNaN(value) ? '–'
    : decimals === 0 ? String(Math.round(value))
    : value.toFixed(decimals);

  const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox="0 0 100 220" style={{ width: '100%', height: '100%' }} overflow="visible">
      <defs>
        <clipPath id={clipId}>
          <rect x={bx} y={by} width={bw} height={bh} rx={br} />
        </clipPath>
      </defs>

      {/* Tank background */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="var(--widget-bg)" stroke="var(--app-border)" strokeWidth={1.5} />

      {/* Zone bands – entire tank at 45% (vivid context) */}
      {colorZones && zones.map((zone, i) => {
        const prev = i === 0 ? min : zones[i - 1].max;
        const s = max > min ? Math.max(0, Math.min(1, (prev     - min) / (max - min))) : 0;
        const e = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
        const zH = (e - s) * bh;
        const zY = by + bh - e * bh;
        return zH > 0 ? (
          <rect key={`bg-${i}`} x={bx} y={zY} width={bw} height={zH}
            fill={zone.color} clipPath={`url(#${clipId})`} />
        ) : null;
      })}

      {/* Fill – zone-colored segments at 100% up to fill level */}
      {colorZones && fillH > 0 && zones.map((zone, i) => {
        const prev = i === 0 ? min : zones[i - 1].max;
        const sRaw = max > min ? Math.max(0, Math.min(1, (prev     - min) / (max - min))) : 0;
        const eRaw = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
        const fp = pct / 100;
        const s = Math.min(sRaw, fp);
        const e = Math.min(eRaw, fp);
        if (e <= s) return null;
        const segH = (e - s) * bh;
        const segY = by + bh - e * bh;
        return (
          <rect key={`fill-${i}`} x={bx} y={segY} width={bw} height={segH}
            fill={zone.color} clipPath={`url(#${clipId})`} />
        );
      })}

      {/* Fill – single color (no zones) */}
      {!colorZones && fillH > 0 && (
        <rect x={bx} y={fillY} width={bw} height={fillH}
          fill={fillColor} clipPath={`url(#${clipId})`} />
      )}

      {/* Tank border on top */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="none" stroke="var(--app-border)" strokeWidth={1.5} />

      {/* Tick marks + labels (left side) */}
      {showTicks && TICKS.map((t, i) => {
        const y = by + bh * (1 - t);
        const v = min + t * (max - min);
        return (
          <g key={i}>
            <line x1={bx - 1} y1={y} x2={bx + 9} y2={y}
              stroke="var(--app-border)" strokeWidth={1.5} />
            <text x={bx - 4} y={y + 3.5} fontSize={8} textAnchor="end"
              fill="var(--text-secondary)" opacity={0.75}>
              {decimals === 0 ? Math.round(v) : v.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Value label – right side, at fill level */}
      {showValue && (
        <text x={bx + bw + 5} y={labelY} fontSize={11} fontWeight="bold"
          fill={fillColor} textAnchor="start">
          {displayVal}
          {unit && <tspan fontSize={9} fill="var(--text-secondary)" dx={1}>{unit}</tspan>}
        </text>
      )}

      {/* Fill-level indicator line */}
      {showValue && fillH > 0 && (
        <line x1={bx + bw} y1={fillY} x2={bx + bw + 4} y2={fillY}
          stroke={fillColor} strokeWidth={1} opacity={0.6} />
      )}
    </svg>
  );
}

// ── Horizontal tank ────────────────────────────────────────────────────────
function TankHorizontal({
  pct, value, min, max, unit, decimals,
  fillColor, zones, colorZones, showTicks, showValue, uid,
}: TankProps) {
  // Layout constants (viewBox 0 0 220 80)
  const bx = 10, by = 24, bw = 185, bh = 42, br = 13;
  const fillW  = Math.max(0, (pct / 100) * bw);
  const clipId = `fh-${uid}`;

  const displayVal = isNaN(value) ? '–'
    : decimals === 0 ? String(Math.round(value))
    : value.toFixed(decimals);

  const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox="0 0 220 80" style={{ width: '100%', height: '100%' }} overflow="visible">
      <defs>
        <clipPath id={clipId}>
          <rect x={bx} y={by} width={bw} height={bh} rx={br} />
        </clipPath>
      </defs>

      {/* Tank background */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="var(--widget-bg)" stroke="var(--app-border)" strokeWidth={1.5} />

      {/* Zone bands – entire tank at 45% */}
      {colorZones && zones.map((zone, i) => {
        const prev = i === 0 ? min : zones[i - 1].max;
        const s = max > min ? Math.max(0, Math.min(1, (prev     - min) / (max - min))) : 0;
        const e = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
        const zW = (e - s) * bw;
        const zX = bx + s * bw;
        return zW > 0 ? (
          <rect key={`bg-${i}`} x={zX} y={by} width={zW} height={bh}
            fill={zone.color} clipPath={`url(#${clipId})`} />
        ) : null;
      })}

      {/* Fill – zone-colored segments at 100% up to fill level */}
      {colorZones && fillW > 0 && zones.map((zone, i) => {
        const prev = i === 0 ? min : zones[i - 1].max;
        const sRaw = max > min ? Math.max(0, Math.min(1, (prev     - min) / (max - min))) : 0;
        const eRaw = max > min ? Math.max(0, Math.min(1, (zone.max - min) / (max - min))) : 0;
        const fp = pct / 100;
        const s = Math.min(sRaw, fp);
        const e = Math.min(eRaw, fp);
        if (e <= s) return null;
        const segW = (e - s) * bw;
        const segX = bx + s * bw;
        return (
          <rect key={`fill-${i}`} x={segX} y={by} width={segW} height={bh}
            fill={zone.color} clipPath={`url(#${clipId})`} />
        );
      })}

      {/* Fill – single color (no zones) */}
      {!colorZones && fillW > 0 && (
        <rect x={bx} y={by} width={fillW} height={bh}
          fill={fillColor} clipPath={`url(#${clipId})`} />
      )}

      {/* Tank border on top */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="none" stroke="var(--app-border)" strokeWidth={1.5} />

      {/* Tick marks + labels (top side) */}
      {showTicks && TICKS.map((t, i) => {
        const x = bx + t * bw;
        const v = min + t * (max - min);
        return (
          <g key={i}>
            <line x1={x} y1={by - 1} x2={x} y2={by + 10}
              stroke="var(--app-border)" strokeWidth={1.5} />
            <text x={x} y={by - 4} fontSize={8} textAnchor="middle"
              fill="var(--text-secondary)" opacity={0.75}>
              {decimals === 0 ? Math.round(v) : v.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Fill-level indicator line – white halo + colored line for contrast on any zone color */}
      {showValue && fillW > 0 && (
        <g>
          <line x1={bx + fillW} y1={by - 4} x2={bx + fillW} y2={by + bh + 4}
            stroke="white" strokeWidth={3} opacity={0.5} />
          <line x1={bx + fillW} y1={by - 4} x2={bx + fillW} y2={by + bh + 4}
            stroke={fillColor} strokeWidth={1.5} />
        </g>
      )}

      {/* Value label – right of tank */}
      {showValue && (
        <text x={bx + bw + 7} y={by + bh / 2 + 4} fontSize={12} fontWeight="bold"
          fill={fillColor} textAnchor="start">
          {displayVal}
          {unit && <tspan fontSize={9} fill="var(--text-secondary)" dx={1}>{unit}</tspan>}
        </text>
      )}
    </svg>
  );
}

// ── Battery layout ─────────────────────────────────────────────────────────
function BatteryViz({
  pct, value, unit, decimals, fillColor, showValue, uid,
}: Pick<TankProps, 'pct' | 'value' | 'unit' | 'decimals' | 'fillColor' | 'showValue' | 'uid'>) {
  const bx = 5, by = 12, bw = 218, bh = 66, br = 9;
  const nubW = 12, nubH = 30;
  const fillW  = Math.max(0, (pct / 100) * bw);
  const clipId = `bat-${uid}`;

  const displayVal = isNaN(value) ? '–'
    : decimals === 0 ? String(Math.round(value))
    : value.toFixed(decimals);

  // When fill covers more than 40% of the body the text sits on the fill – use white
  const textOnFill = fillW > bw * 0.4;

  return (
    <svg viewBox="0 0 260 90" style={{ width: '100%', height: '100%' }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={bx} y={by} width={bw} height={bh} rx={br} />
        </clipPath>
      </defs>

      {/* Body background */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="var(--widget-bg)" stroke="var(--app-border)" strokeWidth={2} />

      {/* Positive terminal nub */}
      <rect x={bx + bw + 3} y={by + (bh - nubH) / 2} width={nubW} height={nubH} rx={5}
        fill="var(--app-border)" />

      {/* Fill */}
      {fillW > 0 && (
        <rect x={bx} y={by} width={fillW} height={bh}
          fill={fillColor} clipPath={`url(#${clipId})`} />
      )}

      {/* Segment dividers at 25 / 50 / 75 % */}
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i}
          x1={bx + t * bw} y1={by} x2={bx + t * bw} y2={by + bh}
          stroke="var(--app-bg)" strokeWidth={2.5} clipPath={`url(#${clipId})`} />
      ))}

      {/* Border on top of fill */}
      <rect x={bx} y={by} width={bw} height={bh} rx={br}
        fill="none" stroke="var(--app-border)" strokeWidth={2} />

      {/* Value label centered in body */}
      {showValue && (
        <text x={bx + bw / 2} y={by + bh / 2 + 6}
          fontSize={20} fontWeight="bold" textAnchor="middle"
          fill={textOnFill ? '#fff' : fillColor}>
          {displayVal}
          {unit && <tspan fontSize={12} dx={2} fill={textOnFill ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'}>{unit}</tspan>}
        </text>
      )}
    </svg>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────
export function FillWidget({ config }: WidgetProps) {
  const opts = config.options ?? {};
  const uid  = useId().replace(/[^a-zA-Z0-9]/g, '');

  const { value } = useDatapoint(config.datapoint);

  const orientation = (opts.orientation as Orientation) ?? 'vertical';
  const min         = (opts.minValue   as number)      ?? 0;
  const max         = (opts.maxValue   as number)      ?? 100;
  const unit        = (opts.unit       as string)      ?? '%';
  const decimals    = (opts.decimals   as number)      ?? 0;
  const colorZones  = (opts.colorZones as boolean)     ?? false;
  const showTicks   = (opts.showTicks  as boolean)     ?? true;
  const showValue   = (opts.showValue  as boolean)     ?? true;
  // barSize: % of widget width (vertical) or height (horizontal), 10-100
  const barSize     = (opts.barSize    as number)      ?? 80;

  // Zone array – new format first, fall back to 3 default zones
  const zones: ColorZone[] = (() => {
    const raw = opts.zones as ColorZone[] | undefined;
    if (raw && raw.length > 0) return raw;
    const range = max - min;
    return [
      { max: min + range * 0.33, color: '#ef4444' },
      { max: min + range * 0.66, color: '#f59e0b' },
      { max: max,                color: '#22c55e' },
    ];
  })();

  const numVal  = typeof value === 'number' ? value : parseFloat(String(value ?? min));
  const safeVal = isNaN(numVal) ? min : Math.max(min, Math.min(max, numVal));
  const pct     = max > min ? ((safeVal - min) / (max - min)) * 100 : 0;

  // Determine fill color
  let fillColor = 'var(--accent)';
  if (colorZones && zones.length > 0) {
    const match = zones.find(z => safeVal <= z.max);
    fillColor   = match ? match.color : zones[zones.length - 1].color;
  }

  const layout = (config.layout ?? 'default') as string;

  // Battery layout uses automatic traffic-light color unless colorZones is on
  const batteryFillColor = colorZones ? fillColor
    : pct <= 20 ? '#ef4444'
    : pct <= 50 ? '#f59e0b'
    : '#22c55e';

  const tankProps: TankProps = {
    pct, value: safeVal, min, max, unit, decimals,
    fillColor, zones, colorZones, showTicks, showValue, uid,
  };

  const showTitle = opts.showTitle !== false;

  if (layout === 'custom') return <CustomGridView config={config} value={value !== null ? (decimals === 0 ? String(Math.round(safeVal)) : safeVal.toFixed(decimals)) : '–'} unit={unit} />;

  if (layout === 'battery') {
    return (
      <div className="flex flex-col h-full">
        {showTitle && config.title && (
          <p className="text-xs mb-1 truncate shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {config.title}
          </p>
        )}
        <div className="flex-1 flex items-center justify-center min-h-0 min-w-0" style={{ padding: '4px 0' }}>
          <BatteryViz
            pct={pct} value={safeVal} unit={unit} decimals={decimals}
            fillColor={batteryFillColor} showValue={showValue} uid={uid}
          />
        </div>
      </div>
    );
  }

  if (layout === 'compact') {
    const displayVal = decimals === 0 ? String(Math.round(safeVal)) : safeVal.toFixed(decimals);
    return (
      <div className="flex items-center justify-between h-full gap-2">
        {showTitle && (
          <div className="flex items-center gap-2 min-w-0">
            <Droplets size={14} style={{ color: fillColor, flexShrink: 0 }} />
            <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
          </div>
        )}
        <span className="text-xl font-bold shrink-0 tabular-nums" style={{ color: fillColor }}>
          {displayVal}
          <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>{unit}</span>
        </span>
      </div>
    );
  }

  if (!config.datapoint) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <Droplets size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          {config.title || 'Füllstand'}
          <br />
          <span className="text-[10px] opacity-60">Kein Datenpunkt konfiguriert</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showTitle && config.title && (
        <p className="text-xs mb-1 truncate shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {config.title}
        </p>
      )}
      <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
        {orientation === 'vertical' ? (
          <div style={{ width: `${barSize}%`, height: '100%' }}>
            <TankVertical {...tankProps} />
          </div>
        ) : (
          <div style={{ width: '100%', height: `${barSize}%` }}>
            <TankHorizontal {...tankProps} />
          </div>
        )}
      </div>
    </div>
  );
}
