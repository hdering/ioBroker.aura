import { usePopupConfigStore, type PopupView } from '../store/popupConfigStore';
import type { ClickAction, WidgetConfig } from '../types';
import { userWidgets } from './builtinPopupUsage';

/** A widget that opens a popup view, with the datapoint the popup resolves against. */
export interface PopupPreviewTrigger {
    widget: WidgetConfig;
    dp: string;
}

/**
 * Every widget that opens `viewId` — by its own click action or, having none, by
 * its type's default view. The popup-view editor offers them as preview sources:
 * with a real datapoint behind `{{dp}}` a chart can show its actual history.
 * Widgets inside the view itself and triggers without a concrete datapoint are
 * skipped — they would only resolve to another placeholder.
 */
export function findPopupPreviewTriggers(view: PopupView): PopupPreviewTrigger[] {
    const { typeDefaults } = usePopupConfigStore.getState();
    const ownIds = new Set(view.widgets.map((w) => w.id));
    const seen = new Set<string>();
    const out: PopupPreviewTrigger[] = [];
    for (const w of userWidgets()) {
        if (ownIds.has(w.id)) continue;
        const action = w.options?.clickAction as ClickAction | undefined;
        let dp: string | undefined;
        if (action?.kind === 'popup-view' && action.viewId === view.id) dp = action.dp || w.datapoint;
        else if (action === undefined && typeDefaults[w.type] === view.id) dp = w.datapoint;
        if (!dp || dp.includes('{{')) continue;
        const key = `${w.id}|${dp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ widget: w, dp });
    }
    return out;
}
