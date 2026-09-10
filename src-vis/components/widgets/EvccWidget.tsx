import { useState, useEffect, useCallback } from 'react';
import { Sun, Home, Zap, Battery, Car, Plug, PlugZap, Flame } from 'lucide-react';
import { useThemeEpoch } from '../../store/themeEpoch';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useIoBroker, getObjectViewDirect, getObjectDirect } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps, WidgetConfig, ioBrokerState } from '../../types';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';
import {
    ENERGY_ADAPTERS,
    ENERGY_SLOTS,
    SLOT_OPTION,
    instanceLabel,
    isEvccInstance,
    mapEnergyDatapoints,
    powerUnitFactor,
    type CandidateState,
    type EnergySlot,
} from '../../utils/energySources';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKW(w: number): string {
    if (w < 100) return `${(w / 1000).toFixed(2)} kW`;
    return `${(w / 1000).toFixed(1)} kW`;
}

function fmtDuration(ns: number): string {
    const s = Math.floor(ns / 1e9);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')} h`;
    return `${m}:${String(s % 60).padStart(2, '0')} min`;
}

function fmtSoc(v: number): string {
    return `${Math.round(v)}%`;
}

// Newer evcc adapters (or the "resolve nested nodes" option) no longer expose
// gridPower/batteryPower/batterySoc as flat number states — grid/battery arrive
// only as JSON objects like {"power":-9.2,...}. Extract the numeric power from a
// value that may be a plain number, a JSON object string, or a numeric string.
// Since adapter 0.2.9 the JSON keys are capitalized (`Power`), so accept both.
function parsePower(raw: unknown): number | null {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const str = String(raw).trim();
    if (str.startsWith('{')) {
        try {
            const o = JSON.parse(str) as { power?: number; Power?: number };
            const p = o.power ?? o.Power;
            return typeof p === 'number' ? p : null;
        } catch {
            return null;
        }
    }
    const n = parseFloat(str);
    return Number.isFinite(n) ? n : null;
}

// ── responsive container-size hook (ResizeObserver via callback ref) ──────────

