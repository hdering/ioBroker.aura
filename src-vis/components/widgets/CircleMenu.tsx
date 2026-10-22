/**
 * Circle menu (#815) — the FTUI "circlemenu" as a shared control pattern.
 *
 * A round trigger fills the widget and shows the current state; a tap fans the
 * entries out on a circle (or half circle) around it. The widget owns the
 * entries and what they write — this component only draws and places them, so
 * the shutter, the thermostat and the enum can all offer it as `layout: 'circle'`.
 *
 * The open menu is portaled like PickerPopover: a widget's overflow must not clip
 * it, and the portal target may sit outside the scope that defines the theme
 * variables, so they are copied over from the trigger.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useEscapeLayer } from '../../utils/escapeStack';

export type CircleDirection = 'auto' | 'full' | 'top' | 'right' | 'bottom' | 'left';

export const CIRCLE_DIRECTIONS: CircleDirection[] = ['auto', 'full', 'top', 'right', 'bottom', 'left'];

export interface CircleMenuItem {
    key: string;
    content: React.ReactNode;
    /** Tooltip and accessible name. */
    title: string;
    active?: boolean;
    onSelect: () => void;
    /** Extra style for the entry, e.g. the shutter's direction colours. */
    style?: React.CSSProperties;
    /** Close the menu even with keepOpen — the entry opens something of its own. */
    closes?: boolean;
    /** Stay open even without keepOpen — a stepping entry (the thermostat's +/−) is pressed repeatedly. */
    stays?: boolean;
}

/**
 * The entries in the user's order (`circleOrder`, a list of entry keys). Keys
 * that no longer exist drop out; entries the list does not name yet (a preset
 * added later) keep their default order behind the named ones.
 */
export function applyCircleOrder<T extends { key: string }>(items: T[], order: unknown): T[] {
    if (!Array.isArray(order) || order.length === 0) return items;
    const byKey = new Map(items.map((it) => [it.key, it]));
    const named = [...new Set(order.filter((k): k is string => typeof k === 'string' && byKey.has(k)))];
    const seen = new Set(named);
    return [...named.map((k) => byKey.get(k)!), ...items.filter((it) => !seen.has(it.key))];
}

const THEME_VAR_NAMES = [
    '--app-bg',
    '--app-surface',
    '--app-border',
    '--text-primary',
    '--text-secondary',
    '--accent',
    '--accent-yellow',
] as const;

/** Room kept between neighbouring entries and to the window edge. */
const GAP = 8;
const EDGE = 8;

type Arc = { start: number; sweep: number; closed: boolean };

/** Angles in degrees, 0 = up, clockwise. The first entry leads (top or left), as one reads. */
const ARCS: Record<Exclude<CircleDirection, 'auto'>, Arc> = {
    full: { start: 0, sweep: 360, closed: true },
    top: { start: -90, sweep: 180, closed: false },
    right: { start: 0, sweep: 180, closed: false },
    bottom: { start: -90, sweep: -180, closed: false },
    left: { start: 0, sweep: -180, closed: false },
};

/** Smallest radius at which neighbours keep their gap and clear the centre button. */
function radiusFor(arc: Arc, n: number, itemSize: number): number {
    const minR = itemSize + GAP;
    const steps = arc.closed ? n : n - 1;
    if (steps < 1) return minR;
    const step = (Math.abs(arc.sweep) / steps) * (Math.PI / 180);
    const chord = Math.min(step, Math.PI); // two entries opposite each other need no more
    return Math.max(minR, (itemSize + GAP) / (2 * Math.sin(chord / 2)));
}

function placeItems(arc: Arc, n: number, r: number): { x: number; y: number }[] {
    const steps = arc.closed ? n : Math.max(1, n - 1);
    return Array.from({ length: n }, (_, i) => {
        const deg = arc.start + (n === 1 && !arc.closed ? arc.sweep / 2 : (arc.sweep * i) / steps);
        const rad = (deg * Math.PI) / 180;
        return { x: Math.sin(rad) * r, y: -Math.cos(rad) * r };
    });
}

/** Box around the centre button and all entries, relative to the centre. */
function extent(points: { x: number; y: number }[], itemSize: number) {
    const h = itemSize / 2;
    const xs = [0, ...points.map((p) => p.x)];
    const ys = [0, ...points.map((p) => p.y)];
    return {
        left: -Math.min(...xs) + h,
        right: Math.max(...xs) + h,
        top: -Math.min(...ys) + h,
        bottom: Math.max(...ys) + h,
    };
}

