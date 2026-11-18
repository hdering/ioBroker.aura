import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How long after a trigger the flow keeps following content that is still growing. */
export const FLOW_SETTLE_MS = 1500;

/** The flow's own widget boxes — not widgets nested inside groups or popups. */
const BOX_SELECTOR = '[data-aura-flow-cols] > [data-aura-widget], [data-aura-flow-col] > [data-aura-widget]';

/**
 * Measured box heights of the active tab's flow cards, for filling the columns by
 * height (#939). The snapshot is FROZEN while the user works: it is taken when the
 * tab opens and when `triggerKey` changes (width, column count, fill mode, the set of
 * widgets) — before paint, so a corrected deal never flashes. For a short settling
 * phase afterwards (lists and groups growing to their data) it follows size changes;
 * the first tap, click or key in the dashboard ends that phase at once. Unfolding a
 * card later never re-deals the columns — that only happens on the next trigger,
 * e.g. when the tab is opened again (wish of the issue author: nothing may jump
 * under the finger).
 */
export function useFlowHeights(
    root: HTMLElement | null,
    activeTabId: string | undefined,
    triggerKey: string,
    enabled: boolean,
): Record<string, number> {
    const [heights, setHeights] = useState<Record<string, number>>({});
    const settleUntil = useRef(0);

    const measure = useCallback(() => {
        if (!root || !activeTabId) return;
        const tab = root.querySelector<HTMLElement>(`[data-aura-tab-id="${CSS.escape(activeTabId)}"]`);
        if (!tab) return;
        const next: Record<string, number> = {};
        tab.querySelectorAll<HTMLElement>(BOX_SELECTOR).forEach((el) => {
            const id = el.dataset.auraWidget;
            const h = el.offsetHeight;
            if (id && h > 0) next[id] = h;
        });
        setHeights((prev) => {
            let changed = false;
            for (const id in next) {
                if (Math.abs((prev[id] ?? -1) - next[id]) > 2) {
                    changed = true;
                    break;
                }
            }
            return changed ? { ...prev, ...next } : prev;
        });
    }, [root, activeTabId]);

    // Trigger: snapshot before paint and open the settling window.
    useLayoutEffect(() => {
        if (!enabled) return;
        settleUntil.current = Date.now() + FLOW_SETTLE_MS;
        measure();
    }, [enabled, triggerKey, measure]);

    // Any interaction ends the settling phase — from then on nothing moves.
    useEffect(() => {
        if (!enabled || !root) return;
        const stop = () => {
            settleUntil.current = 0;
        };
        root.addEventListener('pointerdown', stop, true);
        root.addEventListener('keydown', stop, true);
        root.addEventListener('wheel', stop, { capture: true, passive: true });
        return () => {
            root.removeEventListener('pointerdown', stop, true);
            root.removeEventListener('keydown', stop, true);
            root.removeEventListener('wheel', stop, true);
        };
    }, [enabled, root]);

    // Settling phase: follow boxes that are still growing to their content. Re-armed
    // after every re-deal (the boxes may sit in new columns, i.e. be new elements).
    useEffect(() => {
        if (!enabled || !root || !activeTabId) return;
        const left = settleUntil.current - Date.now();
        if (left <= 0 || typeof ResizeObserver === 'undefined') return;
        const tab = root.querySelector<HTMLElement>(`[data-aura-tab-id="${CSS.escape(activeTabId)}"]`);
        if (!tab) return;
        let frame = 0;
        const ro = new ResizeObserver(() => {
            if (Date.now() > settleUntil.current) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        tab.querySelectorAll<HTMLElement>(BOX_SELECTOR).forEach((el) => ro.observe(el));
        const timer = window.setTimeout(() => ro.disconnect(), left);
        return () => {
            ro.disconnect();
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [enabled, root, activeTabId, triggerKey, heights, measure]);

    return heights;
}
