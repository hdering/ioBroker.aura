import { useEffect, useRef, useState } from 'react';

// ── MarqueeText ──────────────────────────────────────────────────────────────
// Renders `text` in an overflow-hidden container. Measures (via ResizeObserver)
// whether the natural text width exceeds the container; when it does, switches
// to a two-copy track that linearly translates -50% on loop — landing the
// second copy exactly where the first started, so the cycle is seamless. The
// animation duration is sized to a constant pixel-per-second speed so longer
// labels just take proportionally longer to traverse.

const MARQUEE_SPEED_PXPS = 35;
const MARQUEE_GAP_CHARS = '      ';

export function MarqueeText({
    text,
    className,
    style,
}: {
    text: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const wrapRef = useRef<HTMLSpanElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(false);
    const [duration, setDuration] = useState(10);

    useEffect(() => {
        const wrap = wrapRef.current;
        const measure = measureRef.current;
        if (!wrap || !measure) return;
        const check = () => {
            const textW = measure.scrollWidth;
            const slot = wrap.clientWidth;
            const isOverflowing = textW > slot + 1;
            setOverflow(isOverflowing);
            if (isOverflowing) {
                setDuration(Math.max(4, Math.round(textW / MARQUEE_SPEED_PXPS)));
            }
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(wrap);
        ro.observe(measure);
        return () => ro.disconnect();
    }, [text]);

    return (
        <span
            ref={wrapRef}
            className={`block overflow-hidden whitespace-nowrap relative ${className ?? ''}`}
            style={{ width: '100%', maxWidth: '100%', ...style }}
        >
            {/* Hidden width probe — always rendered with the raw text, never animated.
          Positioned absolutely so it doesn't contribute to layout flow. */}
            <span
                ref={measureRef}
                aria-hidden
                className="invisible pointer-events-none"
                style={{ position: 'absolute', whiteSpace: 'nowrap', left: 0, top: 0 }}
            >
                {text}
            </span>
            {overflow ? (
                <span className="aura-marquee-track" style={{ ['--marquee-duration' as never]: `${duration}s` }}>
                    <span>
                        {text}
                        {MARQUEE_GAP_CHARS}
                    </span>
                    <span aria-hidden>
                        {text}
                        {MARQUEE_GAP_CHARS}
                    </span>
                </span>
            ) : (
                <span>{text}</span>
            )}
        </span>
    );
}
