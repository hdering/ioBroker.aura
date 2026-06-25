import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage, flushKey, withSuppressedDirty } from './persistManager';
import { useGroupDefsStore, newGroupDefId, cloneGroupDef } from './groupDefsStore';
import { slugify } from '../utils/slugify';
import type { WidgetConfig, WidgetCondition } from '../types';
import type { AllVars } from '../themes';

// ── Tab bar items (clock / datapoint / static text) ───────────────────────────

export interface TabBarItem {
    id: string;
    type: 'clock' | 'datapoint' | 'text';
    position: 'left' | 'center' | 'right';
    // clock
    clockDisplay?: 'time' | 'date' | 'datetime';
    clockShowSeconds?: boolean;
    clockDateLength?: 'short' | 'long';
    clockCustomFormat?: string;
    // datapoint
    datapointId?: string;
    datapointTemplate?: string;
    // static text
    text?: string;
}

export interface TabBarSettings {
    height?: number; // px, default ~40
    background?: string; // CSS color or var(--...)
    activeColor?: string; // active tab text + indicator
    inactiveColor?: string; // inactive tab text
    indicatorStyle?: 'underline' | 'filled' | 'pills';
    fontSize?: number | 'sm' | 'md' | 'lg'; // px when number; legacy keyword sizes still resolved
    iconSize?: number; // tab icon size in px, default 14
    tabsAlignment?: 'left' | 'center' | 'right'; // navigation tabs position
    items?: TabBarItem[];
}

/**
 * Merge a global tab-bar config with an optional per-layout override.
 * Every defined field in the layout override wins; undefined fields inherit
 * the global value. `items` is overridden as a whole array (not merged).
 */
export function resolveTabBarSettings(
    global: TabBarSettings | undefined,
    layout: TabBarSettings | undefined,
): TabBarSettings {
    const merged: TabBarSettings = { ...(global ?? {}) };
    const ov = layout ?? {};
    (Object.keys(ov) as (keyof TabBarSettings)[]).forEach((k) => {
        if (ov[k] !== undefined) (merged as Record<string, unknown>)[k] = ov[k];
    });
    return merged;
}

// ── Per-layout overrideable settings ──────────────────────────────────────────
// All fields are optional; undefined = inherit from global.
export interface LayoutSettings {
    // Theme
    themeId?: string;
    customVars?: Partial<AllVars>;
    // CSS
    customCSS?: string;
    customCSSEnabled?: boolean;
    customCSSInEditor?: boolean;
    // JS
    customJS?: string;
    customJSEnabled?: boolean;
    customJSInEditor?: boolean;
    // Typography
    fontScale?: number;
    // Spacing (Theme section)
    gridGap?: number;
    widgetPadding?: number;
    // Grid & Mobile
    gridRowHeight?: number;
    gridSnapX?: number;
    mobileBreakpoint?: number;
    // Guidelines
    guidelinesEnabled?: boolean;
    guidelinesWidth?: number;
    guidelinesHeight?: number;
    guidelinesShowInFrontend?: boolean;
    // Tab bar appearance & items
    tabBar?: TabBarSettings;
}

export interface Tab {
    id: string;
    name: string;
    slug: string;
    widgets: WidgetConfig[];
    icon?: string; // icon name from WIDGET_ICON_MAP
    hideLabel?: boolean; // show only icon, hide text
    disabled?: boolean; // hidden in frontend, shown grayed-out in editor
    hidden?: boolean; // removed from the tab bar, but still reachable via its direct slug URL
    conditions?: WidgetCondition[]; // DP-based style/visibility conditions for tab button
}

export interface DashboardLayout {
    id: string;
    name: string;
    slug: string;
    tabs: Tab[];
    activeTabId: string;
    defaultTabId?: string; // tab shown when frontend opens without a tab slug
    icon?: string; // icon name (Iconify ID or lucide PascalCase) for layout drawer
    settings?: LayoutSettings; // per-layout overrides (undefined = use global)
}

// ── helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_TAB: Tab = { id: 'default', name: 'Dashboard', slug: 'dashboard', widgets: [] };

function makeDefaultLayout(): DashboardLayout {
    return { id: 'layout-default', name: 'Standard', slug: 'default', tabs: [DEFAULT_TAB], activeTabId: 'default' };
}

/** Apply fn to the layout with the given id */
function patchLayout(
    layouts: DashboardLayout[],
    layoutId: string,
    fn: (l: DashboardLayout) => DashboardLayout,
): DashboardLayout[] {
    return layouts.map((l) => (l.id === layoutId ? fn(l) : l));
}

function ensureSlugs(tabs: Tab[]): Tab[] {
    const seen = new Set<string>();
    return tabs.map((t) => {
        if (!t.slug) {
            const base = slugify(t.name ?? t.id);
            let slug = base;
            let i = 2;
            while (seen.has(slug)) slug = `${base}-${i++}`;
            seen.add(slug);
            return { ...t, slug };
        }
        seen.add(t.slug);
        return t;
    });
}

