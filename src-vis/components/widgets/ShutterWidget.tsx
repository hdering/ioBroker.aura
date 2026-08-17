import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Square, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import { ShutterViz } from './ShutterViz';
import { TILT_SLIDER_WIDTH, TiltButton, TiltPopover, TiltSlider, TiltStepButtons } from './TiltControls';
import { clampPct, rawToTiltPct, tiltPctToRaw, tiltRange } from '../../utils/shutterTilt';

function BtnRow({
    onUp,
    onStop,
    onDown,
    iconSz = 16,
    vertical = false,
    extra,
}: {
    onUp: () => void;
    onStop: () => void;
    onDown: () => void;
    iconSz?: number;
    vertical?: boolean;
    /** Tilt control riding along in the same row/column. */
    extra?: React.ReactNode;
}) {
    const pad = Math.max(2, Math.round(iconSz / 4));
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
        <div className={`aura-widget-action flex ${vertical ? 'flex-col' : ''} gap-1`}>
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
    // Slat angle wanted across a drive – see reapplyTiltAfterMove below.
    const preMoveTiltRef = useRef<number | null>(null);
    const reapplyTilt = !!(opts.reapplyTiltAfterMove as boolean);
    const hasActivityDp = !!(opts.activityDp as string | undefined);
    const wasMovingRef = useRef(isMoving);
    const reapplyTimerRef = useRef<number | undefined>(undefined);

    const writeTiltRaw = (pct: number) => {
        if (tiltDp) setState(tiltDp, tiltPctToRaw(pct, tiltRng));
    };

    // Some actuators drive the slats into an end position whenever a new blind
    // position is written. Opt-in: restore the angle from before the drive once
    // it has finished – on the falling edge of the activity DP, or after a short
    // fallback delay when there is none.
    useEffect(() => {
        const was = wasMovingRef.current;
        wasMovingRef.current = isMoving;
        if (!reapplyTilt || !tiltDp || !hasActivityDp) return;
        if (was && !isMoving && preMoveTiltRef.current !== null) writeTiltRaw(preMoveTiltRef.current);
        // Only the moving edge matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMoving]);

    useEffect(() => () => window.clearTimeout(reapplyTimerRef.current), []);

    /** Remember the wanted slat angle and, without an activity DP, re-send it later. */
    const keepTiltAcrossMove = () => {
        if (!tiltActive) return;
        preMoveTiltRef.current = dragTilt ?? tiltPct;
        if (!reapplyTilt || hasActivityDp) return;
        const target = preMoveTiltRef.current;
        window.clearTimeout(reapplyTimerRef.current);
        reapplyTimerRef.current = window.setTimeout(() => writeTiltRaw(target), 3000);
    };

    const writePos = (p: number) => {
        preMoveRawRef.current = rawPos; // snapshot before command
        keepTiltAcrossMove();
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

    const thresholds = opts.colorThresholds as Array<[number, string]> | undefined;
    const thresholdColor = useMemo(() => {
        if (!thresholds?.length) return undefined;
        for (const [thresh, color] of thresholds) {
            if (pos < thresh) return color;
        }
        return thresholds[thresholds.length - 1][1];
    }, [thresholds, pos]);
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
        preMoveTiltRef.current = pct;
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
                                    style={{ color: accentColor, flexShrink: 0 }}
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
                            style={{ color: accentColor, flexShrink: 0 }}
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
                            color: 'var(--text-secondary)',
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
    return (
        <div className="aura-widget-row flex flex-col h-full gap-2" style={{ position: 'relative' }}>
            {(showTitle || (showIcon && CustomIcon)) && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {showIcon && CustomIcon && (
                            <CustomIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: accentColor, flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate"
                                style={{
                                    color: 'var(--text-secondary)',
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
                        <span className="text-[10px] animate-pulse shrink-0" style={{ color: 'var(--accent-yellow)' }}>
                            {movingDir === 'up' ? '▲' : movingDir === 'down' ? '▼' : '↕'}
                        </span>
                    )}
                </div>
            )}
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
                {showControls && (
                    <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} iconSz={buttonSize} vertical />
                )}
            </div>
            {(showValue || showSlider || tiltControl === 'slider-h' || tiltBottom) &&
                (() => {
                    // Reserve right space on the slider row so the bottom-right StatusBadges don't overlap the slider thumb at 100%.
                    const showBadges = opts.showStatusBadges !== false;
                    const badgeCount = showBadges
                        ? [opts.batteryDp, opts.unreachDp, opts.lockDp].filter((v) => typeof v === 'string' && v).length
                        : 0;
                    const badgesWidth = badgeCount > 0 ? badgeCount * 18 + (badgeCount - 1) * 2 + 4 : 0;
                    const hasSlider = showSlider || tiltControl === 'slider-h';
                    return (
                        <div style={hasSlider && badgesWidth > 0 ? { paddingRight: badgesWidth } : undefined}>
                            {showValue && (
                                <div className="aura-widget-value flex justify-between items-baseline mb-1">
                                    <span
                                        className="text-[11px]"
                                        style={{ color: isMoving ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}
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
                                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
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
                        </div>
                    );
                })()}
            <StatusBadges config={config} />
            {tiltPopover}
        </div>
    );
}
