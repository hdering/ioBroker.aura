import { create } from 'zustand';

interface PendingNav {
    layoutId: string;
    tabId: string;
}

interface NavigationStore {
    pending: PendingNav | null;
    navigateTo: (layoutId: string, tabId: string) => void;
    consume: () => PendingNav | null;
}

export const useNavigationStore = create<NavigationStore>()((set, get) => ({
    pending: null,
    navigateTo: (layoutId, tabId) => set({ pending: { layoutId, tabId } }),
    consume: () => {
        const p = get().pending;
        if (p) set({ pending: null });
        return p;
    },
}));
