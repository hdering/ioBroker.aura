import { useState, useEffect, useCallback } from 'react';
import { Sun, Home, Zap, Battery, Car, Plug, PlugZap } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps, WidgetConfig, ioBrokerState } from '../../types';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKW(w: number): string {
  if (w < 100) return (w / 1000).toFixed(2) + ' kW';
  return (w / 1000).toFixed(1) + ' kW';
}

function fmtDuration(ns: number): string {
  const s = Math.floor(ns / 1e9);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')} h`;
  return `${m}:${String(s % 60).padStart(2, '0')} min`;
}

function fmtSoc(v: number): string {
  return Math.round(v) + '%';
}

const MODE_MAP: Record<string, number> = { off: 0, pv: 1, minpv: 2, now: 3 };
const MODES: { key: string; label: string; activeColor: string }[] = [
  { key: 'off',   label: 'AUS',    activeColor: '#6b7280' },
  { key: 'pv',    label: 'PV',     activeColor: '#f59e0b' },
  { key: 'minpv', label: 'MIN+PV', activeColor: '#f97316' },
  { key: 'now',   label: 'SOFORT', activeColor: '#ef4444' },
];

// ── state types ───────────────────────────────────────────────────────────────

interface SiteState {
  pvPower: number;
  gridPower: number;
  homePower: number;
  batteryPower: number;
  batterySoc: number;
  batteryMode: string;
  greenShareHome: number;
  greenShareLoadpoints: number;
  tariffGrid: number;
}

interface LoadpointState {
  chargePower: number;
  chargedEnergy: number;
  charging: boolean;
  connected: boolean;
  mode: string;
  vehicleTitle: string;
  vehicleSoc: number;
  vehicleRange: number;
  effectiveLimitSoc: number;
  sessionSolarPercentage: number;
  sessionPrice: number;
  planActive: boolean;
  effectivePlanTime: string;
  chargeDuration: number;
  phasesActive: number;
  title: string;
}

const DEFAULT_SITE: SiteState = {
  pvPower: 0, gridPower: 0, homePower: 0, batteryPower: 0, batterySoc: 0,
  batteryMode: '', greenShareHome: 0, greenShareLoadpoints: 0, tariffGrid: 0,
};

const DEFAULT_LP: LoadpointState = {
  chargePower: 0, chargedEnergy: 0, charging: false, connected: false,
  mode: 'off', vehicleTitle: '', vehicleSoc: 0, vehicleRange: 0,
  effectiveLimitSoc: 80, sessionSolarPercentage: 0, sessionPrice: 0,
  planActive: false, effectivePlanTime: '', chargeDuration: 0,
  phasesActive: 0, title: '',
};

// ── useEvccData ───────────────────────────────────────────────────────────────

