import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { cardsSharingDef } from '../utils/deviceCard';

/**
 * How many device cards show the layout `defId` (#743) — the dashboard and popup
 * views, nested groups included. The dashboard selector returns a number, so a
 * widget edit elsewhere re-renders the card only when the count changes; with
 * `enabled` off (the live dashboard) nothing is subscribed at all.
 */
export function useDeviceCardShareCount(defId: string | undefined, enabled = true): number {
    const on = enabled && !!defId;
    const defs = useGroupDefsStore((s) => (on ? s.defs : null));
    const views = usePopupConfigStore((s) => (on ? s.views : null));
    return useDashboardStore((s) =>
        on && defs && views
            ? cardsSharingDef(
                  defId,
                  s.layouts,
                  views.map((v) => v.widgets),
                  defs,
              ).length
            : 0,
    );
}
