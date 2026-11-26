import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BatteryMedium, Car, Flame, Home, Sun, UtilityPole } from 'lucide-react';
import { useT } from '../../i18n';

/**
 * evcc-style energy bar (layout `bar` of the energy-flow widget): one horizontal
 * bar split into where the power comes from, with brackets above for the sources
 * ("In") and below for the consumers ("Out"). Modelled on evcc's own energy view
 * and on the HTML version a user built for an Aura HTML widget (forum post
 * 1363168, "Energiebalken v3.6") — same parts, same colours, but fed straight from
 * the widget's site values instead of a script writing JSON into a datapoint.
 */

export interface EnergyBarConsumer {
    key: string;
    label: string;
    icon: 'car' | 'heat';
    w: number;
}

export interface EnergyBarProps {
    /** PV production, W. */
    pv: number;
    /** Grid, W: positive = import, negative = feed-in. */
    grid: number;
    /** House consumption without the loadpoints (evcc's homePower), W. */
    home: number;
    /** Battery, W: positive = discharging, negative = charging. */
    battery: number;
    /** Battery state of charge in %, null = none. */
    soc: number | null;
    /** Battery column on the right (SoC icon). */
    showBattery: boolean;
    /** Loadpoints with their own bracket below. */
    consumers: EnergyBarConsumer[];
    fmt: (w: number) => string;
    scale?: number;
}

// Colours of the forum version (evcc look). Text and lines follow the theme.
const COL = {
    battery: '#3b82f6',
    pv: '#22c55e',
    export: '#eab308',
    grid: '#9ca3af',
    low: '#ef4444',
};
const ON_DARK = '#ffffff';
const ON_LIGHT = '#1d1b20';

const MIN_W = 20; // smaller flows are hidden
const EXPORT_MIN_W = 50; // a few watts of feed-in are measurement noise
const HYSTERESIS = 0.8; // visible until HYSTERESIS × threshold
const LABEL_MIN_PCT = 7; // value inside a bar segment only from this share on
const SOC_LOW = 15;
const GLIDE_MS = 1000;

type Icon = 'pv' | 'grid' | 'home' | 'battery' | 'car' | 'heat';

interface Part {
    key: string;
    /** Fixed rank in its row, keeps the order stable while parts come and go. */
    r: number;
    label: string;
    w: number;
    icon?: Icon;
    color?: string;
}

interface Shown extends Part {
    /** Share of the total, %. */
    a: number;
    leaving?: boolean;
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Text colour with the better WCAG contrast on a segment colour. */
function textOn(hex: string): string {
    const l = luminance(hex);
    const dark = (l + 0.05) / (luminance(ON_LIGHT) + 0.05);
    const light = 1.05 / (l + 0.05);
    return light > dark ? ON_DARK : ON_LIGHT;
}

function IconFor({ icon, size }: { icon?: Icon; size: number }) {
    const p = { size, strokeWidth: 1.7, style: { display: 'block', flex: 'none' } as CSSProperties };
    switch (icon) {
        case 'pv':
            return <Sun {...p} />;
        case 'grid':
            return <UtilityPole {...p} />;
        case 'home':
            return <Home {...p} />;
        case 'battery':
            return <BatteryMedium {...p} />;
        case 'car':
            return <Car {...p} />;
        case 'heat':
            return <Flame {...p} />;
        default:
            return null;
    }
}

/**
 * Keeps parts that just dropped out for one glide, at share 0, so they shrink
 * away instead of vanishing — and the neighbours slide over instead of jumping.
 */
function useLingering(parts: Shown[]): Shown[] {
    const [gone, setGone] = useState<Record<string, Shown>>({});
    const last = useRef<Record<string, Shown>>({});

    useEffect(() => {
        const now: Record<string, Shown> = {};
        parts.forEach((p) => (now[p.key] = p));
        const dropped: Record<string, Shown> = {};
        Object.values(last.current).forEach((p) => {
            if (!now[p.key] && !p.leaving) dropped[p.key] = { ...p, a: 0, leaving: true };
        });
        last.current = now;
        const keys = Object.keys(dropped);
        if (keys.length === 0) {
            // a part that came back no longer lingers
            setGone((g) => {
                const hit = Object.keys(g).filter((k) => now[k]);
                if (!hit.length) return g;
                const next = { ...g };
                hit.forEach((k) => delete next[k]);
                return next;
            });
            return;
        }
        setGone((g) => {
            const next = { ...g, ...dropped };
            Object.keys(next).forEach((k) => now[k] && delete next[k]);
            return next;
        });
        const timer = setTimeout(() => {
            setGone((g) => {
                const next = { ...g };
                keys.forEach((k) => delete next[k]);
                return next;
            });
        }, GLIDE_MS + 100);
        return () => clearTimeout(timer);
    }, [parts]);

    return useMemo(() => {
        const keys = new Set(parts.map((p) => p.key));
        return [...parts, ...Object.values(gone).filter((p) => !keys.has(p.key))].sort((x, y) => x.r - y.r);
    }, [parts, gone]);
}

/** A flex item that grows out of 0 when it first appears. */
function Grow({
    basis,
    className,
    style,
    title,
    children,
}: {
    basis: number;
    className: string;
    style?: CSSProperties;
    title?: string;
    children?: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const target = el.style.flexBasis;
        el.style.flexBasis = '0%';
        void el.offsetWidth;
        el.style.flexBasis = target;
    }, []);
    return (
        <div ref={ref} className={className} style={{ ...style, flexBasis: `${basis}%` }} title={title}>
            {children}
        </div>
    );
}

