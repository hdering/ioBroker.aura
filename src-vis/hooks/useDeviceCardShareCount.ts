import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { cardsSharingDef, deviceCardExtraDpsRaw } from '../utils/deviceCard';

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

/**
 * The short names of further datapoints (#1007) that the cards sharing `defId` use,
 * in first-seen order — so a card linked to one that has `aussen` shows an empty
 * `aussen` field to fill in. Joined to one string inside the selector, so the
 * subscription only fires when the set of names changes.
 */
export function useDeviceCardSiblingExtraKeys(defId: string | undefined): string[] {
    const defs = useGroupDefsStore((s) => (defId ? s.defs : null));
    const views = usePopupConfigStore((s) => (defId ? s.views : null));
    const joined = useDashboardStore((s) => {
        if (!defId || !defs || !views) return '';
        const keys: string[] = [];
        const cards = cardsSharingDef(
            defId,
            s.layouts,
            views.map((v) => v.widgets),
            defs,
        );
        for (const card of cards)
            for (const { key } of deviceCardExtraDpsRaw(card)) {
                const k = key.trim();
                if (k && !keys.includes(k)) keys.push(k);
            }
        return keys.join('\n');
    });
    return joined ? joined.split('\n') : [];
}
