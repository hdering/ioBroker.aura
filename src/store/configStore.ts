import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';

export interface FrontendSettings {
  customCSS: string;
  showHeader: boolean;
  headerTitle: string;
  showConnectionBadge: boolean;
  gridRowHeight: number;
  wizardMaxDatapoints: number;
  fontScale: number;
  mobileBreakpoint: number;
}

interface ConfigState {
  frontend: FrontendSettings;
  updateFrontend: (patch: Partial<FrontendSettings>) => void;
}

export const DEFAULT_FRONTEND: FrontendSettings = {
  customCSS: '',
  showHeader: true,
  headerTitle: 'Aura',
  showConnectionBadge: true,
  gridRowHeight: 80,
  wizardMaxDatapoints: 500,
  fontScale: 1,
  mobileBreakpoint: 600,
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      frontend: DEFAULT_FRONTEND,
      updateFrontend: (patch) =>
        set((s) => ({ frontend: { ...s.frontend, ...patch } })),
    }),
    { name: 'aura-config', storage: createJSONStorage(() => managedStorage) },
  ),
);
