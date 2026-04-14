import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import { slugify } from '../utils/slugify';
import type { WidgetConfig } from '../types';

export interface Tab {
  id: string;
  name: string;
  slug: string;
  widgets: WidgetConfig[];
  icon?: string;       // icon name from WIDGET_ICON_MAP
  hideLabel?: boolean; // show only icon, hide text
}

export interface DashboardLayout {
  id: string;
  name: string;
  slug: string;
  tabs: Tab[];
  activeTabId: string;
  defaultTabId?: string;   // tab shown when frontend opens without a tab slug
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
      let slug = base; let i = 2;
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
  let slug = base; let i = 2;
  while (seen.has(slug)) slug = `${base}-${i++}`;
  return slug;
}

function uniqueTabSlug(base: string, tabs: Tab[]): string {
  const seen = new Set(tabs.map((t) => t.slug));
  let slug = base; let i = 2;
  while (seen.has(slug)) slug = `${base}-${i++}`;
  return slug;
}

// ── state ─────────────────────────────────────────────────────────────────────

interface DashboardState {
  layouts: DashboardLayout[];
  activeLayoutId: string;
  editMode: boolean;

  // ── Layout CRUD ──────────────────────────────────────────────────────────
  addLayout: (name: string) => void;
  duplicateLayout: (id: string, newName: string) => void;
  removeLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  setLayoutSlug: (id: string, slug: string) => void;
  setActiveLayout: (id: string) => void;

  // ── Tab CRUD (on activeLayoutId) ─────────────────────────────────────────
  addTab: (name: string) => void;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  updateTab: (id: string, patch: Partial<Pick<Tab, 'name' | 'slug' | 'icon' | 'hideLabel'>>) => void;
  setTabSlug: (id: string, slug: string) => void;
  setActiveTab: (id: string) => void;
  setDefaultTab: (layoutId: string, tabId: string) => void;

  // ── Widget CRUD ──────────────────────────────────────────────────────────
  addWidget: (widget: WidgetConfig) => void;
  addWidgetToTab: (tabId: string, widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  removeWidgetInTab: (tabId: string, widgetId: string) => void;
  updateWidget: (id: string, config: Partial<WidgetConfig>) => void;
  updateWidgetInTab: (tabId: string, widgetId: string, config: Partial<WidgetConfig>) => void;
  updateLayouts: (widgets: WidgetConfig[]) => void;

  /** Cross-layout variants – operate on an explicit layoutId */
  addWidgetToLayoutTab: (layoutId: string, tabId: string, widget: WidgetConfig) => void;
  removeWidgetFromLayoutTab: (layoutId: string, tabId: string, widgetId: string) => void;

  setEditMode: (editMode: boolean) => void;
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

      duplicateLayout: (id, newName) => {
        const newId = `layout-${Date.now()}`;
        set((s) => {
          const src = s.layouts.find((l) => l.id === id);
          if (!src) return {};
          const dup: DashboardLayout = {
            ...JSON.parse(JSON.stringify(src)),  // deep clone
            id: newId,
            name: newName,
            slug: uniqueLayoutSlug(slugify(newName), s.layouts),
          };
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

      renameLayout: (id, name) =>
        set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, name })) })),

      setLayoutSlug: (id, slug) =>
        set((s) => ({ layouts: patchLayout(s.layouts, id, (l) => ({ ...l, slug })) })),

      setActiveLayout: (id) => set({ activeLayoutId: id }),

      // ── Tab CRUD ───────────────────────────────────────────────────────────

      addTab: (name) => {
        const id = `tab-${Date.now()}`;
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
            const slug = uniqueTabSlug(slugify(name), l.tabs);
            return { ...l, tabs: [...l.tabs, { id, name, slug, widgets: [] }], activeTabId: id };
          }) })
        );
      },

      removeTab: (id) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => {
            const tabs = l.tabs.filter((t) => t.id !== id);
            if (tabs.length === 0) tabs.push({ ...DEFAULT_TAB, id: `tab-${Date.now()}` });
            return { ...l, tabs, activeTabId: l.activeTabId === id ? tabs[0].id : l.activeTabId };
          }) })
        ),

      renameTab: (id, name) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
          })) })
        ),

      updateTab: (id, patch) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          })) })
        ),

      setTabSlug: (id, slug) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) => (t.id === id ? { ...t, slug } : t)),
          })) })
        ),

      setActiveTab: (id) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({ ...l, activeTabId: id })) })
        ),

      setDefaultTab: (layoutId, tabId) =>
        set((s) => ({ layouts: patchLayout(s.layouts, layoutId, (l) => ({ ...l, defaultTabId: tabId })) })),

      // ── Widget CRUD ────────────────────────────────────────────────────────

      addWidget: (widget) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === l.activeTabId ? { ...t, widgets: [...t.widgets, widget] } : t,
            ),
          })) })
        ),

      addWidgetToTab: (tabId, widget) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t,
            ),
          })) })
        ),

      removeWidget: (id) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === l.activeTabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== id) } : t,
            ),
          })) })
        ),

      removeWidgetInTab: (tabId, widgetId) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
            ),
          })) })
        ),

      addWidgetToLayoutTab: (layoutId, tabId, widget) =>
        set((s) => ({
          layouts: patchLayout(s.layouts, layoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === tabId ? { ...t, widgets: [...t.widgets, widget] } : t,
            ),
          })),
        })),

      removeWidgetFromLayoutTab: (layoutId, tabId, widgetId) =>
        set((s) => ({
          layouts: patchLayout(s.layouts, layoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === tabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
            ),
          })),
        })),

      updateWidget: (id, config) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === l.activeTabId
                ? { ...t, widgets: t.widgets.map((w) => (w.id === id ? { ...w, ...config } : w)) }
                : t,
            ),
          })) })
        ),

      updateWidgetInTab: (tabId, widgetId, config) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) =>
              t.id === tabId
                ? { ...t, widgets: t.widgets.map((w) => (w.id === widgetId ? { ...w, ...config } : w)) }
                : t,
            ),
          })) })
        ),

      updateLayouts: (widgets) =>
        set((s) =>
          ({ layouts: patchLayout(s.layouts, s.activeLayoutId, (l) => ({
            ...l, tabs: l.tabs.map((t) => (t.id === l.activeTabId ? { ...t, widgets } : t)),
          })) })
        ),

      setEditMode: (editMode) => set({ editMode }),
    }),
    {
      name: 'aura-dashboard',
      storage: createJSONStorage(() => managedStorage),
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;

        // ── Migrate v1 → v2: flat tabs → layouts[] ───────────────────────────
        if (Array.isArray(p.tabs) && !Array.isArray(p.layouts)) {
          const tabs = ensureSlugs(p.tabs as Tab[]);
          p.layouts = [{
            id: 'layout-default',
            name: 'Standard',
            slug: 'default',
            tabs,
            activeTabId: (p.activeTabId as string | undefined) ?? tabs[0]?.id ?? 'default',
          }];
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
  return useDashboardStore((s) =>
    slug ? s.layouts.find((l) => l.slug === slug) : s.layouts[0],
  );
}
