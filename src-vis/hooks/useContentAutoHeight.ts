import { createContext, useCallback, useContext, useRef } from 'react';
import type { WidgetConfig } from '../types';
import { usePopupAutoHeight } from '../contexts/PopupAutoHeightContext';
import { useAutoHeightStore } from '../store/autoHeightStore';
import { usesContentAutoHeight } from '../utils/autoHeight';

/**
 * True where the surrounding container lays its widgets out on its own and ignores
 * a measured content height — group children (fill-scaled on the group's pitch) and
 * popup-view cells (sized by the popup's own auto-height). The option is then off.
 */
export const ContentAutoHeightBlockedContext = createContext(false);

/**
 * Shared "Höhe automatisch an Inhalt anpassen" wiring for content-driven widgets.
 * `fit`: render at natural height — no h-full/flex-1 fill, no inner scrollbar.
 * `measureRef`: attach to the widget's root; publishes its height to autoHeightStore,
 * which the Dashboard turns into the grid item's row count.
 */
export function useContentAutoHeight(config: WidgetConfig): {
    fit: boolean;
    measureRef: (el: HTMLElement | null) => void;
} {
    const popupAuto = usePopupAutoHeight();
    const blocked = useContext(ContentAutoHeightBlockedContext);
    const on = !blocked && usesContentAutoHeight(config);
    // Inside an auto-height popup the dialog measures the embedded copy itself, and
    // reporting there would resize the dashboard item too.
    const measureOn = on && !popupAuto;
    const widgetId = config.id;
    const roRef = useRef<ResizeObserver | null>(null);
    const measureRef = useCallback(
        (el: HTMLElement | null) => {
            if (roRef.current) {
                roRef.current.disconnect();
                roRef.current = null;
            }
            if (!el || !measureOn) {
                useAutoHeightStore.getState().clear(widgetId);
                return;
            }
            const report = () => useAutoHeightStore.getState().setHeight(widgetId, el.offsetHeight);
            report();
            const ro = new ResizeObserver(report);
            ro.observe(el);
            roRef.current = ro;
        },
        [measureOn, widgetId],
    );
    // No unmount effect on top of this: React calls the ref with null when the widget
    // goes away (disconnect + clear above), and a second clear from an effect cleanup
    // would wipe a height that the re-attached ref had just reported (StrictMode).
    return { fit: popupAuto || on, measureRef };
}