interface Layout {
    cx: number;
    cy: number;
    points: { x: number; y: number }[];
}

/**
 * Where the menu opens: the wanted arc around the trigger's centre. `auto` takes
 * the full circle when it fits into the window, else the half circle with the
 * most room. Whatever still sticks out moves the whole menu back in.
 */
function computeLayout(
    anchor: DOMRect,
    direction: CircleDirection,
    n: number,
    itemSize: number,
    vw: number,
    vh: number,
): Layout {
    let cx = anchor.left + anchor.width / 2;
    let cy = anchor.top + anchor.height / 2;
    const build = (d: Exclude<CircleDirection, 'auto'>) => {
        const arc = ARCS[d];
        const points = placeItems(arc, n, radiusFor(arc, n, itemSize));
        const e = extent(points, itemSize);
        // Smallest slack to any window edge — negative = sticks out.
        const slack = Math.min(cx - e.left, vw - cx - e.right, cy - e.top, vh - cy - e.bottom) - EDGE;
        return { points, e, slack };
    };
    let pick: ReturnType<typeof build>;
    if (direction === 'auto') {
        const full = build('full');
        if (full.slack >= 0) pick = full;
        else {
            const halves = (['top', 'right', 'bottom', 'left'] as const).map(build);
            pick = halves.reduce((a, b) => (b.slack > a.slack ? b : a));
        }
    } else {
        pick = build(direction);
    }
    const { e } = pick;
    cx = Math.min(Math.max(cx, e.left + EDGE), vw - e.right - EDGE);
    cy = Math.min(Math.max(cy, e.top + EDGE), vh - e.bottom - EDGE);
    return { cx, cy, points: pick.points };
}

