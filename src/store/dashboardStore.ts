import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import type { WidgetConfig } from '../types';

export interface Tab {
  id: string;
  name: string;
  widgets: WidgetConfig[];
}

interface DashboardState {
  tabs: Tab[];
  activeTabId: string;
  editMode: boolean;

  // Tab-Aktionen
  addTab: (name: string) => void;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setActiveTab: (id: string) => void;

  // Widget-Aktionen (immer auf aktivem Tab)
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, config: Partial<WidgetConfig>) => void;
  updateLayouts: (widgets: WidgetConfig[]) => void;

  setEditMode: (editMode: boolean) => void;
}

const DEFAULT_TAB: Tab = { id: 'default', name: 'Dashboard', widgets: [] };

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      tabs: [DEFAULT_TAB],
      activeTabId: 'default',
      editMode: false,

      addTab: (name) => {
        const id = `tab-${Date.now()}`;
        set((s) => ({ tabs: [...s.tabs, { id, name, widgets: [] }], activeTabId: id }));
      },

      removeTab: (id) => {
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          if (tabs.length === 0) tabs.push({ ...DEFAULT_TAB, id: `tab-${Date.now()}` });
          const activeTabId = s.activeTabId === id ? tabs[0].id : s.activeTabId;
          return { tabs, activeTabId };
        });
      },

      renameTab: (id, name) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)) })),

      setActiveTab: (id) => set({ activeTabId: id }),

      addWidget: (widget) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, widgets: [...t.widgets, widget] } : t,
          ),
        })),

      removeWidget: (id) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, widgets: t.widgets.filter((w) => w.id !== id) } : t,
          ),
        })),

      updateWidget: (id, config) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId
              ? { ...t, widgets: t.widgets.map((w) => (w.id === id ? { ...w, ...config } : w)) }
              : t,
          ),
        })),

      updateLayouts: (widgets) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, widgets } : t)),
        })),

      setEditMode: (editMode) => set({ editMode }),
    }),
    { name: 'aura-dashboard', storage: createJSONStorage(() => managedStorage) },
  ),
);
