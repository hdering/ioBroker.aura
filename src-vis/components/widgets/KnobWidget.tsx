import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { formatNum } from '../../utils/formatValue';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';

export type KnobPointerStyle = 'line' | 'circle' | 'arrow';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start    = polarToCartesian(cx, cy, r, startAngle);
  const end      = polarToCartesian(cx, cy, r, endAngle);
  const sweep    = endAngle - startAngle;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  const dir      = sweep >= 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${dir} ${end.x} ${end.y}`;
}

function valueToAngle(
  value: number, min: number, max: number,
  startAngle: number, endAngle: number, wrap: boolean,
): number {
  if (max <= min) return startAngle;
  let ratio = (value - min) / (max - min);
  if (wrap) {
    ratio = ratio - Math.floor(ratio);
  } else {
    ratio = Math.max(0, Math.min(1, ratio));
  }
  return startAngle + ratio * (endAngle - startAngle);
}

function angleFromPointArc(
  px: number, py: number, cx: number, cy: number,
  startAngle: number, endAngle: number,
): number {
  const rawDeg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
  const lo = Math.min(startAngle, endAngle);
  const hi = Math.max(startAngle, endAngle);
  let deg = rawDeg;
  while (deg < lo)        deg += 360;
  while (deg >= lo + 360) deg -= 360;
  if (deg > hi) {
    const distToHi = deg - hi;
    const distToLo = (lo + 360) - deg;
    deg = distToHi <= distToLo ? hi : lo;
  }
  return deg;
}

export function KnobWidget({ config }: WidgetProps) {
  const o   = config.options ?? {};
  const { setState } = useIoBroker();
  const { defaultDecimals } = useGlobalSettingsStore();

  const min          = (o.minValue   as number)  ?? 0;
  const max          = (o.maxValue   as number)  ?? 100;
  const step         = (o.step       as number)  ?? 1;
  const decimalsOpt  = o.decimals    as number | undefined;
  const decimals     = decimalsOpt ?? defaultDecimals;
  const unit         = (o.unit       as string)  ?? '';
  const pointerStyle = (o.pointerStyle as KnobPointerStyle) || 'line';
  const showValue    = o.showValue !== false;
  const showMinMax   = !!o.showMinMax;
  const showTitle    = o.showTitle !== false;
  const showIcon     = o.showIcon !== false;
  const readOnly     = !!o.readOnly;
  const iconSize     = (o.iconSize as number) || 18;
  const WidgetIcon   = getWidgetIcon(o.icon as string | undefined, Gauge);

  // Layouts:
  //   default        → bounded arc, thin track, line/arrow pointer on body
  //   knob-scale     → bounded arc, THICK outer arc with number labels, pointer at arc tip
  //   knob-endless   → jqx 3D endless dial (full circle, relative drag)
  // Pointer form (line/circle/arrow) is orthogonal to layout.
  const isEndless  = config.layout === 'knob-endless';
  const isScale    = config.layout === 'knob-scale';
  const infinite   = isEndless;
  const showRing       = (o.showRing       as boolean | undefined) ?? true;
  const showBackground = (o.showBackground as boolean | undefined) ?? true;
  // Outer bezel + background only make sense for the bounded layouts.
  const ringActive     = showRing       && !isEndless;
  const bgActive       = showBackground && !isEndless;
  // Ring sits further out in the scale layout so it doesn't overlap the labels.
  const ringInner  = isScale ? 115 : 107;
  const ringOuter  = isScale ? 117 : 109;
  // Inner edge of the visible disc — used for background and as bezel inner radius.
  const discR      = ringActive ? ringInner - 0.5 : (isScale ? 113 : 105);
  // Pad the viewBox outwards so the bezel, the background disc, and (for the
  // endless layout) the outer number labels all fit inside the SVG.
  const outerNeeded = Math.max(
    ringActive ? ringOuter : 0,
    bgActive   ? discR     : 0,
    isEndless  ? 109       : 0, // matches labelR in renderCircleLayout
  );
  const ringPad    = outerNeeded > 100 ? Math.ceil(outerNeeded - 100 + 3) : 0;
  const viewBoxStr = `${-ringPad} ${-ringPad} ${200 + 2 * ringPad} ${200 + 2 * ringPad}`;
  // Endless anchors min at 126° (lower-left). Bounded/scale uses 135 → 405 by default.
  const startAngle = isEndless ? 126 : ((o.startAngle as number) ?? 135);
  const endAngle   = isEndless ? 486 : ((o.endAngle   as number) ?? 405);
  const color      = (o.color as string) || (isEndless ? '#4a4a4a' : '#3b82f6');

  const { value: rawVal } = useDatapoint(config.datapoint);
  const numericVal = typeof rawVal === 'number'
    ? rawVal
    : Number.isFinite(Number(rawVal)) ? Number(rawVal) : min;

  const [pending, setPending] = useState<number | null>(null);
  const displayVal = pending ?? numericVal;

  const svgRef            = useRef<SVGSVGElement | null>(null);
  const draggingRef       = useRef(false);
  const dragLastDegRef    = useRef<number | null>(null);
  const dragAccumValueRef = useRef<number>(0);

  const writeStepped = (v: number, clamp: boolean) => {
    const stepped = Math.round(v / step) * step;
    const final = clamp ? Math.max(min, Math.min(max, stepped)) : stepped;
    setState(config.datapoint, final);
  };

  // Map a screen coordinate to SVG-local coords using the current viewBox.
  const screenToSvg = (clientX: number, clientY: number): { px: number; py: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const vbSize = 200 + 2 * ringPad;
    const vbOff  = -ringPad;
    const px = ((clientX - rect.left) / rect.width)  * vbSize + vbOff;
    const py = ((clientY - rect.top)  / rect.height) * vbSize + vbOff;
    return { px, py };
  };

  const valueFromEventAbs = (clientX: number, clientY: number): number | null => {
    const pt = screenToSvg(clientX, clientY);
    if (!pt) return null;
    const ang = angleFromPointArc(pt.px, pt.py, 100, 100, startAngle, endAngle);
    const ratio = (ang - startAngle) / (endAngle - startAngle);
    return min + Math.max(0, Math.min(1, ratio)) * (max - min);
  };

  // Infinite drag: accumulate Δangle × (max−min)/360 onto the running value.
  const advanceInfiniteFromEvent = (clientX: number, clientY: number): number | null => {
    const pt = screenToSvg(clientX, clientY);
    if (!pt) return null;
    const deg = (Math.atan2(pt.py - 100, pt.px - 100) * 180) / Math.PI;
    if (dragLastDegRef.current == null) {
      dragLastDegRef.current = deg;
      return dragAccumValueRef.current;
    }
    let delta = deg - dragLastDegRef.current;
    if (delta >  180) delta -= 360;
    if (delta < -180) delta += 360;
    dragLastDegRef.current = deg;
    dragAccumValueRef.current += (delta / 360) * (max - min);
    return dragAccumValueRef.current;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    if (infinite) {
      dragAccumValueRef.current = Number.isFinite(numericVal) ? numericVal : min;
      dragLastDegRef.current = null;
      advanceInfiniteFromEvent(e.clientX, e.clientY);
      setPending(dragAccumValueRef.current);
    } else {
      const v = valueFromEventAbs(e.clientX, e.clientY);
      if (v != null) setPending(v);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || !draggingRef.current) return;
    if (infinite) {
      const v = advanceInfiniteFromEvent(e.clientX, e.clientY);
      if (v != null) setPending(v);
    } else {
      const v = valueFromEventAbs(e.clientX, e.clientY);
      if (v != null) setPending(v);
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || !draggingRef.current) return;
    draggingRef.current = false;
    dragLastDegRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (pending != null) {
      writeStepped(pending, !infinite);
      setPending(null);
    }
  };

  useEffect(() => {
    if (!draggingRef.current && pending != null) setPending(null);
  }, [numericVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const cx = 100, cy = 100;
  const currentAngle = valueToAngle(displayVal, min, max, startAngle, endAngle, infinite);
  const valueStr     = isNaN(displayVal) ? '–' : `${formatNum(displayVal, decimals)}${unit}`;

  const idSuffix    = config.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const bodyGradId  = `knob-body-${idSuffix}`;
  const innerGradId = `knob-inner-${idSuffix}`;
  const dimpleGradId = `knob-dimple-${idSuffix}`;
  const ringGradId  = `knob-ring-${idSuffix}`;

  // Light gray disc rendered behind every layout element. Independent toggle.
  const renderRingBackground = () => {
    if (!bgActive) return null;
    return <circle cx={cx} cy={cy} r={discR} fill="#ededed" />;
  };

  // ── Outer bezel ring (for bounded layouts) ─────────────────────────────────
  const renderRing = () => {
    if (!ringActive) return null;
    const ringMid   = (ringInner + ringOuter) / 2;
    const ringWidth = ringOuter - ringInner;
    return (
      <>
        <defs>
          <linearGradient id={ringGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#e4e4e4" />
            <stop offset="50%"  stopColor="#b6b6b6" />
            <stop offset="100%" stopColor="#8a8a8a" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={ringOuter} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
        <circle cx={cx} cy={cy} r={ringMid}   fill="none" stroke={`url(#${ringGradId})`} strokeWidth={ringWidth} />
        <circle cx={cx} cy={cy} r={ringInner} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={0.35} />
      </>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Circle (jqx-style endless) layout
  // ───────────────────────────────────────────────────────────────────────────
  const renderCircleLayout = () => {
    const bodyR        = 80;
    const tickOuter    = 95;
    const tickMajorIn  = 86;
    const tickMinorIn  = 90;
    const labelR       = 109;
    const pointerR     = bodyR - 13;   // dimple sits just inside body edge
    const pointerSize  = 7;

    // Number of major (labelled) ticks. Default: 10 → labels every (max−min)/10.
    const labelCount   = (o.labelCount as number) ?? 10;
    const minorPerMajor = 4;
    const labelStep    = labelCount > 0 ? (max - min) / labelCount : 0;
    const labelDecimals = labelStep > 0 && labelStep < 1
      ? Math.min(3, Math.max(0, -Math.floor(Math.log10(labelStep))))
      : 0;

    const ticks: React.ReactElement[] = [];
    for (let i = 0; i < labelCount; i++) {
      const a = startAngle + (360 * i) / labelCount;
      const inn = polarToCartesian(cx, cy, tickMajorIn, a);
      const out = polarToCartesian(cx, cy, tickOuter,   a);
      ticks.push(
        <line key={`maj-${i}`} x1={inn.x} y1={inn.y} x2={out.x} y2={out.y}
              stroke="#3a3a3a" strokeWidth={1.4} strokeLinecap="round" />,
      );
      const labelValue = min + ((max - min) * i) / labelCount;
      const lp = polarToCartesian(cx, cy, labelR, a);
      ticks.push(
        <text key={`lab-${i}`} x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10}
              fill="var(--text-primary)"
              style={{ pointerEvents: 'none' }}>
          {formatNum(labelValue, labelDecimals)}
        </text>,
      );
      for (let j = 1; j <= minorPerMajor; j++) {
        const ma = a + (360 / labelCount) * (j / (minorPerMajor + 1));
        const mi = polarToCartesian(cx, cy, tickMinorIn, ma);
        const mo = polarToCartesian(cx, cy, tickOuter,   ma);
        ticks.push(
          <line key={`min-${i}-${j}`} x1={mi.x} y1={mi.y} x2={mo.x} y2={mo.y}
                stroke="#3a3a3a" strokeWidth={0.8} opacity={0.7} strokeLinecap="round" />,
        );
      }
    }

    const renderEndlessPointer = () => {
      if (pointerStyle === 'line') {
        const innerP = polarToCartesian(cx, cy, bodyR - 22, currentAngle);
        const outerP = polarToCartesian(cx, cy, bodyR - 4,  currentAngle);
        return (
          <line x1={innerP.x} y1={innerP.y} x2={outerP.x} y2={outerP.y}
                stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" />
        );
      }
      if (pointerStyle === 'arrow') {
        const tipP  = polarToCartesian(cx, cy, bodyR - 5,  currentAngle);
        const baseC = polarToCartesian(cx, cy, bodyR - 22, currentAngle);
        const perp  = currentAngle + 90;
        const bL    = polarToCartesian(baseC.x, baseC.y, 6, perp);
        const bR    = polarToCartesian(baseC.x, baseC.y, 6, perp + 180);
        return (
          <polygon points={`${tipP.x},${tipP.y} ${bL.x},${bL.y} ${bR.x},${bR.y}`}
                   fill="#1a1a1a" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} />
        );
      }
      // 'circle' (default for endless) — recessed dimple
      const dimple = polarToCartesian(cx, cy, pointerR, currentAngle);
      return (
        <circle cx={dimple.x} cy={dimple.y} r={pointerSize}
                fill={`url(#${dimpleGradId})`}
                stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
      );
    };

    return (
      <>
        <defs>
          {/* Heavy 3D body — directional gradient: light top-left, dark bottom-right */}
          <radialGradient id={bodyGradId} cx="32%" cy="28%" r="85%">
            <stop offset="0%"   stopColor="#dadada" />
            <stop offset="55%"  stopColor="#9a9a9a" />
            <stop offset="100%" stopColor="#4a4a4a" />
          </radialGradient>
          {/* Recessed dimple — inverted highlight to look pressed-in */}
          <radialGradient id={dimpleGradId} cx="60%" cy="65%" r="70%">
            <stop offset="0%"   stopColor="#8e8e8e" />
            <stop offset="100%" stopColor="#3a3a3a" />
          </radialGradient>
        </defs>

        {ticks}

        {/* Body */}
        <circle cx={cx} cy={cy} r={80} fill={`url(#${bodyGradId})`}
                stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />

        {/* Pointer */}
        {renderEndlessPointer()}

        {showValue && (
          <text x={cx} y={cy + 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={20} fontWeight={700}
                fill="#ffffff"
                style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.6)' } as React.CSSProperties}>
            {valueStr}
          </text>
        )}
      </>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Scale layout (bounded, thick outer arc with number labels + arc-tip pointer)
  // ───────────────────────────────────────────────────────────────────────────
  const renderScaleLayout = () => {
    const arcR        = 79;
    const arcStroke   = 14;
    const bodyR       = 65;
    const tickOuter   = 95;
    const tickMajorIn = 88;
    const tickMinorIn = 92;
    const labelR      = 105;
    const labelCount  = (o.labelCount as number) ?? 11; // default 0,10,…,100 → 11 labels
    const minorPerMajor = 4;
    const arcColor    = (o.color as string) || '#1da7e0';
    const labelStep    = labelCount > 1 ? (max - min) / (labelCount - 1) : 0;
    const labelDecimals = labelStep > 0 && labelStep < 1
      ? Math.min(3, Math.max(0, -Math.floor(Math.log10(labelStep))))
      : 0;

    const ticks: React.ReactElement[] = [];
    for (let i = 0; i < labelCount; i++) {
      const ratio = i / (labelCount - 1);
      const a     = startAngle + ratio * (endAngle - startAngle);
      const inn   = polarToCartesian(cx, cy, tickMajorIn, a);
      const out   = polarToCartesian(cx, cy, tickOuter,   a);
      ticks.push(
        <line key={`maj-${i}`} x1={inn.x} y1={inn.y} x2={out.x} y2={out.y}
              stroke={arcColor} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />,
      );
      const labelValue = min + ((max - min) * i) / (labelCount - 1);
      const lp = polarToCartesian(cx, cy, labelR, a);
      ticks.push(
        <text key={`lab-${i}`} x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fontWeight={500}
              fill="var(--text-secondary)"
              style={{ pointerEvents: 'none' }}>
          {formatNum(labelValue, labelDecimals)}
        </text>,
      );
      if (i < labelCount - 1) {
        for (let j = 1; j <= minorPerMajor; j++) {
          const mr = (i + j / (minorPerMajor + 1)) / (labelCount - 1);
          const ma = startAngle + mr * (endAngle - startAngle);
          const mi = polarToCartesian(cx, cy, tickMinorIn, ma);
          const mo = polarToCartesian(cx, cy, tickOuter,   ma);
          ticks.push(
            <line key={`min-${i}-${j}`} x1={mi.x} y1={mi.y} x2={mo.x} y2={mo.y}
                  stroke={arcColor} strokeWidth={0.9} strokeLinecap="round" opacity={0.45} />,
          );
        }
      }
    }

    // Pointer at the arc tip — three variants share the same anchor point.
    const renderScalePointer = () => {
      const arcOuter = arcR + arcStroke / 2;
      const arcInner = arcR - arcStroke / 2;
      if (pointerStyle === 'line') {
        const innerP = polarToCartesian(cx, cy, arcInner - 4, currentAngle);
        const outerP = polarToCartesian(cx, cy, arcOuter + 4, currentAngle);
        return (
          <line x1={innerP.x} y1={innerP.y} x2={outerP.x} y2={outerP.y}
                stroke={arcColor} strokeWidth={3} strokeLinecap="round" />
        );
      }
      if (pointerStyle === 'circle') {
        const p = polarToCartesian(cx, cy, arcR, currentAngle);
        return <circle cx={p.x} cy={p.y} r={arcStroke / 2 + 1.5} fill={arcColor}
                       stroke="#fff" strokeWidth={1.5} />;
      }
      // 'arrow' (default for scale) — small chevron at the arc tip, pointing inward
      const back = currentAngle - 4;
      const v1   = polarToCartesian(cx, cy, arcOuter, back);
      const v2   = polarToCartesian(cx, cy, arcInner, back);
      const v3   = polarToCartesian(cx, cy, arcInner - 6, currentAngle);
      return (
        <polygon points={`${v1.x},${v1.y} ${v2.x},${v2.y} ${v3.x},${v3.y}`}
                 fill={arcColor} />
      );
    };

    return (
      <>
        <defs>
          <radialGradient id={bodyGradId} cx="50%" cy="50%" r="58%">
            <stop offset="0%"   stopColor="#ffffff" />
            <stop offset="78%"  stopColor="#f4f4f4" />
            <stop offset="100%" stopColor="#dcdcdc" />
          </radialGradient>
        </defs>

        {/* Inner light disc */}
        <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${bodyGradId})`}
                stroke="rgba(0,0,0,0.08)" strokeWidth={0.5} />

        {/* Outer track (background arc) */}
        <path d={describeArc(cx, cy, arcR, startAngle, endAngle)}
              fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={arcStroke}
              strokeLinecap="butt" />
        {/* Thick progress arc */}
        <path d={describeArc(cx, cy, arcR, startAngle, currentAngle)}
              fill="none" stroke={arcColor} strokeWidth={arcStroke}
              strokeLinecap="butt" />

        {/* Tick + label ring (drawn after arc so labels stay on top) */}
        {ticks}

        {/* Pointer at arc tip */}
        {renderScalePointer()}

        {/* Center value (positioned lower-center, like jqxKnob scale demo) */}
        {showValue && (
          <text x={cx} y={cy + bodyR * 0.55}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={15} fontWeight={500}
                fill="var(--text-secondary)"
                style={{ pointerEvents: 'none' }}>
            {valueStr}
          </text>
        )}
      </>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Bounded layout (line / arrow pointer)
  // ───────────────────────────────────────────────────────────────────────────
  const renderBoundedLayout = () => {
    const trackR        = 80;
    const trackStroke   = 5;
    const bodyR         = 64;
    const tickOuter     = 96;
    const tickMajorIn   = 84;
    const tickMinorIn   = 89;
    const majorTickCount = 11;
    const minorPerMajor  = 4;

    const ticks: React.ReactElement[] = [];
    for (let i = 0; i < majorTickCount; i++) {
      const ratio = i / (majorTickCount - 1);
      const a     = startAngle + ratio * (endAngle - startAngle);
      const inn   = polarToCartesian(cx, cy, tickMajorIn, a);
      const out   = polarToCartesian(cx, cy, tickOuter,   a);
      ticks.push(
        <line key={`maj-${i}`} x1={inn.x} y1={inn.y} x2={out.x} y2={out.y}
              stroke="var(--text-secondary)" strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />,
      );
      if (i < majorTickCount - 1) {
        for (let j = 1; j <= minorPerMajor; j++) {
          const mr = (i + j / (minorPerMajor + 1)) / (majorTickCount - 1);
          const ma = startAngle + mr * (endAngle - startAngle);
          const mi = polarToCartesian(cx, cy, tickMinorIn, ma);
          const mo = polarToCartesian(cx, cy, tickOuter,   ma);
          ticks.push(
            <line key={`min-${i}-${j}`} x1={mi.x} y1={mi.y} x2={mo.x} y2={mo.y}
                  stroke="var(--text-secondary)" strokeWidth={0.7} opacity={0.35} strokeLinecap="round" />,
          );
        }
      }
    }

    const renderPointer = () => {
      if (pointerStyle === 'arrow') {
        const tipP  = polarToCartesian(cx, cy, bodyR - 3,  currentAngle);
        const baseC = polarToCartesian(cx, cy, bodyR - 16, currentAngle);
        const perp  = currentAngle + 90;
        const bL    = polarToCartesian(baseC.x, baseC.y, 5, perp);
        const bR    = polarToCartesian(baseC.x, baseC.y, 5, perp + 180);
        return (
          <polygon points={`${tipP.x},${tipP.y} ${bL.x},${bL.y} ${bR.x},${bR.y}`}
                   fill={color} stroke="#fff" strokeWidth={0.8} />
        );
      }
      // 'line'
      const innerP = polarToCartesian(cx, cy, bodyR - 14, currentAngle);
      const outerP = polarToCartesian(cx, cy, bodyR - 2,  currentAngle);
      return (
        <line x1={innerP.x} y1={innerP.y} x2={outerP.x} y2={outerP.y}
              stroke={color} strokeWidth={3} strokeLinecap="round" />
      );
    };

    return (
      <>
        <defs>
          <radialGradient id={bodyGradId} cx="50%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="var(--app-surface)" />
            <stop offset="55%"  stopColor="var(--app-surface)" />
            <stop offset="100%" stopColor="var(--app-bg)" />
          </radialGradient>
          <radialGradient id={innerGradId} cx="50%" cy="50%" r="50%">
            <stop offset="85%"  stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </radialGradient>
        </defs>

        {ticks}

        <path d={describeArc(cx, cy, trackR, startAngle, endAngle)}
              fill="none" stroke="var(--app-border)" strokeWidth={trackStroke}
              strokeLinecap="round" opacity={0.5} />
        <path d={describeArc(cx, cy, trackR, startAngle, currentAngle)}
              fill="none" stroke={color} strokeWidth={trackStroke}
              strokeLinecap="round" />

        <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${bodyGradId})`}
                stroke="var(--app-border)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${innerGradId})`}
                style={{ pointerEvents: 'none' }} />

        {showValue && (
          <text x={cx} y={cy + 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={22} fontWeight={700}
                fill="var(--text-primary)"
                style={{ pointerEvents: 'none' }}>
            {valueStr}
          </text>
        )}

        {renderPointer()}

        {showMinMax && (() => {
          const minP = polarToCartesian(cx, cy, tickOuter + 7, startAngle);
          const maxP = polarToCartesian(cx, cy, tickOuter + 7, endAngle);
          return (
            <>
              <text x={minP.x} y={minP.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fill="var(--text-secondary)" style={{ pointerEvents: 'none' }}>
                {formatNum(min, decimals)}
              </text>
              <text x={maxP.x} y={maxP.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fill="var(--text-secondary)" style={{ pointerEvents: 'none' }}>
                {formatNum(max, decimals)}
              </text>
            </>
          );
        })()}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full gap-1" style={{ position: 'relative' }}>
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2 min-w-0">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && (
            <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
              {config.title}
            </p>
          )}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center min-h-0" style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={viewBoxStr}
          preserveAspectRatio="xMidYMid meet"
          className={readOnly ? '' : 'nodrag'}
          style={{ width: '100%', height: '100%', maxHeight: '100%', touchAction: 'none', cursor: readOnly ? 'default' : 'pointer' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {renderRingBackground()}
          {isEndless ? renderCircleLayout() : isScale ? renderScaleLayout() : renderBoundedLayout()}
          {renderRing()}
        </svg>
      </div>
    </div>
  );
}
