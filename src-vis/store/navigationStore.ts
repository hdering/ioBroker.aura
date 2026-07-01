import { create } from 'zustand';

interface PendingNav {
    layoutId: string;
    tabId: string;
    /** Optional widget to pulse-highlight once the target tab is shown (Sprung: Widget). */
    widgetId?: string;
}

interface NavigationStore {
    pending: PendingNav | null;
    /** Id of the widget to visually highlight in the frontend, or null. Cleared after the pulse. */
    focusWidgetId: string | null;
    navigateTo: (layoutId: string, tabId: string, widgetId?: string) => void;
    consume: () => PendingNav | null;
    setFocusWidget: (id: string | null) => void;
}

export const useNavigationStore = create<NavigationStore>()((set, get) => ({
    pending: null,
    focusWidgetId: null,
    navigateTo: (layoutId, tabId, widgetId) => set({ pending: { layoutId, tabId, widgetId } }),
    consume: () => {
        const p = get().pending;
        if (p) set({ pending: null });
        return p;
    },
    setFocusWidget: (id) => set({ focusWidgetId: id }),
}));
