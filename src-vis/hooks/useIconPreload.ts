/**
 * Frontend side of "icons for offline devices" (#290).
 *
 * Runs for the layout on screen. While its effective `iconsOffline` is on, the
 * layout's whole icon inventory is loaded shortly after the config settled and
 * again — only the new ids, Iconify skips what it has — whenever the config
 * changes. The per-device flag that switches the public Iconify hosts off on
 * the NEXT boot follows the same setting (see `iconifyLoader.ts`).
 */
import { useEffect } from 'react';
import type { DashboardLayout } from '../store/dashboardStore';
import { useConfigStore } from '../store/configStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { collectLayoutIconIds } from '../utils/iconInventory';
import { preloadIconIds } from '../utils/iconPreload';
import { writeIconsOfflineFlag } from '../utils/iconifyLoader';

/** Config edits arrive in bursts (a drag, a typed title) — coalesce them. */
const DEBOUNCE_MS = 800;

export function useIconPreload(layout: DashboardLayout | undefined, enabled: boolean, ready: boolean): void {
    const tabBar = useConfigStore((s) => s.frontend.tabBar);
    const layoutDrawerItems = useConfigStore((s) => s.frontend.layoutDrawerItems);
    const headerItems = useConfigStore((s) => s.frontend.headerItems);
    const popupViews = usePopupConfigStore((s) => s.views);
    const groupDefs = useGroupDefsStore((s) => s.defs);

    // The device flag must only ever reflect a resolved layout: before the
    // config has settled the effective value is the store default, and writing
    // that would silently drop a tablet out of offline mode on its next boot.
    useEffect(() => {
        if (!ready || !layout) return;
        writeIconsOfflineFlag(enabled);
    }, [ready, layout, enabled]);

    useEffect(() => {
        if (!ready || !enabled || !layout) return;
        const timer = setTimeout(() => {
            const ids = collectLayoutIconIds({
                layout,
                frontend: { tabBar, layoutDrawerItems, headerItems },
                popupViews,
                groupDefs,
            });
            if (ids.length) void preloadIconIds(ids);
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [ready, enabled, layout, tabBar, layoutDrawerItems, headerItems, popupViews, groupDefs]);
}
