import React, { useRef, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';

// Shutter visual: horizontal slat lines filling from top = how much is closed
function ShutterViz({
    closedFrac,
    accentColor,
    isMoving,
    className,
    style,
}: {
    closedFrac: number;
    accentColor: string;
    isMoving: boolean;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div
            className={className}
            style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative',
                ...style,
            }}
        >
            {/* Slat area fills from top */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${closedFrac * 100}%`,
                    transition: 'height 0.4s ease',
                    backgroundImage:
                        'repeating-linear-gradient(to bottom, transparent 0px, transparent 6px, color-mix(in srgb, var(--text-secondary) 35%, transparent) 6px, color-mix(in srgb, var(--text-secondary) 35%, transparent) 8px)',
                }}
            />
            {/* Edge indicator at the bottom of the blind */}
            {closedFrac > 0.01 && closedFrac < 0.99 && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${closedFrac * 100}%`,
                        height: '2px',
                        background: accentColor,
                        transition: 'top 0.4s ease, background 0.3s',
                        boxShadow: `0 0 4px ${accentColor}66`,
                    }}
                />
            )}
            {/* Pulsing dot when moving */}
            {isMoving && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: accentColor }} />
                </div>
            )}
        </div>
    );
}

function BtnRow({
    onUp,
    onStop,
    onDown,
    iconSz = 16,
    vertical = false,
}: {
    onUp: () => void;
    onStop: () => void;
    onDown: () => void;
    iconSz?: number;
    vertical?: boolean;
}) {
    const pad = Math.max(2, Math.round(iconSz / 4));
    const radius = Math.max(4, Math.round(iconSz / 2));
    const btnStyle: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
        padding: pad,
        borderRadius: radius,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    };
    return (
        <div className={`aura-widget-action flex ${vertical ? 'flex-col' : ''} gap-1`}>
            <button onClick={onUp} className="hover:opacity-80 transition-opacity" style={btnStyle}>
                <ChevronUp size={iconSz} />
            </button>
            <button onClick={onStop} className="hover:opacity-80 transition-opacity" style={btnStyle}>
                <Square size={iconSz} />
            </button>
            <button onClick={onDown} className="hover:opacity-80 transition-opacity" style={btnStyle}>
                <ChevronDown size={iconSz} />
            </button>
        </div>
    );
}

