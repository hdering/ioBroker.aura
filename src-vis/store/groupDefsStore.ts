import { create } from 'zustand';
import { registerExternalReader, markDirty } from './persistManager';
import type { WidgetConfig } from '../types';

export interface GroupDefsState {
    defs: Record<string, WidgetConfig[]>;
    /** True once the store has been populated from ioBroker (or explicitly marked
     *  empty after a load attempt). Until then, serialise() refuses to emit a
     *  payload — otherwise a fresh-boot save would clobber ioBroker with a
     *  half-empty store and erase every group child. */
    hydrated: boolean;
    setDef: (defId: string, children: WidgetConfig[]) => void;
    removeDef: (defId: string) => void;
}

// aura-group-defs uses a plain store without Zustand persist middleware.
// The data can exceed localStorage quota, so it lives only in RAM and is
// synced exclusively via ioBroker (saveToIoBroker / hydrateGroupDefs).
// localStorage is never written; rehydrate() is replaced by hydrateGroupDefs().
export const useGroupDefsStore = create<GroupDefsState>()((set) => ({
    defs: {},
    hydrated: false,
    setDef: (defId, children) => set((s) => ({ defs: { ...s.defs, [defId]: children } })),
    removeDef: (defId) =>
        set((s) => {
            const next = { ...s.defs };
            delete next[defId];
            return { defs: next };
        }),
}));

// Serialise current state so saveToIoBroker can include it in the ioBroker payload.
// Mimics the Zustand persist format: { state: { defs: ... }, version: 0 }.
// Returns null before hydration so save skips this key — protects against the
// race where boot writes (e.g. a freshly mounted group widget seeding a defId)
// get persisted before ioBroker's real defs have been loaded.
function serialise(): string | null {
    const state = useGroupDefsStore.getState();
    if (!state.hydrated) {
        console.warn('[groupDefsStore] serialise skipped — store not yet hydrated from ioBroker');
        return null;
    }
    return JSON.stringify({ state: { defs: state.defs }, version: 0 });
}
registerExternalReader('aura-group-defs', serialise);

// Mark dirty whenever the store changes so the save button activates.
useGroupDefsStore.subscribe(() => markDirty('aura-group-defs'));

/** Force the hydrated flag — call after a loadConfigFromIoBroker pass even if
 *  the remote had no aura-group-defs (first-time user) so subsequent saves
 *  aren't blocked forever. */
export function markGroupDefsHydrated(): void {
    if (!useGroupDefsStore.getState().hydrated) {
        useGroupDefsStore.setState({ hydrated: true });
    }
}

/** Load group-defs from a raw JSON string (Zustand persist format or plain {defs:...}). */
export function hydrateGroupDefs(raw: string): void {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        // Support both Zustand persist format { state: { defs } } and plain { defs }
        const defsSource = (parsed.state as Record<string, unknown> | undefined) ?? parsed;
        const defs = defsSource.defs as Record<string, WidgetConfig[]> | undefined;
        if (defs && typeof defs === 'object') {
            useGroupDefsStore.setState({ defs, hydrated: true });
        } else {
            // Parsed but no defs key — treat as hydrated empty so saves aren't blocked.
            useGroupDefsStore.setState({ hydrated: true });
        }
    } catch {
        /* ignore malformed JSON — leave hydrated false so we don't save over good data */
    }
}

export function newGroupDefId(): string {
    return `gd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Deep-clone a group def entry (and nested group defs) into new def IDs. */
export function cloneGroupDef(sourceDefId: string): string {
    const children = useGroupDefsStore.getState().defs[sourceDefId] ?? [];
    const id = newGroupDefId();
    useGroupDefsStore.getState().setDef(id, cloneChildren(children));
    return id;
}

function cloneChildren(children: WidgetConfig[]): WidgetConfig[] {
    return children.map((child) => {
        if (child.type === 'group' && child.options?.defId) {
            return { ...child, options: { ...child.options, defId: cloneGroupDef(child.options.defId as string) } };
        }
        // Timer children: regenerate event ids and drop stateBaseId so the clone
        // doesn't share the events array / event ids with the original (mirrors
        // the top-level copyConfig handling in WidgetFrame).
        if (child.type === 'timer' && child.options) {
            const o = child.options as Record<string, unknown>;
            const rawEvents = (o.events as Array<Record<string, unknown>> | undefined) ?? [];
            const events = rawEvents.map((e) => ({
                ...e,
                id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            }));
            const nextOpts = { ...o, events } as Record<string, unknown>;
            delete nextOpts.stateBaseId;
            return { ...child, options: nextOpts };
        }
        return child;
    });
}

/** Collect all defIds reachable from a widget list (recursively follows nested groups). */
function collectDefIds(widgets: WidgetConfig[], defs: Record<string, WidgetConfig[]>, out: Set<string>): void {
    for (const w of widgets) {
        if (w.type === 'group' && w.options?.defId) {
            const defId = w.options.defId as string;
            if (!out.has(defId)) {
                out.add(defId);
                if (defs[defId]) collectDefIds(defs[defId], defs, out);
            }
        }
    }
}

/** Remove all group defs that are no longer referenced by any widget in the dashboard. */
export function gcGroupDefs(allWidgets: WidgetConfig[]): void {
    const { defs, removeDef } = useGroupDefsStore.getState();
    const referenced = new Set<string>();
    collectDefIds(allWidgets, defs, referenced);
    for (const defId of Object.keys(defs)) {
        if (!referenced.has(defId)) removeDef(defId);
    }
}
