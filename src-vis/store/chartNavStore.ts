import { create } from 'zustand';

/**
 * Linked chart paging (issue #871): charts sharing an `echartNavGroup` show the same range chip
 * and the same reference point. Lives only in this browser tab — deliberately not persisted, a
 * reload starts every chart on its own configured range again. Linking across devices goes
 * through the navigation datapoints instead.
 */
export interface ChartNavShared {
    /** Range token as in `rangeChips` (`24h`, `7d`, `3M`, `total`). */
    chip: string;
    /** Reference point (see utils/chartNav), null = rolling window up to now. */
    ref: number | null;
}

interface ChartNavState {
    groups: Record<string, ChartNavShared>;
    /** Per group the last command-datapoint update already carried out — a command reaching
     *  several linked charts must step the group once, not once per chart. */
    commands: Record<string, string>;
    publish: (group: string, next: ChartNavShared) => void;
    /** True for the first chart claiming `key` in `group`, false for every later one. */
    claimCommand: (group: string, key: string) => boolean;
}

export const useChartNavStore = create<ChartNavState>((set, get) => ({
    groups: {},
    commands: {},
    publish: (group, next) => {
        const cur = get().groups[group];
        if (cur && cur.chip === next.chip && cur.ref === next.ref) return;
        set((s) => ({ groups: { ...s.groups, [group]: next } }));
    },
    claimCommand: (group, key) => {
        if (get().commands[group] === key) return false;
        set((s) => ({ commands: { ...s.commands, [group]: key } }));
        return true;
    },
}));
