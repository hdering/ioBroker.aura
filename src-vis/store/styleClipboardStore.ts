import { create } from 'zustand';
import type { WidgetConfig } from '../types';
import { extractWidgetStyle, type WidgetStyle } from '../utils/widgetStyle';

/**
 * The single style slot behind "Stil kopieren / Stil einfügen" (issue #654).
 *
 * Deliberately not persisted: a copied style is a gesture inside one editing
 * session, and a slot that survives a reload would offer to paste a look the
 * user has long forgotten about. It is a store rather than a module variable so
 * every widget's menu re-renders the moment something is copied — otherwise the
 * "Stil einfügen" entry would stay greyed out on widgets that are already
 * mounted.
 */
interface StyleClipboardState {
    style: WidgetStyle | null;
    copy: (config: WidgetConfig) => void;
    clear: () => void;
}

export const useStyleClipboardStore = create<StyleClipboardState>()((set) => ({
    style: null,
    copy: (config) => set({ style: extractWidgetStyle(config) }),
    clear: () => set({ style: null }),
}));

/** The style currently on the clipboard, or null. */
export function useCopiedStyle(): WidgetStyle | null {
    return useStyleClipboardStore((s) => s.style);
}
