import { useMemo } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useConfigStore } from '../store/configStore';
import type { WidgetConfig } from '../types';

/**
 * The context variables a binding can read besides datapoints — aura's subset of
 * ioBroker.vis' "special bindings".
 *
 * `username`, `login` and `instance` have no counterpart here: the aura frontend has
 * no per-user session of its own, so offering them would mean inventing values. The
 * session-local `local_*` variables of vis are a store of their own and are not part
 * of this feature either.
 */
export interface TemplateSpecials extends Record<string, unknown> {
    /** UI language, `de` or `en`. */
    language: string;
    /** Name of the tab currently shown. */
    view: string;
    /** Id of the widget the binding sits in. */
    wid: string;
    /** Title of that widget, as configured (before any `[[dp]]` resolution). */
    wname: string;
}

export function useTemplateSpecials(config: WidgetConfig): TemplateSpecials {
    const language = useConfigStore((s) => s.frontend.language ?? 'de');
    const view = useDashboardStore((s) => {
        const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
        const section = layout?.sections.find((sec) => sec.id === layout.activeSectionId) ?? layout?.sections[0];
        return section?.tabs.find((t) => t.id === section.activeTabId)?.name ?? '';
    });

    const wid = config.id ?? '';
    const wname = config.title ?? '';
    return useMemo(() => ({ language, view, wid, wname }), [language, view, wid, wname]);
}