export function ShutterWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const controlMode = (opts.controlMode as string) ?? 'position';
    const openDp = opts.openDp as string | undefined;
    const closeDp = opts.closeDp as string | undefined;
    const activityMovingRaw = opts.activityMovingValues as string | undefined;
    const { value, setValue } = useDatapoint(config.datapoint);
    const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
    const { value: directionVal } = useDatapoint((opts.directionDp as string) ?? '');
    const { setState } = useIoBroker();
    const layout = config.layout ?? 'default';

    // Normalize position: 0 = closed, 100 = open
    const rawPos = typeof value === 'number' ? Math.round(value) : 0;
    const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
    const closedFrac = Math.max(0, Math.min(1, (100 - pos) / 100));
    const showClosedPercent = !!(opts.showClosedPercent as boolean);
    const displayPct = showClosedPercent ? 100 - pos : pos;

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

    const writePos = (p: number) => {
        preMoveRawRef.current = rawPos; // snapshot before command
        const raw = (opts.invertPosition as boolean) ? 100 - p : p;
        setValue(raw);
    };
    const openFully = () => {
        if (controlMode === 'taster' && openDp) {
            preMoveRawRef.current = rawPos;
            setState(openDp, true);
        } else {
            writePos(100);
        }
    };
    const closeFully = () => {
        if (controlMode === 'taster' && closeDp) {
            preMoveRawRef.current = rawPos;
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

    const accentColor = isMoving ? 'var(--accent-yellow)' : pos > 0 ? 'var(--accent)' : 'var(--text-secondary)';

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
    const sendOnRelease = opts.sendOnRelease !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const valueSize = (opts.valueSize as number) || 20;
    const buttonSize = (opts.buttonSize as number) || 14;
    const sliderHeight = (opts.sliderHeight as number) || 6;

    const [dragPos, setDragPos] = useState<number | null>(null);
    const displayPos = dragPos ?? pos;
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
    const customIconName = opts.icon as string | undefined;
    const CustomIcon = customIconName ? getWidgetIcon(customIconName, Square) : null;

    const statusText = isMoving
        ? movingDir === 'up'
            ? '▲ Fährt auf'
            : movingDir === 'down'
              ? '▼ Fährt zu'
              : '↕ Fährt...'
        : pos === 100
          ? 'Geöffnet'
          : pos === 0
            ? 'Geschlossen'
            : showClosedPercent
              ? `${100 - pos}% geschlossen`
              : `${pos}% geöffnet`;

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

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    if (layout === 'custom') {
        const btnStyle: React.CSSProperties = {
            background: 'var(--app-bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--app-border)',
            borderRadius: 6,
            padding: '4px 6px',
            cursor: 'pointer',
        };
        return (
            <CustomGridView
                config={config}
                value={`${pos}`}
                rawValue={pos}
                extraFields={{
                    position: `${displayPct}%`,
                    status: statusText,
                    moving: isMoving ? 'Ja' : 'Nein',
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
                                className="aura-widget-icon"
                                style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
                            />
                        )
                    ) : null,
                    'btn-up': (
                        <button className="aura-widget-action nodrag" style={btnStyle} onClick={openFully}>
                            <ChevronUp size={buttonSize} />
                        </button>
                    ),
                    'btn-stop': (
                        <button className="aura-widget-action nodrag" style={btnStyle} onClick={stop}>
                            <Square size={buttonSize} />
                        </button>
                    ),
                    'btn-down': (
                        <button className="aura-widget-action nodrag" style={btnStyle} onClick={closeFully}>
                            <ChevronDown size={buttonSize} />
                        </button>
                    ),
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
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
                {showControls && <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} iconSz={buttonSize} />}
                <StatusBadges config={config} />
            </div>
        );
    }

    // ── MINIMAL ───────────────────────────────────────────────────────────────
    if (layout === 'minimal') {
        const minBtnPad = Math.max(4, Math.round(buttonSize / 2));
        const minBtnRadius = Math.max(6, Math.round(buttonSize / 1.3));
        const minBtnStyle: React.CSSProperties = {
            background: 'var(--app-bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--app-border)',
            padding: minBtnPad,
            borderRadius: minBtnRadius,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        const stopBtnStyle: React.CSSProperties = {
            ...minBtnStyle,
            padding: `${Math.max(2, Math.round(buttonSize / 3))}px ${Math.max(6, Math.round(buttonSize))}px`,
        };
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
                            style={minBtnStyle}
                        >
                            <ChevronDown size={buttonSize} />
                        </button>
                    </>
                )}
                <StatusBadges config={config} />
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
                <ShutterViz closedFrac={closedFrac} accentColor={accentColor} isMoving={isMoving} className="flex-1" />
                {showControls && (
                    <BtnRow onUp={openFully} onStop={stop} onDown={closeFully} iconSz={buttonSize} vertical />
                )}
            </div>
            {(showValue || showSlider) &&
                (() => {
                    // Reserve right space on the slider row so the bottom-right StatusBadges don't overlap the slider thumb at 100%.
                    const showBadges = opts.showStatusBadges !== false;
                    const badgeCount = showBadges
                        ? [opts.batteryDp, opts.unreachDp, opts.lockDp].filter((v) => typeof v === 'string' && v).length
                        : 0;
                    const badgesWidth = badgeCount > 0 ? badgeCount * 18 + (badgeCount - 1) * 2 + 4 : 0;
                    return (
                        <div style={showSlider && badgesWidth > 0 ? { paddingRight: badgesWidth } : undefined}>
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
                            {showSlider && slider}
                        </div>
                    );
                })()}
            <StatusBadges config={config} />
        </div>
    );
}
