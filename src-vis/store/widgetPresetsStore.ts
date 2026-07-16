import { create } from 'zustand';
import { registerExternalReader, markDirty } from './persistManager';
import type { WidgetPreset } from '../types';

export interface WidgetPresetsState {
    presets: WidgetPreset[];
    /** True once the store has been populated from ioBroker (or explicitly marked
     *  empty after a load attempt). Until then, serialise() refuses to emit a
     *  payload — otherwise a fresh-boot save would clobber ioBroker with an empty
     *  store and erase every saved preset. Mirrors groupDefsStore. */
    hydrated: boolean;
    addPreset: (preset: WidgetPreset) => void;
    updatePreset: (id: string, patch: Partial<Omit<WidgetPreset, 'id'>>) => void;
    removePreset: (id: string) => void;
}

// aura-widget-presets uses a plain store without Zustand persist middleware.
// Like aura-group-defs the data can grow past the localStorage quota (a preset
// embeds a whole widget + its group defs), so it lives only in RAM and is synced
// exclusively via ioBroker (saveToIoBroker / hydrateWidgetPresets).
export const useWidgetPresetsStore = create<WidgetPresetsState>()((set) => ({
    presets: [],
    hydrated: false,
    addPreset: (preset) => set((s) => ({ presets: [...s.presets, preset] })),
    updatePreset: (id, patch) =>
        set((s) => ({ presets: s.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
}));

// Serialise current state so saveToIoBroker can include it in the ioBroker payload.
// Mimics the Zustand persist format: { state: { presets: ... }, version: 0 }.
// Returns null before hydration so save skips this key — protects against the
// race where a boot-time write persists before ioBroker's real presets loaded.
function serialise(): string | null {
    const state = useWidgetPresetsStore.getState();
    if (!state.hydrated) {
        console.warn('[widgetPresetsStore] serialise skipped — store not yet hydrated from ioBroker');
        return null;
    }
    return JSON.stringify({ state: { presets: state.presets }, version: 0 });
}
registerExternalReader('aura-widget-presets', serialise);

// Mark dirty whenever the store changes so the save button activates.
useWidgetPresetsStore.subscribe(() => markDirty('aura-widget-presets'));

/** Force the hydrated flag — call after a loadConfigFromIoBroker pass even if the
 *  remote had no aura-widget-presets (first-time user) so subsequent saves aren't
 *  blocked forever. */
export function markWidgetPresetsHydrated(): void {
    if (!useWidgetPresetsStore.getState().hydrated) {
        useWidgetPresetsStore.setState({ hydrated: true });
    }
}

/** Load presets from a raw JSON string (Zustand persist format or plain {presets:...}). */
export function hydrateWidgetPresets(raw: string): void {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const source = (parsed.state as Record<string, unknown> | undefined) ?? parsed;
        const presets = source.presets as WidgetPreset[] | undefined;
        if (Array.isArray(presets)) {
            useWidgetPresetsStore.setState({ presets, hydrated: true });
        } else {
            // Parsed but no presets key — treat as hydrated empty so saves aren't blocked.
            useWidgetPresetsStore.setState({ hydrated: true });
        }
    } catch {
        /* ignore malformed JSON — leave hydrated false so we don't save over good data */
    }
}

export function newPresetId(): string {
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
