/**
 * The blind graphic shared by the shutter widget, its popup body and the tilt
 * popover: horizontal slat lines filling from the top = how much is closed.
 *
 * `tiltFrac` (0 = slats closed, 1 = slats open) thickens the slat lines until
 * they form a closed surface. Left undefined — no tilt datapoint configured —
 * the graphic renders exactly as it always has.
 */
import React from 'react';

/** Slat period and line thickness of the "open slats" look (today's default). */
export const SLAT_PITCH = 8;
export const SLAT_LINE = 2;

export const SLAT_COLOR = 'color-mix(in srgb, var(--text-secondary) 35%, transparent)';

/**
 * Repeating slat gradient. At `tiltFrac` 1 the lines are `line` px thin (view
 * through the blind), at 0 they grow to the full `pitch` and close the surface.
 */
export function slatGradient(color: string, pitch = SLAT_PITCH, line = SLAT_LINE, tiltFrac?: number): string {
    const t = tiltFrac === undefined ? 1 : Math.max(0, Math.min(1, tiltFrac));
    const thick = line + (pitch - line) * (1 - t);
    const gap = Math.max(0, pitch - thick);
    return `repeating-linear-gradient(to bottom, transparent 0px, transparent ${gap}px, ${color} ${gap}px, ${color} ${pitch}px)`;
}

export function ShutterViz({
    closedFrac,
    accentColor,
    isMoving,
    tiltFrac,
    pitch = SLAT_PITCH,
    line = SLAT_LINE,
    slatColor = SLAT_COLOR,
    radius = 6,
    dotPx = 8,
    className,
    style,
}: {
    closedFrac: number;
    accentColor: string;
    isMoving: boolean;
    /** 0 = slats closed, 1 = open. Undefined = no tilt DP → classic look. */
    tiltFrac?: number;
    pitch?: number;
    line?: number;
    slatColor?: string;
    radius?: number;
    dotPx?: number;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div
            className={className}
            style={{
                background: 'var(--blind-bg, var(--app-bg))',
                border: '1px solid var(--blind-border, var(--app-border))',
                borderRadius: radius,
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
                    backgroundImage: slatGradient(slatColor, pitch, line, tiltFrac),
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
                    <div
                        className="rounded-full animate-pulse"
                        style={{ width: dotPx, height: dotPx, background: accentColor }}
                    />
                </div>
            )}
        </div>
    );
}
