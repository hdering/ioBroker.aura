import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Power, SunMedium, Palette, Thermometer, Sparkles, Pipette, type LucideIcon } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { LightColorMode, LightEffect, LightTab, WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';

// ── Color math helpers ────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else             [r, g, b] = [c, 0, x];
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r = clamp(r, 0, 255) / 255; g = clamp(g, 0, 255) / 255; b = clamp(b, 0, 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToHsv(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb[0], rgb[1], rgb[2]) : null;
}

/** Approximate CIE D-illuminant temperature to sRGB. Returns "#rrggbb". */
function kelvinToHex(k: number): string {
  const t = clamp(k, 1000, 40000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255);
    b = t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255);
  } else {
    r = clamp(329.698727446 * Math.pow(t - 60, -0.1332047592), 0, 255);
    g = clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492), 0, 255);
    b = 255;
  }
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}

// ── Hooks for typed datapoints ─────────────────────────────────────────────────

const useNum = (dp?: string): number | null => {
  const { value } = useDatapoint(dp || '');
  if (!dp) return null;
  return typeof value === 'number' ? value : (typeof value === 'string' ? Number(value) : null);
};
const useBool = (dp?: string): boolean | null => {
  const { value } = useDatapoint(dp || '');
  if (!dp) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number')  return value !== 0;
  if (typeof value === 'string')  return value === 'true' || value === '1' || value === 'on';
  return null;
};
const useStr = (dp?: string): string | null => {
  const { value } = useDatapoint(dp || '');
  if (!dp) return null;
  return value == null ? null : String(value);
};

const DEFAULT_PRESETS = ['#ff3b30', '#ff9500', '#ffd60a', '#e5e5ea', '#5ac8fa', '#bf5af2', '#ff79c6', '#ff453a'];

// ── Sub-components ────────────────────────────────────────────────────────────

interface BrightnessBarProps {
  value: number;
  min: number;
  max: number;
  accent: string;
  onChange: (v: number) => void;
  onCommit: () => void;
}
function BrightnessBar({ value, min, max, accent, onChange, onCommit }: BrightnessBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = (value - min) / Math.max(1e-6, max - min);
  const pct = clamp(ratio, 0, 1) * 100;
  const setFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const r = clamp(1 - y / rect.height, 0, 1);
    onChange(min + r * (max - min));
  };
  return (
    <div
      ref={ref}
      className="nodrag relative rounded-2xl overflow-hidden cursor-pointer select-none mx-auto"
      style={{ width: '70%', height: '100%', maxWidth: 220, background: 'color-mix(in srgb, var(--app-bg) 70%, transparent)', border: '1px solid var(--app-border)' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e); }}
      onPointerMove={(e) => { if (e.buttons & 1) setFromPointer(e); }}
      onPointerUp={onCommit}
    >
      <div className="absolute left-0 right-0 bottom-0 transition-[height] duration-75"
        style={{ height: `${pct}%`, background: `linear-gradient(to top, ${accent}, color-mix(in srgb, ${accent} 60%, white))` }} />
      <div className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold pointer-events-none"
        style={{ color: pct > 25 ? '#fff' : 'var(--text-primary)', textShadow: pct > 25 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none' }}>
        {Math.round(pct)}%
      </div>
    </div>
  );
}

