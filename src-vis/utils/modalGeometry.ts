import { useEffect, useState } from 'react';

/**
 * Geometry helpers shared by the draggable/resizable modals (CenteredModal in
 * WidgetFrame, ConfigModal for the sub-editors).
 *
 * The remembered size is a *preference*, not a layout: a dialog sized on a large
 * screen (RDP session, external monitor) must not keep that height on the small
 * built-in display afterwards — a centered box taller than the viewport pushes its
 * title bar with the close button above the top edge. So the stored value stays
 * untouched and only the rendered size is clamped to the current window.
 */

export type ModalSize = { w: number; h: number };
export type ModalPos = { x: number; y: number };

/** Breathing room so the modal never sits flush against the window edge. */
const MARGIN = 20;
/** How much of the title bar must stay on screen to remain grabbable. */
const HANDLE_W = 80;
const HANDLE_H = 40;

export function clampModalSize(size: ModalSize): ModalSize {
    return {
        w: Math.min(size.w, Math.max(200, window.innerWidth - MARGIN)),
        h: Math.min(size.h, Math.max(160, window.innerHeight - MARGIN)),
    };
}

export function clampModalPos(pos: ModalPos, el: HTMLElement | null): ModalPos {
    const rect = el?.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - HANDLE_W);
    const maxY = Math.max(0, window.innerHeight - HANDLE_H);
    // Dragging left past the edge is allowed as long as the header's right end stays visible.
    const minX = rect ? Math.min(0, -(rect.width - HANDLE_W)) : 0;
    return {
        x: Math.min(maxX, Math.max(minX, pos.x)),
        y: Math.min(maxY, Math.max(0, pos.y)),
    };
}

/**
 * Persisted modal size. Returns the size to render (clamped to the window) plus the
 * setter for the raw preference, and follows window resizes so a dialog that is open
 * while the resolution changes (RDP disconnect) stays fully reachable.
 */
export function usePersistedModalSize(storageKey?: string) {
    const [pref, setPref] = useState<ModalSize | null>(() => {
        if (!storageKey) return null;
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
            if (typeof parsed?.w === 'number' && typeof parsed?.h === 'number') return { w: parsed.w, h: parsed.h };
        } catch {
            /* ignore */
        }
        return null;
    });

    useEffect(() => {
        if (!storageKey || !pref) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(pref));
        } catch {
            /* ignore */
        }
    }, [storageKey, pref]);

    // Re-render on resize so the clamp below is recomputed against the new viewport.
    const [, bump] = useState(0);
    useEffect(() => {
        if (!storageKey) return;
        const onResize = () => bump((n) => n + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [storageKey]);

    return [pref ? clampModalSize(pref) : null, setPref] as const;
}
