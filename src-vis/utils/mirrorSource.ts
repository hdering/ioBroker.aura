import type { WidgetConfig } from '../types';
import type { DashboardLayout } from '../store/dashboardStore';

/** A tab-level widget anywhere in the dashboard (every layout/section/tab) — where a mirror's source lives. */
export function findDashboardWidget(layouts: DashboardLayout[], id: string): WidgetConfig | undefined {
    for (const l of layouts)
        for (const sec of l.sections)
            for (const tb of sec.tabs) {
                const found = tb.widgets.find((w) => w.id === id);
                if (found) return found;
            }
    return undefined;
}

/** True for a "Spiegel" that shows a whole tab (`sourceKind: 'tab'`). */
export function isTabMirror(w: WidgetConfig | undefined): boolean {
    return w?.type === 'mirror' && w.options?.sourceKind === 'tab';
}

/**
 * Id of the widget a "Spiegel" shows — undefined for every other type and for a
 * tab mirror, which may still carry a `targetWidgetId` from before the switch.
 */
export function mirrorTargetWidgetId(w: WidgetConfig | undefined): string | undefined {
    if (w?.type !== 'mirror' || isTabMirror(w)) return undefined;
    return (w.options?.targetWidgetId as string | undefined) || undefined;
}