// The node comes back as well: the layout branches below each mount their own
// box, and useCssFontScale has to read the variable off whichever one is live.
function useContainerSize() {
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 280, h: 220 });
    const [node, setNode] = useState<HTMLElement | null>(null);

    const ref = useCallback((n: HTMLElement | null) => setNode(n), []);

    useEffect(() => {
        if (!node) return;
        const ro = new ResizeObserver((entries) => {
            const e = entries[0];
            if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(node);
        return () => ro.disconnect();
    }, [node]);

    return [ref, size, node] as const;
}

// ── data sources present in this ioBroker ─────────────────────────────────────
// The high sentinel getObjectView ranges end on, as `getObjectViewDirect` uses it.
const KEY_END = '\u9999';

export interface EnergyInstance {
    /** Adapter instance as the widget addresses it, e.g. "sma.0". */
    instance: string;
    enabled: boolean;
    /** evcc is driveable by prefix alone; everything else needs its datapoints found. */
    evcc: boolean;
}

/**
 * The instances the config panel can offer as a data source.
 *
 * `null` while the round-trip is still out — the panel then shows nothing rather
 * than flashing "none found" at every open. An empty array is a real answer: this
 * ioBroker runs no energy adapter we recognise, and the datapoints have to be
 * picked by hand.
 *
 * One query for all instances, filtered here: a query per candidate adapter would
 * be twenty round-trips for a list that is usually two entries long.
 */
function useEnergyInstances(): EnergyInstance[] | null {
    const [instances, setInstances] = useState<EnergyInstance[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        const known = new Set(ENERGY_ADAPTERS.map((a) => a.name));
        getObjectViewDirect('instance', 'system.adapter.', `system.adapter.${KEY_END}`)
            .then((res) => {
                if (cancelled) return;
                const found: EnergyInstance[] = (res.rows ?? [])
                    .filter((row) => /^system\.adapter\.[^.]+\.\d+$/.test(String(row.id ?? '')))
                    .map((row) => ({
                        id: String(row.id).slice('system.adapter.'.length),
                        enabled: (row.value as { common?: { enabled?: boolean } })?.common?.enabled !== false,
                    }))
                    .filter(({ id }) => known.has(id.replace(/\.\d+$/, '')))
                    .map(({ id, enabled }) => ({
                        instance: id,
                        // A stopped adapter publishes nothing, so it is worth saying out
                        // loud before the user wonders why the diagram is empty.
                        enabled,
                        evcc: isEvccInstance(id),
                    }))
                    // evcc first (it can do the most), then alphabetical.
                    .sort(
                        (a, b) =>
                            Number(b.evcc) - Number(a.evcc) ||
                            a.instance.localeCompare(b.instance, 'en', { numeric: true }),
                    );
                setInstances(found);
            })
            .catch(() => {
                if (!cancelled) setInstances([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return instances;
}

/**
 * Every numeric state an instance publishes, in the shape the scoring wants.
 *
 * One object-view range query over the instance. Adapters with thousands of states
 * exist, so the result is filtered down to numbers here rather than carried around.
 */
async function readInstanceStates(instance: string): Promise<CandidateState[]> {
    const res = await getObjectViewDirect('state', `${instance}.`, `${instance}.${KEY_END}`);
    return (res.rows ?? [])
        .filter((row) => String(row.id ?? '').startsWith(`${instance}.`))
        .map((row) => {
            const common = (row.value as { common?: Record<string, unknown> })?.common ?? {};
            const name = common.name;
            return {
                id: String(row.id),
                role: typeof common.role === 'string' ? common.role : undefined,
                unit: typeof common.unit === 'string' ? common.unit : undefined,
                type: typeof common.type === 'string' ? common.type : undefined,
                name: typeof name === 'string' ? name : undefined,
                read: typeof common.read === 'boolean' ? common.read : undefined,
                min: typeof common.min === 'number' ? common.min : undefined,
                max: typeof common.max === 'number' ? common.max : undefined,
            };
        })
        .filter((c) => c.type === undefined || c.type === 'number');
}

// ── unit normalisation ────────────────────────────────────────────────────────

/**
 * What to multiply this datapoint's value by to get watts.
 *
 * Everything downstream — the formatting, and the 10 W "is anything flowing"
 * threshold — is in watts, but adapters publish kW just as happily. Read from the
 * object's own `common.unit`, so it is right for a hand-typed datapoint too and
 * needs no extra setting. Objects are cached in the socket layer, so this is one
 * round-trip per datapoint per session.
 */
function usePowerFactor(id: string): number {
    const [factor, setFactor] = useState(1);

    useEffect(() => {
        if (!id) {
            setFactor(1);
            return;
        }
        let cancelled = false;
        getObjectDirect(id)
            .then((obj) => {
                if (cancelled) return;
                setFactor(powerUnitFactor(obj?.common?.unit));
            })
            .catch(() => {
                if (!cancelled) setFactor(1);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    return factor;
}

// ── the global font scale, as a number ────────────────────────────────────────

/**
 * `--font-scale` as it applies at `node`.
 *
 * The widget sizes itself in inline pixels, so it is invisible to the Tailwind
 * text-* rules through which every other widget picks the scale up. Reading the
 * computed variable instead also covers the per-layout and per-section overrides
 * App.tsx writes into a scoped <style> — and the theme epoch is what tells us the
 * variables in the DOM have changed (see store/themeEpoch).
 */
function useCssFontScale(node: HTMLElement | null): number {
    const epoch = useThemeEpoch();
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (!node) return;
        const raw = parseFloat(getComputedStyle(node).getPropertyValue('--font-scale'));
        const next = Number.isFinite(raw) && raw > 0 ? raw : 1;
        setScale((prev) => (prev === next ? prev : next));
    }, [node, epoch]);

    return scale;
}

/** Sentinel for the "type the evcc prefix myself" entry of the source dropdown. */
const CUSTOM_PREFIX = '__custom__';
/** Sentinel for "I pick the datapoints myself". */
const MANUAL_SOURCE = '__manual__';

const MODE_MAP: Record<string, number> = { off: 0, pv: 1, minpv: 2, now: 3 };
const MODES: { key: string; label: string; activeColor: string }[] = [
    { key: 'off', label: 'AUS', activeColor: '#6b7280' },
    { key: 'pv', label: 'PV', activeColor: '#f59e0b' },
    { key: 'minpv', label: 'MIN+PV', activeColor: '#f97316' },
    { key: 'now', label: 'SOFORT', activeColor: '#ef4444' },
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
    featureHeating: boolean;
}

const DEFAULT_SITE: SiteState = {
    pvPower: 0,
    gridPower: 0,
    homePower: 0,
    batteryPower: 0,
    batterySoc: 0,
    batteryMode: '',
    greenShareHome: 0,
    greenShareLoadpoints: 0,
    tariffGrid: 0,
};

const DEFAULT_LP: LoadpointState = {
    chargePower: 0,
    chargedEnergy: 0,
    charging: false,
    connected: false,
    mode: 'off',
    vehicleTitle: '',
    vehicleSoc: 0,
    vehicleRange: 0,
    effectiveLimitSoc: 80,
    sessionSolarPercentage: 0,
    sessionPrice: 0,
    planActive: false,
    effectivePlanTime: '',
    chargeDuration: 0,
    phasesActive: 0,
    title: '',
    featureHeating: false,
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

        // No instance configured: the widget is running off free datapoints, so
        // there is nothing to subscribe to here (and `.status.pvPower` without a
        // prefix would be a bogus id).
        if (!prefix) return;

        const cleanups: (() => void)[] = [];

        const sitePoints: [string, keyof SiteState][] = [
            ['pvPower', 'pvPower'],
            ['gridPower', 'gridPower'],
            ['homePower', 'homePower'],
            ['batteryPower', 'batteryPower'],
            ['batterySoc', 'batterySoc'],
            ['batteryMode', 'batteryMode'],
            ['greenShareHome', 'greenShareHome'],
            ['greenShareLoadpoints', 'greenShareLoadpoints'],
            ['tariffGrid', 'tariffGrid'],
        ];

        for (const [dp, key] of sitePoints) {
            const id = `${prefix}.status.${dp}`;
            const cb = (s: ioBrokerState) => updateSite(key, s.val);
            cleanups.push(subscribe(id, cb));
            getState(id).then((s) => {
                if (s) updateSite(key, s.val);
            });
        }

        for (let n = 1; n <= loadpointCount; n++) {
            const idx = n - 1;
            const base = `${prefix}.loadpoint.${n}.status`;
            const lpPoints: [string, keyof LoadpointState][] = [
                ['chargePower', 'chargePower'],
                ['chargedEnergy', 'chargedEnergy'],
                ['charging', 'charging'],
                ['connected', 'connected'],
                ['mode', 'mode'],
                ['vehicleTitle', 'vehicleTitle'],
                ['vehicleSoc', 'vehicleSoc'],
                ['vehicleRange', 'vehicleRange'],
                ['effectiveLimitSoc', 'effectiveLimitSoc'],
                ['sessionSolarPercentage', 'sessionSolarPercentage'],
                ['sessionPrice', 'sessionPrice'],
                ['planActive', 'planActive'],
                ['effectivePlanTime', 'effectivePlanTime'],
                ['chargeDuration', 'chargeDuration'],
                ['phasesActive', 'phasesActive'],
                ['title', 'title'],
                ['chargerFeatureHeating', 'featureHeating'],
            ];
            for (const [dp, key] of lpPoints) {
                const id = `${base}.${dp}`;
                const cb = (s: ioBrokerState) => updateLp(idx, key, s.val);
                cleanups.push(subscribe(id, cb));
                getState(id).then((s) => {
                    if (s) updateLp(idx, key, s.val);
                });
            }
        }

        return () => cleanups.forEach((fn) => fn());
    }, [prefix, loadpointCount, subscribe, getState, updateSite, updateLp]);

    return { site, loadpoints };
}

// ── Animated flow arrow (horizontal, CSS-based) ───────────────────────────────

function FlowArrow({
    active,
    color,
    reverse = false,
    power = 0,
    scale = 1,
}: {
    active: boolean;
    color: string;
    reverse?: boolean;
    power?: number;
    scale?: number;
}) {
    const dur = active ? Math.max(0.5, 2.5 - power / 5000) : 2;
    const h = 16 * scale;
    const dot = 9 * scale;
    const line = Math.max(1, 1.5 * scale);
    return (
        <div className="flex-1 relative flex items-center" style={{ height: h, overflow: 'hidden' }}>
            <div
                className="w-full"
                style={{ height: line, background: active ? color : 'var(--app-border)', opacity: 0.45 }}
            />
            {active && (
                <div
                    style={{
                        position: 'absolute',
                        width: dot,
                        height: dot,
                        borderRadius: '50%',
                        background: color,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        animation: `${reverse ? 'evcc-r' : 'evcc-f'} ${dur}s linear infinite`,
                    }}
                />
            )}
        </div>
    );
}

// ── Animated flow arrow (vertical, SVG-based) ─────────────────────────────────

function VertFlowArrow({
    active,
    color,
    power = 0,
    down = true,
    scale = 1,
}: {
    active: boolean;
    color: string;
    power?: number;
    down?: boolean;
    scale?: number;
}) {
    const dur = active ? Math.max(0.5, 2.5 - power / 5000) : 2;
    const H = 24 * scale;
    const W = 10 * scale;
    const cx = W / 2;
    const path = down ? `M ${cx} 0 L ${cx} ${H}` : `M ${cx} ${H} L ${cx} 0`;
    return (
        <svg width={W} height={H} style={{ overflow: 'visible' }}>
            <line
                x1={cx}
                y1={0}
                x2={cx}
                y2={H}
                stroke={active ? color : 'var(--app-border)'}
                strokeWidth={Math.max(1, 1.5 * scale)}
                strokeOpacity={0.45}
            />
            {active && (
                <circle r={4.5 * scale} fill={color} opacity={0.9}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
                </circle>
            )}
        </svg>
    );
}

// ── Energy flow row (default/card layout) ─────────────────────────────────────

function EnergyFlowRow({ site, showBattery, scale = 1 }: { site: SiteState; showBattery: boolean; scale?: number }) {
    const t = useT();
    const hasSolar = site.pvPower > 10;
    const gridImport = site.gridPower > 10;
    const gridExport = site.gridPower < -10;
    const battCharge = site.batteryPower < -10;
    const battDisch = site.batteryPower > 10;
    const battActive = battCharge || battDisch;
    const gridColor = gridImport ? '#ef4444' : gridExport ? '#10b981' : 'var(--text-secondary)';
    const battColor = battCharge ? '#3b82f6' : '#f59e0b';

    const colW = 58 * scale;
    const iconSz = Math.max(10, Math.round(16 * scale));
    const valFs = 12 * scale;
    const labelFs = 9 * scale;
    const battFs = 12 * scale;
    const battSub = 10 * scale;
    const battIc = Math.max(10, Math.round(13 * scale));

    return (
        <div className="flex flex-col">
            <style>{`
        @keyframes evcc-f { 0%{left:-6px} 100%{left:calc(100% + 3px)} }
        @keyframes evcc-r { 0%{left:calc(100% + 3px)} 100%{left:-6px} }
      `}</style>

            <div className="flex items-center">
                <div className="flex flex-col items-center" style={{ width: colW, gap: 2 * scale }}>
                    <Sun size={iconSz} color="#f59e0b" />
                    <span className="font-semibold tabular-nums" style={{ color: '#f59e0b', fontSize: valFs }}>
                        {fmtKW(site.pvPower)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: labelFs }}>{t('evcc.solar')}</span>
                </div>

                <FlowArrow active={hasSolar} color="#f59e0b" power={site.pvPower} scale={scale} />

                <div className="flex flex-col items-center" style={{ width: colW, gap: 2 * scale }}>
                    <Home size={iconSz} color="var(--text-secondary)" />
                    <span
                        className="font-semibold tabular-nums"
                        style={{ color: 'var(--text-primary)', fontSize: valFs }}
                    >
                        {fmtKW(site.homePower)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: labelFs }}>{t('evcc.house')}</span>
                </div>

                <FlowArrow
                    active={gridImport || gridExport}
                    color={gridColor}
                    reverse={gridImport}
                    power={Math.abs(site.gridPower)}
                    scale={scale}
                />

                <div className="flex flex-col items-center" style={{ width: colW, gap: 2 * scale }}>
                    <Zap size={iconSz} color={gridColor} />
                    <span className="font-semibold tabular-nums" style={{ color: gridColor, fontSize: valFs }}>
                        {fmtKW(Math.abs(site.gridPower))}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: labelFs }}>
                        {gridImport ? t('evcc.grid') : gridExport ? t('evcc.feedIn') : t('evcc.gridLabel')}
                    </span>
                </div>
            </div>

            {showBattery && (
                <div className="flex flex-col items-center">
                    <VertFlowArrow
                        active={battActive}
                        color={battColor}
                        power={Math.abs(site.batteryPower)}
                        down={battCharge}
                        scale={scale}
                    />
                    <div
                        className="flex items-center rounded-xl"
                        style={{
                            background: `${battColor}18`,
                            border: `1px solid ${battColor}44`,
                            gap: 6 * scale,
                            paddingLeft: 12 * scale,
                            paddingRight: 12 * scale,
                            paddingTop: 4 * scale,
                            paddingBottom: 4 * scale,
                        }}
                    >
                        <Battery size={battIc} color={battColor} />
                        <span className="font-bold tabular-nums" style={{ color: battColor, fontSize: battFs }}>
                            {fmtSoc(site.batterySoc)}
                        </span>
                        {site.batteryPower !== 0 && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: battSub }}>
                                · {fmtKW(Math.abs(site.batteryPower))}
                            </span>
                        )}
                        {site.batteryMode && site.batteryMode !== 'normal' && site.batteryMode !== 'unknown' && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: battSub }}>
                                · {site.batteryMode}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Energy flow SVG (flow layout only) ───────────────────────────────────────

function FlowPath({
    x1,
    y1,
    x2,
    y2,
    active,
    color,
    reverse = false,
    power = 0,
}: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    active: boolean;
    color: string;
    reverse?: boolean;
    power?: number;
}) {
    const dur = active ? Math.max(0.6, 2.0 - power / 5000) : 2;
    const fwd = `M ${x1} ${y1} L ${x2} ${y2}`;
    const rev = `M ${x2} ${y2} L ${x1} ${y1}`;
    const animPath = reverse ? rev : fwd;
    return (
        <g>
            <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={active ? color : 'var(--app-border)'}
                strokeWidth={active ? 2 : 1.5}
                strokeOpacity={active ? 0.25 : 0.4}
            />
            {active &&
                [0, 0.35, 0.7].map((offset, i) => (
                    <circle key={i} r={2.8} fill={color} opacity={0.9}>
                        <animateMotion
                            dur={`${dur}s`}
                            begin={`${-offset * dur}s`}
                            repeatCount="indefinite"
                            path={animPath}
                        />
                    </circle>
                ))}
        </g>
    );
}

function EnergyFlowSVG({
    site,
    loadpoints,
    showBattery,
    visibleLpIndices,
}: {
    site: SiteState;
    loadpoints: LoadpointState[];
    showBattery: boolean;
    visibleLpIndices: number[];
}) {
    const t = useT();
    const hasSolar = site.pvPower > 10;
    const gridImport = site.gridPower > 10;
    const gridExport = site.gridPower < -10;
    const battCharge = site.batteryPower < -10;
    const battDisch = site.batteryPower > 10;
    const visLps = visibleLpIndices.map((i) => loadpoints[i]).filter(Boolean);
    const chargingLps = visLps.filter((lp) => lp.chargePower > 10);
    const gridColor = gridImport ? '#ef4444' : gridExport ? '#10b981' : 'var(--text-secondary)';
    const battColor = battCharge ? '#3b82f6' : '#f59e0b';
    const cx = 110,
        cy = 75,
        sx = 35,
        sy = 35,
        gx = 185,
        gy = 35,
        bx = 35,
        by = 140;
    const lpPositions = visLps.map((_, i) => ({ x: 185, y: showBattery ? 105 + i * 40 : 120 + i * 35 }));

    return (
        <svg viewBox="0 0 220 170" className="w-full h-full" style={{ overflow: 'visible' }}>
            <FlowPath x1={sx} y1={sy} x2={cx} y2={cy} active={hasSolar} color="#f59e0b" power={site.pvPower} />
            <FlowPath
                x1={gx}
                y1={gy}
                x2={cx}
                y2={cy}
                active={gridImport}
                color="#ef4444"
                power={Math.abs(site.gridPower)}
            />
            <FlowPath
                x1={gx}
                y1={gy}
                x2={cx}
                y2={cy}
                active={gridExport}
                color="#10b981"
                reverse
                power={Math.abs(site.gridPower)}
            />
            {showBattery && (
                <>
                    <FlowPath
                        x1={bx}
                        y1={by}
                        x2={cx}
                        y2={cy}
                        active={battDisch}
                        color="#f59e0b"
                        power={Math.abs(site.batteryPower)}
                    />
                    <FlowPath
                        x1={bx}
                        y1={by}
                        x2={cx}
                        y2={cy}
                        active={battCharge}
                        color="#3b82f6"
                        reverse
                        power={Math.abs(site.batteryPower)}
                    />
                </>
            )}
            {lpPositions.map((pos, i) => (
                <FlowPath
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={pos.x}
                    y2={pos.y}
                    active={chargingLps.includes(visLps[i])}
                    color={visLps[i].featureHeating ? '#f97316' : '#6366f1'}
                    power={visLps[i].chargePower}
                />
            ))}
            <circle cx={sx} cy={sy} r={18} fill="#f59e0b22" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={sx} y={sy + 5} textAnchor="middle" fontSize={14}>
                ☀️
            </text>
            <text x={sx} y={sy + 26} textAnchor="middle" fontSize={8} fill="#f59e0b" fontWeight="bold">
                {hasSolar ? fmtKW(site.pvPower) : '–'}
            </text>
            <text x={sx} y={sy + 35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">
                {t('evcc.solar')}
            </text>
            <circle cx={gx} cy={gy} r={18} fill={`${gridColor}22`} stroke={gridColor} strokeWidth={1.5} />
            <text x={gx} y={gy + 5} textAnchor="middle" fontSize={13}>
                ⚡
            </text>
            <text x={gx} y={gy + 26} textAnchor="middle" fontSize={8} fill={gridColor} fontWeight="bold">
                {fmtKW(Math.abs(site.gridPower))}
            </text>
            <text x={gx} y={gy + 35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">
                {gridImport ? t('evcc.grid') : gridExport ? t('evcc.feedIn') : t('evcc.gridLabel')}
            </text>
            <circle cx={cx} cy={cy} r={22} fill="var(--app-surface)" stroke="var(--app-border)" strokeWidth={2} />
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize={15}>
                🏠
            </text>
            <text x={cx} y={cy + 20} textAnchor="middle" fontSize={8} fill="var(--text-primary)" fontWeight="bold">
                {fmtKW(site.homePower)}
            </text>
            <text x={cx} y={cy + 30} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">
                {t('evcc.house')}
            </text>
            {showBattery && (
                <>
                    <circle cx={bx} cy={by} r={18} fill={`${battColor}22`} stroke={battColor} strokeWidth={1.5} />
                    <text x={bx} y={by + 5} textAnchor="middle" fontSize={13}>
                        🔋
                    </text>
                    <text x={bx} y={by + 26} textAnchor="middle" fontSize={8} fill={battColor} fontWeight="bold">
                        {fmtSoc(site.batterySoc)}
                    </text>
                    <text x={bx} y={by + 35} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">
                        {site.batteryPower !== 0 ? fmtKW(Math.abs(site.batteryPower)) : '–'}
                    </text>
                </>
            )}
            {lpPositions.map((pos, i) => {
                const lp = visLps[i];
                const isCharging = lp.chargePower > 10;
                const isConnected = lp.connected;
                const isHeat = lp.featureHeating;
                const baseColor = isHeat ? '#f97316' : '#6366f1';
                const color = isCharging
                    ? baseColor
                    : isConnected
                      ? isHeat
                          ? '#fb923c'
                          : '#818cf8'
                      : 'var(--text-secondary)';
                return (
                    <g key={i}>
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={16}
                            fill={`${isConnected || isHeat ? baseColor : 'var(--app-border)'}22`}
                            stroke={color}
                            strokeWidth={1.5}
                        />
                        <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={12}>
                            {isHeat ? '🔥' : isConnected ? '🚗' : '🔌'}
                        </text>
                        <text x={pos.x} y={pos.y + 24} textAnchor="middle" fontSize={8} fill={color} fontWeight="bold">
                            {isCharging
                                ? fmtKW(lp.chargePower)
                                : !isHeat && lp.vehicleSoc > 0
                                  ? fmtSoc(lp.vehicleSoc)
                                  : '–'}
                        </text>
                        {isCharging && (
                            <circle cx={pos.x + 11} cy={pos.y - 11} r={3} fill={baseColor}>
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

function CompactRow({ site, showBattery, scale = 1 }: { site: SiteState; showBattery: boolean; scale?: number }) {
    const gridColor = site.gridPower > 0 ? '#ef4444' : site.gridPower < 0 ? '#10b981' : 'var(--text-secondary)';
    const battColor = site.batteryPower < 0 ? '#3b82f6' : '#f59e0b';
    const fs = 12 * scale;
    const dotFs = 9 * scale;
    return (
        <div className="flex items-center flex-wrap" style={{ gap: 8 * scale, fontSize: fs }}>
            <span className="flex items-center gap-1 font-medium" style={{ color: '#f59e0b' }}>
                ☀️ {fmtKW(site.pvPower)}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: dotFs }}>·</span>
            <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                🏠 {fmtKW(site.homePower)}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: dotFs }}>·</span>
            <span className="flex items-center gap-1 font-medium" style={{ color: gridColor }}>
                ⚡ {fmtKW(Math.abs(site.gridPower))}
            </span>
            {showBattery && (
                <>
                    <span style={{ color: 'var(--text-secondary)', fontSize: dotFs }}>·</span>
                    <span className="flex items-center gap-1 font-medium" style={{ color: battColor }}>
                        🔋 {fmtSoc(site.batterySoc)}
                    </span>
                </>
            )}
        </div>
    );
}

// ── Battery-only view ─────────────────────────────────────────────────────────

function BatteryView({ site, scale = 1 }: { site: SiteState; scale?: number }) {
    const battCharge = site.batteryPower < -10;
    const battDisch = site.batteryPower > 10;
    const battColor = battCharge ? '#3b82f6' : battDisch ? '#f59e0b' : '#10b981';
    const soc = Math.max(0, Math.min(100, site.batterySoc));

    const iconFs = 36 * scale;
    const barH = 20 * scale;
    const barW = 140 * scale;
    const socFs = 11 * scale;
    const valFs = 14 * scale;
    const modeFs = 10 * scale;

    return (
        <div className="flex flex-col items-center justify-center h-full" style={{ gap: 12 * scale }}>
            <div style={{ fontSize: iconFs, lineHeight: 1 }}>🔋</div>
            <div style={{ width: '100%', maxWidth: barW }}>
                <div
                    className="relative rounded-full overflow-hidden"
                    style={{ height: barH, background: 'var(--app-border)' }}
                >
                    <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                        style={{ width: `${soc}%`, background: battColor }}
                    />
                    <span
                        className="absolute inset-0 flex items-center justify-center font-bold"
                        style={{ color: '#fff', textShadow: '0 1px 2px #0005', fontSize: socFs }}
                    >
                        {fmtSoc(soc)}
                    </span>
                </div>
            </div>
            {site.batteryPower !== 0 && (
                <div className="font-semibold" style={{ color: battColor, fontSize: valFs }}>
                    {battCharge ? '↓ ' : battDisch ? '↑ ' : ''}
                    {fmtKW(Math.abs(site.batteryPower))}
                </div>
            )}
            {site.batteryMode && site.batteryMode !== 'normal' && site.batteryMode !== 'unknown' && (
                <div style={{ color: 'var(--text-secondary)', fontSize: modeFs }}>{site.batteryMode}</div>
            )}
        </div>
    );
}

// ── Production-only view ──────────────────────────────────────────────────────

function ProductionView({ site, scale = 1 }: { site: SiteState; scale?: number }) {
    const feedIn = site.gridPower < -10;
    const feedInW = Math.abs(Math.min(0, site.gridPower));
    const iconFs = 30 * scale;
    const valFs = 30 * scale;
    const subFs = 12 * scale;
    const greenFs = 10 * scale;

    return (
        <div className="flex flex-col items-center justify-center h-full" style={{ gap: 8 * scale }}>
            <div style={{ fontSize: iconFs, lineHeight: 1 }}>☀️</div>
            <div className="font-black" style={{ color: '#f59e0b', fontSize: valFs, lineHeight: 1 }}>
                {fmtKW(site.pvPower)}
            </div>
            {feedIn && (
                <div className="flex items-center gap-1" style={{ color: '#10b981', fontSize: subFs }}>
                    <span>↗</span>
                    <span>{fmtKW(feedInW)} Einspeisung</span>
                </div>
            )}
            {site.greenShareHome > 0 && (
                <div style={{ color: '#10b981', fontSize: greenFs }}>
                    🌿 {Math.round(site.greenShareHome * 100)}% Eigenanteil
                </div>
            )}
        </div>
    );
}

// ── Consumption-only view ─────────────────────────────────────────────────────

function ConsumptionView({ site, scale = 1 }: { site: SiteState; scale?: number }) {
    const gridImport = site.gridPower > 10;
    const gridColor = gridImport ? '#ef4444' : '#10b981';
    const iconFs = 30 * scale;
    const valFs = 30 * scale;
    const subFs = 12 * scale;
    const tariffFs = 10 * scale;
    return (
        <div className="flex flex-col items-center justify-center h-full" style={{ gap: 8 * scale }}>
            <div style={{ fontSize: iconFs, lineHeight: 1 }}>🏠</div>
            <div className="font-black" style={{ color: 'var(--text-primary)', fontSize: valFs, lineHeight: 1 }}>
                {fmtKW(site.homePower)}
            </div>
            <div className="flex items-center gap-1" style={{ color: gridColor, fontSize: subFs }}>
                <span>{gridImport ? '↓ Bezug' : '↑ Einspeisung'}</span>
                <span className="font-semibold">{fmtKW(Math.abs(site.gridPower))}</span>
            </div>
            {site.tariffGrid > 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: tariffFs }}>
                    {site.tariffGrid.toFixed(4)} €/kWh
                </div>
            )}
        </div>
    );
}

// ── SocBar ────────────────────────────────────────────────────────────────────

function SocBar({
    current,
    target,
    color,
    scale = 1,
}: {
    current: number;
    target: number;
    color: string;
    scale?: number;
}) {
    return (
        <div
            className="relative rounded-full overflow-hidden"
            style={{ height: 8 * scale, background: 'var(--app-border)' }}
        >
            <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, current)}%`, background: color }}
            />
            {target > 0 && target < 100 && (
                <div
                    className="absolute top-0 h-full"
                    style={{
                        left: `${target}%`,
                        width: Math.max(1, 2 * scale),
                        background: 'var(--text-primary)',
                        opacity: 0.6,
                    }}
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
    scale = 1,
}: {
    lp: LoadpointState;
    idx: number;
    prefix: string;
    compact: boolean;
    scale?: number;
}) {
    const t = useT();
    const { setState } = useIoBroker();

    const [pendingMode, setPendingMode] = useState<string | null>(null);
    const [pendingLimitSoc, setPendingLimitSoc] = useState<number | null>(null);

    useEffect(() => {
        if (pendingMode !== null && lp.mode === pendingMode) setPendingMode(null);
    }, [lp.mode, pendingMode]);

    useEffect(() => {
        if (pendingLimitSoc !== null && lp.effectiveLimitSoc === pendingLimitSoc) setPendingLimitSoc(null);
    }, [lp.effectiveLimitSoc, pendingLimitSoc]);

    useEffect(() => {
        if (pendingMode === null) return;
        const id = setTimeout(() => setPendingMode(null), 35000);
        return () => clearTimeout(id);
    }, [pendingMode]);

    useEffect(() => {
        if (pendingLimitSoc === null) return;
        const id = setTimeout(() => setPendingLimitSoc(null), 35000);
        return () => clearTimeout(id);
    }, [pendingLimitSoc]);

    const setMode = (modeKey: string) => {
        setPendingMode(modeKey);
        setState(`${prefix}.loadpoint.${idx + 1}.control.pvControl`, MODE_MAP[modeKey]);
    };
    const setLimitSoc = (v: number) => {
        setPendingLimitSoc(v);
        setState(`${prefix}.loadpoint.${idx + 1}.control.limitSoc`, v);
    };

    const displayMode = pendingMode ?? lp.mode;
    const displayLimitSoc = pendingLimitSoc ?? lp.effectiveLimitSoc;

    const lpTitle = lp.title || t('evcc.loadpoint', { n: idx + 1 });
    const vehicleName = lp.vehicleTitle || lpTitle;

    const isHeating = lp.featureHeating;
    const accent = isHeating ? '#f97316' : '#6366f1';

    if (compact) {
        const HeadIcon = isHeating ? Flame : lp.connected ? PlugZap : Plug;
        const headColor = isHeating ? accent : lp.connected ? accent : 'var(--text-secondary)';
        const fs = 12 * scale;
        const dot = Math.max(4, 6 * scale);
        return (
            <div className="flex items-center flex-wrap" style={{ gap: 8 * scale, fontSize: fs }}>
                <HeadIcon size={Math.max(10, Math.round(13 * scale))} color={headColor} />
                <span style={{ color: isHeating || lp.connected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {isHeating ? lpTitle : lp.connected ? vehicleName : lpTitle}
                </span>
                {!isHeating && lp.vehicleSoc > 0 && (
                    <span style={{ color: accent }}>
                        {fmtSoc(lp.vehicleSoc)}→{fmtSoc(lp.effectiveLimitSoc)}
                    </span>
                )}
                {lp.charging && (
                    <span className="flex items-center gap-1" style={{ color: accent }}>
                        <span
                            className="inline-block rounded-full animate-pulse"
                            style={{ background: accent, width: dot, height: dot }}
                        />
                        {fmtKW(lp.chargePower)}
                    </span>
                )}
                <span
                    className="ml-auto font-medium flex items-center gap-1"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {pendingMode !== null && (
                        <span
                            className="inline-block rounded-full animate-pulse"
                            style={{ background: 'var(--text-secondary)', width: dot, height: dot }}
                        />
                    )}
                    {MODES.find((m) => m.key === displayMode)?.label ?? displayMode}
                </span>
            </div>
        );
    }

    const HeadIcon = isHeating ? Flame : lp.connected ? PlugZap : Plug;
    const headColor = isHeating ? accent : lp.connected ? accent : 'var(--text-secondary)';
    const titleFs = 14 * scale;
    const labelFs = 11 * scale;
    const subFs = 11 * scale;
    const valFs = 12 * scale;
    const headIcSz = Math.max(12, Math.round(16 * scale));
    const carIcSz = Math.max(8, Math.round(11 * scale));
    const minBtnH = 28 * scale;
    const modeFs = 11 * scale;
    const chargeDot = Math.max(5, 8 * scale);
    const pendingDot = Math.max(4, 6 * scale);

    return (
        <div
            className="border-t"
            style={{
                borderColor: 'var(--app-border)',
                paddingTop: 8 * scale,
                display: 'flex',
                flexDirection: 'column',
                gap: 8 * scale,
            }}
        >
            <div className="flex items-center" style={{ gap: 8 * scale }}>
                <HeadIcon size={headIcSz} color={headColor} />
                <span
                    className="font-semibold flex-1 truncate"
                    style={{ color: 'var(--text-primary)', fontSize: titleFs }}
                >
                    {isHeating ? lpTitle : lp.connected ? vehicleName : lpTitle}
                </span>
                {lp.charging && (
                    <span className="flex items-center gap-1" style={{ color: accent, fontSize: valFs }}>
                        <span
                            className="inline-block rounded-full animate-pulse"
                            style={{ background: accent, width: chargeDot, height: chargeDot }}
                        />
                        {t(isHeating ? 'evcc.heating' : 'evcc.charging')}
                    </span>
                )}
                {lp.chargePower > 0 && (
                    <span className="font-bold" style={{ color: accent, fontSize: valFs }}>
                        {fmtKW(lp.chargePower)}
                    </span>
                )}
            </div>

            {!isHeating && lp.connected && lp.vehicleSoc > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * scale }}>
                    <div
                        className="flex items-center justify-between"
                        style={{ color: 'var(--text-secondary)', fontSize: labelFs }}
                    >
                        <div className="flex items-center gap-1">
                            <Car size={carIcSz} />
                            <span>{fmtSoc(lp.vehicleSoc)}</span>
                            {lp.vehicleRange > 0 && <span>· {Math.round(lp.vehicleRange)} km</span>}
                        </div>
                        <div className="flex items-center gap-1">
                            <span>{t('evcc.targetSoc')}</span>
                            <button
                                className="font-semibold hover:opacity-80 flex items-center gap-0.5"
                                style={{ color: '#6366f1' }}
                                onClick={() => setLimitSoc(Math.min(100, displayLimitSoc + 10))}
                            >
                                {pendingLimitSoc !== null && (
                                    <span
                                        className="inline-block rounded-full animate-pulse"
                                        style={{ background: '#6366f1', width: pendingDot, height: pendingDot }}
                                    />
                                )}
                                {fmtSoc(displayLimitSoc)}
                            </button>
                            {lp.sessionSolarPercentage > 0 && (
                                <span style={{ color: '#10b981' }}>· 🌿 {Math.round(lp.sessionSolarPercentage)}%</span>
                            )}
                        </div>
                    </div>
                    <SocBar current={lp.vehicleSoc} target={lp.effectiveLimitSoc} color="#6366f1" scale={scale} />
                </div>
            )}

            {lp.charging && (
                <div
                    className="flex items-center"
                    style={{ color: 'var(--text-secondary)', gap: 12 * scale, fontSize: subFs }}
                >
                    {lp.chargeDuration > 0 && <span>{fmtDuration(lp.chargeDuration)}</span>}
                    {lp.chargedEnergy > 0 && <span>{(lp.chargedEnergy / 1000).toFixed(2)} kWh</span>}
                    {lp.sessionPrice > 0 && <span>{lp.sessionPrice.toFixed(2)} €</span>}
                    {lp.phasesActive > 0 && <span>{lp.phasesActive}ϕ</span>}
                    {lp.planActive && lp.effectivePlanTime && (
                        <span style={{ color: '#f59e0b' }}>
                            📅{' '}
                            {new Date(lp.effectivePlanTime).toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    )}
                </div>
            )}

            <div className="flex" style={{ gap: 4 * scale }}>
                {MODES.map((m) => {
                    const active = displayMode === m.key;
                    const pending = active && pendingMode !== null;
                    return (
                        <button
                            key={m.key}
                            onClick={() => setMode(m.key)}
                            className="flex-1 font-medium rounded-md transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-1"
                            style={{
                                minHeight: minBtnH,
                                fontSize: modeFs,
                                background: active ? m.activeColor : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? m.activeColor : 'var(--app-border)'}`,
                                opacity: pending ? 0.75 : 1,
                            }}
                        >
                            {pending && (
                                <span
                                    className="inline-block rounded-full animate-pulse bg-white"
                                    style={{ width: pendingDot, height: pendingDot }}
                                />
                            )}
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
    // `??`, not `||`: an EMPTY prefix is a deliberate state — the widget then runs
    // purely off the datapoints configured below, with no evcc instance at all.
    // Only an unset option falls back, which is what a freshly added widget has.
    const prefix = ((o.evccPrefix as string) ?? 'evcc.0').trim();
    const loadpointCount = Math.max(1, Math.min(8, (o.loadpointCount as number) ?? 1));
    const showBattery = (o.showBattery as boolean) ?? true;
    const showLoadpoints = (o.showLoadpoints as boolean) ?? true;
    const layout = config.layout ?? 'default';
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Zap);

    // ── responsive sizing ─────────────────────────────────────────────────────
    // Everything below is measured against scale 1, and scale 1 is deliberately the
    // size of every other widget: a 12 px title next to a 20 px icon, 14/12/11 px in
    // the loadpoint card. So the automatic scaling only ever SHRINKS — down to
    // `autoScaleMin` for a tile too narrow for the three flow columns (3 × 58 px plus
    // the arrows ≈ REF_W). It used to run up to 2.2×, which made a freshly added
    // widget (12 columns, and 2.2× at full width) tower over its neighbours; growing
    // is now the user's decision, via the scale sliders or a raised `autoScaleMax`.
    const [boxRef, boxSize, boxNode] = useContainerSize();
    const autoScaleEnabled = o.autoScale !== false;
    const REF_W = 280;
    const autoMin = (o.autoScaleMin as number) ?? 0.6;
    const autoMax = (o.autoScaleMax as number) ?? 1;
    const autoScale = autoScaleEnabled ? Math.max(autoMin, Math.min(autoMax, boxSize.w / REF_W)) : 1;
    // Every size here is an inline pixel value, so the Tailwind text-* rules that
    // carry --font-scale for the other widgets never reach it. Read the variable off
    // our own box instead — that picks up a layout- or section-scoped override too.
    const fontScale = useCssFontScale(boxNode);
    const globalScale = ((o.sizeScale as number) ?? 1) * fontScale;
    const headerScale = ((o.headerScale as number) ?? 1) * autoScale * globalScale;
    const flowScale = ((o.flowScale as number) ?? 1) * autoScale * globalScale;
    const lpScale = ((o.loadpointScale as number) ?? 1) * autoScale * globalScale;
    const mainScale = ((o.mainScale as number) ?? 1) * autoScale * globalScale;
    const tariffScale = ((o.tariffScale as number) ?? 1) * autoScale * globalScale;

    // ── Which loadpoints to show (0-based indices); default = all ────────────
    const visibleLpIndices: number[] = (() => {
        const raw = o.visibleLoadpoints as number[] | undefined;
        if (raw && raw.length > 0) return raw;
        return Array.from({ length: loadpointCount }, (_, i) => i);
    })();

    // ── Battery datapoints (manual override) ──────────────────────────────────
    const batterySocDp = (o.batterySocDatapoint as string) ?? '';
    const batteryPowerDp = (o.batteryPowerDatapoint as string) ?? '';
    const effectiveBattDp = batterySocDp || (prefix ? `${prefix}.status.battery` : '');

    const { value: extSoc } = useDatapoint(effectiveBattDp);
    const { value: extPower } = useDatapoint(batteryPowerDp);
    const battPowerFactor = usePowerFactor(batteryPowerDp);

    // Grid power fallback chain — the evcc adapter reshaped the grid states
    // several times:
    //   • `status.gridPower`      flat number (old adapters, read in useEvccData)
    //   • `status.grid`           JSON object {"power":…} (resolved nodes off)
    //   • `status.Grid.power`     resolved nodes, adapter ≤ 0.2.8
    //   • `status.Grid.Power`     resolved nodes, adapter ≥ 0.2.9 (issue #516)
    // First source with a finite number wins; a manual datapoint beats them all.
    const gridPowerDp = (o.gridPowerDatapoint as string) ?? '';
    const { value: gridManual } = useDatapoint(gridPowerDp);
    // Production and house consumption, same override mechanism as grid and battery.
    // With all five set the widget needs no evcc instance at all (#629).
    const pvPowerDp = (o.pvPowerDatapoint as string) ?? '';
    const homePowerDp = (o.homePowerDatapoint as string) ?? '';
    const { value: pvManual } = useDatapoint(pvPowerDp);
    const { value: homeManual } = useDatapoint(homePowerDp);
    // Adapters publish W or kW as they please, so normalise by the datapoint's own
    // unit — without it a 4.2 kW reading renders as "0.00 kW" and the flow line
    // stays dead, which looks exactly like a wrong datapoint.
    const pvFactor = usePowerFactor(pvPowerDp);
    const homeFactor = usePowerFactor(homePowerDp);
    const gridFactor = usePowerFactor(gridPowerDp);
    const pvRaw = pvPowerDp ? parsePower(pvManual) : null;
    const homeRaw = homePowerDp ? parsePower(homeManual) : null;
    const pvPowerOverride = pvRaw != null ? pvRaw * pvFactor : null;
    const homePowerOverride = homeRaw != null ? homeRaw * homeFactor : null;
    const { value: gridRaw } = useDatapoint(prefix ? `${prefix}.status.grid` : '');
    const { value: gridNodeUpper } = useDatapoint(prefix ? `${prefix}.status.Grid.Power` : '');
    const { value: gridNodeLower } = useDatapoint(prefix ? `${prefix}.status.Grid.power` : '');
    const gridManualW = (() => {
        const raw = gridPowerDp ? parsePower(gridManual) : null;
        return raw != null ? raw * gridFactor : null;
    })();
    const gridPowerOverride =
        gridManualW ?? parsePower(gridNodeUpper) ?? parsePower(gridNodeLower) ?? parsePower(gridRaw);

    const { site: rawSite, loadpoints } = useEvccData(prefix, loadpointCount);

    const batteryJson = (() => {
        if (!effectiveBattDp || extSoc == null) return null;
        const str = String(extSoc).trim();
        if (!str.startsWith('{')) return null;
        try {
            return JSON.parse(str) as { soc?: number; power?: number };
        } catch {
            return null;
        }
    })();

    const site: SiteState = {
        ...rawSite,
        ...(pvPowerOverride != null ? { pvPower: pvPowerOverride } : {}),
        ...(homePowerOverride != null ? { homePower: homePowerOverride } : {}),
        ...(gridPowerOverride != null ? { gridPower: gridPowerOverride } : {}),
        ...(batteryJson
            ? {
                  ...(batteryJson.soc != null ? { batterySoc: batteryJson.soc } : {}),
                  ...(batteryJson.power != null ? { batteryPower: batteryJson.power } : {}),
              }
            : {
                  ...(effectiveBattDp && extSoc != null ? { batterySoc: parseFloat(String(extSoc)) } : {}),
                  ...(batteryPowerDp && extPower != null
                      ? { batteryPower: parseFloat(String(extPower)) * battPowerFactor }
                      : {}),
              }),
    };

    // ── shared header element ────────────────────────────────────────────────
    const headerIcon = Math.max(10, Math.round(((o.iconSize as number) || 20) * headerScale));
    const headerFs = 12 * headerScale;
    const headerEl =
        showTitle || showIcon ? (
            <div className="flex items-center shrink-0 min-w-0" style={{ gap: 6 * headerScale }}>
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={headerIcon}
                        style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                    />
                )}
                {showTitle && (
                    <p
                        className="aura-widget-title truncate flex-1 min-w-0"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                            fontSize: headerFs,
                        }}
                    >
                        {config.title}
                    </p>
                )}
            </div>
        ) : null;

    if (!connected) {
        return (
            <div ref={boxRef} className="aura-widget-row flex flex-col h-full">
                {headerEl && <div style={{ marginBottom: 4 * headerScale }}>{headerEl}</div>}
                <div
                    className="flex flex-col items-center justify-center flex-1"
                    style={{ color: 'var(--text-secondary)', gap: 8 * mainScale }}
                >
                    <Zap size={Math.max(16, Math.round(24 * mainScale))} strokeWidth={1.5} />
                    <span style={{ fontSize: 12 * mainScale }}>{t('evcc.noConnection')}</span>
                </div>
            </div>
        );
    }

    const visLps = showLoadpoints
        ? visibleLpIndices.map((i) => ({ lp: loadpoints[i], idx: i })).filter(({ lp }) => !!lp)
        : [];
    const flowLpIndices = showLoadpoints ? visibleLpIndices : [];

    if (layout === 'custom')
        return (
            <div ref={boxRef} className="w-full h-full">
                <CustomGridView
                    config={config}
                    value={fmtKW(site.pvPower)}
                    extraFields={{
                        pvPower: fmtKW(site.pvPower),
                        gridPower: fmtKW(Math.abs(site.gridPower)),
                        homePower: fmtKW(site.homePower),
                        batterySoc: fmtSoc(site.batterySoc),
                        batteryPower: fmtKW(Math.abs(site.batteryPower)),
                        gridImport: site.gridPower > 10 ? 'Ja' : 'Nein',
                        gridExport: site.gridPower < -10 ? 'Ja' : 'Nein',
                    }}
                />
            </div>
        );

    if (layout === 'battery')
        return (
            <div ref={boxRef} className="aura-widget-row flex flex-col h-full">
                {headerEl && <div style={{ marginBottom: 4 * headerScale }}>{headerEl}</div>}
                <div className="flex-1 min-h-0">
                    <BatteryView site={site} scale={mainScale} />
                </div>
            </div>
        );

    if (layout === 'production')
        return (
            <div ref={boxRef} className="aura-widget-row flex flex-col h-full">
                {headerEl && <div style={{ marginBottom: 4 * headerScale }}>{headerEl}</div>}
                <div className="flex-1 min-h-0">
                    <ProductionView site={site} scale={mainScale} />
                </div>
            </div>
        );

    if (layout === 'consumption')
        return (
            <div ref={boxRef} className="aura-widget-row flex flex-col h-full">
                {headerEl && <div style={{ marginBottom: 4 * headerScale }}>{headerEl}</div>}
                <div className="flex-1 min-h-0">
                    <ConsumptionView site={site} scale={mainScale} />
                </div>
            </div>
        );

    if (layout === 'loadpoints') {
        return (
            <div
                ref={boxRef}
                className="aura-widget-row aura-scroll flex flex-col h-full overflow-auto"
                style={{ gap: 8 * lpScale }}
            >
                {headerEl}
                {visLps.map(({ lp, idx }) => (
                    <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} scale={lpScale} />
                ))}
            </div>
        );
    }

    if (layout === 'compact') {
        return (
            <div
                ref={boxRef}
                className="aura-widget-row flex flex-col h-full justify-center px-1"
                style={{ gap: 6 * mainScale }}
            >
                {headerEl}
                <CompactRow site={site} showBattery={showBattery} scale={mainScale} />
                {visLps.map(({ lp, idx }) => (
                    <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact scale={lpScale} />
                ))}
            </div>
        );
    }

    if (layout === 'flow') {
        const flowH = (showBattery ? 190 : 160) * flowScale;
        return (
            <div
                ref={boxRef}
                className="aura-widget-row aura-scroll flex flex-col h-full overflow-auto"
                style={{ gap: 8 * lpScale }}
            >
                {headerEl}
                <div className="shrink-0" style={{ height: flowH }}>
                    <EnergyFlowSVG
                        site={site}
                        loadpoints={loadpoints}
                        showBattery={showBattery}
                        visibleLpIndices={flowLpIndices}
                    />
                </div>
                {visLps.map(({ lp, idx }) => (
                    <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} scale={lpScale} />
                ))}
            </div>
        );
    }

    // ── Layout: default / card ────────────────────────────────────────────────
    return (
        <div
            ref={boxRef}
            className="aura-widget-row aura-scroll flex flex-col h-full overflow-auto"
            style={{ gap: 8 * lpScale }}
        >
            {headerEl}
            <div className="shrink-0">
                <EnergyFlowRow site={site} showBattery={showBattery} scale={flowScale} />
            </div>

            {visLps.map(({ lp, idx }) => (
                <LoadpointCard key={idx} lp={lp} idx={idx} prefix={prefix} compact={false} scale={lpScale} />
            ))}

            {site.tariffGrid > 0 && (
                <div
                    className="text-right shrink-0"
                    style={{ color: 'var(--text-secondary)', fontSize: 10 * tariffScale }}
                >
                    {site.tariffGrid.toFixed(4)} €/kWh
                </div>
            )}
        </div>
    );
}

