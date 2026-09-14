import { create } from 'zustand';
import type { WidgetConfig } from '../types';

export interface WidgetFullscreenTarget {
    /** The widget that was opened — looked up live so later config edits apply. */
    widgetId: string;
    /**
     * The config as it was rendered when fullscreen was opened, including condition
     * overrides. Used as the fallback for widgets that live outside `tabs[].widgets`
     * (group children are kept in useGroupDefsStore, popup-view cells nowhere at all).
     */
    snapshot: WidgetConfig;
}

interface WidgetFullscreenStore {
    target: WidgetFullscreenTarget | null;
    setTarget: (target: WidgetFullscreenTarget | null) => void;
}

/**
 * Kept apart from `iframeStore`: that one carries a URL and its own sandbox/reload
 * rules for a foreign document, this one re-renders an Aura widget.
 */
export const useWidgetFullscreenStore = create<WidgetFullscreenStore>()((set) => ({
    target: null,
    setTarget: (target) => set({ target }),
}));
