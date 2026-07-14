import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage, flushKey, withSuppressedDirty } from './persistManager';
import { useGroupDefsStore, newGroupDefId, cloneGroupDef } from './groupDefsStore';
import { slugify } from '../utils/slugify';
import type { WidgetConfig, WidgetCondition, BadgeDef, BadgeAggregate } from '../types';
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

// Extra element rendered in the layout menu (LayoutDrawer). Same content shapes as
// TabBarItem, but positioned above (top) or below (bottom) the layout list instead
// of left/center/right.
export interface LayoutMenuItem {
    id: string;
    type: 'clock' | 'datapoint' | 'text';
    position: 'top' | 'bottom';
    /** Extra space in px above this element. */
    marginTop?: number;
    /** Extra space in px below this element. */
    marginBottom?: number;
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
    indicatorStyle?: 'text' | 'underline' | 'filled' | 'pills';
    fontSize?: number | 'sm' | 'md' | 'lg'; // px when number; legacy keyword sizes still resolved
    iconSize?: number; // tab icon size in px, default 14
    tabsAlignment?: 'left' | 'center' | 'right'; // navigation tabs position
    hideMobileScrollbar?: boolean; // hide the mobile scroll indicator ("Laufleiste") under the tabs
    showSingle?: boolean; // show the tab bar even when the section has only a single tab
    position?: 'top' | 'bottom'; // render the bar above the dashboard (default) or as a footer
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
    guidelinesShowResolution?: boolean;
    // Tab bar appearance & items
    tabBar?: TabBarSettings;

    // ── Layout-only overrides (global → layout; no section level) ────────────
    // These frame settings belong to a whole layout, not an individual section,
    // so useEffectiveSettings merges them from the layout level only.
    // Layout drawer / left-hand menu
    layoutDrawerEnabled?: boolean;
    layoutDrawerShowSingle?: boolean; // show the section menu even with a single section
    layoutDrawerSize?: 'sm' | 'md' | 'lg';
    layoutDrawerAutoHide?: boolean;
    layoutDrawerPlacement?: 'floating' | 'tabbar' | 'sidebar' | 'top' | 'bottom';
    layoutDrawerWidth?: number;
    layoutDrawerTopOffset?: number;
    layoutDrawerBottomOffset?: number;
    layoutDrawerShowTitle?: boolean;
    layoutDrawerTitle?: string;
    layoutDrawerTitleMarginTop?: number;
    layoutDrawerTitleMarginBottom?: number;
    layoutDrawerEntryStyle?: 'iconAndName' | 'iconOnly' | 'nameOnly' | 'bulletAndName';
    layoutDrawerEntryHeight?: number;
    layoutDrawerIndicatorStyle?: 'text' | 'underline' | 'filled' | 'pills';
    layoutDrawerFontSize?: number;
    layoutDrawerIconSize?: number;
    layoutDrawerItems?: LayoutMenuItem[];
    // Header
    showHeader?: boolean;
    headerTitle?: string;
    showConnectionBadge?: boolean;
    showAdminLink?: boolean;
    headerClockEnabled?: boolean;
    headerClockDisplay?: 'time' | 'date' | 'datetime';
    headerClockShowSeconds?: boolean;
    headerClockDateLength?: 'short' | 'long';
    headerClockCustomFormat?: string;
    headerDatapoint?: string;
    headerDatapointTemplate?: string;
    // Navigation (idle-return)
    idleReturnEnabled?: boolean;
    idleReturnDelay?: number;
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
    badges?: BadgeDef[]; // own overlay badges on the tab button
    badgeAggregate?: BadgeAggregate; // auto-count of widgets on this tab that show a badge
}

/**
 * A Section ("Bereich") is the middle navigation level between a layout and its
 * tabs. Sections of the active layout are listed in the left-hand drawer menu.
 * Field-compatible with the pre-v3 DashboardLayout so the migration is a rehang.
 */