function uniqueLayoutSlug(base: string, layouts: DashboardLayout[]): string {
    const seen = new Set(layouts.map((l) => l.slug));
    let slug = base;
    let i = 2;
    while (seen.has(slug)) slug = `${base}-${i++}`;
    return slug;
}

function uniqueTabSlug(base: string, tabs: Tab[]): string {
    const seen = new Set(tabs.map((t) => t.slug));
    let slug = base;
    let i = 2;
    while (seen.has(slug)) slug = `${base}-${i++}`;
    return slug;
}

// ── GROUP widget helpers ──────────────────────────────────────────────────────

/** Deep-clone a widget: GROUP / PANELS widgets get a fresh defId with cloned children. */
function cloneWidgetDef(w: WidgetConfig): WidgetConfig {
    if ((w.type === 'group' || w.type === 'panels') && w.options?.defId) {
        return { ...w, options: { ...w.options, defId: cloneGroupDef(w.options.defId as string) } };
    }
    return w;
}

/**
 * Migrate a GROUP widget from the old format (options.children) to the new
 * format (options.defId + groupDefsStore). Handles nested GROUP widgets.
 */
function migrateGroupWidget(w: WidgetConfig): WidgetConfig {
    if (w.type !== 'group') return w;
    if (w.options?.defId && !w.options?.children) return w; // already migrated
    const children = ((w.options?.children ?? []) as WidgetConfig[]).map(migrateGroupWidget);
    const defId = newGroupDefId();
    useGroupDefsStore.getState().setDef(defId, children);
    const { children: _removed, ...restOptions } = (w.options ?? {}) as Record<string, unknown>;
    return { ...w, options: { ...restOptions, defId } };
}

// ── state ─────────────────────────────────────────────────────────────────────

interface DashboardState {
    layouts: DashboardLayout[];
    activeLayoutId: string;
    editMode: boolean;

    // ── Layout CRUD ──────────────────────────────────────────────────────────
    addLayout: (name: string) => void;
    addLayoutFromImport: (layoutData: Omit<DashboardLayout, 'id'>) => void;
    duplicateLayout: (id: string, newName: string) => void;
    removeLayout: (id: string) => void;
    renameLayout: (id: string, name: string) => void;
    setLayoutSlug: (id: string, slug: string) => void;
    setLayoutIcon: (id: string, icon: string | undefined) => void;
    reorderLayouts: (fromIndex: number, toIndex: number) => void;
    setActiveLayout: (id: string) => void;

    // ── Tab CRUD (on activeLayoutId) ─────────────────────────────────────────
    addTab: (name: string) => void;
    addTabFromImport: (tabData: Omit<Tab, 'id'>) => void;
    removeTab: (id: string) => void;
    renameTab: (id: string, name: string) => void;
    updateTab: (
        id: string,
        patch: Partial<Pick<Tab, 'name' | 'slug' | 'icon' | 'hideLabel' | 'disabled' | 'hidden' | 'conditions'>>,
    ) => void;
    setTabSlug: (id: string, slug: string) => void;
    setActiveTab: (id: string) => void;
    setActiveLayoutAndTab: (layoutId: string, tabId: string) => void;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
    setDefaultTab: (layoutId: string, tabId: string) => void;

    // ── Widget CRUD ──────────────────────────────────────────────────────────
    addWidget: (widget: WidgetConfig) => void;
    addWidgetToTab: (tabId: string, widget: WidgetConfig) => void;
    removeWidget: (id: string) => void;
    removeWidgetInTab: (tabId: string, widgetId: string) => void;
    updateWidget: (id: string, config: Partial<WidgetConfig>) => void;
    updateWidgetInTab: (tabId: string, widgetId: string, config: Partial<WidgetConfig>) => void;
    updateLayouts: (widgets: WidgetConfig[]) => void;
    rescaleAllWidgetsX: (factor: number) => void;

    /** Cross-layout variants – operate on an explicit layoutId */
    addWidgetToLayoutTab: (layoutId: string, tabId: string, widget: WidgetConfig) => void;
    removeWidgetFromLayoutTab: (layoutId: string, tabId: string, widgetId: string) => void;

    setEditMode: (editMode: boolean) => void;

    /** Update per-layout settings (pass undefined values to clear individual fields) */
    updateLayoutSettings: (layoutId: string, patch: Partial<LayoutSettings>) => void;
    /** Clear all per-layout settings for a layout (revert to global) */
    clearLayoutSettings: (layoutId: string, key: keyof LayoutSettings) => void;
}

