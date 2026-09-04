/**
 * Marker, handle and section-icon layer for the fill widget's limits (#613).
 *
 * Deliberately HTML, not SVG. Each fill renderer has its own viewBox and its own
 * scaling — the tanks letterbox (`xMidYMid meet`), the horizontal battery stretches
 * (`preserveAspectRatio="none"`) — so a handle drawn inside the viewBox comes out as
 * an ellipse in one layout and an icon comes out squashed. Measuring the track's
 * real box once and drawing on top in pixels is immune to all of that, keeps the
 * text crisp, and hands the drag code the rect it needs anyway.
 *
 * The section colours stay in the renderers: a rect survives any scaling, and only
 * the SVG has the tank's rounded clip path.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import {
    neighbourBounds,
    pointerFrac,
    snapLimit,
    type FillBand,
    type LimitScale,
    type ResolvedLimit,
} from '../../utils/fillLimits';

/** Below this the cross axis of the bar is too thin for a pill or an icon. */
const MIN_CROSS_PX = 18;
/** A section shorter than this gets no icon — it would spill into its neighbours. */
const MIN_BAND_PX = 20;
/** Two value pills closer than this collide; the lower one wins. */
const MIN_LABEL_GAP_PX = 15;
const HANDLE_R = 6;
/** Touch target around the handle. Fingers are not 12px wide. */
const HIT_R = 13;
/** Assumed size of a value pill. Only used to keep it off the handle and inside the bar. */
const PILL_W = 34;
const PILL_H = 13;

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Measures `trackRef` relative to `hostRef` and keeps it current across resizes.
 * Returns null until the first measurement, so nothing is drawn at the wrong place
 * for a frame.
 */
function useTrackBox(hostRef: RefObject<HTMLElement>, trackRef: RefObject<Element>): Box | null {
    const [box, setBox] = useState<Box | null>(null);
    const observed = useRef<Element | null>(null);
    const ro = useRef<ResizeObserver | null>(null);

    const measure = useCallback(() => {
        const host = hostRef.current;
        const track = trackRef.current;
        if (!host || !track) return;
        const h = host.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        const next: Box = { left: t.left - h.left, top: t.top - h.top, width: t.width, height: t.height };
        setBox((prev) =>
            prev &&
            Math.abs(prev.left - next.left) < 0.5 &&
            Math.abs(prev.top - next.top) < 0.5 &&
            Math.abs(prev.width - next.width) < 0.5 &&
            Math.abs(prev.height - next.height) < 0.5
                ? prev
                : next,
        );
    }, [hostRef, trackRef]);

    // No dependency array on purpose. Switching the layout or the orientation swaps
    // both the wrapper and the bar for different elements while the widget stays
    // mounted, and a ref in the deps cannot express that — the effect would keep the
    // first measurement and keep observing a detached node, leaving the markers at
    // the position of a layout that is no longer on screen.
    useLayoutEffect(() => {
        measure();
        const host = hostRef.current;
        if (host && observed.current !== host) {
            ro.current?.disconnect();
            ro.current = new ResizeObserver(measure);
            ro.current.observe(host);
            observed.current = host;
        }
    });
    useEffect(
        () => () => {
            ro.current?.disconnect();
            ro.current = null;
            observed.current = null;
        },
        [],
    );
    return box;
}

export interface FillLimitsProps {
    /** Positioned ancestor the overlay is placed in. */
    hostRef: RefObject<HTMLElement>;
    /** The bar itself — its box defines where 0 % and 100 % are. An SVG rect in the
     *  tank/battery layouts, a div in the flat bar; only its box is ever read. */
    trackRef: RefObject<Element>;
    limits: ResolvedLimit[];
    bands: FillBand[];
    scale: LimitScale;
    orientation: 'vertical' | 'horizontal';
    /** Fill level 0..1 — decides whether a section icon sits on the fill or on the empty track. */
    fillFrac: number;
    unit: string;
    decimals: number;
    numFmt?: NumberFormat;
    clampNeighbours: boolean;
    /** Live display value while dragging; the widget mirrors it into the section edges. */
    onDrag: (id: string, at: number) => void;
    /** Pointer released — write the datapoint. */
    onCommit: (id: string, at: number) => void;
}

