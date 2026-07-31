import { create } from 'zustand';

/**
 * Transient (RAM-only) map of widgetId → measured content height in px.
 * Widgets that support "auto height" (e.g. Statusübersicht) report their natural
 * content height here; the Dashboard reads it to size the grid item to the content
 * instead of the stored gridPos.h. Never persisted — recomputed live from the DOM.
 */
interface AutoHeightStore {
    heights: Record<string, number>;
    /**
     * groupId → measured header-bar height in px (0 when a group has no bar).
     * A group's outer box is sized as header + children (groupRows); guessing the
     * bar at a fixed 36/37px is short as soon as it holds a 20px icon or a master
     * control, and those few pixels raise the group's inner scrollbar in the editor.
     */
    groupHeaders: Record<string, number>;
    setHeight: (id: string, px: number) => void;
    setGroupHeader: (id: string, px: number) => void;
    clear: (id: string) => void;
}

export const useAutoHeightStore = create<AutoHeightStore>()((set) => ({
    heights: {},
    groupHeaders: {},
    setHeight: (id, px) => set((s) => (s.heights[id] === px ? s : { heights: { ...s.heights, [id]: px } })),
    setGroupHeader: (id, px) =>
        set((s) => (s.groupHeaders[id] === px ? s : { groupHeaders: { ...s.groupHeaders, [id]: px } })),
    clear: (id) =>
        set((s) => {
            if (!(id in s.heights)) return s;
            const next = { ...s.heights };
            delete next[id];
            return { heights: next };
        }),
}));