function useWidth(): [(n: HTMLDivElement | null) => void, number, HTMLDivElement | null] {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const [w, setW] = useState(0);
    const ref = useCallback((n: HTMLDivElement | null) => setNode(n), []);
    useEffect(() => {
        if (!node) return;
        setW(node.clientWidth);
        const ro = new ResizeObserver(() => setW(node.clientWidth));
        ro.observe(node);
        return () => ro.disconnect();
    }, [node]);
    return [ref, w, node];
}

let canvas: HTMLCanvasElement | null = null;
function textWidth(text: string, px: number, family: string, weight = 400): number {
    if (!text) return 0;
    canvas ??= document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return text.length * px * 0.6;
    ctx.font = `${weight} ${px}px ${family}`;
    return ctx.measureText(text).width;
}

/** One row of brackets (sources above, consumers below the bar). */
function BracketRow({
    parts,
    side,
    s,
    fmt,
}: {
    parts: Shown[];
    side: 'top' | 'bottom';
    s: number;
    fmt: (w: number) => string;
}) {
    const [ref, W, node] = useWidth();
    const family = node ? getComputedStyle(node).fontFamily : 'system-ui';
    const iconSz = Math.round(18 * s);
    const smallIcon = Math.round(14 * s);
    const valFs = 12 * s;
    const outFs = 11 * s;

    // Where each bracket ends up (after the glide), and whether its label fits.
    let x = 0;
    const taken: [number, number][] = [];
    const tight: { p: Shown; mid: number }[] = [];
    const inside: Record<string, boolean> = {};
    parts.forEach((p) => {
        const px = (W * p.a) / 100;
        const mid = x + px / 2;
        x += px;
        if (p.leaving) return;
        const iw = iconSz + 4 * s + textWidth(fmt(p.w), valFs, family) + 12 * s;
        if (px >= iw + 12) {
            inside[p.key] = true;
            taken.push([mid - iw / 2, mid + iw / 2]);
        } else tight.push({ p, mid });
    });
    // Does not fit: above (top) / below (bottom) the bracket line, value first,
    // icon only if that overlaps, nothing if even that does.
    const outside: { p: Shown; left: number; withValue: boolean }[] = [];
    tight.forEach(({ p, mid }) => {
        const full = smallIcon + 3 * s + textWidth(fmt(p.w), outFs, family);
        for (const [b, withValue] of [
            [full, true],
            [smallIcon, false],
        ] as [number, boolean][]) {
            const left = Math.max(0, Math.min(W - b, mid - b / 2));
            if (!taken.some(([l, r]) => left < r + 6 && left + b > l - 6)) {
                taken.push([left, left + b]);
                outside.push({ p, left, withValue });
                return;
            }
        }
    });

    const h = 30 * s;
    return (
        <div ref={ref} className={`aura-ebar-row aura-ebar-${side}`} style={{ height: h }}>
            {parts.map((p) => (
                <Grow
                    key={p.key}
                    basis={p.a}
                    className="aura-ebar-k aura-ebar-glide"
                    style={{ height: h }}
                    title={`${p.label}: ${fmt(p.w)}`}
                >
                    <div
                        className="aura-ebar-st l"
                        style={{ height: 12 * s, marginTop: (side === 'top' ? 15 : 3) * s }}
                    />
                    {inside[p.key] && (
                        <div
                            className="aura-ebar-inh"
                            style={{ marginTop: 6 * s, height: 18 * s, padding: `0 ${6 * s}px`, gap: 4 * s }}
                        >
                            <IconFor icon={p.icon} size={iconSz} />
                            <span style={{ fontSize: valFs, color: 'var(--text-secondary)' }}>{fmt(p.w)}</span>
                        </div>
                    )}
                    <div
                        className="aura-ebar-st r"
                        style={{ height: 12 * s, marginTop: (side === 'top' ? 15 : 3) * s }}
                    />
                </Grow>
            ))}
            {outside.map(({ p, left, withValue }) => (
                <div
                    key={p.key}
                    className="aura-ebar-out"
                    style={{ left, top: side === 'top' ? 0 : 16 * s, height: 14 * s, gap: 3 * s }}
                    title={`${p.label}: ${fmt(p.w)}`}
                >
                    <IconFor icon={p.icon} size={smallIcon} />
                    {withValue && <span style={{ fontSize: outFs, color: 'var(--text-secondary)' }}>{fmt(p.w)}</span>}
                </div>
            ))}
        </div>
    );
}