export function FillLimits({
    hostRef,
    trackRef,
    limits,
    bands,
    scale,
    orientation,
    fillFrac,
    unit,
    decimals,
    numFmt,
    clampNeighbours,
    onDrag,
    onCommit,
}: FillLimitsProps) {
    const box = useTrackBox(hostRef, trackRef);
    // The drag in flight. In a ref because the window listeners are registered once
    // and must not close over a stale value; `bounds` is frozen at pointerdown (see
    // neighbourBounds) and `pointerId` keeps a second finger out of this drag.
    const drag = useRef<{
        id: string;
        pointerId: number;
        step?: number;
        bounds: { lower?: number; upper?: number };
    } | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);

    if (!box || box.width <= 0 || box.height <= 0) return null;

    const vertical = orientation === 'vertical';
    const cross = vertical ? box.width : box.height;
    const along = vertical ? box.height : box.width;
    const roomForChrome = cross >= MIN_CROSS_PX;
    // A vertical pill is laid out ACROSS the bar, so a thin bar cannot hold one at all;
    // a horizontal one runs along the bar and only needs the thickness.
    const roomForPill = vertical ? cross >= PILL_W + 8 : roomForChrome;

    /** Offset along the track, in px from the box's own origin. */
    const alongPx = (frac: number) => (vertical ? (1 - frac) * box.height : frac * box.width);

    /** Where the pointer currently puts the dragged limit, in display space. */
    /**
     * Where a value pill goes. Two things it must not do: hide under the handle, which
     * sits on the very same line, and cover the icon of its own section. Hence BELOW
     * the line (the section icon is centred in the section ABOVE it) and, along a
     * horizontal bar, flipped to the other side of the marker once the bar's end is in
     * the way — clamping it instead slid it straight back under the handle.
     */
    const pillPos = (pos: number, draggable?: boolean): React.CSSProperties => {
        const off = draggable ? HANDLE_R + 4 : 4;
        if (vertical) return { left: 3, top: Math.max(0, Math.min(box.height - PILL_H, pos + off)) };
        const right = pos + off;
        const left = right + PILL_W <= box.width ? right : Math.max(0, pos - off - PILL_W);
        return { top: 3, left };
    };

    const valueFor = (e: { clientX: number; clientY: number }, fallback: number) => {
        const track = trackRef.current;
        const active = drag.current;
        if (!track || !active) return fallback;
        const frac = pointerFrac(e, track.getBoundingClientRect(), orientation);
        return snapLimit(scale.min + frac * (scale.max - scale.min), {
            scale,
            step: active.step,
            lower: clampNeighbours ? active.bounds.lower : undefined,
            upper: clampNeighbours ? active.bounds.upper : undefined,
        });
    };

    const startDrag = (e: React.PointerEvent<HTMLDivElement>, limit: ResolvedLimit) => {
        if (!limit.draggable || drag.current) return;
        // Keep the grid editor and any parent scroller out of it.
        e.preventDefault();
        e.stopPropagation();
        // Deliberately NOT setPointerCapture on the handle: the limits re-sort while
        // one is dragged past another, React then MOVES the handle among its siblings,
        // and Chrome drops the capture on a DOM move — the release never arrived and
        // the drag wrote nothing. Window listeners filtered by pointerId survive that.
        drag.current = {
            id: limit.id,
            pointerId: e.pointerId,
            step: limit.step,
            bounds: neighbourBounds(limits, limit),
        };
        setDragging(limit.id);
        onDrag(limit.id, valueFor(e, limit.at));

        const move = (ev: PointerEvent) => {
            const active = drag.current;
            if (!active || ev.pointerId !== active.pointerId) return;
            onDrag(active.id, valueFor(ev, limit.at));
        };
        const end = (ev: PointerEvent) => {
            const active = drag.current;
            if (active && ev.pointerId !== active.pointerId) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!active) return;
            const at = valueFor(ev, limit.at);
            drag.current = null;
            setDragging(null);
            onCommit(active.id, at);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    };

    // Pills are dropped bottom-up when they would overlap: the lowest limit keeps its
    // label, a crowded neighbour loses it rather than printing mush.
    const labelShown = new Map<string, boolean>();
    let lastLabelPx = Number.NEGATIVE_INFINITY;
    for (const limit of [...limits].sort((a, b) => a.frac - b.frac)) {
        const px = vertical ? along - alongPx(limit.frac) : alongPx(limit.frac);
        const show = limit.showValue !== false && roomForPill && px - lastLabelPx >= MIN_LABEL_GAP_PX;
        labelShown.set(limit.id, show);
        if (show) lastLabelPx = px;
    }

    return (
        <div
            className="nodrag"
            data-aura-fill-limits={limits.length}
            style={{
                position: 'absolute',
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                // Only the handles take the pointer; the bar underneath keeps its own
                // clicks (a fill widget may carry a click action).
                pointerEvents: 'none',
            }}
        >
            {/* Section icons – centred in their band, coloured for what they sit on */}
            {bands.map((band, i) => {
                if (!band.icon || !roomForChrome) return null;
                const extent = (band.to - band.from) * along;
                if (extent < MIN_BAND_PX) return null;
                const mid = (band.from + band.to) / 2;
                const size = Math.round(Math.min(cross * 0.5, extent * 0.6, 22));
                if (size < 10) return null;
                const Icon = getWidgetIcon(band.icon, null);
                const onFill = mid <= fillFrac;
                const pos = alongPx(mid);
                return (
                    <div
                        key={`band-icon-${i}`}
                        data-aura-fill-band-icon={i}
                        style={{
                            position: 'absolute',
                            ...(vertical
                                ? { left: 0, right: 0, top: pos - size / 2 }
                                : { top: 0, bottom: 0, left: pos - size / 2 }),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...(vertical ? { height: size } : { width: size }),
                        }}
                    >
                        <Icon
                            size={size}
                            style={{
                                color: onFill ? '#fff' : 'var(--text-secondary)',
                                opacity: onFill ? 0.95 : 0.55,
                                // A white glyph on a section the user coloured pale is
                                // invisible, and the section colour cannot be measured
                                // for contrast here. A dark halo is readable on both.
                                filter: onFill ? 'drop-shadow(0 0 2px rgba(0,0,0,0.55))' : undefined,
                            }}
                        />
                    </div>
                );
            })}

            {/* Marker line + value pill + handle, per limit. Configuration order, not
                value order — see ResolvedLimit.order for why the DOM must not re-sort. */}
            {[...limits]
                .sort((a, b) => a.order - b.order)
                .map((limit) => {
                    const color = limit.color || 'var(--accent)';
                    const pos = alongPx(limit.frac);
                    const isDragging = dragging === limit.id;
                    const label = `${formatNum(limit.at, decimals, numFmt)}${unit}`;
                    return (
                        <div key={limit.id} data-aura-fill-limit={limit.id} data-aura-fill-limit-at={limit.at}>
                            {/* Halo under the line so it reads on any fill colour */}
                            <div
                                style={{
                                    position: 'absolute',
                                    background: 'rgba(255,255,255,0.55)',
                                    ...(vertical
                                        ? { left: 0, width: '100%', top: pos - 2, height: 4 }
                                        : { top: 0, height: '100%', left: pos - 2, width: 4 }),
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    background: color,
                                    ...(vertical
                                        ? { left: 0, width: '100%', top: pos - 1, height: 2 }
                                        : { top: 0, height: '100%', left: pos - 1, width: 2 }),
                                }}
                            />

                            {labelShown.get(limit.id) && (
                                <div
                                    data-aura-fill-limit-label={limit.id}
                                    style={{
                                        position: 'absolute',
                                        // A neutral backdrop, not the marker colour: white text on
                                        // whatever colour the user picked stops being readable as
                                        // soon as that colour is light. The LINE carries the
                                        // identity; the pill only has to stay legible on the fill.
                                        background: 'rgba(17,24,39,0.72)',
                                        color: '#fff',
                                        fontSize: 9,
                                        lineHeight: '13px',
                                        fontWeight: 600,
                                        padding: '0 4px',
                                        borderRadius: 4,
                                        whiteSpace: 'nowrap',
                                        // Inside the bar on purpose: the tank layouts already own
                                        // the outside (tick labels left, value label right).
                                        ...pillPos(pos, limit.draggable),
                                    }}
                                >
                                    {label}
                                </div>
                            )}

                            {limit.draggable && (
                                <div
                                    className="nodrag"
                                    data-aura-fill-limit-handle={limit.id}
                                    onPointerDown={(e) => startDrag(e, limit)}
                                    title={limit.label || label}
                                    style={{
                                        position: 'absolute',
                                        width: HIT_R * 2,
                                        height: HIT_R * 2,
                                        ...(vertical
                                            ? { left: box.width / 2 - HIT_R, top: pos - HIT_R }
                                            : { top: box.height / 2 - HIT_R, left: pos - HIT_R }),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        pointerEvents: 'auto',
                                        touchAction: 'none',
                                        cursor: vertical ? 'ns-resize' : 'ew-resize',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: HANDLE_R * 2,
                                            height: HANDLE_R * 2,
                                            borderRadius: '50%',
                                            background: '#fff',
                                            border: `2px solid ${color}`,
                                            boxShadow: isDragging
                                                ? `0 0 0 4px color-mix(in srgb, ${color} 35%, transparent)`
                                                : '0 1px 2px rgba(0,0,0,0.35)',
                                            transition: 'box-shadow 120ms',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
        </div>
    );
}
