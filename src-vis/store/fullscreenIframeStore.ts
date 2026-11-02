import { useEffect } from 'react';
import { create } from 'zustand';

interface FullscreenIframeStore {
    /** Widget id → number of iframe copies of it mounted inside the fullscreen overlay. */
    shown: Record<string, number>;
    add: (id: string) => void;
    remove: (id: string) => void;
}

const useFullscreenIframeStore = create<FullscreenIframeStore>()((set) => ({
    shown: {},
    add: (id) => set((s) => ({ shown: { ...s.shown, [id]: (s.shown[id] ?? 0) + 1 } })),
    remove: (id) =>
        set((s) => {
            const next = { ...s.shown };
            if ((next[id] ?? 0) <= 1) delete next[id];
            else next[id] -= 1;
            return { shown: next };
        }),
}));

/**
 * The fullscreen overlay renders a second copy of the widget while the tile stays
 * mounted underneath (issue #904). For an iframe that means two players of the same
 * stream — sound twice, out of step. Directly or as a group child, the copy in the
 * overlay announces itself here, and the tile drops its own frame until it closes.
 *
 * Returns true for the tile whose widget currently has a copy in the overlay.
 */
export function useIframeCoveredByFullscreen(id: string, inFullscreen: boolean, active: boolean): boolean {
    const add = useFullscreenIframeStore((s) => s.add);
    const remove = useFullscreenIframeStore((s) => s.remove);
    useEffect(() => {
        if (!inFullscreen || !active) return;
        add(id);
        return () => remove(id);
    }, [id, inFullscreen, active, add, remove]);
    return useFullscreenIframeStore((s) => !inFullscreen && (s.shown[id] ?? 0) > 0);
}
