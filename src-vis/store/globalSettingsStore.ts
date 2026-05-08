import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';

export interface GlobalSettings {
  /** Comma-separated suffixes to strip from DP names, e.g. ".STATE,.LEVEL,:1,:2,:3" */
  dpNameSuffixes: string;
  /** Replace dots with spaces in DP names */
  dpNameReplaceDots: boolean;
  /** Default number of decimal places for numeric widget values (can be overridden per widget) */
  defaultDecimals: number;
}

interface GlobalSettingsState extends GlobalSettings {
  setDpNameSuffixes: (v: string) => void;
  setDpNameReplaceDots: (v: boolean) => void;
  setDefaultDecimals: (v: number) => void;
}

export const useGlobalSettingsStore = create<GlobalSettingsState>()(
  persist(
    (set) => ({
      dpNameSuffixes: '',
      dpNameReplaceDots: false,
      defaultDecimals: 2,
      setDpNameSuffixes: (v) => set({ dpNameSuffixes: v }),
      setDpNameReplaceDots: (v) => set({ dpNameReplaceDots: v }),
      setDefaultDecimals: (v) => set({ defaultDecimals: v }),
    }),
    { name: 'aura-global-settings', storage: createJSONStorage(() => managedStorage) },
  ),
);
