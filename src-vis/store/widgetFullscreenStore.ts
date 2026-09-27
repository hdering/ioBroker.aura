import { create } from 'zustand';
import type { WidgetConfig } from '../types';
import { exitScreenFullscreen } from '../utils/fullscreenButton';

export interface WidgetFullscreenTarget {
    /** The widget that was opened — looked up live so later config edits apply. */
    widgetId: string;
    /**
     * The config as it was rendered when fullscreen was opened, including condition
     * overrides. Used as the fallback for widgets that live outside `tabs[].widgets`
     * (group children are kept in useGroupDefsStore, popup-view cells nowhere at all).
     */
    snapshot: WidgetConfig;
    /**
     * Aura put the page into browser fullscreen when opening (issue #711), so closing
     * leaves it again and the overlay closes itself when the browser exits.
     */
    ownsScreen?: boolean;
}

interface WidgetFullscreenStore {
    target: WidgetFullscreenTarget | null;
    setTarget: (target: WidgetFullscreenTarget | null) => void;
}

/**
 * Kept apart from `iframeStore`: that one carries a URL and its own sandbox/reload
 * rules for a foreign document, this one re-renders an Aura widget.
 *
 * Browser fullscreen is handed back here, when the target is cleared, and not when
 * the overlay unmounts: going fullscreen resizes the window, and when that crosses
 * a breakpoint the Dashboard swaps between grid and phone flow and remounts the
 * overlay — which then dropped the fullscreen it had just gained (#711, Firefox on
 * a phone in landscape, where the status and navigation bars join the page).
 */
export const useWidgetFullscreenStore = create<WidgetFullscreenStore>()((set, get) => ({
    target: null,
    setTarget: (target) => {
        const prev = get().target;
        if (prev?.ownsScreen && !target?.ownsScreen && typeof document !== 'undefined') exitScreenFullscreen(document);
        set({ target });
    },
}));