// ── EvccConfig ────────────────────────────────────────────────────────────────

/**
 * One free datapoint that overrides whatever the data source delivers for that value.
 *
 * Deliberately a module-level component, not one built inside EvccConfig: an inline
 * component gets a fresh identity on every render, so React tears the <input> down
 * and rebuilds it on each keystroke — the field loses focus and only the first
 * character ever arrives.
 */
function DpField({
    label,
    hint,
    optionKey,
    placeholder,
    value,
    onChange,
    className,
    style,
}: {
    label: string;
    hint?: string;
    optionKey: string;
    placeholder: string;
    value: string;
    onChange: (v: string | undefined) => void;
    className: string;
    style: React.CSSProperties;
}) {
    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {label} {hint && <span style={{ opacity: 0.6 }}>{hint}</span>}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value || undefined)}
                placeholder={placeholder}
                className={`aura-evcc-dp-${optionKey} ${className} font-mono`}
                style={style}
            />
        </div>
    );
}

export function EvccConfig({
    config,
    onConfigChange,
}: {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    // Empty is a legitimate state here: the field is being retyped. `??` (not `||`)
    // so a cleared field stays cleared while the user types the new prefix.
    const prefix = (o.evccPrefix as string) ?? 'evcc.0';
    const instances = useEnergyInstances();
    // Which entry of the source dropdown is current. An evcc prefix wins; failing
    // that the instance we auto-mapped from; failing that, hand-picked datapoints.
    const sourceAdapter = (o.sourceAdapter as string) ?? '';
    const selectedSource = prefix || sourceAdapter || MANUAL_SOURCE;
    const onKnownInstance = !!instances?.some((i) => i.instance === selectedSource);
    const [scanning, setScanning] = useState(false);
    // An empty prefix means both "manual" and "about to type a prefix by hand", so
    // the dropdown choice cannot be derived from the options alone.
    const [typingPrefix, setTypingPrefix] = useState(false);
    const [scanReport, setScanReport] = useState<{
        instance: string;
        found: EnergySlot[];
        missing: EnergySlot[];
    } | null>(null);

    /**
     * Point the widget at `instance`: for evcc that is just the prefix, for anything
     * else we read what the instance publishes and fill the five datapoint fields
     * with the best match. The result is a suggestion sitting in visible fields —
     * the user sees exactly what was picked and can correct any of it.
     */
    const pickSource = async (value: string) => {
        setScanReport(null);
        setTypingPrefix(value === CUSTOM_PREFIX);
        if (value === MANUAL_SOURCE || value === CUSTOM_PREFIX) {
            set({ evccPrefix: '', sourceAdapter: undefined });
            return;
        }
        if (isEvccInstance(value)) {
            set({ evccPrefix: value, sourceAdapter: undefined });
            return;
        }
        setScanning(true);
        try {
            const states = await readInstanceStates(value);
            const found = mapEnergyDatapoints(states);
            const patch: Record<string, unknown> = { evccPrefix: '', sourceAdapter: value };
            for (const slot of ENERGY_SLOTS) patch[SLOT_OPTION[slot]] = found[slot]?.id;
            set(patch);
            setScanReport({
                instance: value,
                found: ENERGY_SLOTS.filter((slot) => found[slot]),
                missing: ENERGY_SLOTS.filter((slot) => !found[slot]),
            });
        } finally {
            setScanning(false);
        }
    };
    const lpCount = (o.loadpointCount as number) ?? 1;
    const showBattery = (o.showBattery as boolean) ?? true;
    const showLoadpoints = (o.showLoadpoints as boolean) ?? true;
    const visibleLps = (o.visibleLoadpoints as number[]) ?? [];

    const autoScale = o.autoScale !== false;
    const sizeScale = (o.sizeScale as number) ?? 1;
    const headerScale = (o.headerScale as number) ?? 1;
    const flowScale = (o.flowScale as number) ?? 1;
    const loadpointScale = (o.loadpointScale as number) ?? 1;
    const mainScale = (o.mainScale as number) ?? 1;
    const tariffScale = (o.tariffScale as number) ?? 1;

    const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
    const inputSty: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    const toggleLp = (idx: number) => {
        const all = Array.from({ length: lpCount }, (_, i) => i);
        const current = visibleLps.length > 0 ? visibleLps : all;
        const next = current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx].sort();
        set({ visibleLoadpoints: next.length === lpCount ? [] : next });
    };

    const all = Array.from({ length: lpCount }, (_, i) => i);
    const effectiveVisible = visibleLps.length > 0 ? visibleLps : all;

    const ScaleSlider = ({ label, k, val }: { label: string; k: string; val: number }) => (
        <div>
            <label
                className="text-[11px] mb-1 flex items-center justify-between"
                style={{ color: 'var(--text-secondary)' }}
            >
                <span>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{val.toFixed(2)}×</span>
            </label>
            <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={val}
                onChange={(e) => set({ [k]: Number(e.target.value) })}
                className="w-full"
            />
        </div>
    );

    return (
        <>
            <div>
                <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {t('evcc.sourceSection')}
                </div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('evcc.sourceLabel')}
                </label>
                {instances !== null && (
                    <select
                        value={
                            onKnownInstance ? selectedSource : prefix || typingPrefix ? CUSTOM_PREFIX : MANUAL_SOURCE
                        }
                        onChange={(e) => void pickSource(e.target.value)}
                        className={`aura-evcc-instance ${inputCls} mb-1`}
                        style={inputSty}
                    >
                        {instances.map((inst) => (
                            <option key={inst.instance} value={inst.instance}>
                                {instanceLabel(inst.instance)}
                                {inst.enabled ? '' : ` ${t('evcc.instanceDisabled')}`}
                            </option>
                        ))}
                        {/* An evcc instance that was renamed, or one on another host. */}
                        <option value={CUSTOM_PREFIX}>{t('evcc.instanceCustom')}</option>
                        <option value={MANUAL_SOURCE}>{t('evcc.sourceManual')}</option>
                    </select>
                )}
                {/* The prefix field appears only for the evcc-by-hand case; picking
                    datapoints yourself is the "manual" entry, which needs no prefix. */}
                {(instances === null || (!onKnownInstance && (prefix !== '' || typingPrefix))) && (
                    <input
                        type="text"
                        value={prefix}
                        // No `|| 'evcc.0'` here — that snapped the field back the moment
                        // it was cleared, and the next keystrokes landed BEHIND the old
                        // value ("evcc.0fronius.0"). The fallback belongs where the value
                        // is read, not where it is typed.
                        //
                        // `setTypingPrefix` keeps the field on screen: an empty prefix
                        // otherwise reads as "manual", and the field would unmount from
                        // under the cursor at the moment it was cleared.
                        onChange={(e) => {
                            setTypingPrefix(true);
                            set({ evccPrefix: e.target.value });
                        }}
                        placeholder="evcc.0"
                        className={`aura-evcc-prefix ${inputCls} font-mono`}
                        style={inputSty}
                    />
                )}
                {instances !== null && instances.length === 0 && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {t('evcc.sourceNone')}
                    </p>
                )}
                {scanning && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {t('evcc.scanning')}
                    </p>
                )}
                {scanReport && !scanning && (
                    <p className="aura-evcc-scan-report text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {t('evcc.scanFound', {
                            n: String(scanReport.found.length),
                            total: String(ENERGY_SLOTS.length),
                        })}
                        {scanReport.missing.length > 0 &&
                            ` ${t('evcc.scanMissing', {
                                slots: scanReport.missing.map((slot) => t(`evcc.slot.${slot}` as never)).join(', '),
                            })}`}
                    </p>
                )}
                {sourceAdapter && !scanning && (
                    <button
                        onClick={() => void pickSource(sourceAdapter)}
                        className="aura-evcc-rescan text-[10px] mt-1 underline"
                        style={{ color: 'var(--accent)' }}
                    >
                        {t('evcc.scanAgain')}
                    </button>
                )}
            </div>

            {/* Above the datapoint list on purpose: it gates the two battery rows in it. */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('evcc.showBattery')}
                </label>
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

            {/* ── Free datapoints ──────────────────────────────────────────────
                Every value the flow diagram draws can come from a datapoint of the
                user's choosing instead of the instance above. Filled in completely,
                the widget runs without evcc — that is what makes it a PV widget
                rather than an evcc widget (#629). */}
            <div className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {t('evcc.dpSection')}
                </div>
                <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('evcc.dpSectionHint')}
                </p>
                <div className="space-y-2">
                    <DpField
                        label={t('evcc.pvPowerDp')}
                        hint={t('evcc.unitWatt')}
                        optionKey="pvPowerDatapoint"
                        placeholder="z.B. sma.0.pv.power"
                        value={(o.pvPowerDatapoint as string) ?? ''}
                        onChange={(v) => set({ pvPowerDatapoint: v })}
                        className={inputCls}
                        style={inputSty}
                    />
                    <DpField
                        label={t('evcc.homePowerDp')}
                        hint={t('evcc.unitWatt')}
                        optionKey="homePowerDatapoint"
                        placeholder="z.B. shelly.0.em.power"
                        value={(o.homePowerDatapoint as string) ?? ''}
                        onChange={(v) => set({ homePowerDatapoint: v })}
                        className={inputCls}
                        style={inputSty}
                    />
                    <DpField
                        label={t('evcc.gridPowerDp')}
                        hint={t('evcc.gridPowerDpHint')}
                        optionKey="gridPowerDatapoint"
                        placeholder="z.B. sma.0.grid.power"
                        value={(o.gridPowerDatapoint as string) ?? ''}
                        onChange={(v) => set({ gridPowerDatapoint: v })}
                        className={inputCls}
                        style={inputSty}
                    />
                    {showBattery && (
                        <>
                            <DpField
                                label={t('evcc.batterySocDp')}
                                hint={t('evcc.batterySocDpHint')}
                                optionKey="batterySocDatapoint"
                                placeholder="z.B. sma.0.battery.soc"
                                value={(o.batterySocDatapoint as string) ?? ''}
                                onChange={(v) => set({ batterySocDatapoint: v })}
                                className={inputCls}
                                style={inputSty}
                            />
                            <DpField
                                label={t('evcc.batteryPowerDp')}
                                hint={t('evcc.batteryPowerDpHint')}
                                optionKey="batteryPowerDatapoint"
                                placeholder="z.B. sma.0.battery.power"
                                value={(o.batteryPowerDatapoint as string) ?? ''}
                                onChange={(v) => set({ batteryPowerDatapoint: v })}
                                className={inputCls}
                                style={inputSty}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Loadpoints are the one part that is genuinely evcc-only: they are read
                from `<prefix>.loadpoint.N.status.*` and written back to `control.*`,
                paths no other adapter has. The heading says so. */}
            <div className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {t('evcc.loadpointSection')}
                </div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('evcc.loadpointsTotal')}
                </label>
                <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <button
                            key={n}
                            onClick={() => set({ loadpointCount: n, visibleLoadpoints: [] })}
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
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('evcc.showLoadpoints')}
                </label>
                <button
                    onClick={() => set({ showLoadpoints: !showLoadpoints })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: showLoadpoints ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: showLoadpoints ? '18px' : '2px' }}
                    />
                </button>
            </div>

            {showLoadpoints && lpCount > 1 && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('evcc.loadpointsShown')}
                    </label>
                    <div className="flex flex-wrap gap-1">
                        {all.map((idx) => {
                            const active = effectiveVisible.includes(idx);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => toggleLp(idx)}
                                    className="text-xs px-2 py-1 rounded-lg transition-all"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    LP {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Responsive / Größe ───────────────────────────────────────────── */}
            <div className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Größe & Skalierung
                </div>

                <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Auto-Skalierung <span style={{ opacity: 0.6 }}>(schrumpft bei schmalem Widget)</span>
                    </label>
                    <button
                        onClick={() => set({ autoScale: !autoScale })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: autoScale ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: autoScale ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                <div className="space-y-2">
                    <ScaleSlider label="Global" k="sizeScale" val={sizeScale} />
                    <ScaleSlider label="Header" k="headerScale" val={headerScale} />
                    <ScaleSlider label="Energiefluss" k="flowScale" val={flowScale} />
                    <ScaleSlider label="Ladepunkte" k="loadpointScale" val={loadpointScale} />
                    <ScaleSlider
                        label="Haupt-Bereich (Akku/Erzeugung/Verbrauch/Kompakt)"
                        k="mainScale"
                        val={mainScale}
                    />
                    <ScaleSlider label="Tarif-Zeile" k="tariffScale" val={tariffScale} />
                </div>
            </div>
        </>
    );
}
