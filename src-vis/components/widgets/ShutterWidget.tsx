import React, { useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Square, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { ShutterPreset, WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { getThresholdColor, type ColorThreshold } from '../../utils/colorThresholds';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import { ShutterViz } from './ShutterViz';
import { TILT_SLIDER_WIDTH, TiltButton, TiltPopover, TiltSlider, TiltStepButtons } from './TiltControls';
import { clampPct, rawToTiltPct, tiltPctToRaw, tiltRange } from '../../utils/shutterTilt';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';

const BTN_GAP = 4; // gap-1
const MIN_ICON = 8;
const btnPad = (iconSz: number) => Math.max(2, Math.round(iconSz / 4));
/** Largest icon size (up to `iconSz`) whose three stacked buttons fit into `availH`. */
function fitIconSize(iconSz: number, availH: number): number {
    let sz = iconSz;
    while (sz > MIN_ICON && 3 * (sz + 2 * btnPad(sz) + 2) + 2 * BTN_GAP > availH) sz--;
    return sz;
}

function BtnRow({
    onUp,
    onStop,
    onDown,
    iconSz = 16,
    vertical = false,
    extra,
    reserveBottom = 0,
}: {
    onUp: () => void;
    onStop: () => void;
    onDown: () => void;
    iconSz?: number;
    vertical?: boolean;
    /** Tilt control riding along in the same row/column. */
    extra?: React.ReactNode;
    /** Space kept free below a vertical column (status badges sit bottom-right). */
    reserveBottom?: number;
}) {
    // A vertical column may get less height than three buttons in a flat card.
    // Overflowing it slid the lower buttons under the value/slider row, which then
    // swallowed their clicks (#739) - so the icons shrink to fit instead.
    const colRef = useRef<HTMLDivElement>(null);
    const [availH, setAvailH] = useState<number | null>(null);
    const fitColumn = vertical && !extra;
    useLayoutEffect(() => {
        const el = colRef.current;
        if (!fitColumn || !el) return;
        const update = () => setAvailH(el.clientHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fitColumn]);
    if (fitColumn && availH !== null) iconSz = fitIconSize(iconSz, availH);
    const pad = btnPad(iconSz);
    const radius = Math.max(4, Math.round(iconSz / 2));
    const dirStyle = (dir: 'up' | 'stop' | 'down'): React.CSSProperties => ({
        background: `var(--blind-${dir}-bg, var(--app-bg))`,
        color: `var(--blind-${dir}-color, var(--text-secondary))`,
        border: `1px solid var(--blind-${dir}-border, var(--app-border))`,
        padding: pad,
        borderRadius: radius,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    });
    return (
        <div
            ref={colRef}
            className={`aura-widget-action flex ${vertical ? 'flex-col relative z-10 min-h-0' : ''} gap-1`}
            style={reserveBottom ? { marginBottom: reserveBottom } : undefined}
        >
            <button onClick={onUp} className="hover:opacity-80 transition-opacity" style={dirStyle('up')}>
                <ChevronUp size={iconSz} />
            </button>
            <button onClick={onStop} className="hover:opacity-80 transition-opacity" style={dirStyle('stop')}>
                <Square size={iconSz} />
            </button>
            <button onClick={onDown} className="hover:opacity-80 transition-opacity" style={dirStyle('down')}>
                <ChevronDown size={iconSz} />
            </button>
            {extra}
        </div>
    );
}

/** Slat re-set via the actual position: quiet period that ends a drive, and the wait for its first report. */
const SETTLE_QUIET_MS = 3000;
const SETTLE_START_MS = 8000;

/**
 * Valid presets only; a bare number (as an AI might write it) counts as `{ pos }`.
 * Without `pos` a preset sets only the slats, so it needs a `tilt`.
 */
function readPresets(raw: unknown): ShutterPreset[] {
    if (!Array.isArray(raw)) return [];
    const out: ShutterPreset[] = [];
    const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    for (const item of raw) {
        const p: Partial<ShutterPreset> = typeof item === 'number' ? { pos: item } : (item ?? {});
        const pos = num(p.pos);
        const tilt = num(p.tilt);
        if (!Number.isFinite(pos) && !Number.isFinite(tilt)) continue;
        out.push({
            pos: Number.isFinite(pos) ? clampPct(pos) : undefined,
            label: typeof p.label === 'string' ? p.label : undefined,
            tilt: Number.isFinite(tilt) ? clampPct(tilt) : undefined,
        });
    }
    return out;
}

export function ShutterWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const controlMode = (opts.controlMode as string) ?? 'position';
    const openDp = opts.openDp as string | undefined;
    const closeDp = opts.closeDp as string | undefined;
    const activityMovingRaw = opts.activityMovingValues as string | undefined;
    const actualPositionDp = opts.actualPositionDp as string | undefined;
    const tiltDp = opts.tiltDp as string | undefined;
    const actualTiltDp = opts.actualTiltDp as string | undefined;
    const { value, setValue } = useDatapoint(config.datapoint);
    const { value: actualVal } = useDatapoint(actualPositionDp ?? '');
    const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
    const { value: directionVal } = useDatapoint((opts.directionDp as string) ?? '');
    const { value: tiltVal } = useDatapoint(tiltDp ?? '');
    const { value: actualTiltVal } = useDatapoint(actualTiltDp ?? '');
    const { setState } = useIoBroker();
    const layout = config.layout ?? 'default';

    const showClosedPercent = !!(opts.showClosedPercent as boolean);
    const sendOnRelease = opts.sendOnRelease !== false;
    // Whether the graphic (and the percentage) already follow the regulator while
    // dragging. Off for the position — that is how the widget always behaved —
    // and on for the slats, where the point of the vertical slider is that they
    // move with the finger. The thumb itself always follows, either way.
    const positionLivePreview = !!(opts.positionLivePreview as boolean);
    const tiltLivePreview = opts.tiltLivePreview !== false;

    const [dragPos, setDragPos] = useState<number | null>(null);
    const [dragTilt, setDragTilt] = useState<number | null>(null);
    const [tiltOpen, setTiltOpen] = useState(false);
    const tiltBtnRef = useRef<HTMLButtonElement>(null);

    // Normalize position: 0 = closed, 100 = open.
    // Actuators like HmIP-BROLL report the real position on a read-only DP of a
    // different channel than the writable LEVEL – if configured, it wins for display.
    const posValue = actualPositionDp && typeof actualVal === 'number' ? actualVal : value;
    const rawPos = typeof posValue === 'number' ? Math.round(posValue) : 0;
    const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
    const displayPos = dragPos ?? pos;
    const shownPos = positionLivePreview ? displayPos : pos;
    const closedFrac = Math.max(0, Math.min(1, (100 - shownPos) / 100));
    const displayPct = showClosedPercent ? 100 - shownPos : shownPos;

    // ── Slat tilt ─────────────────────────────────────────────────────────────
    // 0 % = slats closed, 100 % = open; the raw range/inversion lives in options.
    const tiltRng = tiltRange(opts);
    const tiltActive = !!tiltDp;
    const tiltRawValue = actualTiltDp && typeof actualTiltVal === 'number' ? actualTiltVal : tiltVal;
    const tiltPct = rawToTiltPct(tiltRawValue, tiltRng) ?? 0;
    const tiltSliderPct = dragTilt ?? tiltPct;
    const tiltShownPct = tiltLivePreview ? tiltSliderPct : tiltPct;
    const tiltFrac = tiltActive ? tiltShownPct / 100 : undefined;
    const tiltStep = (opts.tiltStep as number) || 10;
    const tiltLabel = (opts.tiltLabel as string) || 'Lamellen';
    // The compact row is already tight with three buttons — a second percentage
    // there has to be asked for, everywhere else it comes along by default.
    const showTiltValue = layout === 'compact' ? opts.showTiltValue === true : opts.showTiltValue !== false;
    const tiltSliderWidth = (opts.tiltSliderWidth as number) || TILT_SLIDER_WIDTH;

    const isMoving = activityMovingRaw
        ? activityMovingRaw
              .split(',')
              .map((s) => s.trim())
              .some((v) => String(activityVal) === v)
        : activityVal === true || activityVal === 1 || activityVal === '1' || activityVal === 'true';
    const movingDir: 'up' | 'down' | null =
        directionVal === 1 || directionVal === '1' ? 'up' : directionVal === 2 || directionVal === '2' ? 'down' : null;

    // Save the raw position just before a move command so stop can reference it.
    // This avoids the race where rawPos has already changed to the new target (e.g. 0)
    // by the time the user clicks stop, which would send 0 again (no-op) or the old
    // position back (causing the blind to reverse).
    const preMoveRawRef = useRef(rawPos);
    // Slat angle wanted across a drive – see reapplyTiltAfterMove below. Only
    // set while a drive this widget started is pending; null = nothing to restore.
    const preMoveTiltRef = useRef<number | null>(null);
    const reapplyTilt = !!(opts.reapplyTiltAfterMove as boolean);
    const hasActivityDp = !!(opts.activityDp as string | undefined);
    const wasMovingRef = useRef(isMoving);
    const reapplyTimerRef = useRef<number | undefined>(undefined);
    // Without an activity DP, a separate actual-position DP tells when the drive
    // is over: it stops changing. KNX actuators report every few percent and may
    // end a point or two off the target, so "quiet for a while" is the signal (#745).
    const settleOnActual = reapplyTilt && !!tiltDp && !hasActivityDp && !!actualPositionDp;
    // A separately reported position may stop a point or two off the written one.
    const posTolerance = actualPositionDp ? 3 : 1;

    const writeTiltRaw = (pct: number) => {
        if (tiltDp) setState(tiltDp, tiltPctToRaw(pct, tiltRng));
    };

    // Some actuators drive the slats into an end position whenever a new blind
    // position is written. Opt-in: restore the angle once the drive this widget
    // started has finished – on the falling edge of the activity DP, or after a
    // short fallback delay when there is none. One-shot: drives started elsewhere
    // (wall switch, logic) leave the slats to the actuator (#745).
    useEffect(() => {
        const was = wasMovingRef.current;
        wasMovingRef.current = isMoving;
        if (!reapplyTilt || !tiltDp || !hasActivityDp) return;
        if (isMoving) {
            // The drive has started – it may take as long as it needs.
            window.clearTimeout(reapplyTimerRef.current);
        } else if (was && preMoveTiltRef.current !== null) {
            writeTiltRaw(preMoveTiltRef.current);
            preMoveTiltRef.current = null;
        }
        // Only the moving edge matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMoving]);

    /** Write the remembered angle (the latest wish, also one picked during the drive) and forget it. */
    const flushTilt = () => {
        if (preMoveTiltRef.current !== null) writeTiltRaw(preMoveTiltRef.current);
        preMoveTiltRef.current = null;
    };

    // Every actual-position report restarts the quiet period; once it stays
    // quiet, the drive is over and the angle goes out.
    useEffect(() => {
        if (!settleOnActual || preMoveTiltRef.current === null) return;
        window.clearTimeout(reapplyTimerRef.current);
        reapplyTimerRef.current = window.setTimeout(flushTilt, SETTLE_QUIET_MS);
        // Only the reported position matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actualVal]);

    useEffect(() => () => window.clearTimeout(reapplyTimerRef.current), []);

    /** Remember the wanted slat angle for the drive about to start and re-send it once it is over. */
    const keepTiltAcrossMove = (wanted?: number) => {
        if (!tiltActive) return;
        preMoveTiltRef.current = wanted ?? dragTilt ?? tiltPct;
        if (!reapplyTilt) return;
        window.clearTimeout(reapplyTimerRef.current);
        if (hasActivityDp) {
            // No drive within a while (already there, command lost): forget the
            // angle, so a later foreign drive does not pick it up.
            reapplyTimerRef.current = window.setTimeout(() => {
                if (!wasMovingRef.current) preMoveTiltRef.current = null;
            }, 15000);
            return;
        }
        // With an actual-position DP: wait for the drive to start reporting
        // (each report restarts the timer above); no report at all = command
        // lost or already there, the angle goes out anyway. Without: fixed delay.
        reapplyTimerRef.current = window.setTimeout(flushTilt, settleOnActual ? SETTLE_START_MS : 3000);
    };

    const writePos = (p: number, wantedTilt?: number) => {
        preMoveRawRef.current = rawPos; // snapshot before command
        keepTiltAcrossMove(wantedTilt);
        const raw = (opts.invertPosition as boolean) ? 100 - p : p;
        setValue(raw);
    };
    const openFully = () => {
        if (controlMode === 'taster' && openDp) {
            preMoveRawRef.current = rawPos;
            keepTiltAcrossMove();
            setState(openDp, true);
        } else {
            writePos(100);
        }
    };
    const closeFully = () => {
        if (controlMode === 'taster' && closeDp) {
            preMoveRawRef.current = rawPos;
            keepTiltAcrossMove();
            setState(closeDp, true);
        } else {
            writePos(0);
        }
    };
    const stop = () => {
        const stopDp = opts.stopDp as string | undefined;
        if (stopDp) {
            setState(stopDp, true);
        } else if (controlMode !== 'taster') {
            // Race-condition-safe fallback: use pre-move snapshot, not current rawPos
            const stopTarget = isMoving && rawPos !== preMoveRawRef.current ? rawPos : preMoveRawRef.current;
            setState(config.datapoint, stopTarget);
        }
    };

    const accentColor = isMoving
        ? 'var(--accent-yellow)'
        : pos > 0
          ? 'var(--blind-color, var(--accent))'
          : 'var(--text-secondary)';

    const thresholds = opts.colorThresholds as ColorThreshold[] | undefined;
    const thresholdColor = useMemo(() => getThresholdColor(pos, thresholds), [thresholds, pos]);
    const valueColor = thresholdColor ?? 'var(--text-primary)';

    const showTitle = opts.showTitle !== false;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const showValue = opts.showValue !== false;
    const showControls = opts.showControls !== false;
    const showSlider = opts.showSlider !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const valueSize = (opts.valueSize as number) || 20;
    const buttonSize = (opts.buttonSize as number) || 14;
    const sliderHeight = (opts.sliderHeight as number) || 6;

    // Slider mirrors the displayed value: left=low%, right=high%
    // showClosedPercent=off → right=100%open=open; showClosedPercent=on → right=100%closed=closed
    const sliderPos = showClosedPercent ? 100 - displayPos : displayPos;

    const handleSliderChange = (v: number) => {
        const posValue = showClosedPercent ? 100 - v : v;
        if (sendOnRelease) {
            setDragPos(posValue);
        } else {
            writePos(posValue);
        }
    };
    const handleSliderRelease = () => {
        if (sendOnRelease && dragPos !== null) {
            writePos(dragPos);
            setDragPos(null);
        }
    };

    const writeTilt = (pct: number) => {
        // Changed during a pending drive: that angle is the one to restore.
        if (preMoveTiltRef.current !== null) preMoveTiltRef.current = pct;
        writeTiltRaw(pct);
    };
    const handleTiltChange = (v: number) => {
        if (sendOnRelease) setDragTilt(v);
        else writeTilt(v);
    };
    const handleTiltRelease = () => {
        if (sendOnRelease && dragTilt !== null) {
            writeTilt(dragTilt);
            setDragTilt(null);
        }
    };
    const pickTilt = (v: number) => {
        setDragTilt(null);
        writeTilt(clampPct(v));
    };
    const stepTilt = (dir: 1 | -1) => pickTilt(Math.round(tiltSliderPct + dir * tiltStep));

    // ── Quick-select presets ──────────────────────────────────────────────────
    // A preset's percentage reads like the displayed one, so "30" means what the
    // widget would show as 30 % — closed or open, depending on showClosedPercent.
    // A slat-only preset (no pos) is pointless without a tilt datapoint.
    const presets = useMemo(
        () => readPresets(opts.positionPresets).filter((p) => p.pos !== undefined || tiltActive),
        [opts.positionPresets, tiltActive],
    );
    const applyPreset = (p: ShutterPreset) => {
        setDragPos(null);
        const tilt = tiltActive ? p.tilt : undefined;
        const target = p.pos === undefined ? undefined : showClosedPercent ? 100 - p.pos : p.pos;
        // Already there: many actuators re-drive on a repeated position and put
        // the slats into an end position, so only the angle is written.
        const atTarget = target !== undefined && !isMoving && Math.abs(pos - target) < posTolerance;
        // Slats first: HmIP blinds expect LEVEL_2 before LEVEL and then drive
        // both in one go. Actuators that reset the slats on a drive are covered
        // by reapplyTiltAfterMove, which now holds the preset's angle.
        if (tilt !== undefined) {
            setDragTilt(null);
            if (target === undefined || atTarget) writeTilt(tilt);
            else writeTiltRaw(tilt);
        }
        if (target !== undefined && !(atTarget && tilt !== undefined)) writePos(target, tilt);
    };
    const presetActive = (p: ShutterPreset) =>
        (p.pos === undefined || Math.abs((showClosedPercent ? 100 - pos : pos) - p.pos) < posTolerance) &&
        (!tiltActive || p.tilt === undefined || Math.abs(tiltPct - p.tilt) < 2);
    const presetText = (p: ShutterPreset) =>
        p.pos === undefined ? `${tiltLabel} ${Math.round(p.tilt ?? 0)}%` : `${Math.round(p.pos)}%`;
    const presetRow =
        presets.length > 0 ? (
            <div
                className="aura-widget-action aura-shutter-presets nodrag flex gap-1 flex-wrap"
                onClick={(e) => e.stopPropagation()}
            >
                {presets.map((p, i) => {
                    const active = !isMoving && presetActive(p);
                    const pctText = presetText(p);
                    return (
                        <button
                            key={i}
                            onClick={() => applyPreset(p)}
                            title={
                                (p.label ? `${p.label}: ${pctText}` : pctText) +
                                (p.pos !== undefined && p.tilt !== undefined
                                    ? ` · ${tiltLabel} ${Math.round(p.tilt)}%`
                                    : '')
                            }
                            aria-pressed={active}
                            className="aura-preset-button px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80 active:scale-95 transition-all"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-border)',
                                color: active ? '#fff' : 'var(--text-primary)',
                            }}
                        >
                            {p.label || pctText}
                        </button>
                    );
                })}
            </div>
        ) : null;

    const customIconName = opts.icon as string | undefined;
    const CustomIcon = customIconName ? getWidgetIcon(customIconName, Square) : null;

    const statusText = isMoving
        ? movingDir === 'up'
            ? '▲ Fährt auf'
            : movingDir === 'down'
              ? '▼ Fährt zu'
              : '↕ Fährt...'
        : shownPos === 100
          ? 'Geöffnet'
          : shownPos === 0
            ? 'Geschlossen'
            : showClosedPercent
              ? `${100 - shownPos}% geschlossen`
              : `${shownPos}% geöffnet`;

    const slider = (
        <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderPos}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            style={{ accentColor: 'var(--accent)', height: sliderHeight }}
            className="aura-widget-action w-full rounded-full appearance-none cursor-pointer"
        />
    );

    // ── Tilt controls ─────────────────────────────────────────────────────────
    // Where the slat control lives: inline in the widget or behind a popover
    // button. Compact/Minimal have no room for a slider, so an inline control
    // degrades to the step buttons there.
    const flatLayout = layout === 'compact' || layout === 'minimal';
    const tiltPlacement = tiltActive
        ? ((opts.tiltPlacement as string) ?? (flatLayout ? 'popup' : 'inline'))
        : ('off' as string);
    const tiltControl =
        tiltPlacement === 'inline' ? (flatLayout ? 'buttons' : ((opts.tiltControl as string) ?? 'slider-v')) : null;

    const tiltPad = Math.max(2, Math.round(buttonSize / 4));
    const tiltBtnStyle: React.CSSProperties = {
        background: 'var(--blind-tilt-bg, var(--blind-stop-bg, var(--app-bg)))',
        color: 'var(--blind-tilt-color, var(--blind-stop-color, var(--text-secondary)))',
        border: '1px solid var(--blind-tilt-border, var(--blind-stop-border, var(--app-border)))',
        padding: tiltPad,
        borderRadius: Math.max(4, Math.round(buttonSize / 2)),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    const tiltSliderEl = (vertical: boolean) => (
        <TiltSlider
            vertical={vertical}
            thickness={vertical ? tiltSliderWidth : sliderHeight}
            value={tiltSliderPct}
            onChange={handleTiltChange}
            onRelease={handleTiltRelease}
            title={tiltLabel}
        />
    );

    /** Tilt control that rides along in a button row: popover button or ± steps. */
    const tiltAside = (vertical: boolean) =>
        tiltPlacement === 'popup' ? (
            <TiltButton
                btnRef={tiltBtnRef}
                onToggle={() => setTiltOpen((o) => !o)}
                iconSz={buttonSize}
                btnStyle={tiltBtnStyle}
                label={tiltLabel}
            />
        ) : tiltControl === 'buttons' ? (
            <TiltStepButtons
                onOpenStep={() => stepTilt(1)}
                onCloseStep={() => stepTilt(-1)}
                iconSz={buttonSize}
                btnStyle={tiltBtnStyle}
                vertical={vertical}
                label={tiltLabel}
            />
        ) : null;

    // Default layout: step buttons and the popover button share the bottom row
    // with the position slider. Stacking them onto the up/stop/down column would
    // make it five buttons tall — in a flat widget that overflows the card and
    // covers the row below, which then swallows the clicks.
    const tiltBottom =
        !flatLayout && (tiltPlacement === 'popup' || tiltControl === 'buttons') ? tiltAside(false) : null;

    const tiltPopover = tiltOpen ? (
        <TiltPopover
            anchorRef={tiltBtnRef}
            onClose={() => setTiltOpen(false)}
            label={tiltLabel}
            sliderPct={tiltSliderPct}
            shownPct={tiltShownPct}
            closedFrac={closedFrac}
            accentColor={accentColor}
            isMoving={isMoving}
            onChange={handleTiltChange}
            onRelease={handleTiltRelease}
            onPick={pickTilt}
        />
    ) : null;

    const tiltPctText = `${Math.round(tiltShownPct)}%`;

    // Vertical regulator column of the default layout — left or right of the graphic.
    const tiltSliderSide = (opts.tiltSliderSide as string) === 'left' ? 'left' : 'right';
    const tiltColumn =
        tiltControl === 'slider-v' ? (
            <div
                className="aura-widget-tilt flex flex-col items-center gap-1 shrink-0 min-h-0"
                // Fixed width: "0%" and "100%" must not resize the column,
                // otherwise the whole row reflows on every value change.
                style={{ width: Math.max(tiltSliderWidth, 28) }}
            >
                <div className="flex-1 min-h-0 flex items-stretch justify-center">{tiltSliderEl(true)}</div>
                {showTiltValue && (
                    <span
                        className="text-[10px] tabular-nums w-full text-center"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {tiltPctText}
                    </span>
                )}
            </div>
        ) : null;

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    if (layout === 'custom') {
        const dirBtnStyle = (dir: 'up' | 'stop' | 'down' | 'tilt'): React.CSSProperties => ({
            background: `var(--blind-${dir}-bg, var(--app-bg))`,
            color: `var(--blind-${dir}-color, var(--text-secondary))`,
            border: `1px solid var(--blind-${dir}-border, var(--app-border))`,
            borderRadius: 6,
            padding: '4px 6px',
            cursor: 'pointer',
        });
        return (
            <>
                <CustomGridView
                    config={config}
                    value={`${pos}`}
                    rawValue={pos}
                    extraFields={{
                        position: `${displayPct}%`,
                        status: statusText,
                        moving: isMoving ? 'Ja' : 'Nein',
                        tilt: tiltActive ? tiltPctText : '',
                        battery,
                        reach,
                    }}
                    extraComponents={{
                        icon: showIcon ? (
                            CustomIcon ? (
                                <CustomIcon
                                    className="aura-widget-icon"
                                    size={iconSize}
                                    style={{ '--aura-icon-color': accentColor, flexShrink: 0 }}
                                />
                            ) : (
                                <ShutterViz
                                    closedFrac={closedFrac}
                                    accentColor={accentColor}
                                    isMoving={isMoving}
                                    tiltFrac={tiltFrac}
                                    className="aura-widget-icon"
                                    style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
                                />
                            )
                        ) : null,
                        'btn-up': (
                            <button className="aura-widget-action nodrag" style={dirBtnStyle('up')} onClick={openFully}>
                                <ChevronUp size={buttonSize} />
                            </button>
                        ),
                        'btn-stop': (
                            <button className="aura-widget-action nodrag" style={dirBtnStyle('stop')} onClick={stop}>
                                <Square size={buttonSize} />
                            </button>
                        ),
                        'btn-down': (
                            <button
                                className="aura-widget-action nodrag"
                                style={dirBtnStyle('down')}
                                onClick={closeFully}
                            >
                                <ChevronDown size={buttonSize} />
                            </button>
                        ),
                        slider,
                        'tilt-slider-v': tiltActive ? (
                            <div className="h-full flex items-stretch justify-center">{tiltSliderEl(true)}</div>
                        ) : null,
                        'tilt-slider-h': tiltActive ? tiltSliderEl(false) : null,
                        'btn-tilt': tiltActive ? (
                            <TiltButton
                                btnRef={tiltBtnRef}
                                onToggle={() => setTiltOpen((o) => !o)}
                                iconSz={buttonSize}
                                btnStyle={dirBtnStyle('tilt')}
                                label={tiltLabel}
                            />
                        ) : null,
                        'btn-tilt-open': tiltActive ? (
                            <button
                                className="aura-widget-action nodrag"
                                style={dirBtnStyle('tilt')}
                                title={`${tiltLabel} öffnen`}
                                onClick={() => stepTilt(1)}
                            >
                                <ChevronsUpDown size={buttonSize} />
                            </button>
                        ) : null,
                        'btn-tilt-close': tiltActive ? (
                            <button
                                className="aura-widget-action nodrag"
                                style={dirBtnStyle('tilt')}
                                title={`${tiltLabel} schließen`}
                                onClick={() => stepTilt(-1)}
                            >
                                <ChevronsDownUp size={buttonSize} />
                            </button>
                        ) : null,
                        presets: presetRow,
                        'battery-icon': batteryIcon,
                        'reach-icon': reachIcon,
                        'status-badges': statusBadges,
                    }}
                />
                {tiltPopover}
            </>
        );
    }

    // ── COMPACT ───────────────────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                {showIcon &&
                    (CustomIcon ? (
                        <CustomIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ '--aura-icon-color': accentColor, flexShrink: 0 }}
                        />
                    ) : (
                        <ShutterViz
                            closedFrac={closedFrac}
                            accentColor={accentColor}
                            isMoving={isMoving}
                            tiltFrac={tiltFrac}
                            className="aura-widget-icon"
                            style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
                        />
                    ))}
                {showTitle && (
                    <span
                        className="aura-widget-title flex-1 text-sm truncate min-w-0"
                        style={{
                            '--aura-title-color': 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                {!showTitle && <span className="flex-1" />}
                {showValue && (
                    <span
                        className="aura-widget-value font-bold shrink-0"
                        style={{
                            color: thresholdColor ?? (isMoving ? 'var(--accent-yellow)' : 'var(--text-primary)'),
                            fontSize: valueSize,
                            lineHeight: 1,
                        }}
                    >
                        {displayPct}%
                    </span>
                )}
                {tiltActive && showTiltValue && (
                    <span
                        className="aura-widget-value shrink-0 tabular-nums text-right"
                        // "0%" and "100%" reserve the same room so the button row
                        // does not shift when the angle changes.
                        style={{
                            color: 'var(--text-secondary)',
                            fontSize: Math.max(9, Math.round(valueSize * 0.6)),
                            minWidth: '4ch',
                        }}
                        title={tiltLabel}
                    >
                        {tiltPctText}
                    </span>
                )}
                {showControls ? (
                    <BtnRow
                        onUp={openFully}
                        onStop={stop}
                        onDown={closeFully}
                        iconSz={buttonSize}
                        extra={tiltAside(false)}
                    />
                ) : (
                    tiltAside(false)
                )}
                <StatusBadges config={config} />
                {tiltPopover}
            </div>
        );
    }

    // ── MINIMAL ───────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        const minBtnPad = Math.max(4, Math.round(buttonSize / 2));
        const minBtnRadius = Math.max(6, Math.round(buttonSize / 1.3));
        const minDirStyle = (dir: 'up' | 'stop' | 'down'): React.CSSProperties => ({
            background: `var(--blind-${dir}-bg, var(--app-bg))`,
            color: `var(--blind-${dir}-color, var(--text-secondary))`,
            border: `1px solid var(--blind-${dir}-border, var(--app-border))`,
            padding: minBtnPad,
            borderRadius: minBtnRadius,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
        });
        const minBtnStyle = minDirStyle('up');
        const stopBtnStyle: React.CSSProperties = {
            ...minDirStyle('stop'),
            padding: `${Math.max(2, Math.round(buttonSize / 3))}px ${Math.max(6, Math.round(buttonSize))}px`,
        };
        const downBtnStyle = minDirStyle('down');
        const stopSz = Math.max(8, Math.round(buttonSize * 0.7));
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-1.5"
                style={{ position: 'relative' }}
            >
                {showControls && (
                    <button
                        onClick={openFully}
                        className="aura-widget-action hover:opacity-80 transition-opacity"
                        style={minBtnStyle}
                    >
                        <ChevronUp size={buttonSize} />
                    </button>
                )}
                {showValue && (
                    <div className="aura-widget-value text-center">
                        <p className="font-bold leading-none" style={{ color: valueColor, fontSize: valueSize }}>
                            {displayPct}%
                        </p>
                        {isMoving && (
                            <p className="text-[10px] animate-pulse mt-0.5" style={{ color: 'var(--accent-yellow)' }}>
                                {movingDir === 'up' ? '▲' : '▼'}
                            </p>
                        )}
                    </div>
                )}
                {showControls && (
                    <>
                        <button
                            onClick={stop}
                            className="aura-widget-action hover:opacity-80 transition-opacity"
                            style={stopBtnStyle}
                        >
                            <Square size={stopSz} />
                        </button>
                        <button
                            onClick={closeFully}
                            className="aura-widget-action hover:opacity-80 transition-opacity"
                            style={downBtnStyle}
                        >
                            <ChevronDown size={buttonSize} />
                        </button>
                    </>
                )}
                {tiltAside(false)}
                <StatusBadges config={config} />
                {tiltPopover}
            </div>
        );
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    const badgeCount =
        opts.showStatusBadges !== false
            ? [opts.batteryDp, opts.unreachDp, opts.lockDp].filter((v) => typeof v === 'string' && v).length
            : 0;
    const badgesWidth = badgeCount > 0 ? badgeCount * 18 + (badgeCount - 1) * 2 + 4 : 0;
    return (
        <div className="aura-widget-row flex flex-col h-full gap-2" style={{ position: 'relative' }}>
            <HeaderGroup>
                {(showTitle || (showIcon && CustomIcon)) && (
                    <TitleRow align={titleAlign} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {showIcon && CustomIcon && (
                                <CustomIcon
                                    className="aura-widget-icon"
                                    size={iconSize}
                                    style={{ '--aura-icon-color': accentColor, flexShrink: 0 }}
                                />
                            )}
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate"
                                    style={{
                                        '--aura-title-color': 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                                        flex: '1',
                                        minWidth: 0,
                                    }}
                                >
                                    {config.title}
                                </p>
                            )}
                        </div>
                        {isMoving && (
                            <span
                                className="text-[10px] animate-pulse shrink-0"
                                style={{ color: 'var(--accent-yellow)' }}
                            >
                                {movingDir === 'up' ? '▲' : movingDir === 'down' ? '▼' : '↕'}
                            </span>
                        )}
                        <HeaderSlotsInline />
                    </TitleRow>
                )}
                <HeaderSlotsRow2 />
            </HeaderGroup>
            {/* The button column spans graphic, value and slider: next to the graphic
                alone it had too little height and its lower buttons slid under the
                value row, which swallowed their clicks (#739). */}
            <div className="flex gap-2 flex-1 min-h-0">
                <div className="flex flex-col gap-2 flex-1 min-w-0 min-h-0">
                    <div className="flex gap-2 flex-1 min-h-0">
                        {tiltSliderSide === 'left' && tiltColumn}
                        <ShutterViz
                            closedFrac={closedFrac}
                            accentColor={accentColor}
                            isMoving={isMoving}
                            tiltFrac={tiltFrac}
                            className="flex-1"
                        />
                        {tiltSliderSide === 'right' && tiltColumn}
                    </div>
                    {(showValue || showSlider || tiltControl === 'slider-h' || tiltBottom || presetRow) &&
                        (() => {
                            // Reserve right space on the slider row so the bottom-right StatusBadges don't overlap the slider thumb at 100%
                            // (or the last preset button).
                            const hasSlider = showSlider || tiltControl === 'slider-h' || !!presetRow;
                            return (
                                <div style={hasSlider && badgesWidth > 0 ? { paddingRight: badgesWidth } : undefined}>
                                    {showValue && (
                                        <div className="aura-widget-value flex justify-between items-baseline mb-1">
                                            <span
                                                className="text-[11px]"
                                                style={{
                                                    color: isMoving ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                                                }}
                                            >
                                                {statusText}
                                            </span>
                                            <span
                                                className="font-bold"
                                                style={{ color: valueColor, fontSize: valueSize, lineHeight: 1 }}
                                            >
                                                {displayPct}%
                                            </span>
                                        </div>
                                    )}
                                    {(showSlider || tiltBottom) && (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">{showSlider ? slider : null}</div>
                                            {tiltBottom}
                                        </div>
                                    )}
                                    {tiltControl === 'slider-h' && (
                                        <div className="aura-widget-tilt flex items-center gap-2 mt-1">
                                            <span
                                                className="text-[10px] shrink-0"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {tiltLabel}
                                            </span>
                                            {tiltSliderEl(false)}
                                            {showTiltValue && (
                                                <span
                                                    className="text-[10px] tabular-nums shrink-0 text-right"
                                                    style={{ color: 'var(--text-secondary)', minWidth: '4ch' }}
                                                >
                                                    {tiltPctText}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {presetRow && <div className="mt-2">{presetRow}</div>}
                                </div>
                            );
                        })()}
                </div>
                {showControls && (
                    <BtnRow
                        onUp={openFully}
                        onStop={stop}
                        onDown={closeFully}
                        iconSz={buttonSize}
                        vertical
                        reserveBottom={badgeCount > 0 ? 20 : 0}
                    />
                )}
            </div>
            <StatusBadges config={config} />
            {tiltPopover}
        </div>
    );
}
