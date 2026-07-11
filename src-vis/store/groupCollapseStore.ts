import { create } from 'zustand';

/**
 * Runtime (session-only) collapsed state for group widgets, keyed by widget id.
 *
 * Not persisted: the *default* collapsed state lives in the widget config
 * (`options.defaultCollapsed`). This store only tracks per-session user toggles
 * so an expanded group snaps back to its configured default on reload. Both the
 * GroupWidget (header chevron) and the Dashboard (outer-height shrink) read it.
 */
export interface GroupCollapseState {
    collapsed: Record<string, boolean>;
    /** Seed a group's collapsed flag from its config default, once — a later user
     *  toggle is never clobbered by a re-render seeding the same default again. */
    init: (id: string, def: boolean) => void;
    toggle: (id: string) => void;
}

export const useGroupCollapseStore = create<GroupCollapseState>()((set) => ({
    collapsed: {},
    init: (id, def) => set((s) => (id in s.collapsed ? s : { collapsed: { ...s.collapsed, [id]: def } })),
    toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
}));