export function CircleMenu({
    trigger,
    triggerTitle,
    triggerStyle,
    triggerRef: outerRef,
    items,
    direction = 'auto',
    itemSize = 48,
    keepOpen = false,
    shade = true,
    triggerSize,
    below,
    center,
}: {
    /** What the closed button shows (icon, value). */
    trigger: React.ReactNode;
    triggerTitle?: string;
    /** Ring colour etc. of the closed button. */
    triggerStyle?: React.CSSProperties;
    /** Lets the widget anchor its own popovers (e.g. the slat popover) to the trigger. */
    triggerRef?: React.RefObject<HTMLButtonElement>;
    items: CircleMenuItem[];
    direction?: CircleDirection;
    itemSize?: number;
    /** Stay open after an entry was picked. */
    keepOpen?: boolean;
    /** Darken the page behind the open menu. */
    shade?: boolean;
    /** Fixed diameter of the closed button in px; unset = as large as the widget allows. */
    triggerSize?: number;
    /** Drawn under the circle in the widget (title). */
    below?: React.ReactNode;
    /** Content of the centre button instead of the close cross, e.g. the live setpoint; a tap still closes. */
    center?: React.ReactNode;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const ownRef = useRef<HTMLButtonElement>(null);
    const btnRef = outerRef ?? ownRef;
    const [boxSize, setBoxSize] = useState(0);
    const [open, setOpen] = useState(false);

    // The trigger is round: as large as the box allows in both directions,
    // capped by a fixed size if one is set.
    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const update = () => setBoxSize(Math.max(0, Math.floor(Math.min(el.clientWidth, el.clientHeight))));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const diameter = triggerSize && triggerSize > 0 ? Math.min(boxSize, triggerSize) : boxSize;

    return (
        <div className="aura-circle-menu flex flex-col items-center h-full w-full min-h-0 gap-1">
            <div ref={boxRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
                <button
                    ref={btnRef}
                    type="button"
                    title={triggerTitle}
                    aria-label={triggerTitle}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen((o) => !o);
                    }}
                    className="aura-widget-action aura-circle-trigger nodrag flex flex-col items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{
                        width: diameter,
                        height: diameter,
                        visibility: diameter > 0 ? 'visible' : 'hidden',
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '2px solid var(--app-border)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        // Lets the content size itself to the circle (cqw).
                        containerType: 'size',
                        ...triggerStyle,
                    }}
                >
                    {trigger}
                </button>
            </div>
            {below}
            {open && (
                <CircleMenuPanel
                    anchorRef={btnRef}
                    items={items}
                    direction={direction}
                    itemSize={itemSize}
                    keepOpen={keepOpen}
                    shade={shade}
                    center={center}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

function CircleMenuPanel({
    anchorRef,
    items,
    direction,
    itemSize,
    keepOpen,
    shade,
    center,
    onClose,
}: {
    anchorRef: React.RefObject<HTMLElement>;
    items: CircleMenuItem[];
    direction: CircleDirection;
    itemSize: number;
    keepOpen: boolean;
    shade: boolean;
    center?: React.ReactNode;
    onClose: () => void;
}) {
    const portalTarget = usePortalTarget();
    const rootRef = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState<Layout | null>(null);
    // Entries start at the centre and fan out one frame later.
    const [spread, setSpread] = useState(false);

    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        const root = rootRef.current;
        if (!anchor || !root) return;
        const cs = getComputedStyle(anchor);
        for (const name of THEME_VAR_NAMES) {
            const v = cs.getPropertyValue(name).trim();
            if (v) root.style.setProperty(name, v);
        }
        setLayout(
            computeLayout(
                anchor.getBoundingClientRect(),
                direction,
                items.length,
                itemSize,
                window.innerWidth,
                window.innerHeight,
            ),
        );
        // Only the entry count decides the radius; picking one must not re-place the menu.
    }, [anchorRef, direction, items.length, itemSize]);

    useEffect(() => {
        if (!layout) return;
        const id = requestAnimationFrame(() => setSpread(true));
        return () => cancelAnimationFrame(id);
    }, [layout]);

    // A scrolled or resized page would leave the menu floating off its widget.
    useEffect(() => {
        const close = () => onClose();
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [onClose]);

    useEscapeLayer(onClose);

    const fontSize = Math.max(9, Math.round(itemSize * 0.26));

    return createPortal(
        <div
            ref={rootRef}
            role="menu"
            className="aura-circle-menu-panel nodrag fixed inset-0 z-[9999]"
            style={{
                background: shade ? 'rgba(0, 0, 0, 0.35)' : 'transparent',
                opacity: spread ? 1 : 0,
                transition: 'opacity 120ms ease-out',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >
            {layout &&
                items.map((it, i) => {
                    const p = layout.points[i];
                    return (
                        <button
                            key={it.key}
                            type="button"
                            role="menuitem"
                            title={it.title}
                            aria-label={it.title}
                            aria-pressed={it.active}
                            data-active={it.active ? '1' : undefined}
                            className="aura-circle-item absolute flex items-center justify-center rounded-full shadow-lg font-medium leading-tight text-center hover:opacity-90"
                            onClick={(e) => {
                                e.stopPropagation();
                                it.onSelect();
                                if (it.closes || (!keepOpen && !it.stays)) onClose();
                            }}
                            style={{
                                left: layout.cx - itemSize / 2,
                                top: layout.cy - itemSize / 2,
                                width: itemSize,
                                height: itemSize,
                                fontSize,
                                padding: 2,
                                overflow: 'hidden',
                                background: it.active ? 'var(--accent)' : 'var(--app-surface)',
                                color: it.active ? '#fff' : 'var(--text-primary)',
                                border: `1px solid ${it.active ? 'var(--accent)' : 'var(--app-border)'}`,
                                transform: spread ? `translate(${p.x}px, ${p.y}px)` : 'scale(0.3)',
                                transition: `transform 180ms cubic-bezier(.2,.8,.3,1.2) ${i * 15}ms`,
                                cursor: 'pointer',
                                ...it.style,
                            }}
                        >
                            {it.content}
                        </button>
                    );
                })}
            {layout && (
                <button
                    type="button"
                    title="Schließen"
                    aria-label="Schließen"
                    className="aura-circle-close absolute flex items-center justify-center rounded-full shadow-lg hover:opacity-90"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    style={{
                        left: layout.cx - itemSize / 2,
                        top: layout.cy - itemSize / 2,
                        width: itemSize,
                        height: itemSize,
                        background: 'var(--app-surface)',
                        color: center ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                        fontSize,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {center ?? <X size={Math.round(itemSize * 0.4)} />}
                </button>
            )}
        </div>,
        portalTarget,
    );
}