function BarSegments({
    parts,
    s,
    fmt,
    empty,
}: {
    parts: Shown[];
    s: number;
    fmt: (w: number) => string;
    empty: string | null;
}) {
    const [ref, W, node] = useWidth();
    const family = node ? getComputedStyle(node).fontFamily : 'system-ui';
    const fs = 14 * s;
    return (
        <div ref={ref} className="aura-ebar-bar" style={{ height: 40 * s, borderRadius: 12 * s }}>
            {parts.map((p) => {
                const text = fmt(p.w);
                const fits =
                    !p.leaving && p.a >= LABEL_MIN_PCT && (W * p.a) / 100 >= textWidth(text, fs, family, 500) + 8;
                return (
                    <Grow
                        key={p.key}
                        basis={p.a}
                        className="aura-ebar-sg aura-ebar-glide"
                        style={{ backgroundColor: p.color, color: textOn(p.color ?? COL.grid) }}
                        title={`${p.label}: ${text}`}
                    >
                        {fits && <span style={{ fontSize: fs, fontWeight: 500 }}>{text}</span>}
                    </Grow>
                );
            })}
            {empty && (
                <div className="aura-ebar-empty" style={{ fontSize: 14 * s }}>
                    {empty}
                </div>
            )}
        </div>
    );
}

