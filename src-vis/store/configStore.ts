import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';

export interface FrontendSettings {
  customCSS: string;
  showHeader: boolean;
  headerTitle: string;
  showConnectionBadge: boolean;
  // Header clock
  headerClockEnabled: boolean;
  headerClockDisplay: 'time' | 'date' | 'datetime';
  headerClockShowSeconds: boolean;
  headerClockDateLength: 'short' | 'long';
  headerClockCustomFormat: string;
  // Header datapoint
  headerDatapoint: string;
  gridRowHeight: number;
  wizardMaxDatapoints: number;
  fontScale: number;
  mobileBreakpoint: number;
  language: 'de' | 'en';
}

interface ConfigState {
  frontend: FrontendSettings;
  /** Per-type size overrides. If missing, the registry defaultW/H is used. */
  widgetDefaults: Record<string, { w: number; h: number }>;
  updateFrontend: (patch: Partial<FrontendSettings>) => void;
  setWidgetDefault: (type: string, w: number, h: number) => void;
  resetWidgetDefault: (type: string) => void;
}

export const DEFAULT_FRONTEND: FrontendSettings = {
  customCSS: '',
  showHeader: true,
  headerTitle: 'Aura',
  showConnectionBadge: true,
  headerClockEnabled: false,
  headerClockDisplay: 'time',
  headerClockShowSeconds: false,
  headerClockDateLength: 'short',
  headerClockCustomFormat: '',
  headerDatapoint: '',
  gridRowHeight: 80,
  wizardMaxDatapoints: 500,
  fontScale: 1,
  mobileBreakpoint: 600,
  language: 'de',
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      frontend: DEFAULT_FRONTEND,
      widgetDefaults: {},
      updateFrontend: (patch) =>
        set((s) => ({ frontend: { ...s.frontend, ...patch } })),
      setWidgetDefault: (type, w, h) =>
        set((s) => ({ widgetDefaults: { ...s.widgetDefaults, [type]: { w, h } } })),
      resetWidgetDefault: (type) =>
        set((s) => {
          const next = { ...s.widgetDefaults };
          delete next[type];
          return { widgetDefaults: next };
        }),
    }),
    { name: 'aura-config', storage: createJSONStorage(() => managedStorage) },
  ),
);