function useEvccData(prefix: string, loadpointCount: number) {
  const { subscribe, getState } = useIoBroker();
  const [site, setSite] = useState<SiteState>({ ...DEFAULT_SITE });
  const [loadpoints, setLoadpoints] = useState<LoadpointState[]>(
    Array.from({ length: loadpointCount }, () => ({ ...DEFAULT_LP })),
  );

  const updateSite = useCallback((key: keyof SiteState, val: ioBrokerState['val']) => {
    setSite((prev) => ({ ...prev, [key]: val ?? prev[key] }));
  }, []);

  const updateLp = useCallback((idx: number, key: keyof LoadpointState, val: ioBrokerState['val']) => {
    setLoadpoints((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val ?? next[idx][key] };
      return next;
    });
  }, []);

  useEffect(() => {
    setSite({ ...DEFAULT_SITE });
    setLoadpoints(Array.from({ length: loadpointCount }, () => ({ ...DEFAULT_LP })));

    const cleanups: (() => void)[] = [];

    const sitePoints: [string, keyof SiteState][] = [
      ['pvPower', 'pvPower'], ['gridPower', 'gridPower'], ['homePower', 'homePower'],
      ['batteryPower', 'batteryPower'], ['batterySoc', 'batterySoc'],
      ['batteryMode', 'batteryMode'], ['greenShareHome', 'greenShareHome'],
      ['greenShareLoadpoints', 'greenShareLoadpoints'], ['tariffGrid', 'tariffGrid'],
    ];

    for (const [dp, key] of sitePoints) {
      const id = `${prefix}.status.${dp}`;
      const cb = (s: ioBrokerState) => updateSite(key, s.val);
      cleanups.push(subscribe(id, cb));
      getState(id).then((s) => { if (s) updateSite(key, s.val); });
    }

    for (let n = 1; n <= loadpointCount; n++) {
      const idx = n - 1;
      const base = `${prefix}.loadpoint.${n}.status`;
      const lpPoints: [string, keyof LoadpointState][] = [
        ['chargePower', 'chargePower'], ['chargedEnergy', 'chargedEnergy'],
        ['charging', 'charging'], ['connected', 'connected'], ['mode', 'mode'],
        ['vehicleTitle', 'vehicleTitle'], ['vehicleSoc', 'vehicleSoc'],
        ['vehicleRange', 'vehicleRange'], ['effectiveLimitSoc', 'effectiveLimitSoc'],
        ['sessionSolarPercentage', 'sessionSolarPercentage'], ['sessionPrice', 'sessionPrice'],
        ['planActive', 'planActive'], ['effectivePlanTime', 'effectivePlanTime'],
        ['chargeDuration', 'chargeDuration'], ['phasesActive', 'phasesActive'],
        ['title', 'title'],
      ];
      for (const [dp, key] of lpPoints) {
        const id = `${base}.${dp}`;
        const cb = (s: ioBrokerState) => updateLp(idx, key, s.val);
        cleanups.push(subscribe(id, cb));
        getState(id).then((s) => { if (s) updateLp(idx, key, s.val); });
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, [prefix, loadpointCount, subscribe, getState, updateSite, updateLp]);

  return { site, loadpoints };
}

// ── Animated flow arrow (horizontal, CSS-based) ───────────────────────────────

function FlowArrow({ active, color, reverse = false, power = 0 }: {
  active: boolean; color: string; reverse?: boolean; power?: number;
}) {
  const dur = active ? Math.max(0.5, 2.5 - (power / 5000)) : 2;
  return (
    <div className="flex-1 relative flex items-center" style={{ height: 16, overflow: 'hidden' }}>
      <div className="w-full" style={{ height: 1.5, background: active ? color : 'var(--app-border)', opacity: 0.45 }} />
      {active && (
        <div style={{
          position: 'absolute',
          width: 9, height: 9,
          borderRadius: '50%',
          background: color,
          top: '50%',
          transform: 'translateY(-50%)',
          animation: `${reverse ? 'evcc-r' : 'evcc-f'} ${dur}s linear infinite`,
        }} />
      )}
    </div>
  );
}

// ── Animated flow arrow (vertical, SVG-based) ─────────────────────────────────

function VertFlowArrow({ active, color, power = 0, down = true }: {
  active: boolean; color: string; power?: number; down?: boolean;
}) {
  const dur = active ? Math.max(0.5, 2.5 - (power / 5000)) : 2;
  const H = 24;
  const path = down ? `M 5 0 L 5 ${H}` : `M 5 ${H} L 5 0`;
  return (
    <svg width={10} height={H} style={{ overflow: 'visible' }}>
      <line x1="5" y1="0" x2="5" y2={H}
        stroke={active ? color : 'var(--app-border)'}
        strokeWidth={1.5} strokeOpacity={0.45} />
      {active && (
        <circle r={4.5} fill={color} opacity={0.9}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
        </circle>
      )}
    </svg>
  );
}

// ── Energy flow row (default/card layout) ─────────────────────────────────────

function EnergyFlowRow({ site, showBattery }: { site: SiteState; showBattery: boolean }) {
  const t = useT();
  const hasSolar   = site.pvPower > 10;
  const gridImport = site.gridPower > 10;
  const gridExport = site.gridPower < -10;
  const battCharge = site.batteryPower < -10;
  const battDisch  = site.batteryPower > 10;
  const battActive = battCharge || battDisch;
  const gridColor  = gridImport ? '#ef4444' : gridExport ? '#10b981' : 'var(--text-secondary)';
  const battColor  = battCharge ? '#3b82f6' : '#f59e0b';

  return (
    <div className="flex flex-col">
      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes evcc-f { 0%{left:-6px} 100%{left:calc(100% + 3px)} }
        @keyframes evcc-r { 0%{left:calc(100% + 3px)} 100%{left:-6px} }
      `}</style>

      {/* Main row: Solar → House ↔ Grid */}
      <div className="flex items-center">
        {/* Solar */}
        <div className="flex flex-col items-center gap-0.5" style={{ width: 58 }}>
          <Sun size={16} color="#f59e0b" />
          <span className="text-xs font-semibold tabular-nums" style={{ color: '#f59e0b' }}>{fmtKW(site.pvPower)}</span>
          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{t('evcc.solar')}</span>
        </div>

        <FlowArrow active={hasSolar} color="#f59e0b" power={site.pvPower} />

        {/* House */}
        <div className="flex flex-col items-center gap-0.5" style={{ width: 58 }}>
          <Home size={16} color="var(--text-secondary)" />
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtKW(site.homePower)}</span>
          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{t('evcc.house')}</span>
        </div>

        <FlowArrow active={gridImport || gridExport} color={gridColor} reverse={gridImport} power={Math.abs(site.gridPower)} />

        {/* Grid */}
        <div className="flex flex-col items-center gap-0.5" style={{ width: 58 }}>
          <Zap size={16} color={gridColor} />
          <span className="text-xs font-semibold tabular-nums" style={{ color: gridColor }}>{fmtKW(Math.abs(site.gridPower))}</span>
          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
            {gridImport ? t('evcc.grid') : gridExport ? t('evcc.feedIn') : t('evcc.gridLabel')}
          </span>
        </div>
      </div>

      {/* Battery – centered under House (House is exactly at horizontal center) */}
      {showBattery && (
        <div className="flex flex-col items-center">
          <VertFlowArrow active={battActive} color={battColor} power={Math.abs(site.batteryPower)} down={battCharge} />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl"
            style={{ background: `${battColor}18`, border: `1px solid ${battColor}44` }}>
            <Battery size={13} color={battColor} />
            <span className="text-xs font-bold tabular-nums" style={{ color: battColor }}>{fmtSoc(site.batterySoc)}</span>
            {site.batteryPower !== 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>· {fmtKW(Math.abs(site.batteryPower))}</span>
            )}
            {site.batteryMode && site.batteryMode !== 'normal' && site.batteryMode !== 'unknown' && (
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>· {site.batteryMode}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Energy flow SVG (flow layout only) ───────────────────────────────────────

function FlowPath({
  x1, y1, x2, y2, active, color, reverse = false, power = 0,
}: {
  x1: number; y1: number; x2: number; y2: number;
  active: boolean; color: string; reverse?: boolean; power?: number;
}) {
  const dur = active ? Math.max(0.6, 2.0 - (power / 5000)) : 2;
  const fwd = `M ${x1} ${y1} L ${x2} ${y2}`;
  const rev = `M ${x2} ${y2} L ${x1} ${y1}`;
  const animPath = reverse ? rev : fwd;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={active ? color : 'var(--app-border)'}
        strokeWidth={active ? 2 : 1.5}
        strokeOpacity={active ? 0.25 : 0.4} />
      {active && [0, 0.35, 0.7].map((offset, i) => (
        <circle key={i} r={2.8} fill={color} opacity={0.9}>
          <animateMotion dur={`${dur}s`} begin={`${-offset * dur}s`} repeatCount="indefinite" path={animPath} />
        </circle>
      ))}
    </g>
  );
}

function EnergyFlowSVG({
  site, loadpoints, showBattery, visibleLpIndices,
}: {
  site: SiteState; loadpoints: LoadpointState[]; showBattery: boolean; visibleLpIndices: number[];
}) {
  const t = useT();
  const hasSolar   = site.pvPower > 10;
  const gridImport = site.gridPower > 10;
  const gridExport = site.gridPower < -10;
  const battCharge = site.batteryPower < -10;
  const battDisch  = site.batteryPower > 10;
  const visLps     = visibleLpIndices.map((i) => loadpoints[i]).filter(Boolean);
  const chargingLps = visLps.filter((lp) => lp.chargePower > 10);
  const gridColor  = gridImport ? '#ef4444' : gridExport ? '#10b981' : 'var(--text-secondary)';
  const battColor  = battCharge ? '#3b82f6' : '#f59e0b';
  const cx = 110, cy = 75, sx = 35, sy = 35, gx = 185, gy = 35, bx = 35, by = 140;
  const lpPositions = visLps.map((_, i) => ({ x: 185, y: showBattery ? 105 + i * 40 : 120 + i * 35 }));

  return (
    <svg viewBox="0 0 220 170" className="w-full h-full" style={{ overflow: 'visible' }}>
      <FlowPath x1={sx} y1={sy} x2={cx} y2={cy} active={hasSolar} color="#f59e0b" power={site.pvPower} />
      <FlowPath x1={gx} y1={gy} x2={cx} y2={cy} active={gridImport} color="#ef4444" power={Math.abs(site.gridPower)} />
      <FlowPath x1={gx} y1={gy} x2={cx} y2={cy} active={gridExport} color="#10b981" reverse power={Math.abs(site.gridPower)} />
      {showBattery && (
        <>
          <FlowPath x1={bx} y1={by} x2={cx} y2={cy} active={battDisch} color="#f59e0b" power={Math.abs(site.batteryPower)} />
          <FlowPath x1={bx} y1={by} x2={cx} y2={cy} active={battCharge} color="#3b82f6" reverse power={Math.abs(site.batteryPower)} />
        </>
      )}
      {lpPositions.map((pos, i) => (
        <FlowPath key={i} x1={cx} y1={cy} x2={pos.x} y2={pos.y}
          active={chargingLps.includes(visLps[i])} color="#6366f1" power={visLps[i].chargePower} />
      ))}
      <circle cx={sx} cy={sy} r={18} fill="#f59e0b22" stroke="#f59e0b" strokeWidth={1.5} />
      <text x={sx} y={sy+5} textAnchor="middle" fontSize={14}>☀️</text>
      <text x={sx} y={sy+26} textAnchor="middle" fontSize={8} fill="#f59e0b" fontWeight="bold">{hasSolar ? fmtKW(site.pvPower) : '–'}</text>
      <text x={sx} y={sy+35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">{t('evcc.solar')}</text>
      <circle cx={gx} cy={gy} r={18} fill={`${gridColor}22`} stroke={gridColor} strokeWidth={1.5} />
      <text x={gx} y={gy+5} textAnchor="middle" fontSize={13}>⚡</text>
      <text x={gx} y={gy+26} textAnchor="middle" fontSize={8} fill={gridColor} fontWeight="bold">{fmtKW(Math.abs(site.gridPower))}</text>
      <text x={gx} y={gy+35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">{gridImport ? t('evcc.grid') : gridExport ? t('evcc.feedIn') : t('evcc.gridLabel')}</text>
      <circle cx={cx} cy={cy} r={22} fill="var(--app-surface)" stroke="var(--app-border)" strokeWidth={2} />
      <text x={cx} y={cy+5} textAnchor="middle" fontSize={15}>🏠</text>
      <text x={cx} y={cy+20} textAnchor="middle" fontSize={8} fill="var(--text-primary)" fontWeight="bold">{fmtKW(site.homePower)}</text>
      <text x={cx} y={cy+30} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">{t('evcc.house')}</text>
      {showBattery && (
        <>
          <circle cx={bx} cy={by} r={18} fill={`${battColor}22`} stroke={battColor} strokeWidth={1.5} />
          <text x={bx} y={by+5} textAnchor="middle" fontSize={13}>🔋</text>
          <text x={bx} y={by+26} textAnchor="middle" fontSize={8} fill={battColor} fontWeight="bold">{fmtSoc(site.batterySoc)}</text>
          <text x={bx} y={by+35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">{site.batteryPower !== 0 ? fmtKW(Math.abs(site.batteryPower)) : '–'}</text>
        </>
      )}
      {lpPositions.map((pos, i) => {
        const lp = visLps[i];
        const isCharging = lp.chargePower > 10;
        const isConnected = lp.connected;
        const color = isCharging ? '#6366f1' : isConnected ? '#818cf8' : 'var(--text-secondary)';
        return (
          <g key={i}>
            <circle cx={pos.x} cy={pos.y} r={16} fill={`${isConnected ? '#6366f1' : 'var(--app-border)'}22`} stroke={color} strokeWidth={1.5} />
            <text x={pos.x} y={pos.y+5} textAnchor="middle" fontSize={12}>{isConnected ? '🚗' : '🔌'}</text>
            <text x={pos.x} y={pos.y+24} textAnchor="middle" fontSize={8} fill={color} fontWeight="bold">
              {isCharging ? fmtKW(lp.chargePower) : lp.vehicleSoc > 0 ? fmtSoc(lp.vehicleSoc) : '–'}
            </text>
            {isCharging && (
              <circle cx={pos.x+11} cy={pos.y-11} r={3} fill="#6366f1">
                <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Compact row ───────────────────────────────────────────────────────────────

function CompactRow({ site, showBattery }: { site: SiteState; showBattery: boolean }) {
  const gridColor  = site.gridPower > 0 ? '#ef4444' : site.gridPower < 0 ? '#10b981' : 'var(--text-secondary)';
  const battColor  = site.batteryPower < 0 ? '#3b82f6' : '#f59e0b';
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="flex items-center gap-1 font-medium" style={{ color: '#f59e0b' }}>
        ☀️ {fmtKW(site.pvPower)}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>·</span>
      <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-primary)' }}>
        🏠 {fmtKW(site.homePower)}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>·</span>
      <span className="flex items-center gap-1 font-medium" style={{ color: gridColor }}>
        ⚡ {fmtKW(Math.abs(site.gridPower))}
      </span>
      {showBattery && (
        <>
          <span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>·</span>
          <span className="flex items-center gap-1 font-medium" style={{ color: battColor }}>
            🔋 {fmtSoc(site.batterySoc)}
          </span>
        </>
      )}
    </div>
  );
}

// ── Battery-only view ─────────────────────────────────────────────────────────

function BatteryView({ site }: { site: SiteState }) {
  const battCharge = site.batteryPower < -10;
  const battDisch  = site.batteryPower > 10;
  const battColor  = battCharge ? '#3b82f6' : battDisch ? '#f59e0b' : '#10b981';
  const soc = Math.max(0, Math.min(100, site.batterySoc));

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-4xl">🔋</div>
      {/* SoC bar */}
      <div className="w-full max-w-[140px]">
        <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{ width: `${soc}%`, background: battColor }} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color: '#fff', textShadow: '0 1px 2px #0005' }}>
            {fmtSoc(soc)}
          </span>
        </div>
      </div>
      {site.batteryPower !== 0 && (
        <div className="text-sm font-semibold" style={{ color: battColor }}>
          {battCharge ? '↓ ' : battDisch ? '↑ ' : ''}{fmtKW(Math.abs(site.batteryPower))}
        </div>
      )}
      {site.batteryMode && site.batteryMode !== 'normal' && site.batteryMode !== 'unknown' && (
        <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{site.batteryMode}</div>
      )}
    </div>
  );
}

// ── Production-only view ──────────────────────────────────────────────────────

function ProductionView({ site }: { site: SiteState }) {
  const feedIn = site.gridPower < -10;
  const feedInW = Math.abs(Math.min(0, site.gridPower));

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="text-3xl">☀️</div>
      <div className="text-3xl font-black" style={{ color: '#f59e0b' }}>
        {fmtKW(site.pvPower)}
      </div>
      {feedIn && (
        <div className="flex items-center gap-1 text-xs" style={{ color: '#10b981' }}>
          <span>↗</span>
          <span>{fmtKW(feedInW)} Einspeisung</span>
        </div>
      )}
      {site.greenShareHome > 0 && (
        <div className="text-[10px]" style={{ color: '#10b981' }}>
          🌿 {Math.round(site.greenShareHome * 100)}% Eigenanteil
        </div>
      )}
    </div>
  );
}

// ── Consumption-only view ─────────────────────────────────────────────────────

function ConsumptionView({ site }: { site: SiteState }) {
  const gridImport = site.gridPower > 10;
  const gridColor  = gridImport ? '#ef4444' : '#10b981';
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="text-3xl">🏠</div>
      <div className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
        {fmtKW(site.homePower)}
      </div>
      <div className="flex items-center gap-1 text-xs" style={{ color: gridColor }}>
        <span>{gridImport ? '↓ Bezug' : '↑ Einspeisung'}</span>
        <span className="font-semibold">{fmtKW(Math.abs(site.gridPower))}</span>
      </div>
      {site.tariffGrid > 0 && (
        <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {site.tariffGrid.toFixed(4)} €/kWh
        </div>
      )}
    </div>
  );
}

// ── SocBar ────────────────────────────────────────────────────────────────────

function SocBar({ current, target, color }: { current: number; target: number; color: string }) {
  return (
    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
      <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, current)}%`, background: color }} />
      {target > 0 && target < 100 && (
        <div className="absolute top-0 h-full w-0.5"
          style={{ left: `${target}%`, background: 'var(--text-primary)', opacity: 0.6 }} />
      )}
    </div>
  );
}