interface ColorWheelProps {
  hue: number;
  sat: number;
  style: 'disc' | 'ring';
  onChange: (hue: number, sat: number) => void;
  onCommit: () => void;
}
function ColorWheel({ hue, sat, style, onChange, onCommit }: ColorWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(220);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize(Math.max(80, Math.min(r.width, r.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const radius = size / 2;
  const ringW = style === 'ring' ? Math.max(10, size * 0.12) : 0;

  const setFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let h = Math.atan2(dy, dx) * 180 / Math.PI;
    if (h < 0) h += 360;
    if (style === 'disc') {
      const s = clamp(dist / radius, 0, 1);
      onChange(h, s);
    } else {
      onChange(h, sat);
    }
  };

  const knobAngle = (hue - 90) * Math.PI / 180;
  let knobX: number, knobY: number;
  if (style === 'disc') {
    const r = sat * radius;
    const a = hue * Math.PI / 180;
    knobX = radius + Math.cos(a) * r;
    knobY = radius + Math.sin(a) * r;
  } else {
    const r = radius - ringW / 2;
    knobX = radius + Math.cos(knobAngle) * r;
    knobY = radius + Math.sin(knobAngle) * r;
  }

  return (
    <div className="flex items-center justify-center w-full h-full" style={{ minHeight: 0 }}>
      <div className="relative" style={{ width: '100%', height: '100%', maxWidth: 240, maxHeight: 240, aspectRatio: '1 / 1' }}>
        <div
          ref={ref}
          className="nodrag absolute inset-0 rounded-full cursor-crosshair select-none"
          style={{
            background: style === 'disc'
              ? `conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`
              : `conic-gradient(from -90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`,
            boxShadow: 'inset 0 0 0 1px var(--app-border)',
          }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e); }}
          onPointerMove={(e) => { if (e.buttons & 1) setFromPointer(e); }}
          onPointerUp={onCommit}
        >
          {style === 'disc' && (
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle at center, white 0%, transparent 65%)` }} />
          )}
          {style === 'ring' && (
            <div className="absolute rounded-full pointer-events-none"
              style={{
                top: ringW, left: ringW, right: ringW, bottom: ringW,
                background: 'var(--widget-bg, var(--app-bg))',
                boxShadow: 'inset 0 0 0 1px var(--app-border)',
              }} />
          )}
        </div>
        {/* Knob */}
        <div
          className="absolute w-4 h-4 rounded-full pointer-events-none"
          style={{
            left: knobX, top: knobY, transform: 'translate(-50%, -50%)',
            background: hsvToHex(hue, sat, 1),
            border: '2px solid #fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>
  );
}

interface CTSliderProps {
  kelvin: number;
  min: number;
  max: number;
  onChange: (k: number) => void;
  onCommit: () => void;
}
function CTSlider({ kelvin, min, max, onChange, onCommit }: CTSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = (kelvin - min) / Math.max(1, max - min);
  const setFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const r = clamp(1 - y / rect.height, 0, 1);
    onChange(Math.round(min + r * (max - min)));
  };
  return (
    <div
      ref={ref}
      className="nodrag relative rounded-2xl overflow-hidden cursor-pointer select-none mx-auto"
      style={{
        width: '70%', height: '100%', maxWidth: 220,
        background: `linear-gradient(to top, ${kelvinToHex(min)}, ${kelvinToHex((min + max) / 2)}, ${kelvinToHex(max)})`,
        border: '1px solid var(--app-border)',
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e); }}
      onPointerMove={(e) => { if (e.buttons & 1) setFromPointer(e); }}
      onPointerUp={onCommit}
    >
      <div className="absolute left-0 right-0 h-0.5 pointer-events-none"
        style={{ bottom: `${ratio * 100}%`, background: 'rgba(255,255,255,0.95)', boxShadow: '0 0 4px rgba(0,0,0,0.4)' }} />
      <div className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold pointer-events-none"
        style={{ color: '#1a1a1a', textShadow: '0 1px 2px rgba(255,255,255,0.6)' }}>
        {kelvin} K
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

const TAB_META: Record<LightTab, { icon: LucideIcon; key: LightTab }> = {
  power:       { icon: Power,       key: 'power' },
  brightness:  { icon: SunMedium,   key: 'brightness' },
  color:       { icon: Palette,     key: 'color' },
  temperature: { icon: Thermometer, key: 'temperature' },
  effects:     { icon: Sparkles,    key: 'effects' },
};

export function LightWidget({ config, onConfigChange }: WidgetProps) {
  const o = config.options ?? {};
  const { setState } = useIoBroker();

  // ── Resolved options ────────────────────────────────────────────────────────
  const colorMode = (o.colorMode as LightColorMode) ?? 'none';
  const layout = (config.layout ?? 'light-all') as string;
  const wheelStyle = ((o.colorWheelStyle as 'disc' | 'ring') ?? 'disc');
  const presets = (o.colorPresets as string[] | undefined) ?? DEFAULT_PRESETS;
  const showTitle      = o.showTitle      !== false;
  const titleAlign     = (o.titleAlign    as string) ?? 'left';
  const showState      = o.showState      !== false;
  const showPalette    = o.showPalette    !== false;
  const showIcon       = o.showIcon       !== false;
  const iconSize       = (o.iconSize as number) || 20;

  // DP IDs
  const switchDp      = (o.switchDp      as string | undefined) || '';
  const brightnessDp  = (o.brightnessDp  as string | undefined) || config.datapoint || '';
  const hueDp         = (o.hueDp         as string | undefined) || '';
  const saturationDp  = (o.saturationDp  as string | undefined) || '';
  const rDp           = (o.rDp           as string | undefined) || '';
  const gDp           = (o.gDp           as string | undefined) || '';
  const bDp           = (o.bDp           as string | undefined) || '';
  const colorDp       = (o.colorDp       as string | undefined) || ''; // HmIP single integer
  const temperatureDp = (o.temperatureDp as string | undefined) || '';
  const effectDp      = (o.effectDp      as string | undefined) || '';

  // Ranges
  const briMin = (o.brightnessMin as number | undefined) ?? 0;
  const briMax = (o.brightnessMax as number | undefined) ?? 100;
  const satMax = (o.satMax as number | undefined) ?? 100;
  const ctMin  = (o.ctMin  as number | undefined) ?? 2000;
  const ctMax  = (o.ctMax  as number | undefined) ?? 6500;
  const hmWhiteValue = (o.hmWhiteValue as number | undefined) ?? 200;

  // Current values
  const switchVal      = useBool(switchDp);
  const brightnessVal  = useNum(brightnessDp);
  const hueVal         = useNum(hueDp);
  const satVal         = useNum(saturationDp);
  const rVal           = useNum(rDp);
  const gVal           = useNum(gDp);
  const bVal           = useNum(bDp);
  const colorVal       = useNum(colorDp);
  const ctVal          = useNum(temperatureDp);
  const effectVal      = useStr(effectDp);

  // Derived hue/sat (0..360 / 0..1)
  const { hue, sat } = useMemo(() => {
    if (colorMode === 'hsv') {
      const h = hueVal != null ? ((hueVal % 360) + 360) % 360 : 0;
      const s = satVal != null ? clamp(satVal / satMax, 0, 1) : 1;
      return { hue: h, sat: s };
    }
    if (colorMode === 'rgb') {
      if (rVal != null && gVal != null && bVal != null) {
        const [h, s] = rgbToHsv(rVal, gVal, bVal);
        return { hue: h, sat: s };
      }
      return { hue: 0, sat: 0 };
    }
    if (colorMode === 'hm-color') {
      if (colorVal == null) return { hue: 0, sat: 0 };
      if (colorVal >= hmWhiteValue) return { hue: 0, sat: 0 }; // white mode
      return { hue: (colorVal / 199) * 360, sat: 1 };
    }
    return { hue: 0, sat: 0 };
  }, [colorMode, hueVal, satVal, rVal, gVal, bVal, colorVal, satMax, hmWhiteValue]);

  // Drag state for smooth UI without flooding ioBroker
  const [dragBri, setDragBri] = useState<number | null>(null);
  const [dragHS,  setDragHS]  = useState<[number, number] | null>(null);
  const [dragCT,  setDragCT]  = useState<number | null>(null);

  const displayBri = dragBri ?? (brightnessVal ?? briMin);
  const displayHS  = dragHS  ?? [hue, sat];
  const displayCT  = dragCT  ?? (ctVal ?? Math.round((ctMin + ctMax) / 2));

  // ── Power / on detection ───────────────────────────────────────────────────
  const isOn = switchDp
    ? !!switchVal
    : (brightnessVal != null ? brightnessVal > briMin : false);

  const accentOn  = useMemo(() => {
    if (colorMode === 'none') return 'var(--accent-yellow)';
    return hsvToHex(displayHS[0], displayHS[1] || 0.0001, 1);
  }, [colorMode, displayHS]);
  const accent = isOn ? accentOn : 'var(--text-secondary)';

  // ── Writers ────────────────────────────────────────────────────────────────
  const togglePower = useCallback(() => {
    if (switchDp) {
      setState(switchDp, !isOn);
    } else if (brightnessDp) {
      setState(brightnessDp, isOn ? briMin : briMax);
    }
  }, [switchDp, brightnessDp, isOn, briMin, briMax, setState]);

  const writeBri = useCallback((v: number) => {
    if (!brightnessDp) return;
    setState(brightnessDp, Math.round(clamp(v, briMin, briMax)));
  }, [brightnessDp, briMin, briMax, setState]);

  const writeColor = useCallback((h: number, s: number) => {
    if (colorMode === 'hsv') {
      if (hueDp)        setState(hueDp, Math.round(h));
      if (saturationDp) setState(saturationDp, Math.round(s * satMax));
    } else if (colorMode === 'rgb') {
      const [r, g, b] = hsvToRgb(h, s, 1);
      if (rDp) setState(rDp, r);
      if (gDp) setState(gDp, g);
      if (bDp) setState(bDp, b);
    } else if (colorMode === 'hm-color') {
      if (colorDp) {
        const v = clamp(Math.round((h / 360) * 199), 0, 199);
        setState(colorDp, v);
      }
    }
  }, [colorMode, hueDp, saturationDp, rDp, gDp, bDp, colorDp, satMax, setState]);

  const writeCT = useCallback((k: number) => {
    if (colorMode === 'hm-color' && colorDp) {
      // HmIP: white mode = special integer
      setState(colorDp, hmWhiteValue);
      return;
    }
    if (temperatureDp) setState(temperatureDp, Math.round(clamp(k, ctMin, ctMax)));
  }, [colorMode, colorDp, temperatureDp, ctMin, ctMax, hmWhiteValue, setState]);

  const writeEffect = useCallback((v: string) => {
    if (!effectDp) return;
    const n = Number(v);
    setState(effectDp, Number.isFinite(n) && v.trim() !== '' ? n : v);
  }, [effectDp, setState]);

  const applyPreset = useCallback((hex: string) => {
    const hsv = hexToHsv(hex);
    if (!hsv) return;
    writeColor(hsv[0], hsv[1]);
  }, [writeColor]);

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const allowedTabs: LightTab[] = useMemo(() => {
    const fromLayout = (): LightTab[] => {
      switch (layout) {
        case 'light-brightness':  return ['brightness'];
        case 'light-color':       return ['color'];
        case 'light-temperature': return ['temperature'];
        case 'light-custom': {
          const t = (o.lightTabs as LightTab[] | undefined) ?? [];
          return t.filter((x): x is LightTab => ['brightness','color','temperature','effects'].includes(x));
        }
        default: return ['brightness', 'color', 'temperature'];
      }
    };
    const list = fromLayout().filter((tab) => {
      if (tab === 'brightness')  return !!brightnessDp;
      if (tab === 'color')       return colorMode !== 'none';
      if (tab === 'temperature') return !!temperatureDp || colorMode === 'hm-color';
      if (tab === 'effects')     return !!effectDp;
      return true;
    });
    return list.length ? list : (brightnessDp ? ['brightness'] : ['color']);
  }, [layout, o.lightTabs, brightnessDp, temperatureDp, effectDp, colorMode]);

  // Include effects tab automatically if effectDp set and layout=all
  const tabs: LightTab[] = useMemo(() => {
    if (layout === 'light-all' && effectDp && !allowedTabs.includes('effects')) {
      return [...allowedTabs, 'effects'];
    }
    return allowedTabs;
  }, [allowedTabs, layout, effectDp]);

  const initialTab: LightTab = (o.activeTab as LightTab | undefined) && tabs.includes(o.activeTab as LightTab)
    ? (o.activeTab as LightTab)
    : tabs[0] ?? 'brightness';
  const [activeTab, setActiveTab] = useState<LightTab>(initialTab);
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab(tabs[0] ?? 'brightness');
  }, [tabs, activeTab]);
  const persistTab = useCallback((tab: LightTab) => {
    setActiveTab(tab);
    if ((o.activeTab as LightTab | undefined) !== tab) {
      onConfigChange({ ...config, options: { ...o, activeTab: tab } });
    }
  }, [config, o, onConfigChange]);

  // ── Status text ────────────────────────────────────────────────────────────
  const stateText = (() => {
    if (!isOn) return 'Aus';
    if (brightnessVal != null) {
      const pct = Math.round(((brightnessVal - briMin) / Math.max(1, briMax - briMin)) * 100);
      return `An · ${pct}%`;
    }
    return 'An';
  })();

  // ── Icon ───────────────────────────────────────────────────────────────────
  const CompactIcon = useMemo(() => getWidgetIcon(o.icon as string | undefined, Lightbulb), [o.icon]);

  // ── Tab content ────────────────────────────────────────────────────────────
  const renderMain = () => {
    if (activeTab === 'power') {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <button
            onClick={togglePower}
            className="nodrag rounded-full flex items-center justify-center transition-colors"
            style={{
              width: 120, height: 120,
              background: isOn ? accent : 'var(--app-bg)',
              border: `2px solid ${isOn ? accent : 'var(--app-border)'}`,
              boxShadow: isOn ? `0 0 24px color-mix(in srgb, ${accent} 50%, transparent)` : 'none',
            }}
          >
            <Power size={40} color={isOn ? '#fff' : 'var(--text-secondary)'} />
          </button>
        </div>
      );
    }
    if (activeTab === 'brightness') {
      return (
        <BrightnessBar
          value={displayBri}
          min={briMin}
          max={briMax}
          accent={accent}
          onChange={(v) => setDragBri(v)}
          onCommit={() => { if (dragBri != null) { writeBri(dragBri); setDragBri(null); } }}
        />
      );
    }
    if (activeTab === 'color') {
      if (colorMode === 'none') {
        return <div className="flex items-center justify-center text-xs text-center px-4" style={{ color: 'var(--text-secondary)' }}>
          Kein Farb-Datenpunkt konfiguriert. In den Widget-Einstellungen Farb-Modus + DPs setzen.
        </div>;
      }
      return (
        <ColorWheel
          hue={displayHS[0]}
          sat={displayHS[1]}
          style={wheelStyle}
          onChange={(h, s) => setDragHS([h, s])}
          onCommit={() => { if (dragHS) { writeColor(dragHS[0], dragHS[1]); setDragHS(null); } }}
        />
      );
    }
    if (activeTab === 'temperature') {
      if (colorMode === 'hm-color' && !temperatureDp) {
        return (
          <div className="flex flex-col items-center justify-center w-full h-full gap-3 px-3 text-center">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>HmIP-Gerät – Weiß-LED über Farb-DP</p>
            <button onClick={() => writeCT(0)}
              className="nodrag rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{
                background: colorVal === hmWhiteValue ? '#fef3c7' : 'var(--app-bg)',
                color: colorVal === hmWhiteValue ? '#1a1a1a' : 'var(--text-primary)',
                border: '1px solid var(--app-border)',
              }}>
              Weiß einschalten
            </button>
          </div>
        );
      }
      return (
        <CTSlider
          kelvin={displayCT}
          min={ctMin}
          max={ctMax}
          onChange={(k) => setDragCT(k)}
          onCommit={() => { if (dragCT != null) { writeCT(dragCT); setDragCT(null); } }}
        />
      );
    }
    if (activeTab === 'effects') {
      const effects = (o.effects as LightEffect[] | undefined) ?? [];
      if (effects.length === 0) {
        return <div className="flex items-center justify-center text-xs text-center px-4" style={{ color: 'var(--text-secondary)' }}>
          Keine Effekte definiert. In den Widget-Einstellungen Effekte ergänzen.
        </div>;
      }
      return (
        <div className="grid grid-cols-2 gap-2 w-full overflow-auto px-1" style={{ maxHeight: '100%' }}>
          {effects.map((eff) => {
            const active = effectVal != null && String(effectVal) === String(eff.value);
            return (
              <button key={eff.value} onClick={() => writeEffect(eff.value)}
                className="nodrag rounded-xl px-2.5 py-2 text-[11px] font-medium text-left transition-colors"
                style={{
                  background: active ? (eff.color || 'var(--accent)') : 'var(--app-bg)',
                  color: active ? '#fff' : 'var(--text-primary)',
                  border: `1px solid ${active ? (eff.color || 'var(--accent)') : 'var(--app-border)'}`,
                }}>
                {eff.label}
              </button>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ position: 'relative', gap: 8 }}>
      {/* Header */}
      {(showTitle || showIcon || showState) && (
        <div className="flex items-center gap-2 shrink-0">
          {showIcon && <CompactIcon size={iconSize} style={{ color: accent, flexShrink: 0 }} />}
          <div className="flex-1 min-w-0">
            {showTitle && (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
                {config.title}
              </p>
            )}
            {showState && (
              <p className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>
                {stateText}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main control – fills available space */}
      <div className="flex-1 min-h-0 flex items-stretch justify-center">
        {renderMain()}
      </div>

      {/* Tab pill */}
      {tabs.length > 1 && (
        <div className="flex justify-center shrink-0">
          <div className="inline-flex items-center gap-1 rounded-full p-1"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
            {tabs.map((t) => {
              const TabIcon = TAB_META[t].icon;
              const active = activeTab === t;
              return (
                <button key={t} onClick={() => persistTab(t)}
                  className="nodrag w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    background: active ? '#1a1a1a' : 'transparent',
                    color:      active ? '#fff'    : 'var(--text-secondary)',
                  }}>
                  <TabIcon size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Preset palette */}
      {showPalette && colorMode !== 'none' && presets.length > 0 && (
        <div className="grid grid-cols-4 gap-2 px-2 shrink-0">
          {presets.slice(0, 8).map((hex, i) => (
            <button key={i} onClick={() => applyPreset(hex)}
              className="nodrag aspect-square rounded-full"
              style={{ background: hex, border: '1px solid color-mix(in srgb, var(--app-border) 60%, transparent)' }}
              title={hex}
            />
          ))}
        </div>
      )}

      <StatusBadges config={config} />

      {/* Eyedropper hint when no presets */}
      {showPalette && presets.length === 0 && (
        <div className="flex items-center justify-center text-[10px] gap-1 shrink-0" style={{ color: 'var(--text-secondary)' }}>
          <Pipette size={10} /> Keine Presets
        </div>
      )}
    </div>
  );
}
