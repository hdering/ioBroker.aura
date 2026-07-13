import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { isDirty, subscribeDirty, isScreenshotMode } from '../store/persistManager';
import { sendToDirect } from './useIoBroker';
import { NS } from '../utils/namespace';
import { baseDpId } from '../utils/dpRef';
import type { WidgetConfig } from '../types';

export interface BrokenRef {
    widgetId: string;
    widgetTitle: string;
    widgetType: string;
    location: string; // e.g. "Layout / Tab"
    field: string; // e.g. "datapoint" or "options.targetDp"
    dp: string;
    routeTo?: string; // optional deep link to the widget's edit UI
}

/** Collect all DP-bearing string fields in a widget config. Picks up the
 *  top-level `datapoint` plus any nested key ending in `Dp` or `Datapoint`
 *  inside options (handles TimerWidget events[].targetDp, light_*Dp, etc.). */
function collectRefs(widget: WidgetConfig, location: string, routeTo: string | undefined): BrokenRef[] {
    const refs: BrokenRef[] = [];
    const push = (field: string, dp: string) => {
        if (typeof dp !== 'string') return;
        const trimmed = dp.trim();
        if (!trimmed) return;
        // Popup widgets use handlebars-style placeholders like "{{dp}}" that are
        // resolved at render time — they are not real ioBroker IDs and would
        // always show up as "missing" if we checked them.
        if (trimmed.includes('{{') || trimmed.includes('}}')) return;
        refs.push({
            widgetId: widget.id,
            widgetTitle: widget.title || '(ohne Titel)',
            widgetType: widget.type,
            location,
            field,
            dp: trimmed,
            routeTo,
        });
    };

    if (typeof widget.datapoint === 'string' && widget.datapoint.trim()) {
        push('datapoint', widget.datapoint);
    }

    const walk = (obj: unknown, path: string): void => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach((item, i) => walk(item, `${path}[${i}]`));
            return;
        }
        for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
            const here = `${path}.${key}`;
            if (typeof val === 'string' && (key.endsWith('Dp') || key.endsWith('Datapoint'))) {
                push(here, val);
            } else if (val && typeof val === 'object') {
                walk(val, here);
            }
        }
    };
    walk(widget.options, 'options');

    return refs;
}

const isGroupHost = (w: WidgetConfig): boolean =>
    (w.type === 'group' || w.type === 'panels') && typeof w.options?.defId === 'string';

function collectAllRefs(): BrokenRef[] {
    const out: BrokenRef[] = [];
    const layouts = useDashboardStore.getState().layouts;
    const defs = useGroupDefsStore.getState().defs;
    const views = usePopupConfigStore.getState().views;

    // Build a defId -> host map so group children can deep-link into the editor.
    // A defId is hosted by a group/panels widget that lives either on a dashboard
    // tab or inside a popup view, possibly nested inside other group defs. The
    // editor can only focus a *top-level* widget, so we walk each host's def tree
    // and map every reachable defId (including nested ones) back to that same host.
    // Defs that never appear here are orphans (no widget references them anymore)
    // and are skipped below — listing their broken DPs would be noise the user
    // can neither locate nor fix.
    type ParentLoc = { parent: WidgetConfig; route: string; locationPrefix: string };
    const defIdToParent = new Map<string, ParentLoc>();
    // First-wins (Map.has guard) keeps the deep-link stable when a defId is
    // referenced from multiple hosts, and doubles as cycle protection while
    // recursing through nested group defs.
    const mapDefTree = (defId: string, loc: ParentLoc): void => {
        if (!defId || defIdToParent.has(defId)) return;
        defIdToParent.set(defId, loc);
        for (const child of defs[defId] ?? []) {
            if (isGroupHost(child)) mapDefTree(child.options!.defId as string, loc);
        }
    };

    for (const l of layouts) {
        const multiSection = l.sections.length > 1;
        for (const sec of l.sections) {
            const locationPrefix = multiSection ? `${l.name} / ${sec.name} / ` : `${l.name} / `;
            for (const tab of sec.tabs) {
                for (const w of tab.widgets) {
                    const route = `/admin/editor?layout=${encodeURIComponent(l.id)}&tab=${encodeURIComponent(tab.id)}&focus=${encodeURIComponent(w.id)}`;
                    if (isGroupHost(w)) {
                        mapDefTree(w.options!.defId as string, {
                            parent: w,
                            route,
                            locationPrefix: `${locationPrefix}${tab.name}`,
                        });
                    }
                    out.push(...collectRefs(w, `${locationPrefix}${tab.name}`, route));
                }
            }
        }
    }

    for (const v of views) {
        const locationPrefix = `Popup ${v.name || v.id}`;
        for (const w of v.widgets) {
            const route = `/admin/popups/${encodeURIComponent(v.id)}?focus=${encodeURIComponent(w.id)}`;
            if (isGroupHost(w)) mapDefTree(w.options!.defId as string, { parent: w, route, locationPrefix });
            out.push(...collectRefs(w, locationPrefix, route));
        }
    }

    for (const [defId, children] of Object.entries(defs)) {
        const parentLoc = defIdToParent.get(defId);
        if (!parentLoc) continue; // orphaned def — not reachable from any dashboard/popup
        const location = `${parentLoc.locationPrefix} · in ${parentLoc.parent.title || parentLoc.parent.type}`;
        for (const w of children) {
            out.push(...collectRefs(w, location, parentLoc.route));
        }
    }
    return out;
}

export interface BrokenDpRefsState {
    broken: BrokenRef[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useBrokenDpRefs(): BrokenDpRefsState {
    const [broken, setBroken] = useState<BrokenRef[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (isScreenshotMode()) {
            setBroken([]);
            return;
        }
        setLoading(true);
        try {
            const refs = collectAllRefs();
            // Existence is checked per bare state ID; the JSON-path suffix is a display detail.
            const unique = Array.from(new Set(refs.map((r) => baseDpId(r.dp))));
            if (unique.length === 0) {
                setBroken([]);
                return;
            }
            const r = await sendToDirect<{ ok: boolean; missing?: string[] }>(NS, 'checkDps', { ids: unique });
            const missing = new Set<string>(
                r && typeof r === 'object' && 'missing' in r && Array.isArray((r as { missing?: string[] }).missing)
                    ? (r as { missing: string[] }).missing
                    : [],
            );
            setBroken(refs.filter((ref) => missing.has(baseDpId(ref.dp))));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const wasDirtyRef = useRef(isDirty());
    useEffect(() => {
        return subscribeDirty(() => {
            const now = isDirty();
            if (wasDirtyRef.current && !now) void refresh();
            wasDirtyRef.current = now;
        });
    }, [refresh]);

    return { broken, loading, refresh };
}
