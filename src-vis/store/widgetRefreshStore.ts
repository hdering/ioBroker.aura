import { create } from 'zustand';

/**
 * Per-widget reload counter (issue #537).
 *
 * An embedded document — iframe, camera stream, image — is opaque to Aura: the
 * page behind the URL can change without anything in the widget config changing,
 * so nothing ever triggers a re-render that would re-fetch it. Bumping a widget's
 * counter and mixing it into the `key` at every render site forces a remount,
 * which is the only reliable way to make a foreign document load again.
 *
 * The counter is keyed by widget id, so the same rule works for a widget on a
 * dashboard, inside a popup view and behind a mirror. Not persisted — a reload
 * request is meaningless after a page load.
 */
interface WidgetRefreshState {
    nonces: Record<string, number>;
    bump: (widgetId: string) => void;
}

export const useWidgetRefreshStore = create<WidgetRefreshState>()((set) => ({
    nonces: {},
    bump: (widgetId) => set((s) => ({ nonces: { ...s.nonces, [widgetId]: (s.nonces[widgetId] ?? 0) + 1 } })),
}));

/** Request a reload of one widget. Safe to call outside React. */
export function bumpWidgetRefresh(widgetId: string | undefined): void {
    if (!widgetId) return;
    useWidgetRefreshStore.getState().bump(widgetId);
}

/** Reload counter of one widget — mix into the rendered widget's `key`. */
export function useWidgetRefreshNonce(widgetId: string | undefined): number {
    return useWidgetRefreshStore((s) => (widgetId ? (s.nonces[widgetId] ?? 0) : 0));
}
