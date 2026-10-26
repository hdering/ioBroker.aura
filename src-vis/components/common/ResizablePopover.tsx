import { useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../../i18n';

/**
 * Settings popovers (section / tab gear) that the user can drag wider (#850).
 *
 * The width is remembered per popover AND per base width: a tab panel is 256 px
 * collapsed and wide with conditions/markers open, and widening the collapsed one
 * must not shrink the open one.
 */
const KEY_PREFIX = 'aura-panel-width:';
const MIN_WIDTH = 240;
/** Larger than any clamp margin the callers use, so the panel never flips anchor mid-drag. */
const VIEWPORT_GAP = 16;

function storageKey(id: string, base: number) {
    return `${KEY_PREFIX}${id}:${base}`;
}

function readWidth(id: string, base: number): number | null {
    try {
        const raw = localStorage.getItem(storageKey(id, base));
        const n = raw ? Number(raw) : NaN;
        return Number.isFinite(n) && n >= MIN_WIDTH ? n : null;
    } catch {
        return null;
    }
}

export function usePanelWidth(id: string, base: number) {
    // Re-read when the base flips (collapsed ↔ open) — each has its own value.
    const [custom, setCustom] = useState<{ base: number; width: number | null }>(() => ({
        base,
        width: readWidth(id, base),
    }));
    const stored = custom.base === base ? custom.width : readWidth(id, base);
    if (custom.base !== base) setCustom({ base, width: stored });

    const viewport = typeof window !== 'undefined' ? window.innerWidth - VIEWPORT_GAP : Infinity;
    const width = Math.max(Math.min(MIN_WIDTH, viewport), Math.min(stored ?? base, viewport));

    const set = (w: number | null) => {
        setCustom({ base, width: w });
        try {
            if (w == null) localStorage.removeItem(storageKey(id, base));
            else localStorage.setItem(storageKey(id, base), String(Math.round(w)));
        } catch {
            /* private mode — the width just isn't remembered */
        }
    };
    return { width, setWidth: set, resetWidth: () => set(null) };
}

/**
 * Fixed popover shell with a drag handle on its free edge. The handle sits on the
 * right unless the panel had to be pushed left to fit the viewport (`pinnedRight`)
 * — then the right edge is the fixed one and only the left edge can move.
 * Scrolling happens in an inner box so the handle stays put while the content scrolls.
 */
export function ResizablePopover({
    style,
    className,
    width,
    onResize,
    onReset,
    pinnedRight,
    children,
}: {
    /** Position, size and look of the shell (top/left/width/maxHeight/background/border). */
    style: CSSProperties;
    /** Classes of the scrolling content box (padding, spacing). */
    className?: string;
    width: number;
    onResize: (w: number) => void;
    onReset: () => void;
    pinnedRight: boolean;
    children: ReactNode;
}) {
    const t = useT();
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const panel = e.currentTarget.parentElement;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
            const raw = pinnedRight ? rect.right - ev.clientX : ev.clientX - rect.left;
            const max = pinnedRight ? rect.right - 8 : window.innerWidth - rect.left - VIEWPORT_GAP;
            onResize(Math.round(Math.max(MIN_WIDTH, Math.min(raw, max))));
        };
        const up = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
    };

    return (
        <div className="fixed z-[999] rounded-xl shadow-2xl flex flex-col" style={{ ...style, width }}>
            <div className={`aura-scroll overflow-y-auto min-h-0 flex-1 ${className ?? ''}`}>{children}</div>
            <div
                data-aura-panel-resize={pinnedRight ? 'left' : 'right'}
                onPointerDown={onPointerDown}
                onDoubleClick={onReset}
                title={t('tabBar.panelResize')}
                className="absolute top-0 bottom-0 w-2 cursor-ew-resize touch-none group"
                style={pinnedRight ? { left: -4 } : { right: -4 }}
            >
                <div
                    className="absolute top-1/2 -translate-y-1/2 left-[3px] w-0.5 h-8 rounded-full opacity-30 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'var(--accent)' }}
                />
            </div>
        </div>
    );
}
