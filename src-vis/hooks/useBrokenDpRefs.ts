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

function collectAllRefs(): BrokenRef[] {
    const out: BrokenRef[] = [];
    const layouts = useDashboardStore.getState().layouts;

    // Build a defId -> parent location map first so group children can deep-link
    // to whichever group widget on the dashboard hosts their def.
    type ParentLoc = { parent: WidgetConfig; layoutId: string; layoutName: string; tabId: string; tabName: string };
    const defIdToParent = new Map<string, ParentLoc>();
    for (const l of layouts) {
        for (const tab of l.tabs) {
            for (const w of tab.widgets) {
                if (w.type === 'group' && typeof w.options?.defId === 'string') {
                    // First-wins: a defId can in principle be referenced from multiple
                    // hosts, but in practice it points to one. Pick the first to keep
                    // the deep-link stable.
                    if (!defIdToParent.has(w.options.defId)) {
                        defIdToParent.set(w.options.defId, {
                            parent: w,
                            layoutId: l.id,
                            layoutName: l.name,
                            tabId: tab.id,
                            tabName: tab.name,
                        });
                    }
                }
                const route = `/admin/editor?layout=${encodeURIComponent(l.id)}&tab=${encodeURIComponent(tab.id)}&focus=${encodeURIComponent(w.id)}`;
                out.push(...collectRefs(w, `${l.name} / ${tab.name}`, route));
            }
        }
    }

    const defs = useGroupDefsStore.getState().defs;
    for (const [defId, children] of Object.entries(defs)) {
        const parentLoc = defIdToParent.get(defId);
        for (const w of children) {
            const location = parentLoc
                ? `${parentLoc.layoutName} / ${parentLoc.tabName} · in ${parentLoc.parent.title || parentLoc.parent.type}`
                : `Group ${defId.slice(0, 8)}`;
            const route = parentLoc
                ? `/admin/editor?layout=${encodeURIComponent(parentLoc.layoutId)}&tab=${encodeURIComponent(parentLoc.tabId)}&focus=${encodeURIComponent(parentLoc.parent.id)}`
                : undefined;
            out.push(...collectRefs(w, location, route));
        }
    }

    const views = usePopupConfigStore.getState().views;
    for (const v of views) {
        for (const w of v.widgets) {
            out.push(
                ...collectRefs(
                    w,
                    `Popup ${v.name || v.id}`,
                    `/admin/popups/${encodeURIComponent(v.id)}?focus=${encodeURIComponent(w.id)}`,
                ),
            );
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