function BatteryColumn({ soc, s }: { soc: number | null; s: number }) {
    const t = useT();
    const has = soc != null && Number.isFinite(soc);
    const p = has ? Math.max(0, Math.min(100, soc)) : 0;
    const vertical = (text: string) => (
        <div
            style={{
                writingMode: 'vertical-rl',
                fontSize: 12 * s,
                color: 'var(--text-secondary)',
                letterSpacing: '.05em',
                height: 30 * s,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {text}
        </div>
    );
    const sz = Math.round(22 * s);
    return (
        <div className="flex flex-col items-center shrink-0">
            {vertical(t('evcc.bar.in'))}
            <div
                className="flex flex-col items-center justify-center"
                style={{ height: 40 * s, padding: `0 ${3 * s}px`, gap: 1, color: 'var(--text-primary)' }}
                title={`${t('evcc.bar.battery')}${has ? ` ${Math.round(p)} %` : ''}`}
            >
                <svg
                    width={sz}
                    height={sz}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ display: 'block', flex: 'none' }}
                >
                    <rect
                        className="aura-ebar-fill"
                        x={8.6}
                        y={7.1}
                        width={6.8}
                        height={11.8}
                        rx={1}
                        stroke="none"
                        fill={has && p < SOC_LOW ? COL.low : COL.battery}
                        style={{ transform: `scaleY(${p / 100})` }}
                    />
                    <rect x={6.5} y={4.8} width={11} height={16.4} rx={2.2} />
                    <path d="M10 2.5h4" />
                </svg>
                {has && (
                    <span
                        className="aura-ebar-soc tabular-nums"
                        style={{ fontSize: 11 * s, color: 'var(--text-secondary)' }}
                    >
                        {Math.round(p)}%
                    </span>
                )}
            </div>
            {vertical(t('evcc.bar.out'))}
        </div>
    );
}

const STYLE = `
.aura-ebar-row{display:flex;position:relative}
.aura-ebar-k{flex:0 0 0%;min-width:0;display:flex;align-items:flex-start;overflow:hidden}
.aura-ebar-st{flex:1 1 0;min-width:0;box-sizing:border-box}
.aura-ebar-st.l{margin-left:2px}.aura-ebar-st.r{margin-right:2px}
.aura-ebar-top .aura-ebar-st{border-top:var(--aura-ebar-line)}
.aura-ebar-top .aura-ebar-st.l{border-left:var(--aura-ebar-line);border-radius:8px 0 0 0}
.aura-ebar-top .aura-ebar-st.r{border-right:var(--aura-ebar-line);border-radius:0 8px 0 0}
.aura-ebar-bottom .aura-ebar-st{border-bottom:var(--aura-ebar-line)}
.aura-ebar-bottom .aura-ebar-st.l{border-left:var(--aura-ebar-line);border-radius:0 0 0 8px}
.aura-ebar-bottom .aura-ebar-st.r{border-right:var(--aura-ebar-line);border-radius:0 0 8px 0}
.aura-ebar-inh{flex:none;display:flex;align-items:center;white-space:nowrap;color:var(--text-primary)}
.aura-ebar-out{position:absolute;display:flex;align-items:center;white-space:nowrap;pointer-events:none;color:var(--text-primary);transition:left ${GLIDE_MS}ms cubic-bezier(.4,0,.2,1)}
.aura-ebar-bar{position:relative;display:flex;overflow:hidden;background:color-mix(in srgb,var(--text-primary) 8%,transparent)}
.aura-ebar-sg{flex:0 0 0%;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;transition:background-color .4s,color .4s}
.aura-ebar-glide{transition:flex-basis ${GLIDE_MS}ms cubic-bezier(.4,0,.2,1),background-color .4s,color .4s}
.aura-ebar-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);pointer-events:none}
.aura-ebar-fill{transform-box:fill-box;transform-origin:50% 100%;transition:transform ${GLIDE_MS}ms cubic-bezier(.4,0,.2,1),fill .4s}
@media (prefers-reduced-motion: reduce){.aura-ebar-glide,.aura-ebar-out,.aura-ebar-fill{transition:none}}
`;

