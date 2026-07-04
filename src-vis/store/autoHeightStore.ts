import { create } from 'zustand';

/**
 * Transient (RAM-only) map of widgetId → measured content height in px.
 * Widgets that support "auto height" (e.g. Statusübersicht) report their natural
 * content height here; the Dashboard reads it to size the grid item to the content
 * instead of the stored gridPos.h. Never persisted — recomputed live from the DOM.
 */
interface AutoHeightStore {
    heights: Record<string, number>;
    setHeight: (id: string, px: number) => void;
    clear: (id: string) => void;
}

export const useAutoHeightStore = create<AutoHeightStore>()((set) => ({
    heights: {},
    setHeight: (id, px) => set((s) => (s.heights[id] === px ? s : { heights: { ...s.heights, [id]: px } })),
    clear: (id) =>
        set((s) => {
            if (!(id in s.heights)) return s;
            const next = { ...s.heights };
            delete next[id];
            return { heights: next };
        }),
}));