export interface Section {
    id: string;
    name: string;
    slug: string;
    tabs: Tab[];
    activeTabId: string;
    defaultTabId?: string; // tab shown when the section opens without a tab slug
    icon?: string; // icon name (Iconify ID or lucide PascalCase) for the section menu
    hidden?: boolean; // removed from the section menu, but still reachable via its direct slug URL
    badges?: BadgeDef[]; // own overlay badges on the section menu entry
    badgeAggregate?: BadgeAggregate; // auto-count of widgets across the section's tabs that show a badge
    settings?: LayoutSettings; // per-section content overrides (undefined = inherit)
}

/**
 * A Layout is the top-level container, reachable by its own URL (`/view/<slug>`).
 * It is NOT device-bound; each end device simply opens the layout URL it needs,
 * so the section menus of different layouts never mix.
 */
export interface DashboardLayout {
    id: string;
    name: string;
    slug: string;
    sections: Section[];
    activeSectionId: string;
    defaultSectionId?: string; // section shown when the layout opens without a section slug
    icon?: string; // reserved for a future layout switcher
    hidden?: boolean; // reserved (layout-level hide)
    settings?: LayoutSettings; // layout-level overrides; layoutDrawerEnabled lives here
}

// ── helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_TAB: Tab = { id: 'default', name: 'Dashboard', slug: 'dashboard', widgets: [] };

function makeDefaultSection(): Section {
    return { id: 'section-default', name: 'Standard', slug: 'default', tabs: [DEFAULT_TAB], activeTabId: 'default' };
}

function makeDefaultLayout(): DashboardLayout {
    return {
        id: 'layout-default',
        name: 'Standard',
        slug: 'default',
        sections: [makeDefaultSection()],
        activeSectionId: 'section-default',
    };
}

/** Apply fn to the layout with the given id */
function patchLayout(
    layouts: DashboardLayout[],
    layoutId: string,
    fn: (l: DashboardLayout) => DashboardLayout,
): DashboardLayout[] {
    return layouts.map((l) => (l.id === layoutId ? fn(l) : l));
}

/** The currently-selected section of a layout (falls back to the first). */
function activeSectionOf(l: DashboardLayout | undefined): Section | undefined {
    if (!l) return undefined;
    return l.sections.find((sec) => sec.id === l.activeSectionId) ?? l.sections[0];
}

/** Apply fn to the section with the given id inside the given layout. */
function patchSection(
    layouts: DashboardLayout[],
    layoutId: string,
    sectionId: string,
    fn: (sec: Section) => Section,
): DashboardLayout[] {
    return patchLayout(layouts, layoutId, (l) => ({
        ...l,
        sections: l.sections.map((sec) => (sec.id === sectionId ? fn(sec) : sec)),
    }));
}

