import { useMemo } from 'react';
import type { WidgetConfig } from '../types';
import { useDashboardStore } from '../store/dashboardStore';
import { resolveMirrorChildren } from '../utils/groupTargets';

/** Group children as the group action sees them: widget mirrors replaced by their
 *  source (same lookup as MirrorWidget — every layout/section/tab), see #912. */
export function useGroupActionChildren(children: WidgetConfig[]): WidgetConfig[] {
    const layouts = useDashboardStore((s) => s.layouts);
    return useMemo(() => {
        if (!children.some((c) => c.type === 'mirror')) return children;
        const byId = new Map<string, WidgetConfig>();
        for (const l of layouts)
            for (const sec of l.sections) for (const t of sec.tabs) for (const w of t.widgets) byId.set(w.id, w);
        return resolveMirrorChildren(children, (id) => byId.get(id));
    }, [children, layouts]);
}
