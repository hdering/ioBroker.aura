import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start    = polarToCartesian(cx, cy, r, startAngle);
  const end      = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return -180 + ((clamped - min) / (max - min)) * 180;
}

interface GaugeSVGProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  decimals: number;
  colorZones: boolean;
  greenMax: number;
  yellowMax: number;
  showMinMax: boolean;
  scale?: number;
}

function GaugeSVG({
  value, min, max, unit, decimals, colorZones, greenMax, yellowMax, showMinMax, scale = 1,
}: GaugeSVGProps) {
  const cx = 100, cy = 100, r = 80;
  const strokeW = 12;

  const greenAngle  = valueToAngle(greenMax,  min, max);
  const yellowAngle = valueToAngle(yellowMax, min, max);
  const valAngle    = valueToAngle(value,     min, max);

  // Determine needle/value color
  let valueColor = 'var(--accent)';
  if (colorZones) {
    if (value <= greenMax)  valueColor = '#10b981';
    else if (value <= yellowMax) valueColor = '#f59e0b';
    else valueColor = '#ef4444';
  }

  // Needle endpoint
  const needleLen = r - 8;
  const needle    = polarToCartesian(cx, cy, needleLen, valAngle);

  const displayVal = isNaN(value)
    ? '–'
    : decimals === 0
      ? String(Math.round(value))
      : value.toFixed(decimals);

  return (
    <svg
      viewBox="0 0 200 120"
      style={{ width: 200 * scale, height: 120 * scale, display: 'block' }}
    >
      {/* Background track */}
      <path
        d={describeArc(cx, cy, r, -180, 0)}
        fill="none"
        stroke="var(--app-border)"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {/* Color zone arcs */}
      {colorZones ? (
        <>
          <path d={describeArc(cx, cy, r, -180, greenAngle)}  fill="none" stroke="#10b981" strokeWidth={strokeW} strokeLinecap="round" />
          <path d={describeArc(cx, cy, r, greenAngle, yellowAngle)} fill="none" stroke="#f59e0b" strokeWidth={strokeW} strokeLinecap="round" />
          <path d={describeArc(cx, cy, r, yellowAngle, 0)}    fill="none" stroke="#ef4444" strokeWidth={strokeW} strokeLinecap="round" />
          {/* Value overlay */}
          <path d={describeArc(cx, cy, r, -180, valAngle)} fill="none" stroke={valueColor} strokeWidth={strokeW + 2} strokeLinecap="round" opacity="0.4" />
        </>
      ) : (
        /* Single value arc */
        <path
          d={describeArc(cx, cy, r, -180, valAngle)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
      )}

      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={needle.x}
        y2={needle.y}
        stroke={valueColor}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Center circle */}
      <circle cx={cx} cy={cy} r={5} fill={valueColor} />

      {/* Value text */}
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        fontSize={22}
        fontWeight="bold"
        fill="var(--text-primary)"
      >
        {displayVal}{unit && <tspan fontSize={13} fill="var(--text-secondary)" dx={2}>{unit}</tspan>}
      </text>

      {/* Min/Max labels */}
      {showMinMax && (() => {
        const minPt = polarToCartesian(cx, cy, r + 14, -180);
        const maxPt = polarToCartesian(cx, cy, r + 14,    0);
        return (
          <>
            <text x={minPt.x + 2} y={minPt.y + 4} fontSize={9} fill="var(--text-secondary)" textAnchor="start">{min}</text>
            <text x={maxPt.x - 2} y={maxPt.y + 4} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{max}</text>
          </>
        );
      })()}
    </svg>
  );
}

export function GaugeWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const opts      = config.options ?? {};
  const layout    = config.layout ?? 'default';

  const min        = (opts.minValue    as number)  ?? 0;
  const max        = (opts.maxValue    as number)  ?? 100;
  const unit       = (opts.unit        as string)  ?? '';
  const decimals   = (opts.decimals    as number)  ?? 1;
  const colorZones = (opts.colorZones  as boolean) ?? false;
  const range      = max - min;
  const greenMax   = (opts.greenMax    as number)  ?? min + range * 0.33;
  const yellowMax  = (opts.yellowMax   as number)  ?? min + range * 0.66;
  const showMinMax = (opts.showMinMax  as boolean) ?? true;

  const numVal = typeof value === 'number' ? value : parseFloat(String(value ?? 0));

  const gaugeProps: GaugeSVGProps = {
    value: isNaN(numVal) ? min : numVal,
    min, max, unit, decimals, colorZones, greenMax, yellowMax, showMinMax,
  };

  // ---------- MINIMAL ----------
  if (layout === 'minimal') {
    return (
      <div className="flex items-center justify-center h-full">
        <GaugeSVG {...gaugeProps} scale={0.85} />
      </div>
    );
  }

  // ---------- COMPACT ----------
  if (layout === 'compact') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <GaugeSVG {...gaugeProps} scale={0.7} />
        {config.title && (
          <p className="text-[11px] truncate text-center" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        )}
      </div>
    );
  }

  // ---------- DEFAULT / CARD ----------
  return (
    <div className="flex flex-col h-full">
      {config.title && (
        <p className="text-xs mb-1 truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      )}
      <div className="flex-1 flex items-center justify-center">
        <GaugeSVG {...gaugeProps} scale={layout === 'card' ? 1 : 0.95} />
      </div>
    </div>
  );
}
