import { useMemo } from 'react';
import type { WidgetConfig } from '../types';
import { useDashboardStore } from '../store/dashboardStore';
import { resolveMirrorChildren } from '../utils/groupTargets';

/** Group children as the group action sees them: widget mirrors replaced by their
 *  source (same lookup as MirrorWidget — every layout/section/tab), see #912.
 *
 *  Subscribes to the layouts only when a child IS a mirror. Every WidgetFrame calls
 *  this hook (hooks run unconditionally), and an unconditional `s.layouts` made every
 *  frame on the page re-render on every dashboard change - a grid drop re-rendered
 *  all widgets several times over. */
export function useGroupActionChildren(children: WidgetConfig[]): WidgetConfig[] {
    const hasMirror = children.some((c) => c.type === 'mirror');
    const layouts = useDashboardStore((s) => (hasMirror ? s.layouts : null));
    return useMemo(() => {
        if (!hasMirror || !layouts) return children;
        const byId = new Map<string, WidgetConfig>();
        for (const l of layouts)
            for (const sec of l.sections) for (const t of sec.tabs) for (const w of t.widgets) byId.set(w.id, w);
        return resolveMirrorChildren(children, (id) => byId.get(id));
    }, [children, layouts, hasMirror]);
}
