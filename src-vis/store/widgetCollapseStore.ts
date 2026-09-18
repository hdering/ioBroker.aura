import { create } from 'zustand';

/**
 * Runtime (session-only) collapsed state for collapsible widgets, keyed by widget id.
 *
 * Not persisted: the *default* collapsed state lives in the widget config
 * (`options.defaultCollapsed`, see utils/widgetCollapse). This store only tracks
 * per-session user toggles so an expanded widget snaps back to its configured
 * default on reload. Three places read it: the GroupWidget (header chevron), the
 * WidgetFrame (collapsed header of every other type, issue #676) and the
 * Dashboard (outer-height shrink so the widgets below move up).
 */
export interface WidgetCollapseState {
    collapsed: Record<string, boolean>;
    /** Seed a widget's collapsed flag from its config default, once — a later user
     *  toggle is never clobbered by a re-render seeding the same default again. */
    init: (id: string, def: boolean) => void;
    toggle: (id: string) => void;
}

export const useWidgetCollapseStore = create<WidgetCollapseState>()((set) => ({
    collapsed: {},
    init: (id, def) => set((s) => (id in s.collapsed ? s : { collapsed: { ...s.collapsed, [id]: def } })),
    toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
}));
