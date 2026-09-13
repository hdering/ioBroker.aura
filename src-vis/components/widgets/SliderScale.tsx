import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sliderTicks, stepDecimals } from '../../utils/sliderScale';

/**
 * The scale under (or next to) a slider: a mark per step and a number on as
 * many of them as fit (#643). Shared by the Schieberegler widget, the list rows
 * and the universal widget's slider cell.
 *
 * Two details matter for the marks to sit where the thumb sits:
 *
 * - The native `input[type=range]` has a 16 px thumb (index.css), so its usable
 *   track is inset by half of that at both ends. `inset` carries that number;
 *   the bar look runs edge to edge and passes 0.
 * - The end labels are edge-aligned rather than centred on their mark. Centring
 *   them would push half a number past the slider — the same thing every chart
 *   axis does with its outermost labels.
 */

/** Height of the mark strip above the numbers. */
const TICK_LEN = 4;

export type SliderScaleProps = {
    min: number;
    max: number;
    step: number;
    /** Label every n-th step. Empty → as many numbers as the measured track fits. */
    labelEvery?: number;
    /** Draw the marks. Off leaves the bare numbers. */
    ticks?: boolean;
    /** Runs bottom-to-top next to the track instead of left-to-right below it. */
    vertical?: boolean;
    /** Half the thumb width — how far the track is inset at both ends. */
    inset?: number;
    /** Format one value; defaults to the decimals the step implies. */
    format?: (v: number) => string;
    color?: string;
    className?: string;
};

export function SliderScale({
    min,
    max,
    step,
    labelEvery,
    ticks = true,
    vertical,
    inset = 0,
    format,
    color = 'var(--text-secondary)',
    className,
}: SliderScaleProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState(0);

    // The number of labels follows the real width, so the same widget thins its
    // scale on a phone and spells it out on a wall panel.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const read = () => setBox(vertical ? el.clientHeight : el.clientWidth);
        const ro = new ResizeObserver(read);
        ro.observe(el);
        read();
        return () => ro.disconnect();
    }, [vertical]);

    const dec = stepDecimals(step);
    const fmt = format ?? ((v: number) => (dec === 0 ? String(Math.round(v)) : v.toFixed(dec)));
    const widest = Math.max(fmt(min).length, fmt(max).length);
    // Horizontally the widest number decides how many fit, vertically one line does.
    const labelPx = vertical ? 15 : widest * 6.2 + 10;
    const list = sliderTicks({ min, max, step, labelEvery, trackPx: Math.max(0, box - 2 * inset), labelPx });

    if (!list.length) return null;

    const labeled = list.filter((t) => t.labeled);
    const firstVal = labeled[0]?.value;
    const lastVal = labeled[labeled.length - 1]?.value;
    const pos = (r: number) => `calc(${inset}px + ${r} * (100% - ${inset * 2}px))`;
    const markStyle = (t: (typeof list)[number]): CSSProperties => ({
        position: 'absolute',
        background: color,
        opacity: t.labeled ? 0.55 : 0.3,
    });
    const numCls = 'text-[10px] leading-[1.3] tabular-nums';

    if (vertical) {
        return (
            <div
                ref={ref}
                className={`aura-slider-scale flex items-stretch${className ? ` ${className}` : ''}`}
                style={{ height: '100%', pointerEvents: 'none' }}
            >
                {ticks && (
                    <div style={{ position: 'relative', width: TICK_LEN, flexShrink: 0 }}>
                        {list.map((t, i) => (
                            <div
                                key={i}
                                style={{
                                    ...markStyle(t),
                                    bottom: pos(t.ratio),
                                    left: 0,
                                    width: t.labeled ? TICK_LEN : TICK_LEN - 2,
                                    height: 1,
                                }}
                            />
                        ))}
                    </div>
                )}
                <div style={{ position: 'relative', marginLeft: 2 }}>
                    {/* Invisible twin in normal flow: it gives the column its width at
                        whatever font scale is active, the numbers float over it. */}
                    <span className={numCls} style={{ visibility: 'hidden' }}>
                        {fmt(widest === fmt(min).length ? min : max)}
                    </span>
                    {labeled.map((t, i) => (
                        <span
                            key={i}
                            className={numCls}
                            style={{
                                position: 'absolute',
                                left: 0,
                                whiteSpace: 'nowrap',
                                color,
                                ...(t.value === firstVal
                                    ? { bottom: 0 }
                                    : t.value === lastVal
                                      ? { top: 0 }
                                      : { bottom: pos(t.ratio), transform: 'translateY(50%)' }),
                            }}
                        >
                            {fmt(t.value)}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className={`aura-slider-scale w-full${className ? ` ${className}` : ''}`}
            style={{ pointerEvents: 'none' }}
        >
            {ticks && (
                <div style={{ position: 'relative', height: TICK_LEN }}>
                    {list.map((t, i) => (
                        <div
                            key={i}
                            style={{
                                ...markStyle(t),
                                left: pos(t.ratio),
                                top: 0,
                                width: 1,
                                height: t.labeled ? TICK_LEN : TICK_LEN - 2,
                            }}
                        />
                    ))}
                </div>
            )}
            <div style={{ position: 'relative' }}>
                {/* Invisible twin in normal flow — keeps the row's height correct at
                    any font scale without hard-coding a pixel height. */}
                <span className={numCls} style={{ visibility: 'hidden' }}>
                    0
                </span>
                {labeled.map((t, i) => (
                    <span
                        key={i}
                        className={numCls}
                        style={{
                            position: 'absolute',
                            top: 0,
                            whiteSpace: 'nowrap',
                            color,
                            ...(t.value === firstVal
                                ? { left: 0 }
                                : t.value === lastVal
                                  ? { right: 0 }
                                  : { left: pos(t.ratio), transform: 'translateX(-50%)' }),
                        }}
                    >
                        {fmt(t.value)}
                    </span>
                ))}
            </div>
        </div>
    );
}
