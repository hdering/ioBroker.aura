import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Thermometer, Flame, Wind, Snowflake } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useReadBackDatapoint } from '../../hooks/useReadBackDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { lookupDatapointName } from '../../hooks/useDatapointList';
import type { WidgetProps, WidgetConfig } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { getThresholdColor, type ColorThreshold } from '../../utils/colorThresholds';
import { useT } from '../../i18n';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import {
    DEFAULT_SETPOINT_PRESETS as DEFAULT_PRESETS,
    SetpointCircleMenu,
    clampSetpoint as clamp,
    setpointCircleEntries,
    setpointCircleItems,
    setpointPresetText as presetText,
} from './SetpointCircle';
import type { CircleDirection } from './CircleMenu';

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Entries of the circle menu (#815) in their default order — keys and labels
 * only, so the editor's order list (`circleOrder`) names exactly what the widget
 * draws: −, the quick-select temperatures, +.
 */
export function thermostatCircleEntries(opts: Record<string, unknown>): { key: string; label: string }[] {
    const controls = opts.showControls !== false;
    const presets = opts.showPresets !== false ? ((opts.presets as number[] | undefined) ?? DEFAULT_PRESETS) : [];
    return setpointCircleEntries(controls, presets);
}

function resolveTitle(config: WidgetConfig): string {
    if (config.title?.trim()) return config.title;
    return lookupDatapointName(config.datapoint) ?? config.datapoint.split('.').slice(-2).join(' ');
}

// ── dial geometry ──────────────────────────────────────────────────────────
// The dial layout is a self-contained 200x200 SVG: an open 270 arc (gap at the
// bottom) carrying the setpoint, the reading stacked in its centre and the +/-
// buttons sitting inside the gap. Everything lives in user units so the whole
// dial scales with the cell -- no ResizeObserver needed.
const DIAL_START = 135;
const DIAL_END = 405;
const DIAL_CX = 100;
const DIAL_CY = 100;
const DIAL_R = 78;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** 0..1 position of `v` inside [min, max]. */
function dialRatio(v: number, min: number, max: number) {
    if (max <= min) return 0;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

/**
 * Angle of a pointer position, folded into the arc: a point below the widget
 * (inside the button gap) snaps to whichever end it is closer to instead of
 * jumping across the scale.
 */
function dialAngleFromPoint(px: number, py: number): number {
    const raw = (Math.atan2(py - DIAL_CY, px - DIAL_CX) * 180) / Math.PI;
    let deg = raw;
    while (deg < DIAL_START) deg += 360;
    while (deg >= DIAL_START + 360) deg -= 360;
    if (deg > DIAL_END) {
        deg = deg - DIAL_END <= DIAL_START + 360 - deg ? DIAL_END : DIAL_START;
    }
    return deg;
}

// Usable width inside the ring: the inner diameter (2 * (r - stroke/2)) minus a
// little air on both sides.
const DIAL_TEXT_W = 132;

/** SVG text has no ellipsis - cut to what fits the inner width. */
function fitDialText(text: string, fontSize: number): string {
    const maxChars = Math.max(6, Math.floor(DIAL_TEXT_W / (fontSize * 0.52)));
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/**
 * Read a temperature datapoint as a number. Numeric strings count too — a timer
 * exception value typed as "14,5" lands as a string, and showing a made-up
 * fallback instead of it reads as a stale setpoint (#769).
 */
function toTemp(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return /^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null;
}

/** Shrink the big setpoint until it fits the ring — "-10.50 °C" is twice as wide as "22 °C". */
function fitDialValue(text: string): number {
    return Math.max(15, Math.min(30, DIAL_TEXT_W / (text.length * 0.62)));
}

// ── main widget ────────────────────────────────────────────────────────────

export function ThermostatWidget({ config }: WidgetProps) {
    const t = useT();
    const actualDpId = (config.options?.actualDatapoint as string) || '';
    const { value: rawActual } = useDatapoint(actualDpId);
    // An optional status DP supplies the shown setpoint; writes still go to the main DP (#828).
    const { value: rawTarget } = useReadBackDatapoint(config.datapoint, config.options?.statusDp);
    const { setState } = useIoBroker();

    const minTemp = (config.options?.minTemp as number) ?? 10;
    const maxTemp = (config.options?.maxTemp as number) ?? 30;
    const step = (config.options?.step as number) ?? 0.5;
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showSetpoint = o.showSetpoint !== false;
    const showActualTemp = o.showActualTemp !== false;
    // Dial and circle menu: which temperature is drawn large (#864).
    const primaryValue = o.primaryValue === 'actual' ? 'actual' : 'setpoint';
    const showControls = o.showControls !== false;
    const showPresets = o.showPresets !== false;
    const presets = (o.presets as number[] | undefined) ?? DEFAULT_PRESETS;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const ThermoIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
    const iconSize = (o.iconSize as number) || 20;
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const numFmt = (o.numberFormat as NumberFormat | undefined) ?? globalNumFmt;

    const setpoint = toTemp(rawTarget);
    // Base for +/- and the dial while the setpoint is unreadable; never displayed.
    const target = setpoint ?? 20;
    const actual = toTemp(rawActual);
    const setpointText = setpoint !== null ? formatNum(setpoint, decimals, numFmt) : '–';

    const isHeating = actual !== null && setpoint !== null && setpoint > actual + 0.2;
    const isCooling = actual !== null && setpoint !== null && setpoint < actual - 0.2;
    const accentColor = isHeating
        ? 'var(--climate-heat, var(--accent-red))'
        : isCooling
          ? 'var(--climate-cool, var(--accent))'
          : 'var(--text-secondary)';

    // Colour thresholds are evaluated against the measured (actual) temperature
    // and colour the actual reading — not the setpoint, which keeps its
    // heat/cool accent.
    const thresholds = o.colorThresholds as ColorThreshold[] | undefined;
    const thresholdColor = useMemo(() => getThresholdColor(actual, thresholds), [thresholds, actual]);

    // Dial layout: the arc carries the SETPOINT, so its colour scale is matched
    // against the setpoint too (`colorThresholds` above stays on the reading).
    const dialThresholds = o.dialColorThresholds as ColorThreshold[] | undefined;
    const dialAccent = isHeating
        ? 'var(--climate-heat, var(--accent-red))'
        : isCooling
          ? 'var(--climate-cool, var(--accent))'
          : 'var(--accent)';
    const dialSvgRef = useRef<SVGSVGElement | null>(null);
    // While dragging the knob the arc follows the pointer; the datapoint is only
    // written on release, so a drag does not fire a write per pointermove.
    const [dialDrag, setDialDrag] = useState<number | null>(null);
    const dialDragging = useRef(false);
    // Pointer down on the arc — rendered, unlike the ref: the setpoint leads the
    // centre only for that long (#864), not until the datapoint echoes back.
    const [dialHeld, setDialHeld] = useState(false);
    // Hold the dragged value until the datapoint echoes back, otherwise the arc
    // snaps to the stale setpoint for the round-trip and visibly jumps twice.
    useEffect(() => {
        if (!dialDragging.current) setDialDrag(null);
    }, [target]);

    const displayTitle = resolveTitle(config);

    const setTemp = (v: number) => setState(config.datapoint, clamp(v, minTemp, maxTemp, step));

    const PlusMinus = () => (
        <div className="aura-widget-action flex flex-col gap-1 shrink-0">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setTemp(target + step);
                }}
                className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
            >
                +
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setTemp(target - step);
                }}
                className="w-8 h-8 rounded-lg font-bold text-lg hover:opacity-70 focus:outline-none active:scale-95 transition-all"
                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
            >
                −
            </button>
        </div>
    );

    const PresetButtons = () => (
        <div className="aura-widget-action nodrag flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {presets.map((v) => {
                const active = Math.abs(target - v) < 0.1;
                return (
                    <button
                        key={v}
                        onClick={() => setTemp(v)}
                        className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80 active:scale-95 transition-all"
                        style={{
                            background: active ? 'var(--accent)' : 'var(--app-border)',
                            color: active ? '#fff' : 'var(--text-primary)',
                        }}
                    >
                        {presetText(v)}
                    </button>
                );
            })}
        </div>
    );

    const StatusIcon = () =>
        isHeating ? (
            <Flame size={14} style={{ color: 'var(--climate-heat, var(--accent-red))', flexShrink: 0 }} />
        ) : isCooling ? (
            <Snowflake size={14} style={{ color: 'var(--climate-cool, var(--accent))', flexShrink: 0 }} />
        ) : (
            <Wind size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.5 }} />
        );

    const layout = config.layout ?? 'default';
    const {
        battery,
        reach,
        window: windowText,
        batteryIcon,
        reachIcon,
        windowIcon,
        statusBadges,
        statusItemCells,
    } = useStatusFields(config);

    // ── DIAL (Rundskala) as a reusable element ───────────────────────────────
    // Drawn by the dial layout and offered to the custom grid as 'dial' (#768).
    const renderDial = () => {
        const dialTarget = dialDrag ?? target;
        // Threshold scale wins over the fixed colour, which in turn wins over the
        // heat/cool accent.
        const arcColor =
            getThresholdColor(dialTarget, dialThresholds) ?? (o.dialColor as string | undefined) ?? dialAccent;
        const trackColor =
            (o.dialTrackColor as string | undefined) || 'color-mix(in srgb, var(--text-secondary) 28%, transparent)';
        const sw = (o.dialThickness as number) ?? 11;
        const ratio = dialRatio(dialTarget, minTemp, maxTemp);
        const valueEnd = DIAL_START + ratio * (DIAL_END - DIAL_START);
        const knob = polarToCartesian(DIAL_CX, DIAL_CY, DIAL_R, valueEnd);

        const valueFromEvent = (e: React.PointerEvent): number | null => {
            const svg = dialSvgRef.current;
            if (!svg) return null;
            const rect = svg.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            // preserveAspectRatio="xMidYMid meet" letterboxes the square viewBox.
            const side = Math.min(rect.width, rect.height);
            const px = ((e.clientX - rect.left - (rect.width - side) / 2) / side) * 200;
            const py = ((e.clientY - rect.top - (rect.height - side) / 2) / side) * 200;
            const r = (dialAngleFromPoint(px, py) - DIAL_START) / (DIAL_END - DIAL_START);
            return clamp(minTemp + r * (maxTemp - minTemp), minTemp, maxTemp, step);
        };

        const onArcDown = (e: React.PointerEvent) => {
            e.stopPropagation();
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            dialDragging.current = true;
            setDialHeld(true);
            const v = valueFromEvent(e);
            if (v !== null) setDialDrag(v);
        };
        const onArcMove = (e: React.PointerEvent) => {
            if (!dialDragging.current) return;
            const v = valueFromEvent(e);
            if (v !== null) setDialDrag(v);
        };
        const onArcUp = (e: React.PointerEvent) => {
            if (!dialDragging.current) return;
            e.stopPropagation();
            dialDragging.current = false;
            setDialHeld(false);
            if (dialDrag !== null) setState(config.datapoint, dialDrag);
        };

        // Centre stack — only the enabled fields, vertically centred as a block so
        // the dial stays balanced whichever of them is switched off.
        const lines: { key: string; text: string; fs: number; weight: number; fill: string }[] = [];
        // With primaryValue 'actual' the reading leads and the setpoint drops to the
        // small line — except while dragging, so the value being set stays readable (#864).
        const actualFirst = primaryValue === 'actual' && showActualTemp && actual !== null && !dialHeld;
        const dialValueText = dialDrag !== null ? formatNum(dialDrag, decimals, numFmt) : setpointText;
        if (actualFirst) {
            const actualText = `${formatNum(actual, decimals, numFmt)} °C`;
            lines.push({
                key: 'actual',
                text: actualText,
                fs: fitDialValue(actualText),
                weight: 700,
                fill: thresholdColor ?? 'var(--text-primary)',
            });
        } else if (showSetpoint) {
            const valueText = `${dialValueText} °C`;
            lines.push({ key: 'value', text: valueText, fs: fitDialValue(valueText), weight: 700, fill: arcColor });
        }
        if (showTitle)
            lines.push({
                key: 'title',
                text: displayTitle,
                fs: 12,
                weight: 400,
                fill: 'var(--text-secondary)',
            });
        if (actualFirst) {
            if (showSetpoint)
                lines.push({
                    key: 'value',
                    text: `${t('thermo.setPoint')} ${dialValueText} °C`,
                    fs: 11,
                    weight: 400,
                    fill: arcColor,
                });
        } else if (showActualTemp && actual !== null)
            lines.push({
                key: 'actual',
                text: `${t('thermo.actual')} ${formatNum(actual, decimals, numFmt)} °C`,
                fs: 11,
                weight: 400,
                fill: thresholdColor ?? 'var(--text-secondary)',
            });
        const stackH = lines.reduce((sum, l) => sum + l.fs * 1.3, 0);
        let cursor = (showControls ? 94 : 100) - stackH / 2;

        return (
            <svg
                ref={dialSvgRef}
                viewBox="0 0 200 200"
                preserveAspectRatio="xMidYMid meet"
                data-aura-thermo-dial={config.id}
                className="aura-widget-value"
                // The root takes no hits, so the letterboxed space beside the dial stays
                // the card's and a swipe there scrolls. `touch-action` still has to sit
                // here: Chromium ignores it on the arc path, took the touch for a pan and
                // cancelled the drag after the first step (#776).
                style={{
                    width: '100%',
                    height: '100%',
                    maxHeight: '100%',
                    display: 'block',
                    pointerEvents: 'none',
                    touchAction: 'none',
                }}
            >
                <path
                    data-aura-thermo-track=""
                    d={describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, DIAL_END)}
                    fill="none"
                    stroke={trackColor}
                    strokeWidth={sw}
                    strokeLinecap="round"
                />
                {ratio > 0.001 && (
                    <path
                        data-aura-thermo-arc=""
                        d={describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, valueEnd)}
                        fill="none"
                        stroke={arcColor}
                        strokeWidth={sw}
                        strokeLinecap="round"
                    />
                )}
                {/* Wide invisible copy of the track: the drag/tap target. Marked
                    interactive so a tap or drag does not also fire the widget's
                    click action (#776). */}
                <path
                    className="aura-widget-action nodrag"
                    data-widget-interactive=""
                    pointerEvents="stroke"
                    d={describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, DIAL_END)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(sw + 16, 28)}
                    strokeLinecap="round"
                    style={{ cursor: 'pointer', touchAction: 'none' }}
                    onPointerDown={onArcDown}
                    onPointerMove={onArcMove}
                    onPointerUp={onArcUp}
                    onPointerCancel={onArcUp}
                />
                <circle
                    data-aura-thermo-knob=""
                    cx={knob.x}
                    cy={knob.y}
                    r={sw * 0.78}
                    fill="#fff"
                    stroke="var(--app-border)"
                    strokeWidth={0.75}
                    pointerEvents="none"
                />
                {lines.map((l) => {
                    const y = cursor + l.fs * 0.9;
                    cursor += l.fs * 1.3;
                    return (
                        <text
                            key={l.key}
                            data-aura-thermo-line={l.key}
                            x={DIAL_CX}
                            y={y}
                            textAnchor="middle"
                            fontSize={l.fs}
                            fontWeight={l.weight}
                            // The title line is the widget's title: class + colour
                            // variable, so custom CSS on .aura-widget-title reaches it.
                            {...(l.key === 'title'
                                ? {
                                      className: 'aura-widget-title',
                                      fill: 'currentColor',
                                      style: { '--aura-title-color': l.fill },
                                  }
                                : { fill: l.fill })}
                        >
                            {fitDialText(l.text, l.fs)}
                        </text>
                    );
                })}
                {showControls &&
                    (
                        [
                            { key: 'minus', x: 74, label: '−', delta: -step },
                            { key: 'plus', x: 126, label: '+', delta: step },
                        ] as const
                    ).map((b) => (
                        <g
                            key={b.key}
                            className="aura-widget-action nodrag"
                            data-widget-interactive=""
                            data-aura-thermo-btn={b.key}
                            style={{ cursor: 'pointer' }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setTemp(target + b.delta);
                            }}
                        >
                            <circle
                                cx={b.x}
                                cy={160}
                                r={18}
                                fill="transparent"
                                pointerEvents="all"
                                stroke="var(--app-border)"
                                strokeWidth={1.5}
                            />
                            <text
                                x={b.x}
                                y={160}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={22}
                                fill="var(--text-primary)"
                                pointerEvents="none"
                            >
                                {b.label}
                            </text>
                        </g>
                    ))}
            </svg>
        );
    };

    // ── Circle menu (#815) as a reusable element: the circle layout and the
    // custom grid's 'circle-menu' component (#838).
    const renderCircle = (below?: React.ReactNode) => (
        <SetpointCircleMenu
            settings={{
                order: o.circleOrder,
                direction: (o.circleDirection as CircleDirection) || 'auto',
                itemSize: (o.circleItemSize as number) || 48,
                keepOpen: !!o.circleKeepOpen,
                shade: o.circleShade !== false,
                triggerSize: (o.circleTriggerSize as number) || undefined,
            }}
            items={setpointCircleItems({
                controls: showControls,
                presets: showPresets ? presets : [],
                target,
                step,
                itemSize: (o.circleItemSize as number) || 48,
                setTemp,
            })}
            title={displayTitle}
            setpointText={showSetpoint ? setpointText : null}
            actualText={
                showActualTemp && actual !== null
                    ? `${t('thermo.actual')} ${formatNum(actual, decimals, numFmt)}°`
                    : null
            }
            accentColor={accentColor}
            actualColor={thresholdColor ?? undefined}
            primary={primaryValue}
            actualValue={showActualTemp && actual !== null ? formatNum(actual, decimals, numFmt) : null}
            setpointLabel={t('thermo.setPoint')}
            icon={showIcon ? (o.circleIcon ? getWidgetIcon(o.circleIcon as string, Thermometer) : ThermoIcon) : null}
            below={below}
        />
    );

    if (layout === 'custom') {
        const btnSty: React.CSSProperties = {
            background: 'var(--app-border)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            // A preset sizes the buttons through the cell (fontSize → --aura-cell-size).
            width: 'var(--aura-cell-size, 28px)',
            height: 'var(--aura-cell-size, 28px)',
            fontWeight: 'bold',
            fontSize: 16,
            cursor: 'pointer',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        return (
            <CustomGridView
                config={config}
                value={setpointText}
                rawValue={setpoint}
                cssVars={{
                    '--aura-state-color': accentColor,
                    '--aura-actual-color': thresholdColor ?? 'var(--text-secondary)',
                }}
                extraFields={{
                    setpoint: setpointText,
                    actual: actual !== null ? formatNum(actual, decimals, numFmt) : '–',
                    actualTemp: actual !== null ? `${formatNum(actual, decimals, numFmt)}°C` : '',
                    actualSlash: actual !== null ? `/ ${formatNum(actual, decimals, numFmt)}°C` : '',
                    actualLine: actual !== null ? `${t('thermo.actual')} ${formatNum(actual, decimals, numFmt)}°C` : '',
                    status: isHeating ? 'Heizend' : isCooling ? 'Kühlend' : 'Inaktiv',
                    battery,
                    reach,
                    window: windowText,
                }}
                extraComponents={{
                    icon: showIcon ? (
                        <ThermoIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ '--aura-icon-color': `var(--aura-cell-color, ${accentColor})`, flexShrink: 0 }}
                        />
                    ) : null,
                    'btn-plus': (
                        <button
                            className="aura-widget-action nodrag"
                            style={btnSty}
                            onClick={() => setTemp(target + step)}
                        >
                            +
                        </button>
                    ),
                    'btn-minus': (
                        <button
                            className="aura-widget-action nodrag"
                            style={btnSty}
                            onClick={() => setTemp(target - step)}
                        >
                            −
                        </button>
                    ),
                    // Round variants — the minimal layout's buttons.
                    'btn-plus-round': (
                        <button
                            className="aura-widget-action nodrag"
                            style={{ ...btnSty, borderRadius: '50%' }}
                            onClick={() => setTemp(target + step)}
                        >
                            +
                        </button>
                    ),
                    'btn-minus-round': (
                        <button
                            className="aura-widget-action nodrag"
                            style={{ ...btnSty, borderRadius: '50%' }}
                            onClick={() => setTemp(target - step)}
                        >
                            −
                        </button>
                    ),
                    // "Ist: 20,5°C" as the default layout draws it — label grey, reading in
                    // its threshold colour.
                    'actual-line':
                        actual !== null ? (
                            <span className="text-xs" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {t('thermo.actual')}:{' '}
                                <span style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
                                    {formatNum(actual, decimals, numFmt)}°C
                                </span>
                            </span>
                        ) : null,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'window-icon': windowIcon,
                    'status-badges': statusBadges,
                    ...statusItemCells,
                    dial: <div className="w-full h-full min-h-0 flex items-center justify-center">{renderDial()}</div>,
                    presets: presets.length > 0 ? <PresetButtons /> : null,
                    'circle-menu': <div className="w-full h-full min-h-0">{renderCircle()}</div>,
                    'status-icon': <StatusIcon />,
                }}
            />
        );
    }

    // ── COMPACT ───────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <>
                <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                    {showIcon && (
                        <ThermoIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ '--aura-icon-color': accentColor, flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <span
                            className="aura-widget-title flex-1 text-sm truncate min-w-0"
                            style={{
                                '--aura-title-color': 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {displayTitle}
                        </span>
                    )}
                    {!showTitle && <span className="flex-1" />}
                    {showSetpoint && (
                        <span className="aura-widget-value text-xl font-bold shrink-0" style={{ color: accentColor }}>
                            {setpointText}°C
                            {showActualTemp && actual !== null && (
                                <span
                                    className="font-normal text-xs ml-1"
                                    style={{ color: thresholdColor ?? 'var(--text-secondary)' }}
                                >
                                    / {formatNum(actual, decimals, numFmt)}°C
                                </span>
                            )}
                        </span>
                    )}
                    {showControls && (
                        <div className="aura-widget-action flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setTemp(target - step)}
                                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                −
                            </button>
                            <button
                                onClick={() => setTemp(target + step)}
                                className="w-6 h-6 rounded font-bold text-sm hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                +
                            </button>
                        </div>
                    )}
                    <StatusBadges config={config} />
                </div>
            </>
        );
    }

    // ── MINIMAL ───────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        return (
            <>
                <div
                    className="aura-widget-row flex flex-col items-center justify-center h-full gap-2"
                    style={{ position: 'relative' }}
                >
                    {showIcon && (
                        <ThermoIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ '--aura-icon-color': accentColor }}
                        />
                    )}
                    {showSetpoint && (
                        <span
                            className="aura-widget-value text-xl font-bold"
                            style={{ color: accentColor, lineHeight: 1 }}
                        >
                            {setpointText}°C
                        </span>
                    )}
                    {showActualTemp && actual !== null && (
                        <span className="text-xs" style={{ color: thresholdColor ?? 'var(--text-secondary)' }}>
                            {t('thermo.actual')} {formatNum(actual, decimals, numFmt)}°C
                        </span>
                    )}
                    {showControls && (
                        <div className="aura-widget-action flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setTemp(target - step)}
                                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                −
                            </button>
                            <button
                                onClick={() => setTemp(target + step)}
                                className="w-8 h-8 rounded-full font-bold hover:opacity-70 active:scale-95 transition-all"
                                style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
                            >
                                +
                            </button>
                        </div>
                    )}
                    {showPresets && presets.length > 0 && (
                        <div className="flex justify-center mt-1">
                            <PresetButtons />
                        </div>
                    )}
                    <StatusBadges config={config} />
                </div>
            </>
        );
    }

    // ── CIRCLE (#815) ─────────────────────────────────────────────────────────
    if (layout === 'circle') {
        return (
            <div className="aura-widget-row h-full" style={{ position: 'relative' }}>
                {renderCircle(
                    showTitle ? (
                        <p
                            className="aura-widget-title text-xs truncate w-full shrink-0"
                            style={{
                                '--aura-title-color': 'var(--text-secondary)',
                                textAlign: (titleAlign === 'left'
                                    ? 'center'
                                    : titleAlign) as React.CSSProperties['textAlign'],
                            }}
                        >
                            {displayTitle}
                        </p>
                    ) : null,
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── DIAL (Rundskala) ──────────────────────────────────────────────────────
    if (layout === 'dial') {
        return (
            <div
                className="aura-widget-row flex flex-col h-full min-h-0 gap-1"
                style={{ position: 'relative' }}
                // No title row of its own (the title is drawn in the scale): header items
                // get a row above the dial from the frame instead of lying on it.
                data-aura-header-above=""
            >
                <div className="flex-1 min-h-0 flex items-center justify-center">{renderDial()}</div>
                {showPresets && presets.length > 0 && (
                    <div className="flex justify-center">
                        <PresetButtons />
                    </div>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    return (
        <>
            <div className="aura-widget-row flex flex-col h-full gap-2" style={{ position: 'relative' }}>
                {/* Title row */}
                <HeaderGroup>
                    {(showTitle || showIcon) && (
                        <TitleRow align={titleAlign} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {showIcon && (
                                    <ThermoIcon
                                        className="aura-widget-icon"
                                        size={iconSize}
                                        style={{ '--aura-icon-color': accentColor, flexShrink: 0 }}
                                    />
                                )}
                                {showTitle && (
                                    <p
                                        className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                        style={{
                                            '--aura-title-color': 'var(--text-secondary)',
                                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                                        }}
                                    >
                                        {displayTitle}
                                    </p>
                                )}
                            </div>
                            <StatusIcon />
                            <HeaderSlotsInline />
                        </TitleRow>
                    )}
                    <HeaderSlotsRow2 />
                </HeaderGroup>

                {/* Temperature */}
                <div className="flex items-center justify-between flex-1">
                    <div className="aura-widget-value">
                        {showSetpoint && (
                            <p className="text-xl font-bold leading-none" style={{ color: accentColor }}>
                                {setpointText}°C
                            </p>
                        )}
                        {showActualTemp && actual !== null && (
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('thermo.actual')}:{' '}
                                <span style={{ color: thresholdColor ?? 'var(--text-primary)' }}>
                                    {formatNum(actual, decimals, numFmt)}°C
                                </span>
                            </p>
                        )}
                    </div>
                    {showControls && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <PlusMinus />
                        </div>
                    )}
                </div>

                {/* Quick-select presets */}
                {showPresets && presets.length > 0 && <PresetButtons />}
                <StatusBadges config={config} />
            </div>
        </>
    );
}
