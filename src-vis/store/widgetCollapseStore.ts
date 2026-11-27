import { create } from 'zustand';
import { applyCollapseToggle, sameCollapseLink, type CollapseLink } from '../utils/widgetCollapse';

/**
 * Runtime (session-only) collapsed state for collapsible widgets, keyed by widget id.
 *
 * Not persisted: the *default* collapsed state lives in the widget config
 * (`options.defaultCollapsed`, see utils/widgetCollapse). This store only tracks
 * per-session user toggles so an expanded widget snaps back to its configured
 * default on reload. Three places read it: the GroupWidget (header chevron), the
 * WidgetFrame (collapsed header of every other type, issue #676) and the
 * Dashboard (outer-height shrink so the widgets below move up).
 *
 * `links` holds the link group of every mounted collapsible widget (issue #1038);
 * `toggle` lets the other members follow (applyCollapseToggle).
 */
export interface WidgetCollapseState {
    collapsed: Record<string, boolean>;
    links: Record<string, CollapseLink>;
    /** Seed a widget's collapsed flag from its config default, once — a later user
     *  toggle is never clobbered by a re-render seeding the same default again. */
    init: (id: string, def: boolean) => void;
    toggle: (id: string) => void;
    /** Register (or with null drop) a widget's link group. */
    setLink: (id: string, link: CollapseLink | null) => void;
}

export const useWidgetCollapseStore = create<WidgetCollapseState>()((set) => ({
    collapsed: {},
    links: {},
    init: (id, def) => set((s) => (id in s.collapsed ? s : { collapsed: { ...s.collapsed, [id]: def } })),
    toggle: (id) => set((s) => ({ collapsed: applyCollapseToggle(s.collapsed, s.links, id) })),
    setLink: (id, link) =>
        set((s) => {
            if (sameCollapseLink(s.links[id], link)) return s;
            const links = { ...s.links };
            if (link) links[id] = link;
            else delete links[id];
            return { links };
        }),
}));