// ── store ─────────────────────────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>()(
    persist(
        (set) => ({
            layouts: [makeDefaultLayout()],
            activeLayoutId: 'layout-default',
            editMode: false,

            // ── Layout CRUD ────────────────────────────────────────────────────────

            addLayout: (name) => {
                const id = `layout-${Date.now()}`;
                set((s) => ({
                    layouts: [
                        ...s.layouts,
                        {
                            id,
                            name,
                            slug: uniqueLayoutSlug(slugify(name), s.layouts),
                            tabs: [{ ...DEFAULT_TAB, id: `tab-${Date.now()}`, slug: 'dashboard' }],
                            activeTabId: `tab-${Date.now()}`,
                        },
                    ],
                    activeLayoutId: id,
                }));
            },

            addLayoutFromImport: (layoutData) => {
                const id = `layout-${Date.now()}`;
                set((s) => ({
                    layouts: [
                        ...s.layouts,
                        {
                            ...layoutData,
                            id,
                            slug: uniqueLayoutSlug(slugify(layoutData.slug || layoutData.name), s.layouts),
                            tabs: ensureSlugs(layoutData.tabs),
                        },
                    ],
                    activeLayoutId: id,
                }));
            },

            duplicateLayout: (id, newName) => {
                const newId = `layout-${Date.now()}`;
                set((s) => {
                    const src = s.layouts.find((l) => l.id === id);
                    if (!src) return {};
                    const dup: DashboardLayout = JSON.parse(JSON.stringify(src));
                    dup.id = newId;
                    dup.name = newName;
                    dup.slug = uniqueLayoutSlug(slugify(newName), s.layouts);
                    dup.tabs = dup.tabs.map((tab) => ({
                        ...tab,
                        widgets: tab.widgets.map(cloneWidgetDef),
                    }));
                    return { layouts: [...s.layouts, dup], activeLayoutId: newId };
                });
            },

            removeLayout: (id) =>
                set((s) => {
                    if (s.layouts.length <= 1) return {};
                    const layouts = s.layouts.filter((l) => l.id !== id);
                    const activeLayoutId = s.activeLayoutId === id ? layouts[0].id : s.activeLayoutId;
                    return { layouts, activeLayoutId };
                }),

            renameLayout: (id, name) => set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, name })) })),

            setLayoutSlug: (id, slug) => set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, slug })) })),

            setLayoutIcon: (id, icon) => set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, icon })) })),

            reorderLayouts: (fromIndex, toIndex) =>
                set((s) => {
                    if (fromIndex === toIndex) return {};
                    if (fromIndex < 0 || fromIndex >= s.layouts.length) return {};
                    if (toIndex < 0 || toIndex >= s.layouts.length) return {};
                    const layouts = [...s.layouts];
                    const [moved] = layouts.splice(fromIndex, 1);
                    layouts.splice(toIndex, 0, moved);
                    return { layouts };
                }),

            setActiveLayout: (id) => {
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() => set({ activeLayoutId: id }));
                flushKey('aura-dashboard');
            },

            // ── Tab CRUD ───────────────────────────────────────────────────────────

            addTab: (name) => {
                const id = `tab-${Date.now()}`;
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        const slug = uniqueTabSlug(slugify(name), l.tabs);
                        return { ...l, tabs: [...l.tabs, { id, name, slug, widgets: [] }], activeTabId: id };
                    }),
                }));
            },

            addTabFromImport: (tabData) => {
                const id = `tab-${Date.now()}`;
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        const slug = uniqueTabSlug(tabData.slug || slugify(tabData.name), l.tabs);
                        return { ...l, tabs: [...l.tabs, { ...tabData, id, slug }], activeTabId: id };
                    }),
                }));
            },

            removeTab: (id) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        const tabs = l.tabs.filter((t) => t.id !== id);
                        if (tabs.length === 0) tabs.push({ ...DEFAULT_TAB, id: `tab-${Date.now()}` });
                        return { ...l, tabs, activeTabId: l.activeTabId === id ? tabs[0].id : l.activeTabId };
                    }),
                })),

            renameTab: (id, name) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
                    })),
                })),

            updateTab: (id, patch) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
                    })),
                })),

            setTabSlug: (id, slug) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === id ? { ...t, slug } : t)),
                    })),
                })),

            setActiveTab: (id) => {
                let changed = false;
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => {
                        const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
                        if (layout?.activeTabId === id) return s;
                        changed = true;
                        return {
                            layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({ ...l, activeTabId: id })),
                        };
                    }),
                );
                if (changed) flushKey('aura-dashboard');
            },

            setActiveLayoutAndTab: (layoutId, tabId) => {
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => ({
                        activeLayoutId: layoutId,
                        layouts: patchLayout(s.layouts, layoutId, (l) => ({ ...l, activeTabId: tabId })),
                    })),
                );
                flushKey('aura-dashboard');
            },

            reorderTabs: (fromIndex, toIndex) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        const tabs = [...l.tabs];
                        const [moved] = tabs.splice(fromIndex, 1);
                        tabs.splice(toIndex, 0, moved);
                        return { ...l, tabs };
                    }),
                })),

            setDefaultTab: (layoutId, tabId) =>
                set((s) => ({ layouts: patchLayout(s.layouts, layoutId, (l) => ({ ...l, defaultTabId: tabId })) })),

            // ── Widget CRUD ────────────────────────────────────────────────────────

            addWidget: (widget) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === l.activeTabId ? { ...t, widgets: [...t.widgets, widget] } : t,
                        ),
                    })),
                })),

            addWidgetToTab: (tabId, widget) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t)),
                    })),
                })),

            removeWidget: (id) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === l.activeTabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== id) } : t,
                        ),
                    })),
                })),

            removeWidgetInTab: (tabId, widgetId) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
                        ),
                    })),
                })),

            addWidgetToLayoutTab: (layoutId, tabId, widget) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t)),
                    })),
                })),

            removeWidgetFromLayoutTab: (layoutId, tabId, widgetId) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
                        ),
                    })),
                })),

            updateWidget: (id, config) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === l.activeTabId
                                ? { ...t, widgets: t.widgets.map((w) => (w.id === id ? { ...w, ...config } : w)) }
                                : t,
                        ),
                    })),
                })),

            updateWidgetInTab: (tabId, widgetId, config) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) =>
                            t.id === tabId
                                ? { ...t, widgets: t.widgets.map((w) => (w.id === widgetId ? { ...w, ...config } : w)) }
                                : t,
                        ),
                    })),
                })),

            updateLayouts: (widgets) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        tabs: l.tabs.map((t) => (t.id === l.activeTabId ? { ...t, widgets } : t)),
                    })),
                })),

            rescaleAllWidgetsX: (factor) =>
                set((s) => ({
                    layouts: s.layouts.map((l) => ({
                        ...l,
                        tabs: l.tabs.map((tab) => ({
                            ...tab,
                            widgets: tab.widgets.map((w) => ({
                                ...w,
                                gridPos: {
                                    ...w.gridPos,
                                    x: Math.max(0, Math.round(w.gridPos.x * factor)),
                                    w: Math.max(1, Math.round(w.gridPos.w * factor)),
                                },
                            })),
                        })),
                    })),
                })),

            setEditMode: (editMode) => set({ editMode }),

            updateLayoutSettings: (layoutId, patch) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({
                        ...l,
                        settings: { ...l.settings, ...patch },
                    })),
                })),

            clearLayoutSettings: (layoutId, key) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => {
                        if (!l.settings) return l;
                        const next = { ...l.settings };
                        delete next[key];
                        return { ...l, settings: Object.keys(next).length > 0 ? next : undefined };
                    }),
                })),
        }),
        {
            name: 'aura-dashboard',
            storage: createJSONStorage(() => managedStorage),
            merge: (persisted, current) => {
                const p = persisted as Record<string, unknown>;

                // ── Migrate v1 → v2: flat tabs → layouts[] ───────────────────────────
                if (Array.isArray(p.tabs) && !Array.isArray(p.layouts)) {
                    const tabs = ensureSlugs(p.tabs as Tab[]);
                    p.layouts = [
                        {
                            id: 'layout-default',
                            name: 'Standard',
                            slug: 'default',
                            tabs,
                            activeTabId: (p.activeTabId as string | undefined) ?? tabs[0]?.id ?? 'default',
                        },
                    ];
                    p.activeLayoutId = 'layout-default';
                    delete p.tabs;
                    delete p.activeTabId;
                }

                // Ensure tabs within all layouts have slugs
                if (Array.isArray(p.layouts)) {
                    p.layouts = (p.layouts as DashboardLayout[]).map((l) => ({
                        ...l,
                        tabs: ensureSlugs(l.tabs ?? []),
                    }));
                }

                // Migrate GROUP widgets: move options.children → groupDefsStore (defId ref)
                if (Array.isArray(p.layouts)) {
                    p.layouts = (p.layouts as DashboardLayout[]).map((l) => ({
                        ...l,
                        tabs: l.tabs.map((tab) => ({
                            ...tab,
                            widgets: tab.widgets.map(migrateGroupWidget),
                        })),
                    }));
                }

                return { ...current, ...p };
            },
        },
    ),
);

// ── Convenience selectors ─────────────────────────────────────────────────────

/** Returns the layout currently active in the admin editor */
export function useActiveLayout(): DashboardLayout {
    return useDashboardStore((s) => s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0]);
}

/** Returns a specific layout by slug (for the frontend readonly view) */
export function useLayoutBySlug(slug: string | undefined): DashboardLayout | undefined {
    return useDashboardStore((s) => (slug ? s.layouts.find((l) => l.slug === slug) : s.layouts[0]));
}