/** Apply fn to the active section of the active layout (used by tab/widget CRUD). */
function patchActiveSection(s: DashboardState, fn: (sec: Section) => Section): DashboardLayout[] {
    const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
    const sec = activeSectionOf(layout);
    if (!layout || !sec) return s.layouts;
    return patchSection(s.layouts, layout.id, sec.id, fn);
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

function uniqueSectionSlug(base: string, sections: Section[]): string {
    const seen = new Set(sections.map((sec) => sec.slug));
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
    setLayoutHidden: (id: string, hidden: boolean) => void;
    reorderLayouts: (fromIndex: number, toIndex: number) => void;
    setActiveLayout: (id: string) => void;

    // ── Section CRUD (on activeLayoutId) ─────────────────────────────────────
    addSection: (name: string) => void;
    addSectionFromImport: (sectionData: Omit<Section, 'id'>) => void;
    duplicateSection: (id: string, newName: string) => void;
    removeSection: (id: string) => void;
    renameSection: (id: string, name: string) => void;
    setSectionSlug: (id: string, slug: string) => void;
    setSectionIcon: (id: string, icon: string | undefined) => void;
    setSectionHidden: (id: string, hidden: boolean) => void;
    /** Patch arbitrary fields of a section on the active layout (e.g. badges). */
    updateSection: (id: string, patch: Partial<Section>) => void;
    reorderSections: (fromIndex: number, toIndex: number) => void;
    setActiveSection: (id: string) => void;
    setActiveLayoutAndSection: (layoutId: string, sectionId: string) => void;
    setDefaultSection: (layoutId: string, sectionId: string) => void;
    /** Update per-section content settings */
    updateSectionSettings: (layoutId: string, sectionId: string, patch: Partial<LayoutSettings>) => void;
    clearSectionSettings: (layoutId: string, sectionId: string, key: keyof LayoutSettings) => void;

    // ── Tab CRUD (on active section of activeLayoutId) ───────────────────────
    addTab: (name: string) => void;
    addTabFromImport: (tabData: Omit<Tab, 'id'>) => void;
    removeTab: (id: string) => void;
    renameTab: (id: string, name: string) => void;
    updateTab: (
        id: string,
        patch: Partial<
            Pick<
                Tab,
                | 'name'
                | 'slug'
                | 'icon'
                | 'hideLabel'
                | 'disabled'
                | 'hidden'
                | 'conditions'
                | 'badges'
                | 'badgeAggregate'
            >
        >,
    ) => void;
    setTabSlug: (id: string, slug: string) => void;
    setActiveTab: (id: string) => void;
    /** Navigate to a layout/section/tab. sectionId is auto-resolved from tabId when omitted. */
    setActiveLayoutAndTab: (layoutId: string, tabId: string, sectionId?: string) => void;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
    /** Default tab of a section within the active layout (opened when no tab slug is given). */
    setDefaultTab: (sectionId: string, tabId: string) => void;

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
                const now = Date.now();
                const id = `layout-${now}`;
                const sectionId = `section-${now}`;
                const tabId = `tab-${now}`;
                set((s) => ({
                    layouts: [
                        ...s.layouts,
                        {
                            id,
                            name,
                            slug: uniqueLayoutSlug(slugify(name), s.layouts),
                            sections: [
                                {
                                    id: sectionId,
                                    name: 'Standard',
                                    slug: 'default',
                                    tabs: [{ ...DEFAULT_TAB, id: tabId, slug: 'dashboard' }],
                                    activeTabId: tabId,
                                },
                            ],
                            activeSectionId: sectionId,
                        },
                    ],
                    activeLayoutId: id,
                }));
            },

            addLayoutFromImport: (layoutData) => {
                const id = `layout-${Date.now()}`;
                set((s) => {
                    // Accept both new (sections[]) and legacy (tabs[]) exported layouts.
                    const legacy = layoutData as unknown as { tabs?: Tab[]; activeTabId?: string };
                    const sections: Section[] = Array.isArray(layoutData.sections)
                        ? layoutData.sections.map((sec) => ({ ...sec, tabs: ensureSlugs(sec.tabs ?? []) }))
                        : [
                              {
                                  id: `section-${Date.now()}`,
                                  name: layoutData.name,
                                  slug: 'default',
                                  tabs: ensureSlugs(legacy.tabs ?? []),
                                  activeTabId: legacy.activeTabId ?? legacy.tabs?.[0]?.id ?? 'default',
                              },
                          ];
                    return {
                        layouts: [
                            ...s.layouts,
                            {
                                ...layoutData,
                                id,
                                slug: uniqueLayoutSlug(slugify(layoutData.slug || layoutData.name), s.layouts),
                                sections,
                                activeSectionId: sections[0]?.id ?? '',
                            },
                        ],
                        activeLayoutId: id,
                    };
                });
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
                    dup.sections = dup.sections.map((sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((tab) => ({
                            ...tab,
                            widgets: tab.widgets.map(cloneWidgetDef),
                        })),
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

            setLayoutHidden: (id, hidden) =>
                set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, hidden })) })),

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

            // ── Section CRUD (on activeLayoutId) ─────────────────────────────────────

            addSection: (name) => {
                const now = Date.now();
                const sectionId = `section-${now}`;
                const tabId = `tab-${now}`;
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        sections: [
                            ...l.sections,
                            {
                                id: sectionId,
                                name,
                                slug: uniqueSectionSlug(slugify(name), l.sections),
                                tabs: [{ ...DEFAULT_TAB, id: tabId, slug: 'dashboard' }],
                                activeTabId: tabId,
                            },
                        ],
                        activeSectionId: sectionId,
                    })),
                }));
            },

            addSectionFromImport: (sectionData) => {
                const id = `section-${Date.now()}`;
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                        ...l,
                        sections: [
                            ...l.sections,
                            {
                                ...sectionData,
                                id,
                                slug: uniqueSectionSlug(slugify(sectionData.slug || sectionData.name), l.sections),
                                tabs: ensureSlugs(sectionData.tabs),
                            },
                        ],
                        activeSectionId: id,
                    })),
                }));
            },

            duplicateSection: (id, newName) => {
                const newId = `section-${Date.now()}`;
                set((s) => {
                    const layout = s.layouts.find((l) => l.id === s.activeLayoutId);
                    const src = layout?.sections.find((sec) => sec.id === id);
                    if (!layout || !src) return {};
                    const dup: Section = JSON.parse(JSON.stringify(src));
                    dup.id = newId;
                    dup.name = newName;
                    dup.slug = uniqueSectionSlug(slugify(newName), layout.sections);
                    dup.tabs = dup.tabs.map((tab) => ({ ...tab, widgets: tab.widgets.map(cloneWidgetDef) }));
                    return {
                        layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
                            ...l,
                            sections: [...l.sections, dup],
                            activeSectionId: newId,
                        })),
                    };
                });
            },

            removeSection: (id) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        if (l.sections.length <= 1) return l;
                        const sections = l.sections.filter((sec) => sec.id !== id);
                        const activeSectionId = l.activeSectionId === id ? sections[0].id : l.activeSectionId;
                        return { ...l, sections, activeSectionId };
                    }),
                })),

            renameSection: (id, name) =>
                set((s) => ({ layouts: patchSection(s.layouts, s.activeLayoutId, id, (sec) => ({ ...sec, name })) })),

            setSectionSlug: (id, slug) =>
                set((s) => ({ layouts: patchSection(s.layouts, s.activeLayoutId, id, (sec) => ({ ...sec, slug })) })),

            setSectionIcon: (id, icon) =>
                set((s) => ({ layouts: patchSection(s.layouts, s.activeLayoutId, id, (sec) => ({ ...sec, icon })) })),

            updateSection: (id, patch) =>
                set((s) => ({
                    layouts: patchSection(s.layouts, s.activeLayoutId, id, (sec) => ({ ...sec, ...patch })),
                })),

            setSectionHidden: (id, hidden) =>
                set((s) => ({
                    layouts: patchSection(s.layouts, s.activeLayoutId, id, (sec) => ({ ...sec, hidden })),
                })),

            reorderSections: (fromIndex, toIndex) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
                        if (fromIndex === toIndex) return l;
                        if (fromIndex < 0 || fromIndex >= l.sections.length) return l;
                        if (toIndex < 0 || toIndex >= l.sections.length) return l;
                        const sections = [...l.sections];
                        const [moved] = sections.splice(fromIndex, 1);
                        sections.splice(toIndex, 0, moved);
                        return { ...l, sections };
                    }),
                })),

            setActiveSection: (id) => {
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => ({
                        layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({ ...l, activeSectionId: id })),
                    })),
                );
                flushKey('aura-dashboard');
            },

            setActiveLayoutAndSection: (layoutId, sectionId) => {
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => ({
                        activeLayoutId: layoutId,
                        layouts: patchLayout(s.layouts, layoutId, (l) => ({ ...l, activeSectionId: sectionId })),
                    })),
                );
                flushKey('aura-dashboard');
            },

            setDefaultSection: (layoutId, sectionId) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({ ...l, defaultSectionId: sectionId })),
                })),

            updateSectionSettings: (layoutId, sectionId, patch) =>
                set((s) => ({
                    layouts: patchSection(s.layouts, layoutId, sectionId, (sec) => ({
                        ...sec,
                        settings: { ...sec.settings, ...patch },
                    })),
                })),

            clearSectionSettings: (layoutId, sectionId, key) =>
                set((s) => ({
                    layouts: patchSection(s.layouts, layoutId, sectionId, (sec) => {
                        if (!sec.settings) return sec;
                        const next = { ...sec.settings };
                        delete next[key];
                        return { ...sec, settings: Object.keys(next).length > 0 ? next : undefined };
                    }),
                })),

            // ── Tab CRUD ───────────────────────────────────────────────────────────

            addTab: (name) => {
                const id = `tab-${Date.now()}`;
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => {
                        const slug = uniqueTabSlug(slugify(name), sec.tabs);
                        return { ...sec, tabs: [...sec.tabs, { id, name, slug, widgets: [] }], activeTabId: id };
                    }),
                }));
            },

            addTabFromImport: (tabData) => {
                const id = `tab-${Date.now()}`;
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => {
                        const slug = uniqueTabSlug(tabData.slug || slugify(tabData.name), sec.tabs);
                        return { ...sec, tabs: [...sec.tabs, { ...tabData, id, slug }], activeTabId: id };
                    }),
                }));
            },

            removeTab: (id) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => {
                        const tabs = sec.tabs.filter((t) => t.id !== id);
                        if (tabs.length === 0) tabs.push({ ...DEFAULT_TAB, id: `tab-${Date.now()}` });
                        return { ...sec, tabs, activeTabId: sec.activeTabId === id ? tabs[0].id : sec.activeTabId };
                    }),
                })),

            renameTab: (id, name) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
                    })),
                })),

            updateTab: (id, patch) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
                    })),
                })),

            setTabSlug: (id, slug) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) => (t.id === id ? { ...t, slug } : t)),
                    })),
                })),

            setActiveTab: (id) => {
                let changed = false;
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => {
                        const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
                        const sec = activeSectionOf(layout);
                        if (!sec || sec.activeTabId === id) return s;
                        changed = true;
                        return {
                            layouts: patchActiveSection(s, (x) => ({ ...x, activeTabId: id })),
                        };
                    }),
                );
                if (changed) flushKey('aura-dashboard');
            },

            setActiveLayoutAndTab: (layoutId, tabId, sectionId) => {
                // Pure navigation state — must not mark the store dirty (see persistManager).
                withSuppressedDirty(() =>
                    set((s) => {
                        const layout = s.layouts.find((l) => l.id === layoutId) ?? s.layouts[0];
                        if (!layout) return s;
                        // Resolve which section holds the tab when not explicitly given.
                        const secId =
                            sectionId ??
                            layout.sections.find((sec) => sec.tabs.some((t) => t.id === tabId))?.id ??
                            layout.activeSectionId ??
                            layout.sections[0]?.id;
                        return {
                            activeLayoutId: layout.id,
                            layouts: patchLayout(s.layouts, layout.id, (l) => ({
                                ...l,
                                activeSectionId: secId,
                                sections: l.sections.map((sec) =>
                                    sec.id === secId ? { ...sec, activeTabId: tabId } : sec,
                                ),
                            })),
                        };
                    }),
                );
                flushKey('aura-dashboard');
            },

            reorderTabs: (fromIndex, toIndex) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => {
                        const tabs = [...sec.tabs];
                        const [moved] = tabs.splice(fromIndex, 1);
                        tabs.splice(toIndex, 0, moved);
                        return { ...sec, tabs };
                    }),
                })),

            setDefaultTab: (sectionId, tabId) =>
                set((s) => ({
                    layouts: patchSection(s.layouts, s.activeLayoutId, sectionId, (sec) => ({
                        ...sec,
                        defaultTabId: tabId,
                    })),
                })),

            // ── Widget CRUD ────────────────────────────────────────────────────────

            addWidget: (widget) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) =>
                            t.id === sec.activeTabId ? { ...t, widgets: [...t.widgets, widget] } : t,
                        ),
                    })),
                })),

            addWidgetToTab: (tabId, widget) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) => (t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t)),
                    })),
                })),

            removeWidget: (id) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) =>
                            t.id === sec.activeTabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== id) } : t,
                        ),
                    })),
                })),

            removeWidgetInTab: (tabId, widgetId) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) =>
                            t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
                        ),
                    })),
                })),

            addWidgetToLayoutTab: (layoutId, tabId, widget) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({
                        ...l,
                        sections: l.sections.map((sec) => ({
                            ...sec,
                            tabs: sec.tabs.map((t) => (t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t)),
                        })),
                    })),
                })),

            removeWidgetFromLayoutTab: (layoutId, tabId, widgetId) =>
                set((s) => ({
                    layouts: patchLayout(s.layouts, layoutId, (l) => ({
                        ...l,
                        sections: l.sections.map((sec) => ({
                            ...sec,
                            tabs: sec.tabs.map((t) =>
                                t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
                            ),
                        })),
                    })),
                })),

            updateWidget: (id, config) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) =>
                            t.id === sec.activeTabId
                                ? { ...t, widgets: t.widgets.map((w) => (w.id === id ? { ...w, ...config } : w)) }
                                : t,
                        ),
                    })),
                })),

            updateWidgetInTab: (tabId, widgetId, config) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) =>
                            t.id === tabId
                                ? { ...t, widgets: t.widgets.map((w) => (w.id === widgetId ? { ...w, ...config } : w)) }
                                : t,
                        ),
                    })),
                })),

            updateLayouts: (widgets) =>
                set((s) => ({
                    layouts: patchActiveSection(s, (sec) => ({
                        ...sec,
                        tabs: sec.tabs.map((t) => (t.id === sec.activeTabId ? { ...t, widgets } : t)),
                    })),
                })),

            rescaleAllWidgetsX: (factor) =>
                set((s) => ({
                    layouts: s.layouts.map((l) => ({
                        ...l,
                        sections: l.sections.map((sec) => ({
                            ...sec,
                            tabs: sec.tabs.map((tab) => ({
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

                // ── Migrate v2 → v3: layouts[] (with tabs) → 1 layout with sections[] ─
                // Every existing layout becomes a Section ("Bereich") under a single
                // default layout, so the left menu keeps showing exactly the same
                // entries. A layout is field-compatible with a Section → simple rehang.
                if (
                    Array.isArray(p.layouts) &&
                    (p.layouts as Array<Record<string, unknown>>).some(
                        (l) => Array.isArray(l?.tabs) && !Array.isArray(l?.sections),
                    )
                ) {
                    const oldLayouts = p.layouts as Array<Record<string, unknown>>;
                    const sections: Section[] = oldLayouts.map((l) => ({
                        id: l.id as string,
                        name: l.name as string,
                        slug: l.slug as string,
                        tabs: ensureSlugs((l.tabs as Tab[]) ?? []),
                        activeTabId: (l.activeTabId as string) ?? (l.tabs as Tab[])?.[0]?.id ?? 'default',
                        defaultTabId: l.defaultTabId as string | undefined,
                        icon: l.icon as string | undefined,
                        hidden: l.hidden as boolean | undefined,
                        settings: l.settings as LayoutSettings | undefined,
                    }));
                    p.layouts = [
                        {
                            id: 'layout-default',
                            name: 'Standard',
                            slug: 'default',
                            sections,
                            activeSectionId:
                                (p.activeLayoutId as string | undefined) ?? sections[0]?.id ?? 'section-default',
                        },
                    ];
                    p.activeLayoutId = 'layout-default';
                }

                // Ensure sections/tabs have slugs, unique ids and a valid activeSectionId.
                // The v2→v3 rehang reused 'layout-default' for both the wrapping layout
                // AND its first section, so a section id could collide with a layout id.
                // Reassign any clashing section id (and fix the layout's active/default
                // pointers) so scope resolution can tell a layout from a section.
                if (Array.isArray(p.layouts)) {
                    const layoutIds = new Set((p.layouts as DashboardLayout[]).map((l) => l.id));
                    const usedSectionIds = new Set<string>();
                    p.layouts = (p.layouts as DashboardLayout[]).map((l) => {
                        let activeSectionId = l.activeSectionId;
                        let defaultSectionId = l.defaultSectionId;
                        const sections = (l.sections ?? []).map((sec, i) => {
                            let id = sec.id;
                            if (layoutIds.has(id) || usedSectionIds.has(id)) {
                                let fresh = `section-${l.id}-${i}`;
                                while (layoutIds.has(fresh) || usedSectionIds.has(fresh)) fresh = `${fresh}x`;
                                if (activeSectionId === sec.id) activeSectionId = fresh;
                                if (defaultSectionId === sec.id) defaultSectionId = fresh;
                                id = fresh;
                            }
                            usedSectionIds.add(id);
                            return { ...sec, id, tabs: ensureSlugs(sec.tabs ?? []) };
                        });
                        return {
                            ...l,
                            sections,
                            activeSectionId: activeSectionId ?? sections[0]?.id ?? '',
                            defaultSectionId,
                        };
                    });
                }

                // Migrate GROUP widgets: move options.children → groupDefsStore (defId ref)
                if (Array.isArray(p.layouts)) {
                    p.layouts = (p.layouts as DashboardLayout[]).map((l) => ({
                        ...l,
                        sections: l.sections.map((sec) => ({
                            ...sec,
                            tabs: sec.tabs.map((tab) => ({
                                ...tab,
                                widgets: tab.widgets.map(migrateGroupWidget),
                            })),
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

/** Returns the active section of the active layout (admin editor). */
export function useActiveSection(): Section {
    return useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        return activeSectionOf(l) ?? l.sections[0];
    });
}

/** Returns a specific layout by slug (for the frontend readonly view) */
export function useLayoutBySlug(slug: string | undefined): DashboardLayout | undefined {
    return useDashboardStore((s) => (slug ? s.layouts.find((l) => l.slug === slug) : s.layouts[0]));
}

export interface ResolvedView {
    layout: DashboardLayout;
    section: Section;
}

/**
 * Resolve a layout + section from URL slugs.
 *
 * Priority: a first segment that matches a real layout slug wins. Otherwise
 * (legacy `/view/<oldLayoutSlug>` links, where old layouts are now sections of
 * the migrated default layout) fall back to the first layout and treat the given
 * slug as the section slug.
 */
export function resolveView(
    layouts: DashboardLayout[],
    layoutSlug: string | undefined,
    sectionSlug: string | undefined,
): ResolvedView | undefined {
    if (layouts.length === 0) return undefined;
    let layout = layoutSlug ? layouts.find((l) => l.slug === layoutSlug) : undefined;
    let secSlug = sectionSlug;
    if (!layout) {
        layout = layouts[0];
        if (layoutSlug && !sectionSlug) secSlug = layoutSlug;
    }
    const section =
        (secSlug ? layout.sections.find((sec) => sec.slug === secSlug) : undefined) ??
        layout.sections.find((sec) => sec.id === layout!.defaultSectionId) ??
        layout.sections[0];
    return { layout, section };
}
