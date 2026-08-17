/**
 * Slat tilt (Neigung) controls for the shutter widget.
 *
 *   TiltSlider      – the regulator itself; vertical in the default layout
 *                     (up = slats open), horizontal for custom cells.
 *   TiltStepButtons – ± `tiltStep` for the flat layouts, where a vertical
 *                     slider has no room.
 *   TiltButton      – opens the popover, for everywhere else.
 *   TiltPopover     – slat preview + slider + quick values, drawn through the
 *                     shared PickerPopover shell (portal, viewport clamping and
 *                     theme-variable inheritance are handled there).
 *
 * All controls are presentational: the widget owns the draft value, so its own
 * graphic previews the drag as well when `tiltLivePreview` is on.
 */
import React from 'react';
import { Blinds, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { PickerPopover } from '../common/PickerPopover';
import { ShutterViz } from './ShutterViz';

/** Cross-axis thickness of the vertical tilt slider. */
export const TILT_SLIDER_WIDTH = 14;

/** Quick values offered in the popover (top to bottom). */
export const TILT_PRESETS = [100, 75, 50, 25, 0];

export function TiltSlider({
    value,
    onChange,
    onRelease,
    vertical = false,
    thickness = TILT_SLIDER_WIDTH,
    length,
    step = 1,
    title,
}: {
    value: number;
    onChange: (v: number) => void;
    onRelease: () => void;
    vertical?: boolean;
    thickness?: number;
    /** Along the drag axis. Defaults to filling the parent. */
    length?: number | string;
    step?: number;
    title?: string;
}) {
    // `orient` is the WebKit-era vertical hint; same any-cast as SliderWidget.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vertAttrs: any = vertical ? { orient: 'vertical' } : {};
    return (
        <input
            {...vertAttrs}
            type="range"
            min={0}
            max={100}
            step={step}
            value={Math.round(value)}
            title={title}
            aria-label={title}
            onChange={(e) => onChange(Number(e.target.value))}
            onMouseUp={onRelease}
            onTouchEnd={onRelease}
            onKeyUp={onRelease}
            className="aura-widget-action nodrag rounded-full appearance-none cursor-pointer"
            style={
                vertical
                    ? {
                          writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
                          direction: 'rtl',
                          height: length ?? '100%',
                          width: thickness,
                          accentColor: 'var(--accent)',
                      }
                    : { width: length ?? '100%', height: thickness, accentColor: 'var(--accent)' }
            }
        />
    );
}

export function TiltStepButtons({
    onOpenStep,
    onCloseStep,
    iconSz = 14,
    btnStyle,
    vertical = false,
    label = 'Lamellen',
}: {
    onOpenStep: () => void;
    onCloseStep: () => void;
    iconSz?: number;
    btnStyle: React.CSSProperties;
    vertical?: boolean;
    label?: string;
}) {
    return (
        <div className={`aura-widget-action flex ${vertical ? 'flex-col' : ''} gap-1`}>
            <button
                onClick={onOpenStep}
                title={`${label} öffnen`}
                aria-label={`${label} öffnen`}
                className="nodrag hover:opacity-80 transition-opacity"
                style={btnStyle}
            >
                <ChevronsUpDown size={iconSz} />
            </button>
            <button
                onClick={onCloseStep}
                title={`${label} schließen`}
                aria-label={`${label} schließen`}
                className="nodrag hover:opacity-80 transition-opacity"
                style={btnStyle}
            >
                <ChevronsDownUp size={iconSz} />
            </button>
        </div>
    );
}

export function TiltButton({
    btnRef,
    onToggle,
    iconSz = 14,
    btnStyle,
    label = 'Lamellen',
}: {
    btnRef: React.RefObject<HTMLButtonElement>;
    onToggle: () => void;
    iconSz?: number;
    btnStyle: React.CSSProperties;
    label?: string;
}) {
    return (
        <button
            ref={btnRef}
            onClick={onToggle}
            title={label}
            aria-label={label}
            data-tilt-button="1"
            className="aura-widget-action nodrag hover:opacity-80 transition-opacity"
            style={btnStyle}
        >
            <Blinds size={iconSz} />
        </button>
    );
}

export function TiltPopover({
    anchorRef,
    onClose,
    label = 'Lamellen',
    sliderPct,
    shownPct,
    closedFrac,
    accentColor,
    isMoving,
    onChange,
    onRelease,
    onPick,
}: {
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    label?: string;
    /** Thumb position — always follows the finger. */
    sliderPct: number;
    /** Preview + number — respects `tiltLivePreview`. */
    shownPct: number;
    closedFrac: number;
    accentColor: string;
    isMoving: boolean;
    onChange: (v: number) => void;
    onRelease: () => void;
    onPick: (v: number) => void;
}) {
    return (
        <PickerPopover anchorRef={anchorRef} onClose={onClose}>
            <div className="p-3 flex items-stretch gap-3" style={{ color: 'var(--text-primary)' }}>
                <ShutterViz
                    closedFrac={closedFrac}
                    accentColor={accentColor}
                    isMoving={isMoving}
                    tiltFrac={shownPct / 100}
                    pitch={10}
                    slatColor="color-mix(in srgb, var(--text-secondary) 30%, transparent)"
                    radius={8}
                    dotPx={10}
                    style={{ width: 52, height: 132, flexShrink: 0 }}
                />
                <TiltSlider
                    vertical
                    thickness={18}
                    length={132}
                    value={sliderPct}
                    onChange={onChange}
                    onRelease={onRelease}
                    title={label}
                />
                <div className="flex flex-col justify-between" style={{ minWidth: 74 }}>
                    <div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {label}
                        </div>
                        <div className="text-lg font-semibold tabular-nums leading-tight">{Math.round(shownPct)}%</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        {TILT_PRESETS.map((p) => {
                            const active = Math.abs(shownPct - p) < 3;
                            return (
                                <button
                                    key={p}
                                    onClick={() => onPick(p)}
                                    className="nodrag px-2 py-0.5 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {p}%
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </PickerPopover>
    );
}