export function EnergyBarView({
    pv,
    grid,
    home,
    battery,
    soc,
    showBattery,
    consumers,
    fmt,
    scale = 1,
}: EnergyBarProps) {
    const t = useT();
    const s = scale;
    // Hysteresis: a part appears at its threshold and only goes below
    // HYSTERESIS × threshold — no flicker for values hovering at the edge.
    const visible = useRef<Set<string>>(new Set());
    // The caller builds the list on every render; compare it by content.
    const consumersKey = JSON.stringify(consumers);

    const { top, bar, bottom, empty } = useMemo(() => {
        const was = visible.current;
        const now = new Set<string>();
        const show = (key: string, w: number, min = MIN_W) => {
            const on = was.has(key) ? w >= min * HYSTERESIS : w >= min;
            if (on) now.add(key);
            return on;
        };
        const p = Math.max(0, pv);
        const discharge = Math.max(0, battery);
        const charge = Math.max(0, -battery);
        const imp = Math.max(0, grid);
        const expRaw = Math.max(0, -grid);
        const exp = show('export', expRaw, EXPORT_MIN_W) ? expRaw : 0;
        // Feed-in beyond the current PV production comes out of the battery —
        // it is no yellow "PV export".
        const pvExp = Math.min(exp, p);
        const pvSelf = Math.max(0, p - expRaw);

        const segs: Part[] = [
            { key: 's:battery', r: 0, label: t('evcc.bar.batteryDischarge'), w: discharge, color: COL.battery },
            { key: 's:pv', r: 1, label: t('evcc.bar.pvSelf'), w: pvSelf, color: COL.pv },
            { key: 's:export', r: 2, label: t('evcc.bar.pvExport'), w: pvExp, color: COL.export },
            { key: 's:grid', r: 3, label: t('evcc.bar.gridImport'), w: imp, color: COL.grid },
        ].filter((x) => show(x.key, x.w));
        const segOn = (k: string) => segs.some((x) => x.key === k);

        const src: Part[] = [
            { key: 'o:battery', r: 0, label: t('evcc.bar.battery'), icon: 'battery' as Icon, w: discharge },
            {
                key: 'o:pv',
                r: 1,
                label: t('evcc.solar'),
                icon: 'pv' as Icon,
                w: (segOn('s:pv') ? pvSelf : 0) + (segOn('s:export') ? pvExp : 0),
            },
            { key: 'o:grid', r: 2, label: t('evcc.bar.gridImport'), icon: 'grid' as Icon, w: imp },
        ].filter((x) => show(x.key, x.w));

        const out: Part[] = [
            { key: 'u:home', r: 0, label: t('evcc.house'), icon: 'home' as Icon, w: Math.max(0, home) },
            ...(JSON.parse(consumersKey) as EnergyBarConsumer[]).map((c, i) => ({
                key: `u:lp:${c.key}`,
                r: 1 + i,
                label: c.label,
                icon: c.icon,
                w: c.w,
            })),
            {
                key: 'u:charge',
                r: 100,
                label: t('evcc.bar.batteryCharge'),
                icon: 'battery' as Icon,
                w: charge,
            },
            { key: 'u:export', r: 101, label: t('evcc.bar.feedIn'), icon: 'grid' as Icon, w: exp },
        ].filter((x) => show(x.key, x.w));

        visible.current = now;

        const sumIn = segs.reduce((n, x) => n + x.w, 0);
        const sumOut = out.reduce((n, x) => n + x.w, 0);
        const total = Math.max(sumIn, sumOut);
        const share = (list: Part[]): Shown[] =>
            total > 0 ? list.map((x) => ({ ...x, a: Math.round((x.w / total) * 10000) / 100 })) : [];
        return { top: share(src), bar: share(segs), bottom: share(out), empty: total <= 0 };
    }, [pv, grid, home, battery, consumersKey, t]);

    const topL = useLingering(top);
    const barL = useLingering(bar);
    const bottomL = useLingering(bottom);

    return (
        <div
            className="flex items-stretch w-full"
            style={
                {
                    gap: 10 * s,
                    '--aura-ebar-line': '1px solid color-mix(in srgb, var(--text-primary) 55%, transparent)',
                } as CSSProperties
            }
        >
            <style>{STYLE}</style>
            <div className="flex-1 min-w-0">
                <BracketRow parts={topL} side="top" s={s} fmt={fmt} />
                <BarSegments parts={barL} s={s} fmt={fmt} empty={empty ? t('evcc.bar.noPower') : null} />
                <BracketRow parts={bottomL} side="bottom" s={s} fmt={fmt} />
            </div>
            {showBattery && <BatteryColumn soc={soc} s={s} />}
        </div>
    );
}
