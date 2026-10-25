import { createContext, useCallback, useContext } from 'react';
import type { ClickAction, WidgetConfig } from '../types';
import { useDashboardStore } from '../store/dashboardStore';
import { useNavigationStore } from '../store/navigationStore';

/**
 * Popups opened from inside a popup stack on top of each other (issue #829): a
 * room popup → a lamp in it → that lamp's dimmer popup. Each WidgetClickPopup
 * provides one layer to the widgets in its body.
 *
 * The stack is capped at MAX_POPUP_DEPTH. A popup asked for beyond that does not
 * add a layer but swaps the content of the topmost one (`replace`), so a view
 * that links to itself can be clicked through forever without piling dialogs up.
 */
export const MAX_POPUP_DEPTH = 3;

/** What a popup shows — the props WidgetClickPopup is opened with. */
export interface PopupContent {
    widget: WidgetConfig;
    action: ClickAction;
    allWidgets?: WidgetConfig[];
    titleOverride?: string;
}

export interface PopupLayer {
    /** 1 for a popup opened from the dashboard, +1 per popup stacked on it. */
    depth: number;
    /** Closes the whole stack — a navigation must not leave dialogs behind. */
    closeAll: () => void;
    /** Shows `content` in this layer instead of its current content. */
    replace: (content: PopupContent) => void;
    /** Restarts the auto-close timer of this layer and every layer below it — for
     *  activity the popup cannot see, such as a call running inside an iframe (#836). */
    keepAlive: () => void;
}

export const PopupLayerContext = createContext<PopupLayer | null>(null);

export function usePopupLayer(): PopupLayer | null {
    return useContext(PopupLayerContext);
}

/**
 * Runs a navigation click action (tab, widget, external link) and returns true,
 * or returns false for every other kind so the caller opens its popup instead.
 * Inside a popup the whole popup stack closes as well: the jump happens behind
 * the dialog, and visited tabs stay mounted, so the popup would otherwise stay
 * open over the new tab and the click look like it did nothing (#829).
 */
export function useRunNavigationAction(): (action: ClickAction) => boolean {
    const layer = usePopupLayer();
    return useCallback(
        (action: ClickAction) => {
            switch (action.kind) {
                case 'link-external':
                    if (action.newTab) window.open(action.url, '_blank', 'noopener');
                    else window.location.href = action.url;
                    break;
                case 'link-tab': {
                    const tab = useDashboardStore
                        .getState()
                        .layouts.find((l) => l.id === action.layoutId)
                        ?.sections.flatMap((s) => s.tabs)
                        .find((t) => t.id === action.tabId);
                    if (tab?.disabled) return true;
                    useNavigationStore
                        .getState()
                        .navigateTo(action.layoutId, action.tabId, undefined, action.sectionId);
                    break;
                }
                case 'link-widget':
                    useNavigationStore
                        .getState()
                        .navigateTo(action.layoutId, action.tabId, action.widgetId, action.sectionId);
                    break;
                default:
                    return false;
            }
            layer?.closeAll();
            return true;
        },
        [layer],
    );
}
