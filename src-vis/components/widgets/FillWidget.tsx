import { useId } from 'react';
import { Droplets } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';

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

  const tankProps: TankProps = {
    pct, value: safeVal, min, max, unit, decimals,
    fillColor, zones, colorZones, showTicks, showValue, uid,
  };

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
      {config.title && !config.options?.hideTitle && (
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
