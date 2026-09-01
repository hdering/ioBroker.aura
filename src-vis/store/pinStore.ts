import { create } from 'zustand';
import type { PinRelock } from '../utils/pinLock';

/**
 * Which PIN-protected sections / tabs the viewer has opened.
 *
 * Deliberately NOT persisted: a reload re-locks everything. Entries with the
 * default relock mode (`leave`) additionally drop as soon as the viewer
 * navigates away — `retain()` is called by App with the keys of the view that is
 * currently on screen.
 */
interface PinState {
    unlocked: Record<string, PinRelock>;
    unlock: (key: string, relock: PinRelock) => void;
    lock: (key: string) => void;
    /** Drop every `leave` entry that is not among the keys of the current view. */
    retain: (activeKeys: string[]) => void;
    lockAll: () => void;
}

export const usePinStore = create<PinState>((set) => ({
    unlocked: {},
    unlock: (key, relock) => set((s) => ({ unlocked: { ...s.unlocked, [key]: relock } })),
    lock: (key) =>
        set((s) => {
            if (!(key in s.unlocked)) return s;
            const next = { ...s.unlocked };
            delete next[key];
            return { unlocked: next };
        }),
    retain: (activeKeys) =>
        set((s) => {
            const keep = new Set(activeKeys);
            const stale = Object.keys(s.unlocked).filter((k) => s.unlocked[k] === 'leave' && !keep.has(k));
            if (!stale.length) return s;
            const next = { ...s.unlocked };
            stale.forEach((k) => delete next[k]);
            return { unlocked: next };
        }),
    lockAll: () => set({ unlocked: {} }),
}));

/** Reader bound to a snapshot of the map — stable inside one render pass. */
export function unlockedReader(unlocked: Record<string, PinRelock>): (key: string) => boolean {
    return (key) => key in unlocked;
}
