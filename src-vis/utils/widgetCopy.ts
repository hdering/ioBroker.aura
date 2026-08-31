// ─────────────────────────────────────────────────────────────────────────────
// Copying widgets: fresh ids, fresh group defs, fresh references
// ─────────────────────────────────────────────────────────────────────────────
// A widget id must be unique across the whole dashboard: click actions
// ("Popup-Widget" / "Widget anspringen") address a widget by id, and several
// runtime keys are derived from it (list count datapoint, timer state base,
// auto-height and panel registries). Every in-app copy therefore has to re-issue
// the ids of everything it duplicates — copying a tab used to keep them, which
// left twins the widget picker could not tell apart (#606).
//
// Copying happens in two passes, because references can only be rewritten once
// all new ids are known:
//   1. cloneWidget() per widget — fresh id, nested group/panels defs cloned,
//      timer events regenerated; every old → new id is recorded in the scope.
//   2. finishClone() + remapWidgetRefs() — rewrite widget references inside the
//      copied set so they point at the copies instead of the originals.
import { useGroupDefsStore, newGroupDefId } from '../store/groupDefsStore';
import type { WidgetConfig } from '../types';

let _counter = 0;

/**
 * Fresh, collision-proof widget id. Keeps the source id's prefix (`w-` on a tab,
 * `child-` in a group, `slide-` in panels, `pw-` in a popup view) so copies stay
 * recognisable. The counter makes two copies in the same millisecond distinct.
 */
export function freshWidgetId(sourceId?: string): string {
    const prefix = /^(pw|child|slide)-/.exec(sourceId ?? '')?.[1] ?? 'w';
    return `${prefix}-${Date.now()}-${(++_counter).toString(36)}`;
}

/**
 * Deep-rewrite every `widgetId` reference found in `value` that points at one of
 * the copied widgets. Click actions carry them (`popup-widget`, `link-widget`)
 * and they sit at many depths — widget options, list entries, carousel items —
 * so the walk is generic instead of enumerating the shapes. Unknown ids (a
 * reference to a widget outside the copied set) are left alone, and unchanged
 * branches keep their identity so React sees no needless new objects.
 */
export function remapWidgetRefs<T>(value: T, idMap: Map<string, string>): T {
    if (idMap.size === 0) return value;
    return walkRefs(value, idMap) as T;
}

function walkRefs(value: unknown, idMap: Map<string, string>): unknown {
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const mapped = walkRefs(item, idMap);
            if (mapped !== item) changed = true;
            return mapped;
        });
        return changed ? next : value;
    }
    if (value && typeof value === 'object') {
        const src = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        let changed = false;
        for (const [key, val] of Object.entries(src)) {
            if (key === 'widgetId' && typeof val === 'string' && idMap.has(val)) {
                next[key] = idMap.get(val)!;
                changed = true;
                continue;
            }
            const mapped = walkRefs(val, idMap);
            if (mapped !== val) changed = true;
            next[key] = mapped;
        }
        return changed ? next : value;
    }
    return value;
}

// ── Clone scope ───────────────────────────────────────────────────────────────

/** Bookkeeping for one copy operation (may span several tabs). */
export interface CloneScope {
    /** old widget id → id of its copy, including nested group children. */
    ids: Map<string, string>;
    /** Every group def the copy created, for the reference pass. */
    defIds: string[];
}

export function newCloneScope(): CloneScope {
    return { ids: new Map(), defIds: [] };
}

/** Deep-clone a group def entry (and nested group defs) into new def IDs. */
export function cloneGroupDef(sourceDefId: string, scope: CloneScope = newCloneScope()): string {
    const children = useGroupDefsStore.getState().defs[sourceDefId] ?? [];
    const id = newGroupDefId();
    scope.defIds.push(id);
    useGroupDefsStore.getState().setDef(
        id,
        children.map((child) => cloneWidget(child, scope)),
    );
    return id;
}

/**
 * Copy one widget so it is fully independent of its source: fresh id, fresh
 * group/panels def with cloned children, fresh timer event ids. References are
 * not rewritten here — that needs the ids of the whole copied set (finishClone).
 */
export function cloneWidget(widget: WidgetConfig, scope: CloneScope): WidgetConfig {
    const id = freshWidgetId(widget.id);
    scope.ids.set(widget.id, id);

    if ((widget.type === 'group' || widget.type === 'panels') && widget.options?.defId) {
        const defId = cloneGroupDef(widget.options.defId as string, scope);
        return { ...widget, id, options: { ...widget.options, defId } };
    }

    // TIMER widgets: regenerate the event ids and drop stateBaseId so the copy
    // neither shares the events array with the original nor writes its state
    // datapoints — TimerWidget re-seeds stateBaseId against the new widget id.
    if (widget.type === 'timer' && widget.options) {
        const o = widget.options as Record<string, unknown>;
        const rawEvents = (o.events as Array<Record<string, unknown>> | undefined) ?? [];
        const events = rawEvents.map((e) => ({
            ...e,
            id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }));
        const options = { ...o, events } as Record<string, unknown>;
        delete options.stateBaseId;
        return { ...widget, id, options };
    }

    return { ...widget, id };
}

/**
 * Close a copy operation: rewrite widget references inside every group def the
 * copy created and return the id map, so the caller can do the same for the
 * widgets it holds itself (`remapWidgetRefs(copies, finishClone(scope))`).
 */
export function finishClone(scope: CloneScope): Map<string, string> {
    if (scope.ids.size > 0) {
        for (const defId of scope.defIds) {
            const children = useGroupDefsStore.getState().defs[defId];
            if (!children) continue;
            const remapped = remapWidgetRefs(children, scope.ids);
            if (remapped !== children) useGroupDefsStore.getState().setDef(defId, remapped);
        }
    }
    return scope.ids;
}

/** Self-contained copy of a widget list (one tab, one group, one popup view). */
export function copyWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
    const scope = newCloneScope();
    const copies = widgets.map((w) => cloneWidget(w, scope));
    return remapWidgetRefs(copies, finishClone(scope));
}

/**
 * Self-contained copy of a single widget. `newId` overrides the generated id for
 * targets with their own id convention (a popup view uses `pw-`).
 */
export function copyWidget(widget: WidgetConfig, newId?: string): WidgetConfig {
    const scope = newCloneScope();
    const copy = cloneWidget(widget, scope);
    if (newId) {
        scope.ids.set(widget.id, newId);
        copy.id = newId;
    }
    return remapWidgetRefs(copy, finishClone(scope));
}

// ── Repair pass for dashboards copied before #606 ─────────────────────────────

/**
 * Returns a mapper that re-issues duplicate widget ids across every list it is
 * called with (tabs of a section, sections of a layout, …). The first widget
 * keeps its id — click actions pointing at it stay intact — and every later twin
 * gets a deterministic `-2`, `-3`, … suffix, so the repair produces the same ids
 * on every reload instead of churning until the dashboard is saved again.
 */
export function makeIdDeduper(): (widgets: WidgetConfig[]) => WidgetConfig[] {
    const seen = new Set<string>();
    return (widgets) => {
        let changed = false;
        const next = widgets.map((w) => {
            if (w.id && !seen.has(w.id)) {
                seen.add(w.id);
                return w;
            }
            const base = w.id || 'w';
            let n = 2;
            let id = `${base}-${n}`;
            while (seen.has(id)) id = `${base}-${++n}`;
            seen.add(id);
            changed = true;
            return { ...w, id };
        });
        return changed ? next : widgets;
    };
}
