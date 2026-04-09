import { useState, useEffect, useCallback } from 'react';
import { Sun, Home, Zap, Battery, Car, Plug, PlugZap } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps, WidgetConfig, ioBrokerState } from '../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKW(w: number): string {
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

// mode number → pvControl value
const MODE_MAP: Record<string, number> = { off: 0, pv: 1, minpv: 2, now: 3 };
const MODES: { key: string; label: string; activeColor: string }[] = [
  { key: 'off',   label: 'AUS',    activeColor: '#6b7280' },
  { key: 'pv',    label: 'PV',     activeColor: '#f59e0b' },
  { key: 'minpv', label: 'MIN+PV', activeColor: '#f97316' },
  { key: 'now',   label: 'SOFORT', activeColor: '#ef4444' },
];

// ── site state ────────────────────────────────────────────────────────────────

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
    const cleanups: (() => void)[] = [];

    // site datapoints
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

    // loadpoint datapoints
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

// ── EnergyFlowRow ─────────────────────────────────────────────────────────────

function EnergyFlowRow({ site, showBattery, compact }: { site: SiteState; showBattery: boolean; compact: boolean }) {
  const gridImport = site.gridPower > 0;
  const gridExport = site.gridPower < 0;
  const gridColor = gridImport ? '#ef4444' : gridExport ? '#10b981' : 'var(--text-secondary)';
  const battCharge = site.batteryPower < 0;
  const battColor = battCharge ? '#3b82f6' : '#f59e0b';

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs font-medium">
          <Sun size={13} color="#f59e0b" />
          <span style={{ color: '#f59e0b' }}>{fmtKW(site.pvPower)}</span>
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>·</span>
        <span className="flex items-center gap-1 text-xs font-medium">
          <Home size={13} color="var(--text-secondary)" />
          <span style={{ color: 'var(--text-primary)' }}>{fmtKW(site.homePower)}</span>
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>·</span>
        <span className="flex items-center gap-1 text-xs font-medium">
          <Zap size={13} color={gridColor} />
          <span style={{ color: gridColor }}>{fmtKW(Math.abs(site.gridPower))}</span>
        </span>
        {showBattery && site.batterySoc > 0 && (
          <>
            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>·</span>
            <span className="flex items-center gap-1 text-xs font-medium">
              <Battery size={13} color={battColor} />
              <span style={{ color: battColor }}>{fmtSoc(site.batterySoc)}</span>
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* main flow row */}
      <div className="flex items-center justify-between gap-1">
        {/* Solar */}
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <Sun size={18} color="#f59e0b" />
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#f59e0b' }}>
            {fmtKW(site.pvPower)}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Solar</span>
        </div>

        {/* arrow solar→home */}
        <div className="flex-1 flex items-center justify-center">
          <div className="h-px flex-1" style={{ background: '#f59e0b', opacity: 0.5 }} />
          <span style={{ color: '#f59e0b', fontSize: 10 }}>▶</span>
        </div>

        {/* Home */}
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <Home size={18} color="var(--text-secondary)" />
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            {fmtKW(site.homePower)}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Haus</span>
        </div>

        {/* arrow home↔grid */}
        <div className="flex-1 flex items-center justify-center">
          {gridImport ? (
            <>
              <span style={{ color: gridColor, fontSize: 10 }}>◀</span>
              <div className="h-px flex-1" style={{ background: gridColor, opacity: 0.5 }} />
            </>
          ) : (
            <>
              <div className="h-px flex-1" style={{ background: gridColor, opacity: 0.5 }} />
              <span style={{ color: gridColor, fontSize: 10 }}>▶</span>
            </>
          )}
        </div>

        {/* Grid */}
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <Zap size={18} color={gridColor} />
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: gridColor }}>
            {fmtKW(Math.abs(site.gridPower))}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {gridImport ? 'Bezug' : gridExport ? 'Einspsg.' : 'Netz'}
          </span>
        </div>
      </div>

      {/* battery row */}
      {showBattery && site.batterySoc > 0 && (
        <div className="flex items-center justify-center gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'var(--app-bg)' }}>
            {battCharge ? (
              <span style={{ color: battColor, fontSize: 10 }}>▼</span>
            ) : (
              <span style={{ color: battColor, fontSize: 10 }}>▲</span>
            )}
            <Battery size={14} color={battColor} />
            <span className="text-xs font-semibold" style={{ color: battColor }}>
              {fmtSoc(site.batterySoc)}
            </span>
            {site.batteryPower !== 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                · {fmtKW(Math.abs(site.batteryPower))}
              </span>
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

// ── SocBar ────────────────────────────────────────────────────────────────────

function SocBar({ current, target, color }: { current: number; target: number; color: string }) {
  return (
    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, current)}%`, background: color }}
      />
      {target > 0 && target < 100 && (
        <div
          className="absolute top-0 h-full w-0.5"
          style={{ left: `${target}%`, background: 'var(--text-primary)', opacity: 0.6 }}
        />
      )}
    </div>
  );
}

// ── LoadpointCard ─────────────────────────────────────────────────────────────

function LoadpointCard({
  lp,
  idx,
  prefix,
  compact,
}: {
  lp: LoadpointState;
  idx: number;
  prefix: string;
  compact: boolean;
}) {
  const { setState } = useIoBroker();

  const setMode = (modeKey: string) => {
    setState(`${prefix}.loadpoint.${idx + 1}.control.pvControl`, MODE_MAP[modeKey]);
  };

  const setLimitSoc = (v: number) => {
    setState(`${prefix}.loadpoint.${idx + 1}.control.limitSoc`, v);
  };

  const lpTitle = lp.title || `Ladepunkt ${idx + 1}`;
  const vehicleName = lp.vehicleTitle || 'Fahrzeug';

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {lp.connected ? (
          <PlugZap size={13} color="#6366f1" />
        ) : (
          <Plug size={13} color="var(--text-secondary)" />
        )}
        <span style={{ color: lp.connected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {lp.connected ? vehicleName : lpTitle}
        </span>
        {lp.vehicleSoc > 0 && (
          <span style={{ color: '#6366f1' }}>
            {fmtSoc(lp.vehicleSoc)}→{fmtSoc(lp.effectiveLimitSoc)}
          </span>
        )}
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
      {/* Header row */}
      <div className="flex items-center gap-2">
        {lp.connected ? (
          <PlugZap size={16} color="#6366f1" />
        ) : (
          <Plug size={16} color="var(--text-secondary)" />
        )}
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
          {lp.connected ? vehicleName : lpTitle}
        </span>

        {/* charging indicator */}
        {lp.charging && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#6366f1' }}>
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: '#6366f1' }}
            />
            Laden
          </span>
        )}

        {/* charge power */}
        {lp.chargePower > 0 && (
          <span className="text-xs font-bold" style={{ color: '#6366f1' }}>
            {fmtKW(lp.chargePower)}
          </span>
        )}
      </div>

      {/* SoC bar (only when connected) */}
      {lp.connected && lp.vehicleSoc > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-1">
              <Car size={11} />
              <span>{fmtSoc(lp.vehicleSoc)}</span>
              {lp.vehicleRange > 0 && <span>· {Math.round(lp.vehicleRange)} km</span>}
            </div>
            <div className="flex items-center gap-1">
              <span>Ziel:</span>
              <button
                className="font-semibold hover:opacity-80 transition-opacity"
                style={{ color: '#6366f1' }}
                onClick={() => setLimitSoc(Math.min(100, lp.effectiveLimitSoc + 10))}
                title="Ziel-SoC anpassen"
              >
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

      {/* Session info */}
      {lp.charging && (
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {lp.chargeDuration > 0 && (
            <span>{fmtDuration(lp.chargeDuration)}</span>
          )}
          {lp.chargedEnergy > 0 && (
            <span>{(lp.chargedEnergy / 1000).toFixed(2)} kWh</span>
          )}
          {lp.sessionPrice > 0 && (
            <span>{lp.sessionPrice.toFixed(2)} €</span>
          )}
          {lp.phasesActive > 0 && (
            <span>{lp.phasesActive}ϕ</span>
          )}
          {lp.planActive && lp.effectivePlanTime && (
            <span style={{ color: '#f59e0b' }}>
              📅 {new Date(lp.effectivePlanTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Mode buttons */}
      <div className="flex gap-1">
        {MODES.map((m) => {
          const active = lp.mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="flex-1 text-[11px] font-medium rounded-md transition-all duration-150 hover:opacity-90 active:scale-95"
              style={{
                minHeight: 28,
                background: active ? m.activeColor : 'var(--app-bg)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? m.activeColor : 'var(--app-border)'}`,
              }}
            >
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
  const { connected } = useIoBroker();
  const o = config.options ?? {};
  const prefix = (o.evccPrefix as string | undefined) ?? 'evcc.0';
  const loadpointCount = Math.max(1, Math.min(4, (o.loadpointCount as number | undefined) ?? 1));
  const showBattery = (o.showBattery as boolean | undefined) ?? true;

  const layout = config.layout ?? 'default';
  const compact = layout === 'compact' || layout === 'minimal';

  const { site, loadpoints } = useEvccData(prefix, loadpointCount);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <Zap size={24} strokeWidth={1.5} />
        <span className="text-xs">Keine Verbindung</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5 h-full justify-center px-1">
        <EnergyFlowRow site={site} showBattery={showBattery} compact />
        {loadpoints.map((lp, i) => (
          <LoadpointCard key={i} lp={lp} idx={i} prefix={prefix} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      {/* Energy overview */}
      <EnergyFlowRow site={site} showBattery={showBattery} compact={false} />

      {/* Loadpoints */}
      {loadpoints.map((lp, i) => (
        <LoadpointCard key={i} lp={lp} idx={i} prefix={prefix} compact={false} />
      ))}

      {/* tariff hint */}
      {site.tariffGrid > 0 && (
        <div className="text-[10px] text-right" style={{ color: 'var(--text-secondary)' }}>
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
  const o = config.options ?? {};
  const set = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const prefix = (o.evccPrefix as string | undefined) ?? 'evcc.0';
  const lpCount = (o.loadpointCount as number | undefined) ?? 1;
  const showBattery = (o.showBattery as boolean | undefined) ?? true;

  const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
  const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
  };

  return (
    <>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>evcc Präfix</label>
        <input
          type="text"
          value={prefix}
          onChange={(e) => set({ evccPrefix: e.target.value || 'evcc.0' })}
          placeholder="evcc.0"
          className={inputCls + ' font-mono'}
          style={inputStyle}
        />
      </div>

      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Ladepunkte</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => set({ loadpointCount: n })}
              className="flex-1 text-xs py-1.5 rounded-lg transition-all"
              style={{
                background: lpCount === n ? 'var(--accent)' : 'var(--app-bg)',
                color: lpCount === n ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${lpCount === n ? 'var(--accent)' : 'var(--app-border)'}`,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Batterie anzeigen</label>
        <button
          onClick={() => set({ showBattery: !showBattery })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: showBattery ? 'var(--accent)' : 'var(--app-border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showBattery ? '18px' : '2px' }}
          />
        </button>
      </div>
    </>
  );
}
