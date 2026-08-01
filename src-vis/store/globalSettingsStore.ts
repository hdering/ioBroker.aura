import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import type { NumberFormat } from '../utils/formatValue';

export interface GlobalSettings {
    /** Comma-separated suffixes to strip from DP names, e.g. ".STATE,.LEVEL,:1,:2,:3" */
    dpNameSuffixes: string;
    /** Replace dots with spaces in DP names */
    dpNameReplaceDots: boolean;
    /** Default number of decimal places for numeric widget values (can be overridden per widget) */
    defaultDecimals: number;
    /** Default thousands separator preset for numeric values (can be overridden per widget) */
    numberFormat: NumberFormat;
    /** Show a small overlay badge with each device's own client ID (for identifying devices) */
    showClientIdBadge: boolean;
}

interface GlobalSettingsState extends GlobalSettings {
    setDpNameSuffixes: (v: string) => void;
    setDpNameReplaceDots: (v: boolean) => void;
    setDefaultDecimals: (v: number) => void;
    setNumberFormat: (v: NumberFormat) => void;
    setShowClientIdBadge: (v: boolean) => void;
}

export const useGlobalSettingsStore = create<GlobalSettingsState>()(
    persist(
        (set) => ({
            dpNameSuffixes: '',
            dpNameReplaceDots: false,
            defaultDecimals: 2,
            numberFormat: 'plain',
            showClientIdBadge: false,
            setDpNameSuffixes: (v) => set({ dpNameSuffixes: v }),
            setDpNameReplaceDots: (v) => set({ dpNameReplaceDots: v }),
            setDefaultDecimals: (v) => set({ defaultDecimals: v }),
            setNumberFormat: (v) => set({ numberFormat: v }),
            setShowClientIdBadge: (v) => set({ showClientIdBadge: v }),
        }),
        { name: 'aura-global-settings', storage: createJSONStorage(() => managedStorage) },
    ),
);