// ── LoadpointCard ─────────────────────────────────────────────────────────────

function LoadpointCard({ lp, idx, prefix, compact }: {
  lp: LoadpointState; idx: number; prefix: string; compact: boolean;
}) {
  const t = useT();
  const { setState } = useIoBroker();
  const setMode    = (modeKey: string) => setState(`${prefix}.loadpoint.${idx + 1}.control.pvControl`, MODE_MAP[modeKey]);
  const setLimitSoc = (v: number) => setState(`${prefix}.loadpoint.${idx + 1}.control.limitSoc`, v);
  const lpTitle    = lp.title || t('evcc.loadpoint', { n: idx + 1 });
  const vehicleName = lp.vehicleTitle || t('evcc.vehicle');

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {lp.connected ? <PlugZap size={13} color="#6366f1" /> : <Plug size={13} color="var(--text-secondary)" />}
        <span style={{ color: lp.connected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {lp.connected ? vehicleName : lpTitle}
        </span>
        {lp.vehicleSoc > 0 && <span style={{ color: '#6366f1' }}>{fmtSoc(lp.vehicleSoc)}→{fmtSoc(lp.effectiveLimitSoc)}</span>}
        {lp.charging && (
          <span className="flex items-center gap-1" style={{ color: '#6366f1' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#6366f1' }} />
            {fmtKW(lp.chargePower)}
          </span>
        )}
        <span className="ml-auto font-medium" style={{ color: 'var(--text-secondary)' }}>
          {MODES.find((m) => m.key === lp.mode)?.label ?? lp.mode}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
      <div className="flex items-center gap-2">
        {lp.connected ? <PlugZap size={16} color="#6366f1" /> : <Plug size={16} color="var(--text-secondary)" />}
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
          {lp.connected ? vehicleName : lpTitle}
        </span>
        {lp.charging && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#6366f1' }}>
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#6366f1' }} />
            {t('evcc.charging')}
          </span>
        )}
        {lp.chargePower > 0 && (
          <span className="text-xs font-bold" style={{ color: '#6366f1' }}>{fmtKW(lp.chargePower)}</span>
        )}
      </div>

      {lp.connected && lp.vehicleSoc > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-1">
              <Car size={11} />
              <span>{fmtSoc(lp.vehicleSoc)}</span>
              {lp.vehicleRange > 0 && <span>· {Math.round(lp.vehicleRange)} km</span>}
            </div>
            <div className="flex items-center gap-1">
              <span>{t('evcc.targetSoc')}</span>
              <button className="font-semibold hover:opacity-80" style={{ color: '#6366f1' }}
                onClick={() => setLimitSoc(Math.min(100, lp.effectiveLimitSoc + 10))}>
                {fmtSoc(lp.effectiveLimitSoc)}
              </button>
              {lp.sessionSolarPercentage > 0 && (
                <span style={{ color: '#10b981' }}>· 🌿 {Math.round(lp.sessionSolarPercentage)}%</span>
              )}
            </div>
          </div>
          <SocBar current={lp.vehicleSoc} target={lp.effectiveLimitSoc} color="#6366f1" />
        </div>
      )}

      {lp.charging && (
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {lp.chargeDuration > 0 && <span>{fmtDuration(lp.chargeDuration)}</span>}
          {lp.chargedEnergy > 0 && <span>{(lp.chargedEnergy / 1000).toFixed(2)} kWh</span>}
          {lp.sessionPrice > 0 && <span>{lp.sessionPrice.toFixed(2)} €</span>}
          {lp.phasesActive > 0 && <span>{lp.phasesActive}ϕ</span>}
          {lp.planActive && lp.effectivePlanTime && (
            <span style={{ color: '#f59e0b' }}>
              📅 {new Date(lp.effectivePlanTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-1">
        {MODES.map((m) => {
          const active = lp.mode === m.key;
          return (
            <button key={m.key} onClick={() => setMode(m.key)}
              className="flex-1 text-[11px] font-medium rounded-md transition-all hover:opacity-90 active:scale-95"
              style={{
                minHeight: 28,
                background: active ? m.activeColor : 'var(--app-bg)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? m.activeColor : 'var(--app-border)'}`,
              }}>
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EvccWidget ────────────────────────────────────────────────────────────────

export function EvccWidget({ config }: WidgetProps) {
  const t = useT();
  const { connected } = useIoBroker();
  const o = config.options ?? {};
  const prefix        = (o.evccPrefix      as string)  ?? 'evcc.0';
  const loadpointCount = Math.max(1, Math.min(8, (o.loadpointCount as number) ?? 1));
  const showBattery   = (o.showBattery     as boolean) ?? true;
  const layout        = config.layout ?? 'default';

  // Which loadpoints to show (0-based indices); default = all
  const visibleLpIndices: number[] = (() => {
    const raw = o.visibleLoadpoints as number[] | undefined;
    if (raw && raw.length > 0) return raw;
    return Array.from({ length: loadpointCount }, (_, i) => i);
  })();

  // Battery datapoint: manual override wins; otherwise auto-derive from prefix
  const batterySocDp   = (o.batterySocDatapoint   as string) ?? '';
  const batteryPowerDp = (o.batteryPowerDatapoint as string) ?? '';
  const effectiveBattDp = batterySocDp || (prefix ? `${prefix}.status.battery` : '');

  const { value: extSoc }   = useDatapoint(effectiveBattDp);
  const { value: extPower } = useDatapoint(batteryPowerDp);

  const { site: rawSite, loadpoints } = useEvccData(prefix, loadpointCount);

  // Auto-detect JSON battery object (e.g. evcc.0.status.battery
  // → {"soc":10.5,"power":0,...}) and extract both values.
  const batteryJson = (() => {
    if (!effectiveBattDp || extSoc == null) return null;
    const str = String(extSoc).trim();
    if (!str.startsWith('{')) return null;
    try { return JSON.parse(str) as { soc?: number; power?: number }; } catch { return null; }
  })();

  const site: SiteState = {
    ...rawSite,
    ...(batteryJson
      ? {
          ...(batteryJson.soc   != null ? { batterySoc:   batteryJson.soc }   : {}),
          ...(batteryJson.power != null ? { batteryPower: batteryJson.power }  : {}),
        }
      : {
          ...(effectiveBattDp && extSoc   != null ? { batterySoc:   parseFloat(String(extSoc))   } : {}),
          ...(batteryPowerDp  && extPower != null ? { batteryPower: parseFloat(String(extPower)) } : {}),
        }
    ),
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <Zap size={24} strokeWidth={1.5} />
        <span className="text-xs">{t('evcc.noConnection')}</span>
      </div>
    );
  }

  const visLps = visibleLpIndices.map((i) => ({ lp: loadpoints[i], idx: i })).filter(({ lp }) => !!lp);

  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  // ── Layout: battery only ──────────────────────────────────────────────────
  if (layout === 'battery') return <BatteryView site={site} />;

  // ── Layout: production only ───────────────────────────────────────────────
  if (layout === 'production') return <ProductionView site={site} />;

  // ── Layout: consumption only ──────────────────────────────────────────────
  if (layout === 'consumption') return <ConsumptionView site={site} />;

  // ── Layout: loadpoints only ───────────────────────────────────────────────
  if (layout === 'loadpoints') {
    return (
      <div className="aura-scroll flex flex-col gap-2 h-full overflow-auto">
        {visLps.map(({ lp, idx }) => (
          <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} />
        ))}
      </div>
    );
  }

  // ── Layout: compact / minimal ─────────────────────────────────────────────
  if (layout === 'compact' || layout === 'minimal') {
    return (
      <div className="flex flex-col gap-1.5 h-full justify-center px-1">
        <CompactRow site={site} showBattery={showBattery} />
        {visLps.map(({ lp, idx }) => (
          <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact />
        ))}
      </div>
    );
  }

  // ── Layout: flow (SVG node graph) ────────────────────────────────────────
  if (layout === 'flow') {
    return (
      <div className="aura-scroll flex flex-col gap-2 h-full overflow-auto">
        {config.title && !config.options?.hideTitle && (
          <p className="text-xs truncate shrink-0" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        )}
        <div className="shrink-0" style={{ height: showBattery ? 190 : 160 }}>
          <EnergyFlowSVG site={site} loadpoints={loadpoints} showBattery={showBattery} visibleLpIndices={visibleLpIndices} />
        </div>
        {visLps.map(({ lp, idx }) => (
          <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} />
        ))}
      </div>
    );
  }

  // ── Layout: default / card ────────────────────────────────────────────────
  return (
    <div className="aura-scroll flex flex-col gap-2 h-full overflow-auto">
      {config.title && !config.options?.hideTitle && (
        <p className="text-xs truncate shrink-0" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      )}
      <div className="shrink-0">
        <EnergyFlowRow site={site} showBattery={showBattery} />
      </div>

      {visLps.map(({ lp, idx }) => (
        <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} />
      ))}

      {site.tariffGrid > 0 && (
        <div className="text-[10px] text-right shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {site.tariffGrid.toFixed(4)} €/kWh
        </div>
      )}
    </div>
  );
}

// ── EvccConfig ────────────────────────────────────────────────────────────────

export function EvccConfig({
  config,
  onConfigChange,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
}) {
  const t = useT();
  const o = config.options ?? {};
  const set = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const prefix        = (o.evccPrefix      as string)  ?? 'evcc.0';
  const lpCount       = (o.loadpointCount  as number)  ?? 1;
  const showBattery   = (o.showBattery     as boolean) ?? true;
  const visibleLps    = (o.visibleLoadpoints as number[]) ?? [];

  const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
  const inputSty: React.CSSProperties = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

  const toggleLp = (idx: number) => {
    const all = Array.from({ length: lpCount }, (_, i) => i);
    const current = visibleLps.length > 0 ? visibleLps : all;
    const next = current.includes(idx)
      ? current.filter((i) => i !== idx)
      : [...current, idx].sort();
    // If all selected, store empty (= show all)
    set({ visibleLoadpoints: next.length === lpCount ? [] : next });
  };

  const all = Array.from({ length: lpCount }, (_, i) => i);
  const effectiveVisible = visibleLps.length > 0 ? visibleLps : all;

  return (
    <>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('evcc.prefix')}</label>
        <input type="text" value={prefix}
          onChange={(e) => set({ evccPrefix: e.target.value || 'evcc.0' })}
          placeholder="evcc.0" className={inputCls + ' font-mono'} style={inputSty} />
      </div>

      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('evcc.loadpoints')} (gesamt)</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} onClick={() => set({ loadpointCount: n, visibleLoadpoints: [] })}
              className="flex-1 text-xs py-1.5 rounded-lg transition-all"
              style={{
                background: lpCount === n ? 'var(--accent)' : 'var(--app-bg)',
                color: lpCount === n ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${lpCount === n ? 'var(--accent)' : 'var(--app-border)'}`,
              }}>{n}</button>
          ))}
        </div>
      </div>

      {lpCount > 1 && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Angezeigte Ladepunkte</label>
          <div className="flex flex-wrap gap-1">
            {all.map((idx) => {
              const active = effectiveVisible.includes(idx);
              return (
                <button key={idx} onClick={() => toggleLp(idx)}
                  className="text-xs px-2 py-1 rounded-lg transition-all"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}>LP {idx + 1}</button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('evcc.showBattery')}</label>
        <button onClick={() => set({ showBattery: !showBattery })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: showBattery ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showBattery ? '18px' : '2px' }} />
        </button>
      </div>

      {showBattery && (
        <>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Batterie SoC – eigener Datenpunkt <span style={{ opacity: 0.6 }}>(optional, wenn EVCC Batterie nicht kennt)</span>
            </label>
            <input type="text"
              value={(o.batterySocDatapoint as string) ?? ''}
              onChange={(e) => set({ batterySocDatapoint: e.target.value || undefined })}
              placeholder="z.B. evcc.0.status.battery oder sma.0.battery.soc"
              className={inputCls + ' font-mono'} style={inputSty} />
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Batterie Leistung – eigener Datenpunkt <span style={{ opacity: 0.6 }}>(Watt, negativ = laden)</span>
            </label>
            <input type="text"
              value={(o.batteryPowerDatapoint as string) ?? ''}
              onChange={(e) => set({ batteryPowerDatapoint: e.target.value || undefined })}
              placeholder="z.B. sma.0.battery.power"
              className={inputCls + ' font-mono'} style={inputSty} />
          </div>
        </>
      )}
    </>
  );
}
